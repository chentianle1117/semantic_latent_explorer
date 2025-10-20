/**
 * Prompt Dialog for Reference-based Generation
 * Matches artifact interaction model
 */

import React, { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import type { ImageData } from '../../types';
import './PromptDialog.css';

interface PromptDialogProps {
  referenceImages: ImageData[];  // Changed to array
  onClose: () => void;
  onGenerate: (referenceIds: number[], prompt: string, numImages: number) => void;  // Changed signature
}

export const PromptDialog: React.FC<PromptDialogProps> = ({
  referenceImages,  // Changed to array
  onClose,
  onGenerate,
}) => {
  const [prompt, setPrompt] = useState('');
  const [numImages, setNumImages] = useState(4);  // New: number of variations to generate
  const generationMode = useAppStore((state) => state.generationMode);
  const isGenerating = useAppStore((state) => state.isGenerating);

  const handleGenerate = () => {
    if (!prompt.trim()) {
      alert('Please enter a prompt');
      return;
    }
    const referenceIds = referenceImages.map(img => img.id);
    onGenerate(referenceIds, prompt, numImages);
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Generate from Reference{referenceImages.length > 1 ? 's' : ''}</h2>

        <div className="dialog-content">
          <div className="preview-section">
            {referenceImages.length === 1 ? (
              <>
                <img
                  src={`data:image/png;base64,${referenceImages[0].base64_image}`}
                  alt={`Reference ${referenceImages[0].id}`}
                  className="reference-preview"
                />
                <p className="reference-label">Reference Image #{referenceImages[0].id}</p>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {referenceImages.map((img) => (
                    <img
                      key={img.id}
                      src={`data:image/png;base64,${img.base64_image}`}
                      alt={`Reference ${img.id}`}
                      style={{ width: '80px', height: '80px', borderRadius: '4px', objectFit: 'cover' }}
                    />
                  ))}
                </div>
                <p className="reference-label">{referenceImages.length} Reference Images</p>
              </>
            )}
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

            {generationMode === 'fal-nanobanana' && (
              <>
                <label>
                  Number of variations: <span className="strength-value">{numImages}</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="8"
                  step="1"
                  value={numImages}
                  onChange={(e) => setNumImages(parseInt(e.target.value, 10))}
                  disabled={isGenerating}
                />
                <p className="helper-text">
                  Generate {numImages} variation{numImages > 1 ? 's' : ''} based on {referenceImages.length} reference{referenceImages.length > 1 ? 's' : ''}
                </p>
              </>
            )}
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
