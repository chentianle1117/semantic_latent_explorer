/**
 * AI Design Assistant — right panel of Multi-View Editor.
 *
 * Sections:
 *   1. Design Analysis: style summary, current component chips, color palette
 *   2. Component × Descriptor Matrix: clickable tags that accumulate as selected pairs
 *   3. Selected Pairs + Compose button: shows selected edits, can compose into natural prompt
 *   4. Quick Suggestions: pre-composed edit cards (clickable)
 *   5. Edit Prompt + Update All Views button (fixed bottom)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { ImageData, ShoeViewType, ViewAnalysisResponse, DescriptorMatrixRow } from '../../types';
import type { MultiViewSnapshot } from './useMultiViewState';
import { apiClient } from '../../api/client';
import { useAppStore } from '../../store/appStore';
import './AIDesignAssistant.css';

interface AIDesignAssistantProps {
  viewImages: Record<ShoeViewType, ImageData | null>;
  editPrompt: string;
  setEditPrompt: (s: string) => void;
  onUpdate: () => Promise<void>;
  isBusy: boolean;
  progressLabel: string;
  sideViewImage: ImageData;
  history: MultiViewSnapshot[];
  onRevert: (index: number) => void;
}

/** Selected pair: component + descriptor the user clicked */
interface SelectedPair {
  component: string;
  category: string;
  descriptor: string;
}

const CATEGORY_BORDER: Record<string, string> = {
  component: 'aida-suggestion-card--component',
  material: 'aida-suggestion-card--material',
  color: 'aida-suggestion-card--color',
  proportion: 'aida-suggestion-card--proportion',
  detail: 'aida-suggestion-card--detail',
  style: 'aida-suggestion-card--style',
};

/** Colors for descriptor categories in the matrix */
const DESC_CAT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  shape:      { bg: 'rgba(64, 210, 180, 0.12)',  border: 'rgba(64, 210, 180, 0.45)', text: '#40D2B4' },
  material:   { bg: 'rgba(88, 130, 255, 0.12)',   border: 'rgba(88, 130, 255, 0.45)',  text: '#8CB4FF' },
  color:      { bg: 'rgba(255, 160, 64, 0.12)',   border: 'rgba(255, 160, 64, 0.45)',  text: '#FFA040' },
  texture:    { bg: 'rgba(200, 100, 255, 0.12)',  border: 'rgba(200, 100, 255, 0.45)', text: '#C864FF' },
  proportion: { bg: 'rgba(255, 200, 60, 0.12)',   border: 'rgba(255, 200, 60, 0.45)',  text: '#FFC83C' },
  detail:     { bg: 'rgba(255, 100, 120, 0.12)',  border: 'rgba(255, 100, 120, 0.45)', text: '#FF6478' },
};

const DEFAULT_CAT_COLOR = { bg: 'rgba(150, 165, 180, 0.1)', border: 'rgba(150, 165, 180, 0.3)', text: '#96A5B4' };

export const AIDesignAssistant: React.FC<AIDesignAssistantProps> = ({
  viewImages,
  editPrompt,
  setEditPrompt,
  onUpdate,
  isBusy,
  progressLabel,
  sideViewImage,
  history,
  onRevert,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [analysis, setAnalysis] = useState<ViewAnalysisResponse | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [selectedPairs, setSelectedPairs] = useState<SelectedPair[]>([]);
  const [composing, setComposing] = useState(false);
  const designBrief = useAppStore((s) => s.designBrief);

  // Fetch analysis on mount
  const fetchAnalysis = useCallback(async () => {
    setAnalysisLoading(true);
    setAnalysisError(null);

    try {
      const viewBases: Record<string, string> = {};
      for (const [vt, img] of Object.entries(viewImages)) {
        if (img?.base64_image) {
          viewBases[vt] = img.base64_image;
        }
      }

      if (Object.keys(viewBases).length === 0) {
        setAnalysisError('No views available');
        setAnalysisLoading(false);
        return;
      }

      const result = await apiClient.analyzeViews(viewBases, designBrief || undefined);
      setAnalysis(result);
      setSelectedPairs([]); // reset selections on new analysis
    } catch (e) {
      console.error('[AIDesignAssistant] analysis failed:', e);
      setAnalysisError('Analysis failed — click refresh to retry');
    } finally {
      setAnalysisLoading(false);
    }
  }, [viewImages, designBrief]);

  useEffect(() => {
    fetchAnalysis();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle a descriptor tag in the selected pairs
  const togglePair = useCallback((component: string, category: string, descriptor: string) => {
    setSelectedPairs(prev => {
      const exists = prev.some(p => p.component === component && p.descriptor === descriptor);
      if (exists) {
        return prev.filter(p => !(p.component === component && p.descriptor === descriptor));
      }
      // Replace any existing selection for same component+category
      const filtered = prev.filter(p => !(p.component === component && p.category === category));
      return [...filtered, { component, category, descriptor }];
    });
  }, []);

  const isPairSelected = useCallback((component: string, descriptor: string) => {
    return selectedPairs.some(p => p.component === component && p.descriptor === descriptor);
  }, [selectedPairs]);

  // Compose prompt from selected pairs via Gemini
  const handleCompose = useCallback(async () => {
    if (selectedPairs.length === 0) return;
    setComposing(true);
    try {
      const result = await apiClient.composeEditPrompt(
        selectedPairs.map(p => ({ component: p.component, descriptor: p.descriptor })),
        analysis?.style_summary,
        designBrief || undefined,
      );
      setEditPrompt(result.prompt);
      setTimeout(() => textareaRef.current?.focus(), 50);
    } catch (e) {
      console.error('[AIDesignAssistant] compose failed:', e);
      // Fallback: simple concatenation
      const text = selectedPairs.map(p => `${p.descriptor} ${p.component}`).join(', ');
      setEditPrompt(text);
    } finally {
      setComposing(false);
    }
  }, [selectedPairs, analysis, designBrief, setEditPrompt]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onUpdate();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setEditPrompt(suggestion);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  return (
    <div className="aida-panel">
      {/* Section 1: Design Analysis (compact) */}
      <div className="aida-section">
        <div className="aida-section-header">
          <span className="aida-section-title">Current Design</span>
          <button
            className="aida-refresh-btn"
            onClick={fetchAnalysis}
            disabled={analysisLoading}
            title="Refresh analysis"
          >
            ↺
          </button>
        </div>

        {analysisLoading ? (
          <div className="aida-loading">
            <div className="aida-loading-spinner" />
            <span className="aida-loading-text">Analyzing views...</span>
          </div>
        ) : analysisError ? (
          <span className="aida-error">{analysisError}</span>
        ) : analysis ? (
          <>
            {analysis.style_summary && (
              <div className="aida-style-summary">{analysis.style_summary}</div>
            )}

            {/* Current component chips */}
            {analysis.components.length > 0 && (
              <div className="aida-components">
                {analysis.components.map((comp, i) => (
                  <span key={i} className="aida-component-chip">
                    <span className="aida-chip-name">{comp.name}</span>
                    {comp.current && comp.current.length > 0 && (
                      <span className="aida-chip-desc">
                        {comp.current.slice(0, 2).join(', ')}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            )}

            {/* Color palette */}
            {analysis.color_palette.length > 0 && (
              <div className="aida-palette" style={{ marginTop: 8 }}>
                {analysis.color_palette.map((swatch, i) => (
                  <div key={i} className="aida-swatch">
                    <div
                      className="aida-swatch-circle"
                      style={{ backgroundColor: swatch.hex }}
                    />
                    <span className="aida-swatch-label">{swatch.name}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Section 2: Component × Descriptor Matrix */}
      {analysis && analysis.descriptor_matrix && analysis.descriptor_matrix.length > 0 && (
        <div className="aida-section aida-matrix-section">
          <div className="aida-section-header">
            <span className="aida-section-title">Edit Components</span>
            {selectedPairs.length > 0 && (
              <span className="aida-pair-count">{selectedPairs.length} selected</span>
            )}
          </div>
          <div className="aida-matrix">
            {analysis.descriptor_matrix.map((row: DescriptorMatrixRow, ri: number) => (
              <div key={ri} className="aida-matrix-row">
                <div className="aida-matrix-component">{row.component}</div>
                <div className="aida-matrix-tags">
                  {Object.entries(row.descriptors).map(([cat, options]) => {
                    const catColor = DESC_CAT_COLORS[cat] || DEFAULT_CAT_COLOR;
                    return options.map((opt: string, oi: number) => {
                      const selected = isPairSelected(row.component, opt);
                      return (
                        <button
                          key={`${cat}-${oi}`}
                          className={`aida-matrix-tag ${selected ? 'aida-matrix-tag--selected' : ''}`}
                          style={{
                            background: selected ? catColor.bg : 'transparent',
                            borderColor: selected ? catColor.border : 'rgba(255,255,255,0.08)',
                            color: selected ? catColor.text : 'rgba(180,195,210,0.6)',
                          }}
                          onClick={() => togglePair(row.component, cat, opt)}
                          title={`${cat}: ${opt}`}
                        >
                          {opt}
                        </button>
                      );
                    });
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Compose button */}
          {selectedPairs.length > 0 && (
            <button
              className="aida-compose-btn"
              onClick={handleCompose}
              disabled={composing}
            >
              {composing ? 'Composing...' : `Compose Prompt (${selectedPairs.length})`}
            </button>
          )}
        </div>
      )}

      {/* Section 3: Quick Suggestions */}
      {analysis && analysis.suggested_edits.length > 0 && (
        <div className="aida-section" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div className="aida-section-header">
            <span className="aida-section-title">Quick Suggestions</span>
          </div>
          <div className="aida-suggestions">
            {analysis.suggested_edits.map((edit, i) => (
              <div
                key={i}
                className={`aida-suggestion-card ${CATEGORY_BORDER[edit.category] || ''}`}
                onClick={() => handleSuggestionClick(edit.suggestion)}
              >
                <div className="aida-suggestion-text">{edit.suggestion}</div>
                <div className="aida-suggestion-meta">
                  <span className="aida-suggestion-category">{edit.category}</span>
                  {edit.reasoning && (
                    <span className="aida-suggestion-reasoning">{edit.reasoning}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 4: Version History — horizontal strip of side-view thumbnails */}
      {history.length > 0 && (
        <div className="aida-section aida-history-section">
          <div className="aida-section-header">
            <span className="aida-section-title">Version History</span>
          </div>
          <div className="aida-history-strip">
            {/* Original */}
            <div
              className="aida-history-item"
              onClick={() => onRevert(-1)}
              title="Original"
            >
              <div className="aida-history-thumb-wrap">
                {sideViewImage.base64_image ? (
                  <img
                    className="aida-history-thumb"
                    src={`data:image/png;base64,${sideViewImage.base64_image}`}
                    alt="Original"
                    draggable={false}
                  />
                ) : (
                  <div className="aida-history-thumb-empty" />
                )}
              </div>
              <span className="aida-history-label">Original</span>
            </div>

            {/* Snapshots */}
            {history.map((snap, i) => {
              const thumb = snap.views['side'] || snap.views['3/4-front'];
              return (
                <div
                  key={i}
                  className="aida-history-item"
                  onClick={() => onRevert(i)}
                  title={snap.prompt}
                >
                  <div className="aida-history-thumb-wrap">
                    {thumb?.base64_image ? (
                      <img
                        className="aida-history-thumb"
                        src={`data:image/png;base64,${thumb.base64_image}`}
                        alt={`v${i + 1}`}
                        draggable={false}
                      />
                    ) : (
                      <div className="aida-history-thumb-empty" />
                    )}
                  </div>
                  <span className="aida-history-label" title={snap.prompt}>v{i + 1}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section 5: Edit Prompt + Update (fixed at bottom) */}
      <div className="aida-edit-section">
        {isBusy ? (
          <div className="aida-progress">
            <div className="aida-progress-spinner" />
            <span className="aida-progress-label">{progressLabel}</span>
          </div>
        ) : (
          <>
            <textarea
              ref={textareaRef}
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='Select descriptors above or type your edit...'
              rows={2}
            />
            <button
              className="aida-update-btn"
              onClick={onUpdate}
              disabled={!editPrompt.trim()}
            >
              Update All Views
            </button>
          </>
        )}
      </div>
    </div>
  );
};
