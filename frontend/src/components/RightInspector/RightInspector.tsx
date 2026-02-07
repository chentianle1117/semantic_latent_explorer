import React, { useState, useEffect } from "react";
import { useAppStore } from "../../store/appStore";
import { GenealogyLens } from "../GenealogyLens/GenealogyLens";
import "./RightInspector.css";

interface RightInspectorProps {
  showLabels: boolean;
  showGrid: boolean;
  showClusters: boolean;
  backgroundColor: string;
  onToggleLabels: () => void;
  onToggleGrid: () => void;
  onToggleClusters: () => void;
  onBackgroundColorChange: (color: string) => void;
  onGenerateFromReference?: () => void;
  onRemoveSelected?: () => void;
}

export const RightInspector: React.FC<RightInspectorProps> = ({
  onGenerateFromReference,
  onRemoveSelected,
}) => {
  const isCollapsed = useAppStore((s) => s.isInspectorCollapsed);
  const setIsCollapsed = useAppStore((s) => s.setIsInspectorCollapsed);
  const selectedImageIds = useAppStore((s) => s.selectedImageIds);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const setFlyToImageId = useAppStore((s) => s.setFlyToImageId);
  const images = useAppStore((s) => s.images);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    selection: true,
    actions: true,
    genealogy: true,
  });
  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // For multi-select: track which tile is focused for genealogy
  const [focusedId, setFocusedId] = useState<number | null>(null);

  // Auto-expand inspector when selection is made (so selection preview is always visible)
  useEffect(() => {
    if (selectedImageIds.length > 0 && isCollapsed) {
      setIsCollapsed(false);
    }
  }, [selectedImageIds.length, isCollapsed, setIsCollapsed]);

  // Auto-focus first selected when selection changes
  useEffect(() => {
    if (selectedImageIds.length > 0) {
      if (!focusedId || !selectedImageIds.includes(focusedId)) {
        setFocusedId(selectedImageIds[0]);
      }
    } else {
      setFocusedId(null);
    }
  }, [selectedImageIds, focusedId]);

  const selectedImages = images.filter((img) => selectedImageIds.includes(img.id));
  const selectedImage = selectedImageIds.length === 1
    ? images.find((img) => img.id === selectedImageIds[0])
    : null;

  if (isCollapsed) {
    return (
      <div className="right-inspector collapsed">
        <button
          className="inspector-expand-tab"
          onClick={() => setIsCollapsed(false)}
          title="Open Inspector (click to expand)"
        >
          &#9664;
        </button>
      </div>
    );
  }

  return (
    <div className="right-inspector">
      <div className="inspector-header">
        <span className="inspector-title">Inspector</span>
        <button
          className="inspector-collapse-btn"
          onClick={() => setIsCollapsed(true)}
          title="Collapse"
        >
          &#9654;
        </button>
      </div>

      {selectedImageIds.length === 0 && (
        <div className="section-placeholder">
          Click a shoe on the canvas to inspect it
        </div>
      )}

      {/* Single selection detail */}
      {selectedImage && (
        <>
          <div className="inspector-section">
            <div className="section-header" onClick={() => toggleSection("selection")}>
              <span>Selection</span>
              <span className={`section-chevron ${openSections.selection ? "open" : ""}`}>&#9660;</span>
            </div>
            {openSections.selection && (
              <div className="section-content">
                <div className="selection-detail">
                  <div className="selection-thumb">
                    <img
                      src={`data:image/png;base64,${selectedImage.base64_image}`}
                      alt={selectedImage.prompt || "Selected"}
                    />
                  </div>
                  {selectedImage.prompt && (
                    <p className="selection-prompt">{selectedImage.prompt}</p>
                  )}
                  <div className="selection-meta">
                    <span>#{selectedImage.id}</span>
                    <span>{selectedImage.generation_method}</span>
                  </div>
                  {selectedImage.parents.length > 0 && (
                    <div className="selection-lineage">
                      <span className="lineage-label">Parents:</span>
                      <span className="lineage-ids">
                        {selectedImage.parents.map((p) => `#${p}`).join(", ")}
                      </span>
                    </div>
                  )}
                  {selectedImage.children.length > 0 && (
                    <div className="selection-lineage">
                      <span className="lineage-label">Children:</span>
                      <span className="lineage-ids">
                        {selectedImage.children.map((c) => `#${c}`).join(", ")}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Genealogy section */}
          <div className="inspector-section">
            <div className="section-header" onClick={() => toggleSection("genealogy")}>
              <span>Genealogy</span>
              <span className={`section-chevron ${openSections.genealogy ? "open" : ""}`}>&#9660;</span>
            </div>
            {openSections.genealogy && (
              <div className="section-content">
                <GenealogyLens selectedImageIds={[selectedImage.id]} />
              </div>
            )}
          </div>

          {/* Actions section - at bottom, always visible */}
          <div className="inspector-section inspector-section-actions">
            <div className="section-header" onClick={() => toggleSection("actions")}>
              <span>Actions</span>
              <span className={`section-chevron ${openSections.actions ? "open" : ""}`}>&#9660;</span>
            </div>
            {openSections.actions && (
              <div className="section-content">
                <div className="inspector-actions">
                  {onGenerateFromReference && (
                    <button className="inspector-action-btn primary" onClick={onGenerateFromReference}>
                      Generate with prompt...
                    </button>
                  )}
                  {onRemoveSelected && (
                    <button className="inspector-action-btn danger" onClick={onRemoveSelected}>
                      Remove from space
                    </button>
                  )}
                  <button className="inspector-action-btn" onClick={clearSelection}>
                    Clear selection
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Multi-select view */}
      {selectedImageIds.length > 1 && (
        <>
          <div className="inspector-section">
            <div className="section-header" onClick={() => toggleSection("selection")}>
              <span>Selection ({selectedImageIds.length})</span>
              <span className={`section-chevron ${openSections.selection ? "open" : ""}`}>&#9660;</span>
            </div>
            {openSections.selection && (
              <div className="section-content">
                {/* Tile grid */}
                <div className="selection-grid">
                  {selectedImages.map((img) => (
                    <div
                      key={img.id}
                      className={`selection-tile ${focusedId === img.id ? "focused" : ""}`}
                      onClick={() => {
                        setFocusedId(img.id);
                        setFlyToImageId(img.id);
                      }}
                    >
                      <img
                        src={`data:image/png;base64,${img.base64_image}`}
                        alt={img.prompt || `#${img.id}`}
                      />
                      <span className="tile-id">#{img.id}</span>
                    </div>
                  ))}
                </div>

                {/* Summary metadata */}
                <div className="selection-summary">
                  <div className="summary-row">
                    <span className="summary-label">Methods:</span>
                    <span className="summary-value">
                      {[...new Set(selectedImages.map((img) => img.generation_method))].join(", ")}
                    </span>
                  </div>
                  <div className="summary-row">
                    <span className="summary-label">Parents:</span>
                    <span className="summary-value">
                      {[...new Set(selectedImages.flatMap((img) => img.parents))].length} unique
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Genealogy section */}
          <div className="inspector-section">
            <div className="section-header" onClick={() => toggleSection("genealogy")}>
              <span>Genealogy</span>
              <span className={`section-chevron ${openSections.genealogy ? "open" : ""}`}>&#9660;</span>
            </div>
            {openSections.genealogy && (
              <div className="section-content">
                <GenealogyLens selectedImageIds={selectedImageIds} />
              </div>
            )}
          </div>

          {/* Actions section - at bottom, always visible */}
          <div className="inspector-section inspector-section-actions">
            <div className="section-header" onClick={() => toggleSection("actions")}>
              <span>Actions</span>
              <span className={`section-chevron ${openSections.actions ? "open" : ""}`}>&#9660;</span>
            </div>
            {openSections.actions && (
              <div className="section-content">
                <div className="inspector-actions">
                  {onGenerateFromReference && (
                    <button className="inspector-action-btn primary" onClick={onGenerateFromReference}>
                      Generate from {selectedImageIds.length} references...
                    </button>
                  )}
                  {onRemoveSelected && (
                    <button className="inspector-action-btn danger" onClick={onRemoveSelected}>
                      Remove selected
                    </button>
                  )}
                  <button className="inspector-action-btn" onClick={clearSelection}>
                    Clear selection
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
