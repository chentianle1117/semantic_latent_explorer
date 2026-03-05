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
interface TreeNode {
  id: number;
  img: ImageData;
  children: TreeNode[];
}

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

/* ─── Build hierarchy from flat images ────────────────────────────────────── */
function buildHierarchy(images: ImageData[]): { roots: TreeNode[]; allNodes: Map<number, TreeNode> } {
  const idSet = new Set(images.map(i => i.id));
  const nodeMap = new Map<number, TreeNode>();
  images.forEach(img => nodeMap.set(img.id, { id: img.id, img, children: [] }));

  // Parent→child: for each image, add it as a child of each of its parents
  const hasParent = new Set<number>();
  images.forEach(img => {
    img.parents.forEach(pid => {
      if (!idSet.has(pid)) return;
      const parent = nodeMap.get(pid)!;
      const child = nodeMap.get(img.id)!;
      if (!parent.children.includes(child)) {
        parent.children.push(child);
        hasParent.add(img.id);
      }
    });
  });

  // Roots: nodes with no in-set parent
  const roots = images
    .filter(img => !hasParent.has(img.id))
    .map(img => nodeMap.get(img.id)!)
    .sort((a, b) => new Date(a.img.timestamp).getTime() - new Date(b.img.timestamp).getTime());

  // Sort children by timestamp at every level
  const sortChildren = (node: TreeNode) => {
    node.children.sort((a, b) => new Date(a.img.timestamp).getTime() - new Date(b.img.timestamp).getTime());
    node.children.forEach(sortChildren);
  };
  roots.forEach(sortChildren);

  return { roots, allNodes: nodeMap };
}

/* ─── Layout: depth-first position assignment ─────────────────────────────── */
function computeLayout(
  roots: TreeNode[],
): { nodes: LayoutNode[]; edges: LayoutEdge[]; width: number; height: number } {
  const layoutNodes: LayoutNode[] = [];
  const positions = new Map<number, { x: number; y: number }>();
  let nextY = 0;

  // DFS: each node gets (depth * COL_SPACING, nextY * ROW_SPACING)
  const visited = new Set<number>();
  const dfs = (node: TreeNode, depth: number) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);

    const childPositions: number[] = [];
    node.children.forEach(child => {
      dfs(child, depth + 1);
      const cp = positions.get(child.id);
      if (cp) childPositions.push(cp.y);
    });

    let y: number;
    if (childPositions.length > 0) {
      // Center parent among its children
      y = (Math.min(...childPositions) + Math.max(...childPositions)) / 2;
    } else {
      // Leaf: place at next available row
      y = nextY;
      nextY += ROW_SPACING;
    }
    // If position would overlap, push down
    if (positions.size > 0) {
      const sameDepthPositions = Array.from(positions.values())
        .filter((_, idx) => {
          const id = Array.from(positions.keys())[idx];
          const n = layoutNodes.find(ln => ln.id === id);
          return n && Math.abs(n.x - depth * COL_SPACING) < 1;
        })
        .map(p => p.y);
      if (sameDepthPositions.length > 0) {
        const minGap = NODE_SIZE + 12;
        for (const existingY of sameDepthPositions) {
          if (Math.abs(y - existingY) < minGap) {
            y = Math.max(y, existingY + ROW_SPACING);
          }
        }
      }
    }

    const x = PADDING + depth * COL_SPACING;
    positions.set(node.id, { x, y: y + PADDING });
    layoutNodes.push({ id: node.id, img: node.img, x, y: y + PADDING });
  };

  roots.forEach(root => dfs(root, 0));

  // Edges
  const edges: LayoutEdge[] = [];
  layoutNodes.forEach(node => {
    const pos = positions.get(node.id)!;
    node.img.parents.forEach(pid => {
      const pp = positions.get(pid);
      if (!pp) return;
      edges.push({
        key: `${pid}→${node.id}`,
        x1: pp.x + NODE_SIZE / 2, y1: pp.y,
        x2: pos.x - NODE_SIZE / 2, y2: pos.y,
        color: getCategoryColor(
          layoutNodes.find(n => n.id === pid)?.img.generation_method ?? 'batch',
          layoutNodes.find(n => n.id === pid)?.img.realm ?? 'shoe',
        ),
      });
    });
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
      if (starFilter !== null && (imageRatings[img.id] ?? 0) < starFilter) return false;
      return true;
    });
  }, [allImages, hiddenImageIds, batchHiddenImageIds, isolatedImageIds, starFilter, imageRatings, studyMode]);

  // Build tree & layout
  const { roots } = useMemo(() => buildHierarchy(filteredImages), [filteredImages]);
  const { nodes, edges, width, height } = useMemo(() => computeLayout(roots), [roots]);
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
      .on("zoom", (event) => {
        d3.select(g).attr("transform", event.transform.toString());
      });

    svg.call(zoom);
    zoomRef.current = zoom;

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

  // Click handlers
  const handleNodeClick = useCallback((e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      toggleImageSelection(id, true);
    } else {
      setSelectedImageIds([id]);
    }
    if (setInspectedImageId) setInspectedImageId(id);
    onSelectionChange(-1, -1, useAppStore.getState().selectedImageIds.length);
  }, [toggleImageSelection, setSelectedImageIds, setInspectedImageId, onSelectionChange]);

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
          <filter id="lc-sel-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#00d2ff" floodOpacity="0.85" />
          </filter>
          <filter id="lc-hover-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#c0d0e0" floodOpacity="0.6" />
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

                {/* Background fill */}
                <rect
                  x={-hs} y={-hs}
                  width={NODE_SIZE} height={NODE_SIZE}
                  rx={NODE_RADIUS}
                  fill={col}
                  fillOpacity={0.12}
                />

                {/* Thumbnail */}
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

                {/* Border */}
                <rect
                  x={-hs} y={-hs}
                  width={NODE_SIZE} height={NODE_SIZE}
                  rx={NODE_RADIUS}
                  fill="none"
                  stroke={sel ? selColor : col}
                  strokeWidth={sel ? 2.5 : hov ? 1.8 : 1}
                  strokeOpacity={sel ? 1 : hov ? 0.85 : 0.5}
                />

                {/* Agent badge */}
                {isAgent && (
                  <g transform={`translate(${hs - 6},${-hs + 6})`}>
                    <circle r={6} fill="#6a5acd" opacity={0.92} />
                    <text textAnchor="middle" dominantBaseline="central" fontSize={7} fill="white" fontWeight="bold">A</text>
                  </g>
                )}

                {/* Star badge */}
                {rating > 0 && (
                  <g transform={`translate(${-hs + 6},${-hs + 6})`}>
                    <circle r={6} fill="#c8a000" opacity={0.92} />
                    <text textAnchor="middle" dominantBaseline="central" fontSize={8} fill="white">★</text>
                  </g>
                )}

                {/* Prompt snippet below node */}
                {(sel || hov) && n.img.prompt && (
                  <text
                    y={hs + 12}
                    textAnchor="middle"
                    fontSize={9}
                    fill="rgba(200,210,220,0.8)"
                    className="lc-node-label"
                  >
                    {n.img.prompt.length > 30 ? n.img.prompt.slice(0, 30) + '…' : n.img.prompt}
                  </text>
                )}
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
