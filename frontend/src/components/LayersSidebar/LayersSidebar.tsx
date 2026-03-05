/**
 * LayersSidebar — right-column panel below the inspector.
 * Collapses/expands independently from BottomDrawer.
 * Collapsed: horizontal row of named layer dots (click to toggle visibility).
 * Expanded: shows full LayersPanel.
 */
import React from "react";
import { useAppStore } from "../../store/appStore";
import { LayersPanel } from "../LayersPanel/LayersPanel";
import "./LayersSidebar.css";

export const LayersSidebar: React.FC = () => {
  const isExpanded = useAppStore((s) => s.isLayersExpanded);
  const setIsExpanded = useAppStore((s) => s.setIsLayersExpanded);
  const allLayers = useAppStore((s) => s.layers);
  const studyMode = useAppStore((s) => s.studyMode);
  const toggleLayerVisibility = useAppStore((s) => s.toggleLayerVisibility);
  // Hide mood board layer when studyMode (no multi-view) is active
  const layers = studyMode ? allLayers.filter((l) => l.id !== "mood-boards") : allLayers;

  return (
    <div className={`layers-sidebar ${isExpanded ? "expanded" : ""}`} data-tour="layers">
      {/* Clickable bar — always visible, click anywhere to toggle */}
      <div
        className="layers-sidebar-bar"
        data-tour="layers-bar"
        onClick={() => setIsExpanded(!isExpanded)}
        title={isExpanded ? "Collapse layers" : "Expand layers"}
      >
        <span className="layers-sidebar-bar-label">Layers</span>
        <button
          className="layers-sidebar-toggle"
          onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
          title={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded ? "▼" : "▲"}
        </button>
      </div>

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
              onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer.id); }}
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
