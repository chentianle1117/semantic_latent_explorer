import React, { useState, useRef } from "react";
import { useAppStore } from "../../store/appStore";
import "./LayersPanel.css";

export const LayersPanel: React.FC = () => {
  const layers = useAppStore((s) => s.layers);
  const imageLayerMap = useAppStore((s) => s.imageLayerMap);
  const images = useAppStore((s) => s.images);
  const selectedImageIds = useAppStore((s) => s.selectedImageIds);
  const addLayer = useAppStore((s) => s.addLayer);
  const removeLayer = useAppStore((s) => s.removeLayer);
  const renameLayer = useAppStore((s) => s.renameLayer);
  const toggleLayerVisibility = useAppStore((s) => s.toggleLayerVisibility);
  const setImagesLayer = useAppStore((s) => s.setImagesLayer);
  const setSelectedImageIds = useAppStore((s) => s.setSelectedImageIds);

  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  const getLayerImageIds = (layerId: string): number[] => {
    const ids: number[] = [];
    images.filter((img) => img.visible).forEach((img) => {
      const lid = imageLayerMap[img.id] ?? "default";
      if (lid === layerId) ids.push(img.id);
    });
    return ids;
  };

  const handleAddLayer = () => {
    const name = `Layer ${layers.length + 1}`;
    addLayer(name);
  };

  const handleDoubleClick = (layer: { id: string; name: string }) => {
    setEditingLayerId(layer.id);
    setEditingName(layer.name);
    setTimeout(() => editInputRef.current?.select(), 0);
  };

  const commitRename = () => {
    if (editingLayerId && editingName.trim()) {
      renameLayer(editingLayerId, editingName.trim());
    }
    setEditingLayerId(null);
  };

  const handleDelete = (layer: { id: string; name: string }) => {
    const layerImageIds = getLayerImageIds(layer.id);
    if (layerImageIds.length > 0) {
      const confirmed = window.confirm(
        `"${layer.name}" has ${layerImageIds.length} image${layerImageIds.length > 1 ? "s" : ""}.\n\nDeleting this layer will move them to "${layers.find(l => l.id === "default")?.name ?? "Shoes"}".\n\nProceed?`
      );
      if (!confirmed) return;
    }
    removeLayer(layer.id);
  };

  const handleSelectAll = (layerId: string) => {
    const ids = getLayerImageIds(layerId);
    if (ids.length > 0) setSelectedImageIds(ids);
  };

  const handleAssignSelected = (layerId: string) => {
    if (selectedImageIds.length > 0) setImagesLayer(selectedImageIds, layerId);
  };

  return (
    <div className="layers-panel">
      <div className="lp-header">
        <span className="lp-title">LAYERS</span>
        <button className="lp-add-btn" onClick={handleAddLayer} title="Add new layer">＋</button>
      </div>

      <div className="lp-list">
        {layers.map((layer) => {
          const count = getLayerImageIds(layer.id).length;
          const isEditing = editingLayerId === layer.id;

          return (
            <div
              key={layer.id}
              className={`lp-row ${!layer.visible ? "lp-row--hidden" : ""}`}
            >
              {/* Color dot — click to toggle visibility */}
              <span
                className="lp-dot"
                style={{ background: layer.color }}
                onClick={() => toggleLayerVisibility(layer.id)}
                title={layer.visible ? "Hide layer" : "Show layer"}
              />

              {/* Name — click = toggle visibility, double-click = rename */}
              {isEditing ? (
                <input
                  ref={editInputRef}
                  className="lp-name-input"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setEditingLayerId(null);
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              ) : (
                <span
                  className="lp-name"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLayerVisibility(layer.id);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    handleDoubleClick(layer);
                  }}
                  title={layer.visible ? "Click to hide · Double-click to rename" : "Click to show · Double-click to rename"}
                >
                  {layer.name}
                </span>
              )}

              {/* Count badge */}
              <span className="lp-count">{count}</span>

              {/* Select-all button */}
              <button
                className="lp-icon-btn lp-select-btn"
                onClick={() => handleSelectAll(layer.id)}
                title={`Select all ${count} images in ${layer.name}`}
                disabled={count === 0}
              >
                ◈
              </button>

              {/* Delete (non-default layers only) */}
              {layer.id !== "default" && (
                <button
                  className="lp-icon-btn lp-trash-btn"
                  onClick={() => handleDelete(layer)}
                  title="Delete layer"
                >
                  ✕
                </button>
              )}

              {/* Assign selected — shown when selection exists */}
              {selectedImageIds.length > 0 && (
                <button
                  className="lp-icon-btn lp-assign-icon-btn"
                  onClick={() => handleAssignSelected(layer.id)}
                  title={`Move selected here`}
                >
                  ←
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
