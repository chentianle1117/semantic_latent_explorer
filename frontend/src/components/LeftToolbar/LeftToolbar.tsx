import React from "react";
import { useAppStore } from "../../store/appStore";
import "./LeftToolbar.css";

interface LeftToolbarProps {
  onGenerate: () => void;
  onBatchGenerate: () => void;
  onLoadImages: () => void;
  onExport: () => void;
  onClearAll: () => void;
  onAnalyzeCanvas: () => void;
  onSuggestAxes: () => void;
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
  isGenerating,
  isAnalyzing,
  isLoadingAxes,
}) => {
  const activeToolbarFlyout = useAppStore((s) => s.activeToolbarFlyout);
  const setActiveToolbarFlyout = useAppStore((s) => s.setActiveToolbarFlyout);

  const tools = [
    { id: "generate", icon: "✨", label: "Generate" },
    { id: "batch", icon: "📦", label: "Files" },
    { id: "analyze", icon: "🔍", label: "AI" },
    { id: "axes", icon: "📐", label: "Axes" },
  ];

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

      {/* Flyout panels render here - will be implemented in Phase 2 */}
    </div>
  );
};
