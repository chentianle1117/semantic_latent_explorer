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

  // Memoize filtered images to prevent new array on every render
  const images = useMemo(
    () => allImages.filter((img) => img.visible),
    [allImages]
  );

  // Get functions directly from store without subscribing to state changes
  const toggleImageSelection = React.useCallback((id: number, ctrlKey: boolean) => {
    useAppStore.getState().toggleImageSelection(id, ctrlKey);
  }, []);

  // Don't call setHoveredImageId - it causes unnecessary store updates and re-renders
  // We handle hover state locally through D3 DOM manipulation

  // Track previous values to see what changed
  const prevImagesRef = React.useRef(images);
  const prevVisualSettingsRef = React.useRef(visualSettings);
  const prevSelectedIdsRef = React.useRef(selectedImageIds);
  const prevHoveredGroupRef = React.useRef(hoveredGroupId);

  // Main rendering effect - includes selectedImageIds for proper updates
  useEffect(() => {
    const changes = {
      images: prevImagesRef.current !== images,
      visualSettings: prevVisualSettingsRef.current !== visualSettings,
      selectedIds: prevSelectedIdsRef.current !== selectedImageIds,
      hoveredGroup: prevHoveredGroupRef.current !== hoveredGroupId,
    };

    console.log("🔄 Canvas render effect triggered", {
      imagesCount: images.length,
      selectedCount: selectedImageIds.length,
      selectedIds: selectedImageIds,
      hoveredGroupId: hoveredGroupId,
      hasSvgRef: !!svgRef.current,
      whatChanged: changes
    });

    prevImagesRef.current = images;
    prevVisualSettingsRef.current = visualSettings;
    prevSelectedIdsRef.current = selectedImageIds;
    prevHoveredGroupRef.current = hoveredGroupId;

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

    console.log("🎨 Rendering canvas:", { width, height, imageCount: images.length });

    // Clear previous content
    svg.selectAll("*").remove();

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

    // Calculate data extent
    const xExtent = d3.extent(images, (d) => d.coordinates[0]) as [number, number];
    const yExtent = d3.extent(images, (d) => d.coordinates[1]) as [number, number];

    // Add padding
    const xPadding = (xExtent[1] - xExtent[0]) * 0.1 || 1;
    const yPadding = (yExtent[1] - yExtent[0]) * 0.1 || 1;

    // Create scales
    const xScale = d3
      .scaleLinear()
      .domain([xExtent[0] - xPadding, xExtent[1] + xPadding])
      .range([50, width - 50]);

    const yScale = d3
      .scaleLinear()
      .domain([yExtent[0] - yPadding, yExtent[1] + yPadding])
      .range([height - 50, 50]);

    // Group for genealogy lines
    const linesGroup = g.append("g").attr("class", "genealogy-lines");

    // Group for images
    const imagesGroup = g.append("g").attr("class", "images");

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
          currentTarget: event.currentTarget
        });

        event.stopPropagation();

        console.log("📝 Before toggle - selected IDs:", useAppStore.getState().selectedImageIds);
        toggleImageSelection(d.id, false);

        setTimeout(() => {
          const currentSelection = useAppStore.getState().selectedImageIds;
          console.log("📝 After toggle - selected IDs:", currentSelection);
          const newCount = currentSelection.length;

          if (newCount > 0) {
            const rect = (this as SVGRectElement).getBoundingClientRect();
            console.log("✅ Calling onSelectionChange with count:", newCount);
            onSelectionChange(rect.right + 10, rect.top, newCount);
          } else {
            console.log("❌ No selection, closing panel");
            onSelectionChange(0, 0, 0);
          }
        }, 0);
      })
      .on("mouseenter", function (_event, d) {
        console.log("👆 Mouse enter image:", d.id);
        d3.select(this.parentNode as SVGGElement)
          .select(".hover-border")
          .attr("stroke", "#58a6ff")
          .attr("stroke-width", 3)
          .attr("opacity", 1);

        drawGenealogy(d);
        // Don't update store - it causes re-renders
      })
      .on("mouseleave", function () {
        console.log("👋 Mouse leave");
        d3.select(this.parentNode as SVGGElement)
          .select(".hover-border")
          .attr("opacity", 0);

        clearGenealogy();
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

    // Update selection borders based on current selection state
    imageNodes.each(function (d) {
      d3.select(this)
        .select(".selection-border")
        .attr("opacity", selectedImageIds.includes(d.id) ? 1 : 0);
    });

    // Highlight images in hovered group
    if (hoveredGroupId) {
      imageNodes.each(function (d) {
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
          drawGenealogy(selectedImg);
        }
      });
    }

    // Click on canvas background to deselect
    svg.on("click", (event) => {
      const target = event.target as Element;
      if (target.tagName === 'svg' || target.classList?.contains('main-group')) {
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
    selectedImageIds,
    hoveredGroupId,
    // Note: Excluded function refs (toggleImageSelection, setHoveredImageId, onSelectionChange)
    // as they are stable and including them causes infinite render loops
  ]);

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
          const newLabels = {
            ...axisLabels,
            x: [negative, positive] as [string, string],
          };
          useAppStore.setState({ axisLabels: newLabels });

          try {
            await apiClient.updateAxes({
              x_negative: negative,
              x_positive: positive,
              y_negative: axisLabels.y[0],
              y_positive: axisLabels.y[1],
            });

            const state = await apiClient.getState();
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
          const newLabels = {
            ...axisLabels,
            y: [negative, positive] as [string, string],
          };
          useAppStore.setState({ axisLabels: newLabels });

          try {
            await apiClient.updateAxes({
              x_negative: axisLabels.x[0],
              x_positive: axisLabels.x[1],
              y_negative: negative,
              y_positive: positive,
            });

            const state = await apiClient.getState();
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
