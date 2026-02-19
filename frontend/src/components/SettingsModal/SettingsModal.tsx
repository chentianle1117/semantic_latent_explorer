import React, { useState, useEffect } from "react";
import { useAppStore } from "../../store/appStore";
import { apiClient } from "../../api/client";
import "./SettingsModal.css";
import "../VisualSettingsModal/VisualSettingsModal.css";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
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
  const clipModelType = useAppStore((s) => s.clipModelType);
  const setClipModelType = useAppStore((s) => s.setClipModelType);
  const [isSwitchingModel, setIsSwitchingModel] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleModelChange = async (modelType: 'fashionclip' | 'huggingface') => {
    if (modelType === clipModelType || isSwitchingModel) return;

    setIsSwitchingModel(true);
    try {
      console.log(`🔄 Switching CLIP model to: ${modelType}`);
      await apiClient.setClipModel(modelType);
      setClipModelType(modelType);
      console.log(`✅ Successfully switched to ${modelType}`);
    } catch (error) {
      console.error(`Failed to switch to ${modelType}:`, error);
      alert(`Failed to switch model: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSwitchingModel(false);
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

          {/* CLIP Model Selection */}
          <div className="settings-section">
            <label className="settings-label">CLIP Embedding Model</label>
            <p className="settings-hint">
              Choose between fashion-specialized (FashionCLIP) or general-purpose (sentence-transformers) embeddings.
            </p>
            <div className="model-selector">
              <label
                className={`model-option ${clipModelType === 'fashionclip' ? 'active' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  cursor: isSwitchingModel ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  opacity: isSwitchingModel && clipModelType !== 'fashionclip' ? 0.5 : 1,
                }}
              >
                <input
                  type="radio"
                  name="clip-model"
                  value="fashionclip"
                  checked={clipModelType === 'fashionclip'}
                  onChange={() => handleModelChange('fashionclip')}
                  disabled={isSwitchingModel}
                />
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '14px' }}>FashionCLIP</strong>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                    Specialized for fashion (Gradio Space)
                  </span>
                </div>
              </label>

              <label
                className={`model-option ${clipModelType === 'huggingface' ? 'active' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  cursor: isSwitchingModel ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  opacity: isSwitchingModel && clipModelType !== 'huggingface' ? 0.5 : 1,
                  marginTop: '8px',
                }}
              >
                <input
                  type="radio"
                  name="clip-model"
                  value="huggingface"
                  checked={clipModelType === 'huggingface'}
                  onChange={() => handleModelChange('huggingface')}
                  disabled={isSwitchingModel}
                />
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '14px' }}>sentence-transformers CLIP</strong>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                    General-purpose, more reliable (HF Inference)
                  </span>
                </div>
              </label>
            </div>
            {isSwitchingModel && (
              <p className="settings-hint" style={{ fontSize: '11px', marginTop: '12px', color: '#ffaa00' }}>
                ⏳ Switching model and re-projecting images...
              </p>
            )}
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
