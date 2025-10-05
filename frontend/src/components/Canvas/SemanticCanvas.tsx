/**
 * Semantic Canvas Component - D3-based interactive visualization
 * Matches artifact interaction model exactly
 */

import React, { useEffect, useRef } from "react";
import * as d3 from "d3";
import { useAppStore } from "../../store/appStore";
import type { ImageData } from "../../types";

interface SemanticCanvasProps {
  onContextMenu: (x: number, y: number) => void;
  onSelectionChange: (x: number, y: number, count: number) => void;
}

export const SemanticCanvas: React.FC<SemanticCanvasProps> = ({
  onContextMenu,
  onSelectionChange,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomTransformRef = useRef<d3.ZoomTransform | null>(null); // Store zoom state
  const images = useAppStore((state) =>
    state.images.filter((img) => img.visible)
  );
  const visualSettings = useAppStore((state) => state.visualSettings);
  const selectedImageIds = useAppStore((state) => state.selectedImageIds);
  const hoveredGroupId = useAppStore((state) => state.hoveredGroupId);
  const axisLabels = useAppStore((state) => state.axisLabels);

  const toggleImageSelection = useAppStore(
    (state) => state.toggleImageSelection
  );
  const setHoveredImageId = useAppStore((state) => state.setHoveredImageId);

  useEffect(() => {
    if (!svgRef.current || images.length === 0) return;

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

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
        zoomTransformRef.current = event.transform; // Save zoom state
      });

    svg.call(zoom as any);

    // Restore previous zoom/pan state if it exists
    if (zoomTransformRef.current) {
      svg.call(zoom.transform as any, zoomTransformRef.current);
    }

    // Calculate data extent
    const xExtent = d3.extent(images, (d) => d.coordinates[0]) as [
      number,
      number
    ];
    const yExtent = d3.extent(images, (d) => d.coordinates[1]) as [
      number,
      number
    ];

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

    // Line generator no longer needed - using path strings directly

    // Group for genealogy lines (drawn below images)
    const linesGroup = g.append("g").attr("class", "genealogy-lines");

    // Group for images
    const imagesGroup = g.append("g").attr("class", "images");

    // Function to draw genealogy lines for a specific image
    const drawGenealogy = (imgData: ImageData) => {
      linesGroup.selectAll("*").remove();

      const currentX = xScale(imgData.coordinates[0]);
      const currentY = yScale(imgData.coordinates[1]);

      // Draw parent lines (green, upstream)
      imgData.parents.forEach((parentId) => {
        const parent = images.find((img) => img.id === parentId);
        if (!parent) return;

        const parentX = xScale(parent.coordinates[0]);
        const parentY = yScale(parent.coordinates[1]);

        // Create curved path
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
          .attr("opacity", 0.8)
          .attr("class", "genealogy-arrow");

        // Highlight parent with green border
        imagesGroup
          .select(`#image-${parentId} .image-border`)
          .attr("stroke", "#3fb950")
          .attr("stroke-width", 3)
          .attr("opacity", 1);
      });

      // Draw child lines (orange, downstream)
      imgData.children.forEach((childId) => {
        const child = images.find((img) => img.id === childId);
        if (!child) return;

        const childX = xScale(child.coordinates[0]);
        const childY = yScale(child.coordinates[1]);

        // Create curved path
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
          .attr("opacity", 0.8)
          .attr("class", "genealogy-arrow");

        // Highlight child with orange border
        imagesGroup
          .select(`#image-${childId} .image-border`)
          .attr("stroke", "#d29922")
          .attr("stroke-width", 3)
          .attr("opacity", 1);
      });
    };

    // Clear genealogy lines and highlights
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

    // Add invisible rounded rect for better click/hover area
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
        event.stopPropagation();

        // Toggle image in/out of selection (additive by default)
        toggleImageSelection(d.id, false);

        // Notify parent of selection change with position
        // Check the updated selection after toggle
        setTimeout(() => {
          const currentSelection = useAppStore.getState().selectedImageIds;
          const newCount = currentSelection.length;

          if (newCount > 0) {
            const rect = (this as SVGRectElement).getBoundingClientRect();
            onSelectionChange(rect.right + 10, rect.top, newCount);
          } else {
            onSelectionChange(0, 0, 0); // Hide panel
          }
        }, 0);
      })
      .on("contextmenu", function (e, d) {
        e.preventDefault();
        // Select the image if not already selected
        if (!selectedImageIds.includes(d.id)) {
          toggleImageSelection(d.id, false);
        }
        // Open context menu at mouse position
        onContextMenu(e.pageX, e.pageY);
      })
      .on("mouseenter", function (_event, d) {
        // Blue border on hover
        d3.select(this.parentNode as SVGGElement)
          .select(".hover-border")
          .attr("stroke", "#58a6ff")
          .attr("stroke-width", 3)
          .attr("opacity", 1);

        // Draw genealogy
        drawGenealogy(d);
        setHoveredImageId(d.id);
      })
      .on("mouseleave", function () {
        // Remove blue border
        d3.select(this.parentNode as SVGGElement)
          .select(".hover-border")
          .attr("opacity", 0);

        clearGenealogy();
        setHoveredImageId(null);
      });

    // Add image with rounded corners
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

    // Add border for hover (rounded rect)
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

    // Add border for selection (rounded rect)
    imageNodes
      .append("rect")
      .attr("class", "selection-border")
      .attr("x", -imageSize / 2 - 2)
      .attr("y", -imageSize / 2 - 2)
      .attr("width", imageSize + 4)
      .attr("height", imageSize + 4)
      .attr("rx", 8)
      .attr("fill", "none")
      .attr("stroke", "#ffa657")
      .attr("stroke-width", 3)
      .attr("opacity", 0)
      .style("pointer-events", "none");

    // Update selection borders based on current selection
    imageNodes.each(function (d) {
      d3.select(this)
        .select(".selection-border")
        .attr("opacity", selectedImageIds.includes(d.id) ? 1 : 0);
    });

    // Add border for parent/child highlighting (rounded rect)
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

    // Highlight images in hovered group
    if (hoveredGroupId) {
      imageNodes.each(function (d) {
        if (d.group_id === hoveredGroupId) {
          d3.select(this)
            .select(".selection-border")
            .attr("stroke", "#ffa657")
            .attr("opacity", 0.8)
            .style("filter", "drop-shadow(0 0 12px rgba(255, 166, 87, 0.6))");
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

    // Click on canvas background to deselect all
    svg.on("click", (event) => {
      const target = event.target as Element;
      // Check if clicking on background (svg or main-group, not image-node or its children)
      if (target.tagName === 'svg' || target.classList?.contains('main-group')) {
        useAppStore.getState().clearSelection();
        onSelectionChange(0, 0, 0); // Close floating panel
      }
    });

    // Also allow clicking on the main group to deselect
    g.on("click", (event) => {
      const target = event.target as Element;
      if (target === event.currentTarget) {
        useAppStore.getState().clearSelection();
        onSelectionChange(0, 0, 0); // Close floating panel
      }
    });
  }, [
    images,
    visualSettings,
    selectedImageIds,
    hoveredGroupId,
    toggleImageSelection,
    setHoveredImageId,
    onContextMenu,
  ]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg
        ref={svgRef}
        style={{ width: "100%", height: "100%", background: "#0d1117" }}
      />

      {/* Axis Labels */}
      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(88, 166, 255, 0.1)",
          border: "1px solid #58a6ff",
          padding: "8px 16px",
          borderRadius: "6px",
          fontSize: "13px",
          cursor: "pointer",
        }}
        onClick={async () => {
          const newLabel = prompt(
            `Edit X-axis:\nFormat: "negative ... positive"`,
            `${axisLabels.x[0]} ... ${axisLabels.x[1]}`
          );
          if (newLabel) {
            const parts = newLabel.split("...").map((s) => s.trim());
            if (parts.length === 2) {
              const newLabels = {
                ...axisLabels,
                x: [parts[0], parts[1]] as [string, string],
              };
              useAppStore.setState({ axisLabels: newLabels });

              // Call backend API to reorganize images with correct format
              try {
                console.log("Updating X-axis:", parts[0], "...", parts[1]);
                const { apiClient } = await import("../../api/client");
                await apiClient.updateAxes({
                  x_negative: parts[0],
                  x_positive: parts[1],
                  y_negative: axisLabels.y[0],
                  y_positive: axisLabels.y[1],
                });

                // Refresh state to get new coordinates
                const state = await apiClient.getState();
                useAppStore.getState().setImages(state.images);
                console.log("X-axis updated successfully");
                alert("X-axis updated! Images reorganized.");
              } catch (error) {
                console.error("Failed to update X-axis:", error);
                alert(
                  `Failed to update X-axis: ${error}`
                );
              }
            } else {
              alert('Invalid format. Please use "negative ... positive"');
            }
          }
        }}
      >
        ← {axisLabels.x[0]} ... {axisLabels.x[1]} →
      </div>

      <div
        style={{
          position: "absolute",
          left: 20,
          top: "50%",
          transform: "translateY(-50%) rotate(-90deg)",
          transformOrigin: "center",
          background: "rgba(88, 166, 255, 0.1)",
          border: "1px solid #58a6ff",
          padding: "8px 16px",
          borderRadius: "6px",
          fontSize: "13px",
          cursor: "pointer",
        }}
        onClick={async () => {
          const newLabel = prompt(
            `Edit Y-axis:\nFormat: "negative ... positive"`,
            `${axisLabels.y[0]} ... ${axisLabels.y[1]}`
          );
          if (newLabel) {
            const parts = newLabel.split("...").map((s) => s.trim());
            if (parts.length === 2) {
              const newLabels = {
                ...axisLabels,
                y: [parts[0], parts[1]] as [string, string],
              };
              useAppStore.setState({ axisLabels: newLabels });

              // Call backend API to reorganize images with correct format
              try {
                console.log("Updating Y-axis:", parts[0], "...", parts[1]);
                const { apiClient } = await import("../../api/client");
                await apiClient.updateAxes({
                  x_negative: axisLabels.x[0],
                  x_positive: axisLabels.x[1],
                  y_negative: parts[0],
                  y_positive: parts[1],
                });

                // Refresh state to get new coordinates
                const state = await apiClient.getState();
                useAppStore.getState().setImages(state.images);
                console.log("Y-axis updated successfully");
                alert("Y-axis updated! Images reorganized.");
              } catch (error) {
                console.error("Failed to update Y-axis:", error);
                alert(
                  `Failed to update Y-axis: ${error}`
                );
              }
            } else {
              alert('Invalid format. Please use "negative ... positive"');
            }
          }
        }}
      >
        ← {axisLabels.y[0]} ... {axisLabels.y[1]} →
      </div>
    </div>
  );
};
