import React, { useState, useCallback } from "react";
import "./HeaderBar.css";
import { CanvasSwitcher } from "../CanvasSwitcher/CanvasSwitcher";
import { apiClient } from "../../api/client";

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
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const handleSave = useCallback(async () => {
    if (saveStatus === 'saving') return;
    setSaveStatus('saving');
    try {
      await apiClient.saveSession();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 1500);
    } catch {
      setSaveStatus('idle');
    }
  }, [saveStatus]);

  const handleExport = useCallback(() => {
    const port = window.location.port || '8000';
    window.open(`http://localhost:${port}/api/export-zip`, '_blank');
  }, []);

  return (
    <div className="header-bar">
      <div className="header-left">
        <CanvasSwitcher />
        <button
          className="header-canvas-action"
          onClick={handleSave}
          title="Save canvas to disk"
          disabled={saveStatus === 'saving'}
        >
          {saveStatus === 'saving' ? '…' : saveStatus === 'saved' ? '✓ Saved' : '↑ Save'}
        </button>
        <button
          className="header-canvas-action"
          onClick={handleExport}
          title="Export canvas as ZIP"
        >
          ↓ Export
        </button>
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
