import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { useAppStore } from '../../store/appStore';
import type { ImageData } from '../../types';
import './ExplorationTreeModal.css';

interface ExplorationTreeModalProps {
  images: ImageData[];
  onClose: () => void;
  onNodeClick: (id: number) => void;
  onNodeHover: (id: number | null) => void;
}

interface Position {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

interface TreeNode extends d3.HierarchyNode<NodeData> {
  x: number;
  y: number;
}

interface NodeData {
  id: number;
  prompt: string;
  method: string;
  timestamp: string;
  children: NodeData[];
  depth: number;
}

export const ExplorationTreeModal: React.FC<ExplorationTreeModalProps> = ({
  images,
  onClose,
  onNodeClick,
  onNodeHover
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);
  const hoveredImageId = useAppStore((state) => state.hoveredImageId);
  const selectedImageIds = useAppStore((state) => state.selectedImageIds);
  const [panelSize, setPanelSize] = useState<Size>({ width: 900, height: 650 });
  const [panelPosition, setPanelPosition] = useState<Position>({ x: window.innerWidth - 920, y: window.innerHeight - 670 });
  const [normalSize, setNormalSize] = useState<Size>({ width: 900, height: 650 });
  const [normalPosition, setNormalPosition] = useState<Position>({ x: window.innerWidth - 920, y: window.innerHeight - 670 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 });
  const zoomTransformRef = useRef<d3.ZoomTransform | null>(null);
  const [isFirstRender, setIsFirstRender] = useState(true);

  // Build hierarchical tree structure
  const buildTree = (): NodeData[] => {
    const nodeMap = new Map<number, NodeData>();
    
    // Create all nodes first
    images.forEach(img => {
      nodeMap.set(img.id, {
        id: img.id,
        prompt: img.prompt,
        method: img.generation_method,
        timestamp: img.timestamp,
        children: [],
        depth: 0
      });
    });

    // Build parent-child relationships
    const roots: NodeData[] = [];
    const sortedImages = [...images].sort((a, b) => a.id - b.id);
    
    // First pass: establish parent-child links
    sortedImages.forEach(img => {
      const node = nodeMap.get(img.id);
      if (!node) return;
      
      const hasParent = img.parents && img.parents.length > 0;
      const parentId = hasParent ? img.parents[0] : null;
      
      if (parentId !== null && nodeMap.has(parentId)) {
        const parent = nodeMap.get(parentId)!;
        // Avoid duplicate children
        if (!parent.children.find(c => c.id === node.id)) {
          parent.children.push(node);
        }
      } else {
        // No parent or parent not found, this is a root
        roots.push(node);
      }
    });

    // Second pass: recursively calculate depths
    const calculateDepth = (node: NodeData, depth: number = 0): void => {
      node.depth = depth;
      node.children.forEach(child => calculateDepth(child, depth + 1));
    };
    
    roots.forEach(root => calculateDepth(root, 0));

    return roots;
  };

  useEffect(() => {
    if (!svgRef.current || images.length === 0 || isMinimized) return;

    const roots = buildTree();
    if (roots.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = panelSize.width;
    const height = panelSize.height - 80; // Account for header/footer
    const margin = { top: 40, right: 40, bottom: 30, left: 40 };

    // Add zoom/pan behavior with reduced sensitivity
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 2])
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString());
        zoomTransformRef.current = event.transform;
      });

    svg.call(zoom);

    // Create main group for pan/zoom
    const g = svg.append('g');

    const availableWidth = width - margin.left - margin.right;
    const availableHeight = height - margin.top - margin.bottom;

    // Calculate spacing for multiple roots
    const rootWidth = Math.max(400, availableWidth / roots.length);
    const imageSize = 80; // Size of shoe thumbnails - increased for better visibility
    
    // Draw each root tree
    roots.forEach((rootData, rootIndex) => {
      const root = d3.hierarchy(rootData);
      
      // Create tree layout with better spacing
      const treeLayout = d3.tree<NodeData>()
        .size([rootWidth * 0.85, availableHeight * 0.9])
        .separation((a, b) => {
          if (a.parent !== b.parent) return 2;
          return 1.8;
        });
      
      const treeData = treeLayout(root) as TreeNode;

      // Offset for multiple roots
      const xOffset = rootIndex * rootWidth + margin.left + (rootWidth * 0.1);
      const yOffset = margin.top;

      // Draw links with more prominent styling
      g.selectAll(`.link-${rootIndex}`)
        .data(treeData.links())
        .enter()
        .append('path')
        .attr('class', 'tree-link')
        .attr('d', d3.linkVertical<any, TreeNode>()
          .x(d => d.x + xOffset)
          .y(d => d.y + yOffset))
        .attr('fill', 'none')
        .attr('stroke', '#58a6ff')
        .attr('stroke-width', 3)
        .attr('opacity', 0.4);

      // Draw nodes with images
      const nodes = g.selectAll(`.node-${rootIndex}`)
        .data(treeData.descendants())
        .enter()
        .append('g')
        .attr('class', 'tree-node-group')
        .attr('transform', d => `translate(${d.x + xOffset}, ${d.y + yOffset})`)
        .style('cursor', 'pointer')
        .on('click', (event, d) => {
          event.stopPropagation();

          // Sync with global selection state (supports Ctrl+click for multi-select)
          const ctrlKey = event.ctrlKey || event.metaKey;
          useAppStore.getState().toggleImageSelection(d.data.id, ctrlKey);

          // Also update local selected node for visual feedback
          if (!ctrlKey) {
            setSelectedNode(d.data.id);
          }

          // Keep the original callback for closing modal if needed
          if (!ctrlKey) {
            onNodeClick(d.data.id);
          }
        })
        .on('mouseenter', (event, d) => {
          setHoveredNode(d.data.id);
          onNodeHover(d.data.id);
          // Highlight this node
          d3.select(event.currentTarget)
            .select('rect')
            .attr('stroke', '#58a6ff')
            .attr('stroke-width', 3);
        })
        .on('mouseleave', (event, d) => {
          setHoveredNode(null);
          onNodeHover(null);
          // Remove highlight if not selected (check global selection)
          const currentSelectedIds = useAppStore.getState().selectedImageIds;
          if (!currentSelectedIds.includes(d.data.id)) {
            d3.select(event.currentTarget)
              .select('rect')
              .attr('stroke', '#30363d')
              .attr('stroke-width', 1);
          } else {
            // Keep selection highlight (red)
            d3.select(event.currentTarget)
              .select('rect')
              .attr('stroke', '#ff0000')
              .attr('stroke-width', 3);
          }
        });

      // Add background rectangle
      const currentSelectedIds = useAppStore.getState().selectedImageIds;
      nodes.append('rect')
        .attr('x', -imageSize / 2)
        .attr('y', -imageSize / 2)
        .attr('width', imageSize)
        .attr('height', imageSize)
        .attr('fill', '#21262d')
        .attr('stroke', d => currentSelectedIds.includes(d.data.id) ? '#ff0000' : '#30363d')
        .attr('stroke-width', d => currentSelectedIds.includes(d.data.id) ? 3 : 1)
        .attr('rx', 4);

      // Add shoe images
      nodes.each(function(d) {
        const nodeG = d3.select(this);
        const img = images.find(i => i.id === d.data.id);
        if (img) {
          nodeG.append('image')
            .attr('xlink:href', `data:image/png;base64,${img.base64_image}`)
            .attr('x', -imageSize / 2 + 2)
            .attr('y', -imageSize / 2 + 2)
            .attr('width', imageSize - 4)
            .attr('height', imageSize - 4)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .style('pointer-events', 'none');
        }
      });

      // Add ID label below
      nodes.append('text')
        .attr('dy', imageSize / 2 + 12)
        .attr('text-anchor', 'middle')
        .style('fill', '#8b949e')
        .style('font-size', '9px')
        .style('font-weight', '600')
        .style('pointer-events', 'none')
        .text(d => `#${d.data.id}`);

      // Method badge with better styling
      const getMethodLabel = (method: string): { text: string, color: string } => {
        switch (method) {
          case 'batch': return { text: 'BAT', color: '#bc8cff' };
          case 'reference': return { text: 'REF', color: '#58a6ff' };
          case 'interpolation': return { text: 'INT', color: '#f778ba' };
          case 'auto-variation': return { text: 'VAR', color: '#3fb950' };
          case 'text_to_image': return { text: 'TXT', color: '#d29922' };
          default: return { text: 'IMG', color: '#8b949e' };
        }
      };

      // Add method badge background
      nodes.each(function(d) {
        const nodeG = d3.select(this);
        const methodInfo = getMethodLabel(d.data.method);
        const badgeY = -imageSize / 2 - 12;

        // Badge background rect
        nodeG.append('rect')
          .attr('x', -18)
          .attr('y', badgeY - 8)
          .attr('width', 36)
          .attr('height', 16)
          .attr('rx', 3)
          .attr('fill', methodInfo.color)
          .attr('opacity', 0.9)
          .style('pointer-events', 'none');

        // Badge text
        nodeG.append('text')
          .attr('y', badgeY)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .style('fill', '#ffffff')
          .style('font-size', '10px')
          .style('font-weight', '700')
          .style('pointer-events', 'none')
          .text(methodInfo.text);
      });

      // Tooltips
      nodes.append('title')
        .text(d => `ID: ${d.data.id}\nMethod: ${d.data.method}\nPrompt: ${d.data.prompt}\nGenerated: ${new Date(d.data.timestamp).toLocaleString()}`);
    });

    // Draw additional parent connections (for images with multiple parents like interpolation)
    // This shows cross-branch connections that aren't part of the main tree hierarchy
    const nodePositions = new Map<number, { x: number, y: number }>();

    // Collect all node positions across all roots
    roots.forEach((rootData, rootIndex) => {
      const root = d3.hierarchy(rootData);
      const treeLayout = d3.tree<NodeData>()
        .size([rootWidth * 0.85, availableHeight * 0.9])
        .separation((a, b) => {
          if (a.parent !== b.parent) return 2;
          return 1.8;
        });

      const treeData = treeLayout(root) as TreeNode;
      const xOffset = rootIndex * rootWidth + margin.left + (rootWidth * 0.1);
      const yOffset = margin.top;

      treeData.descendants().forEach(node => {
        nodePositions.set(node.data.id, {
          x: node.x + xOffset,
          y: node.y + yOffset
        });
      });
    });

    // Draw additional parent connections (parents beyond the first one)
    images.forEach(img => {
      if (img.parents && img.parents.length > 1) {
        const childPos = nodePositions.get(img.id);
        if (!childPos) return;

        // Skip the first parent (already drawn in tree hierarchy)
        img.parents.slice(1).forEach(parentId => {
          const parentPos = nodePositions.get(parentId);
          if (!parentPos) return;

          // Draw dashed line for additional parents
          g.append('path')
            .attr('class', 'tree-link-extra')
            .attr('d', d3.linkVertical<any, { x: number, y: number }>()
              .x(d => d.x)
              .y(d => d.y)({ source: parentPos, target: childPos }))
            .attr('fill', 'none')
            .attr('stroke', '#f778ba')  // Pink for interpolation connections
            .attr('stroke-width', 2.5)
            .attr('stroke-dasharray', '6,4')
            .attr('opacity', 0.5);
        });
      }
    });

    // Set initial zoom to fit content (only on first render or if no previous transform)
    if (isFirstRender || !zoomTransformRef.current) {
      const bounds = g.node()?.getBBox();
      if (bounds) {
        const fullWidth = bounds.width + margin.left + margin.right;
        const fullHeight = bounds.height + margin.top + margin.bottom;
        const scale = Math.min(width / fullWidth, height / fullHeight) * 0.9;
        const translateX = (width - fullWidth * scale) / 2;
        const translateY = (height - fullHeight * scale) / 2;

        const transform = d3.zoomIdentity
          .translate(translateX, translateY)
          .scale(scale);

        svg.call(zoom.transform as any, transform);
        zoomTransformRef.current = transform;
        setIsFirstRender(false);
      }
    } else {
      // Restore previous zoom transform to prevent jumping
      svg.call(zoom.transform as any, zoomTransformRef.current);
    }

  }, [images, onNodeClick, onNodeHover, selectedNode, hoveredNode, isMinimized, panelSize, isFirstRender]);

  // Bi-directional hover highlighting - highlight tree nodes when hovering on canvas
  useEffect(() => {
    if (!svgRef.current || isMinimized) return;

    const svg = d3.select(svgRef.current);

    // Reset all node highlights first, then show selected nodes
    svg.selectAll('.tree-node-group rect')
      .attr('stroke', (d: any) => selectedImageIds.includes(d.data.id) ? '#ff0000' : '#30363d')
      .attr('stroke-width', (d: any) => selectedImageIds.includes(d.data.id) ? 3 : 1)
      .style('filter', 'none');

    // Highlight the hovered node from canvas (blue, takes precedence over selection)
    if (hoveredImageId !== null) {
      svg.selectAll('.tree-node-group')
        .each(function(d: any) {
          if (d.data.id === hoveredImageId) {
            d3.select(this)
              .select('rect')
              .attr('stroke', '#58a6ff')
              .attr('stroke-width', 3)
              .style('filter', 'drop-shadow(0 0 8px rgba(88, 166, 255, 0.8))');
          }
        });
    }
  }, [hoveredImageId, selectedImageIds, isMinimized]);

  // Handle panel dragging (disabled when maximized)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isMaximized && (e.target as HTMLElement).className.includes('tree-panel-header')) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panelPosition.x, y: e.clientY - panelPosition.y });
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPanelPosition({
          x: Math.max(0, Math.min(window.innerWidth - panelSize.width, e.clientX - dragStart.x)),
          y: Math.max(0, Math.min(window.innerHeight - panelSize.height, e.clientY - dragStart.y))
        });
      }
      if (isResizing) {
        setPanelSize({
          width: Math.max(400, Math.min(1200, e.clientX - panelPosition.x)),
          height: Math.max(300, Math.min(800, e.clientY - panelPosition.y))
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, dragStart, panelPosition, panelSize]);

  // Toggle maximize/restore
  const toggleMaximize = () => {
    if (isMaximized) {
      // Restore to normal size
      setPanelSize(normalSize);
      setPanelPosition(normalPosition);
      setIsMaximized(false);
    } else {
      // Save current size and position
      setNormalSize(panelSize);
      setNormalPosition(panelPosition);
      // Maximize
      const margin = 20;
      setPanelSize({
        width: window.innerWidth - margin * 2,
        height: window.innerHeight - margin * 2
      });
      setPanelPosition({ x: margin, y: margin });
      setIsMaximized(true);
    }
  };

  if (isMinimized) {
    return (
      <div className="tree-panel-minimized" onClick={() => setIsMinimized(false)}>
        🗺️ Tree ({images.length})
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="tree-panel-floating"
      style={{
        left: panelPosition.x,
        top: panelPosition.y,
        width: panelSize.width,
        height: panelSize.height
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="tree-panel-header"
        onMouseDown={handleMouseDown}
        style={{ cursor: isMaximized ? 'default' : 'move' }}
      >
        <div className="header-left">
          <span className="header-icon">🗺️</span>
          <h3>Exploration Tree</h3>
          <span className="header-stats">
            {images.length} images • {buildTree().length} root{buildTree().length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="header-actions">
          <button
            className="minimize-btn"
            onClick={() => setIsMinimized(true)}
            title="Minimize"
          >
            ─
          </button>
          <button
            className="maximize-btn"
            onClick={toggleMaximize}
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? '◱' : '□'}
          </button>
          <button
            className="close-btn"
            onClick={onClose}
            title="Close"
          >
            ×
          </button>
        </div>
      </div>
      
      <div className="tree-panel-body">
        <svg 
          ref={svgRef} 
          className="tree-svg" 
          width={panelSize.width}
          height={panelSize.height - 80}
          style={{ background: '#0d1117' }}
        />
      </div>

      <div className="tree-panel-footer">
        <div className="footer-legend">
          <span className="legend-badge" style={{ background: '#bc8cff' }}>BAT</span>
          <span className="legend-text">Batch</span>
          <span className="legend-badge" style={{ background: '#58a6ff' }}>REF</span>
          <span className="legend-text">Reference</span>
          <span className="legend-badge" style={{ background: '#f778ba' }}>INT</span>
          <span className="legend-text">Interpolation</span>
          <span className="legend-badge" style={{ background: '#3fb950' }}>VAR</span>
          <span className="legend-text">Variation</span>
        </div>
        <div className="footer-hint">
          Solid lines = hierarchy • Dashed pink = additional parents (interpolation)
        </div>
      </div>

      {/* Resize handle - hidden when maximized */}
      {!isMaximized && (
        <div
          className="resize-handle"
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
        />
      )}
    </div>
  );
};

