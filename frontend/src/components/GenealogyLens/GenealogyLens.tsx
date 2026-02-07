import React, { useMemo } from "react";
import { useAppStore } from "../../store/appStore";
import type { ImageData } from "../../types";
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

const NODE_W = 56;
const NODE_H = 56;
const LEVEL_GAP = 88;
const NODE_GAP = 12;
const SVG_PAD = 16;

export const GenealogyLens: React.FC<GenealogyLensProps> = ({ selectedImageIds }) => {
  const images = useAppStore((s) => s.images);
  const setSelectedImageIds = useAppStore((s) => s.setSelectedImageIds);
  const setFlyToImageId = useAppStore((s) => s.setFlyToImageId);

  const { nodes, links, posMap, svgWidth, svgHeight } = useMemo(() => {
    const imageMap = new Map<number, ImageData>();
    images.forEach((img) => imageMap.set(img.id, img));

    if (selectedImageIds.length === 0) {
      return { nodes: new Map(), links: [] as { sourceId: number; targetId: number }[], posMap: new Map(), svgWidth: 0, svgHeight: 0 };
    }

    const nodeMap = new Map<number, NodeInfo>();
    const links: { sourceId: number; targetId: number }[] = [];
    const queue: { id: number; level: number }[] = selectedImageIds.map((id) => ({ id, level: 0 }));

    for (const id of selectedImageIds) {
      const img = imageMap.get(id);
      if (img) nodeMap.set(id, { id, image: img, level: 0, parentIds: [], childIds: [] });
    }

    // One level up, one level down only (immediate parents and children)
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
      if (img.children && level < 1) {
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

    // Each node gets at most ONE incoming link per direction (parent->child, avoid duplicates)
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

    const levelMap = new Map<number, NodeInfo[]>();
    nodeMap.forEach((n) => {
      const arr = levelMap.get(n.level) || [];
      arr.push(n);
      levelMap.set(n.level, arr);
    });

    const levelKeys = Array.from(levelMap.keys()).sort((a, b) => a - b);
    const posMap = new Map<number, { x: number; y: number }>();

    // Order nodes within each level by connected-node position to reduce edge crossings
    levelKeys.forEach((level, levelIdx) => {
      const nodesInLevel = levelMap.get(level) || [];
      const sorted = nodesInLevel.slice().sort((a, b) => {
        const aRef = a.parentIds[0] ?? a.childIds[0];
        const bRef = b.parentIds[0] ?? b.childIds[0];
        const ax = aRef != null ? posMap.get(aRef)?.x ?? 0 : 0;
        const bx = bRef != null ? posMap.get(bRef)?.x ?? 0 : 0;
        return ax - bx;
      });
      const totalW = sorted.length * (NODE_W + NODE_GAP) - NODE_GAP;
      const startX = SVG_PAD;
      sorted.forEach((node, i) => {
        posMap.set(node.id, {
          x: startX + i * (NODE_W + NODE_GAP) + NODE_W / 2,
          y: SVG_PAD + levelIdx * LEVEL_GAP + NODE_H / 2,
        });
      });
    });

    const maxW = Math.max(
      ...levelKeys.map((k) => {
        const arr = levelMap.get(k) || [];
        return arr.length * (NODE_W + NODE_GAP) - NODE_GAP;
      }),
      0
    );
    const svgWidth = maxW + SVG_PAD * 2;
    const svgHeight = levelKeys.length * LEVEL_GAP + SVG_PAD * 2;

    return {
      nodes: nodeMap,
      links: treeLinks,
      posMap,
      svgWidth: Math.max(svgWidth, 200),
      svgHeight: Math.max(svgHeight, 140),
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
    setSelectedImageIds([nodeId]);
    setFlyToImageId(nodeId);
  };

  const hasParentLinks = links.some((l) => l.type === "parent");
  const hasChildLinks = links.some((l) => l.type === "child");

  return (
    <div className="genealogy-lens">
      {(hasParentLinks || hasChildLinks) && (
        <div className="genealogy-legend">
          {hasParentLinks && <span className="legend-item parent">↑ parent</span>}
          {hasChildLinks && <span className="legend-item child">↓ child</span>}
        </div>
      )}
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <marker id="arrow-parent" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 Z" fill="#3fb950" />
          </marker>
          <marker id="arrow-child" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 Z" fill="#d29922" />
          </marker>
        </defs>
        {links.map((link, i) => {
          const s = posMap.get(link.sourceId);
          const t = posMap.get(link.targetId);
          if (!s || !t) return null;
          const midY = (s.y + t.y) / 2;
          const pathD = `M ${s.x} ${s.y} C ${s.x} ${midY}, ${t.x} ${midY}, ${t.x} ${t.y}`;
          const isParent = link.type === "parent";
          const stroke = isParent ? "#3fb950" : "#d29922";
          const markerEnd = isParent ? "url(#arrow-parent)" : "url(#arrow-child)";
          return (
            <path
              key={i}
              d={pathD}
              fill="none"
              stroke={stroke}
              strokeWidth={1.5}
              opacity={0.7}
              markerEnd={markerEnd}
            />
          );
        })}

        {Array.from(nodes.values()).map((node) => {
          const pos = posMap.get(node.id);
          if (!pos) return null;
          const isSelected = selectedImageIds.includes(node.id);
          const imgUrl = node.image?.base64_image
            ? `data:image/png;base64,${node.image.base64_image}`
            : null;

          return (
            <g
              key={node.id}
              className={`genealogy-node ${isSelected ? "selected" : ""}`}
              onClick={() => handleNodeClick(node.id)}
              style={{ cursor: "pointer" }}
            >
              {imgUrl && (
                <>
                  <image
                    href={imgUrl}
                    x={pos.x - NODE_W / 2}
                    y={pos.y - NODE_H / 2}
                    width={NODE_W}
                    height={NODE_H}
                    preserveAspectRatio="xMidYMid meet"
                  />
                  {isSelected && (
                    <rect
                      x={pos.x - NODE_W / 2 - 3}
                      y={pos.y - NODE_H / 2 - 3}
                      width={NODE_W + 6}
                      height={NODE_H + 6}
                      rx={8}
                      fill="none"
                      stroke="#58a6ff"
                      strokeWidth={2}
                      opacity={0.7}
                    />
                  )}
                </>
              )}
              <text x={pos.x} y={pos.y + NODE_H / 2 + 10} className="node-label">
                #{node.id}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
