import React, { useState } from 'react';
import { ImageCountSlider } from '../ImageCountSlider/ImageCountSlider';
import './RegionPromptDialog.css';

interface RegionPromptDialogProps {
  prompt: string;
  regionTitle: string;
  regionType: 'cluster' | 'gap';
  onConfirm: (count: number) => void;
  onCancel: () => void;
}

export const RegionPromptDialog: React.FC<RegionPromptDialogProps> = ({
  prompt,
  regionTitle,
  regionType,
  onConfirm,
  onCancel,
}) => {
  const [imageCount, setImageCount] = useState(2);

  return (
    <div className="region-prompt-dialog-overlay" onClick={onCancel}>
      <div className="region-prompt-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>
            {regionType === 'cluster' ? '🔵' : '🟠'} Generate from {regionTitle}
          </h3>
          <button className="close-button" onClick={onCancel}>
            ×
          </button>
        </div>

        <div className="dialog-content">
          <div className="prompt-preview">
            <label>Prompt:</label>
            <p>{prompt}</p>
          </div>

          <ImageCountSlider
            value={imageCount}
            onChange={setImageCount}
            label="Images to Generate"
          />
        </div>

        <div className="dialog-actions">
          <button className="action-button secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="action-button primary"
            onClick={() => onConfirm(imageCount)}
          >
            🚀 Generate {imageCount} Image{imageCount > 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
};
