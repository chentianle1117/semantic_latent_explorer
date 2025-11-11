import React, { useState } from "react";
import "./BriefPanel.css";

interface SuggestedPrompt {
  prompt: string;
  reasoning: string;
}

interface BriefPanelProps {
  onPromptsGenerated: (prompts: SuggestedPrompt[], brief: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const BriefPanel: React.FC<BriefPanelProps> = ({
  onPromptsGenerated,
  isCollapsed,
  onToggleCollapse,
}) => {
  const [brief, setBrief] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!brief.trim()) {
      setError("Please enter a design brief");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("http://localhost:8000/api/agent/initial-prompts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ brief: brief.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to generate prompts");
      }

      const data = await response.json();
      onPromptsGenerated(data.prompts, brief.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to agent");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`brief-panel ${isCollapsed ? "collapsed" : ""}`}>
      <div className="panel-header">
        <h3>Design Brief</h3>
        <button
          className="collapse-button"
          onClick={onToggleCollapse}
          title={isCollapsed ? "Expand panel" : "Collapse panel"}
        >
          {isCollapsed ? "→" : "←"}
        </button>
      </div>

      {!isCollapsed && (
        <div className="panel-content">
          <p className="panel-description">
            Describe your design exploration goal. The AI agent will suggest
            initial prompts to get you started.
          </p>

          <textarea
            className="brief-textarea"
            placeholder="e.g., I want to explore athletic sneakers with bold colors and modern designs..."
            value={brief}
            onChange={(e) => {
              setBrief(e.target.value);
              setError(null);
            }}
            disabled={isLoading}
          />

          {error && <div className="error-message">{error}</div>}

          <button
            className="submit-button"
            onClick={handleSubmit}
            disabled={isLoading || !brief.trim()}
          >
            {isLoading ? "Thinking..." : "Generate Starter Prompts"}
          </button>

          <div className="panel-footer">
            <small>Powered by Gemini 2.0 Flash</small>
          </div>
        </div>
      )}
    </div>
  );
};
