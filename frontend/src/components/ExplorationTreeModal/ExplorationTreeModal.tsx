/**
 * Full Exploration Tree Modal — v2
 * Clean horizontal tree layout with consistent spacing via d3.tree nodeSize.
 * Nodes are rounded-square thumbnails, links are subtle bezier curves.
 * Click node to select and fly-to on canvas.
 */

import React, { useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import { useAppStore } from "../../store/appStore";
import type { ImageData } from "../../types";
import "./ExplorationTreeModal.css";

interface ExplorationTreeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const NODE_W = 56;    // node width (square thumbnail)
const NODE_H = 56;    // node height
const H_GAP = 120;    // horizontal gap between generations
const V_GAP = 72;     // vertical gap between siblings
const SVG_PAD = 60;

// Category colors: reference (dataset), generated, agent
const CAT_COLORS: Record<string, string> = {
  dataset:  '#f97316', // orange — reference shoes
  generated:'#22c55e', // green  — AI generated
  agent:    '#a855f7', // purple — AI agent suggestions
  user:     '#58a6ff', // blue   — user loaded
};

function getCatColor(img: ImageData | null): string {
  if (!img) return '#8b949e';
  // Mood board realm gets its own color regardless of generation method
  if (img.realm === 'mood-board') return '#FF6B2B';
  const m = img.generation_method ?? '';
  if (m === 'dataset') return CAT_COLORS.dataset;
  if (m === 'generated' || m === 'text2image' || m === 'variation') return CAT_COLORS.generated;
  if (m === 'agent' || m === 'exploration') return CAT_COLORS.agent;
  return CAT_COLORS.user;
}

// Realm-aware edge colors for cross-realm lineage
function getRealmEdgeColor(sourceImg: ImageData | null, targetImg: ImageData | null): string {
  const sRealm = sourceImg?.realm ?? 'shoe';
  const tRealm = targetImg?.realm ?? 'shoe';
  if (sRealm === 'mood-board' && tRealm === 'mood-board') return 'rgba(255, 107, 43, 0.5)';  // orange
  if (sRealm !== 'mood-board' && tRealm !== 'mood-board') return 'rgba(139, 148, 158, 0.25)'; // default gray
  if (sRealm === 'mood-board' && tRealm !== 'mood-board') return 'rgba(63, 185, 80, 0.5)';    // green (consolidation)
  return 'rgba(168, 85, 247, 0.45)';                                                           // purple (abstraction)
}

interface HierarchyNode {
  id: number;
  image: ImageData | null;
  children: HierarchyNode[];
}

export const ExplorationTreeModal: React.FC<ExplorationTreeModalProps> = ({
  isOpen,
  onClose,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const selectedImageIdsRef = useRef<number[]>([]);
  const images = useAppStore((s) => s.images);
  const selectedImageIds = useAppStore((s) => s.selectedImageIds);
  selectedImageIdsRef.current = selectedImageIds;
  const setSelectedImageIds = useAppStore((s) => s.setSelectedImageIds);
  const setFlyToImageId = useAppStore((s) => s.setFlyToImageId);

  const { hierarchy, links, posMap, maxDepth, treeWidth, treeHeight } = useMemo(() => {
    // Exclude satellite views — only side views represent designs in the tree
    const treeImages = images.filter(img => !img.shoe_view || img.shoe_view === 'side');
    const imageMap = new Map<number, ImageData>();
    treeImages.forEach((img) => imageMap.set(img.id, img));

    // Build parent→children map (use first parent only per child for tree structure)
    const childrenByParent = new Map<number, number[]>();
    const hasParent = new Set<number>();

    treeImages.forEach((img) => {
      (img.parents || []).forEach((parentId) => {
        if (!imageMap.has(parentId)) return;
        if (hasParent.has(img.id)) return; // only one parent per child for tree
        hasParent.add(img.id);
        const arr = childrenByParent.get(parentId) || [];
        if (!arr.includes(img.id)) arr.push(img.id);
        childrenByParent.set(parentId, arr);
      });
    });

    // Find root nodes (no parents)
    const roots = treeImages.filter((img) => !hasParent.has(img.id)).map((img) => img.id);

    const visited = new Set<number>();
    const buildHierarchy = (id: number): HierarchyNode => {
      visited.add(id);
      const img = imageMap.get(id);
      const childIds = (childrenByParent.get(id) || []).filter((cid) => !visited.has(cid));
      return {
        id,
        image: img || null,
        children: childIds.map(buildHierarchy),
      };
    };

    // Build virtual root that contains all root nodes
    const rootChildren = roots.map(buildHierarchy);
    // Add any orphans not reached
    images.forEach((img) => {
      if (!visited.has(img.id)) {
        rootChildren.push({ id: img.id, image: img, children: [] });
      }
    });

    let rootData: HierarchyNode;
    if (rootChildren.length === 1) {
      rootData = rootChildren[0];
    } else {
      rootData = { id: -1, image: null, children: rootChildren };
    }

    const d3Root = d3.hierarchy(rootData, (d) => d.children);

    // Use nodeSize for consistent spacing: [vertical, horizontal]
    const treeLayout = d3.tree<HierarchyNode>().nodeSize([V_GAP, H_GAP]);
    treeLayout(d3Root);

    // Collect positions and compute bounds
    const posMap = new Map<number, { x: number; y: number; depth: number }>();
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let maxDepth = 0;

    d3Root.each((node) => {
      const data = node.data as HierarchyNode;
      if (data.id < 0) return; // skip virtual root
      // d3.tree: node.x = vertical (breadth), node.y = horizontal (depth)
      // We swap for left-to-right: px = node.y (depth), py = node.x (breadth)
      const px = node.y ?? 0;
      const py = node.x ?? 0;
      posMap.set(data.id, { x: px, y: py, depth: node.depth });
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
      maxDepth = Math.max(maxDepth, node.depth);
    });

    if (!Number.isFinite(minX)) minX = 0;
    if (!Number.isFinite(maxX)) maxX = 0;
    if (!Number.isFinite(minY)) minY = 0;
    if (!Number.isFinite(maxY)) maxY = 0;

    // Shift so top-left is at SVG_PAD
    const shiftedPosMap = new Map<number, { x: number; y: number; depth: number }>();
    posMap.forEach((pos, id) => {
      shiftedPosMap.set(id, {
        x: pos.x - minX + SVG_PAD + NODE_W / 2,
        y: pos.y - minY + SVG_PAD + NODE_H / 2,
        depth: pos.depth,
      });
    });

    const width = maxX - minX + NODE_W + SVG_PAD * 2;
    const height = maxY - minY + NODE_H + SVG_PAD * 2;
    const treeWidth = Math.max(width, 400);
    const treeHeight = Math.max(height, 300);

    // Collect links from hierarchy
    const treeLinks: { source: number; target: number }[] = [];
    d3Root.each((node) => {
      if (node.data.id < 0 || !node.children) return;
      node.children.forEach((child) => {
        if (child.data.id >= 0) {
          treeLinks.push({ source: node.data.id, target: child.data.id });
        }
      });
    });

    return {
      hierarchy: d3Root,
      links: treeLinks,
      posMap: shiftedPosMap,
      maxDepth,
      treeWidth,
      treeHeight,
    };
  }, [images]);

  useEffect(() => {
    if (!isOpen || !svgRef.current) return;

    const svgEl = svgRef.current;
    const containerW = svgEl.clientWidth || 800;
    const containerH = svgEl.clientHeight || 600;

    const g = d3.select(svgEl);
    g.selectAll("*").remove();

    const defs = g.append("defs");

    // Clip path for rounded-square thumbnails
    defs.append("clipPath")
      .attr("id", "node-clip")
      .append("rect")
      .attr("x", -NODE_W / 2)
      .attr("y", -NODE_H / 2)
      .attr("width", NODE_W)
      .attr("height", NODE_H)
      .attr("rx", 8);

    // Arrow marker
    defs.append("marker")
      .attr("id", "tree-arrow")
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("refX", 5)
      .attr("refY", 3)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M 0 0 L 6 3 L 0 6 Z")
      .attr("fill", "rgba(139,148,158,0.4)");

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.select("g.zoom-group").attr("transform", event.transform);
      });
    g.call(zoom);

    const zoomGroup = g.append("g").attr("class", "zoom-group");

    // Generation column labels
    for (let d = 0; d <= maxDepth; d++) {
      // Find any node at this depth to get its x position
      let colX = 0;
      posMap.forEach((pos) => {
        if (pos.depth === d) colX = pos.x;
      });
      if (d === 0 && posMap.size === 0) continue;
      // Only show for visible depths
      let found = false;
      posMap.forEach((pos) => { if (pos.depth === d) found = true; });
      if (!found) continue;

      zoomGroup.append("text")
        .attr("x", colX)
        .attr("y", 20)
        .attr("text-anchor", "middle")
        .attr("font-size", "9px")
        .attr("font-weight", 600)
        .attr("fill", "rgba(139,148,158,0.35)")
        .attr("letter-spacing", "0.08em")
        .text(d === 0 ? "ROOTS" : `GEN ${d}`);
    }

    // Build image map early (needed for realm-aware link colors)
    const imageMap = new Map<number, ImageData>();
    images.forEach((img) => imageMap.set(img.id, img));

    // Links — subtle horizontal bezier, realm-colored
    links.forEach((link) => {
      const s = posMap.get(link.source);
      const t = posMap.get(link.target);
      if (!s || !t) return;

      const sx = s.x + NODE_W / 2 + 2;
      const tx = t.x - NODE_W / 2 - 4;
      const midX = (sx + tx) / 2;
      const pathD = `M ${sx} ${s.y} C ${midX} ${s.y}, ${midX} ${t.y}, ${tx} ${t.y}`;
      const edgeColor = getRealmEdgeColor(imageMap.get(link.source) ?? null, imageMap.get(link.target) ?? null);

      zoomGroup.append("path")
        .attr("d", pathD)
        .attr("fill", "none")
        .attr("stroke", edgeColor)
        .attr("stroke-width", 1.5)
        .attr("marker-end", "url(#tree-arrow)");
    });

    // Nodes
    const allNodes = Array.from(posMap.entries());

    allNodes.forEach(([id, pos]) => {
      const img = imageMap.get(id) ?? null;
      const catColor = getCatColor(img);

      const nodeG = zoomGroup.append("g")
        .attr("class", "tree-node")
        .attr("data-node-id", String(id))
        .attr("transform", `translate(${pos.x},${pos.y})`)
        .style("cursor", "pointer");

      // Soft background glow
      nodeG.append("rect")
        .attr("x", -NODE_W / 2 - 3)
        .attr("y", -NODE_H / 2 - 3)
        .attr("width", NODE_W + 6)
        .attr("height", NODE_H + 6)
        .attr("rx", 10)
        .attr("fill", "none")
        .attr("stroke", catColor)
        .attr("stroke-width", 1.2)
        .attr("stroke-opacity", 0.4)
        .attr("class", "node-base-ring");

      // Thumbnail image
      const imgUrl = img?.base64_image
        ? `data:image/png;base64,${img.base64_image}`
        : null;

      if (imgUrl) {
        nodeG.append("image")
          .attr("href", imgUrl)
          .attr("x", -NODE_W / 2)
          .attr("y", -NODE_H / 2)
          .attr("width", NODE_W)
          .attr("height", NODE_H)
          .attr("clip-path", "url(#node-clip)")
          .attr("preserveAspectRatio", "xMidYMid slice");
      } else {
        nodeG.append("rect")
          .attr("x", -NODE_W / 2)
          .attr("y", -NODE_H / 2)
          .attr("width", NODE_W)
          .attr("height", NODE_H)
          .attr("rx", 8)
          .attr("fill", `${catColor}15`);
      }

      // Selection ring (sits above base ring)
      const isSelected = selectedImageIds.includes(id);
      nodeG.append("rect")
        .attr("class", "node-ring")
        .attr("x", -NODE_W / 2 - 5)
        .attr("y", -NODE_H / 2 - 5)
        .attr("width", NODE_W + 10)
        .attr("height", NODE_H + 10)
        .attr("rx", 12)
        .attr("fill", "none")
        .attr("stroke", "#58a6ff")
        .attr("stroke-width", isSelected ? 2.5 : 0)
        .attr("opacity", isSelected ? 1 : 0);

      // ID label below node
      nodeG.append("text")
        .attr("y", NODE_H / 2 + 14)
        .attr("text-anchor", "middle")
        .attr("font-size", "9px")
        .attr("font-weight", 500)
        .attr("fill", "rgba(139,148,158,0.6)")
        .text(`#${id}`);

      // Click handler
      nodeG.on("click", () => {
        setSelectedImageIds([id]);
        setFlyToImageId(id);
        onClose();
      });

      nodeG.on("mouseenter", function () {
        const isSelected = selectedImageIdsRef.current.includes(id);
        d3.select(this).select(".node-ring")
          .attr("stroke-width", 2.5)
          .attr("opacity", isSelected ? 1 : 0.6);
        d3.select(this).select(".node-base-ring")
          .attr("stroke-opacity", 0.8);
      });
      nodeG.on("mouseleave", function () {
        const isSelected = selectedImageIdsRef.current.includes(id);
        d3.select(this).select(".node-ring")
          .attr("stroke-width", isSelected ? 2.5 : 0)
          .attr("opacity", isSelected ? 1 : 0);
        d3.select(this).select(".node-base-ring")
          .attr("stroke-opacity", 0.4);
      });
    });

    // Fit tree to viewport with some breathing room
    const pad = 0.9;
    const scale = Math.min(containerW / treeWidth, containerH / treeHeight) * pad;
    const tx = (containerW - treeWidth * scale) / 2;
    const ty = (containerH - treeHeight * scale) / 2;
    g.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }, [isOpen, links, posMap, maxDepth, treeWidth, treeHeight, images, setSelectedImageIds, setFlyToImageId, onClose, selectedImageIds]);

  // Sync selection highlights
  useEffect(() => {
    if (!isOpen || !svgRef.current) return;
    const selectedSet = new Set(selectedImageIds);
    svgRef.current.querySelectorAll(".tree-node[data-node-id]").forEach((el) => {
      const nodeId = Number((el as HTMLElement).getAttribute("data-node-id"));
      const isSelected = selectedSet.has(nodeId);
      const ring = el.querySelector(".node-ring");
      if (ring instanceof SVGElement) {
        ring.setAttribute("stroke-width", String(isSelected ? 2.5 : 0));
        ring.setAttribute("opacity", String(isSelected ? 1 : 0));
      }
    });
  }, [isOpen, selectedImageIds]);

  if (!isOpen) return null;

  return (
    <div className="exploration-tree-overlay" onClick={onClose}>
      <div
        className="exploration-tree-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "88vw", height: "84vh" }}
      >
        <div className="exploration-tree-header">
          <span className="exploration-tree-title">Exploration Tree</span>
          <div className="exploration-tree-legend">
            <span className="legend-chip" style={{ borderColor: CAT_COLORS.dataset }}>
              <span className="legend-dot" style={{ background: CAT_COLORS.dataset }} />
              Reference
            </span>
            <span className="legend-chip" style={{ borderColor: CAT_COLORS.generated }}>
              <span className="legend-dot" style={{ background: CAT_COLORS.generated }} />
              Generated
            </span>
            <span className="legend-chip" style={{ borderColor: CAT_COLORS.agent }}>
              <span className="legend-dot" style={{ background: CAT_COLORS.agent }} />
              AI Agent
            </span>
            <span className="legend-chip selected">
              <span className="legend-dot" style={{ background: '#58a6ff' }} />
              Selected
            </span>
          </div>
          <button className="exploration-tree-close" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div className="exploration-tree-content" data-tour="lineage-tree-content">
          {posMap.size === 0 ? (
            <p className="exploration-tree-empty">No images on canvas.</p>
          ) : (
            <svg
              ref={svgRef}
              className="exploration-tree-svg"
              width="100%"
              height="100%"
            />
          )}
        </div>
      </div>
    </div>
  );
};
