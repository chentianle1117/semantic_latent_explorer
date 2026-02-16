import React, { useState, useEffect } from "react";
import { useAppStore } from "../../store/appStore";
import { apiClient } from "../../api/client";
import "./SettingsModal.css";
import "../VisualSettingsModal/VisualSettingsModal.css";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBrief: string | null;
  onBriefChange: (brief: string) => void;
  unexpectedImagesCount?: number;
  onUnexpectedImagesCountChange?: (count: number) => void;
  showLabels?: boolean;
  showGrid?: boolean;
  showClusters?: boolean;
  backgroundColor?: string;
  onToggleLabels?: () => void;
  onToggleGrid?: () => void;
  onToggleClusters?: () => void;
  onBackgroundColorChange?: (color: string) => void;
  onExportZip?: (ids?: number[]) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentBrief,
  onBriefChange,
  unexpectedImagesCount = 2,
  onUnexpectedImagesCountChange,
  showLabels = false,
  showGrid = false,
  showClusters = false,
  backgroundColor = "#0d1117",
  onToggleLabels = () => {},
  onToggleGrid = () => {},
  onToggleClusters = () => {},
  onBackgroundColorChange = () => {},
  onExportZip,
}) => {
  const removeBackground = useAppStore((s) => s.removeBackground);
  const setRemoveBackground = useAppStore((s) => s.setRemoveBackground);
  const selectedImageIds = useAppStore((s) => s.selectedImageIds);
  const visualSettings = useAppStore((s) => s.visualSettings);
  const updateVisualSettings = useAppStore((s) => s.updateVisualSettings);
  const resetCanvasBounds = useAppStore((s) => s.resetCanvasBounds);
  const agentMode = useAppStore((s) => s.agentMode);
  const setAgentMode = useAppStore((s) => s.setAgentMode);
  const [briefDraft, setBriefDraft] = useState(currentBrief || "");

  useEffect(() => {
    setBriefDraft(currentBrief || "");
  }, [currentBrief, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSaveBrief = async () => {
    const trimmed = briefDraft.trim();
    if (!trimmed) return;
    try {
      await apiClient.updateDesignBrief(trimmed);
      onBriefChange(trimmed);
    } catch (error) {
      console.error("Failed to save design brief:", error);
    }
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span className="settings-title">Settings</span>
          <button className="settings-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="settings-body">
          {/* Design Brief */}
          <div className="settings-section">
            <label className="settings-label">Design Brief</label>
            <p className="settings-hint">
              Guides the AI agent when generating unexpected variations and
              analyzing your canvas.
            </p>
            <textarea
              className="settings-textarea"
              rows={4}
              value={briefDraft}
              onChange={(e) => setBriefDraft(e.target.value)}
              placeholder="e.g. Explore futuristic running shoe designs with bold colors..."
            />
            <button
              className="settings-save-btn"
              onClick={handleSaveBrief}
              disabled={briefDraft.trim() === (currentBrief || "")}
            >
              Save Brief
            </button>
          </div>

          {/* Generation Settings */}
          <div className="settings-section">
            <label className="settings-label">Generation</label>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={removeBackground}
                onChange={(e) => setRemoveBackground(e.target.checked)}
              />
              Remove background from generated images
            </label>
            {onUnexpectedImagesCountChange && (
              <div className="settings-row">
                <label>Auto-variations per prompt</label>
                <input
                  type="range"
                  min={0}
                  max={8}
                  value={unexpectedImagesCount}
                  onChange={(e) =>
                    onUnexpectedImagesCountChange(parseInt(e.target.value))
                  }
                />
                <span>{unexpectedImagesCount}</span>
              </div>
            )}
          </div>

          {/* AI Agent Settings */}
          <div className="settings-section">
            <label className="settings-label">AI Agent</label>
            <p className="settings-hint">
              Control how the AI agent suggests new directions and variations.
            </p>
            <div className="settings-row">
              <label>Agent Mode</label>
              <select
                value={agentMode}
                onChange={(e) => setAgentMode(e.target.value as 'auto' | 'manual')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                }}
              >
                <option value="auto">Proactive (Auto-suggest)</option>
                <option value="manual">Manual (On-demand only)</option>
              </select>
            </div>
            <p className="settings-hint" style={{ fontSize: '10px', marginTop: '8px', opacity: 0.7 }}>
              {agentMode === 'auto'
                ? '✨ Agent will proactively suggest gaps, axes, and variations'
                : '⏸️ Agent will only analyze when you click "Analyze" button'}
            </p>
          </div>

          {/* Visual Settings */}
          <div className="settings-section visual-settings-content">
            <label className="settings-label">Visual</label>
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

            <div className="setting-row">
              <label>Background</label>
              <input
                type="color"
                value={backgroundColor}
                onChange={(e) => onBackgroundColorChange(e.target.value)}
              />
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
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={visualSettings.showGenealogyOnCanvas ?? false}
                  onChange={(e) =>
                    updateVisualSettings({ showGenealogyOnCanvas: e.target.checked })
                  }
                />
                Genealogy on canvas
              </label>
            </div>
            <div className="setting-actions">
              {onExportZip && (
                <button
                  onClick={() =>
                    onExportZip(
                      selectedImageIds.length > 0 ? selectedImageIds : undefined
                    )
                  }
                >
                  {selectedImageIds.length > 0
                    ? `Export ${selectedImageIds.length} selected`
                    : "Export all as ZIP"}
                </button>
              )}
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
    </div>
  );
};
