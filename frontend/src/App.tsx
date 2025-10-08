import React, { useEffect, useState } from "react";
import { SemanticCanvas } from "./components/Canvas/SemanticCanvas";
import { PromptDialog } from "./components/PromptDialog/PromptDialog";
import { InterpolationDialog } from "./components/InterpolationDialog/InterpolationDialog";
import { FloatingActionPanel } from "./components/FloatingActionPanel/FloatingActionPanel";
import { ProgressBar } from "./components/ProgressBar/ProgressBar";
import { ModeToggle } from "./components/ModeToggle/ModeToggle";
import { useAppStore } from "./store/appStore";
import { apiClient } from "./api/client";
import { falClient } from "./api/falClient";
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
  const generationMode = useAppStore((state) => state.generationMode);
  const removeBackground = useAppStore((state) => state.removeBackground);

  const setImages = useAppStore((state) => state.setImages);
  const setHistoryGroups = useAppStore((state) => state.setHistoryGroups);
  const setIsInitialized = useAppStore((state) => state.setIsInitialized);
  const setIsGenerating = useAppStore((state) => state.setIsGenerating);
  const setGenerationProgress = useAppStore((state) => state.setGenerationProgress);
  const setGenerationCount = useAppStore((state) => state.setGenerationCount);
  const clearSelection = useAppStore((state) => state.clearSelection);

  useEffect(() => {
    // Reset generating state when switching modes
    console.log("🔄 Mode changed to:", generationMode);
    setIsGenerating(false);
    setGenerationProgress(0);
    setGenerationCount(0, 0);

    // Initialize based on mode
    if (generationMode === 'local-sd15') {
      // Connect WebSocket for real-time updates
      apiClient.connectWebSocket((message) => {
        if (message.type === "state_update" && message.data) {
          setImages(message.data.images);
          setHistoryGroups(message.data.history_groups);
        } else if (message.type === "progress" && message.progress !== undefined) {
          setGenerationProgress(message.progress);
        }
      });

      // Initialize backend models (SD 1.5 + CLIP)
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
          setIsInitialized(false);
          alert(
            "Failed to connect to backend. Make sure backend is running on port 8000."
          );
        });

      return () => {
        apiClient.disconnectWebSocket(() => {});
      };
    } else {
      // For fal.ai mode, only initialize CLIP (for embeddings)
      apiClient
        .initializeClipOnly()
        .then(() => {
          setIsInitialized(true);
          return apiClient.getState();
        })
        .then((state) => {
          setImages(state.images);
          setHistoryGroups(state.history_groups);
        })
        .catch((error) => {
          console.error("Failed to initialize CLIP:", error);
          setIsInitialized(false);
          alert(
            "Failed to connect to backend. Make sure backend is running on port 8000."
          );
        });
    }
  }, [generationMode, setImages, setHistoryGroups, setIsInitialized, setGenerationProgress, setIsGenerating, setGenerationCount]);

  const handleGenerate = async () => {
    const prompt = window.prompt("Enter prompt for image generation:");
    if (!prompt) return;

    const count = window.prompt("How many images? (1-20)", "8");
    const nImages = parseInt(count || "8", 10);

    if (isNaN(nImages) || nImages < 1 || nImages > 20) {
      alert("Invalid count. Please enter a number between 1 and 20.");
      return;
    }

    // Check if fal.ai is configured when using fal-nanobanana mode
    if (generationMode === 'fal-nanobanana' && !falClient.isConfigured()) {
      alert("fal.ai API key not configured. Please set VITE_FAL_API_KEY in your .env file.");
      return;
    }

    // Inform user about batching for fal.ai
    if (generationMode === 'fal-nanobanana' && nImages > 4) {
      const numBatches = Math.ceil(nImages / 4);
      console.log(`ℹ️ Generating ${nImages} images in ${numBatches} batches (fal.ai limit: 4 per request)`);
    }

    setIsGenerating(true);
    setGenerationCount(0, nImages);
    setGenerationProgress(0);

    // Estimate time based on mode and number of images
    // fal.ai batches in groups of 4, so larger requests take longer
    let estimatedTimeMs;
    if (generationMode === 'fal-nanobanana') {
      const numBatches = Math.ceil(nImages / 4); // fal.ai processes 4 at a time
      estimatedTimeMs = numBatches * 8000; // ~8 seconds per batch of 4
      console.log(`Estimated time: ${numBatches} batches × 8s = ${estimatedTimeMs/1000}s`);
    } else {
      estimatedTimeMs = nImages * 5000; // 5 seconds per image for local SD
    }

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

    // Safety timeout: auto-reset after 5 minutes
    const safetyTimeout = setTimeout(() => {
      console.error("⚠️ Generation timed out after 5 minutes");
      clearInterval(progressInterval);
      setIsGenerating(false);
      setGenerationProgress(0);
      setGenerationCount(0, 0);
      alert("Generation timed out. Please try again or check your connection.");
    }, 300000); // 5 minutes

    try {
      if (generationMode === 'local-sd15') {
        // Use local SD 1.5 backend
        await apiClient.generate({ prompt, n_images: nImages });
      } else {
        // Use fal.ai nano-banana text-to-image
        const result = await falClient.generateTextToImage({
          prompt,
          num_images: nImages,
          aspect_ratio: "1:1",
          output_format: "jpeg"
        });

        console.log("fal.ai generation result:", result);

        // Send images to backend for CLIP embedding extraction
        await apiClient.addExternalImages({
          images: result.images.map(img => ({ url: img.url })),
          prompt: prompt,
          generation_method: 'batch',
          remove_background: removeBackground
        });

        console.log(`✓ Added ${result.images.length} fal.ai images to canvas`);
      }

      clearInterval(progressInterval);
      clearTimeout(safetyTimeout);
      setGenerationCount(nImages, nImages);
      setGenerationProgress(100);
    } catch (error) {
      clearInterval(progressInterval);
      clearTimeout(safetyTimeout);
      console.error("Generation failed:", error);
      alert(`Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

    // Safety timeout: auto-reset after 5 minutes
    const safetyTimeout = setTimeout(() => {
      console.error("⚠️ Interpolation timed out after 5 minutes");
      clearInterval(progressInterval);
      setIsGenerating(false);
      setGenerationProgress(0);
      setGenerationCount(0, 0);
      alert("Interpolation timed out. Please try again.");
    }, 300000);

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
      clearTimeout(safetyTimeout);
      setGenerationCount(totalSteps, totalSteps);
      setGenerationProgress(100);
      console.log("Interpolation successful");
      clearSelection();
    } catch (error) {
      clearInterval(progressInterval);
      clearTimeout(safetyTimeout);
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

    // Check if fal.ai is configured when using fal-nanobanana mode
    if (generationMode === 'fal-nanobanana' && !falClient.isConfigured()) {
      alert("fal.ai API key not configured. Please set VITE_FAL_API_KEY in your .env file.");
      return;
    }

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

    // Safety timeout: auto-reset after 5 minutes
    const safetyTimeout = setTimeout(() => {
      console.error("⚠️ Reference generation timed out after 5 minutes");
      clearInterval(progressInterval);
      setIsGenerating(false);
      setGenerationProgress(0);
      setGenerationCount(0, 0);
      alert("Generation timed out. Please try again.");
    }, 300000);

    try {
      if (generationMode === 'local-sd15') {
        // Use local SD 1.5 backend
        const result = await apiClient.generateFromReference({
          reference_id: referenceId,
          prompt,
        });
        clearInterval(progressInterval);
        clearTimeout(safetyTimeout);
        console.log("Generation from reference successful:", result);
        setGenerationCount(1, 1);
        setGenerationProgress(100);
        clearSelection();
      } else {
        // Use fal.ai nano-banana image editing
        // Get selected images to use as references
        const selectedImages = selectedImageIds.length > 0
          ? images.filter(img => selectedImageIds.includes(img.id))
          : images.filter(img => img.id === referenceId);

        if (selectedImages.length === 0) {
          throw new Error("No reference images found");
        }

        // Convert base64 images to URLs that fal.ai can use
        // For now, we'll use the text-to-image endpoint since we have base64 data
        // In a production app, you'd upload these images to fal.ai storage first
        const imageUrls: string[] = [];

        for (const img of selectedImages) {
          // Create a blob from base64
          const base64Data = img.base64_image;
          const blob = await (await fetch(`data:image/png;base64,${base64Data}`)).blob();
          const file = new File([blob], `reference-${img.id}.png`, { type: 'image/png' });

          // Upload to fal.ai storage
          const url = await falClient.uploadFile(file);
          imageUrls.push(url);
        }

        // Use image edit endpoint with reference images
        const result = await falClient.generateImageEdit({
          prompt,
          image_urls: imageUrls,
          num_images: 1,
          aspect_ratio: "1:1",
          output_format: "jpeg"
        });

        console.log("fal.ai image edit result:", result);

        // Send images to backend for CLIP embedding extraction
        // Include parent IDs for genealogy tracking
        const parentIds = selectedImages.map(img => img.id);
        console.log("Setting parent IDs:", parentIds);

        await apiClient.addExternalImages({
          images: result.images.map(img => ({ url: img.url })),
          prompt: prompt,
          generation_method: 'reference',
          remove_background: removeBackground,
          parent_ids: parentIds
        });

        console.log(`✓ Added fal.ai edited image to canvas with ${parentIds.length} parent(s)`);
        clearInterval(progressInterval);
        clearTimeout(safetyTimeout);
        setGenerationCount(1, 1);
        setGenerationProgress(100);
        clearSelection();
      }
    } catch (error) {
      clearInterval(progressInterval);
      clearTimeout(safetyTimeout);
      console.error("Reference generation failed:", error);
      alert(`Generation failed: ${error instanceof Error ? error.message : String(error)}`);
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
            console.log("🎯 App received onSelectionChange:", { x, y, count });
            if (count > 0) {
              // -1 signals to keep existing position, just update count
              if (x === -1 && y === -1) {
                setFloatingPanelPos(prev => prev ? { ...prev, count } : { x: 0, y: 0, count });
              } else {
                setFloatingPanelPos({ x, y, count });
              }
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
              floatingPanelPos.count === 2 && generationMode === 'local-sd15'
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
              max="400"
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

          <div className="setting-item">
            <div className="setting-label">
              <span>
                Layout Padding:{" "}
                {(useAppStore.getState().visualSettings.layoutPadding * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.3"
              step="0.05"
              value={useAppStore.getState().visualSettings.layoutPadding}
              onChange={(e) => {
                useAppStore.getState().updateVisualSettings({
                  layoutPadding: parseFloat(e.target.value),
                });
              }}
              style={{ width: "100%" }}
              title="Controls spacing around images when rescaling (5% = tight, 30% = spacious)"
            />
            <div style={{ fontSize: "11px", color: "#8b949e", marginTop: "4px" }}>
              {useAppStore.getState().visualSettings.layoutPadding <= 0.1
                ? "Tight spacing"
                : useAppStore.getState().visualSettings.layoutPadding <= 0.2
                ? "Moderate spacing"
                : "Spacious layout"}
            </div>
          </div>

          <div className="setting-item">
            <button
              className="action-button secondary"
              onClick={() => {
                useAppStore.getState().resetCanvasBounds();
                console.log("🔄 Canvas bounds reset - will rescale on next render");
              }}
              disabled={images.length === 0}
              style={{ width: "100%", marginTop: "8px" }}
              title="Rescale canvas to fit all images with current padding setting"
            >
              📐 Rescale Canvas
            </button>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="control-panel">
        {/* Mode Toggle */}
        <ModeToggle />

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

          {isGenerating && (
            <button
              className="action-button secondary"
              onClick={() => {
                console.warn("⚠️ Force stopping generation");
                setIsGenerating(false);
                setGenerationProgress(0);
                setGenerationCount(0, 0);
              }}
              style={{
                width: "100%",
                marginTop: "8px",
                background: "rgba(248, 81, 73, 0.2)",
                color: "#f85149",
                border: "1px solid rgba(248, 81, 73, 0.3)"
              }}
              title="Force stop if generation is stuck"
            >
              ⏹️ Force Stop Generation
            </button>
          )}

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
