/**
 * Mode Toggle Component - Switch between Local SD 1.5 and fal.ai nano-banana
 */

import React from "react";
import { useAppStore } from "../../store/appStore";
import { falClient } from "../../api/falClient";
import "./ModeToggle.css";

export const ModeToggle: React.FC = () => {
  const generationMode = useAppStore((state) => state.generationMode);
  const setGenerationMode = useAppStore((state) => state.setGenerationMode);
  const removeBackground = useAppStore((state) => state.removeBackground);
  const setRemoveBackground = useAppStore((state) => state.setRemoveBackground);
  const isGenerating = useAppStore((state) => state.isGenerating);

  const falConfigured = falClient.isConfigured();

  return (
    <div className="mode-toggle-container">
      <div className="mode-toggle-label">Generation Mode:</div>
      <div className="mode-toggle-buttons">
        <button
          className={`mode-toggle-btn ${generationMode === 'local-sd15' ? 'active' : ''}`}
          onClick={() => setGenerationMode('local-sd15')}
          disabled={isGenerating}
        >
          Local SD 1.5
        </button>
        <button
          className={`mode-toggle-btn ${generationMode === 'fal-nanobanana' ? 'active' : ''}`}
          onClick={() => setGenerationMode('fal-nanobanana')}
          disabled={isGenerating || !falConfigured}
          title={!falConfigured ? 'Set VITE_FAL_API_KEY in .env file' : ''}
        >
          fal.ai Nano-Banana
          {!falConfigured && <span className="warning-indicator">⚠️</span>}
        </button>
      </div>

      {/* Background Removal Toggle */}
      <div className="background-toggle">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={removeBackground}
            onChange={(e) => setRemoveBackground(e.target.checked)}
            disabled={isGenerating}
          />
          <span className="toggle-text">Remove background from generated shoes</span>
        </label>
      </div>

      {!falConfigured && generationMode === 'fal-nanobanana' && (
        <div className="mode-warning">
          ⚠️ fal.ai API key not configured. Please set VITE_FAL_API_KEY in your .env file.
        </div>
      )}
    </div>
  );
};
