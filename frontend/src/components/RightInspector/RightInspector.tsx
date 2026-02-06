import React from "react";
import { useAppStore } from "../../store/appStore";
import "./RightInspector.css";

interface RightInspectorProps {
  showLabels: boolean;
  showGrid: boolean;
  showClusters: boolean;
  backgroundColor: string;
  onToggleLabels: () => void;
  onToggleGrid: () => void;
  onToggleClusters: () => void;
  onBackgroundColorChange: (color: string) => void;
}

export const RightInspector: React.FC<RightInspectorProps> = ({
  showLabels,
  showGrid,
  showClusters,
  backgroundColor,
  onToggleLabels,
  onToggleGrid,
  onToggleClusters,
  onBackgroundColorChange,
}) => {
  const isCollapsed = useAppStore((s) => s.isInspectorCollapsed);
  const setIsCollapsed = useAppStore((s) => s.setIsInspectorCollapsed);
  const visualSettings = useAppStore((s) => s.visualSettings);
  const updateVisualSettings = useAppStore((s) => s.updateVisualSettings);
  const resetCanvasBounds = useAppStore((s) => s.resetCanvasBounds);
  const selectedImageIds = useAppStore((s) => s.selectedImageIds);

  if (isCollapsed) {
    return (
      <div className="right-inspector collapsed">
        <button
          className="inspector-expand-tab"
          onClick={() => setIsCollapsed(false)}
          title="Open Inspector"
        >
          &#9664;
        </button>
      </div>
    );
  }

  return (
    <div className="right-inspector">
      <div className="inspector-header">
        <span className="inspector-title">Inspector</span>
        <button
          className="inspector-collapse-btn"
          onClick={() => setIsCollapsed(true)}
          title="Collapse"
        >
          &#9654;
        </button>
      </div>

      {/* Selection section - only when image selected */}
      {selectedImageIds.length > 0 && (
        <div className="inspector-section">
          <div className="section-header">
            <span>Selection ({selectedImageIds.length})</span>
          </div>
          <div className="section-content">
            <p className="section-placeholder">Genealogy Lens (Phase 4)</p>
          </div>
        </div>
      )}

      {/* Visual Settings - always visible */}
      <div className="inspector-section">
        <div className="section-header">
          <span>Visual Settings</span>
        </div>
        <div className="section-content">
          <div className="setting-row">
            <label>Image Size</label>
            <input
              type="range"
              min="30"
              max="400"
              value={visualSettings.imageSize}
              onChange={(e) => updateVisualSettings({ imageSize: parseInt(e.target.value) })}
            />
            <span className="setting-value">{visualSettings.imageSize}px</span>
          </div>

          <div className="setting-row">
            <label>Opacity</label>
            <input
              type="range"
              min="0.3"
              max="1"
              step="0.05"
              value={visualSettings.imageOpacity}
              onChange={(e) => updateVisualSettings({ imageOpacity: parseFloat(e.target.value) })}
            />
            <span className="setting-value">{Math.round(visualSettings.imageOpacity * 100)}%</span>
          </div>

          <div className="setting-row">
            <label>Padding</label>
            <input
              type="range"
              min="0.05"
              max="0.3"
              step="0.01"
              value={visualSettings.layoutPadding}
              onChange={(e) => updateVisualSettings({ layoutPadding: parseFloat(e.target.value) })}
            />
            <span className="setting-value">{Math.round(visualSettings.layoutPadding * 100)}%</span>
          </div>

          <div className="setting-row">
            <label>Scale</label>
            <input
              type="range"
              min="0.1"
              max="5"
              step="0.1"
              value={visualSettings.coordinateScale}
              onChange={(e) => updateVisualSettings({ coordinateScale: parseFloat(e.target.value) })}
            />
            <span className="setting-value">{visualSettings.coordinateScale.toFixed(1)}x</span>
          </div>

          <div className="setting-toggles">
            <label className="toggle-row">
              <input type="checkbox" checked={showLabels} onChange={onToggleLabels} />
              Labels
            </label>
            <label className="toggle-row">
              <input type="checkbox" checked={showGrid} onChange={onToggleGrid} />
              Grid
            </label>
            <label className="toggle-row">
              <input type="checkbox" checked={showClusters} onChange={onToggleClusters} />
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
            <button onClick={() => {
              resetCanvasBounds();
              updateVisualSettings({ coordinateScale: 1.0, coordinateOffset: [0, 0, 0] });
            }}>
              Rescale
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
