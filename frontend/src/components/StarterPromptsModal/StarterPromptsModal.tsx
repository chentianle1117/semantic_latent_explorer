import React from 'react';
import { ImageCountSlider } from '../ImageCountSlider/ImageCountSlider';
import './StarterPromptsModal.css';

interface SuggestedPrompt {
  prompt: string;
  reasoning: string;
}

interface StarterPromptsModalProps {
  prompts: SuggestedPrompt[];
  onAccept: (prompt: string, index: number, count: number) => void;
  onClose: () => void;
}

export const StarterPromptsModal: React.FC<StarterPromptsModalProps> = ({
  prompts,
  onAccept,
  onClose,
}) => {
  const [imageCount, setImageCount] = React.useState(4);

  if (prompts.length === 0) {
    return null;
  }

  return (
    <div className="starter-prompts-overlay" onClick={onClose}>
      <div className="starter-prompts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>✨ AI-Generated Starter Prompts</h3>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-description">
            Select a prompt to start generating shoe designs:
          </p>

          <div className="image-count-section">
            <ImageCountSlider
              value={imageCount}
              onChange={setImageCount}
              label="Images per Prompt"
            />
          </div>

          <div className="prompts-grid">
            {prompts.map((prompt, index) => (
              <div key={index} className="prompt-card">
                <div className="card-header">
                  <span className="card-number">Prompt {index + 1}</span>
                </div>

                <div className="prompt-text">{prompt.prompt}</div>

                <div className="reasoning-section">
                  <label>Why this prompt?</label>
                  <p>{prompt.reasoning}</p>
                </div>

                <button
                  className="button-generate"
                  onClick={() => {
                    onAccept(prompt.prompt, index, imageCount);
                    onClose();
                  }}
                >
                  Generate {imageCount} Image{imageCount > 1 ? 's' : ''}
                </button>
              </div>
            ))}
          </div>

          <div className="modal-actions">
            <button className="button-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

