/**
 * Floating Action Panel - Appears next to selected images
 * Matches HTML mockup interaction model
 */

import React from "react";
import "./FloatingActionPanel.css";

interface FloatingActionPanelProps {
  x: number;
  y: number;
  selectedCount: number;
  onGenerateFromReference: () => void;
  onInterpolate?: () => void;
  onViewDetails: () => void;
  onRemove: () => void;
  onClearSelection: () => void;
}

export const FloatingActionPanel: React.FC<FloatingActionPanelProps> = ({
  x,
  y,
  selectedCount,
  onGenerateFromReference,
  onInterpolate,
  onViewDetails,
  onRemove,
  onClearSelection,
}) => {
  console.log("🎨 FloatingActionPanel rendering at:", {
    x,
    y,
    left: x + 60,
    top: y,
    selectedCount,
    hasInterpolate: !!onInterpolate
  });

  return (
    <div
      className="floating-action-panel"
      style={{
        left: `${x + 60}px`, // Offset from image
        top: `${y}px`,
      }}
    >
      {selectedCount === 1 && (
        <>
          <button
            className="action-item primary"
            onClick={onGenerateFromReference}
          >
            ✨ Generate with prompt...
          </button>
          <button className="action-item" onClick={onViewDetails}>
            🔍 View details
          </button>
          <div className="action-divider" />
          <button className="action-item danger" onClick={onRemove}>
            🗑️ Remove from space
          </button>
        </>
      )}

      {selectedCount === 2 && (
        <>
          {onInterpolate ? (
            <button className="action-item primary" onClick={onInterpolate}>
              🔀 Interpolate between (2 selected)
            </button>
          ) : (
            <div
              style={{
                padding: "8px 16px",
                fontSize: "11px",
                color: "#8b949e",
                fontStyle: "italic",
                borderLeft: "3px solid #f85149",
                background: "rgba(248, 81, 73, 0.05)",
                margin: "4px 0"
              }}
            >
              💡 Interpolate requires Local SD 1.5 mode
            </div>
          )}
          <button
            className={`action-item ${!onInterpolate ? 'primary' : ''}`}
            onClick={onGenerateFromReference}
          >
            ✨ Generate from both references...
          </button>
          <button className="action-item" onClick={onViewDetails}>
            🔍 View details
          </button>
          <div className="action-divider" />
          <button className="action-item" onClick={onClearSelection}>
            ✖️ Clear selection
          </button>
        </>
      )}

      {selectedCount > 2 && (
        <>
          <button
            className="action-item primary"
            onClick={onGenerateFromReference}
          >
            ✨ Generate from selection ({selectedCount} images)...
          </button>
          <button className="action-item" onClick={onViewDetails}>
            📊 Analyze cluster
          </button>
          <div className="action-divider" />
          <button className="action-item" onClick={onClearSelection}>
            ✖️ Clear selection
          </button>
        </>
      )}
    </div>
  );
};
