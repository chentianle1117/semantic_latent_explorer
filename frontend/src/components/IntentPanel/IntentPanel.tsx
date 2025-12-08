import React from 'react';
import './IntentPanel.css';

interface IntentPanelProps {
  // Design Brief
  brief: string;
  onBriefChange: (brief: string) => void | Promise<void>;
  onGeneratePrompts: () => void;
  isGeneratingPrompts: boolean;

  // AI Actions
  onAnalyzeCanvas: () => void;
  isAnalyzing: boolean;
  onSuggestAxes: () => void;
  isLoadingAxes: boolean;
  unexpectedImagesCount: number;
  onUnexpectedImagesCountChange: (count: number) => void;

  // Focus (Agent Analysis Regions)
  focusRegions: Array<{
    center: [number, number];
    title: string;
    description: string;
    suggested_prompts: string[];
  }>;
  onSelectFocus: (index: number) => void;

  // User Preferences (Concise)
  preferences: {
    liked: number;
    generated: number;
    exploration: string;
  };
}

export const IntentPanel: React.FC<IntentPanelProps> = ({
  brief,
  onBriefChange,
  onGeneratePrompts,
  isGeneratingPrompts,
  onAnalyzeCanvas,
  isAnalyzing,
  onSuggestAxes,
  isLoadingAxes,
  unexpectedImagesCount,
  onUnexpectedImagesCountChange,
  focusRegions,
  onSelectFocus,
  preferences,
}) => {
  return (
    <div className="intent-panel">
      {/* Design Brief Section */}
      <div className="intent-section">
        <h3 className="intent-section-title">Design Brief</h3>
        <textarea
          className="brief-textarea"
          value={brief}
          onChange={(e) => onBriefChange(e.target.value)}
          placeholder="Describe your design vision... (e.g., 'minimalist athletic shoes with futuristic elements')"
          rows={4}
        />
        <button
          className="generate-prompts-btn"
          onClick={onGeneratePrompts}
          disabled={!brief || isGeneratingPrompts}
        >
          {isGeneratingPrompts ? '⏳ Generating...' : '✨ Generate Starter Prompts'}
        </button>
      </div>

      {/* AI Actions Section */}
      <div className="intent-section">
        <h3 className="intent-section-title">🤖 AI Actions</h3>
        <div className="ai-actions-grid">
          <button
            className="ai-action-btn"
            onClick={onAnalyzeCanvas}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? '⏳ Analyzing...' : '🔍 Analyze Canvas'}
          </button>
          <button
            className="ai-action-btn"
            onClick={onSuggestAxes}
            disabled={isLoadingAxes}
          >
            {isLoadingAxes ? '⏳ Loading...' : '📊 Suggest Axes'}
          </button>
        </div>

        {/* Unexpected Images Slider */}
        <div className="slider-control" style={{ marginTop: '16px' }}>
          <div className="slider-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label className="slider-label" style={{ fontSize: '13px', color: '#8b949e' }}>
              Unexpected Images
            </label>
            <span className="slider-value" style={{ fontSize: '13px', color: '#58a6ff', fontWeight: 600 }}>
              {unexpectedImagesCount === 0 ? 'Off' : unexpectedImagesCount}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="8"
            value={unexpectedImagesCount}
            onChange={(e) => onUnexpectedImagesCountChange(Number(e.target.value))}
            className="unexpected-slider"
            style={{
              width: '100%',
              height: '4px',
              borderRadius: '2px',
              background: `linear-gradient(to right, #58a6ff 0%, #58a6ff ${(unexpectedImagesCount / 8) * 100}%, #30363d ${(unexpectedImagesCount / 8) * 100}%, #30363d 100%)`,
              outline: 'none',
              cursor: 'pointer'
            }}
          />
          <div className="slider-hint" style={{ fontSize: '11px', color: '#6e7681', marginTop: '4px' }}>
            {unexpectedImagesCount === 0
              ? 'No additional variations will be generated'
              : `Generate ${unexpectedImagesCount} additional variation${unexpectedImagesCount > 1 ? 's' : ''} per prompt`}
          </div>
        </div>
      </div>

      {/* Focus Regions Section */}
      {focusRegions.length > 0 && (
        <div className="intent-section">
          <h3 className="intent-section-title">🎯 Focus Areas</h3>
          <div className="focus-regions-list">
            {focusRegions.map((region, idx) => (
              <div
                key={idx}
                className="focus-region-item"
                onClick={() => onSelectFocus(idx)}
              >
                <div className="focus-region-title">{region.title}</div>
                <div className="focus-region-desc">{region.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User Preferences (Concise) */}
      <div className="intent-section">
        <h3 className="intent-section-title">📊 Progress</h3>
        <div className="preferences-grid">
          <div className="pref-item">
            <span className="pref-label">Liked</span>
            <span className="pref-value">{preferences.liked}</span>
          </div>
          <div className="pref-item">
            <span className="pref-label">Generated</span>
            <span className="pref-value">{preferences.generated}</span>
          </div>
          <div className="pref-item full-width">
            <span className="pref-label">Stage</span>
            <span className="pref-value">{preferences.exploration}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
