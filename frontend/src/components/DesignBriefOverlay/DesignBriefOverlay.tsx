/**
 * Design Brief Overlay — always-visible inline brief on the canvas.
 *
 * Inline editing: click the text to edit directly in place.
 * No mode switch / separate popup — the brief container subtly transforms
 * when focused (backdrop + border glow) without changing layout.
 *
 * Three sections:
 *  1. Brief text — click to edit inline, blur to auto-save + interpret
 *  2. AI-extracted structured fields — editable, explicit "Save" button
 *  3. Suggested params — clickable chips → become fields
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAppStore } from "../../store/appStore";
import { apiClient } from "../../api/client";
import type { BriefSuggestedParam } from "../../types";
import "./DesignBriefOverlay.css";

export const DesignBriefOverlay: React.FC = () => {
  const designBrief = useAppStore((s) => s.designBrief);
  const setDesignBrief = useAppStore((s) => s.setDesignBrief);
  const isAgentUsingBrief = useAppStore((s) => s.isAgentUsingBrief);
  const setIsAgentWorking = useAppStore((s) => s.setIsAgentWorking);
  const setIsAgentUsingBrief = useAppStore((s) => s.setIsAgentUsingBrief);
  const setAgentWorkingLabel = useAppStore((s) => s.setAgentWorkingLabel);

  const briefFields = useAppStore((s) => s.briefFields);
  const briefSuggestedParams = useAppStore((s) => s.briefSuggestedParams);
  const briefLoading = useAppStore((s) => s.briefLoading);
  const setBriefFields = useAppStore((s) => s.setBriefFields);
  const setBriefSuggestedParams = useAppStore((s) => s.setBriefSuggestedParams);
  const setBriefInterpretation = useAppStore((s) => s.setBriefInterpretation);
  const setBriefLoading = useAppStore((s) => s.setBriefLoading);
  const updateBriefFieldValue = useAppStore((s) => s.updateBriefFieldValue);
  const addBriefField = useAppStore((s) => s.addBriefField);
  const removeBriefField = useAppStore((s) => s.removeBriefField);

  // Local draft for the inline textarea
  const [localBrief, setLocalBrief] = useState(designBrief || "");
  const [isFocused, setIsFocused] = useState(false);
  const [fieldsExpanded, setFieldsExpanded] = useState(true);
  const [paramsSaved, setParamsSaved] = useState(false); // flash on save
  const [briefSaved, setBriefSaved] = useState(false);   // flash on brief save

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fieldSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track last brief that was interpreted to prevent re-interpretation loops
  const lastInterpretedRef = useRef<string | null>(null);
  // Auto-expand fields only on first arrival (not on every field change)
  const hasExpandedOnceRef = useRef(false);

  // Sync local brief when store changes (e.g. canvas load)
  useEffect(() => {
    setLocalBrief(designBrief || "");
  }, [designBrief]);

  // Auto-expand fields once when they first arrive
  useEffect(() => {
    if (!hasExpandedOnceRef.current && (briefFields.length > 0 || briefSuggestedParams.length > 0)) {
      hasExpandedOnceRef.current = true;
      setFieldsExpanded(true);
    }
  }, [briefFields.length, briefSuggestedParams.length]);

  const runInterpretation = useCallback(async (brief: string) => {
    if (!brief.trim()) return;
    setBriefLoading(true);
    setIsAgentWorking(true);
    setIsAgentUsingBrief(true);
    setAgentWorkingLabel("Interpreting brief…");
    try {
      const result = await apiClient.interpretBrief(brief.trim());
      setBriefInterpretation(result.interpretation);
      setBriefFields(result.extracted);
      setBriefSuggestedParams(result.unmentioned);
    } catch (e) {
      console.debug("[Brief] Interpretation failed:", e);
    } finally {
      setBriefLoading(false);
      setIsAgentWorking(false);
      setIsAgentUsingBrief(false);
      setAgentWorkingLabel("Analyzing…");
    }
  }, [setBriefLoading, setBriefInterpretation, setBriefFields, setBriefSuggestedParams,
      setIsAgentWorking, setIsAgentUsingBrief, setAgentWorkingLabel]);

  // Save brief on blur — fire-and-forget to avoid freezing the UI
  const commitBrief = useCallback((value: string) => {
    const trimmed = value.trim();
    // Update store immediately (no await)
    setDesignBrief(trimmed || null);
    apiClient.updateDesignBrief(trimmed || "").catch(() => {});
    // Only interpret if brief changed from last interpreted version
    if (trimmed && trimmed !== lastInterpretedRef.current) {
      lastInterpretedRef.current = trimmed;
      runInterpretation(trimmed);
    }
  }, [setDesignBrief, runInterpretation]);

  const handleManualSave = useCallback(() => {
    commitBrief(localBrief);
    textareaRef.current?.blur();
    setBriefSaved(true);
    setTimeout(() => setBriefSaved(false), 1600);
  }, [commitBrief, localBrief]);

  const handleFocus = () => setIsFocused(true);

  const handleBlur = () => {
    setIsFocused(false);
    commitBrief(localBrief);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      // Revert to stored brief and blur
      setLocalBrief(designBrief || "");
      textareaRef.current?.blur();
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      textareaRef.current?.blur(); // triggers handleBlur → commitBrief
    }
  };

  // Field value change — debounced background save
  const handleFieldChange = (key: string, value: string) => {
    updateBriefFieldValue(key, value);
    if (fieldSaveTimerRef.current) clearTimeout(fieldSaveTimerRef.current);
    fieldSaveTimerRef.current = setTimeout(() => {
      const current = useAppStore.getState().briefFields;
      apiClient.updateBriefFields(current).catch(() => {});
    }, 800);
  };

  // Explicit "Save" button for parameters — fires immediately, NO re-interpretation
  const handleSaveParams = () => {
    const current = useAppStore.getState().briefFields;
    apiClient.updateBriefFields(current).catch(() => {});
    setParamsSaved(true);
    setTimeout(() => setParamsSaved(false), 1500);
  };

  const handleAddChip = (param: BriefSuggestedParam) => {
    addBriefField(param);
  };

  const handleRemoveField = (key: string) => {
    removeBriefField(key);
    apiClient.updateBriefFields(
      useAppStore.getState().briefFields.filter((f) => f.key !== key)
    ).catch(() => {});
  };

  const hasFields = briefFields.length > 0;
  const hasSuggestions = briefSuggestedParams.length > 0;
  const hasStructured = hasFields || hasSuggestions || briefLoading;

  return (
    <div className={`design-brief-overlay ${isAgentUsingBrief ? "dbo-agent-active" : ""}`} data-tour="brief">

      {/* ── Inline editable brief ── */}
      <div className={`dbo-brief-container${isFocused ? " dbo-brief-focused" : ""}`}>
        <div className="dbo-label-row">
          <span className="dbo-label">AI Agent Context</span>
          {isAgentUsingBrief && (
            <span className="dbo-active-indicator" title="Gemini is using this context right now">
              <span className="dbo-active-dot" />
              <span className="dbo-active-text">Using now</span>
            </span>
          )}
        </div>

        <textarea
          ref={textareaRef}
          className="dbo-inline-textarea"
          value={localBrief}
          onChange={(e) => setLocalBrief(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="Add context for the AI agent…"
          rows={isFocused ? 3 : 2}
        />

        {(isFocused || localBrief !== (designBrief || '')) && (
          <div className="dbo-save-row">
            {isFocused && (
              <span className="dbo-edit-hint">Ctrl+↵ to save · Esc to cancel</span>
            )}
            <button
              className={`dbo-save-btn${briefSaved ? ' dbo-save-btn--saved' : ''}`}
              onClick={handleManualSave}
              title="Save AI agent context"
            >
              {briefSaved ? '✓ Saved' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {/* ── Structured fields section ── */}
      {hasStructured && (
        <div className="dbo-fields-section">
          <div className="dbo-fields-header">
            <button
              className="dbo-fields-toggle"
              onClick={() => setFieldsExpanded(!fieldsExpanded)}
              title={fieldsExpanded ? "Collapse parameters" : "Expand parameters"}
            >
              {fieldsExpanded ? "▼" : "▲"} Parameters
            </button>
            <div className="dbo-fields-header-actions">
              {hasFields && fieldsExpanded && (
                <button
                  className={`dbo-params-save ${paramsSaved ? "saved" : ""}`}
                  onClick={handleSaveParams}
                  title="Save parameter updates"
                >
                  {paramsSaved ? "✓ Saved" : "Save"}
                </button>
              )}
              <button
                className="dbo-regen-btn"
                onClick={() => designBrief && runInterpretation(designBrief)}
                disabled={briefLoading}
                title="Re-interpret design brief"
              >
                {briefLoading ? "…" : "↺"}
              </button>
            </div>
          </div>

          {fieldsExpanded && (
            <>
              {briefLoading && (
                <div className="dbo-loading">
                  <div className="dbo-skeleton" />
                  <div className="dbo-skeleton" />
                  <div className="dbo-skeleton" />
                </div>
              )}

              {!briefLoading && hasFields && (
                <div className="dbo-field-list">
                  {briefFields.map((field) => (
                    <div key={field.key} className="dbo-field-row">
                      <span className="dbo-field-label">{field.label}</span>
                      <input
                        className="dbo-field-input"
                        type="text"
                        value={field.value}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        placeholder={`Add ${field.label.toLowerCase()}…`}
                      />
                      <button
                        className="dbo-field-remove"
                        onClick={() => handleRemoveField(field.key)}
                        title="Remove field"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {!briefLoading && hasSuggestions && (
                <div className="dbo-suggestions">
                  <span className="dbo-suggestions-label">Add:</span>
                  <div className="dbo-chips">
                    {briefSuggestedParams.map((param) => (
                      <button
                        key={param.key}
                        className="dbo-chip"
                        onClick={() => handleAddChip(param)}
                        title={`e.g. ${param.hint}`}
                      >
                        + {param.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
