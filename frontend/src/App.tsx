import React, { useEffect, useState } from "react";
import { SemanticCanvas } from "./components/Canvas/SemanticCanvas";
import { PromptDialog } from "./components/PromptDialog/PromptDialog";
import { InterpolationDialog } from "./components/InterpolationDialog/InterpolationDialog";
import { FloatingActionPanel } from "./components/FloatingActionPanel/FloatingActionPanel";
import { ProgressBar } from "./components/ProgressBar/ProgressBar";
import { useAppStore } from "./store/appStore";
import { apiClient } from "./api/client";
import type { ImageData } from "./types";
import "./styles/app.css";

export const App: React.FC = () => {
  const [floatingPanelPos, setFloatingPanelPos] = useState<{
    x: number;
    y: number;
    count: number;
  } | null>(null);
  const [promptDialogImageId, setPromptDialogImageId] = useState<number | null>(
    null
  );
  const [interpolationImageIds, setInterpolationImageIds] = useState<[number, number] | null>(
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
  const setGenerationProgress = useAppStore((state) => state.setGenerationProgress);
  const setGenerationCount = useAppStore((state) => state.setGenerationCount);
  const clearSelection = useAppStore((state) => state.clearSelection);

  useEffect(() => {
    // Connect WebSocket for real-time updates
    apiClient.connectWebSocket((message) => {
      if (message.type === "state_update" && message.data) {
        setImages(message.data.images);
        setHistoryGroups(message.data.history_groups);
      } else if (message.type === "progress" && message.progress !== undefined) {
        setGenerationProgress(message.progress);
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
  }, [setImages, setHistoryGroups, setIsInitialized, setGenerationProgress]);

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
    setGenerationCount(0, nImages);
    setGenerationProgress(0);

    // Estimate 5 seconds per image, update progress smoothly
    const estimatedTimeMs = nImages * 5000;
    const updateIntervalMs = 100; // Update every 100ms for smooth animation
    const totalUpdates = estimatedTimeMs / updateIntervalMs;
    let updates = 0;

    const progressInterval = setInterval(() => {
      updates++;
      const progress = Math.min((updates / totalUpdates) * 90, 90); // Cap at 90%
      const currentImageEstimate = Math.floor((progress / 90) * nImages);
      setGenerationCount(currentImageEstimate, nImages);
      setGenerationProgress(progress);
    }, updateIntervalMs);

    try {
      await apiClient.generate({ prompt, n_images: nImages });
      clearInterval(progressInterval);
      setGenerationCount(nImages, nImages);
      setGenerationProgress(100);
    } catch (error) {
      clearInterval(progressInterval);
      console.error("Generation failed:", error);
      alert("Generation failed. Check console for details.");
    } finally {
      setIsGenerating(false);
      setTimeout(() => {
        setGenerationProgress(0);
        setGenerationCount(0, 0);
      }, 1000);
    }
  };

  const handleClearCanvas = async () => {
    if (!window.confirm("Clear ALL images from canvas? This cannot be undone."))
      return;

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

  const handleInterpolate = async (
    idA: number,
    idB: number,
    alpha: number,
    steps?: number
  ) => {
    console.log(`Interpolating between images ${idA} and ${idB} (alpha: ${alpha}, steps: ${steps || 1})...`);
    setInterpolationImageIds(null);
    setIsGenerating(true);
    setFloatingPanelPos(null);

    const totalSteps = steps || 1;
    setGenerationCount(0, totalSteps);
    setGenerationProgress(0);

    // Estimate 5 seconds per interpolation
    const estimatedTimeMs = totalSteps * 5000;
    const updateIntervalMs = 100;
    const totalUpdates = estimatedTimeMs / updateIntervalMs;
    let updates = 0;

    const progressInterval = setInterval(() => {
      updates++;
      const progress = Math.min((updates / totalUpdates) * 90, 90);
      const currentStepEstimate = Math.floor((progress / 90) * totalSteps);
      setGenerationCount(currentStepEstimate, totalSteps);
      setGenerationProgress(progress);
    }, updateIntervalMs);

    try {
      if (steps && steps > 1) {
        // Generate multiple interpolations
        for (let i = 0; i < steps; i++) {
          const currentAlpha = i / (steps - 1);
          await apiClient.interpolate({ id_a: idA, id_b: idB, alpha: currentAlpha });
        }
      } else {
        // Single interpolation
        await apiClient.interpolate({ id_a: idA, id_b: idB, alpha });
      }
      clearInterval(progressInterval);
      setGenerationCount(totalSteps, totalSteps);
      setGenerationProgress(100);
      console.log("Interpolation successful");
      clearSelection();
    } catch (error) {
      clearInterval(progressInterval);
      console.error("Interpolation failed:", error);
      alert(`Interpolation failed: ${error}`);
    } finally {
      setIsGenerating(false);
      setTimeout(() => {
        setGenerationProgress(0);
        setGenerationCount(0, 0);
      }, 1000);
    }
  };

  const promptDialogImage = images.find(
    (img) => img.id === promptDialogImageId
  );

  const interpolationImages = interpolationImageIds
    ? [
        images.find((img) => img.id === interpolationImageIds[0]),
        images.find((img) => img.id === interpolationImageIds[1]),
      ].filter(Boolean) as [ImageData, ImageData]
    : null;

  const handleGenerateFromReferenceClick = (imageId: number) => {
    setPromptDialogImageId(imageId);
  };

  const handleInterpolateClick = () => {
    if (selectedImageIds.length === 2) {
      setInterpolationImageIds([selectedImageIds[0], selectedImageIds[1]]);
      setFloatingPanelPos(null);
    }
  };

  const handlePromptDialogGenerate = async (
    referenceId: number,
    prompt: string
  ) => {
    console.log(
      `Generating from reference ${referenceId} with prompt: "${prompt}"`
    );
    setPromptDialogImageId(null);
    setIsGenerating(true);
    setFloatingPanelPos(null);
    setGenerationCount(0, 1);
    setGenerationProgress(0);

    // Estimate 5 seconds for generation
    const estimatedTimeMs = 5000;
    const updateIntervalMs = 100;
    const totalUpdates = estimatedTimeMs / updateIntervalMs;
    let updates = 0;

    const progressInterval = setInterval(() => {
      updates++;
      const progress = Math.min((updates / totalUpdates) * 90, 90);
      setGenerationProgress(progress);
    }, updateIntervalMs);

    try {
      const result = await apiClient.generateFromReference({
        reference_id: referenceId,
        prompt,
      });
      clearInterval(progressInterval);
      console.log("Generation from reference successful:", result);
      setGenerationCount(1, 1);
      setGenerationProgress(100);
      clearSelection();
    } catch (error) {
      clearInterval(progressInterval);
      console.error("Reference generation failed:", error);
      alert(`Generation failed: ${error}`);
    } finally {
      setIsGenerating(false);
      setTimeout(() => {
        setGenerationProgress(0);
        setGenerationCount(0, 0);
      }, 1000);
    }
  };

  // Click outside to close floating panel
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      if (
        floatingPanelPos &&
        !target.closest(".floating-action-panel") &&
        !target.closest(".image-node")
      ) {
        setFloatingPanelPos(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [floatingPanelPos]);

  // Close menus on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPromptDialogImageId(null);
        setInterpolationImageIds(null);
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
      {/* Progress Bar */}
      <ProgressBar isVisible={isGenerating} message="Generating images..." />

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
          onSelectionChange={React.useCallback((x, y, count) => {
            if (count > 0) {
              setFloatingPanelPos({ x, y, count });
            } else {
              setFloatingPanelPos(null);
            }
          }, [])}
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
                ? handleInterpolateClick
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

        {/* Prompt Dialog */}
        {promptDialogImage && (
          <PromptDialog
            referenceImage={promptDialogImage}
            onClose={() => setPromptDialogImageId(null)}
            onGenerate={handlePromptDialogGenerate}
          />
        )}

        {/* Interpolation Dialog */}
        {interpolationImages && interpolationImages.length === 2 && (
          <InterpolationDialog
            imageA={interpolationImages[0]}
            imageB={interpolationImages[1]}
            onClose={() => setInterpolationImageIds(null)}
            onInterpolate={handleInterpolate}
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
              disabled={!isInitialized}
              style={{ flex: 1 }}
            >
              🎨 Generate Images
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
