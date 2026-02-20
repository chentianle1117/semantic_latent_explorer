/**
 * Prompt Dialog for Reference-based Generation
 * Matches artifact interaction model
 */

import React, { useState } from 'react';
import type { ImageData } from '../../types';
import { ImageCountSlider } from '../ImageCountSlider/ImageCountSlider';
import { SuggestionsPanel } from '../SuggestionsPanel/SuggestionsPanel';
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
  const [numImages, setNumImages] = useState(2);

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
      {/* Two-panel layout: form left, AI suggestions right (separate frame) */}
      <div className="prompt-dialog-outer" onClick={(e) => e.stopPropagation()}>

        {/* Left panel: generate form */}
        <div className="dialog prompt-dialog-main">
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
                  <div className="reference-grid">
                    {referenceImages.map((img) => (
                      <img
                        key={img.id}
                        src={`data:image/png;base64,${img.base64_image}`}
                        alt={`Reference ${img.id}`}
                        className="reference-thumb"
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
                autoFocus
              />

              <ImageCountSlider
                value={numImages}
                onChange={setNumImages}
                label="Number of Variations"
              />
            </div>
          </div>

          <div className="dialog-actions">
            <button onClick={onClose}>
              Cancel
            </button>
            <button
              className="primary"
              onClick={handleGenerate}
              disabled={!prompt.trim()}
            >
              Generate
            </button>
          </div>
        </div>

        {/* Right panel: AI Suggestions — completely separate frame */}
        <div className="dialog prompt-dialog-suggestions">
          <SuggestionsPanel onSelectPrompt={setPrompt} />
        </div>

      </div>
    </div>
  );
};
