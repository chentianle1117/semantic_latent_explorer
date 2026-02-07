/**
 * Visual Settings Modal - Popup for canvas visual controls
 * Triggered from Radial Dial
 */

import React from "react";
import { useAppStore } from "../../store/appStore";
import { apiClient } from "../../api/client";
import "./VisualSettingsModal.css";

interface VisualSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  showLabels: boolean;
  showGrid: boolean;
  showClusters: boolean;
  backgroundColor: string;
  onToggleLabels: () => void;
  onToggleGrid: () => void;
  onToggleClusters: () => void;
  onBackgroundColorChange: (color: string) => void;
}

export const VisualSettingsModal: React.FC<VisualSettingsModalProps> = ({
  isOpen,
  onClose,
  showLabels,
  showGrid,
  showClusters,
  backgroundColor,
  onToggleLabels,
  onToggleGrid,
  onToggleClusters,
  onBackgroundColorChange,
}) => {
  const visualSettings = useAppStore((s) => s.visualSettings);
  const updateVisualSettings = useAppStore((s) => s.updateVisualSettings);
  const resetCanvasBounds = useAppStore((s) => s.resetCanvasBounds);

  if (!isOpen) return null;

  return (
    <div className="visual-settings-modal-backdrop" onClick={onClose}>
      <div
        className="visual-settings-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="visual-settings-header">
          <span className="visual-settings-title">Visual Settings</span>
          <button className="visual-settings-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="visual-settings-content">
          <div className="setting-row">
            <label>Image Size</label>
            <input
              type="range"
              min="30"
              max="400"
              value={visualSettings.imageSize}
              onChange={(e) =>
                updateVisualSettings({ imageSize: parseInt(e.target.value) })
              }
            />
            <span className="setting-value">{visualSettings.imageSize}px</span>
          </div>
          <p className="setting-hint">
            Shoe display size on canvas. Adjust when layout feels cluttered.
          </p>

          <div className="setting-row">
            <label>Opacity</label>
            <input
              type="range"
              min="0.3"
              max="1"
              step="0.05"
              value={visualSettings.imageOpacity}
              onChange={(e) =>
                updateVisualSettings({
                  imageOpacity: parseFloat(e.target.value),
                })
              }
            />
            <span className="setting-value">
              {Math.round(visualSettings.imageOpacity * 100)}%
            </span>
          </div>

          <div className="setting-row">
            <label>Highlight Contour</label>
            <input
              type="range"
              min="1"
              max="10"
              value={visualSettings.contourStrength ?? 6}
              onChange={(e) =>
                updateVisualSettings({
                  contourStrength: parseInt(e.target.value),
                })
              }
            />
            <span className="setting-value">
              {visualSettings.contourStrength ?? 6}
            </span>
          </div>
          <p className="setting-hint">
            Thickness of selection/parent/child outline. Higher = more visible.
          </p>

          <div className="setting-row">
            <label>Padding</label>
            <input
              type="range"
              min="0.05"
              max="0.3"
              step="0.01"
              value={visualSettings.layoutPadding}
              onChange={(e) =>
                updateVisualSettings({
                  layoutPadding: parseFloat(e.target.value),
                })
              }
            />
            <span className="setting-value">
              {Math.round(visualSettings.layoutPadding * 100)}%
            </span>
          </div>

          <div className="setting-row">
            <label>Scale</label>
            <input
              type="range"
              min="0.1"
              max="5"
              step="0.1"
              value={visualSettings.coordinateScale}
              onChange={(e) =>
                updateVisualSettings({
                  coordinateScale: parseFloat(e.target.value),
                })
              }
            />
            <span className="setting-value">
              {visualSettings.coordinateScale.toFixed(1)}x
            </span>
          </div>

          <div className="setting-toggles">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={showLabels}
                onChange={onToggleLabels}
              />
              Labels
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={onToggleGrid}
              />
              Grid
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={showClusters}
                onChange={onToggleClusters}
              />
              Clusters
            </label>
          </div>

          <div className="setting-row">
            <label>Background</label>
            <input
              type="color"
              value={backgroundColor}
              onChange={(e) => onBackgroundColorChange(e.target.value)}
            />
          </div>

          <div className="setting-actions">
            <button onClick={() => resetCanvasBounds()}>Recenter</button>
            <button
              onClick={async () => {
                try {
                  await apiClient.reapplyLayout();
                } catch (e) {
                  console.warn("Reapply layout failed:", e);
                }
                resetCanvasBounds();
                updateVisualSettings({
                  coordinateScale: 1.0,
                  coordinateOffset: [0, 0, 0],
                });
              }}
            >
              Rescale
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
