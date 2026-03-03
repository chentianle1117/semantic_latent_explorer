import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../store/appStore";
import type { ImageData } from "../../types";
import { getCategoryColor, CATEGORY_COLORS, CATEGORY_LABELS, getDisplayCategory } from "../../utils/generationCategories";
import type { DisplayCategory } from "../../utils/generationCategories";
import "./BottomDrawer.css";

// ─── Simple cubic bezier path string ──────────────────────────────────────────
function cubicBezierD(px: number, py: number, cx: number, cy: number): string {
  const tension = 0.55;
  const dx = (cx - px) * tension;
  return `M${px},${py} C${px + dx},${py} ${cx - dx},${cy} ${cx},${cy}`;
}

// ─── Tree layout computation ──────────────────────────────────────────────────
function computeTreeLayout(
  allImages: ImageData[],
  availH: number,
): {
  nodes: { id: number; x: number; y: number; img: ImageData }[];
  edges: { key: string; px: number; py: number; cx: number; cy: number; parentColor: string }[];
  totalW: number;
  thumbS: number;
} {
  // Exclude ghost nodes and satellite views — only side views represent designs in the tree
  const images = allImages.filter(img => !img.is_ghost && (!img.shoe_view || img.shoe_view === 'side'));
  if (images.length === 0) return { nodes: [], edges: [], totalW: 120, thumbS: 32 };

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

  // Thumbnail side length: fill row spacing minus a small gap (no label — tooltip only)
  const thumbS = Math.max(20, Math.min(40, Math.floor((availH - 8) / (maxColSize + 1) - 6)));
  const hs = thumbS / 2;
  const colSpacing = thumbS + 44;
  const padX = hs + 14;
  const totalW = padX + (maxDepth + 1) * colSpacing + hs + 16;

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

  // Edges: connect right-center of parent thumbnail → left-center of child thumbnail
  const imgMap = new Map(images.map(img => [img.id, img]));
  const edges: { key: string; px: number; py: number; cx: number; cy: number; parentColor: string }[] = [];
  images.forEach(img => {
    const cp = posMap.get(img.id);
    if (!cp) return;
    img.parents.forEach(pid => {
      if (!idSet.has(pid)) return;
      const pp = posMap.get(pid);
      if (!pp) return;
      const parent = imgMap.get(pid);
      edges.push({
        key: `${pid}→${img.id}`,
        px: pp.x + hs, py: pp.y,
        cx: cp.x - hs, cy: cp.y,
        parentColor: getCategoryColor(parent?.generation_method ?? 'batch', parent?.realm ?? 'shoe'),
      });
    });
  });

  return { nodes, edges, totalW, thumbS };
}


// ─── Genealogy SVG Tree ───────────────────────────────────────────────────────
const GenealogyTree: React.FC = () => {
  const allImages = useAppStore(s => s.images);
  const isolatedImageIds = useAppStore(s => s.isolatedImageIds);
  const selectedImageIds = useAppStore(s => s.selectedImageIds);
  const setSelectedImageIds = useAppStore(s => s.setSelectedImageIds);
  const imageRatings = useAppStore(s => s.imageRatings);
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

  // When isolation is active, only show isolated items in the tree
  const treeImages = useMemo(() => {
    if (isolatedImageIds === null) return allImages;
    const isoSet = new Set(isolatedImageIds);
    return allImages.filter(img => isoSet.has(img.id));
  }, [allImages, isolatedImageIds]);

  const selectedSet = useMemo(() => new Set(selectedImageIds), [selectedImageIds]);
  const { nodes, edges, totalW, thumbS } = useMemo(
    () => computeTreeLayout(treeImages, availH),
    [treeImages, availH],
  );

  // Collect unique display categories actually used for legend (realm-aware)
  const usedCategories = useMemo(() => {
    const seen = new Set<DisplayCategory>();
    nodes.forEach(n => seen.add(getDisplayCategory(n.img.generation_method, n.img.realm)));
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
              <filter id="dt-sel-glow" x="-80%" y="-80%" width="260%" height="260%">
                <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#00d2ff" floodOpacity="0.9" />
              </filter>
              {/* Shared rounded clip path — local coords work because each <image> is
                  inside a translated <g>, so userSpaceOnUse resolves to local space */}
              <clipPath id="clip-tree-thumb">
                <rect x={-thumbS / 2} y={-thumbS / 2} width={thumbS} height={thumbS} rx={3} />
              </clipPath>
            </defs>

            {/* Edges — thin cubic bezier lines in parent color, low opacity */}
            {edges.map(e => (
              <path
                key={e.key}
                d={cubicBezierD(e.px, e.py, e.cx, e.cy)}
                fill="none"
                stroke={e.parentColor}
                strokeWidth={1.2}
                strokeOpacity={0.32}
              />
            ))}

            {/* Thumbnail nodes */}
            {nodes.map(n => {
              const sel = selectedSet.has(n.id);
              const del = !n.img.visible;
              const isAgent = n.img.generation_method === 'agent';
              const rating = imageRatings[n.id] ?? 0;
              const isMoodBoard = n.img.realm === 'mood-board';
              const col = getCategoryColor(n.img.generation_method, n.img.realm);
              const selColor = isMoodBoard ? '#FF6B2B' : '#00d2ff';
              const hs = thumbS / 2;
              const label = n.img.prompt
                ? (n.img.prompt.length > 80 ? n.img.prompt.slice(0, 80) + '…' : n.img.prompt)
                : `Image ${n.id}`;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  onClick={() => setSelectedImageIds([n.id])}
                  style={{ cursor: 'pointer' }}
                >
                  <title>{label}{isMoodBoard ? ' [mood board]' : ''}{del ? ' (deleted)' : ''}</title>

                  {/* Hit area */}
                  <rect x={-hs - 4} y={-hs - 4} width={thumbS + 8} height={thumbS + 8} fill="transparent" />

                  {/* Faint category-colored background */}
                  <rect
                    x={-hs} y={-hs}
                    width={thumbS} height={thumbS}
                    rx={3}
                    fill={col}
                    fillOpacity={del ? 0.06 : 0.18}
                  />

                  {/* Shoe thumbnail */}
                  {n.img.base64_image && (
                    <image
                      href={`data:image/png;base64,${n.img.base64_image}`}
                      x={-hs} y={-hs}
                      width={thumbS} height={thumbS}
                      clipPath="url(#clip-tree-thumb)"
                      preserveAspectRatio="xMidYMid slice"
                      opacity={del ? 0.28 : 1}
                    />
                  )}

                  {/* Thin border — category color normally, selection color when selected */}
                  <rect
                    x={-hs} y={-hs}
                    width={thumbS} height={thumbS}
                    rx={3}
                    fill="none"
                    stroke={sel ? selColor : col}
                    strokeWidth={sel ? 1.8 : 1}
                    strokeOpacity={sel ? 1 : 0.55}
                    filter={sel ? 'url(#dt-sel-glow)' : undefined}
                  />

                  {/* Deleted X overlay */}
                  {del && (
                    <>
                      <line x1={-hs + 4} y1={-hs + 4} x2={hs - 4} y2={hs - 4} stroke="#e05050" strokeWidth={1.5} strokeOpacity={0.9} />
                      <line x1={hs - 4} y1={-hs + 4} x2={-hs + 4} y2={hs - 4} stroke="#e05050" strokeWidth={1.5} strokeOpacity={0.9} />
                    </>
                  )}

                  {/* Agent "A" badge — top-right */}
                  {isAgent && (
                    <g transform={`translate(${hs - 5},${-hs + 5})`}>
                      <circle r={4.5} fill="#6a5acd" opacity={0.92} />
                      <text textAnchor="middle" dominantBaseline="central" fontSize={5.5} fill="white" fontWeight="bold">A</text>
                    </g>
                  )}

                  {/* Star badge — top-left (only when rated) */}
                  {rating > 0 && (
                    <g transform={`translate(${-hs + 5},${-hs + 5})`}>
                      <circle r={4.5} fill="#c8a000" opacity={0.92} />
                      <text textAnchor="middle" dominantBaseline="central" fontSize={6} fill="white">★</text>
                    </g>
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
              <svg width={cat === 'mood_board' ? 14 : 8} height={cat === 'mood_board' ? 14 : 8} style={{ flexShrink: 0 }}>
                {cat === 'mood_board' ? (
                  <>
                    <circle cx={7} cy={7} r={6} fill="none" stroke="rgba(255, 107, 43, 0.4)" strokeWidth={1} strokeDasharray="2 1.5" />
                    <circle cx={7} cy={7} r={3.5} fill={CATEGORY_COLORS[cat]} />
                  </>
                ) : (
                  <circle cx={4} cy={4} r={4} fill={CATEGORY_COLORS[cat]} />
                )}
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
  const isolatedImageIds = useAppStore(s => s.isolatedImageIds);
  const images = allImages.filter(img => img.visible);
  // Visible image ID set — used to decide if a batch still has live images
  const visibleImageIds = useMemo(
    () => new Set(allImages.filter(img => img.visible).map(img => img.id)),
    [allImages],
  );
  // Deleted ID set — used for per-image dot indicators (separate from batch visibility)
  const deletedIds = useMemo(
    () => new Set(allImages.filter(img => !img.visible).map(img => img.id)),
    [allImages],
  );
  const allHistoryGroups = useAppStore(s => s.historyGroups);
  const setSelectedImageIds = useAppStore(s => s.setSelectedImageIds);

  // When isolation is active, filter history groups to only those with isolated items
  const historyGroups = useMemo(() => {
    // Hide batches where NO images are currently visible.
    // Using visibleImageIds (not deletedIds) catches both soft-deleted images AND
    // images that were purged server-side and never added to the frontend state.
    let groups = allHistoryGroups.filter(g =>
      g.image_ids.some(id => visibleImageIds.has(id))
    );
    if (isolatedImageIds !== null) {
      const isoSet = new Set(isolatedImageIds);
      groups = groups.filter(g => g.image_ids.some(id => isoSet.has(id)));
    }
    return groups;
  }, [allHistoryGroups, isolatedImageIds, visibleImageIds]);

  // Filtered image count for stats
  const displayedImageCount = isolatedImageIds !== null
    ? images.filter(img => isolatedImageIds.includes(img.id)).length
    : images.length;

  // Exclusive tab: in store so clear canvas can collapse it
  const activeTab = useAppStore((s) => s.drawerActiveTab);
  const setActiveTab = useAppStore((s) => s.setDrawerActiveTab);
  const isExpanded = activeTab !== null;

  // Sync global store so LayersSidebar + ProgressModal adjust their height
  useEffect(() => {
    setIsExpanded(isExpanded);
  }, [isExpanded, setIsExpanded]);

  const switchTab = (tab: 'history' | 'lineage') => {
    setActiveTab(activeTab === tab ? null : tab);
  };

  return (
    <div className={`bottom-drawer ${isExpanded ? 'expanded' : ''}`}>

      {/* ── Compact bar: always visible — click anywhere to expand/collapse ── */}
      <div
        className={`drawer-bar${isExpanded ? ' drawer-bar--expanded' : ''}`}
        data-tour="bottom-drawer-bar"
        onClick={() => { if (!isExpanded) setActiveTab('history'); }}
        style={{ cursor: isExpanded ? 'default' : 'pointer' }}
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
              {historyGroups.length} batches · {displayedImageCount} images{isolatedImageIds !== null ? ' (isolated)' : ''}
            </span>
          </>
        ) : (
          /* Collapsed: stats + batch chip thumbnails — clicking anywhere on bar expands */
          <>
            <span className="drawer-stats">
              {historyGroups.length} batches · {displayedImageCount} images{isolatedImageIds !== null ? ' (isolated)' : ''}
            </span>
            <div className="drawer-thumbs">
              {historyGroups.slice(-8).map(group => {
                const thumbnailImage =
                  group.thumbnail_id !== null
                    ? allImages.find(img => img.id === group.thumbnail_id)
                    : null;
                const thumbDeleted = thumbnailImage ? !visibleImageIds.has(thumbnailImage.id) : false;
                const deletedCount = group.image_ids.filter(id => !visibleImageIds.has(id)).length;
                // When isolated, only select images that are in the isolation set
                const isoSet = isolatedImageIds !== null ? new Set(isolatedImageIds) : null;
                const selectableIds = group.image_ids.filter(id =>
                  visibleImageIds.has(id) && (isoSet === null || isoSet.has(id))
                );
                return (
                  <div
                    key={group.id}
                    className="drawer-batch-chip"
                    onClick={e => {
                      e.stopPropagation();
                      setSelectedImageIds(selectableIds);
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
                    // Batch is shown here only if it passed the "has visible images" filter above.
                    // someDeleted = some (but not all) images are no longer visible.
                    const someDeleted = group.image_ids.some(id => !visibleImageIds.has(id));
                    // When isolated, only select images that are in the isolation set
                    const isoSet = isolatedImageIds !== null ? new Set(isolatedImageIds) : null;
                    const selectableIds = group.image_ids.filter(id =>
                      visibleImageIds.has(id) && (isoSet === null || isoSet.has(id))
                    );
                    return (
                      <div
                        key={group.id}
                        className="drawer-group"
                        onClick={() => setSelectedImageIds(selectableIds)}
                        title={group.prompt || ''}
                      >
                        {thumbnailImage && visibleImageIds.has(thumbnailImage.id) ? (
                          <img
                            className="group-thumb-bg"
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
                              {selectableIds.length}
                              {someDeleted
                                ? ` (−${group.image_ids.filter(id => !visibleImageIds.has(id)).length})`
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
                        {someDeleted && (
                          <span
                            className="group-deleted-dot"
                            title="Some images deleted"
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
