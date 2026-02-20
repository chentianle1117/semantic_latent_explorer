import React, { useState, useRef } from "react";
import { useAppStore } from "../../store/appStore";
import { ConfirmDialog } from "../ConfirmDialog/ConfirmDialog";
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
  const reorderLayers = useAppStore((s) => s.reorderLayers);

  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [layerConfirm, setLayerConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Drag-to-reorder state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dragLayerRef = useRef<HTMLDivElement | null>(null);
  const dragGhostRef = useRef<HTMLDivElement | null>(null);

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
      const defaultName = layers.find(l => l.id === "default")?.name ?? "Shoes";
      setLayerConfirm({
        message: `"${layer.name}" has ${layerImageIds.length} image${layerImageIds.length > 1 ? "s" : ""}.\n\nDeleting this layer will move them to "${defaultName}". Proceed?`,
        onConfirm: () => removeLayer(layer.id),
      });
    } else {
      removeLayer(layer.id);
    }
  };

  const handleSelectAll = (layerId: string) => {
    const ids = getLayerImageIds(layerId);
    if (ids.length > 0) setSelectedImageIds(ids);
  };

  const handleAssignSelected = (layerId: string) => {
    if (selectedImageIds.length > 0) setImagesLayer(selectedImageIds, layerId);
  };

  // ── Drag-to-reorder handlers (left mouse button) ────────────────
  const handleDragHandleMouseDown = (e: React.MouseEvent, index: number) => {
    if (e.button !== 0) return; // left button only
    e.preventDefault();
    e.stopPropagation();

    setDragIndex(index);
    setDropIndex(index);

    const ghost = document.createElement("div");
    ghost.className = "lp-drag-ghost";
    ghost.textContent = layers[index].name;
    ghost.style.cssText = `
      position: fixed; pointer-events: none; z-index: 9999;
      background: rgba(88,166,255,0.18); border: 1px solid rgba(88,166,255,0.55);
      border-radius: 6px; padding: 6px 14px; font-size: 13px;
      color: rgba(200,215,230,0.95); white-space: nowrap;
      box-shadow: 0 4px 14px rgba(0,0,0,0.5);
      transform: translate(-50%, -50%);
      left: ${e.clientX}px; top: ${e.clientY}px;
    `;
    document.body.appendChild(ghost);
    dragGhostRef.current = ghost;

    const onMouseMove = (ev: MouseEvent) => {
      if (dragGhostRef.current) {
        dragGhostRef.current.style.left = `${ev.clientX}px`;
        dragGhostRef.current.style.top = `${ev.clientY}px`;
      }
      if (dragLayerRef.current) {
        const listEl = dragLayerRef.current.closest(".lp-list") as HTMLElement;
        if (!listEl) return;
        const rows = Array.from(listEl.querySelectorAll<HTMLElement>(".lp-row"));
        let newDrop = index;
        for (let i = 0; i < rows.length; i++) {
          const rect = rows[i].getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          if (ev.clientY < midY) { newDrop = i; break; }
          newDrop = i + 1;
        }
        setDropIndex(Math.min(newDrop, layers.length - 1));
      }
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      if (dragGhostRef.current) {
        document.body.removeChild(dragGhostRef.current);
        dragGhostRef.current = null;
      }
      setDragIndex((from) => {
        setDropIndex((to) => {
          if (from !== null && to !== null && from !== to) {
            reorderLayers(from, to);
          }
          return null;
        });
        return null;
      });
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div className="layers-panel">
      <div className="lp-header">
        <span className="lp-title">LAYERS</span>
        <button className="lp-add-btn" onClick={handleAddLayer} title="Add new layer">＋</button>
      </div>

      <div className="lp-list">
        {layers.map((layer, index) => {
          const count = getLayerImageIds(layer.id).length;
          const isEditing = editingLayerId === layer.id;
          const isDragging = dragIndex === index;
          const isDropTarget = dropIndex === index && dragIndex !== null && dragIndex !== index;

          return (
            <div
              key={layer.id}
              ref={isDragging ? (el) => { dragLayerRef.current = el; } : undefined}
              className={`lp-row ${!layer.visible ? "lp-row--hidden" : ""} ${isDragging ? "lp-row--dragging" : ""} ${isDropTarget ? "lp-row--drop-target" : ""}`}
            >
              {/* Drag handle */}
              <span
                className="lp-drag-handle"
                onMouseDown={(e) => handleDragHandleMouseDown(e, index)}
                title="Drag to reorder"
              >
                ⠿
              </span>

              {/* Color dot — click to toggle visibility */}
              <span
                className="lp-dot"
                style={{ background: layer.color, boxShadow: `0 0 8px ${layer.color}88` }}
                onClick={() => toggleLayerVisibility(layer.id)}
                title={layer.visible ? "Hide layer" : "Show layer"}
              />

              {/* Name + count — click = toggle visibility, double-click = rename */}
              <div className="lp-name-group">
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
                <span className="lp-count">{count}</span>
              </div>

              {/* Right-side actions */}
              <div className="lp-actions">
                {/* Assign selected — shown when selection exists */}
                {selectedImageIds.length > 0 && (
                  <button
                    className="lp-assign-btn"
                    onClick={() => handleAssignSelected(layer.id)}
                    title={`Move ${selectedImageIds.length} selected here`}
                  >
                    ← Move here
                  </button>
                )}

                {/* Select all */}
                <button
                  className="lp-select-all-btn"
                  onClick={() => handleSelectAll(layer.id)}
                  title={`Select all ${count} images in ${layer.name}`}
                  disabled={count === 0}
                >
                  Select all
                </button>

                {/* Delete — locked for built-in layers (default = Shoes, references = References) */}
                {layer.id !== "default" && layer.id !== "references" && (
                  <button
                    className="lp-icon-btn lp-trash-btn"
                    onClick={() => handleDelete(layer)}
                    title="Delete layer"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        isOpen={layerConfirm !== null}
        message={layerConfirm?.message ?? ""}
        confirmLabel="Delete Layer"
        danger
        onConfirm={() => { layerConfirm?.onConfirm(); setLayerConfirm(null); }}
        onCancel={() => setLayerConfirm(null)}
      />
    </div>
  );
};
