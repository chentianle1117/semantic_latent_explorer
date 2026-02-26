import React, { useState, useEffect } from "react";
import { useAppStore } from "../../store/appStore";
import { apiClient } from "../../api/client";
import "./SettingsModal.css";
import "../VisualSettingsModal/VisualSettingsModal.css";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  ghostCount?: number;
  onGhostCountChange?: (count: number) => void;
  showLabels?: boolean;
  backgroundColor?: string;
  onToggleLabels?: () => void;
  onBackgroundColorChange?: (color: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  ghostCount = 1,
  onGhostCountChange,
  showLabels = false,
  backgroundColor = "#0d1117",
  onToggleLabels = () => {},
  onBackgroundColorChange = () => {},
}) => {
  const removeBackground = useAppStore((s) => s.removeBackground);
  const setRemoveBackground = useAppStore((s) => s.setRemoveBackground);
  const studyMode = useAppStore((s) => s.studyMode);
  const setStudyMode = useAppStore((s) => s.setStudyMode);
  const participantId = useAppStore((s) => s.participantId);
  const setParticipantId = useAppStore((s) => s.setParticipantId);
  const [participantInput, setParticipantInput] = useState(participantId);
  useEffect(() => {
    if (isOpen) setParticipantInput(participantId);
  }, [isOpen, participantId]);

  const visualSettings = useAppStore((s) => s.visualSettings);
  const updateVisualSettings = useAppStore((s) => s.updateVisualSettings);
  const resetCanvasBounds = useAppStore((s) => s.resetCanvasBounds);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span className="settings-title">Settings</span>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body">
          {/* Session */}
          <div className="settings-section">
            <label className="settings-label">Session</label>
            <div className="settings-row">
              <label>Participant ID</label>
              <input
                type="text"
                value={participantInput}
                onChange={(e) => setParticipantInput(e.target.value)}
                onBlur={async () => {
                  const trimmed = participantInput.trim() || 'researcher';
                  setParticipantInput(trimmed);
                  if (trimmed !== participantId) {
                    setParticipantId(trimmed);
                    try {
                      await apiClient.setParticipant(trimmed);
                      // Refresh canvas list for the new participant's directory
                      const { sessions } = await apiClient.listSessions();
                      useAppStore.getState().setCanvasList(sessions);
                    } catch {/* silent */}
                  }
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="researcher"
                style={{
                  padding: '5px 10px', borderRadius: '6px',
                  border: '1px solid var(--border)', background: 'var(--bg-primary)',
                  color: 'var(--text-primary)', fontSize: '12px', width: '140px',
                }}
              />
            </div>
            <p className="settings-hint" style={{ fontSize: '10px', marginTop: '4px', opacity: 0.6 }}>
              Session data saved to backend/data/{participantId}/sessions/
            </p>
          </div>

          {/* Study Mode */}
          <div className="settings-section">
            <label className="settings-label">Study Mode</label>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={studyMode}
                onChange={(e) => setStudyMode(e.target.checked)}
              />
              Side-view only (no multi-view, no mood boards)
            </label>
            <p className="settings-hint" style={{ fontSize: '10px', marginTop: '4px', opacity: 0.6 }}>
              Disables satellite view generation, mood boards, and the multi-view editor
            </p>
          </div>

          {/* Generation */}
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
            {onGhostCountChange && (
              <div className="settings-row" style={{ marginTop: 10 }}>
                <label>Ghost images per batch</label>
                <input
                  type="range"
                  min={0}
                  max={4}
                  value={ghostCount}
                  onChange={(e) => onGhostCountChange(parseInt(e.target.value))}
                />
                <span>{ghostCount === 0 ? 'off' : ghostCount}</span>
              </div>
            )}
          </div>

          {/* Visual */}
          <div className="settings-section visual-settings-content">
            <label className="settings-label">Visual</label>
            <div className="setting-row">
              <label>Image Size</label>
              <input
                type="range" min="30" max="250"
                value={visualSettings.imageSize}
                onChange={(e) => updateVisualSettings({ imageSize: parseInt(e.target.value) })}
              />
              <span className="setting-value">{visualSettings.imageSize}px</span>
            </div>
            <div className="setting-row">
              <label>Opacity</label>
              <input
                type="range" min="0.1" max="1" step="0.05"
                value={visualSettings.imageOpacity}
                onChange={(e) => updateVisualSettings({ imageOpacity: parseFloat(e.target.value) })}
              />
              <span className="setting-value">{Math.round(visualSettings.imageOpacity * 100)}%</span>
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
                <input type="checkbox" checked={showLabels} onChange={onToggleLabels} />
                Labels
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={visualSettings.showGenealogyOnCanvas ?? false}
                  onChange={(e) => updateVisualSettings({ showGenealogyOnCanvas: e.target.checked })}
                />
                Genealogy on canvas
              </label>
            </div>
            <div className="setting-actions">
              <button onClick={() => resetCanvasBounds()}>Recenter</button>
              <button
                onClick={async () => {
                  try {
                    await apiClient.reapplyLayout();
                    // Fetch updated coordinates from backend (broadcast_state_update doesn't reach us)
                    const freshState = await apiClient.getState();
                    useAppStore.getState().setImages(freshState.images);
                    if (freshState.history_groups) useAppStore.getState().setHistoryGroups(freshState.history_groups);
                  } catch (e) { console.warn("Reapply failed:", e); }
                  resetCanvasBounds();
                  updateVisualSettings({ coordinateScale: 1.0, coordinateOffset: [0, 0, 0] });
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
