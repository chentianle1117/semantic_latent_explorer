import React, { useEffect, useState } from "react";
import { SemanticCanvas } from "./components/Canvas/SemanticCanvas";
import { ContextMenu } from "./components/ContextMenu/ContextMenu";
import { PromptDialog } from "./components/PromptDialog/PromptDialog";
import { FloatingActionPanel } from "./components/FloatingActionPanel/FloatingActionPanel";
import { useAppStore } from "./store/appStore";
import { apiClient } from "./api/client";
import "./styles/app.css";

export const App: React.FC = () => {
  const [contextMenuPos, setContextMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [floatingPanelPos, setFloatingPanelPos] = useState<{
    x: number;
    y: number;
    count: number;
  } | null>(null);
  const [promptDialogImageId, setPromptDialogImageId] = useState<number | null>(
    null
  );

  const images = useAppStore((state) =>
    state.images.filter((img) => img.visible)
  );
  const selectedImageIds = useAppStore((state) => state.selectedImageIds);
  const isInitialized = useAppStore((state) => state.isInitialized);
  const isGenerating = useAppStore((state) => state.isGenerating);

  const setImages = useAppStore((state) => state.setImages);
  const setHistoryGroups = useAppStore((state) => state.setHistoryGroups);
  const setIsInitialized = useAppStore((state) => state.setIsInitialized);
  const setIsGenerating = useAppStore((state) => state.setIsGenerating);
  const clearSelection = useAppStore((state) => state.clearSelection);

  useEffect(() => {
    // Connect WebSocket for real-time updates
    apiClient.connectWebSocket((message) => {
      if (message.type === "state_update" && message.data) {
        setImages(message.data.images);
        setHistoryGroups(message.data.history_groups);
      }
    });

    // Initialize backend models
    apiClient
      .initialize()
      .then(() => {
        setIsInitialized(true);
        return apiClient.getState();
      })
      .then((state) => {
        setImages(state.images);
        setHistoryGroups(state.history_groups);
      })
      .catch((error) => {
        console.error("Failed to initialize:", error);
        alert(
          "Failed to connect to backend. Make sure backend is running on port 8000."
        );
      });

    return () => {
      apiClient.disconnectWebSocket(() => {});
    };
  }, [setImages, setHistoryGroups, setIsInitialized]);

  const handleGenerate = async () => {
    const prompt = window.prompt("Enter prompt for image generation:");
    if (!prompt) return;

    const count = window.prompt("How many images? (1-20)", "8");
    const nImages = parseInt(count || "8", 10);

    if (isNaN(nImages) || nImages < 1 || nImages > 20) {
      alert("Invalid count. Please enter a number between 1 and 20.");
      return;
    }

    setIsGenerating(true);
    try {
      await apiClient.generate({ prompt, n_images: nImages });
    } catch (error) {
      console.error("Generation failed:", error);
      alert("Generation failed. Check console for details.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClearCanvas = async () => {
    if (!window.confirm("Clear ALL images from canvas? This cannot be undone.")) return;

    try {
      await apiClient.clearCanvas();
      // Force refresh state after clear
      const state = await apiClient.getState();
      setImages(state.images);
      setHistoryGroups(state.history_groups);
      clearSelection();
      setFloatingPanelPos(null);
    } catch (error) {
      console.error("Clear failed:", error);
      alert("Failed to clear canvas. Check console for details.");
    }
  };

  const handleInterpolate = async (idA?: number, idB?: number) => {
    const id_a = idA ?? selectedImageIds[0];
    const id_b = idB ?? selectedImageIds[1];

    if (!id_a || !id_b) {
      alert("Please select exactly 2 images to interpolate.");
      return;
    }

    console.log(`Interpolating between images ${id_a} and ${id_b}...`);
    setIsGenerating(true);
    setFloatingPanelPos(null); // Close panel immediately
    try {
      const result = await apiClient.interpolate({ id_a, id_b, alpha: 0.5 });
      console.log("Interpolation successful:", result);
      clearSelection();
    } catch (error) {
      console.error("Interpolation failed:", error);
      alert(`Interpolation failed: ${error}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const promptDialogImage = images.find(
    (img) => img.id === promptDialogImageId
  );

  const handleGenerateFromReferenceClick = (imageId: number) => {
    setPromptDialogImageId(imageId);
    setContextMenuPos(null); // Close context menu
  };

  const handlePromptDialogGenerate = async (
    referenceId: number,
    prompt: string
  ) => {
    console.log(`Generating from reference ${referenceId} with prompt: "${prompt}"`);
    setPromptDialogImageId(null);
    setIsGenerating(true);
    setFloatingPanelPos(null); // Close panel
    try {
      const result = await apiClient.generateFromReference({
        reference_id: referenceId,
        prompt,
      });
      console.log("Generation from reference successful:", result);
      clearSelection();
    } catch (error) {
      console.error("Reference generation failed:", error);
      alert(`Generation failed: ${error}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Click outside to close context menu and floating panel
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      if (contextMenuPos && !target.closest(".context-menu")) {
        setContextMenuPos(null);
      }

      if (floatingPanelPos && !target.closest(".floating-action-panel") && !target.closest(".image-node")) {
        setFloatingPanelPos(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [contextMenuPos, floatingPanelPos]);

  // Close menus on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setContextMenuPos(null);
        setPromptDialogImageId(null);
        setFloatingPanelPos(null);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  // Update floating panel position when selection changes
  useEffect(() => {
    if (selectedImageIds.length === 0) {
      setFloatingPanelPos(null);
    }
  }, [selectedImageIds]);

  return (
    <div className="app-container">
      {/* Canvas Container */}
      <div className="canvas-container">
        <div className="canvas-header">
          <h1>👟 Semantic Latent Space</h1>
        </div>

        <div className="canvas-stats">
          <strong>{images.length}</strong> images •{" "}
          <strong>CLIP ViT-B/32</strong> •{" "}
          {isInitialized ? "✅ Ready" : "⏳ Initializing..."}
        </div>

        <SemanticCanvas
          onContextMenu={(x, y) => setContextMenuPos({ x, y })}
          onSelectionChange={(x, y, count) => {
            if (count > 0) {
              setFloatingPanelPos({ x, y, count });
            } else {
              setFloatingPanelPos(null);
            }
          }}
        />

        {/* Floating Action Panel (primary interaction) */}
        {floatingPanelPos && floatingPanelPos.count > 0 && (
          <FloatingActionPanel
            x={floatingPanelPos.x}
            y={floatingPanelPos.y}
            selectedCount={floatingPanelPos.count}
            onGenerateFromReference={() => {
              // Use first selected image as reference
              handleGenerateFromReferenceClick(selectedImageIds[0]);
              setFloatingPanelPos(null);
            }}
            onInterpolate={
              floatingPanelPos.count === 2
                ? () => {
                    handleInterpolate();
                    setFloatingPanelPos(null);
                  }
                : undefined
            }
            onViewDetails={() => {
              // Show details of selected images
              const selectedImages = images.filter((img) =>
                selectedImageIds.includes(img.id)
              );
              const details = selectedImages
                .map(
                  (img) =>
                    `ID: ${img.id}\nMethod: ${img.generation_method}\nPrompt: ${img.prompt}`
                )
                .join("\n\n---\n\n");
              alert(`Selected Images:\n\n${details}`);
            }}
            onRemove={() => {
              selectedImageIds.forEach((id) => {
                useAppStore.getState().removeImage(id);
              });
              clearSelection();
              setFloatingPanelPos(null);
            }}
            onClearSelection={() => {
              clearSelection();
              setFloatingPanelPos(null);
            }}
          />
        )}

        {/* Context Menu (legacy, right-click) */}
        {contextMenuPos && selectedImageIds.length > 0 && (
          <ContextMenu
            x={contextMenuPos.x}
            y={contextMenuPos.y}
            onClose={() => setContextMenuPos(null)}
            onGenerateFromReference={handleGenerateFromReferenceClick}
            onInterpolate={handleInterpolate}
          />
        )}

        {/* Prompt Dialog */}
        {promptDialogImage && (
          <PromptDialog
            referenceImage={promptDialogImage}
            onClose={() => setPromptDialogImageId(null)}
            onGenerate={handlePromptDialogGenerate}
          />
        )}

        {/* Minimal Visual Settings */}
        <div className="visual-settings">
          <div className="settings-header">Visual Settings</div>
          <div className="setting-item">
            <div className="setting-label">
              <span>
                Image Size: {useAppStore.getState().visualSettings.imageSize}px
              </span>
            </div>
            <input
              type="range"
              min="30"
              max="200"
              value={useAppStore.getState().visualSettings.imageSize}
              onChange={(e) => {
                useAppStore.getState().updateVisualSettings({
                  imageSize: parseInt(e.target.value, 10),
                });
              }}
              style={{ width: "100%" }}
            />
          </div>

          <div className="setting-item">
            <div className="setting-label">
              <span>
                Opacity:{" "}
                {useAppStore.getState().visualSettings.imageOpacity.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min="0.3"
              max="1"
              step="0.1"
              value={useAppStore.getState().visualSettings.imageOpacity}
              onChange={(e) => {
                useAppStore.getState().updateVisualSettings({
                  imageOpacity: parseFloat(e.target.value),
                });
              }}
              style={{ width: "100%" }}
            />
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="control-panel">
        {/* Quick Actions */}
        <div className="quick-actions">
          <h3>Quick Actions</h3>

          <div className="action-row">
            <button
              className="action-button"
              onClick={handleGenerate}
              disabled={!isInitialized || isGenerating}
              style={{ flex: 1 }}
            >
              {isGenerating ? "⏳ Generating..." : "🎨 Generate Images"}
            </button>
            <button
              className="action-button secondary"
              onClick={handleClearCanvas}
              disabled={images.length === 0}
              style={{ flex: 0, whiteSpace: "nowrap" }}
              title="Clear all images from canvas"
            >
              🗑️ Clear All
            </button>
          </div>

          {selectedImageIds.length > 0 && (
            <div
              style={{
                marginTop: "8px",
                padding: "8px 12px",
                background: "rgba(88, 166, 255, 0.1)",
                borderRadius: "6px",
                fontSize: "13px",
                color: "#58a6ff",
              }}
            >
              {selectedImageIds.length} image
              {selectedImageIds.length !== 1 ? "s" : ""} selected • Use floating
              panel to interact
            </div>
          )}

          {!isInitialized && (
            <div
              style={{ marginTop: "12px", fontSize: "12px", color: "#8b949e" }}
            >
              Initializing models... This may take a minute.
            </div>
          )}
        </div>

        {/* History Timeline with Bidirectional Hover */}
        <div className="history-timeline">
          <h3>Generation History</h3>
          <div className="timeline-container">
            {useAppStore.getState().historyGroups.map((group) => {
              const hoveredGroupId = useAppStore.getState().hoveredGroupId;
              const setHoveredGroupId =
                useAppStore.getState().setHoveredGroupId;
              const thumbnailImage =
                group.thumbnail_id !== null
                  ? images.find((img) => img.id === group.thumbnail_id)
                  : null;

              return (
                <div
                  key={group.id}
                  className={`timeline-group ${
                    hoveredGroupId === group.id ? "highlighting" : ""
                  }`}
                  onClick={() => {
                    // Select all images in group
                    useAppStore.getState().setSelectedImageIds(group.image_ids);
                  }}
                  onMouseEnter={() => setHoveredGroupId(group.id)}
                  onMouseLeave={() => setHoveredGroupId(null)}
                >
                  <div className="group-header">
                    <span className="group-title">{group.type}</span>
                    <span className="group-badge">
                      {group.image_ids.length}
                    </span>
                  </div>
                  <div className="group-content">
                    {group.prompt.substring(0, 50)}...
                  </div>
                  {thumbnailImage ? (
                    <img
                      src={`data:image/png;base64,${thumbnailImage.base64_image}`}
                      alt={group.type}
                      className="group-thumbnail"
                    />
                  ) : (
                    <div
                      className="group-thumbnail"
                      style={{
                        background:
                          group.type === "batch"
                            ? "linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%)"
                            : group.type === "reference"
                            ? "linear-gradient(135deg, #bc8cff 0%, #d29922 100%)"
                            : group.type === "interpolation"
                            ? "linear-gradient(135deg, #3fb950 0%, #58a6ff 100%)"
                            : "linear-gradient(135deg, #d29922 0%, #f85149 100%)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "11px",
                        fontWeight: "600",
                        color: "white",
                      }}
                    >
                      {group.type.toUpperCase()}
                    </div>
                  )}
                </div>
              );
            })}

            {useAppStore.getState().historyGroups.length === 0 && (
              <div
                style={{ padding: "20px", color: "#8b949e", fontSize: "13px" }}
              >
                No history yet. Generate some images to get started!
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
