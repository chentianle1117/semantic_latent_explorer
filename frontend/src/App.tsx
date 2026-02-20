import React, { useEffect, useState, useRef } from "react";
import { SemanticCanvas } from "./components/Canvas/SemanticCanvas";
import { SemanticCanvas3D } from "./components/Canvas/SemanticCanvas3D";
import { PromptDialog } from "./components/PromptDialog/PromptDialog";
// FloatingActionPanel removed — actions moved to RightInspector
import { ProgressModal } from "./components/ProgressModal/ProgressModal";
import { HeaderBar } from "./components/HeaderBar/HeaderBar";
import { RightInspector } from "./components/RightInspector/RightInspector";
import { BottomDrawer } from "./components/BottomDrawer/BottomDrawer";
import { LayersSidebar } from "./components/LayersSidebar/LayersSidebar";
import { SettingsModal } from "./components/SettingsModal/SettingsModal";
import { useProgressStore } from "./store/progressStore";
import { BatchPromptDialog } from "./components/BatchPromptDialog/BatchPromptDialog";
import { ExternalImageLoader } from "./components/ExternalImageLoader/ExternalImageLoader";
import { TextToImageDialog } from "./components/TextToImageDialog/TextToImageDialog";
import { RadialDial } from "./components/RadialDial/RadialDial";
import { ExplorationTreeModal } from "./components/ExplorationTreeModal/ExplorationTreeModal";
import { DynamicIsland } from "./components/DynamicIsland/DynamicIsland";
import { DesignBriefOverlay } from "./components/DesignBriefOverlay/DesignBriefOverlay";
import { InlineAxisSuggestions } from "./components/InlineAxisSuggestions/InlineAxisSuggestions";
import { useAppStore } from "./store/appStore";
import { useAgentBehaviors } from "./hooks/useAgentBehaviors";
import { useAutoSave } from "./hooks/useAutoSave";
import { useEventLog } from "./hooks/useEventLog";
import { apiClient } from "./api/client";
import { falClient } from "./api/falClient";
import "./styles/app.css";

export const App: React.FC = () => {
  // floatingPanelPos removed — actions now in RightInspector
  const [showTextToImageDialog, setShowTextToImageDialog] = useState(false);
  const [showPromptDialog, setShowPromptDialog] = useState(false);
  const [promptDialogImageId, setPromptDialogImageId] = useState<number | null>(
    null
  );
  const [showBatchPromptDialog, setShowBatchPromptDialog] = useState(false);
  const [showExternalImageLoader, setShowExternalImageLoader] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  // Agent/AI state — designBrief lives in Zustand store (replaces local useState)
  const setCurrentBrief = useAppStore((s) => s.setDesignBrief);
  // AxisSuggestionModal removed — axes now shown via InlineAxisSuggestions + Dynamic Island
  const isLoadingAxes = false; // kept for HeaderBar prop, always false (agent handles axis suggestions)
  const [showLabels, setShowLabels] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showClusters, setShowClusters] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState("#0d1117");
  const [ghostCount, setGhostCount] = useState(1);
  const [showRadialDial, setShowRadialDial] = useState(false);
  const [radialDialPos, setRadialDialPos] = useState({ x: 0, y: 0 });
  const [showExplorationTreeModal, setShowExplorationTreeModal] = useState(false);
  const lastMousePosRef = useRef({
    x: typeof window !== "undefined" ? window.innerWidth / 2 : 400,
    y: typeof window !== "undefined" ? window.innerHeight / 2 : 300,
  });

  const images = useAppStore((state) =>
    state.images.filter((img) => img.visible)
  );
  const selectedImageIds = useAppStore((state) => state.selectedImageIds);
  const isInitialized = useAppStore((state) => state.isInitialized);
  const removeBackground = useAppStore((state) => state.removeBackground);
  const is3DMode = useAppStore((state) => state.is3DMode);

  const setImages = useAppStore((state) => state.setImages);
  const setHistoryGroups = useAppStore((state) => state.setHistoryGroups);
  const setIsInitialized = useAppStore((state) => state.setIsInitialized);
  const resetCanvasBounds = useAppStore((state) => state.resetCanvasBounds);
  const setIsGenerating = useAppStore((state) => state.setIsGenerating);
  const setGenerationProgress = useAppStore(
    (state) => state.setGenerationProgress
  );
  const clearSelection = useAppStore((state) => state.clearSelection);
  const addToExplorationCounter = useAppStore((state) => state.addToExplorationCounter);
  const addToAxisSuggestionCounter = useAppStore((state) => state.addToAxisSuggestionCounter);

  const { triggerConcurrentGhosts, triggerExplorationGhosts, triggerAxisSuggestions } = useAgentBehaviors();
  useAutoSave();
  useEventLog();

  // Auto-sync layer state to backend whenever layers or imageLayerMap change
  // This ensures the export ZIP always has up-to-date layer info
  const layers = useAppStore((s) => s.layers);
  const imageLayerMap = useAppStore((s) => s.imageLayerMap);
  useEffect(() => {
    const layerDefs = layers.map(l => ({ id: l.id, name: l.name, color: l.color, visible: l.visible }));
    apiClient.syncLayers(imageLayerMap, layerDefs);
  }, [layers, imageLayerMap]);

  useEffect(() => {
    // Initialize CLIP on mount
    console.log("🚀 Initializing CLIP embedder...");

    console.log("Initializing CLIP embedder...");
    useProgressStore
      .getState()
      .showProgress("initializing", "Loading CLIP model...", false);
    apiClient
      .initializeClipOnly()
      .then(() => {
        console.log("CLIP initialization successful");
        setIsInitialized(true);
        return apiClient.getState();
      })
      .then((state) => {
        console.log("State fetched:", {
          images: state.images.length,
          groups: state.history_groups.length,
          design_brief: state.design_brief ? "present" : "none",
          clusters: state.cluster_centroids?.length || 0,
          clip_model: state.clip_model_type || "fashionclip",
        });
        setImages(state.images);
        setHistoryGroups(state.history_groups);
        // Load cluster data for edge bundling
        if (state.cluster_centroids && state.cluster_labels) {
          useAppStore.setState({
            clusterCentroids: state.cluster_centroids,
            clusterLabels: state.cluster_labels,
          });
        }
        // Load CLIP model type from backend
        if (state.clip_model_type) {
          useAppStore.getState().setClipModelType(state.clip_model_type);
          console.log(
            `✓ Loaded CLIP model type: ${state.clip_model_type}`
          );
        }
        // Load expanded concepts (Gemini expansions for axis labels)
        if (state.expanded_concepts) {
          useAppStore.getState().setExpandedConcepts(state.expanded_concepts);
        }
        // Load design brief from backend state
        if (state.design_brief) {
          setCurrentBrief(state.design_brief);
          console.log(
            "✓ Loaded design brief from backend:",
            state.design_brief.substring(0, 50) + "..."
          );
        }
        useProgressStore.getState().hideProgress();
        // Load canvas session metadata
        return Promise.all([
          apiClient.getCurrentSession(),
          apiClient.listSessions(),
        ]).then(([session, { sessions }]) => {
          useAppStore.getState().setCurrentCanvasId(session.canvasId);
          useAppStore.getState().setCanvasName(session.canvasName);
          useAppStore.getState().setParticipantId(session.participantId);
          useAppStore.getState().setCanvasList(sessions);
        }).catch(() => {/* session endpoints optional */});
      })
      .catch((error) => {
        console.error("Failed to initialize CLIP:", error);
        setIsInitialized(false);
        useProgressStore.getState().hideProgress();
        alert(
          `Failed to initialize CLIP. Make sure backend is running on port 8000.\n\nError: ${
            error.message || error
          }`
        );
      });
  }, [setImages, setHistoryGroups, setIsInitialized]);

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
      // floatingPanelPos removed
    } catch (error) {
      console.error("Clear failed:", error);
      alert("Failed to clear canvas. Check console for details.");
    }
  };

  const handleExportZip = async (exportIds?: number[]) => {
    const toExport = exportIds ?? images.map((img) => img.id);
    if (toExport.length === 0) {
      alert("No images to export. Generate some images first!");
      return;
    }

    // Show loading state
    setIsGenerating(true);
    setGenerationProgress(50);

    try {
      const idsParam = exportIds ? `?ids=${exportIds.join(",")}` : "";
      console.log(
        `📦 Exporting ${toExport.length} image(s) as ZIP${exportIds ? " (selected only)" : ""}`
      );

      const response = await fetch(
        `http://localhost:8000/api/export-zip${idsParam}`,
        {
          method: "GET",
          headers: {
            Accept: "application/zip",
          },
        }
      );

      console.log("Response status:", response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Export error response:", errorText);
        throw new Error(
          `Export failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      console.log("Creating blob from response...");
      const blob = await response.blob();
      console.log("Blob size:", blob.size, "bytes");

      if (blob.size === 0) {
        throw new Error("Received empty ZIP file from server");
      }

      // Download the ZIP file
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zappos_export_${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      console.log(
        `✅ Successfully exported ${toExport.length} image(s) with metadata!`
      );
      alert(`✅ Successfully exported ${toExport.length} image(s) with metadata!`);
    } catch (error) {
      console.error("❌ Export ZIP failed:", error);
      alert(
        `Failed to export ZIP: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  };

  const handleBatchGenerate = async (
    prompts: string[],
    countPerPrompt: number = 4
  ) => {
    console.log(
      `🚀 Starting batch generation for ${prompts.length} prompts (${countPerPrompt} images each)`
    );
    setShowBatchPromptDialog(false);
    setIsGenerating(true);
    useProgressStore
      .getState()
      .showProgress(
        "generating",
        `Batch generating ${prompts.length} prompts...`,
        true
      );

    const totalPrompts = prompts.length;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      console.log(
        `\n📝 [${i + 1}/${totalPrompts}] Generating: "${prompt.substring(
          0,
          50
        )}..."`
      );

      const overallProgress = (i / totalPrompts) * 100;
      useProgressStore
        .getState()
        .updateProgress(
          overallProgress,
          `Prompt ${i + 1}/${totalPrompts}: ${prompt.substring(0, 40)}...`
        );

      try {
        // Generate images using fal.ai
        const result = await falClient.generateTextToImage({
          prompt,
          num_images: countPerPrompt,
          aspect_ratio: "1:1",
          output_format: "jpeg",
        });

        console.log(
          `✓ Generated ${countPerPrompt} image(s) for prompt ${i + 1}`
        );

        // Send to backend for CLIP embedding
        const batchResult = await apiClient.addExternalImages({
          images: result.images.map((img) => ({ url: img.url })),
          prompt: prompt,
          generation_method: "batch",
          remove_background: removeBackground,
        });

        // Assign generated images to shoes layer
        if (batchResult?.images?.length > 0) {
          const newIds = batchResult.images.map((img: any) => img.id);
          useAppStore.getState().setImagesLayer(newIds, 'default');
        }

        console.log(`✓ Added to canvas (${i + 1}/${totalPrompts})`);
        successCount++;
        addToExplorationCounter(countPerPrompt);
        addToAxisSuggestionCounter(countPerPrompt);
        triggerConcurrentGhosts(prompt, [], []).catch(console.error);

        // Fetch updated state after EACH prompt to update UI
        useProgressStore
          .getState()
          .updateProgress(
            overallProgress + (100 / totalPrompts) * 0.5,
            "Updating canvas..."
          );
        const state = await apiClient.getState();
        setImages(state.images);
        setHistoryGroups(state.history_groups);
      } catch (error) {
        console.error(`✗ Failed prompt ${i + 1}:`, error);
        failCount++;

        // Ask user if they want to continue
        if (i < prompts.length - 1) {
          const shouldContinue = window.confirm(
            `Failed to generate image ${
              i + 1
            }/${totalPrompts}:\n"${prompt.substring(0, 50)}..."\n\nError: ${
              error instanceof Error ? error.message : "Unknown error"
            }\n\nContinue with remaining ${totalPrompts - i - 1} prompts?`
          );

          if (!shouldContinue) {
            console.log("🛑 User cancelled batch generation");
            break;
          }
        }
      }
    }

    useProgressStore.getState().updateProgress(100, "Batch complete!");
    setIsGenerating(false);

    setTimeout(() => {
      useProgressStore.getState().hideProgress();
      const message = `Batch generation complete!\n\n✅ Success: ${successCount}/${totalPrompts}\n${
        failCount > 0 ? `❌ Failed: ${failCount}/${totalPrompts}` : ""
      }`;
      alert(message);
    }, 500);

    console.log(
      `\n🎉 Batch complete - Success: ${successCount}/${totalPrompts}`
    );
  };

  const handleLoadExternalImages = async (shoes: string[], references: string[]) => {
    const total = shoes.length + references.length;
    if (total === 0) return;
    console.log(`📥 Loading ${shoes.length} shoes + ${references.length} references...`);
    setShowExternalImageLoader(false);
    setIsGenerating(true);
    useProgressStore
      .getState()
      .showProgress("loading", `Loading ${total} image${total > 1 ? "s" : ""}...`, true);
    useProgressStore.getState().updateProgress(0);

    const allNewIds: number[] = [];
    try {
      // Load shoes (background removal ON → default/Shoes layer)
      if (shoes.length > 0) {
        useProgressStore.getState().updateProgress(10, `Loading ${shoes.length} shoe image${shoes.length > 1 ? "s" : ""}...`);
        const shoeResult = await apiClient.addExternalImages({
          images: shoes.map((url) => ({ url })),
          prompt: "Shoe images",
          generation_method: "external",
          remove_background: true,
        });
        if (shoeResult.images?.length) {
          const ids = shoeResult.images.map((img: any) => img.id);
          allNewIds.push(...ids);
          useAppStore.getState().setImagesLayer(ids, "default"); // Shoes layer
        }
      }

      // Load references (background removal OFF → references layer)
      if (references.length > 0) {
        useProgressStore.getState().updateProgress(50, `Loading ${references.length} reference image${references.length > 1 ? "s" : ""}...`);
        const refResult = await apiClient.addExternalImages({
          images: references.map((url) => ({ url })),
          prompt: "Reference images",
          generation_method: "external",
          remove_background: false,
        });
        if (refResult.images?.length) {
          const ids = refResult.images.map((img: any) => img.id);
          allNewIds.push(...ids);
          useAppStore.getState().setImagesLayer(ids, "references"); // References layer
        }
      }

      useProgressStore.getState().updateProgress(85, "Updating canvas...");
      const state = await apiClient.getState();
      setImages(state.images);
      setHistoryGroups(state.history_groups);

      resetCanvasBounds();
      if (allNewIds.length > 0) {
        useAppStore.getState().setSelectedImageIds(allNewIds);
      }

      console.log(`✓ All ${total} images loaded successfully`);
      useProgressStore.getState().updateProgress(100, "Complete");
    } catch (error) {
      console.error("Failed to load external images:", error);
      useProgressStore.getState().hideProgress();
      alert(`Failed to load images: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsGenerating(false);
      useProgressStore.getState().hideProgress();
    }
  };

  // Get all selected images for the prompt dialog
  const promptDialogImages =
    selectedImageIds.length > 0
      ? images.filter((img) => selectedImageIds.includes(img.id))
      : promptDialogImageId !== null
      ? images.filter((img) => img.id === promptDialogImageId)
      : [];

  const handleGenerateFromReferenceClick = () => {
    // Use selected images, or if none selected, single image ID will be set
    // The promptDialogImages computed property handles this
    if (selectedImageIds.length === 0 && promptDialogImageId === null) {
      console.warn("No images selected for reference generation");
      return;
    }
    setShowPromptDialog(true);
  };

  const handlePromptDialogGenerate = async (
    referenceIds: number[],
    prompt: string,
    numImages: number = 1
  ) => {
    console.log(
      `Generating from ${referenceIds.length} reference(s) with prompt: "${prompt}", count: ${numImages}`
    );

    // Check if fal.ai is configured
    if (!falClient.isConfigured()) {
      alert(
        "fal.ai API key not configured. Please set VITE_FAL_API_KEY in your .env file."
      );
      return;
    }

    setPromptDialogImageId(null);
    setShowPromptDialog(false);
    setIsGenerating(true);
    useProgressStore
      .getState()
      .showProgress(
        "generating",
        `Generating ${numImages} image${
          numImages > 1 ? "s" : ""
        } from reference...`,
        true
      );
    useProgressStore.getState().updateProgress(0);

    try {
      const selectedImages = images.filter((img) =>
        referenceIds.includes(img.id)
      );

      if (selectedImages.length === 0) {
        throw new Error("No reference images found");
      }

      console.log(
        `Using ${selectedImages.length} reference images to generate ${numImages} variations`
      );

      // Convert base64 images to URLs that fal.ai can use
      useProgressStore
        .getState()
        .updateProgress(10, "Uploading reference images...");
      const imageUrls: string[] = [];

      for (const img of selectedImages) {
        // Create a blob from base64
        const base64Data = img.base64_image;
        const blob = await (
          await fetch(`data:image/png;base64,${base64Data}`)
        ).blob();
        const file = new File([blob], `reference-${img.id}.png`, {
          type: "image/png",
        });

        // Upload to fal.ai storage
        const url = await falClient.uploadFile(file);
        imageUrls.push(url);
      }

      // Use image edit endpoint with reference images
      useProgressStore
        .getState()
        .updateProgress(30, "Generating variations...");
      const result = await falClient.generateImageEdit({
        prompt,
        image_urls: imageUrls,
        num_images: numImages, // Changed from hardcoded 1
        aspect_ratio: "1:1",
        output_format: "jpeg",
      });

      console.log("fal.ai image edit result:", result);

      // Send images to backend for CLIP embedding extraction
      // Include parent IDs for genealogy tracking
      const parentIds = selectedImages.map((img) => img.id);
      console.log("Setting parent IDs:", parentIds);

      useProgressStore.getState().updateProgress(70, "Computing embeddings...");
      const addResult = await apiClient.addExternalImages({
        images: result.images.map((img) => ({ url: img.url })),
        prompt: prompt,
        generation_method: "reference",
        remove_background: removeBackground,
        parent_ids: parentIds,
      });

      console.log(
        `✓ Added ${result.images.length} fal.ai edited image(s) to canvas with ${parentIds.length} parent(s)`
      );
      addToExplorationCounter(numImages);
      addToAxisSuggestionCounter(numImages);
      triggerConcurrentGhosts(prompt, parentIds, imageUrls).catch(console.error);

      // Fetch updated state since we're not using WebSocket
      useProgressStore.getState().updateProgress(90, "Updating canvas...");
      const state = await apiClient.getState();
      setImages(state.images);
      setHistoryGroups(state.history_groups);

      // Auto-select newly generated images + assign to shoes layer
      if (addResult?.images?.length > 0) {
        const newIds = addResult.images.map((img: any) => img.id);
        useAppStore.getState().setSelectedImageIds(newIds);
        useAppStore.getState().setImagesLayer(newIds, 'default');
      }

      useProgressStore.getState().updateProgress(100);
    } catch (error) {
      console.error("Reference generation failed:", error);
      useProgressStore.getState().hideProgress();
      alert(
        `Generation failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setIsGenerating(false);
      useProgressStore.getState().hideProgress();
    }
  };

  const handleApplyAxes = async (xAxis: string, yAxis: string) => {
    try {
      // Parse axis - handle both "negative - positive" format and single-word format
      const parseAxis = (axis: string): [string, string] => {
        const parts = axis
          .split(" - ")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        if (parts.length === 2) {
          // Already in "negative - positive" format
          return [parts[0], parts[1]];
        } else if (parts.length === 1) {
          // Single word - convert to "Low X - High X" format
          const word = parts[0];
          return [`Low ${word}`, `High ${word}`];
        } else {
          throw new Error(`Invalid axis format: "${axis}"`);
        }
      };

      const [xNeg, xPos] = parseAxis(xAxis);
      const [yNeg, yPos] = parseAxis(yAxis);

      console.log("Applying axes:", { xNeg, xPos, yNeg, yPos });

      useProgressStore
        .getState()
        .showProgress("reprojecting", "Updating canvas axes...", false);

      await apiClient.updateAxes({
        x_positive: xPos,
        x_negative: xNeg,
        y_positive: yPos,
        y_negative: yNeg,
      });

      useProgressStore.getState().updateProgress(50, "Reprojecting images...");
      const state = await apiClient.getState();

      // Update both axis labels AND images with new coordinates
      useAppStore.getState().setAxisLabels(state.axis_labels);
      setImages(state.images);
      setHistoryGroups(state.history_groups);

      useProgressStore.getState().updateProgress(100);
      useProgressStore.getState().hideProgress();

      console.log(
        `✓ Applied new axes: X=${xAxis}, Y=${yAxis} - Canvas reprojected with ${state.images.length} images`
      );
    } catch (error) {
      console.error("Failed to apply axes:", error);
      useProgressStore.getState().hideProgress();
      alert("Failed to apply new axes. Check console for details.");
    }
  };

  // FloatingActionPanel click-outside handler removed (panel replaced by inspector actions)

  // Close menus on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPromptDialogImageId(null);
        setShowPromptDialog(false);
        // floatingPanelPos removed
        setShowRadialDial(false);
        clearSelection(); // Also clear selection to close dialogs
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [clearSelection]);
  // Radial dial: Space key = toggle (stays open until Space again or Escape or click outside)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === " " && !e.repeat) {
        const target = e.target as HTMLElement;
        if (target.closest("input") || target.closest("textarea")) return;
        e.preventDefault();
        setShowRadialDial((prev) => {
          if (prev) return false;
          setRadialDialPos({
            x: lastMousePosRef.current.x,
            y: lastMousePosRef.current.y,
          });
          return true;
        });
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Track mouse for Space-triggered dial
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Update floating panel position when selection changes
  useEffect(() => {
    if (selectedImageIds.length === 0) {
      // floatingPanelPos removed
      setShowPromptDialog(false);
    }
  }, [selectedImageIds]);

  return (
    <>
      {/* Progress Modal */}
      <ProgressModal />

      <div className="app-layout">
        {/* Header Bar */}
        <HeaderBar
          imageCount={images.length}
          isInitialized={isInitialized}
          isAnalyzing={false}
          isLoadingAxes={isLoadingAxes}
          is3DMode={is3DMode}
          onToggle3D={() => useAppStore.getState().setIs3DMode(!is3DMode)}
          onOpenSettings={() => setShowSettingsModal(true)}
          onInsightClick={() => {
            useAppStore.getState().dismissInsight();
          }}
        />

        {/* Left Toolbar removed - all actions in Radial Dial (Space or middle-click) */}

        {/* Center Canvas */}
        <div className="center-canvas">
          {/* Inline axis suggestions — shown when agent suggests axes */}
          <InlineAxisSuggestions onApply={handleApplyAxes} />

          <div
            className="canvas-container"
          >
            {/* Dynamic Island — agent notifications, floats over canvas */}
            <DynamicIsland />
            {/* Design Brief floating overlay */}
            <DesignBriefOverlay />
            {/* Conditionally render 2D or 3D canvas */}
            {is3DMode ? (
              <SemanticCanvas3D
                onSelectionChange={React.useCallback((_x: number, _y: number, _count: number) => {
                  // Selection tracking handled by store (selectedImageIds)
                  // FloatingActionPanel removed — actions now in RightInspector
                }, [])}
              />
            ) : (
              <SemanticCanvas
                onSelectionChange={React.useCallback((_x: number, _y: number, _count: number) => {
                  // Selection tracking handled by store (selectedImageIds)
                }, [])}
                onMiddleClick={React.useCallback((x: number, y: number) => {
                  setRadialDialPos({ x, y });
                  setShowRadialDial(true);
                }, [])}
              />
            )}

            {/* FloatingActionPanel removed — actions now in RightInspector */}

            {/* Prompt Dialog */}
            {showPromptDialog && promptDialogImages.length > 0 && (
              <PromptDialog
                referenceImages={promptDialogImages}
                onClose={() => {
                  setPromptDialogImageId(null);
                  setShowPromptDialog(false);
                  clearSelection();
                }}
                onGenerate={handlePromptDialogGenerate}
              />
            )}

            {/* Batch Prompt Dialog */}
            {showBatchPromptDialog && (
              <BatchPromptDialog
                onClose={() => setShowBatchPromptDialog(false)}
                onGenerate={handleBatchGenerate}
              />
            )}

            {/* External Image Loader Dialog */}
            {showExternalImageLoader && (
              <ExternalImageLoader
                onClose={() => setShowExternalImageLoader(false)}
                onLoad={(shoes, references) => handleLoadExternalImages(shoes, references)}
              />
            )}

            {/* Text-to-Image Dialog */}
            {showTextToImageDialog && (
              <TextToImageDialog
                onClose={() => setShowTextToImageDialog(false)}
                onGenerate={async (prompt, count) => {
                  setShowTextToImageDialog(false);
                  setIsGenerating(true);
                  useProgressStore
                    .getState()
                    .showProgress(
                      "generating",
                      `Generating ${count} image${count > 1 ? "s" : ""}...`,
                      true
                    );
                  useProgressStore.getState().updateProgress(0);

                  try {
                    if (!falClient.isConfigured()) {
                      alert(
                        "fal.ai API key not configured. Please set VITE_FAL_API_KEY in your .env file."
                      );
                      setIsGenerating(false);
                      useProgressStore.getState().hideProgress();
                      return;
                    }

                    useProgressStore
                      .getState()
                      .updateProgress(10, "Generating with fal.ai...");
                    const result = await falClient.generateTextToImage({
                      prompt,
                      num_images: count,
                      aspect_ratio: "1:1",
                      output_format: "jpeg",
                    });

                    useProgressStore
                      .getState()
                      .updateProgress(60, "Computing embeddings...");
                    const addResult = await apiClient.addExternalImages({
                      images: result.images.map((img) => ({ url: img.url })),
                      prompt: prompt,
                      generation_method: "batch",
                      remove_background: removeBackground,
                    });

                    useProgressStore
                      .getState()
                      .updateProgress(90, "Updating canvas...");
                    const state = await apiClient.getState();
                    setImages(state.images);
                    setHistoryGroups(state.history_groups);

                    // Auto-select newly generated images + assign to shoes layer
                    if (addResult?.images?.length > 0) {
                      const newIds = addResult.images.map((img: any) => img.id);
                      useAppStore.getState().setSelectedImageIds(newIds);
                      useAppStore.getState().setImagesLayer(newIds, 'default');
                    }

                    addToExplorationCounter(count);
                    addToAxisSuggestionCounter(count);
                    triggerConcurrentGhosts(prompt, [], []).catch(console.error);

                    useProgressStore.getState().updateProgress(100);
                  } catch (error) {
                    console.error("Generation failed:", error);
                    useProgressStore.getState().hideProgress();
                    alert(
                      `Generation failed: ${
                        error instanceof Error ? error.message : "Unknown error"
                      }`
                    );
                  } finally {
                    setIsGenerating(false);
                    useProgressStore.getState().hideProgress();
                  }
                }}
              />
            )}

          </div>
        </div>

        {/* Right Inspector */}
        <RightInspector
          showLabels={showLabels}
          showGrid={showGrid}
          showClusters={showClusters}
          backgroundColor={backgroundColor}
          onToggleLabels={() => setShowLabels(!showLabels)}
          onToggleGrid={() => setShowGrid(!showGrid)}
          onToggleClusters={() => setShowClusters(!showClusters)}
          onBackgroundColorChange={setBackgroundColor}
          onGenerateFromReference={() => {
            handleGenerateFromReferenceClick();
          }}
          onRemoveSelected={() => {
            selectedImageIds.forEach((id) => {
              useAppStore.getState().removeImage(id);
            });
            clearSelection();
          }}
        />

        {/* Bottom Drawer */}
        <BottomDrawer />
        {/* Layers Sidebar — grid-row 3, grid-col 3, flush with inspector */}
        <LayersSidebar />
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        showLabels={showLabels}
        backgroundColor={backgroundColor}
        onToggleLabels={() => setShowLabels(!showLabels)}
        onBackgroundColorChange={setBackgroundColor}
        onExportZip={handleExportZip}
        ghostCount={ghostCount}
        onGhostCountChange={setGhostCount}
      />

      <ExplorationTreeModal
        isOpen={showExplorationTreeModal}
        onClose={() => setShowExplorationTreeModal(false)}
      />

      {/* Radial Dial (global actions: Space or middle-click) */}
      <RadialDial
        x={radialDialPos.x}
        y={radialDialPos.y}
        isOpen={showRadialDial}
        onClose={() => setShowRadialDial(false)}
        actions={[
          {
            id: "generate",
            icon: "✨",
            label: "Generate",
            description:
              selectedImageIds.length > 0
                ? `Generate from ${selectedImageIds.length} selected reference(s)`
                : "Generate images from text",
            category: "image",
            onClick: () =>
              selectedImageIds.length > 0
                ? handleGenerateFromReferenceClick()
                : setShowTextToImageDialog(true),
          },
          {
            id: "load",
            icon: "📁",
            label: "Load Files",
            description: "Load images from disk",
            category: "system",
            onClick: () => setShowExternalImageLoader(true),
          },
          {
            id: "explore-canvas",
            icon: "🔭",
            label: "Explore Canvas",
            description: "AI suggests unexplored design areas",
            category: "agentic",
            onClick: () => triggerExplorationGhosts(),
          },
          {
            id: "analyze-axis",
            icon: "📐",
            label: "Suggest Axes",
            description: "Suggest alternative axis labels",
            category: "agentic",
            onClick: () => triggerAxisSuggestions(),
          },
          {
            id: "exploration-tree",
            icon: "🌳",
            label: "Exploration Tree",
            description: "Full genealogy graph of all images",
            category: "global",
            onClick: () => setShowExplorationTreeModal(true),
          },
          {
            id: "delete",
            icon: "🗑️",
            label: "Delete",
            description:
              selectedImageIds.length > 0
                ? `Remove ${selectedImageIds.length} selected image(s)`
                : "Clear all images from canvas",
            category: "global",
            onClick: () => {
              if (selectedImageIds.length > 0) {
                if (
                  window.confirm(
                    `Remove ${selectedImageIds.length} selected image(s) from the canvas?`
                  )
                ) {
                  selectedImageIds.forEach((id) => {
                    useAppStore.getState().removeImage(id);
                  });
                  clearSelection();
                }
              } else {
                if (
                  window.confirm("Clear all images from the canvas?")
                ) {
                  handleClearCanvas();
                }
              }
            },
          },
          {
            id: "settings",
            icon: "🔧",
            label: "Settings",
            description: "App & visual preferences",
            category: "global",
            onClick: () => setShowSettingsModal(true),
          },
        ]}
      />
    </>
  );
};
