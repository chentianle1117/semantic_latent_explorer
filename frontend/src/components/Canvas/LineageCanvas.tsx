/**
 * LineageCanvas — full-canvas tree view of image lineage (parent→child relationships).
 * Uses d3-hierarchy tree layout + d3-zoom for pan/zoom.
 * Shares the same Zustand selection model as SemanticCanvas.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { useAppStore } from "../../store/appStore";
import type { ImageData } from "../../types";
import {
  getCategoryColor,
  getDisplayCategory,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
} from "../../utils/generationCategories";
import type { DisplayCategory } from "../../utils/generationCategories";
import "./LineageCanvas.css";

/* ─── Props ───────────────────────────────────────────────────────────────── */
interface LineageCanvasProps {
  onSelectionChange: (x: number, y: number, count: number) => void;
  onMiddleClick?: (x: number, y: number) => void;
}

/* ─── Types ───────────────────────────────────────────────────────────────── */
interface LayoutNode {
  id: number;
  img: ImageData;
  x: number; // horizontal (depth axis)
  y: number; // vertical (sibling axis)
}

interface LayoutEdge {
  key: string;
  x1: number; y1: number;
  x2: number; y2: number;
  color: string;
}

/* ─── Constants ───────────────────────────────────────────────────────────── */
const NODE_SIZE = 56;         // thumbnail side length
const NODE_RADIUS = 5;        // border radius for thumbnails
const COL_SPACING = 140;      // horizontal space between generations
const ROW_SPACING = 76;       // vertical space between siblings
const PADDING = 60;           // canvas padding

/* ─── Cubic bezier for edges ──────────────────────────────────────────────── */
function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = (x2 - x1) * 0.5;
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

/* ─── DAG-aware layered layout (Sugiyama-style) ─────────────────────────── */
function computeLayout(
  images: ImageData[],
): { nodes: LayoutNode[]; edges: LayoutEdge[]; width: number; height: number } {
  if (images.length === 0) return { nodes: [], edges: [], width: 0, height: 0 };

  const idSet = new Set(images.map(i => i.id));

  // Build adjacency: parentIds and childIds per node (only in-set)
  const parentIds = new Map<number, number[]>();
  const childIds = new Map<number, number[]>();
  images.forEach(img => {
    parentIds.set(img.id, img.parents.filter(p => idSet.has(p)));
    childIds.set(img.id, []);
  });
  images.forEach(img => {
    for (const pid of parentIds.get(img.id)!) {
      childIds.get(pid)!.push(img.id);
    }
  });

  // 1. Assign depth = longest path from any root (handles multi-parent correctly)
  const depth = new Map<number, number>();
  const roots = images.filter(img => parentIds.get(img.id)!.length === 0);

  // Topological BFS (Kahn's algorithm)
  const inDegree = new Map<number, number>();
  images.forEach(img => inDegree.set(img.id, parentIds.get(img.id)!.length));
  const queue: number[] = roots.map(r => r.id);
  roots.forEach(r => depth.set(r.id, 0));

  while (queue.length > 0) {
    const id = queue.shift()!;
    const d = depth.get(id)!;
    for (const cid of childIds.get(id)!) {
      // Child depth = max of all parent depths + 1
      depth.set(cid, Math.max(depth.get(cid) ?? 0, d + 1));
      inDegree.set(cid, inDegree.get(cid)! - 1);
      if (inDegree.get(cid) === 0) queue.push(cid);
    }
  }
  // Handle any nodes not reached (cycles, etc.) — assign depth 0
  images.forEach(img => { if (!depth.has(img.id)) depth.set(img.id, 0); });

  // 2. Group nodes by depth column, sort by timestamp within each column
  const maxDepth = Math.max(...Array.from(depth.values()), 0);
  const columns: ImageData[][] = Array.from({ length: maxDepth + 1 }, () => []);
  images.forEach(img => columns[depth.get(img.id)!].push(img));
  columns.forEach(col => col.sort((a, b) => {
    const aRef = a.generation_method === 'dataset' ? 1 : 0;
    const bRef = b.generation_method === 'dataset' ? 1 : 0;
    if (aRef !== bRef) return aRef - bRef;
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  }));

  // 3. Position nodes: x by depth, y evenly spaced per column
  const positions = new Map<number, { x: number; y: number }>();
  const layoutNodes: LayoutNode[] = [];

  columns.forEach((col, d) => {
    col.forEach((img, row) => {
      const x = PADDING + d * COL_SPACING;
      const y = PADDING + row * ROW_SPACING;
      positions.set(img.id, { x, y });
      layoutNodes.push({ id: img.id, img, x, y });
    });
  });

  // 4. Edges from ALL parents (every parent→child pair draws an edge)
  const edges: LayoutEdge[] = [];
  const nodeById = new Map(layoutNodes.map(n => [n.id, n]));
  images.forEach(img => {
    const pos = positions.get(img.id)!;
    for (const pid of parentIds.get(img.id)!) {
      const pp = positions.get(pid);
      if (!pp) continue;
      const parentNode = nodeById.get(pid);
      edges.push({
        key: `${pid}→${img.id}`,
        x1: pp.x + NODE_SIZE / 2, y1: pp.y,
        x2: pos.x - NODE_SIZE / 2, y2: pos.y,
        color: getCategoryColor(
          parentNode?.img.generation_method ?? 'batch',
          parentNode?.img.realm ?? 'shoe',
        ),
      });
    }
  });

  const maxX = Math.max(...layoutNodes.map(n => n.x), 0) + NODE_SIZE + PADDING;
  const maxY = Math.max(...layoutNodes.map(n => n.y), 0) + NODE_SIZE + PADDING;

  return { nodes: layoutNodes, edges, width: maxX, height: maxY };
}

/* ─── Component ───────────────────────────────────────────────────────────── */
export const LineageCanvas: React.FC<LineageCanvasProps> = ({
  onSelectionChange,
  onMiddleClick,
}) => {
  const allImages = useAppStore(s => s.images);
  const selectedImageIds = useAppStore(s => s.selectedImageIds);
  const setSelectedImageIds = useAppStore(s => s.setSelectedImageIds);
  const toggleImageSelection = useAppStore(s => s.toggleImageSelection);
  const hoveredImageId = useAppStore(s => s.hoveredImageId);
  const setHoveredImageId = useAppStore(s => s.setHoveredImageId);
  const setFlyToImageId = useAppStore(s => s.setFlyToImageId);
  const setInspectedImageId = useAppStore(s => (s as any).setInspectedImageId);
  const imageRatings = useAppStore(s => s.imageRatings);
  const starFilter = useAppStore(s => s.starFilter);
  const isolatedImageIds = useAppStore(s => s.isolatedImageIds);
  const hiddenImageIds = useAppStore(s => s.hiddenImageIds);
  const hiddenBatchIds = useAppStore(s => s.hiddenBatchIds);
  const historyGroups = useAppStore(s => s.historyGroups);
  const studyMode = useAppStore(s => s.studyMode);

  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown>>();
  const onMiddleClickRef = useRef(onMiddleClick);
  useEffect(() => { onMiddleClickRef.current = onMiddleClick; }, [onMiddleClick]);

  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ w: rect.width, h: rect.height });
    };
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Build hidden batch image set
  const batchHiddenImageIds = useMemo(() => {
    if (hiddenBatchIds.size === 0) return new Set<number>();
    const set = new Set<number>();
    historyGroups.forEach(g => {
      if (hiddenBatchIds.has(g.id)) g.image_ids.forEach(id => set.add(id));
    });
    return set;
  }, [hiddenBatchIds, historyGroups]);

  // Filter images
  const filteredImages = useMemo(() => {
    const hiddenSet = new Set(hiddenImageIds);
    return allImages.filter(img => {
      if (img.is_ghost) return false;
      if (!img.visible) return false;
      if (img.shoe_view && img.shoe_view !== 'side') return false;
      if (studyMode && img.realm === 'mood-board') return false;
      if (hiddenSet.has(img.id)) return false;
      if (batchHiddenImageIds.has(img.id)) return false;
      if (isolatedImageIds !== null && !isolatedImageIds.includes(img.id)) return false;
      if (starFilter !== null && (imageRatings[img.id] ?? 0) !== starFilter) return false;
      return true;
    });
  }, [allImages, hiddenImageIds, batchHiddenImageIds, isolatedImageIds, starFilter, imageRatings, studyMode]);

  // DAG layout (handles multi-parent correctly)
  const { nodes, edges, width, height } = useMemo(() => computeLayout(filteredImages), [filteredImages]);
  const selectedSet = useMemo(() => new Set(selectedImageIds), [selectedImageIds]);

  // Legend categories
  const usedCategories = useMemo(() => {
    const seen = new Set<DisplayCategory>();
    nodes.forEach(n => seen.add(getDisplayCategory(n.img.generation_method, n.img.realm)));
    return Array.from(seen);
  }, [nodes]);

  // D3 zoom
  useEffect(() => {
    const svg = d3.select(svgRef.current!);
    const g = gRef.current!;

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .filter((event: any) => {
        // Wheel = zoom, right-click drag = pan (same as SemanticCanvas)
        if (event.type === "wheel") return true;
        if (event.type === "mousedown" || event.type === "pointerdown") return event.button === 2;
        return false;
      })
      .on("zoom", (event) => {
        d3.select(g).attr("transform", event.transform.toString());
      });

    svg.call(zoom as any).on("dblclick.zoom", null);
    zoomRef.current = zoom;

    // Suppress browser context menu so right-drag works for pan
    const svgEl = svgRef.current!;
    const suppressCtx = (e: Event) => e.preventDefault();
    svgEl.addEventListener("contextmenu", suppressCtx);

    // Middle-click handler
    svg.on("auxclick", (event: MouseEvent) => {
      if (event.button === 1) {
        event.preventDefault();
        onMiddleClickRef.current?.(event.clientX, event.clientY);
      }
    });

    return () => {
      svg.on(".zoom", null);
      svg.on("auxclick", null);
      svgEl.removeEventListener("contextmenu", suppressCtx);
    };
  }, []);

  // Fit view when layout changes
  useEffect(() => {
    if (!svgRef.current || !zoomRef.current || nodes.length === 0) return;
    const svg = d3.select(svgRef.current);
    const { w, h } = containerSize;
    const scale = Math.min(w / Math.max(width, 1), h / Math.max(height, 1), 1) * 0.9;
    const tx = (w - width * scale) / 2;
    const ty = (h - height * scale) / 2;
    svg.transition().duration(400).call(
      zoomRef.current.transform,
      d3.zoomIdentity.translate(tx, ty).scale(scale),
    );
  }, [nodes.length, width, height, containerSize]);

  // Click handlers — same as SemanticCanvas: plain click toggles, ctrl deselects
  const handleNodeClick = useCallback((e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    toggleImageSelection(id, e.ctrlKey);
    if (setInspectedImageId) setInspectedImageId(id);
    setTimeout(() => {
      onSelectionChange(-1, -1, useAppStore.getState().selectedImageIds.length);
    }, 0);
  }, [toggleImageSelection, setInspectedImageId, onSelectionChange]);

  const handleNodeDoubleClick = useCallback((e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    // Fly to node in semantic canvas when switching back
    setFlyToImageId(id);
  }, [setFlyToImageId]);

  const handleBackgroundClick = useCallback(() => {
    setSelectedImageIds([]);
    onSelectionChange(0, 0, 0);
  }, [setSelectedImageIds, onSelectionChange]);

  return (
    <div ref={containerRef} className="lineage-canvas-container">
      <svg
        ref={svgRef}
        className="lineage-canvas-svg"
        width={containerSize.w}
        height={containerSize.h}
        onClick={handleBackgroundClick}
      >
        <defs>
          <filter id="lc-sel-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feDropShadow dx="0" dy="0" stdDeviation="10" floodColor="#00d2ff" floodOpacity="0.9" />
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#00d2ff" floodOpacity="0.7" />
          </filter>
          <filter id="lc-hover-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#c0d0e0" floodOpacity="0.7" />
          </filter>
        </defs>

        <g ref={gRef}>
          {/* Edges */}
          {edges.map(e => (
            <path
              key={e.key}
              d={edgePath(e.x1, e.y1, e.x2, e.y2)}
              fill="none"
              stroke={e.color}
              strokeWidth={1.6}
              strokeOpacity={0.4}
              className="lc-edge"
            />
          ))}

          {/* Nodes */}
          {nodes.map(n => {
            const hs = NODE_SIZE / 2;
            const sel = selectedSet.has(n.id);
            const hov = hoveredImageId === n.id;
            const rating = imageRatings[n.id] ?? 0;
            const isAgent = n.img.generation_method === 'agent';
            const isMoodBoard = n.img.realm === 'mood-board';
            const col = getCategoryColor(n.img.generation_method, n.img.realm);
            const selColor = isMoodBoard ? '#FF6B2B' : '#00d2ff';
            const label = n.img.prompt
              ? (n.img.prompt.length > 80 ? n.img.prompt.slice(0, 80) + '…' : n.img.prompt)
              : `Image ${n.id}`;

            return (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                onClick={(e) => handleNodeClick(e, n.id)}
                onDoubleClick={(e) => handleNodeDoubleClick(e, n.id)}
                onMouseEnter={() => setHoveredImageId(n.id)}
                onMouseLeave={() => setHoveredImageId(null)}
                style={{ cursor: 'pointer' }}
                filter={sel ? 'url(#lc-sel-glow)' : hov ? 'url(#lc-hover-glow)' : undefined}
              >
                <title>{label}{isMoodBoard ? ' [mood board]' : ''}</title>

                {/* Hit area */}
                <rect
                  x={-hs - 6} y={-hs - 6}
                  width={NODE_SIZE + 12} height={NODE_SIZE + 12}
                  fill="transparent"
                />

                {/* Thumbnail — no background rect, just the image like SemanticCanvas */}
                {n.img.base64_image && (
                  <>
                    <clipPath id={`lc-clip-${n.id}`}>
                      <rect x={-hs} y={-hs} width={NODE_SIZE} height={NODE_SIZE} rx={NODE_RADIUS} />
                    </clipPath>
                    <image
                      href={`data:image/png;base64,${n.img.base64_image}`}
                      x={-hs} y={-hs}
                      width={NODE_SIZE} height={NODE_SIZE}
                      clipPath={`url(#lc-clip-${n.id})`}
                      preserveAspectRatio="xMidYMid slice"
                    />
                  </>
                )}

                {/* Agent badge */}
                {isAgent && (
                  <g transform={`translate(${hs - 6},${-hs + 6})`}>
                    <circle r={6} fill="#6a5acd" opacity={0.92} />
                    <text textAnchor="middle" dominantBaseline="central" fontSize={7} fill="white" fontWeight="bold">A</text>
                  </g>
                )}

                {/* Star badge */}
                {rating > 0 && (
                  <g transform={`translate(${-hs + 11},${-hs + 8})`}>
                    <rect x={-11} y={-7} width={22} height={14} rx={4} fill="#c8a000" opacity={0.88} />
                    <text textAnchor="middle" dominantBaseline="central" fontSize={7} fill="white" fontWeight="bold">
                      {rating}★
                    </text>
                  </g>
                )}

                {/* Prompt shown in tooltip via <title> — no text below node */}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Legend overlay */}
      {usedCategories.length > 0 && (
        <div className="lc-legend">
          {usedCategories.map(cat => (
            <span key={cat} className="lc-legend-item">
              <svg width={10} height={10}>
                <circle cx={5} cy={5} r={5} fill={CATEGORY_COLORS[cat]} />
              </svg>
              {CATEGORY_LABELS[cat]}
            </span>
          ))}
        </div>
      )}

      {/* Empty state */}
      {nodes.length === 0 && (
        <div className="lc-empty">
          <span>No lineage data yet — generate some images first</span>
        </div>
      )}
    </div>
  );
};
