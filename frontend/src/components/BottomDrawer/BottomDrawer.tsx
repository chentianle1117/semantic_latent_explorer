import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../store/appStore";
import type { ImageData } from "../../types";
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

  // Assign depth: longest path from roots
  const depths = new Map<number, number>();
  images.forEach(img => {
    if (!img.parents.some(p => idSet.has(p))) depths.set(img.id, 0);
  });
  if (depths.size === 0) images.forEach(img => depths.set(img.id, 0));

  let changed = true;
  while (changed) {
    changed = false;
    images.forEach(img => {
      if (!depths.has(img.id)) return;
      const d = depths.get(img.id)!;
      img.children.forEach(cid => {
        if (!idSet.has(cid)) return;
        if ((depths.get(cid) ?? -1) < d + 1) {
          depths.set(cid, d + 1);
          changed = true;
        }
      });
    });
  }
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

  const edges: { key: string; px: number; py: number; cx: number; cy: number }[] = [];
  images.forEach(img => {
    const cp = posMap.get(img.id);
    if (!cp) return;
    img.parents.forEach(pid => {
      const pp = posMap.get(pid);
      if (!pp) return;
      edges.push({ key: `${pid}→${img.id}`, px: pp.x, py: pp.y, cx: cp.x, cy: cp.y });
    });
  });

  return { nodes, edges, totalW, dotR };
}

const METHOD_COLOR: Record<string, string> = {
  batch:           '#22c55e',   // user-generated — green
  reference:       '#22c55e',   // user-generated with refs — same green
  external:        '#f97316',   // loaded reference image — orange
  dataset:         '#fbbf24',   // loaded dataset shoe — amber (orange family, distinct)
  interpolation:   '#bc8cff',   // interpolated
  'auto-variation':'#f59e0b',   // auto-variation
  agent:           '#a855f7',   // agent-triggered — purple
};

const METHOD_LABELS: Record<string, string> = {
  batch:           'Generated',
  reference:       'Generated',
  external:        'Ref Image',
  dataset:         'Dataset Shoe',
  interpolation:   'Interpolated',
  'auto-variation':'Auto',
  agent:           'Agent',
};

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

  // Collect unique methods actually used for legend — deduplicate by display label
  const usedMethods = useMemo(() => {
    const seenLabels = new Set<string>();
    return nodes
      .map(n => n.img.generation_method)
      .filter(m => {
        if (!METHOD_COLOR[m]) return false;
        const label = METHOD_LABELS[m] || m;
        if (seenLabels.has(label)) return false;
        seenLabels.add(label);
        return true;
      });
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
              const col = METHOD_COLOR[n.img.generation_method] ?? '#58a6ff';
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
      {usedMethods.length > 0 && (
        <div className="drawer-tree-legend">
          {usedMethods.map(method => (
            <span key={method} className="tree-legend-item">
              <svg width={8} height={8} style={{ flexShrink: 0 }}>
                <circle cx={4} cy={4} r={4} fill={METHOD_COLOR[method]} />
              </svg>
              {METHOD_LABELS[method] || method}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main BottomDrawer ────────────────────────────────────────────────────────
export const BottomDrawer: React.FC = () => {
  const isExpanded = useAppStore(s => s.isDrawerExpanded);
  const setIsExpanded = useAppStore(s => s.setIsDrawerExpanded);
  const allImages = useAppStore(s => s.images);
  const images = allImages.filter(img => img.visible);
  const deletedIds = useMemo(
    () => new Set(allImages.filter(img => !img.visible).map(img => img.id)),
    [allImages],
  );
  const historyGroups = useAppStore(s => s.historyGroups);
  const setSelectedImageIds = useAppStore(s => s.setSelectedImageIds);

  const [expandedTab, setExpandedTab] = useState<'history' | 'tree'>('history');

  return (
    <div className={`bottom-drawer ${isExpanded ? 'expanded' : ''}`}>

      {/* ── Bar: compact section header when expanded, full chip bar when collapsed ── */}
      <div
        className={`drawer-bar${isExpanded ? ' drawer-bar--expanded' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <button
          className="drawer-toggle"
          onClick={e => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
        >
          {isExpanded ? '▼' : '▲'}
        </button>

        {isExpanded ? (
          /* Expanded: section-style tab toggle + stats on right */
          <>
            <div className="drawer-section-tabs" onClick={e => e.stopPropagation()}>
              <button
                className={`drawer-section-tab${expandedTab === 'history' ? ' active' : ''}`}
                onClick={e => { e.stopPropagation(); setExpandedTab('history'); }}
              >History</button>
              <span className="drawer-section-sep">·</span>
              <button
                className={`drawer-section-tab${expandedTab === 'tree' ? ' active' : ''}`}
                onClick={e => { e.stopPropagation(); setExpandedTab('tree'); }}
              >Lineage Tree</button>
            </div>
            <span className="drawer-stats drawer-stats--compact">
              {historyGroups.length} batches · {images.length} images
            </span>
          </>
        ) : (
          /* Collapsed: stats + batch chip thumbnails */
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
                        {thumbDeleted && <div className="drawer-thumb-cross" />}
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

      {/* ── Expanded area: tab content only (no separate tab bar) ── */}
      {isExpanded && (
        <div className="drawer-content" onClick={e => e.stopPropagation()}>
          {/* History tab */}
          {expandedTab === 'history' && (
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
                        <div
                          className={`group-deleted-overlay${allDeleted ? ' group-deleted-overlay--all' : ''}`}
                        />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Lineage Tree tab */}
          {expandedTab === 'tree' && (
            <div className="drawer-tree-panel">
              <GenealogyTree />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
