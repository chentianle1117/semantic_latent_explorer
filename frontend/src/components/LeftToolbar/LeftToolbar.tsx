import React from "react";
import { useAppStore } from "../../store/appStore";
import { useProgressStore } from "../../store/progressStore";
import { ToolbarFlyout } from "./ToolbarFlyout";
import { AxisEditor } from "../AxisEditor/AxisEditor";
import { AxisScaleSlider } from "../AxisScaleSlider/AxisScaleSlider";
import { apiClient } from "../../api/client";
import "./LeftToolbar.css";

interface LeftToolbarProps {
  onGenerate: () => void;
  onBatchGenerate: () => void;
  onLoadImages: () => void;
  onExport: () => void;
  onClearAll: () => void;
  onAnalyzeCanvas: () => void;
  onSuggestAxes: () => void;
  unexpectedImagesCount: number;
  onUnexpectedImagesCountChange: (count: number) => void;
  isGenerating: boolean;
  isAnalyzing: boolean;
  isLoadingAxes: boolean;
}

export const LeftToolbar: React.FC<LeftToolbarProps> = ({
  onGenerate,
  onBatchGenerate,
  onLoadImages,
  onExport,
  onClearAll,
  onAnalyzeCanvas,
  onSuggestAxes,
  unexpectedImagesCount,
  onUnexpectedImagesCountChange,
  isGenerating,
  isAnalyzing,
  isLoadingAxes,
}) => {
  const activeToolbarFlyout = useAppStore((s) => s.activeToolbarFlyout);
  const setActiveToolbarFlyout = useAppStore((s) => s.setActiveToolbarFlyout);
  const axisLabels = useAppStore((s) => s.axisLabels);
  const expandedConcepts = useAppStore((s) => s.expandedConcepts);
  const visualSettings = useAppStore((s) => s.visualSettings);
  const images = useAppStore((s) => s.images.filter((img) => img.visible));
  const isUpdatingAxes = useAppStore((s) => s.isUpdatingAxes);
  const axisUpdateProgress = useAppStore((s) => s.axisUpdateProgress);

  const tools = [
    { id: "generate", icon: "✨", label: "Generate" },
    { id: "batch", icon: "📦", label: "Files" },
    { id: "analyze", icon: "🔍", label: "AI" },
    { id: "axes", icon: "📐", label: "Axes" },
  ];

  const closeFlyout = () => setActiveToolbarFlyout(null);

  const handleAxisUpdate = async (
    axis: "x" | "y",
    negative: string,
    positive: string
  ) => {
    try {
      useAppStore.getState().setIsUpdatingAxes(true);
      useAppStore.getState().setAxisUpdateProgress(0);
      useProgressStore.getState().showProgress("reprojecting", "Computing embeddings & reprojecting...", false);
      useAppStore.getState().resetCanvasBounds();

      await apiClient.updateAxes({
        x_negative: axis === "x" ? negative : axisLabels.x[0],
        x_positive: axis === "x" ? positive : axisLabels.x[1],
        y_negative: axis === "y" ? negative : axisLabels.y[0],
        y_positive: axis === "y" ? positive : axisLabels.y[1],
      });
      useAppStore.getState().setAxisUpdateProgress(60);
      useProgressStore.getState().updateProgress(70, "Updating canvas...");

      const state = await apiClient.getState();
      const newLabels = {
        ...axisLabels,
        [axis]: [negative, positive] as [string, string],
      };
      useAppStore.setState({ axisLabels: newLabels });
      useAppStore.getState().setImages(state.images);
      if (state.expanded_concepts) {
        useAppStore.getState().setExpandedConcepts(state.expanded_concepts);
      }
      useAppStore.getState().setAxisUpdateProgress(100);
      useProgressStore.getState().updateProgress(100);
      useProgressStore.getState().hideProgress();

      // Dismiss progress after 500ms
      setTimeout(() => {
        useAppStore.getState().setIsUpdatingAxes(false);
      }, 500);
    } catch (error) {
      console.error(`Failed to update ${axis.toUpperCase()}-axis:`, error);
      useAppStore.getState().setIsUpdatingAxes(false);
      useProgressStore.getState().hideProgress();
      alert(`Failed to update ${axis.toUpperCase()}-axis: ${error}`);
    }
  };

  return (
    <div className="left-toolbar">
      {tools.map((tool) => (
        <button
          key={tool.id}
          className={`toolbar-icon-btn ${activeToolbarFlyout === tool.id ? "active" : ""}`}
          onClick={() => setActiveToolbarFlyout(tool.id)}
          title={tool.label}
        >
          <span className="toolbar-icon">{tool.icon}</span>
        </button>
      ))}

      {/* Generate Flyout */}
      {activeToolbarFlyout === "generate" && (
        <ToolbarFlyout title="Generate" onClose={closeFlyout}>
          <button
            className="flyout-action-btn primary"
            onClick={() => {
              onGenerate();
              closeFlyout();
            }}
            disabled={isGenerating}
          >
            {isGenerating ? "Generating..." : "✨ Text to Image"}
          </button>
          <p className="flyout-hint">
            Opens the generation dialog where you can enter a prompt and choose
            the number of images.
          </p>
        </ToolbarFlyout>
      )}

      {/* Batch / Files Flyout */}
      {activeToolbarFlyout === "batch" && (
        <ToolbarFlyout title="Files & Batch" onClose={closeFlyout}>
          <button
            className="flyout-action-btn"
            onClick={() => {
              onBatchGenerate();
              closeFlyout();
            }}
            disabled={isGenerating}
          >
            🎲 Batch Generate
          </button>
          <button
            className="flyout-action-btn"
            onClick={() => {
              onLoadImages();
              closeFlyout();
            }}
          >
            📁 Load Images
          </button>
          <button className="flyout-action-btn" onClick={onExport}>
            📦 Export ZIP
          </button>
          <div className="flyout-divider" />
          <button
            className="flyout-action-btn danger"
            onClick={() => {
              onClearAll();
              closeFlyout();
            }}
          >
            🗑 Clear All
          </button>
        </ToolbarFlyout>
      )}

      {/* AI Actions Flyout */}
      {activeToolbarFlyout === "analyze" && (
        <ToolbarFlyout title="AI Actions" onClose={closeFlyout}>
          <button
            className="flyout-action-btn"
            onClick={onAnalyzeCanvas}
            disabled={isAnalyzing || images.length < 5}
          >
            {isAnalyzing ? "Analyzing..." : "🔍 Analyze Canvas"}
          </button>
          {images.length < 5 && (
            <p className="flyout-hint">Need at least 5 images to analyze.</p>
          )}
          <button
            className="flyout-action-btn"
            onClick={onSuggestAxes}
            disabled={isLoadingAxes || images.length < 3}
          >
            {isLoadingAxes ? "Loading..." : "📐 Suggest Axes"}
          </button>
          <div className="flyout-divider" />
          <div className="flyout-slider-row">
            <label>Auto-variations</label>
            <input
              type="range"
              min="0"
              max="8"
              value={unexpectedImagesCount}
              onChange={(e) =>
                onUnexpectedImagesCountChange(parseInt(e.target.value))
              }
            />
            <span className="flyout-slider-value">{unexpectedImagesCount}</span>
          </div>
          <p className="flyout-hint">
            Extra unexpected images generated alongside each batch.
          </p>
        </ToolbarFlyout>
      )}

      {/* Axes Flyout */}
      {activeToolbarFlyout === "axes" && (
        <ToolbarFlyout title="Semantic Axes" onClose={closeFlyout}>
          {isUpdatingAxes && (
            <div className="axis-progress-indicator">
              <div className="axis-progress-bar">
                <div className="axis-progress-fill" style={{ width: `${axisUpdateProgress}%` }} />
              </div>
              <span className="axis-progress-text">
                {axisUpdateProgress < 100 ? `Updating axes... ${axisUpdateProgress}%` : "Complete!"}
              </span>
            </div>
          )}
          <div className="flyout-axis-section" style={{ opacity: isUpdatingAxes ? 0.6 : 1, pointerEvents: isUpdatingAxes ? 'none' : 'auto' }}>
            <label className="flyout-axis-label">X-Axis</label>
            <AxisEditor
              axis="x"
              negativeLabel={axisLabels.x[0]}
              positiveLabel={axisLabels.x[1]}
              onUpdate={(neg, pos) => handleAxisUpdate("x", neg, pos)}
              expandedNegative={expandedConcepts?.x_negative}
              expandedPositive={expandedConcepts?.x_positive}
            />
            <div className="flyout-axis-scale">
              <span className="flyout-scale-label">Stretch</span>
              <AxisScaleSlider
                axis="x"
                value={visualSettings.axisScaleX ?? 1}
                onChange={(v) => useAppStore.getState().updateVisualSettings({ axisScaleX: v })}
              />
            </div>
          </div>
          <div className="flyout-axis-section" style={{ opacity: isUpdatingAxes ? 0.6 : 1, pointerEvents: isUpdatingAxes ? 'none' : 'auto' }}>
            <label className="flyout-axis-label">Y-Axis</label>
            <AxisEditor
              axis="y"
              negativeLabel={axisLabels.y[0]}
              positiveLabel={axisLabels.y[1]}
              onUpdate={(neg, pos) => handleAxisUpdate("y", neg, pos)}
              expandedNegative={expandedConcepts?.y_negative}
              expandedPositive={expandedConcepts?.y_positive}
            />
            <div className="flyout-axis-scale">
              <span className="flyout-scale-label">Stretch</span>
              <AxisScaleSlider
                axis="y"
                value={visualSettings.axisScaleY ?? 1}
                onChange={(v) => useAppStore.getState().updateVisualSettings({ axisScaleY: v })}
              />
            </div>
          </div>
          <div className="flyout-divider" />
          <button
            className="flyout-action-btn"
            onClick={onSuggestAxes}
            disabled={isLoadingAxes || images.length < 3 || isUpdatingAxes}
          >
            {isLoadingAxes ? "Loading..." : "🤖 AI Suggest Axes"}
          </button>
        </ToolbarFlyout>
      )}
    </div>
  );
};
