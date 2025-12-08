import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { ImageData, HistoryGroup } from '../../types';
import './ExplorationMinimap.css';

interface ExplorationMinimapProps {
  images: ImageData[];
  historyGroups: HistoryGroup[];
  onImageClick?: (id: number) => void;
  onExpandClick?: () => void;
}

interface TreeNode {
  id: number;
  children: TreeNode[];
  depth: number;
}

export const ExplorationMinimap: React.FC<ExplorationMinimapProps> = ({
  images,
  historyGroups,
  onImageClick,
  onExpandClick
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  // Build tree structure from image lineage
  const buildTree = (): { roots: TreeNode[], maxDepth: number, maxBreadth: number } => {
    const nodeMap = new Map<number, TreeNode>();
    
    // Create all nodes first
    images.forEach(img => {
      nodeMap.set(img.id, { id: img.id, children: [], depth: 0 });
    });

    // Build parent-child relationships
    const roots: TreeNode[] = [];
    
    // Sort images by ID to ensure parents are processed before children
    const sortedImages = [...images].sort((a, b) => a.id - b.id);
    
    sortedImages.forEach(img => {
      const node = nodeMap.get(img.id);
      if (!node) return;
      
      // Check if this image has parents (use first parent for tree hierarchy)
      const hasParent = img.parents && img.parents.length > 0;
      const parentId = hasParent ? img.parents[0] : null;
      
      if (parentId !== null && nodeMap.has(parentId)) {
        const parent = nodeMap.get(parentId)!;
        parent.children.push(node);
        node.depth = parent.depth + 1;
      } else {
        // No parent, this is a root node
        roots.push(node);
      }
    });

    // Recalculate depths to ensure correctness
    const updateDepths = (node: TreeNode, depth: number) => {
      node.depth = depth;
      node.children.forEach(child => updateDepths(child, depth + 1));
    };
    roots.forEach(root => updateDepths(root, 0));

    // Calculate max depth
    let maxDepth = 0;
    const traverse = (node: TreeNode) => {
      maxDepth = Math.max(maxDepth, node.depth);
      node.children.forEach(traverse);
    };
    roots.forEach(traverse);

    // Calculate max breadth (max children at any level)
    const breadthByLevel = new Map<number, number>();
    const countBreadth = (node: TreeNode) => {
      breadthByLevel.set(node.depth, (breadthByLevel.get(node.depth) || 0) + 1);
      node.children.forEach(countBreadth);
    };
    roots.forEach(countBreadth);
    const maxBreadth = Math.max(...Array.from(breadthByLevel.values()), 1);

    return { roots, maxDepth, maxBreadth };
  };

  useEffect(() => {
    if (!svgRef.current || images.length === 0) return;

    const { roots, maxDepth, maxBreadth } = buildTree();

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = 250;
    const height = 140;
    const margin = { top: 15, right: 20, bottom: 10, left: 20 };
    const nodeRadius = 3;
    
    // Calculate available space
    const availableHeight = height - margin.top - margin.bottom;
    const availableWidth = width - margin.left - margin.right;
    
    // Adjust spacing based on tree size
    const verticalSpacing = maxDepth > 0 ? availableHeight / (maxDepth + 1) : availableHeight;
    const rootSpacing = roots.length > 0 ? Math.min(availableWidth / roots.length, 60) : availableWidth;

    const g = svg
      .append('g')
      .attr('transform', `translate(${width / 2}, ${margin.top})`);

    // Create D3 hierarchy
    const drawNode = (node: TreeNode, x: number, y: number, horizontalSpacing: number, depth: number) => {
      // Ensure we're within bounds
      const clampedX = Math.max(-availableWidth / 2, Math.min(availableWidth / 2, x));
      const clampedY = Math.max(0, Math.min(availableHeight, y));
      
      // Draw links to children
      node.children.forEach((child, i) => {
        const childX = x + (i - node.children.length / 2 + 0.5) * horizontalSpacing;
        const childY = y + verticalSpacing;
        const clampedChildX = Math.max(-availableWidth / 2, Math.min(availableWidth / 2, childX));
        const clampedChildY = Math.max(0, Math.min(availableHeight, childY));

        g.append('line')
          .attr('x1', clampedX)
          .attr('y1', clampedY)
          .attr('x2', clampedChildX)
          .attr('y2', clampedChildY)
          .attr('stroke', '#30363d')
          .attr('stroke-width', 1)
          .attr('opacity', 0.5);

        drawNode(child, childX, childY, horizontalSpacing * 0.65, depth + 1);
      });

      // Color nodes based on depth to show hierarchy
      const depthColors = [
        '#58a6ff', // Root (depth 0) - bright blue
        '#388bfd', // Depth 1 - medium blue
        '#7d8fff', // Depth 2 - purple-blue
        '#b392f0', // Depth 3 - purple
        '#f778ba', // Depth 4+ - pink
      ];
      const colorIndex = Math.min(depth, depthColors.length - 1);
      const fillColor = depthColors[colorIndex];
      const strokeColor = node.children.length > 0 ? fillColor : '#6e7681';
      
      // Draw node
      g.append('circle')
        .attr('cx', clampedX)
        .attr('cy', clampedY)
        .attr('r', nodeRadius)
        .attr('fill', fillColor)
        .attr('stroke', strokeColor)
        .attr('stroke-width', 1)
        .attr('opacity', 0.9)
        .style('cursor', 'pointer')
        .on('click', (event) => {
          event.stopPropagation();
          onImageClick?.(node.id);
        });
    };

    // Draw each root tree
    roots.forEach((root, i) => {
      const x = (i - roots.length / 2 + 0.5) * rootSpacing;
      drawNode(root, x, 0, rootSpacing * 0.7, 0);
    });

  }, [images, historyGroups, onImageClick]);

  const { maxDepth, maxBreadth } = images.length > 0 ? buildTree() : { maxDepth: 0, maxBreadth: 0 };

  return (
    <div className="exploration-minimap">
      <div className="minimap-header">
        <span className="minimap-title">🗺️ Tree</span>
        <button
          className="expand-tree-btn-header"
          onClick={onExpandClick}
          title="Expand tree view"
        >
          ⤢
        </button>
      </div>
      <div className="minimap-body">
        <svg ref={svgRef} className="minimap-svg" width="250" height="140" viewBox="0 0 250 140" preserveAspectRatio="xMidYMid meet" />
      </div>
      <div className="minimap-footer">
        <div className="minimap-stats">
          <span title="Maximum depth (generations)">D:{maxDepth}</span>
          <span title="Maximum breadth (parallel branches)">B:{maxBreadth}</span>
          <span title="Total images">N:{images.length}</span>
        </div>
      </div>
    </div>
  );
};

