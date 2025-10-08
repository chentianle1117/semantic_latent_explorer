/**
 * Semantic Canvas Component - D3-based interactive visualization
 * Optimized to prevent canvas shifting on selection changes
 */

import React, { useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import { useAppStore } from "../../store/appStore";
import { AxisEditor } from "../AxisEditor/AxisEditor";
import { apiClient } from "../../api/client";
import type { ImageData } from "../../types";

interface SemanticCanvasProps {
  onSelectionChange: (x: number, y: number, count: number) => void;
}

export const SemanticCanvas: React.FC<SemanticCanvasProps> = ({
  onSelectionChange,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomTransformRef = useRef<d3.ZoomTransform | null>(null);

  // Subscribe only to the specific state we need
  const allImages = useAppStore((state) => state.images);
  const visualSettings = useAppStore((state) => state.visualSettings);
  const selectedImageIds = useAppStore((state) => state.selectedImageIds);
  const hoveredGroupId = useAppStore((state) => state.hoveredGroupId);
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

  // Main rendering effect - ONLY for full redraws (images, visualSettings, axisLabels change)
  useEffect(() => {
    const imagesChanged = prevImagesRef.current !== images;
    const visualSettingsChanged =
      prevVisualSettingsRef.current !== visualSettings;

    console.log("🔄 Canvas FULL render effect triggered", {
      imagesCount: images.length,
      imagesChanged,
      visualSettingsChanged,
      hasSvgRef: !!svgRef.current,
    });

    prevImagesRef.current = images;
    prevVisualSettingsRef.current = visualSettings;

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

    // Restore previous zoom/pan state
    if (zoomTransformRef.current) {
      svg.call(zoom.transform as any, zoomTransformRef.current);
    }

    // Determine canvas bounds:
    // - If canvasBounds is null: Calculate from data (first generation, axis update, or manual reset)
    // - Otherwise: Use stored bounds (stable, prevents rescaling when adding images)
    let xMin, xMax, yMin, yMax;

    if (canvasBounds === null) {
      // Calculate from data extent
      console.log("📐 Calculating bounds from data extent");
      const xExtent = d3.extent(images, (d) => d.coordinates[0]) as [number, number];
      const yExtent = d3.extent(images, (d) => d.coordinates[1]) as [number, number];

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

    // Group for grid lines (behind everything)
    const gridGroup = g.append("g").attr("class", "grid-lines");

    // Draw grid lines using adaptive spacing based on bounds
    const dataRangeX = xMax - xMin;
    const dataRangeY = yMax - yMin;

    // Aim for ~12 grid lines across the visible range
    const targetLineCount = 12;
    const gridSpacingX = dataRangeX / targetLineCount;
    const gridSpacingY = dataRangeY / targetLineCount;

    const gridColor = "#30363d";
    const gridOpacity = 0.25;

    // Calculate grid bounds with extra padding
    const gridXMin = Math.floor(xMin / gridSpacingX) * gridSpacingX - gridSpacingX * 2;
    const gridXMax = Math.ceil(xMax / gridSpacingX) * gridSpacingX + gridSpacingX * 2;
    const gridYMin = Math.floor(yMin / gridSpacingY) * gridSpacingY - gridSpacingY * 2;
    const gridYMax = Math.ceil(yMax / gridSpacingY) * gridSpacingY + gridSpacingY * 2;

    // Vertical grid lines
    for (let x = gridXMin; x <= gridXMax; x += gridSpacingX) {
      gridGroup
        .append("line")
        .attr("x1", xScale(x))
        .attr("y1", yScale(gridYMin))
        .attr("x2", xScale(x))
        .attr("y2", yScale(gridYMax))
        .attr("stroke", gridColor)
        .attr("stroke-width", 1)
        .attr("opacity", gridOpacity);
    }

    // Horizontal grid lines
    for (let y = gridYMin; y <= gridYMax; y += gridSpacingY) {
      gridGroup
        .append("line")
        .attr("x1", xScale(gridXMin))
        .attr("y1", yScale(y))
        .attr("x2", xScale(gridXMax))
        .attr("y2", yScale(y))
        .attr("stroke", gridColor)
        .attr("stroke-width", 1)
        .attr("opacity", gridOpacity);
    }

    // Group for genealogy lines
    const linesGroup = g.append("g").attr("class", "genealogy-lines");

    // Group for images
    const imagesGroup = g.append("g").attr("class", "images");

    // Removed axis line rendering; labels remain via AxisEditor components

    // Function to draw genealogy lines
    const drawGenealogy = (imgData: ImageData) => {
      linesGroup.selectAll("*").remove();

      const currentX = xScale(imgData.coordinates[0]);
      const currentY = yScale(imgData.coordinates[1]);

      // Draw parent lines (green)
      imgData.parents.forEach((parentId) => {
        const parent = images.find((img) => img.id === parentId);
        if (!parent) return;

        const parentX = xScale(parent.coordinates[0]);
        const parentY = yScale(parent.coordinates[1]);
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
          .attr("stroke-width", 3)
          .attr("stroke-dasharray", "8,4")
          .attr("fill", "none")
          .attr("opacity", 0.8);

        imagesGroup
          .select(`#image-${parentId} .image-border`)
          .attr("stroke", "#3fb950")
          .attr("stroke-width", 3)
          .attr("opacity", 1);
      });

      // Draw child lines (orange)
      imgData.children.forEach((childId) => {
        const child = images.find((img) => img.id === childId);
        if (!child) return;

        const childX = xScale(child.coordinates[0]);
        const childY = yScale(child.coordinates[1]);
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
          .attr("stroke-width", 2.5)
          .attr("stroke-dasharray", "8,4")
          .attr("fill", "none")
          .attr("opacity", 0.8);

        imagesGroup
          .select(`#image-${childId} .image-border`)
          .attr("stroke", "#d29922")
          .attr("stroke-width", 3)
          .attr("opacity", 1);
      });
    };

    // Clear genealogy
    const clearGenealogy = () => {
      linesGroup.selectAll("*").remove();
      imagesGroup.selectAll(".image-border").attr("opacity", 0);
    };

    // Render images
    const imageSize = visualSettings.imageSize;
    const imageNodes = imagesGroup
      .selectAll(".image-node")
      .data(images, (d: any) => d.id)
      .join("g")
      .attr("class", "image-node")
      .attr("id", (d) => `image-${d.id}`)
      .attr(
        "transform",
        (d) =>
          `translate(${xScale(d.coordinates[0])}, ${yScale(d.coordinates[1])})`
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

        toggleImageSelection(d.id, false);

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
        console.log("👆 Mouse enter image:", d.id, "parents:", d.parents, "children:", d.children);
        d3.select(this.parentNode as SVGGElement)
          .select(".hover-border")
          .attr("stroke", "#58a6ff")
          .attr("stroke-width", 3)
          .attr("opacity", 1);

        // Only show hover genealogy if no images are selected
        const currentSelection = useAppStore.getState().selectedImageIds;
        if (currentSelection.length === 0) {
          console.log("Drawing genealogy for hover on image", d.id);
          drawGenealogy(d);
          console.log("Genealogy lines drawn:", linesGroup.selectAll("path").size());
        } else {
          console.log("Selection exists, skipping hover genealogy");
        }
        // Don't update store - it causes re-renders
      })
      .on("mouseleave", function () {
        console.log("👋 Mouse leave");
        d3.select(this.parentNode as SVGGElement)
          .select(".hover-border")
          .attr("opacity", 0);

        // Only clear if no selection
        const currentSelection = useAppStore.getState().selectedImageIds;
        if (currentSelection.length === 0) {
          console.log("Clearing hover genealogy");
          clearGenealogy();
        }
        // Don't update store - it causes re-renders
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

    // Hover border
    imageNodes
      .append("rect")
      .attr("class", "hover-border")
      .attr("x", -imageSize / 2 - 2)
      .attr("y", -imageSize / 2 - 2)
      .attr("width", imageSize + 4)
      .attr("height", imageSize + 4)
      .attr("rx", 8)
      .attr("fill", "none")
      .attr("stroke", "#58a6ff")
      .attr("stroke-width", 3)
      .attr("opacity", 0)
      .style("pointer-events", "none");

    // Selection border
    imageNodes
      .append("rect")
      .attr("class", "selection-border")
      .attr("x", -imageSize / 2 - 3)
      .attr("y", -imageSize / 2 - 3)
      .attr("width", imageSize + 6)
      .attr("height", imageSize + 6)
      .attr("rx", 8)
      .attr("fill", "none")
      .attr("stroke", "#ff0000")
      .attr("stroke-width", 5)
      .attr("opacity", 0)
      .style("pointer-events", "none");

    // Parent/child highlighting border
    imageNodes
      .append("rect")
      .attr("class", "image-border")
      .attr("x", -imageSize / 2 - 2)
      .attr("y", -imageSize / 2 - 2)
      .attr("width", imageSize + 4)
      .attr("height", imageSize + 4)
      .attr("rx", 8)
      .attr("fill", "none")
      .attr("stroke-width", 3)
      .attr("opacity", 0)
      .style("pointer-events", "none");

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
    });

    // Only clear genealogy lines if we have a selection or hovered group
    // This allows hover genealogy to persist when there's no selection
    if (selectedImageIds.length > 0 || hoveredGroupId) {
      linesGroup.selectAll("*").remove();
    }

    // Reset all borders
    imagesGroup.selectAll(".image-border").attr("opacity", 0);
    imagesGroup
      .selectAll(".selection-border")
      .attr("stroke", "#ff0000")
      .attr("opacity", 0)
      .style("filter", "none");

    // Update selection borders
    selectedImageIds.forEach((id) => {
      imagesGroup.select(`#image-${id} .selection-border`).attr("opacity", 1);
    });

    // Highlight images in hovered group
    if (hoveredGroupId) {
      imagesGroup.selectAll(".image-node").each(function (d: any) {
        if (d.group_id === hoveredGroupId) {
          d3.select(this)
            .select(".selection-border")
            .attr("stroke", "#ff0000")
            .attr("opacity", 0.8)
            .style("filter", "drop-shadow(0 0 12px rgba(255, 0, 0, 0.6))");
        }
      });
    }

    // Show genealogy for selected images
    if (selectedImageIds.length > 0) {
      selectedImageIds.forEach((selectedId) => {
        const selectedImg = images.find((img) => img.id === selectedId);
        if (selectedImg) {
          // Use same bounds as main render for consistency
          const width = svgRef.current!.clientWidth;
          const height = svgRef.current!.clientHeight;
          const currentBounds = useAppStore.getState().canvasBounds;

          let xMin2, xMax2, yMin2, yMax2;
          if (currentBounds) {
            ({ xMin: xMin2, xMax: xMax2, yMin: yMin2, yMax: yMax2 } = currentBounds);
          } else {
            // Fallback to data extent if bounds not set
            const xExtent = d3.extent(images, (d) => d.coordinates[0]) as [number, number];
            const yExtent = d3.extent(images, (d) => d.coordinates[1]) as [number, number];
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

          const currentX = xScale(selectedImg.coordinates[0]);
          const currentY = yScale(selectedImg.coordinates[1]);

          // Draw parent lines
          selectedImg.parents.forEach((parentId) => {
            const parent = images.find((img) => img.id === parentId);
            if (!parent) return;

            const parentX = xScale(parent.coordinates[0]);
            const parentY = yScale(parent.coordinates[1]);
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
              .attr("stroke-width", 3)
              .attr("stroke-dasharray", "8,4")
              .attr("fill", "none")
              .attr("opacity", 0.8);

            imagesGroup
              .select(`#image-${parentId} .image-border`)
              .attr("stroke", "#3fb950")
              .attr("stroke-width", 3)
              .attr("opacity", 1);
          });

          // Draw child lines
          selectedImg.children.forEach((childId) => {
            const child = images.find((img) => img.id === childId);
            if (!child) return;

            const childX = xScale(child.coordinates[0]);
            const childY = yScale(child.coordinates[1]);
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
              .attr("stroke-width", 2.5)
              .attr("stroke-dasharray", "8,4")
              .attr("fill", "none")
              .attr("opacity", 0.8);

            imagesGroup
              .select(`#image-${childId} .image-border`)
              .attr("stroke", "#d29922")
              .attr("stroke-width", 3)
              .attr("opacity", 1);
          });
        }
      });
    }
  }, [selectedImageIds, hoveredGroupId, images]);

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
