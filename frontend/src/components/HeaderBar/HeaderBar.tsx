import React from "react";
import { useAppStore } from "../../store/appStore";
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
  isAnalyzing,
  isLoadingAxes,
  is3DMode,
  onToggle3D,
  onOpenSettings,
  onInsightClick,
}) => {
  const agentStoreStatus = useAppStore((s) => s.agentStatus);
  const agentInsight = useAppStore((s) => s.agentInsight);

  // Merge manual analysis states with passive observer status
  const isManualActive = isAnalyzing || isLoadingAxes;
  const displayStatus = isManualActive
    ? isAnalyzing ? "Analyzing..." : "Loading Axes..."
    : agentStoreStatus === "thinking"
    ? "Observing..."
    : agentStoreStatus === "insight-ready"
    ? "Insight Ready"
    : "Idle";

  const pillClass = isManualActive || agentStoreStatus === "thinking"
    ? "active"
    : agentStoreStatus === "insight-ready"
    ? "insight"
    : "";

  const pillIcon = agentStoreStatus === "insight-ready" && !isManualActive
    ? "sparkle"
    : isManualActive || agentStoreStatus === "thinking"
    ? "pulse"
    : "dot";

  return (
    <div className="header-bar">
      <div className="header-left">
        <span className="header-logo">Semantic Explorer</span>
        <span
          className={`agent-status-pill ${pillClass}`}
          onClick={agentInsight ? onInsightClick : undefined}
          style={agentInsight ? { cursor: "pointer" } : undefined}
        >
          {pillIcon === "pulse" && <span className="agent-pulse" />}
          {pillIcon === "sparkle" && <span className="agent-sparkle" />}
          {pillIcon === "dot" && <span className="agent-dot" />}
          {displayStatus}
        </span>
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
