import React, { useState } from "react";
import { ImageCountSlider } from "../ImageCountSlider/ImageCountSlider";
import "./PromptBanner.css";

interface SuggestedPrompt {
  prompt: string;
  reasoning: string;
}

interface PromptBannerProps {
  prompts: SuggestedPrompt[];
  onAcceptPrompt: (prompt: string, index: number, count: number) => void;
  onDismiss: () => void;
}

export const PromptBanner: React.FC<PromptBannerProps> = ({
  prompts,
  onAcceptPrompt,
  onDismiss,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showReasoning, setShowReasoning] = useState(false);
  const [imageCount, setImageCount] = useState(4);

  if (prompts.length === 0) return null;

  const currentPrompt = prompts[selectedIndex];

  return (
    <div className="prompt-banner">
      <div className="banner-content">
        <div className="banner-icon">✨</div>

        <div className="banner-text">
          <div className="banner-title">Suggested Prompt</div>
          <div className="banner-prompt">{currentPrompt.prompt}</div>
          {showReasoning && (
            <div className="banner-reasoning">
              <strong>Why:</strong> {currentPrompt.reasoning}
            </div>
          )}
          <div className="banner-slider">
            <ImageCountSlider
              value={imageCount}
              onChange={setImageCount}
              label="Images"
            />
          </div>
        </div>

        <div className="banner-actions">
          {prompts.length > 1 && (
            <div className="prompt-selector">
              <button
                className="selector-button"
                onClick={() => setSelectedIndex((selectedIndex - 1 + prompts.length) % prompts.length)}
                title="Previous suggestion"
              >
                ←
              </button>
              <span className="selector-count">
                {selectedIndex + 1} / {prompts.length}
              </span>
              <button
                className="selector-button"
                onClick={() => setSelectedIndex((selectedIndex + 1) % prompts.length)}
                title="Next suggestion"
              >
                →
              </button>
            </div>
          )}

          <button
            className="banner-button info"
            onClick={() => setShowReasoning(!showReasoning)}
            title={showReasoning ? "Hide reasoning" : "Show reasoning"}
          >
            {showReasoning ? "Hide" : "Why?"}
          </button>

          <button
            className="banner-button primary"
            onClick={() => onAcceptPrompt(currentPrompt.prompt, selectedIndex, imageCount)}
          >
            Generate
          </button>

          <button
            className="banner-button dismiss"
            onClick={onDismiss}
            title="Dismiss suggestions"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
};
