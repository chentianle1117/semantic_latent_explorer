import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useAppStore } from "../../store/appStore";
import { getRealmAwareLabel } from "../../utils/generationCategories";
import { SHOE_VIEW_LABELS } from "../../api/falClient";
import type { ImageData } from "../../types";
import "./RightInspector.css";

type LineSegment = { from: { x: number; y: number }; to: { x: number; y: number }; type: "ancestor" | "child" };

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
  onOpenMultiViewEditor?: (sideImage: ImageData, satellites: ImageData[]) => void;
}

export const RightInspector: React.FC<RightInspectorProps> = ({
  onGenerateFromReference,
  onRemoveSelected,
  onOpenMultiViewEditor,
}) => {
  const isCollapsed = useAppStore((s) => s.isInspectorCollapsed);
  const setIsCollapsed = useAppStore((s) => s.setIsInspectorCollapsed);
  const studyMode = useAppStore((s) => s.studyMode);
  const selectedImageIds = useAppStore((s) => s.selectedImageIds);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const toggleImageSelection = useAppStore((s) => s.toggleImageSelection);
  const setFlyToImageId = useAppStore((s) => s.setFlyToImageId);
  const images = useAppStore((s) => s.images);
  const isolatedImageIds = useAppStore((s) => s.isolatedImageIds);
  const setIsolatedImageIds = useAppStore((s) => s.setIsolatedImageIds);
  const imageRatings = useAppStore((s) => s.imageRatings);
  const setImageRating = useAppStore((s) => s.setImageRating);

  // Split-state: inspectedImageId can diverge from selectedImageIds
  const [inspectedImageId, setInspectedImageId] = useState<number | null>(null);
  const [heroHoverAdd, setHeroHoverAdd] = useState(false);

  // Inspector is never collapsed — disable auto-collapse as well
  useEffect(() => {
    if (isCollapsed) setIsCollapsed(false);
  }, [isCollapsed, setIsCollapsed]);

  const imageMap = useMemo(() => {
    const m = new Map<number, ImageData>();
    images.forEach((img) => m.set(img.id, img));
    return m;
  }, [images]);

  // Auto-redirect: if a satellite view is selected, redirect to its parent side view
  useEffect(() => {
    if (selectedImageIds.length > 0) {
      const lastSelected = selectedImageIds[selectedImageIds.length - 1];
      const lastImg = imageMap.get(lastSelected);
      // If this is a satellite view, redirect to the parent side view
      const resolvedId = (lastImg && lastImg.shoe_view && lastImg.shoe_view !== 'side' && lastImg.parent_side_id && lastImg.parent_side_id > 0)
        ? lastImg.parent_side_id
        : lastSelected;
      if (!inspectedImageId || !selectedImageIds.includes(inspectedImageId)) {
        setInspectedImageId(resolvedId);
      } else {
        setInspectedImageId(resolvedId);
      }
    } else {
      setInspectedImageId(null);
    }
  }, [selectedImageIds, imageMap]);

  const inspectedImage = inspectedImageId != null ? imageMap.get(inspectedImageId) : null;
  // Order selected images by selection order, latest first (leftmost in deck)
  const selectedImages = useMemo(() => {
    const mapped = selectedImageIds.map((id) => imageMap.get(id)).filter(Boolean) as ImageData[];
    return mapped.reverse();
  }, [selectedImageIds, imageMap]);

  // Helper: check if an image is a satellite (non-side) view
  const isSatellite = (img: ImageData) => img.shoe_view && img.shoe_view !== 'side';

  const ancestors = useMemo(() => {
    if (!inspectedImage) return [];
    return (inspectedImage.parents || [])
      .map((id) => imageMap.get(id))
      .filter((img): img is ImageData => !!img && !isSatellite(img));
  }, [inspectedImage, imageMap]);

  const children = useMemo(() => {
    if (!inspectedImage) return [];
    return (inspectedImage.children || [])
      .map((id) => imageMap.get(id))
      .filter((img): img is ImageData => !!img && !isSatellite(img));
  }, [inspectedImage, imageMap]);

  // Find ALL satellite views for the inspected shoe (regardless of canvas filter toggle)
  const satelliteViews = useMemo(() => {
    if (!inspectedImage || inspectedImage.realm === 'mood-board') return [] as ImageData[];
    return images.filter(img => img.parent_side_id === inspectedImage.id && isSatellite(img));
  }, [inspectedImage, images]);

  const riverRef = useRef<HTMLDivElement>(null);
  const [lineSegments, setLineSegments] = useState<LineSegment[]>([]);
  const [riverKey, setRiverKey] = useState(0);

  // Recompute lines whenever the river container resizes (inspector height changes)
  useEffect(() => {
    const el = riverRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRiverKey((k) => k + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
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
  }, [ancestors.length, children.length, inspectedImageId, riverKey]);

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

  const handleNodeClick = (id: number) => {
    // Auto-redirect satellite views to their parent side view
    const img = imageMap.get(id);
    const resolvedId = (img && isSatellite(img) && img.parent_side_id && img.parent_side_id > 0)
      ? img.parent_side_id : id;
    setInspectedImageId(resolvedId);
    setFlyToImageId(resolvedId);
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
    <div className="ethereal-inspector" data-tour="inspector">
      <div className="inspector-header">
        <span className="inspector-title">INSPECTOR</span>
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
            <span className="deck-label">Selected ({selectedImages.length})</span>
            <div className="deck-scroll">
              {selectedImages.map((img) => (
                <div
                  key={img.id}
                  className={`deck-avatar ${inspectedImageId === img.id ? "active" : ""}`}
                  style={img.realm === 'mood-board' ? { width: 72, aspectRatio: '3/2' } : undefined}
                  onClick={() => handleNodeClick(img.id)}
                  title={`#${img.id}`}
                >
                  <img src={`data:image/png;base64,${img.base64_image}`} alt={`#${img.id}`} />
                </div>
              ))}
            </div>
          </div>

          {/* Genealogy River */}
          <div className="genealogy-river" ref={riverRef}>
            {/* Lines overlay: SVG so lines are never clipped by overflow */}
            {lineSegments.length > 0 && (
              <div className="river-lines-overlay" aria-hidden>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="river-lines-svg">
                  <defs>
                    {/* Shoe realm gradients (cyan/amber) */}
                    <linearGradient id="river-line-ancestor" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="rgba(0, 229, 255, 0.55)" />
                      <stop offset="100%" stopColor="rgba(0, 229, 255, 0.08)" />
                    </linearGradient>
                    <linearGradient id="river-line-child" x1="0%" y1="100%" x2="0%" y2="0%">
                      <stop offset="0%" stopColor="rgba(255, 170, 0, 0.55)" />
                      <stop offset="100%" stopColor="rgba(255, 170, 0, 0.08)" />
                    </linearGradient>
                    {/* Mood board realm gradients (orange) */}
                    <linearGradient id="river-line-ancestor-mb" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="rgba(255, 107, 43, 0.6)" />
                      <stop offset="100%" stopColor="rgba(255, 107, 43, 0.08)" />
                    </linearGradient>
                    <linearGradient id="river-line-child-mb" x1="0%" y1="100%" x2="0%" y2="0%">
                      <stop offset="0%" stopColor="rgba(255, 107, 43, 0.6)" />
                      <stop offset="100%" stopColor="rgba(255, 107, 43, 0.08)" />
                    </linearGradient>
                  </defs>
                  {lineSegments.map((seg, i) => {
                    const halfDy = (seg.to.y - seg.from.y) * 0.5;
                    const pathD = `M ${seg.from.x} ${seg.from.y} C ${seg.from.x} ${seg.from.y + halfDy} ${seg.to.x} ${seg.to.y - halfDy} ${seg.to.x} ${seg.to.y}`;
                    const isMb = inspectedImage?.realm === 'mood-board';
                    const gradId = seg.type === "ancestor"
                      ? (isMb ? "river-line-ancestor-mb" : "river-line-ancestor")
                      : (isMb ? "river-line-child-mb" : "river-line-child");

                    return (
                      <path
                        key={`${seg.type}-${i}`}
                        d={pathD}
                        stroke={`url(#${gradId})`}
                        strokeWidth={0.8}
                        strokeLinecap="round"
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
                  const isMb = a.realm === 'mood-board';
                  return (
                    <div
                      key={a.id}
                      className="river-node-wrapper"
                    >
                      <div
                        className={`river-thumb ${isInSelection ? 'in-selection' : ''} ${isMb ? 'realm-mood-board' : ''}`}
                        onClick={() => handleNodeClick(a.id)}
                        title={`#${a.id}${isMb ? ' [mood board]' : ''}`}
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

            {/* Hero Card — side view hero flanked by satellite views */}
            <div className="hero-card">
              {satelliteViews.length > 0 && !studyMode ? (() => {
                // Split satellites: left = [3/4-front, front, medial, top], right = [3/4-back, back, outsole]
                const leftOrder = ['3/4-front', 'front', 'medial', 'top'];
                const rightOrder = ['3/4-back', 'back', 'outsole'];
                const leftSats = leftOrder.map(vt => satelliteViews.find(s => s.shoe_view === vt)).filter(Boolean) as typeof satelliteViews;
                const rightSats = rightOrder.map(vt => satelliteViews.find(s => s.shoe_view === vt)).filter(Boolean) as typeof satelliteViews;

                const renderFlank = (sats: typeof satelliteViews) => (
                  <div className="hero-flank">
                    {sats.map((sat) => (
                      <div
                        key={sat.id}
                        className="hero-satellite"
                        onClick={() => {
                          if (onOpenMultiViewEditor) {
                            onOpenMultiViewEditor(inspectedImage, satelliteViews);
                          }
                        }}
                        title={`${SHOE_VIEW_LABELS[sat.shoe_view as keyof typeof SHOE_VIEW_LABELS] ?? sat.shoe_view} #${sat.id}`}
                      >
                        <img
                          src={`data:image/png;base64,${sat.base64_image}`}
                          alt={sat.shoe_view ?? 'satellite'}
                        />
                      </div>
                    ))}
                  </div>
                );

                return (
                  <div className="hero-layout-flanked">
                    {leftSats.length > 0 && renderFlank(leftSats)}
                    <div
                      className={`hero-image-wrapper ${isHeroSelected ? "selected" : ""}`}
                      style={inspectedImage.realm === 'mood-board' ? { aspectRatio: '3 / 2', height: 'min(calc(100% - 44px), 22vh, 180px)' } : undefined}
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
                    {rightSats.length > 0 && renderFlank(rightSats)}
                  </div>
                );
              })() : (
                <div
                  className={`hero-image-wrapper ${isHeroSelected ? "selected" : ""}`}
                  style={inspectedImage.realm === 'mood-board' ? { aspectRatio: '3 / 2', height: 'min(calc(100% - 44px), 22vh, 180px)' } : undefined}
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
              )}
            </div>

            {/* Children - Single row at bottom */}
            {children.length > 0 && (
              <div className={`river-children ${children.length > 3 ? 'many-items' : ''} ${children.length > 5 ? 'very-many-items' : ''}`}>
                {children.map((c) => {
                  const isInSelection = selectedImageIds.includes(c.id);
                  const isMb = c.realm === 'mood-board';
                  return (
                    <div
                      key={c.id}
                      className="river-node-wrapper"
                    >
                      <div
                        className={`river-thumb ${isInSelection ? 'in-selection' : ''} ${isMb ? 'realm-mood-board' : ''}`}
                        onClick={() => handleNodeClick(c.id)}
                        title={`#${c.id}${isMb ? ' [mood board]' : ''}`}
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

          </div>

          {/* Metadata strip — between tree and action bar */}
          <div className="hero-meta">
            <span className="hero-id">#{inspectedImage.id}</span>
            <span className="hero-meta-sep">·</span>
            <span className="hero-method">{getRealmAwareLabel(inspectedImage.generation_method, inspectedImage.realm)}</span>
            {inspectedImage.prompt && (
              <span className="hero-prompt" title={inspectedImage.prompt}>{inspectedImage.prompt}</span>
            )}
          </div>

          {/* Action Bar */}
          <div className="action-bar" data-tour="action-bar">
            {/* Row 1: Rate + Layer side by side */}
            <div className="action-row">
              <div className="action-star-row" data-tour="action-stars">
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
                          const newRating = currentRating === n ? 0 : n;
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
            </div>

            {/* Row 2: Generate Variations + Edit Views + Isolate */}
            <div className="action-row">
              {onGenerateFromReference && (
                <button className="action-primary" onClick={onGenerateFromReference} data-tour="action-generate">
                  Generate Variations
                </button>
              )}
              {onOpenMultiViewEditor && !studyMode && inspectedImage.realm !== 'mood-board' && (
                <button
                  className="action-edit-views"
                  onClick={() => onOpenMultiViewEditor(inspectedImage, satelliteViews)}
                >
                  Edit Views{satelliteViews.length > 0 ? ` (${satelliteViews.length})` : ''}
                </button>
              )}
              <button
                className={isolatedImageIds !== null ? "action-unhide" : "action-isolate"}
                data-tour="action-isolate"
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
            </div>

            {/* Row 3: Remove + Deselect */}
            <div className="action-row">
              {onRemoveSelected && (
                <button className="action-danger" onClick={onRemoveSelected} data-tour="action-remove">
                  Remove
                </button>
              )}
              <button className="action-secondary" onClick={clearSelection} data-tour="action-deselect">
                Deselect
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
