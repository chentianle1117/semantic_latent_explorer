import React, { useState } from "react";
import "./AxisSuggestionModal.css";

interface AxisSuggestion {
  x_axis: string;
  y_axis: string;
  reasoning: string;
}

interface AxisSuggestionModalProps {
  suggestions: AxisSuggestion[];
  onApply: (xAxis: string, yAxis: string) => void;
  onClose: () => void;
  isLoading: boolean;
}

export const AxisSuggestionModal: React.FC<AxisSuggestionModalProps> = ({
  suggestions,
  onApply,
  onClose,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="axis-modal-overlay">
        <div className="axis-modal">
          <div className="modal-header">
            <h3>🔄 Suggesting Alternative Axes...</h3>
          </div>
          <div className="modal-loading">
            <div className="spinner"></div>
            <p>Analyzing your canvas...</p>
          </div>
        </div>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="axis-modal-overlay" onClick={onClose}>
      <div className="axis-modal axis-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🔄 Suggested Axis Configurations</h3>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-description">
            Choose an axis configuration to reproject your canvas:
          </p>
          
          <div className="suggestions-grid">
            {suggestions.map((suggestion, index) => (
              <div key={index} className="suggestion-card">
                <div className="card-header">
                  <span className="card-number">Option {index + 1}</span>
                </div>
                
                <div className="axis-preview">
                  <div className="axis-item">
                    <label>X-Axis:</label>
                    <div className="axis-value">{suggestion.x_axis}</div>
                  </div>
                  <div className="axis-item">
                    <label>Y-Axis:</label>
                    <div className="axis-value">{suggestion.y_axis}</div>
                  </div>
                </div>

                <div className="reasoning-section">
                  <label>Why?</label>
                  <p>{suggestion.reasoning}</p>
                </div>

                <button
                  className="button-apply"
                  onClick={() => onApply(suggestion.x_axis, suggestion.y_axis)}
                >
                  Apply This Configuration
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

