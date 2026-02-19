/**
 * Semantic Canvas Component - D3-based interactive visualization
 * Optimized to prevent canvas shifting on selection changes
 */

import React, { useEffect, useRef, useMemo, useState } from "react";
import * as d3 from "d3";
import { useAppStore } from "../../store/appStore";
import { useProgressStore } from "../../store/progressStore";
import { AxisEditor } from "../AxisEditor/AxisEditor";
import { AxisScaleSlider } from "../AxisScaleSlider/AxisScaleSlider";
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
  onGhostAccept?: (ghost: any) => void;
  onGhostDiscard?: (ghostId: number) => void;
}

export const SemanticCanvas: React.FC<SemanticCanvasProps> = ({
  onSelectionChange,
  regionHighlights = [],
  onGenerateFromRegion,
  pendingImages = [],
  onAcceptPending,
  onDiscardPending,
  onGhostClick,
  onGhostAccept,
  onGhostDiscard,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomTransformRef = useRef<d3.ZoomTransform | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const xScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null);
  const yScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null);
  const gridStretchRef = useRef<SVGGElement | null>(null);
  const dataCenterXRef = useRef(0);  // centerX in DATA space (data centroid)
  const dataCenterYRef = useRef(0);  // centerY in DATA space (data centroid)
  const coordScaleRef = useRef(1.0);
  const coordOffsetRef = useRef<number[]>([0, 0, 0]);
  const stretchPivotXRef = useRef(0);  // viewport-center pivot used for last stretch (data space)
  const stretchPivotYRef = useRef(0);

  // Subscribe only to the specific state we need
  const allImages = useAppStore((state) => state.images);
  const visualSettings = useAppStore((state) => state.visualSettings);
  const selectedImageIds = useAppStore((state) => state.selectedImageIds);
  const hoveredGroupId = useAppStore((state) => state.hoveredGroupId);
  const hoveredImageId = useAppStore((state) => state.hoveredImageId);
  const axisLabels = useAppStore((state) => state.axisLabels);
  const expandedConcepts = useAppStore((state) => state.expandedConcepts);
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

    // Capture prev settings before updating refs (needed for fast-path scale detection)
    const prevSettings = prevVisualSettingsRef.current;

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
      gridStretchRef.current = null;
      return;
    }

    // Fast path: only axis scale and/or image size changed → update nodes in-place, skip full SVG rebuild
    const scaleChanged = prevSettings.axisScaleX !== visualSettings.axisScaleX ||
                         prevSettings.axisScaleY !== visualSettings.axisScaleY;
    const sizeChanged = prevSettings.imageSize !== visualSettings.imageSize;
    const nothingElseChanged =
      prevSettings.imageOpacity === visualSettings.imageOpacity &&
      prevSettings.coordinateScale === visualSettings.coordinateScale &&
      prevSettings.layoutPadding === visualSettings.layoutPadding;
    const canFastPath = prevSettings !== visualSettings && !imagesChanged &&
                        nothingElseChanged && canvasBounds !== null &&
                        svgRef.current &&
                        xScaleRef.current && yScaleRef.current;

    if (canFastPath && (scaleChanged || sizeChanged)) {
      const svg = d3.select(svgRef.current);

      if (scaleChanged) {
        const axScaleX = visualSettings.axisScaleX ?? 1;
        const axScaleY = visualSettings.axisScaleY ?? 1;
        const cs = coordScaleRef.current;
        const co = coordOffsetRef.current;
        const xs = xScaleRef.current!;
        const ys = yScaleRef.current!;

        // Compute pivot from current zoom transform so stretch centers on viewport.
        // zoomTransformRef, xScaleRef, yScaleRef are all constant during slider
        // movement, so this value is stable (no drift).
        const W = svgRef.current!.clientWidth;
        const H = svgRef.current!.clientHeight;
        let pivotX = dataCenterXRef.current;
        let pivotY = dataCenterYRef.current;
        if (zoomTransformRef.current) {
          const T = zoomTransformRef.current;
          pivotX = xs.invert((W / 2 - T.x) / T.k);
          pivotY = ys.invert((H / 2 - T.y) / T.k);
        }
        stretchPivotXRef.current = pivotX;
        stretchPivotYRef.current = pivotY;

        // Reposition each image node individually (shoes stay same size)
        svg.selectAll(".image-node").each(function(d: any) {
          const bx = (d.coordinates[0] + co[0]) * cs;
          const by = (d.coordinates[1] + co[1]) * cs;
          const sx = pivotX + (bx - pivotX) * axScaleX;
          const sy = pivotY + (by - pivotY) * axScaleY;
          d3.select(this).attr("transform", `translate(${xs(sx)}, ${ys(sy)})`);
        });

        // Reposition ghost nodes
        svg.selectAll(".ghost-node").each(function(d: any) {
          const bx = (d.coordinates[0] + co[0]) * cs;
          const by = (d.coordinates[1] + co[1]) * cs;
          const sx = pivotX + (bx - pivotX) * axScaleX;
          const sy = pivotY + (by - pivotY) * axScaleY;
          d3.select(this).attr("transform", `translate(${xs(sx)}, ${ys(sy)})`);
        });

        // Update grid stretch group transform (pivot in screen coords)
        if (gridStretchRef.current) {
          const px_scr = xs(pivotX);
          const py_scr = ys(pivotY);
          d3.select(gridStretchRef.current).attr("transform",
            `translate(${px_scr},${py_scr}) scale(${axScaleX},${axScaleY}) translate(${-px_scr},${-py_scr})`
          );
        }
      }

      if (sizeChanged) {
        const newSize = visualSettings.imageSize;
        // Update each image node's inner rect (click area) and image (shoe)
        svg.selectAll(".image-node").each(function() {
          const node = d3.select(this);
          node.select("rect")
            .attr("x", -newSize / 2)
            .attr("y", -newSize * 0.3)
            .attr("width", newSize)
            .attr("height", newSize * 0.6);
          node.select("image")
            .attr("x", -newSize / 2)
            .attr("y", -newSize / 2)
            .attr("width", newSize)
            .attr("height", newSize);
        });

        // Update ghost node circles and icons
        svg.selectAll(".ghost-node").each(function(d: any) {
          if (d.isHaze) {
            d3.select(this).select(".haze-blob").attr("r", newSize * 1.6);
            d3.select(this).select(".haze-label").attr("y", newSize * 1.6 + 14);
          } else {
            d3.select(this).select("circle").attr("r", newSize / 2);
            d3.select(this).select("text").attr("font-size", newSize / 2);
          }
        });
      }

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

    // Haze gradient for isHaze ghost nodes (purple/violet — distinct from clusters/gaps)
    const hazeGrad = defs.append("radialGradient").attr("id", "haze-nebula");
    hazeGrad.append("stop").attr("offset", "0%").attr("stop-color", "#c084fc").attr("stop-opacity", 0.4);
    hazeGrad.append("stop").attr("offset", "55%").attr("stop-color", "#c084fc").attr("stop-opacity", 0.12);
    hazeGrad.append("stop").attr("offset", "100%").attr("stop-color", "#c084fc").attr("stop-opacity", 0);

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

    svg.call(zoom as any).on("dblclick.zoom", null);   // disable double-click-to-zoom
    zoomRef.current = zoom;

    // Restore previous zoom/pan state only if bounds were not reset.
    // When canvasBounds === null the view should re-fit to new data, not keep old pan/zoom.
    if (canvasBounds === null) {
      // Clear stored zoom so subsequent renders also start fresh
      zoomTransformRef.current = null;
    } else if (zoomTransformRef.current) {
      svg.call(zoom.transform as any, zoomTransformRef.current);
    }

    // Determine canvas bounds:
    // - If canvasBounds is null: Calculate from data (first generation, axis update, or manual reset)
    // - Otherwise: Use stored bounds (stable, prevents rescaling when adding images)
    let xMin, xMax, yMin, yMax;

    const coordScale = visualSettings.coordinateScale || 1.0;
    const coordOffset = visualSettings.coordinateOffset || [0, 0, 0];
    const axisScaleX = visualSettings.axisScaleX ?? 1.0;
    const axisScaleY = visualSettings.axisScaleY ?? 1.0;

    // Stretch-from-center transform: center + (base - center) * scale
    const baseCoords = images.map((d) => ({
      x: (d.coordinates[0] + coordOffset[0]) * coordScale,
      y: (d.coordinates[1] + coordOffset[1]) * coordScale,
    }));
    const xExtentBase = d3.extent(baseCoords, (d) => d.x) as [number, number];
    const yExtentBase = d3.extent(baseCoords, (d) => d.y) as [number, number];
    const centerX = images.length ? (xExtentBase[0] + xExtentBase[1]) / 2 : 0;
    const centerY = images.length ? (yExtentBase[0] + yExtentBase[1]) / 2 : 0;
    if (canvasBounds === null) {
      // Calculate bounds from BASE coordinates (stretch applied per-node via toStretched)
      console.log("📐 Calculating bounds from data extent");
      const xExtent = d3.extent(baseCoords, (d) => d.x) as [number, number];
      const yExtent = d3.extent(baseCoords, (d) => d.y) as [number, number];

      const paddingFactor = visualSettings.layoutPadding;
      const xRange = (xExtent[1] ?? 1) - (xExtent[0] ?? 0) || 1;
      const yRange = (yExtent[1] ?? 1) - (yExtent[0] ?? 0) || 1;
      const xPadding = Math.max(xRange * paddingFactor, 0.05);
      const yPadding = Math.max(yRange * paddingFactor, 0.05);

      xMin = (xExtent[0] ?? 0) - xPadding;
      xMax = (xExtent[1] ?? 1) + xPadding;
      yMin = (yExtent[0] ?? 0) - yPadding;
      yMax = (yExtent[1] ?? 1) + yPadding;

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

    // Store data-space center and coord params in refs (used by fast path)
    dataCenterXRef.current = centerX;
    dataCenterYRef.current = centerY;
    coordScaleRef.current = coordScale;
    coordOffsetRef.current = coordOffset;

    // Stretch-from-center helper: pivot is viewport center if zoomed, else data centroid
    let stretchPivotX = centerX;
    let stretchPivotY = centerY;
    if (zoomTransformRef.current && canvasBounds !== null) {
      const T = zoomTransformRef.current;
      stretchPivotX = xScale.invert((width / 2 - T.x) / T.k);
      stretchPivotY = yScale.invert((height / 2 - T.y) / T.k);
    }
    stretchPivotXRef.current = stretchPivotX;
    stretchPivotYRef.current = stretchPivotY;
    const toStretched = (x: number, y: number) => [
      stretchPivotX + (x - stretchPivotX) * axisScaleX,
      stretchPivotY + (y - stretchPivotY) * axisScaleY,
    ];

    // Grid stretch group: grid lines can be scaled via group transform (no "size" to preserve)
    const px_screen = xScale(stretchPivotX);
    const py_screen = yScale(stretchPivotY);
    const gridStretch = g.append("g").attr("class", "grid-stretch");
    gridStretchRef.current = gridStretch.node();
    gridStretch.attr("transform",
      `translate(${px_screen},${py_screen}) scale(${axisScaleX},${axisScaleY}) translate(${-px_screen},${-py_screen})`
    );
    const gridGroup = gridStretch.append("g").attr("class", "grid-lines")
      .style("pointer-events", "none");
    // Generate grid lines extending far beyond visible data range for "infinite" feel
    const xStep = d3.tickStep(xMin, xMax, 10);
    const yStep = d3.tickStep(yMin, yMax, 10);
    const xRange = xMax - xMin;
    const yRange = yMax - yMin;
    const gridXTicks: number[] = [];
    const gridYTicks: number[] = [];
    for (let x = Math.floor((xMin - xRange * 10) / xStep) * xStep; x <= xMax + xRange * 10; x += xStep) {
      gridXTicks.push(x);
    }
    for (let y = Math.floor((yMin - yRange * 10) / yStep) * yStep; y <= yMax + yRange * 10; y += yStep) {
      gridYTicks.push(y);
    }
    gridXTicks.forEach((x) => {
      gridGroup.append("line")
        .attr("x1", xScale(x)).attr("y1", -50000)
        .attr("x2", xScale(x)).attr("y2", 50000)
        .attr("stroke", "#21262d").attr("stroke-width", 1);
    });
    gridYTicks.forEach((y) => {
      gridGroup.append("line")
        .attr("x1", -50000).attr("y1", yScale(y))
        .attr("x2", 50000).attr("y2", yScale(y))
        .attr("stroke", "#21262d").attr("stroke-width", 1);
    });

    // Group for region highlights (behind images)
    const regionHighlightsGroup = g.append("g").attr("class", "region-highlights");

    // Group for genealogy lines (drawn in selection effect only for selected images)
    g.append("g").attr("class", "genealogy-lines");

    // Group for ghost nodes (preview suggestions at low opacity)
    const ghostGroup = g.append("g").attr("class", "ghost-nodes");

    // Render ghost nodes (apply same stretch transform as images)
    const ghostNodeElements = ghostGroup
      .selectAll(".ghost-node")
      .data(ghostNodes, (d: any) => d.id)
      .join("g")
      .attr("class", "ghost-node")
      .attr("id", (d) => `ghost-${d.id}`)
      .attr("transform", (d) => {
        const bx = (d.coordinates[0] + coordOffset[0]) * coordScale;
        const by = (d.coordinates[1] + coordOffset[1]) * coordScale;
        const [sx, sy] = toStretched(bx, by);
        return `translate(${xScale(sx)}, ${yScale(sy)})`;
      })
      .attr("opacity", (d: any) => d.isHaze ? 1.0 : 0.28)
      .style("cursor", "pointer");

    const ghostSize = visualSettings.imageSize;

    // Render: haze blob for isHaze nodes; preview image if available, else circle + sparkle
    ghostNodeElements.each(function(d: any) {
      const el = d3.select(this);
      if (d.isHaze) {
        // Haze rendering: soft radial gradient blob + description label
        const hazeR = ghostSize * 1.6;
        el.append("circle")
          .attr("class", "haze-blob")
          .attr("r", hazeR)
          .attr("fill", "url(#haze-nebula)")
          .attr("pointer-events", "visibleFill");
        const rawLabel = d.description || "Explore";
        const label = rawLabel.length > 30 ? rawLabel.slice(0, 28) + "…" : rawLabel;
        el.append("text")
          .attr("class", "haze-label")
          .attr("text-anchor", "middle")
          .attr("y", hazeR + 14)
          .attr("font-size", 10)
          .attr("fill", "rgba(192, 132, 252, 0.6)")
          .attr("pointer-events", "none")
          .text(label);
      } else if (d.previewBase64) {
        // Actual preview image at low opacity
        el.append("image")
          .attr("x", -ghostSize / 2)
          .attr("y", -ghostSize / 2)
          .attr("width", ghostSize)
          .attr("height", ghostSize)
          .attr("href", `data:image/jpeg;base64,${d.previewBase64}`)
          .attr("preserveAspectRatio", "xMidYMid meet");
      } else {
        // Fallback: dashed circle + sparkle
        el.append("circle")
          .attr("r", ghostSize / 2)
          .attr("fill", "none")
          .attr("stroke", "#58a6ff")
          .attr("stroke-width", 2)
          .attr("stroke-dasharray", "5,5");
        el.append("text")
          .attr("text-anchor", "middle")
          .attr("dy", "0.3em")
          .attr("font-size", ghostSize / 2)
          .text("✨");
      }
    });

    // Accept / Discard action group (shown on hover — non-haze nodes only)
    ghostNodeElements.filter((d: any) => !d.isHaze).each(function() {
      const el = d3.select(this);
      const actionGroup = el.append("g")
        .attr("class", "ghost-actions")
        .attr("display", "none");

      // Accept button
      const acceptBg = actionGroup.append("rect")
        .attr("x", -ghostSize * 0.28)
        .attr("y", ghostSize * 0.28)
        .attr("width", ghostSize * 0.56)
        .attr("height", 22)
        .attr("rx", 11)
        .attr("fill", "rgba(52,211,153,0.85)")
        .style("cursor", "pointer");

      actionGroup.append("text")
        .attr("x", 0)
        .attr("y", ghostSize * 0.28 + 15)
        .attr("text-anchor", "middle")
        .attr("font-size", 11)
        .attr("fill", "#0d1117")
        .attr("font-weight", "bold")
        .attr("pointer-events", "none")
        .text("✓ Accept");

      // Discard button (top-right X)
      const discardBg = actionGroup.append("circle")
        .attr("cx", ghostSize * 0.38)
        .attr("cy", -ghostSize * 0.38)
        .attr("r", 11)
        .attr("fill", "rgba(248,81,73,0.85)")
        .style("cursor", "pointer");

      actionGroup.append("text")
        .attr("x", ghostSize * 0.38)
        .attr("y", -ghostSize * 0.38 + 5)
        .attr("text-anchor", "middle")
        .attr("font-size", 13)
        .attr("fill", "white")
        .attr("pointer-events", "none")
        .text("×");

      acceptBg.on("click", function(event) {
        event.stopPropagation();
        const d = d3.select((this as any).parentNode!.parentNode!).datum() as any;
        if (onGhostAccept) onGhostAccept(d);
      });

      discardBg.on("click", function(event) {
        event.stopPropagation();
        const d = d3.select((this as any).parentNode!.parentNode!).datum() as any;
        if (onGhostDiscard) onGhostDiscard(d.id);
      });
    });

    // Hover show/hide actions (haze: brighten label; non-haze: show action buttons)
    ghostNodeElements
      .on("mouseenter.ghost", function(_event, d: any) {
        if (d.isHaze) {
          d3.select(this).select(".haze-label").attr("fill", "rgba(192, 132, 252, 0.9)");
        } else {
          d3.select(this).attr("opacity", 0.75);
          d3.select(this).select(".ghost-actions").attr("display", null);
        }
      })
      .on("mouseleave.ghost", function(_event, d: any) {
        if (d.isHaze) {
          d3.select(this).select(".haze-label").attr("fill", "rgba(192, 132, 252, 0.6)");
        } else {
          d3.select(this).attr("opacity", 0.28);
          d3.select(this).select(".ghost-actions").attr("display", "none");
        }
      });

    // Click handler — also triggers accept for quick click
    ghostNodeElements.on("click", function(event, d) {
      event.stopPropagation();
      if (onGhostClick) onGhostClick(d);
    });

    // Group for images
    const imagesGroup = g.append("g").attr("class", "images");

    // Render images - pure CLIP semantic projection with axis stretch
    const imageSize = visualSettings.imageSize;

    const imageNodes = imagesGroup
      .selectAll(".image-node")
      .data(images, (d: any) => d.id)
      .join("g")
      .attr("class", "image-node")
      .attr("id", (d) => `image-${d.id}`)
      .attr("transform", (d) => {
        const bx = (d.coordinates[0] + coordOffset[0]) * coordScale;
        const by = (d.coordinates[1] + coordOffset[1]) * coordScale;
        const [sx, sy] = toStretched(bx, by);
        return `translate(${xScale(sx)}, ${yScale(sy)})`;
      });

    console.log("🎯 Attaching click handlers to", images.length, "image nodes");

    // Add invisible click area: full width, 60% vertical center (shoes are side-view, wide but not tall)
    imageNodes
      .append("rect")
      .attr("x", -imageSize / 2)
      .attr("y", -imageSize * 0.3)
      .attr("width", imageSize)
      .attr("height", imageSize * 0.6)
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
        .attr("transform", (d) => {
          const bx = (d.imageData.coordinates[0] + coordOffset[0]) * coordScale;
          const by = (d.imageData.coordinates[1] + coordOffset[1]) * coordScale;
          const [sx, sy] = toStretched(bx, by);
          return `translate(${xScale(sx)}, ${yScale(sy)})`;
        })
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
        // Region centers in data coordinates — apply stretch individually
        const [dataX, dataY] = region.center;
        const bx = (dataX + coordOffset[0]) * coordScale;
        const by = (dataY + coordOffset[1]) * coordScale;
        const [stretchedX, stretchedY] = toStretched(bx, by);
        const pixelX = xScale(stretchedX);
        const pixelY = yScale(stretchedY);

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
    ghostNodes,
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
    const axisScaleX = visualSettings.axisScaleX ?? 1.0;
    const axisScaleY = visualSettings.axisScaleY ?? 1.0;
    const bx = (img.coordinates[0] + coordOffset[0]) * coordScale;
    const by = (img.coordinates[1] + coordOffset[1]) * coordScale;
    // Apply stretch using the same pivot that was last used for positioning
    const pX = stretchPivotXRef.current;
    const pY = stretchPivotYRef.current;
    const sx = pX + (bx - pX) * axisScaleX;
    const sy = pY + (by - pY) * axisScaleY;
    const px = xScaleRef.current(sx);
    const py = yScaleRef.current(sy);

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

      {/* X-Axis: label centred at bottom edge, slider directly below */}
      <div style={{
        position: "absolute",
        bottom: 12,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        pointerEvents: "auto",
      }}>
        <AxisEditor
          axis="x"
          negativeLabel={axisLabels.x[0]}
          positiveLabel={axisLabels.x[1]}
          onUpdate={async (negative, positive) => {
            try {
              useProgressStore.getState().showProgress("reprojecting", "Computing embeddings & reprojecting...", false);
              useAppStore.getState().resetCanvasBounds();
              await apiClient.updateAxes({
                x_negative: negative,
                x_positive: positive,
                y_negative: axisLabels.y[0],
                y_positive: axisLabels.y[1],
              });
              useProgressStore.getState().updateProgress(70, "Updating canvas...");
              const state = await apiClient.getState();
              useAppStore.setState({ axisLabels: { ...axisLabels, x: [negative, positive] as [string, string] } });
              useAppStore.getState().setImages(state.images);
              if (state.expanded_concepts) useAppStore.getState().setExpandedConcepts(state.expanded_concepts);
              useProgressStore.getState().updateProgress(100);
              useProgressStore.getState().hideProgress();
            } catch (error) {
              useProgressStore.getState().hideProgress();
              alert(`Failed to update X-axis: ${error}`);
            }
          }}
          expandedNegative={expandedConcepts?.x_negative}
          expandedPositive={expandedConcepts?.x_positive}
        />
        <AxisScaleSlider
          axis="x"
          value={visualSettings.axisScaleX ?? 1}
          onChange={(v) => useAppStore.getState().updateVisualSettings({ axisScaleX: v })}
        />
      </div>

      {/* Y-Axis scale slider: same fixed-size pattern as right-edge size slider, mirrored to left */}
      <div style={{
        position: "absolute",
        left: 12,
        top: "50%",
        transform: "translateY(-50%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 140,
        pointerEvents: "auto",
      }}>
        <div style={{ transform: "rotate(-90deg)", width: 140, flexShrink: 0 }}>
          <AxisScaleSlider
            axis="y"
            value={visualSettings.axisScaleY ?? 1}
            onChange={(v) => useAppStore.getState().updateVisualSettings({ axisScaleY: v })}
            compact
          />
        </div>
      </div>

      {/* Y-Axis label: independent container just right of the slider, same fixed-box rotation pattern */}
      <div style={{
        position: "absolute",
        left: 44,
        top: "50%",
        transform: "translateY(-50%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 36,
        height: 260,
        overflow: "visible",
        pointerEvents: "auto",
      }}>
        <div style={{ transform: "rotate(-90deg)", whiteSpace: "nowrap", flexShrink: 0 }}>
          <AxisEditor
            axis="y"
            negativeLabel={axisLabels.y[0]}
            positiveLabel={axisLabels.y[1]}
            onUpdate={async (negative, positive) => {
              try {
                useProgressStore.getState().showProgress("reprojecting", "Computing embeddings & reprojecting...", false);
                useAppStore.getState().resetCanvasBounds();
                await apiClient.updateAxes({
                  x_negative: axisLabels.x[0],
                  x_positive: axisLabels.x[1],
                  y_negative: negative,
                  y_positive: positive,
                });
                useProgressStore.getState().updateProgress(70, "Updating canvas...");
                const state = await apiClient.getState();
                useAppStore.setState({ axisLabels: { ...axisLabels, y: [negative, positive] as [string, string] } });
                useAppStore.getState().setImages(state.images);
                if (state.expanded_concepts) useAppStore.getState().setExpandedConcepts(state.expanded_concepts);
                useProgressStore.getState().updateProgress(100);
                useProgressStore.getState().hideProgress();
              } catch (error) {
                useProgressStore.getState().hideProgress();
                alert(`Failed to update Y-axis: ${error}`);
              }
            }}
            expandedNegative={expandedConcepts?.y_negative}
            expandedPositive={expandedConcepts?.y_positive}
          />
        </div>
      </div>

      {/* Image size slider: vertical bar at right edge (12px from edge) */}
      <div style={{
        position: "absolute",
        right: 12,
        top: "50%",
        transform: "translateY(-50%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 140,
        pointerEvents: "auto",
      }}>
        <div style={{ transform: "rotate(-90deg)", width: 140, flexShrink: 0 }}>
          <AxisScaleSlider
            axis="size"
            value={visualSettings.imageSize}
            onChange={(v) => useAppStore.getState().updateVisualSettings({ imageSize: Math.round(v) })}
            compact
            minVal={100}
            maxVal={500}
            isLinear
            unit="px"
          />
        </div>
      </div>

      {/* Recenter / fit-all button */}
      <button
        style={{
          position: "absolute",
          bottom: regionHighlights.length > 0 ? 100 : 60,
          right: 16,
          background: "rgba(22, 27, 34, 0.85)",
          backdropFilter: "blur(6px)",
          border: "1px solid rgba(48, 54, 61, 0.6)",
          borderRadius: 6,
          color: "#c9d1d9",
          fontSize: 12,
          padding: "6px 12px",
          cursor: "pointer",
          pointerEvents: "auto",
          opacity: 0.7,
          transition: "opacity 0.2s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.7")}
        onClick={() => {
          // Reset bounds + clear zoom so the view re-fits all shoes
          zoomTransformRef.current = null;
          useAppStore.getState().resetCanvasBounds();
          // Also reset axis scales to 1x
          useAppStore.getState().updateVisualSettings({ axisScaleX: 1.0, axisScaleY: 1.0 });
        }}
        title="Recenter canvas to fit all shoes"
      >
        Recenter
      </button>

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
