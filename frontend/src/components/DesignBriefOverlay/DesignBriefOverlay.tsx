/**
 * Design Brief Overlay — always-visible translucent brief on the canvas.
 * Click to edit inline. Saves to backend + Zustand store.
 */

import React, { useState, useEffect, useRef } from "react";
import { useAppStore } from "../../store/appStore";
import { apiClient } from "../../api/client";
import "./DesignBriefOverlay.css";

export const DesignBriefOverlay: React.FC = () => {
  const designBrief = useAppStore((s) => s.designBrief);
  const setDesignBrief = useAppStore((s) => s.setDesignBrief);

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
    <div className="design-brief-overlay">
      {isEditing ? (
        <div className="dbo-edit">
          <textarea
            ref={textareaRef}
            className="dbo-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your design brief… (Ctrl+Enter to save)"
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
          title="Click to edit design brief"
        >
          <span className="dbo-label">Brief</span>
          <span className="dbo-text">
            {designBrief || "Add a design brief…"}
          </span>
        </div>
      )}
    </div>
  );
};
