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
  onExportZip?: (ids?: number[]) => void;
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
  onExportZip,
}) => {
  const removeBackground = useAppStore((s) => s.removeBackground);
  const setRemoveBackground = useAppStore((s) => s.setRemoveBackground);
  const selectedImageIds = useAppStore((s) => s.selectedImageIds);
  const participantId = useAppStore((s) => s.participantId);
  const setParticipantId = useAppStore((s) => s.setParticipantId);
  const [participantInput, setParticipantInput] = useState(participantId);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const importInputRef = React.useRef<HTMLInputElement>(null);

  const handleImportZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus('Importing…');
    try {
      const result = await apiClient.importZip(file);
      const state = await apiClient.getState();
      useAppStore.getState().setImages(state.images);
      useAppStore.getState().setHistoryGroups(state.history_groups);
      setImportStatus(`✓ Loaded ${result.images_loaded} images, ${result.groups_loaded} batches`);
      setTimeout(() => setImportStatus(null), 4000);
    } catch (err: any) {
      setImportStatus(`✗ Import failed: ${err?.response?.data?.detail || err.message}`);
      setTimeout(() => setImportStatus(null), 5000);
    }
    if (importInputRef.current) importInputRef.current.value = '';
  };

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
                    try { await apiClient.setParticipant(trimmed); } catch {/* silent */}
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
                type="range" min="30" max="400"
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
              {onExportZip && (
                <button onClick={() => onExportZip(selectedImageIds.length > 0 ? selectedImageIds : undefined)}>
                  {selectedImageIds.length > 0 ? `Export ${selectedImageIds.length} selected` : "Export all as ZIP"}
                </button>
              )}
              <button
                onClick={() => importInputRef.current?.click()}
                title="Restore a previous session from an exported ZIP file"
              >
                Import from ZIP
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".zip"
                style={{ display: 'none' }}
                onChange={handleImportZip}
              />
              {importStatus && (
                <span style={{ fontSize: 10, color: importStatus.startsWith('✓') ? '#34d399' : importStatus.startsWith('✗') ? '#f87171' : 'var(--text-secondary)', marginTop: 4 }}>
                  {importStatus}
                </span>
              )}
              <button onClick={() => resetCanvasBounds()}>Recenter</button>
              <button
                onClick={async () => {
                  try { await apiClient.reapplyLayout(); } catch (e) { console.warn("Reapply failed:", e); }
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
