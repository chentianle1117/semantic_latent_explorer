/**
 * Full Exploration Tree Modal
 * Shows the entire exploration tree (all images + parent-child relationships)
 * with a left-to-right hierarchical tree layout. Click node to select and fly-to on canvas.
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

const NODE_R = 36;
const SVG_PAD = 40;
// Layout extent: [breadth, depth] — for left-to-right swap, depth→x (width), breadth→y (height)
const TREE_BREADTH = 900;  // vertical extent (sibling spread)
const TREE_DEPTH = 960;    // horizontal extent (generations left-to-right)

// Distinct palette for lineage branches
const LINEAGE_PALETTE = [
  '#58a6ff', // blue
  '#a855f7', // purple
  '#14b8a6', // teal
  '#f97316', // orange
  '#ec4899', // pink
  '#22c55e', // green
  '#eab308', // amber
  '#ef4444', // red
  '#06b6d4', // cyan
  '#8b5cf6', // violet
];

interface GraphNode {
  id: number;
  image: ImageData | null;
}

interface GraphLink {
  source: number;
  target: number;
  type: "parent" | "child";
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

  const { nodes, links, posMap, lineageColors, treeWidth, treeHeight } = useMemo(() => {
    const imageMap = new Map<number, ImageData>();
    images.forEach((img) => imageMap.set(img.id, img));

    const nodeMap = new Map<number, GraphNode>();
    images.forEach((img) => {
      nodeMap.set(img.id, { id: img.id, image: img });
    });

    const linkSet = new Set<string>();
    const treeLinks: GraphLink[] = [];

    images.forEach((img) => {
      (img.parents || []).forEach((parentId) => {
        if (!nodeMap.has(parentId)) return;
        const key = `${parentId}->${img.id}`;
        if (!linkSet.has(key)) {
          linkSet.add(key);
          treeLinks.push({ source: parentId, target: img.id, type: "parent" });
        }
      });
      (img.children || []).forEach((childId) => {
        if (!nodeMap.has(childId)) return;
        const key = `${img.id}->${childId}`;
        if (!linkSet.has(key)) {
          linkSet.add(key);
          treeLinks.push({ source: img.id, target: childId, type: "child" });
        }
      });
    });

    // chosenParent: at most one incoming parent link per node to avoid batch-sibling clutter
    const parentByTarget = new Map<number, number>();
    treeLinks.forEach((l) => {
      if (l.type === "parent" && !parentByTarget.has(l.target)) {
        parentByTarget.set(l.target, l.source);
      }
    });
    const chosenLinks: GraphLink[] = treeLinks.filter((l) => {
      if (l.type === "child") return true;
      return parentByTarget.get(l.target) === l.source;
    });

    // Build hierarchy for d3.tree: parent -> children
    const childrenByParent = new Map<number, number[]>();
    chosenLinks.forEach((l) => {
      const arr = childrenByParent.get(l.source) || [];
      if (!arr.includes(l.target)) arr.push(l.target);
      childrenByParent.set(l.source, arr);
    });

    const roots = images.filter((img) => (img.parents || []).length === 0).map((img) => img.id);

    const buildHierarchy = (id: number): HierarchyNode => {
      const img = imageMap.get(id);
      const childIds = childrenByParent.get(id) || [];
      return {
        id,
        image: img || null,
        children: childIds.filter((cid) => nodeMap.has(cid)).map(buildHierarchy),
      };
    };

    let rootData: HierarchyNode;
    if (roots.length === 0) {
      const orphans = images.filter((img) => nodeMap.has(img.id));
      rootData = {
        id: -1,
        image: null,
        children: orphans.length > 0 ? [buildHierarchy(orphans[0].id)] : [],
      };
    } else if (roots.length === 1) {
      rootData = buildHierarchy(roots[0]);
    } else {
      rootData = { id: -1, image: null, children: roots.map(buildHierarchy) };
    }

    const hierarchy = d3.hierarchy(rootData, (d) => d.children);
    // Use size() to force wide aspect: [breadth, depth] — swap for left-to-right
    const treeLayout = d3.tree<HierarchyNode>().size([TREE_BREADTH, TREE_DEPTH]);
    treeLayout(hierarchy);

    const posMap = new Map<number, { x: number; y: number }>();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    hierarchy.each((node) => {
      const data = node.data as HierarchyNode;
      if (data.id >= 0) {
        // Swap for left-to-right: x = depth (horizontal), y = breadth (vertical)
        const nx = node.y ?? 0;
        const ny = node.x ?? 0;
        posMap.set(data.id, { x: nx, y: ny });
        minX = Math.min(minX, nx);
        maxX = Math.max(maxX, nx);
        minY = Math.min(minY, ny);
        maxY = Math.max(maxY, ny);
      }
    });

    // Include orphan nodes (not in hierarchy) to the right
    const placedIds = new Set(posMap.keys());
    const levelStep = TREE_DEPTH / 10;
    const siblingStep = TREE_BREADTH / 10;
    images.forEach((img) => {
      if (!placedIds.has(img.id)) {
        const x = Number.isFinite(maxX) ? maxX + levelStep : 0;
        const y = Number.isFinite(maxY) ? maxY + siblingStep : 0;
        posMap.set(img.id, { x, y });
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
      }
    });

    if (!Number.isFinite(minX)) minX = 0;
    if (!Number.isFinite(maxX)) maxX = 0;
    if (!Number.isFinite(minY)) minY = 0;
    if (!Number.isFinite(maxY)) maxY = 0;

    const width = maxX - minX + NODE_R * 2;
    const height = maxY - minY + NODE_R * 2;
    const treeWidth = Math.max(width + SVG_PAD * 2, 320);
    const treeHeight = Math.max(height + SVG_PAD * 2, 200);

    // Shift coordinates so origin is at top-left with padding
    const shiftedPosMap = new Map<number, { x: number; y: number }>();
    posMap.forEach((pos, id) => {
      shiftedPosMap.set(id, {
        x: pos.x - minX + SVG_PAD + NODE_R,
        y: pos.y - minY + SVG_PAD + NODE_R,
      });
    });

    // Compute lineage colors: BFS from each root, assign one palette color per lineage branch
    const lineageColors = new Map<number, string>();
    roots.forEach((rootId, idx) => {
      const color = LINEAGE_PALETTE[idx % LINEAGE_PALETTE.length];
      const bfsQueue = [rootId];
      while (bfsQueue.length > 0) {
        const id = bfsQueue.shift()!;
        if (lineageColors.has(id)) continue;
        lineageColors.set(id, color);
        (childrenByParent.get(id) || []).forEach((cid) => bfsQueue.push(cid));
      }
    });
    // Orphans and unassigned nodes get neutral gray
    images.forEach((img) => {
      if (!lineageColors.has(img.id)) lineageColors.set(img.id, '#8b949e');
    });

    return {
      nodes: Array.from(nodeMap.values()),
      links: chosenLinks,
      posMap: shiftedPosMap,
      lineageColors,
      treeWidth,
      treeHeight,
    };
  }, [images]);

  useEffect(() => {
    if (!isOpen || !svgRef.current || nodes.length === 0) return;

    const svgEl = svgRef.current;
    const width = svgEl.clientWidth || 600;
    const height = svgEl.clientHeight || 400;

    const g = d3.select(svgEl);
    g.selectAll("*").remove();

    const defs = g.append("defs");

    // Per-lineage arrow markers for directed edges
    const usedColors = new Set<string>(lineageColors.values());
    usedColors.forEach((color) => {
      const markerId = `arr-${color.slice(1)}`;
      defs
        .append("marker")
        .attr("id", markerId)
        .attr("markerWidth", 8)
        .attr("markerHeight", 8)
        .attr("refX", 7)
        .attr("refY", 4)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M 0 0 L 8 4 L 0 8 Z")
        .attr("fill", color);
    });

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 5])
      .on("zoom", (event) => {
        g.select("g.zoom-group").attr("transform", event.transform);
      });
    g.call(zoom);

    const zoomGroup = g.append("g").attr("class", "zoom-group");

    // Links — smooth horizontal bezier, colored by source node's lineage
    links.forEach((link) => {
      const s = posMap.get(link.source);
      const t = posMap.get(link.target);
      if (!s || !t) return;
      const color = lineageColors.get(link.source) || '#8b949e';
      const markerId = `arr-${color.slice(1)}`;
      const midX = (s.x + t.x) / 2;
      const pathD = `M ${s.x} ${s.y} C ${midX} ${s.y}, ${midX} ${t.y}, ${t.x} ${t.y}`;
      zoomGroup
        .append("path")
        .attr("d", pathD)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-opacity", 0.5)
        .attr("stroke-width", 2)
        .attr("marker-end", `url(#${markerId})`);
    });

    // Nodes
    nodes.forEach((d) => {
      const pos = posMap.get(d.id);
      if (!pos) return;
      const lineageColor = lineageColors.get(d.id) || '#8b949e';

      const nodeG = zoomGroup
        .append("g")
        .attr("class", "tree-node")
        .attr("data-node-id", String(d.id))
        .attr("transform", `translate(${pos.x},${pos.y})`)
        .style("cursor", "pointer");

      const imgUrl = d.image?.base64_image
        ? `data:image/png;base64,${d.image.base64_image}`
        : null;

      if (imgUrl) {
        nodeG
          .append("image")
          .attr("href", imgUrl)
          .attr("x", -NODE_R)
          .attr("y", -NODE_R)
          .attr("width", NODE_R * 2)
          .attr("height", NODE_R * 2)
          .attr("preserveAspectRatio", "xMidYMid meet");
      } else {
        // Fallback placeholder with lineage tint
        nodeG
          .append("rect")
          .attr("x", -NODE_R)
          .attr("y", -NODE_R)
          .attr("width", NODE_R * 2)
          .attr("height", NODE_R * 2)
          .attr("rx", 6)
          .attr("fill", `${lineageColor}1a`);
      }

      // Base lineage-colored border (always visible)
      nodeG
        .append("rect")
        .attr("class", "node-base-ring")
        .attr("x", -NODE_R - 2)
        .attr("y", -NODE_R - 2)
        .attr("width", NODE_R * 2 + 4)
        .attr("height", NODE_R * 2 + 4)
        .attr("rx", 8)
        .attr("fill", "none")
        .attr("stroke", lineageColor)
        .attr("stroke-width", 1.5)
        .attr("stroke-opacity", 0.6);

      const isSelected = selectedImageIds.includes(d.id);
      // Selection ring (cyan, sits above lineage ring)
      nodeG
        .append("rect")
        .attr("class", "node-ring")
        .attr("x", -NODE_R - 4)
        .attr("y", -NODE_R - 4)
        .attr("width", NODE_R * 2 + 8)
        .attr("height", NODE_R * 2 + 8)
        .attr("rx", 10)
        .attr("fill", "none")
        .attr("stroke", "#58a6ff")
        .attr("stroke-width", isSelected ? 2.5 : 0)
        .attr("opacity", isSelected ? 1 : 0);

      nodeG
        .append("text")
        .attr("y", NODE_R + 15)
        .attr("text-anchor", "middle")
        .attr("font-size", "11px")
        .attr("fill", lineageColor)
        .attr("fill-opacity", 0.75)
        .text(`#${d.id}`);

      nodeG.on("click", () => {
        setSelectedImageIds([d.id]);
        setFlyToImageId(d.id);
        onClose();
      });

      nodeG.on("mouseenter", function () {
        const nodeId = d.id;
        const isSelected = selectedImageIdsRef.current.includes(nodeId);
        const ring = d3.select(this).select(".node-ring");
        ring.attr("stroke", "#58a6ff").attr("stroke-width", 2.5);
        ring.attr("opacity", isSelected ? 1 : 0.6);
      });
      nodeG.on("mouseleave", function () {
        const nodeId = d.id;
        const isSelected = selectedImageIdsRef.current.includes(nodeId);
        d3.select(this)
          .select(".node-ring")
          .attr("stroke", isSelected ? "#58a6ff" : "transparent")
          .attr("stroke-width", isSelected ? 2.5 : 0)
          .attr("opacity", isSelected ? 1 : 0);
      });
    });

    // Fit tree to viewport: scale to fill extent
    const scale = Math.min(width / treeWidth, height / treeHeight);
    const tx = (width - treeWidth * scale) / 2;
    const ty = (height - treeHeight * scale) / 2;
    g.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }, [isOpen, nodes, links, posMap, lineageColors, treeWidth, treeHeight, setSelectedImageIds, setFlyToImageId, onClose, selectedImageIds]);

  // Sync selection highlights whenever selectedImageIds changes (e.g. from canvas or inspector)
  useEffect(() => {
    if (!isOpen || !svgRef.current) return;
    const selectedSet = new Set(selectedImageIds);
    svgRef.current.querySelectorAll(".tree-node[data-node-id]").forEach((el) => {
      const nodeId = Number((el as HTMLElement).getAttribute("data-node-id"));
      const isSelected = selectedSet.has(nodeId);
      const ring = el.querySelector(".node-ring");
      if (ring instanceof SVGElement) {
        ring.setAttribute("stroke", isSelected ? "#58a6ff" : "transparent");
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
        style={{ width: "85vw", height: "82vh" }}
      >
        <div className="exploration-tree-header">
          <span className="exploration-tree-title">Exploration Tree</span>
          <button className="exploration-tree-close" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        {links.length > 0 && (
          <div className="exploration-tree-legend">
            <span className="legend-item">Colors = generation lineage</span>
            <span className="legend-item selected">● selected</span>
          </div>
        )}
        <div className="exploration-tree-content">
          {nodes.length === 0 ? (
            <p className="exploration-tree-empty">No images on canvas.</p>
          ) : (
            <svg
              ref={svgRef}
              className="exploration-tree-svg"
              width="100%"
              height="100%"
              viewBox={`0 0 ${Math.max(treeWidth, 400)} ${Math.max(treeHeight, 300)}`}
              preserveAspectRatio="xMidYMid meet"
            />
          )}
        </div>
      </div>
    </div>
  );
};
