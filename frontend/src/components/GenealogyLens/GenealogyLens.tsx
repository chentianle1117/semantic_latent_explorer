import React, { useMemo } from "react";
import { useAppStore } from "../../store/appStore";
import type { ImageData } from "../../types";
import { apiClient } from "../../api/client";
import "./GenealogyLens.css";

interface GenealogyLensProps {
  selectedImageIds: number[];
}

interface NodeInfo {
  id: number;
  image: ImageData | null;
  level: number;
  parentIds: number[];
  childIds: number[];
}

const NODE_SIZE = 48;
const LEVEL_GAP_V = 72;
const NODE_GAP_H = 16;
const SVG_PAD = 20;

export const GenealogyLens: React.FC<GenealogyLensProps> = ({ selectedImageIds }) => {
  const images = useAppStore((s) => s.images);
  const setSelectedImageIds = useAppStore((s) => s.setSelectedImageIds);
  const setFlyToImageId = useAppStore((s) => s.setFlyToImageId);

  const { nodes, links, posMap, svgWidth, svgHeight } = useMemo(() => {
    const imageMap = new Map<number, ImageData>();
    images.forEach((img) => imageMap.set(img.id, img));

    if (selectedImageIds.length === 0) {
      return { nodes: new Map<number, NodeInfo>(), links: [] as { sourceId: number; targetId: number; type: "parent" | "child" }[], posMap: new Map<number, { x: number; y: number }>(), svgWidth: 0, svgHeight: 0 };
    }

    const nodeMap = new Map<number, NodeInfo>();
    const queue: { id: number; level: number }[] = selectedImageIds.map((id) => ({ id, level: 0 }));

    for (const id of selectedImageIds) {
      const img = imageMap.get(id);
      if (img) nodeMap.set(id, { id, image: img, level: 0, parentIds: [], childIds: [] });
    }

    // BFS: parents at level -1 (top), selected at 0 (middle), children at +1 (bottom)
    while (queue.length > 0) {
      const { id: imgId, level } = queue.shift()!;
      const img = imageMap.get(imgId);
      if (!img) continue;

      if (img.parents && level > -1) {
        for (const parentId of img.parents) {
          const node = nodeMap.get(imgId);
          if (node && !node.parentIds.includes(parentId)) node.parentIds.push(parentId);
          if (!nodeMap.has(parentId)) {
            const parentImg = imageMap.get(parentId);
            nodeMap.set(parentId, {
              id: parentId,
              image: parentImg || null,
              level: -1,
              parentIds: [],
              childIds: [imgId],
            });
          } else {
            const parentNode = nodeMap.get(parentId)!;
            if (!parentNode.childIds.includes(imgId)) parentNode.childIds.push(imgId);
          }
        }
      }
      if (img.children && level === 0) {
        for (const childId of img.children) {
          const node = nodeMap.get(imgId);
          if (node && !node.childIds.includes(childId)) node.childIds.push(childId);
          if (!nodeMap.has(childId)) {
            const childImg = imageMap.get(childId);
            nodeMap.set(childId, {
              id: childId,
              image: childImg || null,
              level: 1,
              parentIds: [imgId],
              childIds: [],
            });
          } else {
            const childNode = nodeMap.get(childId)!;
            if (!childNode.parentIds.includes(imgId)) childNode.parentIds.push(imgId);
          }
        }
      }
    }

    // Build tree links
    const selectedSet = new Set(selectedImageIds);
    const treeLinks: { sourceId: number; targetId: number; type: "parent" | "child" }[] = [];
    const seen = new Set<string>();

    for (const node of nodeMap.values()) {
      let parents = node.parentIds;
      if (parents.length === 0) {
        const img = imageMap.get(node.id);
        parents = img?.parents?.filter((p) => nodeMap.has(p)) ?? [];
      }
      if (parents.length === 0) continue;
      const chosenParent = parents.find((p) => selectedSet.has(p)) ?? parents[0];
      const key = `${chosenParent}->${node.id}`;
      if (!seen.has(key) && nodeMap.has(chosenParent)) {
        seen.add(key);
        const sourceNode = nodeMap.get(chosenParent)!;
        const linkType: "parent" | "child" = sourceNode.level === -1 ? "parent" : "child";
        treeLinks.push({ sourceId: chosenParent, targetId: node.id, type: linkType });
      }
    }

    if (nodeMap.size <= 1) {
      return {
        nodes: nodeMap,
        links: treeLinks,
        posMap: new Map<number, { x: number; y: number }>(),
        svgWidth: 120,
        svgHeight: 60,
      };
    }

    // Top-down layout: parents at top, selected middle, children bottom
    const levelMap = new Map<number, NodeInfo[]>();
    nodeMap.forEach((n) => {
      const arr = levelMap.get(n.level) || [];
      arr.push(n);
      levelMap.set(n.level, arr);
    });

    const levelKeys = Array.from(levelMap.keys()).sort((a, b) => a - b);
    const posMap = new Map<number, { x: number; y: number }>();

    // First pass: position nodes per level
    levelKeys.forEach((level, levelIdx) => {
      const nodesInLevel = levelMap.get(level) || [];
      // Sort by parent position to reduce crossings
      const sorted = nodesInLevel.slice().sort((a, b) => {
        const aRef = a.parentIds[0] ?? a.childIds[0];
        const bRef = b.parentIds[0] ?? b.childIds[0];
        const ax = aRef != null ? posMap.get(aRef)?.x ?? 0 : 0;
        const bx = bRef != null ? posMap.get(bRef)?.x ?? 0 : 0;
        return ax - bx;
      });
      const totalW = sorted.length * (NODE_SIZE + NODE_GAP_H) - NODE_GAP_H;
      const startX = SVG_PAD;
      sorted.forEach((node, i) => {
        posMap.set(node.id, {
          x: startX + i * (NODE_SIZE + NODE_GAP_H) + NODE_SIZE / 2,
          y: SVG_PAD + levelIdx * LEVEL_GAP_V + NODE_SIZE / 2,
        });
      });
    });

    const maxW = Math.max(
      ...levelKeys.map((k) => {
        const arr = levelMap.get(k) || [];
        return arr.length * (NODE_SIZE + NODE_GAP_H) - NODE_GAP_H;
      }),
      0
    );
    const svgWidth = maxW + SVG_PAD * 2;
    const svgHeight = levelKeys.length * LEVEL_GAP_V + SVG_PAD;

    return {
      nodes: nodeMap,
      links: treeLinks,
      posMap,
      svgWidth: Math.max(svgWidth, 160),
      svgHeight: Math.max(svgHeight, 100),
    };
  }, [images, selectedImageIds]);

  if (nodes.size <= 1) {
    return (
      <div className="genealogy-lens">
        <p className="genealogy-empty">No parent/child relationships found.</p>
      </div>
    );
  }

  const handleNodeClick = (nodeId: number) => {
    const fromIds = selectedImageIds;
    const clickedNode = nodes.get(nodeId);
    const level = clickedNode ? (clickedNode.level < 0 ? 'parent' : clickedNode.level > 0 ? 'child' : 'selected') : 'unknown';
    apiClient.logEvent('genealogy_navigate', { clickedNodeId: nodeId, fromNodeIds: fromIds, nodeLevel: level });
    setSelectedImageIds([nodeId]);
    setFlyToImageId(nodeId);
  };

  return (
    <div className="genealogy-lens">
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Glow filters for nodes */}
          <filter id="gen-glow-selected" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#00d2ff" floodOpacity="0.8" />
          </filter>
          <filter id="gen-glow-parent" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#3fb950" floodOpacity="0.7" />
          </filter>
          <filter id="gen-glow-child" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#d29922" floodOpacity="0.7" />
          </filter>
          {/* Per-node circular clips generated dynamically */}
        </defs>

        {/* Connection lines */}
        {links.map((link, i) => {
          const s = posMap.get(link.sourceId);
          const t = posMap.get(link.targetId);
          if (!s || !t) return null;
          const isParent = link.type === "parent";
          const stroke = isParent ? "#3fb950" : "#d29922";
          return (
            <line
              key={i}
              x1={s.x} y1={s.y + NODE_SIZE / 2 - 4}
              x2={t.x} y2={t.y - NODE_SIZE / 2 + 4}
              stroke={stroke}
              strokeWidth={1.5}
              opacity={0.5}
            />
          );
        })}

        {/* Nodes */}
        {Array.from(nodes.values()).map((node) => {
          const pos = posMap.get(node.id);
          if (!pos) return null;
          const isSelected = selectedImageIds.includes(node.id);
          const isParentNode = node.level === -1;
          const isChildNode = node.level === 1;
          const imgUrl = node.image?.base64_image
            ? `data:image/png;base64,${node.image.base64_image}`
            : null;

          const glowFilter = isSelected
            ? "url(#gen-glow-selected)"
            : isParentNode
            ? "url(#gen-glow-parent)"
            : isChildNode
            ? "url(#gen-glow-child)"
            : undefined;

          return (
            <g
              key={node.id}
              className="genealogy-node"
              onClick={() => handleNodeClick(node.id)}
              style={{ cursor: "pointer" }}
              filter={glowFilter}
            >
              {imgUrl && (
                <image
                  href={imgUrl}
                  x={pos.x - NODE_SIZE / 2 + 2}
                  y={pos.y - NODE_SIZE / 2 + 2}
                  width={NODE_SIZE - 4}
                  height={NODE_SIZE - 4}
                  preserveAspectRatio="xMidYMid meet"
                />
              )}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={NODE_SIZE / 2 - 2}
                fill="none"
                stroke={isSelected ? "#00d2ff" : isParentNode ? "#3fb95060" : isChildNode ? "#d2992260" : "#30363d"}
                strokeWidth={isSelected ? 2 : 1}
              />
              <text x={pos.x} y={pos.y + NODE_SIZE / 2 + 12} className="node-label">
                #{node.id}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
