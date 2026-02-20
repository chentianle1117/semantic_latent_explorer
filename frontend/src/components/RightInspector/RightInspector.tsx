import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useAppStore } from "../../store/appStore";
import type { ImageData } from "../../types";
import "./RightInspector.css";

type LineSegment = { from: { x: number; y: number }; to: { x: number; y: number }; type: "ancestor" | "child" };
type LineageLevel = { level: number; nodes: ImageData[]; parentIds: Map<number, number[]> };

interface FullLineageViewProps {
  levels: LineageLevel[];
  inspectedImageId: number | null;
  selectedImageIds: number[];
  onNodeClick: (id: number) => void;
  onAddToSelection: (id: number) => void;
}

const FullLineageView: React.FC<FullLineageViewProps> = ({
  levels,
  inspectedImageId,
  selectedImageIds,
  onNodeClick,
  onAddToSelection,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [lineSegments, setLineSegments] = useState<LineSegment[]>([]);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el || levels.length === 0) {
      setLineSegments([]);
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      setLineSegments([]);
      return;
    }
    const toPct = (clientX: number, clientY: number) => ({
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    });
    const segments: LineSegment[] = [];
    for (let i = 0; i < levels.length - 1; i++) {
      const curr = levels[i];
      const next = levels[i + 1];
      const currWrappers = el.querySelectorAll(`[data-level="${curr.level}"] .full-lineage-thumb`);
      const nextWrappers = el.querySelectorAll(`[data-level="${next.level}"] .full-lineage-thumb`);
      curr.nodes.forEach((node, ni) => {
        const childIds = new Set(node.children || []);
        next.nodes.forEach((child, ci) => {
          if (childIds.has(child.id)) {
            const fromEl = currWrappers[ni] as HTMLElement | undefined;
            const toEl = nextWrappers[ci] as HTMLElement | undefined;
            if (fromEl && toEl) {
              const fr = fromEl.getBoundingClientRect();
              const tr = toEl.getBoundingClientRect();
              segments.push({
                from: toPct(fr.left + fr.width / 2, fr.bottom),
                to: toPct(tr.left + tr.width / 2, tr.top),
                type: curr.level < 0 ? "ancestor" : "child",
              });
            }
          }
        });
      });
    }
    setLineSegments(segments);
  }, [levels]);

  return (
    <div className="full-lineage-container">
      <div className="full-lineage-content" ref={contentRef}>
        {lineSegments.length > 0 && (
          <div className="river-lines-overlay full-lineage-lines" aria-hidden>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="river-lines-svg">
              <defs>
                <linearGradient id="river-line-ancestor-full" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="rgba(0, 229, 255, 0.35)" />
                  <stop offset="100%" stopColor="rgba(0, 229, 255, 0)" />
                </linearGradient>
                <linearGradient id="river-line-child-full" x1="0%" y1="100%" x2="0%" y2="0%">
                  <stop offset="0%" stopColor="rgba(255, 170, 0, 0.35)" />
                  <stop offset="100%" stopColor="rgba(255, 170, 0, 0)" />
                </linearGradient>
              </defs>
              {lineSegments.map((seg, i) => (
                <line
                  key={i}
                  x1={seg.from.x}
                  y1={seg.from.y}
                  x2={seg.to.x}
                  y2={seg.to.y}
                  stroke={seg.type === "ancestor" ? "url(#river-line-ancestor-full)" : "url(#river-line-child-full)"}
                  strokeWidth={0.35}
                  strokeDasharray="2 1.5"
                  strokeLinecap="butt"
                />
              ))}
            </svg>
          </div>
        )}
        {levels.map((lv) => (
          <div
            key={lv.level}
            className="full-lineage-row"
            data-level={lv.level}
          >
            {lv.nodes.map((node) => {
              const isHero = node.id === inspectedImageId;
              const isInSelection = selectedImageIds.includes(node.id);
              return (
                <div key={node.id} className="full-lineage-node-wrapper">
                  <div
                    className={`full-lineage-thumb ${isHero ? "hero" : ""} ${isInSelection ? "in-selection" : ""}`}
                    onClick={() => onNodeClick(node.id)}
                    title={`#${node.id} ${node.generation_method}`}
                  >
                    <img src={`data:image/png;base64,${node.base64_image}`} alt={`#${node.id}`} />
                  </div>
                  {!isInSelection && (
                    <button
                      className="river-add-btn full-lineage-add"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddToSelection(node.id);
                      }}
                      title="Add to selection"
                    >
                      +
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

// #region agent log
const DEBUG_LOG = (data: Record<string, unknown>) => {
  fetch("http://127.0.0.1:7242/ingest/448d361a-26b6-4fac-b400-a422df87618f", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ location: "RightInspector.tsx", message: "river-lines", data: { ...data }, timestamp: Date.now() }),
  }).catch(() => {});
};
// #endregion

interface RightInspectorProps {
  showLabels: boolean;
  showGrid: boolean;
  showClusters: boolean;
  backgroundColor: string;
  onToggleLabels: () => void;
  onToggleGrid: () => void;
  onToggleClusters: () => void;
  onBackgroundColorChange: (color: string) => void;
  onGenerateFromReference?: () => void;
  onRemoveSelected?: () => void;
}

export const RightInspector: React.FC<RightInspectorProps> = ({
  onGenerateFromReference,
  onRemoveSelected,
}) => {
  const isCollapsed = useAppStore((s) => s.isInspectorCollapsed);
  const setIsCollapsed = useAppStore((s) => s.setIsInspectorCollapsed);
  const selectedImageIds = useAppStore((s) => s.selectedImageIds);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const toggleImageSelection = useAppStore((s) => s.toggleImageSelection);
  const setFlyToImageId = useAppStore((s) => s.setFlyToImageId);
  const images = useAppStore((s) => s.images);
  const layers = useAppStore((s) => s.layers);
  const imageLayerMap = useAppStore((s) => s.imageLayerMap);
  const setImageLayer = useAppStore((s) => s.setImageLayer);
  const setImagesLayer = useAppStore((s) => s.setImagesLayer);
  const isolatedImageIds = useAppStore((s) => s.isolatedImageIds);
  const setIsolatedImageIds = useAppStore((s) => s.setIsolatedImageIds);
  const imageRatings = useAppStore((s) => s.imageRatings);
  const setImageRating = useAppStore((s) => s.setImageRating);

  // Split-state: inspectedImageId can diverge from selectedImageIds
  const [inspectedImageId, setInspectedImageId] = useState<number | null>(null);
  const [heroHoverAdd, setHeroHoverAdd] = useState(false);
  const [isFullLineageView, setIsFullLineageView] = useState(false);

  useEffect(() => {
    if (selectedImageIds.length > 0 && isCollapsed) {
      setIsCollapsed(false);
    }
  }, [selectedImageIds.length, isCollapsed, setIsCollapsed]);

  useEffect(() => {
    if (selectedImageIds.length > 0) {
      // Always navigate to the LAST shoe added to selection
      const lastSelected = selectedImageIds[selectedImageIds.length - 1];
      if (!inspectedImageId || !selectedImageIds.includes(inspectedImageId)) {
        setInspectedImageId(lastSelected);
      } else {
        // If a new shoe was just added, switch to it
        setInspectedImageId(lastSelected);
      }
    } else {
      setInspectedImageId(null);
    }
  }, [selectedImageIds]);

  const imageMap = useMemo(() => {
    const m = new Map<number, ImageData>();
    images.forEach((img) => m.set(img.id, img));
    return m;
  }, [images]);

  const inspectedImage = inspectedImageId != null ? imageMap.get(inspectedImageId) : null;
  const selectedImages = images.filter((img) => selectedImageIds.includes(img.id));

  const ancestors = useMemo(() => {
    if (!inspectedImage) return [];
    return (inspectedImage.parents || [])
      .map((id) => imageMap.get(id))
      .filter(Boolean) as ImageData[];
  }, [inspectedImage, imageMap]);

  const children = useMemo(() => {
    if (!inspectedImage) return [];
    return (inspectedImage.children || [])
      .map((id) => imageMap.get(id))
      .filter(Boolean) as ImageData[];
  }, [inspectedImage, imageMap]);

  const fullLineageLevels = useMemo((): LineageLevel[] => {
    if (selectedImageIds.length === 0 || !imageMap.size) return [];
    const allIds = new Set<number>();

    for (const sid of selectedImageIds) {
      allIds.add(sid);
      let frontier: number[] = [sid];
      const seen = new Set<number>([sid]);
      while (frontier.length > 0) {
        const next: number[] = [];
        for (const id of frontier) {
          const node = imageMap.get(id);
          if (!node) continue;
          for (const pid of node.parents || []) {
            if (!seen.has(pid)) {
              seen.add(pid);
              allIds.add(pid);
              next.push(pid);
            }
          }
        }
        frontier = next;
      }
    }

    for (const sid of selectedImageIds) {
      const node = imageMap.get(sid);
      if (!node) continue;
      let frontier: number[] = (node.children || []).slice();
      const seen = new Set<number>([sid]);
      while (frontier.length > 0) {
        const next: number[] = [];
        for (const id of frontier) {
          if (!seen.has(id)) {
            seen.add(id);
            allIds.add(id);
          }
          const n = imageMap.get(id);
          if (!n) continue;
          for (const cid of n.children || []) {
            if (!seen.has(cid)) {
              seen.add(cid);
              allIds.add(cid);
              next.push(cid);
            }
          }
        }
        frontier = next;
      }
    }

    const roots = Array.from(allIds).filter((id) => {
      const node = imageMap.get(id);
      if (!node?.parents?.length) return true;
      return node.parents.every((p) => !allIds.has(p));
    });

    const levelMap = new Map<number, number>();
    roots.forEach((r) => levelMap.set(r, 0));

    let changed = true;
    while (changed) {
      changed = false;
      for (const id of allIds) {
        if (levelMap.has(id)) continue;
        const node = imageMap.get(id);
        if (!node?.parents?.length) {
          levelMap.set(id, 0);
          changed = true;
          continue;
        }
        const parentsInSet = node.parents.filter((p) => allIds.has(p));
        const parentLevels = parentsInSet.map((p) => levelMap.get(p)).filter((l): l is number => l !== undefined);
        if (parentLevels.length === parentsInSet.length) {
          levelMap.set(id, parentLevels.length > 0 ? 1 + Math.max(...parentLevels) : 0);
          changed = true;
        }
      }
    }

    const byLevel = new Map<number, ImageData[]>();
    for (const id of allIds) {
      const node = imageMap.get(id);
      if (!node) continue;
      const lvl = levelMap.get(id) ?? 0;
      const arr = byLevel.get(lvl) || [];
      arr.push(node);
      byLevel.set(lvl, arr);
    }

    const sortedLevels = Array.from(byLevel.keys()).sort((a, b) => a - b);
    return sortedLevels.map((lvl) => ({
      level: lvl,
      nodes: byLevel.get(lvl) || [],
      parentIds: new Map(),
    }));
  }, [selectedImageIds, imageMap]);

  const riverRef = useRef<HTMLDivElement>(null);
  const [lineSegments, setLineSegments] = useState<LineSegment[]>([]);

  useLayoutEffect(() => {
    if (isFullLineageView) return;
    const el = riverRef.current;
    if (!el || (ancestors.length === 0 && children.length === 0)) {
      setLineSegments([]);
      return;
    }

    // Use requestAnimationFrame to ensure DOM has painted
    const raf = requestAnimationFrame(() => {
      const riverRect = el.getBoundingClientRect();
      if (riverRect.width === 0 || riverRect.height === 0) {
        setLineSegments([]);
        return;
      }
      const toPct = (clientX: number, clientY: number) => ({
        x: ((clientX - riverRect.left) / riverRect.width) * 100,
        y: ((clientY - riverRect.top) / riverRect.height) * 100,
      });
      const heroEl = el.querySelector(".hero-image-wrapper") as HTMLElement | null;
      const heroRect = heroEl?.getBoundingClientRect();
      // Lines from ancestors connect to hero TOP edge; lines from children connect to hero BOTTOM edge
      const heroTopCenter = heroRect
        ? toPct(heroRect.left + heroRect.width / 2, heroRect.top)
        : null;
      const heroBottomCenter = heroRect
        ? toPct(heroRect.left + heroRect.width / 2, heroRect.bottom)
        : null;

      const segments: LineSegment[] = [];
      if (heroTopCenter && heroBottomCenter) {
        const ancestorWrappers = el.querySelectorAll(".river-ancestors .river-node-wrapper");
        ancestorWrappers.forEach((w) => {
          const r = (w as HTMLElement).getBoundingClientRect();
          const from = toPct(r.left + r.width / 2, r.bottom);
          segments.push({ from, to: heroTopCenter, type: "ancestor" });
        });
        const childWrappers = el.querySelectorAll(".river-children .river-node-wrapper");
        childWrappers.forEach((w) => {
          const r = (w as HTMLElement).getBoundingClientRect();
          const from = toPct(r.left + r.width / 2, r.top);
          segments.push({ from, to: heroBottomCenter, type: "child" });
        });
      }
      setLineSegments(segments);
      if (segments.length > 0) {
        DEBUG_LOG({ runId: "post-fix", lineSegmentsCount: segments.length, hasHero: !!heroTopCenter });
      }
    });

    return () => cancelAnimationFrame(raf);
  }, [isFullLineageView, ancestors.length, children.length, inspectedImageId]);

  // #region agent log
  useEffect(() => {
    const el = riverRef.current;
    if (!el || (ancestors.length === 0 && children.length === 0)) return;
    const raf = requestAnimationFrame(() => {
      const ancestorRow = el.querySelector(".river-ancestors") as HTMLElement | null;
      const childrenRow = el.querySelector(".river-children") as HTMLElement | null;
      const heroCard = el.querySelector(".hero-card") as HTMLElement | null;
      const wrapper = el.querySelector(".river-node-wrapper") as HTMLElement | null;
      const cs = (e: HTMLElement | null) => e ? window.getComputedStyle(e) : null;
      const r = (e: HTMLElement | null) => e ? e.getBoundingClientRect() : null;
      DEBUG_LOG({
        runId: "post-fix",
        hypothesisId: "H1-H5",
        ancestorsCount: ancestors.length,
        childrenCount: children.length,
        riverOverflow: cs(el)?.overflow ?? "N/A",
        riverOverflowY: cs(el)?.overflowY ?? "N/A",
        ancestorRowOverflowY: ancestorRow ? cs(ancestorRow)?.overflowY : "no-el",
        ancestorRowOverflowX: ancestorRow ? cs(ancestorRow)?.overflowX : "no-el",
        ancestorRowHeight: r(ancestorRow)?.height ?? "N/A",
        childrenRowOverflowY: childrenRow ? cs(childrenRow)?.overflowY : "no-el",
        childrenRowOverflowX: childrenRow ? cs(childrenRow)?.overflowX : "no-el",
        childrenRowHeight: r(childrenRow)?.height ?? "N/A",
        heroCardZIndex: heroCard ? cs(heroCard)?.zIndex : "no-el",
        heroCardPosition: heroCard ? cs(heroCard)?.position : "no-el",
        wrapperHeight: r(wrapper)?.height ?? "N/A",
        wrapperWidth: r(wrapper)?.width ?? "N/A",
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [ancestors.length, children.length]);
  // #endregion

  if (isCollapsed) {
    return (
      <div className="right-inspector collapsed">
        <button
          className="inspector-expand-tab"
          onClick={() => setIsCollapsed(false)}
          title="Open Inspector"
        >
          &#9664;
        </button>
      </div>
    );
  }

  const handleNodeClick = (id: number) => {
    setInspectedImageId(id);
    setFlyToImageId(id);
  };

  const handleAddToSelection = (id: number) => {
    if (!selectedImageIds.includes(id)) {
      toggleImageSelection(id, false);
    }
  };

  const handleHeroAddClick = () => {
    if (inspectedImageId != null && !selectedImageIds.includes(inspectedImageId)) {
      toggleImageSelection(inspectedImageId, false);
    }
  };

  const isHeroSelected = inspectedImageId != null && selectedImageIds.includes(inspectedImageId);

  return (
    <div className="ethereal-inspector">
      <div className="inspector-header">
        <span className="inspector-title">INSPECTOR</span>
        <button
          className="inspector-collapse-btn"
          onClick={() => setIsCollapsed(true)}
          title="Collapse"
        >
          &#9654;
        </button>
      </div>

      {selectedImageIds.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">✦</div>
          <p>Select a shoe to inspect its lineage</p>
        </div>
      )}

      {selectedImageIds.length > 0 && inspectedImage && (
        <>
          {/* The Deck - 12vh Selection Master */}
          <div className="selection-deck">
            <div className="deck-scroll">
              {selectedImages.map((img) => (
                <div
                  key={img.id}
                  className={`deck-avatar ${inspectedImageId === img.id ? "active" : ""}`}
                  onClick={() => handleNodeClick(img.id)}
                  title={`#${img.id}`}
                >
                  <img src={`data:image/png;base64,${img.base64_image}`} alt={`#${img.id}`} />
                </div>
              ))}
            </div>
          </div>

          {/* River header: Full Lineage toggle */}
          <div className="river-header-bar">
            <button
              className="river-mode-btn"
              onClick={() => setIsFullLineageView(!isFullLineageView)}
              title={isFullLineageView ? "Return to hero view" : "Show full lineage tree"}
            >
              {isFullLineageView ? "← Return" : "🌳 Full lineage"}
            </button>
          </div>

          {/* Genealogy River - Fixed Grid Layout or Full Lineage */}
          <div
            className={`genealogy-river ${isFullLineageView ? "full-lineage-mode" : ""}`}
            ref={riverRef}
          >
            {isFullLineageView ? (
              <FullLineageView
                levels={fullLineageLevels}
                inspectedImageId={inspectedImageId}
                selectedImageIds={selectedImageIds}
                onNodeClick={handleNodeClick}
                onAddToSelection={handleAddToSelection}
              />
            ) : (
              <>
            {/* Lines overlay: SVG so lines are never clipped by overflow */}
            {lineSegments.length > 0 && (
              <div className="river-lines-overlay" aria-hidden>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="river-lines-svg">
                  <defs>
                    <linearGradient id="river-line-ancestor" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="rgba(0, 229, 255, 0.35)" />
                      <stop offset="100%" stopColor="rgba(0, 229, 255, 0)" />
                    </linearGradient>
                    <linearGradient id="river-line-child" x1="0%" y1="100%" x2="0%" y2="0%">
                      <stop offset="0%" stopColor="rgba(255, 170, 0, 0.35)" />
                      <stop offset="100%" stopColor="rgba(255, 170, 0, 0)" />
                    </linearGradient>
                  </defs>
                  {lineSegments.map((seg, i) => {
                    // Cubic bezier with vertical tangents at both ends — proper genealogy S-curve.
                    // Leaves the ancestor/child going straight toward hero, arrives straight at hero.
                    // Sign of halfDy handles both upward (ancestor→hero) and downward (child→hero) directions.
                    const halfDy = (seg.to.y - seg.from.y) * 0.5;
                    const pathD = `M ${seg.from.x} ${seg.from.y} C ${seg.from.x} ${seg.from.y + halfDy} ${seg.to.x} ${seg.to.y - halfDy} ${seg.to.x} ${seg.to.y}`;

                    return (
                      <path
                        key={`${seg.type}-${i}`}
                        d={pathD}
                        stroke={seg.type === "ancestor" ? "url(#river-line-ancestor)" : "url(#river-line-child)"}
                        strokeWidth={0.6}
                        strokeDasharray="2 1.5"
                        strokeLinecap="butt"
                        fill="none"
                      />
                    );
                  })}
                </svg>
              </div>
            )}
            {/* Ancestors - Single row at top */}
            {ancestors.length > 0 && (
              <div className={`river-ancestors ${ancestors.length > 3 ? 'many-items' : ''} ${ancestors.length > 5 ? 'very-many-items' : ''}`}>
                {ancestors.map((a) => {
                  const isInSelection = selectedImageIds.includes(a.id);
                  return (
                    <div
                      key={a.id}
                      className="river-node-wrapper"
                    >
                      <div
                        className={`river-thumb ${isInSelection ? 'in-selection' : ''}`}
                        onClick={() => handleNodeClick(a.id)}
                        title={`#${a.id}`}
                      >
                        <img src={`data:image/png;base64,${a.base64_image}`} alt={`#${a.id}`} />
                      </div>
                      {!isInSelection && (
                        <button
                          className="river-add-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddToSelection(a.id);
                          }}
                          title="Add to selection"
                        >
                          +
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Hero Card - Fixed center */}
            <div className="hero-card">
              <div
                className={`hero-image-wrapper ${isHeroSelected ? "selected" : ""}`}
                onMouseEnter={() => setHeroHoverAdd(!isHeroSelected)}
                onMouseLeave={() => setHeroHoverAdd(false)}
              >
                <img
                  src={`data:image/png;base64,${inspectedImage.base64_image}`}
                  alt="Hero"
                  className="hero-image"
                />
                {heroHoverAdd && !isHeroSelected && (
                  <button className="hero-add-btn" onClick={handleHeroAddClick}>
                    + Add to Selection
                  </button>
                )}
              </div>
              <div className="hero-meta">
                <span className="hero-id">#{inspectedImage.id}</span>
                <span className="hero-method">{inspectedImage.generation_method}</span>
                {inspectedImage.prompt && (
                  <p className="hero-prompt">{inspectedImage.prompt}</p>
                )}
              </div>
            </div>

            {/* Children - Single row at bottom */}
            {children.length > 0 && (
              <div className={`river-children ${children.length > 3 ? 'many-items' : ''} ${children.length > 5 ? 'very-many-items' : ''}`}>
                {children.map((c) => {
                  const isInSelection = selectedImageIds.includes(c.id);
                  return (
                    <div
                      key={c.id}
                      className="river-node-wrapper"
                    >
                      <div
                        className={`river-thumb ${isInSelection ? 'in-selection' : ''}`}
                        onClick={() => handleNodeClick(c.id)}
                        title={`#${c.id}`}
                      >
                        <img src={`data:image/png;base64,${c.base64_image}`} alt={`#${c.id}`} />
                      </div>
                      {!isInSelection && (
                        <button
                          className="river-add-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddToSelection(c.id);
                          }}
                          title="Add to selection"
                        >
                          +
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {ancestors.length === 0 && children.length === 0 && (
              <div className="no-lineage">No lineage</div>
            )}
              </>
            )}
          </div>

          {/* Action Bar */}
          <div className="action-bar">
            {/* ① Star Rating */}
            <div className="action-star-row">
              <span className="action-star-label">Rate</span>
              <div className="star-rating">
                {[1, 2, 3, 4, 5].map((n) => {
                  const currentRating = imageRatings[inspectedImage.id] ?? 0;
                  const filled = n <= currentRating;
                  return (
                    <button
                      key={n}
                      className={`star-btn ${filled ? "star-filled" : "star-empty"}`}
                      onClick={() => {
                        // Click same star = clear rating; otherwise set
                        const newRating = currentRating === n ? 0 : n;
                        // If multiple selected, rate all
                        if (selectedImageIds.length > 1) {
                          selectedImageIds.forEach((id) => setImageRating(id, newRating));
                        } else {
                          setImageRating(inspectedImage.id, newRating);
                        }
                      }}
                      title={`Rate ${n} star${n > 1 ? "s" : ""}`}
                    >
                      {filled ? "★" : "☆"}
                    </button>
                  );
                })}
                {(imageRatings[inspectedImage.id] ?? 0) > 0 && (
                  <span className="star-value">{imageRatings[inspectedImage.id]}/5</span>
                )}
              </div>
            </div>

            {/* ② Layer assignment row */}
            {(() => {
              const lid = imageLayerMap[inspectedImage.id] ?? "default";
              const layer = layers.find((l) => l.id === lid) ?? layers[0];
              return (
                <div className="action-layer-row">
                  <span className="action-layer-dot" style={{ background: layer?.color }} />
                  <select
                    className="action-layer-select-inline"
                    value={selectedImageIds.length > 1 ? "" : lid}
                    onChange={(e) => {
                      if (selectedImageIds.length > 1) {
                        setImagesLayer(selectedImageIds, e.target.value);
                      } else {
                        setImageLayer(inspectedImage.id, e.target.value);
                      }
                    }}
                    title={selectedImageIds.length > 1 ? `Move ${selectedImageIds.length} selected to layer` : "Change layer"}
                  >
                    {selectedImageIds.length > 1 && <option value="" disabled>Move {selectedImageIds.length} to →</option>}
                    {layers.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              );
            })()}

            {/* ③ Isolate / Unhide toggle */}
            <button
              className={isolatedImageIds !== null ? "action-unhide" : "action-isolate"}
              onClick={() => {
                if (isolatedImageIds !== null) {
                  setIsolatedImageIds(null);
                } else {
                  setIsolatedImageIds([...selectedImageIds]);
                }
              }}
              title={isolatedImageIds !== null ? "Exit isolate mode" : `Isolate ${selectedImageIds.length} selected image(s)`}
            >
              {isolatedImageIds !== null ? "⊙ Unhide All" : "◎ Isolate"}
            </button>

            {/* ④ Generate Variations */}
            {onGenerateFromReference && (
              <button className="action-primary" onClick={onGenerateFromReference}>
                Generate Variations
              </button>
            )}

            {/* ⑤ Remove + Deselect */}
            <div className="action-row">
              {onRemoveSelected && (
                <button className="action-danger" onClick={onRemoveSelected}>
                  Remove
                </button>
              )}
              <button className="action-secondary" onClick={clearSelection}>
                Deselect
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
