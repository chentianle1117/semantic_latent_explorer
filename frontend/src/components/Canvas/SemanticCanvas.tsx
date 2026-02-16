/**
 * Semantic Canvas Component - D3-based interactive visualization
 * Optimized to prevent canvas shifting on selection changes
 */

import React, { useEffect, useRef, useMemo, useState } from "react";
import * as d3 from "d3";
import { useAppStore } from "../../store/appStore";
import { AxisEditor } from "../AxisEditor/AxisEditor";
import { apiClient } from "../../api/client";
import type { RegionHighlight, PendingImage } from "../../types";

interface SemanticCanvasProps {
  onSelectionChange: (x: number, y: number, count: number) => void;
  regionHighlights?: RegionHighlight[];
  onGenerateFromRegion?: (prompt: string, region: RegionHighlight) => void;
  pendingImages?: PendingImage[];
  onAcceptPending?: (pendingId: string) => void;
  onDiscardPending?: (pendingId: string) => void;
  onGhostClick?: (ghost: any) => void;
}

export const SemanticCanvas: React.FC<SemanticCanvasProps> = ({
  onSelectionChange,
  regionHighlights = [],
  onGenerateFromRegion,
  pendingImages = [],
  onAcceptPending,
  onDiscardPending,
  onGhostClick,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomTransformRef = useRef<d3.ZoomTransform | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const xScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null);
  const yScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null);

  // Subscribe only to the specific state we need
  const allImages = useAppStore((state) => state.images);
  const visualSettings = useAppStore((state) => state.visualSettings);
  const selectedImageIds = useAppStore((state) => state.selectedImageIds);
  const hoveredGroupId = useAppStore((state) => state.hoveredGroupId);
  const hoveredImageId = useAppStore((state) => state.hoveredImageId);
  const axisLabels = useAppStore((state) => state.axisLabels);
  const canvasBounds = useAppStore((state) => state.canvasBounds);
  const ghostNodes = useAppStore((state) => state.ghostNodes);

  // Terrain mode: show clusters, gaps, or nothing
  const [terrainMode, setTerrainMode] = useState<'clusters' | 'gaps' | 'off'>('off');

  // Memoize filtered images to prevent new array on every render
  const images = useMemo(
    () => allImages.filter((img) => img.visible),
    [allImages]
  );

  // Get functions directly from store without subscribing to state changes
  const toggleImageSelection = React.useCallback(
    (id: number, ctrlKey: boolean) => {
      useAppStore.getState().toggleImageSelection(id, ctrlKey);
    },
    []
  );

  // Don't call setHoveredImageId - it causes unnecessary store updates and re-renders
  // We handle hover state locally through D3 DOM manipulation

  // Track previous values to see what changed
  const prevImagesRef = React.useRef(images);
  const prevVisualSettingsRef = React.useRef(visualSettings);
  const prevLayoutPaddingRef = React.useRef(visualSettings.layoutPadding);

  // Main rendering effect - ONLY for full redraws (images, visualSettings, axisLabels change)
  useEffect(() => {
    const imagesChanged = prevImagesRef.current !== images;
    const visualSettingsChanged =
      prevVisualSettingsRef.current !== visualSettings;
    const layoutPaddingChanged =
      prevLayoutPaddingRef.current !== visualSettings.layoutPadding;

    console.log("🔄 Canvas FULL render effect triggered", {
      imagesCount: images.length,
      imagesChanged,
      visualSettingsChanged,
      layoutPaddingChanged,
      hasSvgRef: !!svgRef.current,
    });

    // If layout padding changed, reset bounds to force recalculation
    if (layoutPaddingChanged && !imagesChanged) {
      console.log("📏 Layout padding changed, resetting bounds");
      useAppStore.getState().resetCanvasBounds();
    }

    prevImagesRef.current = images;
    prevVisualSettingsRef.current = visualSettings;
    prevLayoutPaddingRef.current = visualSettings.layoutPadding;

    if (!svgRef.current) {
      console.warn("⚠️ No SVG ref available");
      return;
    }

    if (images.length === 0) {
      console.log("📭 No images, clearing canvas");
      d3.select(svgRef.current).selectAll("*").remove();
      return;
    }

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    console.log("🎨 Full canvas render:", {
      width,
      height,
      imageCount: images.length,
    });

    // Clear previous content ONLY on full redraw
    svg.selectAll("*").remove();

    // Create defs for arrow markers (outside zoom group)
    const defs = svg.append("defs");

    // X-axis arrow markers
    defs
      .append("marker")
      .attr("id", "arrow-x-left")
      .attr("markerWidth", 10)
      .attr("markerHeight", 10)
      .attr("refX", 5)
      .attr("refY", 5)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M 10 5 L 0 0 L 0 10 Z")
      .attr("fill", "#58a6ff");

    defs
      .append("marker")
      .attr("id", "arrow-x-right")
      .attr("markerWidth", 10)
      .attr("markerHeight", 10)
      .attr("refX", 5)
      .attr("refY", 5)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M 0 5 L 10 0 L 10 10 Z")
      .attr("fill", "#58a6ff");

    // Y-axis arrow markers
    defs
      .append("marker")
      .attr("id", "arrow-y-top")
      .attr("markerWidth", 10)
      .attr("markerHeight", 10)
      .attr("refX", 5)
      .attr("refY", 5)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M 5 0 L 0 10 L 10 10 Z")
      .attr("fill", "#bc8cff");

    defs
      .append("marker")
      .attr("id", "arrow-y-bottom")
      .attr("markerWidth", 10)
      .attr("markerHeight", 10)
      .attr("refX", 5)
      .attr("refY", 5)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M 5 10 L 0 0 L 10 0 Z")
      .attr("fill", "#bc8cff");

    // Genealogy arrow markers — tiny, subtle, directional colors
    defs.append("marker")
      .attr("id", "arrow-cyan")
      .attr("markerWidth", 6).attr("markerHeight", 6)
      .attr("refX", 5).attr("refY", 3)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M 0 0 L 6 3 L 0 6 Z")
      .attr("fill", "#00E5FF").attr("opacity", 0.7);

    defs.append("marker")
      .attr("id", "arrow-amber")
      .attr("markerWidth", 6).attr("markerHeight", 6)
      .attr("refX", 5).attr("refY", 3)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M 0 0 L 6 3 L 0 6 Z")
      .attr("fill", "#FFAA00").attr("opacity", 0.7);

    // Hover glow: silvery-white, subtle emission
    const hoverFilter = defs.append("filter").attr("id", "hover-glow")
      .attr("x", "-40%").attr("y", "-40%").attr("width", "180%").attr("height", "180%");
    hoverFilter.append("feDropShadow")
      .attr("dx", 0).attr("dy", 0).attr("stdDeviation", 8)
      .attr("flood-color", "#c0d0e0").attr("flood-opacity", 0.5);

    // Terrain nebula gradients
    const clusterGrad = defs.append("radialGradient").attr("id", "cluster-nebula");
    clusterGrad.append("stop").attr("offset", "0%").attr("stop-color", "#58a6ff").attr("stop-opacity", 0.25);
    clusterGrad.append("stop").attr("offset", "40%").attr("stop-color", "#58a6ff").attr("stop-opacity", 0.1);
    clusterGrad.append("stop").attr("offset", "100%").attr("stop-color", "#58a6ff").attr("stop-opacity", 0);

    const gapGrad = defs.append("radialGradient").attr("id", "gap-nebula");
    gapGrad.append("stop").attr("offset", "0%").attr("stop-color", "#ffa658").attr("stop-opacity", 0.2);
    gapGrad.append("stop").attr("offset", "35%").attr("stop-color", "#ffa658").attr("stop-opacity", 0.08);
    gapGrad.append("stop").attr("offset", "100%").attr("stop-color", "#ffa658").attr("stop-opacity", 0);

    // Blur filter for terrain blobs
    const terrainBlur = defs.append("filter").attr("id", "terrain-blur")
      .attr("x", "-20%").attr("y", "-20%").attr("width", "140%").attr("height", "140%");
    terrainBlur.append("feGaussianBlur").attr("stdDeviation", 6);

    // Create main group for zoom/pan
    const g = svg.append("g").attr("class", "main-group");

    // Set up zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 10])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
        zoomTransformRef.current = event.transform;
      });

    svg.call(zoom as any);
    zoomRef.current = zoom;

    // Restore previous zoom/pan state
    if (zoomTransformRef.current) {
      svg.call(zoom.transform as any, zoomTransformRef.current);
    }

    // Determine canvas bounds:
    // - If canvasBounds is null: Calculate from data (first generation, axis update, or manual reset)
    // - Otherwise: Use stored bounds (stable, prevents rescaling when adding images)
    let xMin, xMax, yMin, yMax;

    if (canvasBounds === null) {
      // Calculate from data extent using TRANSFORMED coordinates
      console.log("📐 Calculating bounds from data extent");
      const coordScale = visualSettings.coordinateScale || 1.0;
      const coordOffset = visualSettings.coordinateOffset || [0, 0, 0];

      const xExtent = d3.extent(images, (d) => (d.coordinates[0] + coordOffset[0]) * coordScale) as [number, number];
      const yExtent = d3.extent(images, (d) => (d.coordinates[1] + coordOffset[1]) * coordScale) as [number, number];

      // Add padding based on user preference (layoutPadding setting)
      const paddingFactor = visualSettings.layoutPadding;
      const xPadding = Math.max((xExtent[1] - xExtent[0]) * paddingFactor, 0.05);
      const yPadding = Math.max((yExtent[1] - yExtent[0]) * paddingFactor, 0.05);

      xMin = xExtent[0] - xPadding;
      xMax = xExtent[1] + xPadding;
      yMin = yExtent[0] - yPadding;
      yMax = yExtent[1] + yPadding;

      // Save these bounds to state so future renders use them
      const newBounds = { xMin, xMax, yMin, yMax };
      useAppStore.getState().setCanvasBounds(newBounds);
      console.log(`✓ Bounds calculated with ${(paddingFactor * 100).toFixed(0)}% padding:`, newBounds);
    } else {
      // Use stored bounds
      console.log("📏 Using stored bounds:", canvasBounds);
      ({ xMin, xMax, yMin, yMax } = canvasBounds);
    }

    const xScale = d3
      .scaleLinear()
      .domain([xMin, xMax])
      .range([50, width - 50]);

    const yScale = d3
      .scaleLinear()
      .domain([yMin, yMax])
      .range([height - 50, 50]);

    xScaleRef.current = xScale;
    yScaleRef.current = yScale;

    // Group for region highlights (behind images)
    const regionHighlightsGroup = g.append("g").attr("class", "region-highlights");

    // Group for genealogy lines (drawn in selection effect only for selected images)
    g.append("g").attr("class", "genealogy-lines");

    // Group for ghost nodes (preview suggestions at 30% opacity)
    const ghostGroup = g.append("g").attr("class", "ghost-nodes");

    // Render ghost nodes
    const ghostNodeElements = ghostGroup
      .selectAll(".ghost-node")
      .data(ghostNodes, (d: any) => d.id)
      .join("g")
      .attr("class", "ghost-node")
      .attr("id", (d) => `ghost-${d.id}`)
      .attr("transform", (d) => `translate(${xScale(d.coordinates[0])}, ${yScale(d.coordinates[1])})`)
      .attr("opacity", 0.3)
      .style("cursor", "pointer");

    // Ghost node circle (pulsing indicator)
    ghostNodeElements
      .append("circle")
      .attr("r", visualSettings.imageSize / 2)
      .attr("fill", "none")
      .attr("stroke", "#58a6ff")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "5,5");

    // Ghost node icon (sparkle)
    ghostNodeElements
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.3em")
      .attr("font-size", visualSettings.imageSize / 2)
      .text("✨");

    // Ghost node click handler (show suggestion)
    ghostNodeElements.on("click", function(event, d) {
      event.stopPropagation();
      if (onGhostClick) {
        onGhostClick(d);
      }
    });

    // Group for images
    const imagesGroup = g.append("g").attr("class", "images");

    // Render images - pure CLIP semantic projection
    const imageSize = visualSettings.imageSize;
    const coordScale = visualSettings.coordinateScale || 1.0; // Get coordinate scale multiplier
    const coordOffset = visualSettings.coordinateOffset || [0, 0, 0]; // Get coordinate offset

    const imageNodes = imagesGroup
      .selectAll(".image-node")
      .data(images, (d: any) => d.id)
      .join("g")
      .attr("class", "image-node")
      .attr("id", (d) => `image-${d.id}`)
      .attr(
        "transform",
        (d) =>
          `translate(${xScale((d.coordinates[0] + coordOffset[0]) * coordScale)}, ${yScale((d.coordinates[1] + coordOffset[1]) * coordScale)})`
      );

    console.log("🎯 Attaching click handlers to", images.length, "image nodes");

    // Add invisible click area
    imageNodes
      .append("rect")
      .attr("x", -imageSize / 2 - 10)
      .attr("y", -imageSize / 2 - 10)
      .attr("width", imageSize + 20)
      .attr("height", imageSize + 20)
      .attr("rx", 8)
      .attr("fill", "transparent")
      .attr("pointer-events", "all")
      .style("cursor", "pointer")
      .on("click", function (event, d) {
        console.log("🖱️ Canvas click detected:", {
          imageId: d.id,
          eventType: event.type,
          button: event.button,
          ctrlKey: event.ctrlKey,
          target: event.target,
          currentTarget: event.currentTarget,
        });

        event.stopPropagation();

        const wasSelected = useAppStore.getState().selectedImageIds.includes(d.id);
        const currentCount = useAppStore.getState().selectedImageIds.length;

        console.log(
          "📝 Before toggle - selected IDs:",
          useAppStore.getState().selectedImageIds
        );

        toggleImageSelection(d.id, event.ctrlKey);

        setTimeout(() => {
          const currentSelection = useAppStore.getState().selectedImageIds;
          console.log("📝 After toggle - selected IDs:", currentSelection);
          const newCount = currentSelection.length;

          if (newCount > 0) {
            // Only update position if this is the first selection OR if we're deselecting
            // This keeps the panel in a stable position when adding to selection
            const shouldUpdatePosition = currentCount === 0 || wasSelected;

            if (shouldUpdatePosition) {
              // CRITICAL: Calculate position BEFORE state update (element still exists)
              const rect = (this as SVGRectElement).getBoundingClientRect();
              const container = svgRef.current?.parentElement;
              const containerRect = container?.getBoundingClientRect();

              if (containerRect) {
                // Convert to container-relative coordinates
                const relativeX = rect.right - containerRect.left + 10;
                const relativeY = rect.top - containerRect.top;

                console.log("📍 Position calculation:", {
                  elementRect: {
                    left: rect.left,
                    top: rect.top,
                    right: rect.right,
                    bottom: rect.bottom,
                  },
                  containerRect: {
                    left: containerRect.left,
                    top: containerRect.top,
                  },
                  relative: { x: relativeX, y: relativeY },
                });

                onSelectionChange(relativeX, relativeY, newCount);
              } else {
                // Fallback to viewport coords
                console.warn("⚠️ No container rect, using viewport coords");
                const rect = (this as SVGRectElement).getBoundingClientRect();
                onSelectionChange(rect.right + 10, rect.top, newCount);
              }
            } else {
              // Just update the count, keep position stable
              console.log("📍 Keeping panel position, just updating count to", newCount);
              onSelectionChange(-1, -1, newCount); // -1 signals to keep existing position
            }
          } else {
            console.log("❌ No selection, closing panel");
            onSelectionChange(0, 0, 0);
          }
        }, 0);
      })
      .on("mouseenter", function () {
        const g = d3.select(this.parentNode as SVGGElement);
        const id = (g.datum() as any).id;
        // Only apply hover glow if not already selected (selection glow takes priority)
        if (!useAppStore.getState().selectedImageIds.includes(id)) {
          g.attr("filter", "url(#hover-glow)");
        }
      })
      .on("mouseleave", function () {
        const g = d3.select(this.parentNode as SVGGElement);
        const id = (g.datum() as any).id;
        // Only clear filter if not selected
        if (!useAppStore.getState().selectedImageIds.includes(id)) {
          g.attr("filter", null);
        }
      });

    // Add image
    imageNodes
      .append("image")
      .attr("href", (d) => `data:image/png;base64,${d.base64_image}`)
      .attr("x", -imageSize / 2)
      .attr("y", -imageSize / 2)
      .attr("width", imageSize)
      .attr("height", imageSize)
      .attr("opacity", visualSettings.imageOpacity)
      .style("pointer-events", "none");

    // Selection and parent/child highlighting uses CSS drop-shadow classes
    // applied to <g> groups — pulsing cyan glow for selection

    // Render pending/background images with faded opacity
    if (pendingImages.length > 0) {
      const pendingGroup = imagesGroup
        .selectAll(".pending-image")
        .data(pendingImages, (d: any) => d.id)
        .join("g")
        .attr("class", "pending-image")
        .attr("id", (d) => `pending-${d.id}`)
        .attr(
          "transform",
          (d) =>
            `translate(${xScale((d.imageData.coordinates[0] + coordOffset[0]) * coordScale)}, ${yScale((d.imageData.coordinates[1] + coordOffset[1]) * coordScale)})`
        )
        .attr("opacity", 0.35);  // Faded opacity

      // Add image
      pendingGroup
        .append("image")
        .attr("href", (d) => `data:image/png;base64,${d.imageData.base64_image}`)
        .attr("x", -imageSize / 2)
        .attr("y", -imageSize / 2)
        .attr("width", imageSize)
        .attr("height", imageSize)
        .attr("clip-path", "inset(0 round 8px)");

      // Add border
      pendingGroup
        .append("rect")
        .attr("x", -imageSize / 2)
        .attr("y", -imageSize / 2)
        .attr("width", imageSize)
        .attr("height", imageSize)
        .attr("rx", 8)
        .attr("fill", "none")
        .attr("stroke", "#f0e68c")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "5,5");

      // Add accept/discard buttons
      pendingGroup.each(function(d) {
        const group = d3.select(this);
        const buttonY = imageSize / 2 + 15;

        // Accept button
        const acceptBtn = group
          .append("foreignObject")
          .attr("x", -imageSize / 2)
          .attr("y", buttonY)
          .attr("width", imageSize / 2 - 2)
          .attr("height", 30)
          .style("pointer-events", "all");

        acceptBtn
          .append("xhtml:button")
          .style("width", "100%")
          .style("height", "100%")
          .style("background", "#238636")
          .style("border", "none")
          .style("border-radius", "4px")
          .style("color", "white")
          .style("font-size", "11px")
          .style("cursor", "pointer")
          .style("pointer-events", "all")
          .text("✓ Accept")
          .on("click", () => {
            if (onAcceptPending) {
              onAcceptPending(d.id);
            }
          })
          .on("mouseover", function() {
            d3.select(this).style("background", "#2ea043");
          })
          .on("mouseout", function() {
            d3.select(this).style("background", "#238636");
          });

        // Discard button
        const discardBtn = group
          .append("foreignObject")
          .attr("x", imageSize / 2 - (imageSize / 2 - 2))
          .attr("y", buttonY)
          .attr("width", imageSize / 2 - 2)
          .attr("height", 30)
          .style("pointer-events", "all");

        discardBtn
          .append("xhtml:button")
          .style("width", "100%")
          .style("height", "100%")
          .style("background", "#da3633")
          .style("border", "none")
          .style("border-radius", "4px")
          .style("color", "white")
          .style("font-size", "11px")
          .style("cursor", "pointer")
          .style("pointer-events", "all")
          .text("✕ Discard")
          .on("click", () => {
            if (onDiscardPending) {
              onDiscardPending(d.id);
            }
          })
          .on("mouseover", function() {
            d3.select(this).style("background", "#e5534b");
          })
          .on("mouseout", function() {
            d3.select(this).style("background", "#da3633");
          });

        // Add hover to show reasoning
        group
          .on("mouseover", function() {
            // Show tooltip with variation reasoning
            const tooltip = group
              .append("foreignObject")
              .attr("class", "variation-tooltip")
              .attr("x", -imageSize / 2)
              .attr("y", -imageSize / 2 - 50)
              .attr("width", 200)
              .attr("height", 50);

            tooltip
              .append("xhtml:div")
              .style("background", "rgba(22, 27, 34, 0.95)")
              .style("border", "1px solid #f0e68c")
              .style("border-radius", "4px")
              .style("padding", "6px")
              .style("color", "#c9d1d9")
              .style("font-size", "11px")
              .text(`Variation: ${d.variation.reasoning}`);

            group.attr("opacity", 0.7);
          })
          .on("mouseout", function() {
            group.selectAll(".variation-tooltip").remove();
            group.attr("opacity", 0.35);
          });
      });
    }

    // Render region highlights as nebula blobs (behind shoes)
    // Filter by terrain mode: clusters, gaps, or off
    const filteredRegions = terrainMode === 'off'
      ? []
      : regionHighlights.filter(r => terrainMode === 'clusters' ? r.type === 'cluster' : r.type === 'gap');

    if (filteredRegions.length > 0) {
      const canvasPixelW = xScale(xMax) - xScale(xMin);
      const canvasPixelH = yScale(yMin) - yScale(yMax); // Note: yScale is inverted

      filteredRegions.forEach((region) => {
        // Region centers are in actual data coordinates from the backend
        const [dataX, dataY] = region.center;
        const pixelX = xScale(dataX);
        const pixelY = yScale(dataY);

        const isCluster = region.type === 'cluster';
        const gradId = isCluster ? "url(#cluster-nebula)" : "url(#gap-nebula)";

        // Use ellipse data from backend if available, or defaults
        const ellipse = (region as any).ellipse || { rx: 0.1, ry: 0.08, angle: 0 };
        const rxPx = Math.max(60, ellipse.rx * canvasPixelW * 0.5);
        const ryPx = Math.max(50, ellipse.ry * canvasPixelH * 0.5);
        const angle = ellipse.angle || 0;

        // Main soft blob
        regionHighlightsGroup
          .append("ellipse")
          .attr("cx", pixelX)
          .attr("cy", pixelY)
          .attr("rx", rxPx)
          .attr("ry", ryPx)
          .attr("fill", gradId)
          .attr("transform", `rotate(${angle}, ${pixelX}, ${pixelY})`)
          .attr("filter", "url(#terrain-blur)")
          .style("pointer-events", "all")
          .style("cursor", "pointer")
          .on("click", function (event) {
            event.stopPropagation();
            // Remove any existing tooltip
            regionHighlightsGroup.selectAll(".terrain-tooltip").remove();

            // Show minimal tooltip
            const tooltipFO = regionHighlightsGroup
              .append("foreignObject")
              .attr("class", "terrain-tooltip")
              .attr("x", pixelX + 20)
              .attr("y", pixelY - 40)
              .attr("width", 220)
              .attr("height", 100)
              .style("pointer-events", "all");

            const tooltipDiv = tooltipFO
              .append("xhtml:div")
              .style("background", "rgba(13, 17, 23, 0.9)")
              .style("backdrop-filter", "blur(8px)")
              .style("border", `1px solid ${isCluster ? '#58a6ff40' : '#ffa65840'}`)
              .style("border-radius", "8px")
              .style("padding", "10px 14px")
              .style("color", "#c9d1d9")
              .style("font-size", "12px")
              .style("font-family", "system-ui, -apple-system, sans-serif")
              .style("box-shadow", "0 4px 16px rgba(0, 0, 0, 0.5)");

            tooltipDiv.append("xhtml:div")
              .style("font-weight", "600")
              .style("color", isCluster ? "#58a6ff" : "#ffa658")
              .style("margin-bottom", "6px")
              .text(region.title);

            if (region.description) {
              tooltipDiv.append("xhtml:div")
                .style("font-size", "11px")
                .style("opacity", "0.7")
                .style("margin-bottom", "8px")
                .text(region.description);
            }

            if (region.suggested_prompts.length > 0) {
              tooltipDiv.append("xhtml:button")
                .style("background", "rgba(88, 166, 255, 0.2)")
                .style("border", "1px solid #58a6ff60")
                .style("border-radius", "4px")
                .style("padding", "4px 10px")
                .style("color", "#58a6ff")
                .style("font-size", "11px")
                .style("cursor", "pointer")
                .style("pointer-events", "all")
                .text("Explore")
                .on("click", (e: any) => {
                  e.stopPropagation();
                  if (onGenerateFromRegion) {
                    onGenerateFromRegion(region.suggested_prompts[0], region);
                  }
                });
            }
          });

        // Second smaller overlapping blob for density center emphasis
        regionHighlightsGroup
          .append("ellipse")
          .attr("cx", pixelX)
          .attr("cy", pixelY)
          .attr("rx", rxPx * 0.5)
          .attr("ry", ryPx * 0.5)
          .attr("fill", gradId)
          .attr("opacity", 0.6)
          .attr("transform", `rotate(${angle + 15}, ${pixelX}, ${pixelY})`)
          .style("pointer-events", "none");
      });
    }

    // Click on canvas background to deselect
    svg.on("click", (event) => {
      const target = event.target as Element;
      if (
        target.tagName === "svg" ||
        target.classList?.contains("main-group")
      ) {
        useAppStore.getState().clearSelection();
        onSelectionChange(0, 0, 0);
      }
    });

    g.on("click", (event) => {
      const target = event.target as Element;
      if (target === event.currentTarget) {
        useAppStore.getState().clearSelection();
        onSelectionChange(0, 0, 0);
      }
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    images,
    visualSettings,
    axisLabels,
    canvasBounds,
    regionHighlights,
    terrainMode,
    pendingImages,
    // Note: Excluded selectedImageIds and hoveredGroupId to prevent full redraws on selection/hover changes
    // These are handled in a separate effect below
  ]);

  // Separate effect for selection/hover updates - NO full redraw!
  useEffect(() => {
    if (!svgRef.current || images.length === 0) return;

    const svg = d3.select(svgRef.current);
    const imagesGroup = svg.select(".images");

    if (imagesGroup.empty()) return;

    // Reset selection glow on all <g> groups
    imagesGroup.selectAll(".image-node")
      .classed("selected-glow", false)
      .attr("filter", null);

    // Apply selection glow ONLY to actually selected shoes (cyan glow)
    selectedImageIds.forEach((id) => {
      imagesGroup.select(`#image-${id}`).classed("selected-glow", true);
    });

    // Opacity cascade: fade unrelated shoes when selection exists
    if (selectedImageIds.length > 0) {
      // Build set of direct parents/children (depth-1 only)
      const relatedSet = new Set<number>(selectedImageIds);

      selectedImageIds.forEach(id => {
        const img = images.find(i => i.id === id);
        if (img) {
          img.parents.forEach(parentId => relatedSet.add(parentId));
          img.children.forEach(childId => relatedSet.add(childId));
        }
      });

      // Apply opacity: 1.0 (selected), 0.8 (direct parents/children), 0.3 (unrelated)
      imagesGroup.selectAll(".image-node").each(function(d: any) {
        const isSelected = selectedImageIds.includes(d.id);
        const isRelated = relatedSet.has(d.id);
        const opacity = isSelected ? 1.0 : (isRelated ? 0.8 : 0.3);
        d3.select(this).transition().duration(200).attr("opacity", opacity);
      });
    } else {
      // No selection: restore all to default opacity
      imagesGroup.selectAll(".image-node")
        .transition().duration(200)
        .attr("opacity", visualSettings.imageOpacity);
    }

    // Highlight images in hovered group (silver glow filter)
    if (hoveredGroupId) {
      imagesGroup.selectAll(".image-node").each(function (d: any) {
        if (d.group_id === hoveredGroupId && !selectedImageIds.includes(d.id)) {
          d3.select(this).attr("filter", "url(#hover-glow)");
        }
      });
    }

    // Highlight hovered image from tree modal (silver glow filter)
    if (hoveredImageId && !selectedImageIds.includes(hoveredImageId)) {
      imagesGroup.select(`#image-${hoveredImageId}`).attr("filter", "url(#hover-glow)");
    }

    // Draw directional genealogy lines ONLY for selected images
    // Use actual positions from DOM elements (works for both static and physics modes)
    const genealogyLinesGroup = svg.select(".genealogy-lines");
    genealogyLinesGroup.selectAll("*").remove();

    if (selectedImageIds.length > 0) {
      const drawnLinks = new Set<string>();

      selectedImageIds.forEach((selectedId) => {
        const selectedImg = images.find((img) => img.id === selectedId);
        if (!selectedImg) return;

        // Get actual position from DOM element
        const selectedNode = svg.select(`#image-${selectedId}`).node() as SVGGElement;
        if (!selectedNode) return;
        const selectedTransform = selectedNode.getAttribute("transform");
        const selectedMatch = selectedTransform?.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (!selectedMatch) return;
        const sx = parseFloat(selectedMatch[1]);
        const sy = parseFloat(selectedMatch[2]);

        // Parent → Selection: Cyan (#00E5FF) — input flow
        selectedImg.parents.forEach((parentId) => {
          const key = `${parentId}->${selectedId}`;
          if (drawnLinks.has(key)) return;
          drawnLinks.add(key);

          const parentNode = svg.select(`#image-${parentId}`).node() as SVGGElement;
          if (!parentNode) return;
          const parentTransform = parentNode.getAttribute("transform");
          const parentMatch = parentTransform?.match(/translate\(([^,]+),\s*([^)]+)\)/);
          if (!parentMatch) return;
          const px = parseFloat(parentMatch[1]);
          const py = parseFloat(parentMatch[2]);

          // Simple Bezier curve
          const cp1x = px;
          const cp1y = py + (sy - py) * 0.4;
          const cp2x = sx;
          const cp2y = sy - (sy - py) * 0.4;

          genealogyLinesGroup.append("path")
            .attr("d", `M ${px} ${py} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${sx} ${sy}`)
            .attr("stroke", "#00E5FF")
            .attr("stroke-width", 2)
            .attr("fill", "none")
            .attr("opacity", 0.8)
            .attr("marker-end", "url(#arrow-cyan)");
        });

        // Selection → Child: Amber (#FFAA00) — output flow
        selectedImg.children.forEach((childId) => {
          const key = `${selectedId}->${childId}`;
          if (drawnLinks.has(key)) return;
          drawnLinks.add(key);

          const childNode = svg.select(`#image-${childId}`).node() as SVGGElement;
          if (!childNode) return;
          const childTransform = childNode.getAttribute("transform");
          const childMatch = childTransform?.match(/translate\(([^,]+),\s*([^)]+)\)/);
          if (!childMatch) return;
          const cx = parseFloat(childMatch[1]);
          const cy = parseFloat(childMatch[2]);

          // Simple Bezier curve
          const cp1x = sx;
          const cp1y = sy + (cy - sy) * 0.4;
          const cp2x = cx;
          const cp2y = cy - (cy - sy) * 0.4;

          genealogyLinesGroup.append("path")
            .attr("d", `M ${sx} ${sy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${cx} ${cy}`)
            .attr("stroke", "#FFAA00")
            .attr("stroke-width", 2)
            .attr("fill", "none")
            .attr("opacity", 0.8)
            .attr("marker-end", "url(#arrow-amber)");
        });
      });
    }
  }, [selectedImageIds, hoveredGroupId, hoveredImageId, images, visualSettings]);

  // FlyTo effect: smoothly pan/zoom to a specific image
  const flyToImageId = useAppStore((state) => state.flyToImageId);
  useEffect(() => {
    if (
      !flyToImageId ||
      !svgRef.current ||
      !zoomRef.current ||
      !xScaleRef.current ||
      !yScaleRef.current
    )
      return;

    const img = images.find((i) => i.id === flyToImageId);
    if (!img) return;

    const coordScale = visualSettings.coordinateScale || 1.0;
    const coordOffset = visualSettings.coordinateOffset || [0, 0, 0];
    const px = xScaleRef.current(
      (img.coordinates[0] + coordOffset[0]) * coordScale
    );
    const py = yScaleRef.current(
      (img.coordinates[1] + coordOffset[1]) * coordScale
    );

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // Zoom to scale 2, centered on the image
    const targetScale = 2;
    const tx = width / 2 - px * targetScale;
    const ty = height / 2 - py * targetScale;
    const targetTransform = d3.zoomIdentity
      .translate(tx, ty)
      .scale(targetScale);

    svg
      .transition()
      .duration(600)
      .call(zoomRef.current.transform as any, targetTransform);

    // Clear the flyTo request
    useAppStore.getState().setFlyToImageId(null);
  }, [flyToImageId, images, visualSettings]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg
        ref={svgRef}
        style={{ width: "100%", height: "100%", background: "#0d1117" }}
      />

      {/* X-Axis Labels */}
      <AxisEditor
        axis="x"
        negativeLabel={axisLabels.x[0]}
        positiveLabel={axisLabels.x[1]}
        onUpdate={async (negative, positive) => {
          try {
            // Reset bounds to trigger rescale with new axis organization
            useAppStore.getState().resetCanvasBounds();

            // Update backend first (this recalculates all positions)
            await apiClient.updateAxes({
              x_negative: negative,
              x_positive: positive,
              y_negative: axisLabels.y[0],
              y_positive: axisLabels.y[1],
            });

            // Get updated state with new coordinates
            const state = await apiClient.getState();

            // Update store with both new labels AND new coordinates
            // This ensures canvas re-renders with correct positions
            const newLabels = {
              ...axisLabels,
              x: [negative, positive] as [string, string],
            };
            useAppStore.setState({ axisLabels: newLabels });
            useAppStore.getState().setImages(state.images);
          } catch (error) {
            console.error("Failed to update X-axis:", error);
            alert(`Failed to update X-axis: ${error}`);
          }
        }}
        style={{
          position: "absolute",
          bottom: 20,
          left: "50%",
          transform: "translateX(-50%)",
        }}
      />

      {/* Y-Axis Labels */}
      <AxisEditor
        axis="y"
        negativeLabel={axisLabels.y[0]}
        positiveLabel={axisLabels.y[1]}
        onUpdate={async (negative, positive) => {
          try {
            // Reset bounds to trigger rescale with new axis organization
            useAppStore.getState().resetCanvasBounds();

            // Update backend first (this recalculates all positions)
            await apiClient.updateAxes({
              x_negative: axisLabels.x[0],
              x_positive: axisLabels.x[1],
              y_negative: negative,
              y_positive: positive,
            });

            // Get updated state with new coordinates
            const state = await apiClient.getState();

            // Update store with both new labels AND new coordinates
            // This ensures canvas re-renders with correct positions
            const newLabels = {
              ...axisLabels,
              y: [negative, positive] as [string, string],
            };
            useAppStore.setState({ axisLabels: newLabels });
            useAppStore.getState().setImages(state.images);
          } catch (error) {
            console.error("Failed to update Y-axis:", error);
            alert(`Failed to update Y-axis: ${error}`);
          }
        }}
        style={{
          position: "absolute",
          left: 16,
          top: "50%",
          transform: "translateY(-50%) rotate(-90deg)",
          transformOrigin: "center",
          whiteSpace: "nowrap",
        }}
      />

      {/* Terrain toggle: Clusters vs Gaps */}
      {regionHighlights.length > 0 && (
        <div className="terrain-toggle" style={{ position: "absolute", bottom: 60, right: 16 }}>
          <button
            className={terrainMode === 'clusters' ? 'active' : ''}
            onClick={() => setTerrainMode(m => m === 'clusters' ? 'off' : 'clusters')}
          >
            Clusters
          </button>
          <button
            className={terrainMode === 'gaps' ? 'active' : ''}
            onClick={() => setTerrainMode(m => m === 'gaps' ? 'off' : 'gaps')}
          >
            Gaps
          </button>
        </div>
      )}
    </div>
  );
};
