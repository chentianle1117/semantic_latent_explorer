import React from 'react';
import { useAppStore } from '../../store/appStore';
import type { ImageData } from '../../types';
import './RightControlPanel.css';

interface RightControlPanelProps {
  // Generation Group
  onGenerateFromPrompt: () => void;
  onBatchGenerate: () => void;
  onLoadImages: () => void;
  onExport: () => void;
  onClearAll: () => void;
  isGenerating: boolean;

  // Visual Settings Group
  showLabels: boolean;
  showGrid: boolean;
  showClusters: boolean;
  backgroundColor: string;
  onToggleLabels: () => void;
  onToggleGrid: () => void;
  onToggleClusters: () => void;
  onBackgroundColorChange: (color: string) => void;

  // Images for recenter functionality
  images: ImageData[];
}

export const RightControlPanel: React.FC<RightControlPanelProps> = ({
  onGenerateFromPrompt,
  onBatchGenerate,
  onLoadImages,
  onExport,
  onClearAll,
  isGenerating,
  showLabels,
  showGrid,
  showClusters,
  backgroundColor,
  onToggleLabels,
  onToggleGrid,
  onToggleClusters,
  onBackgroundColorChange,
  images,
}) => {
  const visualSettings = useAppStore((state) => state.visualSettings);
  const updateVisualSettings = useAppStore((state) => state.updateVisualSettings);
  const resetCanvasBounds = useAppStore((state) => state.resetCanvasBounds);

  return (
    <div className="right-control-panel">
      {/* Generation Group */}
      <div className="control-group">
        <h3 className="control-group-title">Generate</h3>
        <button
          className="control-btn primary-btn"
          onClick={onGenerateFromPrompt}
          disabled={isGenerating}
        >
          ✨ Generate from Prompt
        </button>
        <button
          className="control-btn"
          onClick={onBatchGenerate}
          disabled={isGenerating}
        >
          🎲 Batch Generate
        </button>
        <button
          className="control-btn"
          onClick={onLoadImages}
        >
          📁 Load Images
        </button>
        <button
          className="control-btn"
          onClick={onExport}
        >
          💾 Export
        </button>
        <button
          className="control-btn danger-btn"
          onClick={onClearAll}
          disabled={images.length === 0}
        >
          🗑️ Clear All
        </button>
      </div>

      {/* Visual Settings Group */}
      <div className="control-group">
        <h3 className="control-group-title">Visual Settings</h3>

        {/* Image Size */}
        <div className="slider-group">
          <label className="slider-label">
            Image Size: {visualSettings.imageSize}px
          </label>
          <input
            type="range"
            min="30"
            max="400"
            value={visualSettings.imageSize}
            onChange={(e) => updateVisualSettings({ imageSize: parseInt(e.target.value, 10) })}
            className="slider-input"
          />
        </div>

        {/* Opacity */}
        <div className="slider-group">
          <label className="slider-label">
            Opacity: {visualSettings.imageOpacity.toFixed(1)}
          </label>
          <input
            type="range"
            min="0.3"
            max="1"
            step="0.1"
            value={visualSettings.imageOpacity}
            onChange={(e) => updateVisualSettings({ imageOpacity: parseFloat(e.target.value) })}
            className="slider-input"
          />
        </div>

        {/* Layout Padding */}
        <div className="slider-group">
          <label className="slider-label">
            Layout Padding: {(visualSettings.layoutPadding * 100).toFixed(0)}%
          </label>
          <input
            type="range"
            min="0.05"
            max="0.3"
            step="0.05"
            value={visualSettings.layoutPadding}
            onChange={(e) => updateVisualSettings({ layoutPadding: parseFloat(e.target.value) })}
            className="slider-input"
          />
          <div className="slider-hint">
            {visualSettings.layoutPadding <= 0.1
              ? "Tight spacing"
              : visualSettings.layoutPadding <= 0.2
              ? "Moderate spacing"
              : "Spacious layout"}
          </div>
        </div>

        {/* Coordinate Scale */}
        <div className="slider-group">
          <label className="slider-label">
            Coordinate Scale: {visualSettings.coordinateScale.toFixed(2)}x
          </label>
          <input
            type="range"
            min="0.1"
            max="5"
            step="0.1"
            value={visualSettings.coordinateScale}
            onChange={(e) => {
              updateVisualSettings({ coordinateScale: parseFloat(e.target.value) });
              resetCanvasBounds();
            }}
            className="slider-input"
          />
          <div className="slider-hint">
            {visualSettings.coordinateScale < 0.5
              ? "Very tight"
              : visualSettings.coordinateScale < 1
              ? "Tight"
              : visualSettings.coordinateScale === 1
              ? "Original"
              : visualSettings.coordinateScale < 2
              ? "Spread out"
              : "Very spread"}
          </div>
        </div>

        {/* Toggle Options */}
        <label className="toggle-option">
          <input type="checkbox" checked={showLabels} onChange={onToggleLabels} />
          <span>Show Labels</span>
        </label>
        <label className="toggle-option">
          <input type="checkbox" checked={showGrid} onChange={onToggleGrid} />
          <span>Show Grid</span>
        </label>
        <label className="toggle-option">
          <input type="checkbox" checked={showClusters} onChange={onToggleClusters} />
          <span>Show Clusters</span>
        </label>

        {/* Background Color */}
        <div className="color-picker-group">
          <label>Background</label>
          <input
            type="color"
            value={backgroundColor}
            onChange={(e) => onBackgroundColorChange(e.target.value)}
            className="color-picker"
          />
        </div>

        {/* Action Buttons */}
        <button
          className="control-btn secondary-btn"
          onClick={() => {
            const visibleImages = images.filter(img => img.visible);
            if (visibleImages.length === 0) return;

            const sum = visibleImages.reduce((acc, img) => [
              acc[0] + img.coordinates[0],
              acc[1] + img.coordinates[1],
              acc[2] + (img.coordinates[2] || 0)
            ], [0, 0, 0]);

            const centroid = sum.map(s => s / visibleImages.length);
            updateVisualSettings({
              coordinateOffset: [-centroid[0], -centroid[1], -centroid[2]] as [number, number, number]
            });
            resetCanvasBounds();
          }}
          disabled={images.length === 0}
        >
          🎯 Recenter Cluster
        </button>

        <button
          className="control-btn secondary-btn"
          onClick={() => resetCanvasBounds()}
          disabled={images.length === 0}
        >
          📐 Rescale Canvas
        </button>
      </div>
    </div>
  );
};
