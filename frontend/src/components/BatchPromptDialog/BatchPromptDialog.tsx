import React, { useState } from "react";
import "./BatchPromptDialog.css";

interface BatchPromptDialogProps {
  onClose: () => void;
  onGenerate: (prompts: string[]) => void;
}

export const BatchPromptDialog: React.FC<BatchPromptDialogProps> = ({
  onClose,
  onGenerate,
}) => {
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);

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

      // Validate all items are strings
      const allStrings = parsed.every(item => typeof item === "string");
      if (!allStrings) {
        setError("All items in the array must be strings");
        return;
      }

      // Success - pass the prompts to parent
      onGenerate(parsed);
    } catch (e) {
      setError(`Invalid JSON: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  };

  const sampleJSON = `[
  "A minimalist low-top sneaker with smooth white leather",
  "A chunky 90s running shoe with grey suede and mesh",
  "A futuristic high-top sock-fit runner in black knit"
]`;

  return (
    <div className="batch-prompt-dialog-overlay" onClick={onClose}>
      <div className="batch-prompt-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>📝 Batch Generate from JSON Prompts</h2>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="dialog-content">
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
            rows={15}
          />

          {error && (
            <div className="error-message">
              ⚠️ {error}
            </div>
          )}

          <div className="dialog-stats">
            {jsonText.trim() && !error && (() => {
              try {
                const parsed = JSON.parse(jsonText);
                if (Array.isArray(parsed)) {
                  return <span>✓ {parsed.length} prompts ready to generate</span>;
                }
              } catch {
                // Ignore parsing errors here, will show in error message
              }
              return null;
            })()}
          </div>
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
            🚀 Start Batch Generation
          </button>
        </div>
      </div>
    </div>
  );
};
