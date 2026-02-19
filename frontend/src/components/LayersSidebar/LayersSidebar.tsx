/**
 * LayersSidebar — right-column panel in grid-row 3 (bottom row), flush with the inspector.
 * Collapses/expands in sync with the BottomDrawer.
 * Collapsed: shows clickable color dots to toggle visibility.
 * Expanded: shows full LayersPanel.
 */
import React from "react";
import { useAppStore } from "../../store/appStore";
import { LayersPanel } from "../LayersPanel/LayersPanel";
import "./LayersSidebar.css";

export const LayersSidebar: React.FC = () => {
  const isExpanded = useAppStore((s) => s.isDrawerExpanded);
  const layers = useAppStore((s) => s.layers);
  const toggleLayerVisibility = useAppStore((s) => s.toggleLayerVisibility);

  return (
    <div className={`layers-sidebar ${isExpanded ? "expanded" : ""}`}>
      {isExpanded ? (
        <div className="layers-sidebar-body">
          <LayersPanel />
        </div>
      ) : (
        <div className="layers-sidebar-collapsed">
          {layers.map((layer) => (
            <button
              key={layer.id}
              className={`ls-dot-btn ${!layer.visible ? "ls-dot-hidden" : ""}`}
              style={{ "--dot-color": layer.color } as React.CSSProperties}
              onClick={() => toggleLayerVisibility(layer.id)}
              title={`${layer.name} — click to ${layer.visible ? "hide" : "show"}`}
            >
              <span className="ls-dot" />
              <span className="ls-dot-label">{layer.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
