import React from "react";
import "./HeaderBar.css";
import { CanvasSwitcher } from "../CanvasSwitcher/CanvasSwitcher";

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
  is3DMode,
  onToggle3D,
  onOpenSettings,
}) => {
  return (
    <div className="header-bar">
      <div className="header-left">
        <CanvasSwitcher />
      </div>
      <div className="header-center" />
      <div className="header-right">
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
