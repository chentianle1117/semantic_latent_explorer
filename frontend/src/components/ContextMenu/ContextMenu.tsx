/**
 * Context Menu Component - Shows actions based on selection
 * Matches artifact interaction model exactly
 */

import React from 'react';
import { useAppStore } from '../../store/appStore';
import './ContextMenu.css';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onGenerateFromReference?: (imageId: number) => void;
  onInterpolate?: (idA: number, idB: number) => void;
  onViewDetails?: (imageId: number) => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  onClose,
  onGenerateFromReference,
  onInterpolate,
  onViewDetails,
}) => {
  const selectedImageIds = useAppStore((state) => state.selectedImageIds);
  const clearSelection = useAppStore((state) => state.clearSelection);

  const count = selectedImageIds.length;

  if (count === 0) return null;

  // Single image menu
  if (count === 1) {
    return (
      <div className="context-menu" style={{ left: x, top: y }}>
        <div
          className="menu-item primary"
          onClick={() => {
            onGenerateFromReference?.(selectedImageIds[0]);
            onClose();
          }}
        >
          ✨ Generate with prompt...
        </div>
        <div
          className="menu-item"
          onClick={() => {
            onViewDetails?.(selectedImageIds[0]);
            onClose();
          }}
        >
          🔍 View details
        </div>
        <div className="menu-divider" />
        <div
          className="menu-item danger"
          onClick={() => {
            useAppStore.getState().removeImage(selectedImageIds[0]);
            clearSelection();
            onClose();
          }}
        >
          🗑️ Remove from space
        </div>
      </div>
    );
  }

  // Dual image menu
  if (count === 2) {
    return (
      <div className="context-menu" style={{ left: x, top: y }}>
        <div
          className="menu-item primary"
          onClick={() => {
            onInterpolate?.(selectedImageIds[0], selectedImageIds[1]);
            onClose();
          }}
        >
          🔀 Interpolate between (2 selected)
        </div>
        <div
          className="menu-item"
          onClick={() => {
            // Could implement batch generation using both as references
            alert('Batch generation from multiple references coming soon!');
            onClose();
          }}
        >
          ✨ Generate batch using both as reference...
        </div>
        <div className="menu-divider" />
        <div
          className="menu-item"
          onClick={() => {
            clearSelection();
            onClose();
          }}
        >
          ✖️ Clear selection
        </div>
      </div>
    );
  }

  // Multi-image menu (3+)
  return (
    <div className="context-menu" style={{ left: x, top: y }}>
      <div
        className="menu-item primary"
        onClick={() => {
          alert(`Cluster generation from ${count} images coming soon!`);
          onClose();
        }}
      >
        ✨ Generate from selection ({count} images)...
      </div>
      <div
        className="menu-item"
        onClick={() => {
          alert('Cluster analysis coming soon!');
          onClose();
        }}
      >
        📊 Analyze cluster
      </div>
      <div className="menu-divider" />
      <div
        className="menu-item"
        onClick={() => {
          clearSelection();
          onClose();
        }}
      >
        ✖️ Clear selection
      </div>
    </div>
  );
};
