/**
 * Prompt Dialog for Reference-based Generation
 * Matches artifact interaction model
 */

import React, { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import type { ImageData } from '../../types';
import './PromptDialog.css';

interface PromptDialogProps {
  referenceImage: ImageData;
  onClose: () => void;
  onGenerate: (referenceId: number, prompt: string, strength?: number) => void;
}

export const PromptDialog: React.FC<PromptDialogProps> = ({
  referenceImage,
  onClose,
  onGenerate,
}) => {
  const [prompt, setPrompt] = useState('');
  const [strength, setStrength] = useState(0.65);
  const isGenerating = useAppStore((state) => state.isGenerating);

  const handleGenerate = () => {
    if (!prompt.trim()) {
      alert('Please enter a prompt');
      return;
    }
    onGenerate(referenceImage.id, prompt, strength);
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Generate from Reference</h2>

        <div className="dialog-content">
          <div className="preview-section">
            <img
              src={`data:image/png;base64,${referenceImage.base64_image}`}
              alt={`Reference ${referenceImage.id}`}
              className="reference-preview"
            />
            <p className="reference-label">Reference Image #{referenceImage.id}</p>
          </div>

          <div className="input-section">
            <label>Additional prompt:</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., more minimalist, brighter colors..."
              rows={4}
              disabled={isGenerating}
              autoFocus
            />

            <label>
              Variation strength: <span className="strength-value">{strength}</span>
            </label>
            <input
              type="range"
              min="0.3"
              max="0.9"
              step="0.05"
              value={strength}
              onChange={(e) => setStrength(parseFloat(e.target.value))}
              disabled={isGenerating}
            />
            <p className="helper-text">Higher = more variation from reference</p>
          </div>
        </div>

        <div className="dialog-actions">
          <button onClick={onClose} disabled={isGenerating}>
            Cancel
          </button>
          <button
            className="primary"
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
          >
            {isGenerating ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
};
