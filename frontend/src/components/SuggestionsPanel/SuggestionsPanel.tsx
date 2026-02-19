/**
 * AI Prompt Suggestions Panel
 * Shown in generation dialogs alongside the prompt textarea.
 * Fetches context-aware suggestions based on brief + canvas state.
 */

import React, { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../store/appStore";
import { apiClient } from "../../api/client";
import "./SuggestionsPanel.css";

interface Suggestion {
  prompt: string;
  reasoning: string;
}

interface SuggestionsPanelProps {
  onSelectPrompt: (prompt: string) => void;
}

export const SuggestionsPanel: React.FC<SuggestionsPanelProps> = ({ onSelectPrompt }) => {
  const designBrief = useAppStore((s) => s.designBrief);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    setIsLoading(true);
    setError(false);
    try {
      const result = await apiClient.getContextPrompts(
        designBrief || "Explore shoe design variations"
      );
      setSuggestions(result.prompts || []);
    } catch (e) {
      console.debug("[SuggestionsPanel] Failed to fetch:", e);
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, [designBrief]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  return (
    <div className="suggestions-panel">
      <div className="sp-header">
        <span className="sp-title">✨ AI Suggestions</span>
        <button
          className="sp-refresh"
          onClick={fetchSuggestions}
          disabled={isLoading}
          title="Refresh suggestions"
        >
          ↺
        </button>
      </div>

      <div className="sp-body">
        {isLoading ? (
          <>
            <div className="sp-skeleton" />
            <div className="sp-skeleton" />
            <div className="sp-skeleton" />
          </>
        ) : error ? (
          <div className="sp-empty">Could not load suggestions</div>
        ) : suggestions.length === 0 ? (
          <div className="sp-empty">No suggestions yet</div>
        ) : (
          suggestions.map((s, i) => (
            <button
              key={i}
              className="sp-card"
              onClick={() => onSelectPrompt(s.prompt)}
              title={s.reasoning}
            >
              <span className="sp-prompt">{s.prompt}</span>
              <span className="sp-reason">{s.reasoning}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
