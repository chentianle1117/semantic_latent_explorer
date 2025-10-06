/**
 * Interpolation Dialog Component
 * Allows users to configure interpolation between two images
 */

import React, { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import type { ImageData } from '../../types';
import './InterpolationDialog.css';

interface InterpolationDialogProps {
  imageA: ImageData;
  imageB: ImageData;
  onClose: () => void;
  onInterpolate: (idA: number, idB: number, alpha: number, steps?: number) => void;
}

export const InterpolationDialog: React.FC<InterpolationDialogProps> = ({
  imageA,
  imageB,
  onClose,
  onInterpolate,
}) => {
  const [alpha, setAlpha] = useState(0.5);
  const [steps, setSteps] = useState(5);
  const [generateMultiple, setGenerateMultiple] = useState(false);
  const isGenerating = useAppStore((state) => state.isGenerating);

  const handleInterpolate = () => {
    onInterpolate(imageA.id, imageB.id, alpha, generateMultiple ? steps : undefined);
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog interpolation-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>🔀 Interpolate Between Images</h2>

        <div className="dialog-content">
          <div className="preview-section dual-preview">
            <div className="preview-item">
              <img
                src={`data:image/png;base64,${imageA.base64_image}`}
                alt={`Image A ${imageA.id}`}
                className="reference-preview"
              />
              <p className="reference-label">Image A (#{imageA.id})</p>
            </div>
            <div className="preview-arrow">→</div>
            <div className="preview-item">
              <img
                src={`data:image/png;base64,${imageB.base64_image}`}
                alt={`Image B ${imageB.id}`}
                className="reference-preview"
              />
              <p className="reference-label">Image B (#{imageB.id})</p>
            </div>
          </div>

          <div className="input-section">
            <div className="option-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={generateMultiple}
                  onChange={(e) => setGenerateMultiple(e.target.checked)}
                  disabled={isGenerating}
                />
                Generate multiple interpolation steps
              </label>
            </div>

            {!generateMultiple ? (
              <>
                <label>
                  Interpolation weight (α): <span className="strength-value">{alpha.toFixed(2)}</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={alpha}
                  onChange={(e) => setAlpha(parseFloat(e.target.value))}
                  disabled={isGenerating}
                />
                <p className="helper-text">
                  0.0 = more like Image A, 1.0 = more like Image B
                </p>
              </>
            ) : (
              <>
                <label>
                  Number of steps: <span className="strength-value">{steps}</span>
                </label>
                <input
                  type="range"
                  min="3"
                  max="10"
                  step="1"
                  value={steps}
                  onChange={(e) => setSteps(parseInt(e.target.value))}
                  disabled={isGenerating}
                />
                <p className="helper-text">
                  Generate {steps} images evenly spaced between A and B
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
            onClick={handleInterpolate}
            disabled={isGenerating}
          >
            {isGenerating ? 'Generating...' : generateMultiple ? `Generate ${steps} Images` : 'Interpolate'}
          </button>
        </div>
      </div>
    </div>
  );
};
