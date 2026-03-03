/**
 * Inline Axis Suggestions
 * Appears at the bottom-center of the canvas when axis suggestions are available.
 * Reads from inlineAxisData (decoupled from agentInsight so DynamicIsland dismiss doesn't kill this panel).
 */

import React from "react";
import { useAppStore } from "../../store/appStore";
import { apiClient } from "../../api/client";
import "./InlineAxisSuggestions.css";

interface InlineAxisSuggestionsProps {
  onApply: (xAxis: string, yAxis: string) => void;
}

export const InlineAxisSuggestions: React.FC<InlineAxisSuggestionsProps> = ({ onApply }) => {
  const suggestions = useAppStore((s) => s.inlineAxisData);
  const clearInlineAxisData = useAppStore((s) => s.clearInlineAxisData);

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="inline-axis-suggestions">
      <div className="ias-header">
        <span className="ias-title">Axis suggestions</span>
        <button className="ias-dismiss" onClick={clearInlineAxisData} title="Dismiss">
          ×
        </button>
      </div>
      <div className="ias-cards">
        {suggestions.map((s, i) => (
          <button
            key={i}
            className="ias-card"
            onClick={() => {
              apiClient.logEvent('axis_suggestion_apply', { xAxis: s.x_axis, yAxis: s.y_axis, reasoning: s.reasoning });
              onApply(s.x_axis, s.y_axis);
              clearInlineAxisData();
            }}
            title={s.reasoning}
          >
            <span className="ias-axes">
              <span className="ias-axis-x">X: {s.x_axis}</span>
              <span className="ias-sep"> / </span>
              <span className="ias-axis-y">Y: {s.y_axis}</span>
            </span>
            <span className="ias-reason">{s.reasoning}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
