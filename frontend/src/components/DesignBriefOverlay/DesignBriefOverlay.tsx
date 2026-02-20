/**
 * Design Brief Overlay — always-visible translucent brief on the canvas.
 * Labeled "AI Agent Context" — Gemini uses this as guidance.
 * Click to edit inline. Saves to backend + Zustand store.
 * Glows when the AI agent is actively referencing it.
 */

import React, { useState, useEffect, useRef } from "react";
import { useAppStore } from "../../store/appStore";
import { apiClient } from "../../api/client";
import "./DesignBriefOverlay.css";

export const DesignBriefOverlay: React.FC = () => {
  const designBrief = useAppStore((s) => s.designBrief);
  const setDesignBrief = useAppStore((s) => s.setDesignBrief);
  const isAgentUsingBrief = useAppStore((s) => s.isAgentUsingBrief);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(designBrief || "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(designBrief || "");
  }, [designBrief]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    const trimmed = draft.trim();
    try {
      await apiClient.updateDesignBrief(trimmed || "");
      setDesignBrief(trimmed || null);
    } catch (e) {
      console.error("Failed to save design brief:", e);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraft(designBrief || "");
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") handleCancel();
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSave();
  };

  return (
    <div className={`design-brief-overlay ${isAgentUsingBrief ? "dbo-agent-active" : ""}`}>
      {isEditing ? (
        <div className="dbo-edit">
          <textarea
            ref={textareaRef}
            className="dbo-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your design context… (Ctrl+Enter to save)"
            rows={3}
          />
          <div className="dbo-actions">
            <button className="dbo-save" onClick={handleSave}>Save</button>
            <button className="dbo-cancel" onClick={handleCancel}>×</button>
          </div>
        </div>
      ) : (
        <div
          className={`dbo-read ${!designBrief ? "dbo-empty" : ""}`}
          onClick={() => setIsEditing(true)}
          title="Click to edit — Gemini AI uses this as context for all suggestions"
        >
          <div className="dbo-label-row">
            <span className="dbo-label">AI Agent Context</span>
            {isAgentUsingBrief && (
              <span className="dbo-active-indicator" title="Gemini is using this context right now">
                <span className="dbo-active-dot" />
                <span className="dbo-active-text">Using now</span>
              </span>
            )}
          </div>
          <span className="dbo-text">
            {designBrief || "Add context for the AI agent…"}
          </span>
        </div>
      )}
    </div>
  );
};
