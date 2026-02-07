/**
 * Semantic Canvas Component - D3-based interactive visualization
 * Optimized to prevent canvas shifting on selection changes
 */

import React, { useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import { useAppStore } from "../../store/appStore";
import { AxisEditor } from "../AxisEditor/AxisEditor";
import { apiClient } from "../../api/client";
import type { RegionHighlight, PendingImage } from "../../types";

interface SemanticCanvasProps {
  onSelectionChange: (x: number, y: number, count: number) => void;
  regionHighlights?: RegionHighlight[];
  onGenerateFromRegion?: (prompt: string, region: RegionHighlight) => void;
  onDismissRegions?: () => void;
  pendingImages?: PendingImage[];
  onAcceptPending?: (pendingId: string) => void;
  onDiscardPending?: (pendingId: string) => void;
}

export const SemanticCanvas: React.FC<SemanticCanvasProps> = ({
  onSelectionChange,
  regionHighlights = [],
  onGenerateFromRegion,
  onDismissRegions,
  pendingImages = [],
  onAcceptPending,
  onDiscardPending,
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

    // Contour filters: selection (blue), parent (green), child (yellow) — all follow shoe shape
    const contourRadius = Math.max(4, (visualSettings.contourStrength ?? 6));

    const addContourFilter = (
      id: string,
      contourRgb: string,
      glowRgb: string
    ) => {
      const f = defs.append("filter").attr("id", id)
        .attr("x", "-50%").attr("y", "-50%")
        .attr("width", "200%").attr("height", "200%");
      f.append("feMorphology").attr("in", "SourceAlpha").attr("operator", "dilate")
        .attr("radius", contourRadius).attr("result", "dilated");
      f.append("feComposite").attr("in", "dilated").attr("in2", "SourceAlpha")
        .attr("operator", "out").attr("result", "outline");
      f.append("feColorMatrix").attr("in", "outline").attr("type", "matrix")
        .attr("values", contourRgb).attr("result", "contour");
      f.append("feGaussianBlur").attr("in", "SourceGraphic").attr("stdDeviation", 10).attr("result", "blur");
      f.append("feColorMatrix").attr("in", "blur").attr("type", "matrix")
        .attr("values", glowRgb).attr("result", "glow");
      const m = f.append("feMerge");
      m.append("feMergeNode").attr("in", "glow");
      m.append("feMergeNode").attr("in", "contour");
      m.append("feMergeNode").attr("in", "SourceGraphic");
    };
    // Blue selection — strong glow for opaque images, contour for transparent
    addContourFilter("selection-glow",
      "0 0 0 0 0.6  0 0 0 0 0.8  0 0 0 0 1  0 0 0 0 1",
      "0 0 0 0 0.5  0 0 0 0 0.7  0 0 0 0 1  0 0 0 0.9 0");
    // feDropShadow: guaranteed visible glow (works on opaque and transparent images)
    const dropShadowFilter = defs.append("filter").attr("id", "selection-drop-shadow")
      .attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
    dropShadowFilter.append("feDropShadow")
      .attr("dx", 0).attr("dy", 0).attr("stdDeviation", 14)
      .attr("flood-color", "#58a6ff").attr("flood-opacity", 0.95);
    addContourFilter("selection-glow-parent",
      "0 0 0 0 0.25  0 0 0 0 0.73  0 0 0 0 0.31  0 0 0 0 1",
      "0 0 0 0 0.2  0 0 0 0 0.65  0 0 0 0 0.35  0 0 0 0.9 0");
    addContourFilter("selection-glow-child",
      "0 0 0 0 0.82  0 0 0 0 0.6  0 0 0 0 0.13  0 0 0 0 1",
      "0 0 0 0 0.75  0 0 0 0 0.6  0 0 0 0 0.2  0 0 0 0.9 0");
    // Drop-shadow for parent (green) and child (yellow)
    defs.append("filter").attr("id", "parent-drop-shadow")
      .attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%")
      .append("feDropShadow").attr("dx", 0).attr("dy", 0).attr("stdDeviation", 10)
      .attr("flood-color", "#3fb950").attr("flood-opacity", 0.9);
    defs.append("filter").attr("id", "child-drop-shadow")
      .attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%")
      .append("feDropShadow").attr("dx", 0).attr("dy", 0).attr("stdDeviation", 10)
      .attr("flood-color", "#d29922").attr("flood-opacity", 0.9);

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

    // Grid removed per user request — no overlay

    // Group for region highlights (behind images)
    const regionHighlightsGroup = g.append("g").attr("class", "region-highlights");

    // Group for genealogy lines (drawn in selection effect)
    g.append("g").attr("class", "genealogy-lines");

    // Group for images
    const imagesGroup = g.append("g").attr("class", "images");

    // Removed axis line rendering; labels remain via AxisEditor components
    // Genealogy is drawn only on selection (in separate effect), not on hover

    // Render images
    const imageSize = visualSettings.imageSize;
    const strokeHover = Math.max(1, Math.min(4, Math.round(imageSize * 0.04)));
    const strokeSelection = Math.max(2, Math.min(6, Math.round(imageSize * 0.05)));
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
      .on("mouseenter", function (_event, d) {
        d3.select(this.parentNode as SVGGElement)
          .select(".hover-border")
          .attr("stroke", "#58a6ff")
          .attr("stroke-width", strokeHover)
          .attr("opacity", 0.4);
        useAppStore.getState().setHoveredImageId(d.id);
      })
      .on("mouseleave", function () {
        d3.select(this.parentNode as SVGGElement)
          .select(".hover-border")
          .attr("opacity", 0);
        useAppStore.getState().setHoveredImageId(null);
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
      .attr("clip-path", `inset(0 round 8px)`)
      .style("pointer-events", "none");

    const pad = Math.max(2, Math.round(imageSize * 0.04));
    // Hover border
    imageNodes
      .append("rect")
      .attr("class", "hover-border")
      .attr("x", -imageSize / 2 - pad)
      .attr("y", -imageSize / 2 - pad)
      .attr("width", imageSize + pad * 2)
      .attr("height", imageSize + pad * 2)
      .attr("rx", 8)
      .attr("fill", "none")
      .attr("stroke", "#58a6ff")
      .attr("stroke-width", strokeHover)
      .attr("opacity", 0)
      .style("pointer-events", "none");

    // Selection border
    imageNodes
      .append("rect")
      .attr("class", "selection-border")
      .attr("x", -imageSize / 2 - pad - 1)
      .attr("y", -imageSize / 2 - pad - 1)
      .attr("width", imageSize + (pad + 1) * 2)
      .attr("height", imageSize + (pad + 1) * 2)
      .attr("rx", 8)
      .attr("fill", "none")
      .attr("stroke", "#ff0000")
      .attr("stroke-width", strokeSelection)
      .attr("opacity", 0)
      .style("pointer-events", "none");

    // Parent/child highlighting border
    imageNodes
      .append("rect")
      .attr("class", "image-border")
      .attr("x", -imageSize / 2 - pad)
      .attr("y", -imageSize / 2 - pad)
      .attr("width", imageSize + pad * 2)
      .attr("height", imageSize + pad * 2)
      .attr("rx", 8)
      .attr("fill", "none")
      .attr("stroke-width", strokeHover)
      .attr("opacity", 0)
      .style("pointer-events", "none");

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

    // Render region highlights (AI agent exploration suggestions)
    if (regionHighlights.length > 0) {
      regionHighlights.forEach((region) => {
        const [normX, normY] = region.center;
        // Convert normalized coordinates (0-1) to data coordinates
        const dataX = xMin + normX * (xMax - xMin);
        const dataY = yMin + normY * (yMax - yMin);
        // Convert to pixel coordinates using scales
        const pixelX = xScale(dataX);
        const pixelY = yScale(dataY);

        // Visual distinction: cluster (blue solid) vs gap (orange dashed)
        const isCluster = region.type === 'cluster';
        const fillColor = isCluster ? "rgba(88, 166, 255, 0.15)" : "rgba(255, 166, 88, 0.15)";
        const strokeColor = isCluster ? "#58a6ff" : "#ffa658";
        const strokeDasharray = isCluster ? "none" : "5,5";

        // Pulsing circle
        regionHighlightsGroup
          .append("circle")
          .attr("cx", pixelX)
          .attr("cy", pixelY)
          .attr("r", 60)
          .attr("fill", fillColor)
          .attr("stroke", strokeColor)
          .attr("stroke-width", 2)
          .attr("stroke-dasharray", strokeDasharray)
          .attr("opacity", 0.6);

        // Inner dot
        regionHighlightsGroup
          .append("circle")
          .attr("cx", pixelX)
          .attr("cy", pixelY)
          .attr("r", 6)
          .attr("fill", strokeColor)
          .attr("opacity", 0.8);

        // Add interactive foreign object for the card
        const cardWidth = 280;
        const cardHeight = 120;
        const cardX = pixelX + 70;
        const cardY = pixelY - 60;

        const foreignObject = regionHighlightsGroup
          .append("foreignObject")
          .attr("x", cardX)
          .attr("y", cardY)
          .attr("width", cardWidth)
          .attr("height", cardHeight)
          .style("overflow", "visible");

        const cardDiv = foreignObject
          .append("xhtml:div")
          .style("background", "rgba(22, 27, 34, 0.95)")
          .style("border", `1px solid ${strokeColor}`)
          .style("border-radius", "8px")
          .style("padding", "12px")
          .style("color", "#c9d1d9")
          .style("font-size", "13px")
          .style("font-family", "system-ui, -apple-system, sans-serif")
          .style("box-shadow", "0 8px 24px rgba(0, 0, 0, 0.6)")
          .style("cursor", "default")
          .style("pointer-events", "all");

        // Card title with type badge
        const titleDiv = cardDiv
          .append("xhtml:div")
          .style("display", "flex")
          .style("align-items", "center")
          .style("gap", "8px")
          .style("margin-bottom", "6px");

        titleDiv
          .append("xhtml:div")
          .style("font-weight", "600")
          .style("color", strokeColor)
          .text(region.title);

        // Type badge
        titleDiv
          .append("xhtml:span")
          .style("background", `${strokeColor}33`)
          .style("color", strokeColor)
          .style("padding", "2px 6px")
          .style("border-radius", "4px")
          .style("font-size", "9px")
          .style("font-weight", "600")
          .style("text-transform", "uppercase")
          .text(region.type);

        // Confidence badge for clusters
        if (isCluster && region.confidence !== undefined) {
          titleDiv
            .append("xhtml:span")
            .style("color", "#7d8590")
            .style("font-size", "10px")
            .text(`${Math.round(region.confidence * 100)}%`);
        }

        // Card description
        cardDiv
          .append("xhtml:div")
          .style("font-size", "12px")
          .style("margin-bottom", "8px")
          .style("opacity", "0.8")
          .text(region.description);

        // Prompts
        const promptsDiv = cardDiv
          .append("xhtml:div")
          .style("display", "flex")
          .style("flex-wrap", "wrap")
          .style("gap", "6px");

        region.suggested_prompts.slice(0, 2).forEach((prompt) => {
          promptsDiv
            .append("xhtml:button")
            .style("background", "#1f6feb")
            .style("border", "none")
            .style("border-radius", "4px")
            .style("padding", "4px 8px")
            .style("color", "white")
            .style("font-size", "11px")
            .style("cursor", "pointer")
            .style("pointer-events", "all")
            .style("white-space", "nowrap")
            .style("overflow", "hidden")
            .style("text-overflow", "ellipsis")
            .style("max-width", "120px")
            .text(prompt.substring(0, 25) + (prompt.length > 25 ? "..." : ""))
            .on("click", () => {
              if (onGenerateFromRegion) {
                onGenerateFromRegion(prompt, region);
              }
            })
            .on("mouseover", function () {
              d3.select(this).style("background", "#2f81f7");
            })
            .on("mouseout", function () {
              d3.select(this).style("background", "#1f6feb");
            });
        });
      });

      // Add dismiss button (positioned at bottom right of canvas bounds)
      const dismissButton = regionHighlightsGroup
        .append("foreignObject")
        .attr("x", xScale(xMax) - 200)
        .attr("y", yScale(yMax) + 20)
        .attr("width", 180)
        .attr("height", 40)
        .style("pointer-events", "all");

      dismissButton
        .append("xhtml:button")
        .style("background", "rgba(88, 166, 255, 0.2)")
        .style("border", "1px solid #58a6ff")
        .style("border-radius", "6px")
        .style("padding", "8px 16px")
        .style("color", "#58a6ff")
        .style("font-size", "13px")
        .style("cursor", "pointer")
        .style("pointer-events", "all")
        .style("width", "100%")
        .text("✕ Dismiss Highlights")
        .on("click", () => {
          if (onDismissRegions) {
            onDismissRegions();
          }
        })
        .on("mouseover", function () {
          d3.select(this).style("background", "rgba(88, 166, 255, 0.3)");
        })
        .on("mouseout", function () {
          d3.select(this).style("background", "rgba(88, 166, 255, 0.2)");
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
    pendingImages,
    // Note: Excluded selectedImageIds and hoveredGroupId to prevent full redraws on selection/hover changes
    // These are handled in a separate effect below
  ]);

  // Separate effect for selection/hover updates - NO full redraw!
  useEffect(() => {
    if (!svgRef.current || images.length === 0) return;

    const svg = d3.select(svgRef.current);
    const imagesGroup = svg.select(".images");
    const linesGroup = svg.select(".genealogy-lines");

    if (imagesGroup.empty()) return;

    console.log("🎯 Selection/hover update (no redraw):", {
      selectedCount: selectedImageIds.length,
      hoveredGroupId,
      hoveredImageId,
    });

    // Only clear genealogy lines if we have a selection, hovered group, or hovered image
    // This allows hover genealogy to persist when there's no selection
    if (selectedImageIds.length > 0 || hoveredGroupId || hoveredImageId) {
      linesGroup.selectAll("*").remove();
    }

    // Reset all borders and filters
    imagesGroup.selectAll(".image-border").attr("opacity", 0);
    imagesGroup.selectAll(".selection-border").attr("opacity", 0).attr("stroke", "#58a6ff");
    imagesGroup.selectAll(".image-node").attr("filter", null);

    // Selection: box border (persistent)
    selectedImageIds.forEach((id) => {
      imagesGroup.select(`#image-${id} .selection-border`).attr("opacity", 0.7);
    });

    // Highlight images in hovered group
    if (hoveredGroupId) {
      imagesGroup.selectAll(".image-node").each(function (d: any) {
        if (d.group_id === hoveredGroupId) {
          d3.select(this).select(".hover-border").attr("opacity", 0.35);
        }
      });
    }

    // Highlight hovered image from tree modal
    if (hoveredImageId) {
      imagesGroup.select(`#image-${hoveredImageId} .hover-border`).attr("opacity", 0.35);
    }

    // Show genealogy only for selected images (click), not on hover
    const idsToShowGenealogy = selectedImageIds;

    if (idsToShowGenealogy.length > 0) {
      idsToShowGenealogy.forEach((selectedId) => {
        const selectedImg = images.find((img) => img.id === selectedId);
        if (selectedImg) {
          // Use same bounds as main render for consistency
          const width = svgRef.current!.clientWidth;
          const height = svgRef.current!.clientHeight;
          const currentBounds = useAppStore.getState().canvasBounds;

          // Get coordinate transformation settings
          const coordScale = visualSettings.coordinateScale || 1.0;
          const coordOffset = visualSettings.coordinateOffset || [0, 0, 0];

          let xMin2, xMax2, yMin2, yMax2;
          if (currentBounds) {
            ({ xMin: xMin2, xMax: xMax2, yMin: yMin2, yMax: yMax2 } = currentBounds);
          } else {
            // Fallback to data extent if bounds not set - use TRANSFORMED coordinates
            const xExtent = d3.extent(images, (d) => (d.coordinates[0] + coordOffset[0]) * coordScale) as [number, number];
            const yExtent = d3.extent(images, (d) => (d.coordinates[1] + coordOffset[1]) * coordScale) as [number, number];
            const xPadding = Math.max((xExtent[1] - xExtent[0]) * 0.1, 0.1);
            const yPadding = Math.max((yExtent[1] - yExtent[0]) * 0.1, 0.1);
            xMin2 = xExtent[0] - xPadding;
            xMax2 = xExtent[1] + xPadding;
            yMin2 = yExtent[0] - yPadding;
            yMax2 = yExtent[1] + yPadding;
          }
          const xScale = d3
            .scaleLinear()
            .domain([xMin2, xMax2])
            .range([50, width - 50]);
          const yScale = d3
            .scaleLinear()
            .domain([yMin2, yMax2])
            .range([height - 50, 50]);

          const currentX = xScale((selectedImg.coordinates[0] + coordOffset[0]) * coordScale);
          const currentY = yScale((selectedImg.coordinates[1] + coordOffset[1]) * coordScale);

          // Draw parent lines
          selectedImg.parents.forEach((parentId) => {
            const parent = images.find((img) => img.id === parentId);
            if (!parent) return;

            const parentX = xScale((parent.coordinates[0] + coordOffset[0]) * coordScale);
            const parentY = yScale((parent.coordinates[1] + coordOffset[1]) * coordScale);
            const midX = (parentX + currentX) / 2;
            const midY = (parentY + currentY) / 2;
            const dx = currentX - parentX;
            const dy = currentY - parentY;
            const controlX = midX - dy * 0.2;
            const controlY = midY + dx * 0.2;
            const pathData = `M ${parentX} ${parentY} Q ${controlX} ${controlY} ${currentX} ${currentY}`;

            linesGroup
              .append("path")
              .attr("d", pathData)
              .attr("stroke", "#3fb950")
              .attr("stroke-width", 2)
              .attr("stroke-dasharray", "8,4")
              .attr("fill", "none")
              .attr("opacity", 0.5);

            if (!selectedImageIds.includes(parentId)) {
              imagesGroup
                .select(`#image-${parentId} .image-border`)
                .attr("stroke", "#3fb950")
                .attr("stroke-width", 1.5)
                .attr("opacity", 0.6);
            }
          });

          // Draw child lines
          selectedImg.children.forEach((childId) => {
            const child = images.find((img) => img.id === childId);
            if (!child) return;

            const childX = xScale((child.coordinates[0] + coordOffset[0]) * coordScale);
            const childY = yScale((child.coordinates[1] + coordOffset[1]) * coordScale);
            const midX = (currentX + childX) / 2;
            const midY = (currentY + childY) / 2;
            const dx = childX - currentX;
            const dy = childY - currentY;
            const controlX = midX - dy * 0.2;
            const controlY = midY + dx * 0.2;
            const pathData = `M ${currentX} ${currentY} Q ${controlX} ${controlY} ${childX} ${childY}`;

            linesGroup
              .append("path")
              .attr("d", pathData)
              .attr("stroke", "#d29922")
              .attr("stroke-width", 2)
              .attr("stroke-dasharray", "8,4")
              .attr("fill", "none")
              .attr("opacity", 0.5);

            if (!selectedImageIds.includes(childId)) {
              imagesGroup
                .select(`#image-${childId} .image-border`)
                .attr("stroke", "#d29922")
                .attr("stroke-width", 1.5)
                .attr("opacity", 0.6);
            }
          });
        }
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
          left: 20,
          top: "50%",
          transform: "translateY(-50%) rotate(-90deg)",
          transformOrigin: "center",
          whiteSpace: "nowrap",
        }}
      />
    </div>
  );
};
