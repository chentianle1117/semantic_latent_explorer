/**
 * DeletedImagesPanel — undo stack for deleted images.
 * Shows a small button (↩ N) when deleted images exist.
 * Clicking expands a panel above the button listing all deleted images.
 * Each item has a "Restore" button that brings it back (with lineage intact).
 */

import React, { useState } from "react";
import { useAppStore } from "../../store/appStore";
import { apiClient } from "../../api/client";
import "./DeletedImagesPanel.css";

export const DeletedImagesPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const deletedStack = useAppStore((s) => s.deletedImageStack);
  const restoreImageLocally = useAppStore((s) => s.restoreImageLocally);

  const handleRestore = async (id: number) => {
    // Restore locally first for instant feedback
    restoreImageLocally(id);
    // Persist to backend
    apiClient.restoreImage(id).catch((err) =>
      console.error("Failed to restore image on backend:", err)
    );
  };

  if (deletedStack.length === 0) return null;

  return (
    <div className="deleted-panel-wrap">
      {isOpen && (
        <div className="deleted-panel">
          <div className="deleted-panel-header">
            <span>Deleted ({deletedStack.length})</span>
            <button
              className="deleted-panel-close"
              onClick={() => setIsOpen(false)}
              title="Close"
            >
              ×
            </button>
          </div>
          <div className="deleted-panel-list">
            {deletedStack.map((img) => (
              <div key={img.id} className="deleted-item">
                <div className="deleted-item-thumb">
                  <img
                    src={`data:image/png;base64,${img.base64_image}`}
                    alt={`#${img.id}`}
                  />
                  <div className="deleted-item-thumb-overlay" />
                </div>
                <div className="deleted-item-info">
                  <span className="deleted-item-id">#{img.id}</span>
                  <span className="deleted-item-prompt" title={img.prompt}>
                    {img.prompt
                      ? img.prompt.substring(0, 48) + (img.prompt.length > 48 ? "…" : "")
                      : img.generation_method}
                  </span>
                </div>
                <button
                  className="deleted-item-restore"
                  onClick={() => handleRestore(img.id)}
                  title="Restore to canvas"
                >
                  ↩
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <button
        className="deleted-panel-trigger"
        data-tour="deleted-panel-trigger"
        onClick={() => setIsOpen((v) => !v)}
        title={`${deletedStack.length} deleted image${deletedStack.length !== 1 ? "s" : ""} — click to restore`}
      >
        ↩ {deletedStack.length}
      </button>
    </div>
  );
};
