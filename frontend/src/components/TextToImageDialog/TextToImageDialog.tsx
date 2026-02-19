import React, { useState } from 'react';
import { ImageCountSlider } from '../ImageCountSlider/ImageCountSlider';
import { SuggestionsPanel } from '../SuggestionsPanel/SuggestionsPanel';
import './TextToImageDialog.css';

interface TextToImageDialogProps {
  onClose: () => void;
  onGenerate: (prompt: string, count: number) => void;
}

export const TextToImageDialog: React.FC<TextToImageDialogProps> = ({
  onClose,
  onGenerate,
}) => {
  const [prompt, setPrompt] = useState('');
  const [imageCount, setImageCount] = useState(4);

  const handleSubmit = () => {
    if (!prompt.trim()) {
      alert('Please enter a prompt');
      return;
    }
    onGenerate(prompt, imageCount);
    onClose();
  };

  return (
    <div className="text-to-image-overlay" onClick={onClose}>
      <div className="text-to-image-dialog tti-wide" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>🎨 Generate Images from Text</h3>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="dialog-body tti-columns">
          {/* Left: prompt + count */}
          <div className="tti-left">
            <div className="prompt-section">
              <label>Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the shoe design you want to generate… (e.g., 'minimalist white sneaker with futuristic details')"
                rows={5}
                autoFocus
              />
            </div>
            <div className="count-section">
              <ImageCountSlider
                value={imageCount}
                onChange={setImageCount}
                label="Number of Images"
              />
            </div>
          </div>

          {/* Right: AI suggestions */}
          <SuggestionsPanel onSelectPrompt={setPrompt} />
        </div>

        <div className="dialog-actions">
          <button className="button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button-primary"
            onClick={handleSubmit}
            disabled={!prompt.trim()}
          >
            Generate {imageCount} Image{imageCount > 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
};
