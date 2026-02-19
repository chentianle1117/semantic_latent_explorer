import React, { useState } from "react";
import { ImageCountSlider } from "../ImageCountSlider/ImageCountSlider";
import { SuggestionsPanel } from "../SuggestionsPanel/SuggestionsPanel";
import "./BatchPromptDialog.css";

interface BatchPromptDialogProps {
  onClose: () => void;
  onGenerate: (prompts: string[], countPerPrompt: number) => void;
}

export const BatchPromptDialog: React.FC<BatchPromptDialogProps> = ({
  onClose,
  onGenerate,
}) => {
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [imagesPerPrompt, setImagesPerPrompt] = useState(4);

  const handleGenerate = () => {
    setError(null);

    if (!jsonText.trim()) {
      setError("Please paste a JSON array of prompts");
      return;
    }

    try {
      const parsed = JSON.parse(jsonText);

      if (!Array.isArray(parsed)) {
        setError("JSON must be an array of strings");
        return;
      }

      if (parsed.length === 0) {
        setError("Array cannot be empty");
        return;
      }

      const allStrings = parsed.every(item => typeof item === "string");
      if (!allStrings) {
        setError("All items in the array must be strings");
        return;
      }

      onGenerate(parsed, imagesPerPrompt);
    } catch (e) {
      setError(`Invalid JSON: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  };

  // Append a suggested prompt to the JSON array
  const handleSuggestionSelect = (prompt: string) => {
    const trimmed = jsonText.trim();
    try {
      const existing = trimmed ? JSON.parse(trimmed) : [];
      if (Array.isArray(existing)) {
        existing.push(prompt);
        setJsonText(JSON.stringify(existing, null, 2));
        setError(null);
        return;
      }
    } catch {
      // Not valid JSON yet
    }
    setJsonText(JSON.stringify([prompt], null, 2));
    setError(null);
  };

  const sampleJSON = `[
  "A minimalist low-top sneaker with smooth white leather",
  "A chunky 90s running shoe with grey suede and mesh",
  "A futuristic high-top sock-fit runner in black knit"
]`;

  return (
    <div className="batch-prompt-dialog-overlay" onClick={onClose}>
      <div className="batch-prompt-dialog batch-dialog-wide" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Batch Generate from JSON Prompts</h2>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="dialog-content batch-dialog-columns">
          <div className="batch-dialog-left">
            <p className="dialog-description">
              Paste a JSON array of prompt strings. Each prompt will be generated one at a time.
            </p>

            <div className="sample-section">
              <strong>Example format:</strong>
              <pre className="sample-json">{sampleJSON}</pre>
            </div>

            <textarea
              className="json-input"
              placeholder="Paste your JSON array here..."
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                setError(null);
              }}
              rows={10}
            />

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <div className="batch-slider-section">
              <ImageCountSlider
                value={imagesPerPrompt}
                onChange={setImagesPerPrompt}
                label="Images per Prompt"
              />
            </div>

            <div className="dialog-stats">
              {jsonText.trim() && !error && (() => {
                try {
                  const parsed = JSON.parse(jsonText);
                  if (Array.isArray(parsed)) {
                    return <span>{parsed.length} prompts ready to generate</span>;
                  }
                } catch {
                  // Ignore
                }
                return null;
              })()}
            </div>
          </div>

          {/* AI Suggestions — click to append to JSON array */}
          <SuggestionsPanel onSelectPrompt={handleSuggestionSelect} />
        </div>

        <div className="dialog-actions">
          <button className="action-button secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="action-button primary"
            onClick={handleGenerate}
            disabled={!jsonText.trim()}
          >
            Start Batch Generation
          </button>
        </div>
      </div>
    </div>
  );
};
