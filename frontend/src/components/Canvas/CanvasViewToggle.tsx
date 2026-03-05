/**
 * CanvasViewToggle — segmented control to switch between Semantic and Lineage canvas views.
 * Floats in the top-right area of the canvas container.
 */
import React from "react";
import { useAppStore } from "../../store/appStore";
import "./CanvasViewToggle.css";

export const CanvasViewToggle: React.FC = () => {
  const mode = useAppStore((s) => s.canvasViewMode);
  const setMode = useAppStore((s) => s.setCanvasViewMode);

  return (
    <div className="canvas-view-toggle">
      <button
        className={`cvt-btn ${mode === "semantic" ? "cvt-active" : ""}`}
        onClick={() => setMode("semantic")}
        title="Semantic map view"
      >
        Semantic
      </button>
      <button
        className={`cvt-btn ${mode === "lineage" ? "cvt-active" : ""}`}
        onClick={() => setMode("lineage")}
        title="Lineage tree view"
      >
        Lineage
      </button>
    </div>
  );
};
