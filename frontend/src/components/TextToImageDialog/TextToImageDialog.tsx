import React, { useState } from 'react';
import { ImageCountSlider } from '../ImageCountSlider/ImageCountSlider';
import { SuggestionsPanel } from '../SuggestionsPanel/SuggestionsPanel';
import '../PromptDialog/PromptDialog.css';

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="prompt-dialog-outer" onClick={(e) => e.stopPropagation()}>

        {/* Left panel: prompt + count */}
        <div className="dialog prompt-dialog-main">
          <h2>Generate from Text</h2>

          <div className="input-section" style={{ flex: 1 }}>
            <label>Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the shoe design you want to generate… (e.g., 'minimalist white sneaker with futuristic details')"
              rows={5}
              autoFocus
            />
            <ImageCountSlider
              value={imageCount}
              onChange={setImageCount}
              label="Number of Images"
            />
          </div>

          <div className="dialog-actions">
            <button onClick={onClose}>Cancel</button>
            <button
              className="primary"
              onClick={handleSubmit}
              disabled={!prompt.trim()}
            >
              Generate {imageCount} Image{imageCount > 1 ? 's' : ''}
            </button>
          </div>
        </div>

        {/* Right panel: AI suggestions — separate frame */}
        <div className="dialog prompt-dialog-suggestions">
          <SuggestionsPanel onSelectPrompt={setPrompt} />
        </div>

      </div>
    </div>
  );
};
