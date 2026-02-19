import React from "react";
import "./HeaderBar.css";

interface HeaderBarProps {
  imageCount: number;
  isInitialized: boolean;
  isAnalyzing: boolean;
  isLoadingAxes: boolean;
  is3DMode: boolean;
  onToggle3D: () => void;
  onOpenSettings: () => void;
  onInsightClick?: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  imageCount,
  isInitialized,
  is3DMode,
  onToggle3D,
  onOpenSettings,
}) => {
  return (
    <div className="header-bar">
      <div className="header-left">
        <span className="header-logo">Semantic Explorer</span>
      </div>
      <div className="header-center">
        <span className="header-stat">{imageCount} images</span>
        <span className="header-stat-sep">&middot;</span>
        <span className="header-stat">CLIP ViT-B/32</span>
        <span className="header-stat-sep">&middot;</span>
        <span className="header-stat">
          {isInitialized ? "Ready" : "Initializing..."}
        </span>
      </div>
      <div className="header-right">
        <button className="header-icon-btn" onClick={onOpenSettings} title="Project Brief">
          📄
        </button>
        <button className="header-icon-btn" onClick={onOpenSettings} title="Settings">
          &#9881;
        </button>
        <button
          className={`header-icon-btn mode-toggle ${is3DMode ? "active" : ""}`}
          onClick={onToggle3D}
          title={is3DMode ? "Switch to 2D" : "Switch to 3D"}
        >
          {is3DMode ? "3D" : "2D"}
        </button>
      </div>
    </div>
  );
};
