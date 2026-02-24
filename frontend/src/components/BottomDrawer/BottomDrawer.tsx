import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../store/appStore";
import type { ImageData } from "../../types";
import { getCategoryColor, CATEGORY_COLORS, CATEGORY_LABELS, getDisplayCategory } from "../../utils/generationCategories";
import type { DisplayCategory } from "../../utils/generationCategories";
import "./BottomDrawer.css";

// ─── Tapered Bézier helper ────────────────────────────────────────────────────
function taperedBezierD(
  px: number, py: number,
  cx: number, cy: number,
  wStart: number, wEnd: number,
  steps = 16,
): string {
  const cpx = (cx - px) * 0.55;
  const cx1 = px + cpx, cy1 = py;
  const cx2 = cx - cpx, cy2 = cy;
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const bx = mt*mt*mt*px + 3*mt*mt*t*cx1 + 3*mt*t*t*cx2 + t*t*t*cx;
    const by = mt*mt*mt*py + 3*mt*mt*t*cy1 + 3*mt*t*t*cy2 + t*t*t*cy;
    const dx = 3*mt*mt*(cx1-px) + 6*mt*t*(cx2-cx1) + 3*t*t*(cx-cx2);
    const dy = 3*mt*mt*(cy1-py) + 6*mt*t*(cy2-cy1) + 3*t*t*(cy-cy2);
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const hw = (wStart + (wEnd - wStart) * t) / 2;
    left.push(`${(bx + nx * hw).toFixed(2)},${(by + ny * hw).toFixed(2)}`);
    right.push(`${(bx - nx * hw).toFixed(2)},${(by - ny * hw).toFixed(2)}`);
  }
  return `M${left.join('L')}L${right.reverse().join('L')}Z`;
}

// ─── Tree layout computation ──────────────────────────────────────────────────
function computeTreeLayout(
  allImages: ImageData[],
  availH: number,
): {
  nodes: { id: number; x: number; y: number; img: ImageData }[];
  edges: { key: string; px: number; py: number; cx: number; cy: number }[];
  totalW: number;
  dotR: number;
} {
  const images = allImages.filter(img => !img.is_ghost);
  if (images.length === 0) return { nodes: [], edges: [], totalW: 120, dotR: 6 };

  const idSet = new Set(images.map(img => img.id));

  // Assign depth using parent-based propagation:
  // Children look at their parents' depth rather than parents pushing to children.
  // This works correctly even when img.children arrays are stale/empty, since
  // img.parents is always populated from the server response.
  const depths = new Map<number, number>();

  // Roots: images whose parents are all outside the loaded set (or have no parents)
  images.forEach(img => {
    if (!img.parents.some(p => idSet.has(p))) depths.set(img.id, 0);
  });
  if (depths.size === 0) images.forEach(img => depths.set(img.id, 0));

  let changed = true;
  while (changed) {
    changed = false;
    images.forEach(img => {
      // Find the maximum depth among this image's parents that are in the loaded set
      let maxParentDepth = -1;
      img.parents.forEach(pid => {
        if (!idSet.has(pid)) return;
        const pd = depths.get(pid) ?? -1;
        if (pd > maxParentDepth) maxParentDepth = pd;
      });
      if (maxParentDepth >= 0) {
        const newDepth = maxParentDepth + 1;
        if ((depths.get(img.id) ?? -1) < newDepth) {
          depths.set(img.id, newDepth);
          changed = true;
        }
      }
    });
  }
  // Fallback: anything still unassigned gets depth 0
  images.forEach(img => { if (!depths.has(img.id)) depths.set(img.id, 0); });

  // Group by depth, sort each column chronologically
  const byDepth = new Map<number, ImageData[]>();
  images.forEach(img => {
    const d = depths.get(img.id)!;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(img);
  });
  byDepth.forEach(col =>
    col.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  );

  const maxDepth = Math.max(...Array.from(depths.values()), 0);
  const maxColSize = Math.max(...Array.from(byDepth.values()).map(v => v.length), 1);

  // Fit dots into available height
  const dotR = Math.max(5, Math.min(14, (availH - 20) / ((maxColSize + 1) * 2.4)));
  const colSpacing = Math.max(dotR * 10 + 20, 60);
  const padX = dotR + 14;
  const totalW = padX + (maxDepth + 1) * colSpacing + dotR + 12;

  const posMap = new Map<number, { x: number; y: number }>();
  byDepth.forEach((col, d) => {
    const rowSpacing = (availH - 8) / (col.length + 1);
    col.forEach((img, i) => {
      posMap.set(img.id, { x: padX + d * colSpacing, y: 4 + rowSpacing * (i + 1) });
    });
  });

  const nodes = images.map(img => ({
    id: img.id,
    x: posMap.get(img.id)!.x,
    y: posMap.get(img.id)!.y,
    img,
  }));

  // Edges: draw from parent → child using the parents[] array (works even with stale children[])
  const edges: { key: string; px: number; py: number; cx: number; cy: number }[] = [];
  images.forEach(img => {
    const cp = posMap.get(img.id);
    if (!cp) return;
    img.parents.forEach(pid => {
      if (!idSet.has(pid)) return;
      const pp = posMap.get(pid);
      if (!pp) return;
      edges.push({ key: `${pid}→${img.id}`, px: pp.x, py: pp.y, cx: cp.x, cy: cp.y });
    });
  });

  return { nodes, edges, totalW, dotR };
}


// ─── Genealogy SVG Tree ───────────────────────────────────────────────────────
const GenealogyTree: React.FC = () => {
  const allImages = useAppStore(s => s.images);
  const selectedImageIds = useAppStore(s => s.selectedImageIds);
  const setSelectedImageIds = useAppStore(s => s.setSelectedImageIds);
  const containerRef = useRef<HTMLDivElement>(null);
  const [availH, setAvailH] = useState(220);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setAvailH(Math.max(60, el.getBoundingClientRect().height));
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const selectedSet = useMemo(() => new Set(selectedImageIds), [selectedImageIds]);
  const { nodes, edges, totalW, dotR } = useMemo(
    () => computeTreeLayout(allImages, availH),
    [allImages, availH],
  );

  // Collect unique display categories actually used for legend
  const usedCategories = useMemo(() => {
    const seen = new Set<DisplayCategory>();
    nodes.forEach(n => seen.add(getDisplayCategory(n.img.generation_method)));
    return Array.from(seen) as DisplayCategory[];
  }, [nodes]);

  return (
    <div className="drawer-tree-wrapper">
      <div ref={containerRef} className="drawer-tree-scroll">
        {nodes.length === 0 ? (
          <span className="drawer-tree-empty">No images yet</span>
        ) : (
          <svg height={availH} width={Math.max(totalW, 200)} style={{ display: 'block' }}>
            <defs>
              <filter id="dt-sel-glow" x="-60%" y="-60%" width="220%" height="220%">
                <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#00d2ff" floodOpacity="0.85" />
              </filter>
            </defs>

            {/* Edges — tapered ribbons, thick at parent, thin at child */}
            {edges.map(e => (
              <path
                key={e.key}
                d={taperedBezierD(e.px, e.py, e.cx, e.cy, dotR * 0.72, dotR * 0.26)}
                fill="rgba(50,70,88,1.0)"
                stroke="none"
              />
            ))}

            {/* Nodes — solid filled circles */}
            {nodes.map(n => {
              const sel = selectedSet.has(n.id);
              const del = !n.img.visible;
              const col = getCategoryColor(n.img.generation_method);
              const label = n.img.prompt
                ? (n.img.prompt.length > 80 ? n.img.prompt.slice(0, 80) + '…' : n.img.prompt)
                : `Image ${n.id}`;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x}, ${n.y})`}
                  onClick={() => setSelectedImageIds([n.id])}
                  style={{ cursor: 'pointer' }}
                >
                  <title>{label}{del ? ' (deleted)' : ''}</title>
                  {/* Hit area */}
                  <circle r={dotR + 6} fill="transparent" />
                  {/* Solid filled circle */}
                  <circle
                    r={sel ? dotR + 2 : dotR}
                    fill={del ? 'rgba(55,65,78,0.6)' : col}
                    fillOpacity={del ? 0.5 : 0.88}
                    stroke={sel ? '#00d2ff' : 'rgba(0,0,0,0.25)'}
                    strokeWidth={sel ? 2.5 : 1}
                    filter={sel ? 'url(#dt-sel-glow)' : undefined}
                  />
                  {del && (
                    <>
                      <line x1={-dotR * 0.6} y1={-dotR * 0.6} x2={dotR * 0.6} y2={dotR * 0.6} stroke="#e05050" strokeWidth={1.5} />
                      <line x1={dotR * 0.6} y1={-dotR * 0.6} x2={-dotR * 0.6} y2={dotR * 0.6} stroke="#e05050" strokeWidth={1.5} />
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* Legend */}
      {usedCategories.length > 0 && (
        <div className="drawer-tree-legend">
          {usedCategories.map(cat => (
            <span key={cat} className="tree-legend-item">
              <svg width={8} height={8} style={{ flexShrink: 0 }}>
                <circle cx={4} cy={4} r={4} fill={CATEGORY_COLORS[cat]} />
              </svg>
              {CATEGORY_LABELS[cat]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main BottomDrawer ────────────────────────────────────────────────────────
export const BottomDrawer: React.FC = () => {
  const setIsExpanded = useAppStore(s => s.setIsHistoryExpanded);
  const allImages = useAppStore(s => s.images);
  const images = allImages.filter(img => img.visible);
  const deletedIds = useMemo(
    () => new Set(allImages.filter(img => !img.visible).map(img => img.id)),
    [allImages],
  );
  const historyGroups = useAppStore(s => s.historyGroups);
  const setSelectedImageIds = useAppStore(s => s.setSelectedImageIds);

  // Exclusive tab: only one panel open at a time. null = drawer collapsed.
  const [activeTab, setActiveTab] = useState<'history' | 'lineage' | null>(null);
  const isExpanded = activeTab !== null;

  // Sync global store so LayersSidebar + ProgressModal adjust their height
  useEffect(() => {
    setIsExpanded(isExpanded);
  }, [isExpanded, setIsExpanded]);

  const switchTab = (tab: 'history' | 'lineage') => {
    setActiveTab(prev => prev === tab ? null : tab);
  };

  return (
    <div className={`bottom-drawer ${isExpanded ? 'expanded' : ''}`}>

      {/* ── Compact bar: always visible — click anywhere to expand/collapse ── */}
      <div
        className={`drawer-bar${isExpanded ? ' drawer-bar--expanded' : ''}`}
        data-tour="bottom-drawer-bar"
        onClick={() => { isExpanded ? setActiveTab(null) : setActiveTab('history'); }}
        style={{ cursor: 'pointer' }}
      >
        {/* Left: collapse toggle */}
        <button
          className="drawer-toggle"
          title={isExpanded ? "Collapse" : "Expand History"}
          onClick={e => {
            e.stopPropagation();
            if (isExpanded) setActiveTab(null);
            else setActiveTab('history');
          }}
        >
          {isExpanded ? '▼' : '▲'}
        </button>

        {isExpanded ? (
          /* Expanded bar: each tab button stops propagation so it switches tabs
             without collapsing; clicking empty bar space collapses via bar onClick */
          <>
            <div className="drawer-section-tabs" data-tour="drawer-tabs">
              <button
                className={`drawer-section-tab${activeTab === 'history' ? ' active' : ''}`}
                data-tour="tab-history"
                onClick={e => { e.stopPropagation(); switchTab('history'); }}
                title="History"
              >
                History
              </button>
              <button
                className={`drawer-section-tab${activeTab === 'lineage' ? ' active' : ''}`}
                data-tour="tab-lineage"
                onClick={e => { e.stopPropagation(); switchTab('lineage'); }}
                title="Lineage Tree"
              >
                Lineage Tree
              </button>
            </div>
            <span className="drawer-stats drawer-stats--compact" onClick={e => e.stopPropagation()}>
              {historyGroups.length} batches · {images.length} images
            </span>
          </>
        ) : (
          /* Collapsed: stats + batch chip thumbnails — clicking anywhere on bar expands */
          <>
            <span className="drawer-stats">
              {historyGroups.length} batches · {images.length} images
            </span>
            <div className="drawer-thumbs">
              {historyGroups.slice(-8).map(group => {
                const thumbnailImage =
                  group.thumbnail_id !== null
                    ? allImages.find(img => img.id === group.thumbnail_id)
                    : null;
                const thumbDeleted = thumbnailImage ? deletedIds.has(thumbnailImage.id) : false;
                const deletedCount = group.image_ids.filter(id => deletedIds.has(id)).length;
                return (
                  <div
                    key={group.id}
                    className="drawer-batch-chip"
                    onClick={e => {
                      e.stopPropagation();
                      setSelectedImageIds(group.image_ids.filter(id => !deletedIds.has(id)));
                    }}
                  >
                    {thumbnailImage && (
                      <div className="drawer-thumb-wrap">
                        <img
                          className={`drawer-thumb${thumbDeleted ? ' drawer-thumb--deleted' : ''}`}
                          src={`data:image/png;base64,${thumbnailImage.base64_image}`}
                          alt=""
                        />
                        {deletedCount > 0 && <span className="drawer-deleted-dot" />}
                      </div>
                    )}
                    <span className="batch-count-badge">
                      {group.image_ids.length}
                      {deletedCount > 0 ? ` (−${deletedCount})` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Single active panel: fills available space ── */}
      {isExpanded && (
        <div className="drawer-panels" data-tour="bottom-drawer-content" onClick={e => e.stopPropagation()}>

          {/* History section */}
          <div className={`drawer-panel${activeTab === 'history' ? ' open' : ''}`}>
            {activeTab === 'history' && (
              <div className="drawer-timeline">
                {historyGroups.length === 0 ? (
                  <span className="drawer-empty">No history yet</span>
                ) : (
                  historyGroups.map(group => {
                    const thumbnailImage =
                      group.thumbnail_id !== null
                        ? allImages.find(img => img.id === group.thumbnail_id)
                        : null;
                    const allDeleted = group.image_ids.every(id => deletedIds.has(id));
                    const someDeleted = !allDeleted && group.image_ids.some(id => deletedIds.has(id));
                    return (
                      <div
                        key={group.id}
                        className={`drawer-group${allDeleted ? ' highlighting' : ''}`}
                        onClick={() =>
                          setSelectedImageIds(group.image_ids.filter(id => !deletedIds.has(id)))
                        }
                        title={group.prompt || ''}
                      >
                        {thumbnailImage ? (
                          <img
                            className={`group-thumb-bg${allDeleted ? ' group-thumb-bg--deleted' : ''}`}
                            src={`data:image/png;base64,${thumbnailImage.base64_image}`}
                            alt=""
                          />
                        ) : (
                          <div className="group-thumb-placeholder" />
                        )}
                        <div className="group-overlay">
                          <div className="group-overlay-top">
                            <span className="group-type-badge">
                              {group.type?.toUpperCase() ?? 'BATCH'}
                            </span>
                            <span className="group-count">
                              {group.image_ids.length}
                              {someDeleted
                                ? ` (−${group.image_ids.filter(id => deletedIds.has(id)).length})`
                                : ''}
                            </span>
                          </div>
                          <div className="group-overlay-bottom">
                            {group.prompt && (
                              <span className="group-prompt">{group.prompt}</span>
                            )}
                            <span className="group-time">
                              {new Date(group.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>
                        {(allDeleted || someDeleted) && (
                          <span
                            className={`group-deleted-dot${allDeleted ? ' group-deleted-dot--all' : ''}`}
                            title={allDeleted ? 'All images deleted' : 'Some images deleted'}
                          />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Lineage Tree section */}
          <div className={`drawer-panel${activeTab === 'lineage' ? ' open' : ''}`}>
            {activeTab === 'lineage' && (
              <div className="drawer-tree-panel">
                <GenealogyTree />
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
};
