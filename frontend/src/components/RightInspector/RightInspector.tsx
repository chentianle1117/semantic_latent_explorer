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
}

export const RightInspector: React.FC<RightInspectorProps> = () => {
  const isCollapsed = useAppStore((s) => s.isInspectorCollapsed);
  const setIsCollapsed = useAppStore((s) => s.setIsInspectorCollapsed);
  const selectedImageIds = useAppStore((s) => s.selectedImageIds);
  const setSelectedImageIds = useAppStore((s) => s.setSelectedImageIds);
  const setFlyToImageId = useAppStore((s) => s.setFlyToImageId);
  const images = useAppStore((s) => s.images);

  // Accordion open state per section (visual removed - now in dial popup)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    selection: true,
  });
  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const selectedImage =
    selectedImageIds.length === 1
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

      {/* Selection section - only when image(s) selected */}
      {selectedImageIds.length > 0 && (
        <div className="inspector-section">
          <div
            className="section-header"
            onClick={() => toggleSection("selection")}
          >
            <span>
              Selection ({selectedImageIds.length})
            </span>
            <span className={`section-chevron ${openSections.selection ? "open" : ""}`}>
              &#9660;
            </span>
          </div>
          {openSections.selection && (
            <div className="section-content">
              {selectedImageIds.length > 1 ? (
                <div className="selection-multi-detail">
                  <div className="selection-genealogy selection-genealogy-enlarged">
                    <GenealogyLens selectedImageIds={selectedImageIds} />
                  </div>
                </div>
              ) : selectedImage ? (
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
                    <span>ID: {selectedImage.id}</span>
                    <span>
                      Pos: ({selectedImage.coordinates[0].toFixed(2)},{" "}
                      {selectedImage.coordinates[1].toFixed(2)})
                    </span>
                  </div>
                  {selectedImage.parents && selectedImage.parents.length > 0 && (
                    <div className="selection-lineage">
                      <span className="lineage-label">Parents:</span>
                      <span className="lineage-ids">
                        {selectedImage.parents.map((p) => `#${p}`).join(", ")}
                      </span>
                    </div>
                  )}
                  {selectedImage.children && selectedImage.children.length > 0 && (
                    <div className="selection-lineage">
                      <span className="lineage-label">Children:</span>
                      <span className="lineage-ids">
                        {selectedImage.children.map((c) => `#${c}`).join(", ")}
                      </span>
                    </div>
                  )}
                  <GenealogyLens selectedImageIds={[selectedImage.id]} />
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Visual Settings moved to dial popup */}
    </div>
  );
};
