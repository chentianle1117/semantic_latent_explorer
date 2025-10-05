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

      {selectedCount === 2 && onInterpolate && (
        <>
          <button className="action-item primary" onClick={onInterpolate}>
            🔀 Interpolate between (2 selected)
          </button>
          <button className="action-item" onClick={onGenerateFromReference}>
            ✨ Generate batch using both...
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
