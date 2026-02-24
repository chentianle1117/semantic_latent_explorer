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
import { ConfirmDialog } from "./components/ConfirmDialog/ConfirmDialog";
import { OnboardingTour } from "./components/OnboardingTour/OnboardingTour";
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

  // Native confirm dialog (replaces window.confirm)
  const [confirmState, setConfirmState] = useState<{
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);
  const showConfirm = (
    message: string,
    onConfirm: () => void,
    opts?: { confirmLabel?: string; danger?: boolean }
  ) => setConfirmState({ message, onConfirm, ...opts });
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
  const mergeImages = useAppStore((state) => state.mergeImages);
  const setHistoryGroups = useAppStore((state) => state.setHistoryGroups);
  const addHistoryGroup = useAppStore((state) => state.addHistoryGroup);
  const setIsInitialized = useAppStore((state) => state.setIsInitialized);
  const resetCanvasBounds = useAppStore((state) => state.resetCanvasBounds);
  const setIsGenerating = useAppStore((state) => state.setIsGenerating);
  const setGenerationProgress = useAppStore(
    (state) => state.setGenerationProgress
  );
  const clearSelection = useAppStore((state) => state.clearSelection);
  const addToExplorationCounter = useAppStore((state) => state.addToExplorationCounter);
  const addToAxisSuggestionCounter = useAppStore((state) => state.addToAxisSuggestionCounter);

  // Onboarding
  const completeOnboardingStep = useAppStore((s) => s.completeOnboardingStep);

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
        ]).then(async ([session, { sessions }]) => {
          useAppStore.getState().setCurrentCanvasId(session.canvasId);
          useAppStore.getState().setCanvasName(session.canvasName);
          useAppStore.getState().setParticipantId(session.participantId);
          useAppStore.getState().setCanvasList(sessions);

          // Load per-canvas onboarding progress from localStorage
          useAppStore.getState().loadOnboardingState(session.canvasId);

          // Auto-import starter canvas if empty + not already done
          const starterKey = `starterLoaded_${session.canvasId}`;
          const currentImages = useAppStore.getState().images;
          if (currentImages.length === 0 && !localStorage.getItem(starterKey)) {
            try {
              const res = await fetch('/api/import-starter', { method: 'POST' });
              if (res.ok) {
                const starterJson = await res.json().catch(() => null);
                localStorage.setItem(starterKey, 'true');
                const freshState = await apiClient.getState();
                useAppStore.getState().setImages(freshState.images ?? []);
                useAppStore.getState().setHistoryGroups(freshState.history_groups ?? []);
                if (freshState.axis_labels) useAppStore.getState().setAxisLabels(freshState.axis_labels);
                useAppStore.getState().resetCanvasBounds();
                // Apply design_brief from starter if returned
                if (starterJson?.design_brief) {
                  useAppStore.getState().setDesignBrief(starterJson.design_brief);
                }
                console.log('[Onboarding] Starter canvas imported');
              }
            } catch {
              // Starter not available — proceed with empty canvas
            }
          }

          // Tutorial starts on-demand via "?" button — no auto-start on page load
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

  const handleClearCanvas = () => {
    showConfirm(
      "Clear ALL images from canvas? This cannot be undone.",
      async () => {
        try {
          await apiClient.clearCanvas();
          const state = await apiClient.getState();
          setImages(state.images);
          setHistoryGroups(state.history_groups);
          clearSelection();
          useAppStore.getState().clearDeletedStack();
        } catch (error) {
          console.error("Clear failed:", error);
        }
      },
      { confirmLabel: "Clear All", danger: true }
    );
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

        // Assign generated images to shoes layer + auto-add to isolate set
        if (batchResult?.images?.length > 0) {
          const newIds = batchResult.images.map((img: any) => img.id);
          useAppStore.getState().setImagesLayer(newIds, 'default');
          const curIsolated = useAppStore.getState().isolatedImageIds;
          if (curIsolated !== null) {
            useAppStore.getState().setIsolatedImageIds([...curIsolated, ...newIds]);
          }
        }

        console.log(`✓ Added to canvas (${i + 1}/${totalPrompts})`);
        successCount++;
        addToExplorationCounter(countPerPrompt);
        addToAxisSuggestionCounter(countPerPrompt);
        triggerConcurrentGhosts(prompt, [], []).catch(console.error);

        // Merge only new images into store (avoids full state round-trip)
        useProgressStore
          .getState()
          .updateProgress(
            overallProgress + (100 / totalPrompts) * 0.5,
            "Updating canvas..."
          );
        mergeImages(batchResult.images);
        if (batchResult.history_group) addHistoryGroup(batchResult.history_group);
      } catch (error) {
        console.error(`✗ Failed prompt ${i + 1}:`, error);
        failCount++;

        // Auto-continue on individual prompt failure; summary shown at end
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
    const ps = useProgressStore.getState();
    ps.showProgress("loading", `Loading ${total} image${total > 1 ? "s" : ""}...`, true);
    ps.updateProgress(0);

    const stepList = [];
    if (shoes.length > 0) stepList.push({ id: 'shoes', label: `Load ${shoes.length} shoe image${shoes.length > 1 ? 's' : ''} (bg removal)`, status: 'active' as const });
    if (references.length > 0) stepList.push({ id: 'refs', label: `Load ${references.length} reference image${references.length > 1 ? 's' : ''}`, status: shoes.length > 0 ? 'pending' as const : 'active' as const });
    stepList.push({ id: 'project', label: 'Embed with CLIP & project to canvas', status: 'pending' as const });
    ps.setSteps(stepList);
    ps.addLogLine(`Loading ${total} image${total > 1 ? 's' : ''} (${shoes.length} shoes, ${references.length} refs)`);

    const allNewIds: number[] = [];
    try {
      // Load shoes (background removal ON → default/Shoes layer)
      if (shoes.length > 0) {
        ps.addLogLine(`Uploading ${shoes.length} shoe image${shoes.length > 1 ? 's' : ''} for bg removal + CLIP embed...`);
        const shoeResult = await apiClient.addExternalImages({
          images: shoes.map((url) => ({ url })),
          prompt: "Shoe images",
          generation_method: "dataset",
          remove_background: true,
        });
        if (shoeResult.images?.length) {
          const ids = shoeResult.images.map((img: any) => img.id);
          allNewIds.push(...ids);
          mergeImages(shoeResult.images);
          if (shoeResult.history_group) addHistoryGroup(shoeResult.history_group);
          useAppStore.getState().setImagesLayer(ids, "default");
          ps.addLogLine(`✓ ${ids.length} shoe image${ids.length > 1 ? 's' : ''} embedded (ids: ${ids.slice(0,4).join(', ')}${ids.length > 4 ? '…' : ''})`);
        }
        ps.updateProgress(40);
        ps.updateStepStatus('shoes', 'done');
        if (references.length > 0) ps.updateStepStatus('refs', 'active');
        else ps.updateStepStatus('project', 'active');
      }

      // Load references (background removal OFF → references layer)
      if (references.length > 0) {
        ps.addLogLine(`Uploading ${references.length} reference image${references.length > 1 ? 's' : ''} (no bg removal)...`);
        const refResult = await apiClient.addExternalImages({
          images: references.map((url) => ({ url })),
          prompt: "Reference images",
          generation_method: "external",
          remove_background: false,
        });
        if (refResult.images?.length) {
          const ids = refResult.images.map((img: any) => img.id);
          allNewIds.push(...ids);
          mergeImages(refResult.images);
          if (refResult.history_group) addHistoryGroup(refResult.history_group);
          useAppStore.getState().setImagesLayer(ids, "references");
          ps.addLogLine(`✓ ${ids.length} reference image${ids.length > 1 ? 's' : ''} embedded`);
        }
        ps.updateProgress(75);
        ps.updateStepStatus('refs', 'done');
        ps.updateStepStatus('project', 'active');
      }

      ps.addLogLine('All embeddings projected to semantic axes.');
      resetCanvasBounds();
      // Only auto-select if no generation dialog is open (guard against contaminating active selections)
      const dialogOpen = showPromptDialog || showBatchPromptDialog || showExternalImageLoader;
      if (allNewIds.length > 0 && !dialogOpen) {
        useAppStore.getState().setSelectedImageIds(allNewIds);
        const curIsolated = useAppStore.getState().isolatedImageIds;
        if (curIsolated !== null) {
          useAppStore.getState().setIsolatedImageIds([...curIsolated, ...allNewIds]);
        }
      }

      ps.addLogLine(`✓ All ${total} image${total > 1 ? 's' : ''} placed on canvas`);
      ps.updateStepStatus('project', 'done');
      ps.updateProgress(100);
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
    const ps = useProgressStore.getState();
    ps.showProgress("generating", `Generating ${numImages} image${numImages > 1 ? "s" : ""} from reference...`, true);
    ps.updateProgress(0);
    ps.setSteps([
      { id: 'upload',  label: `Upload ${referenceIds.length} reference image${referenceIds.length > 1 ? 's' : ''}`, status: 'active' },
      { id: 'gen',     label: `Generate ${numImages} variation${numImages > 1 ? 's' : ''} via fal.ai`, status: 'pending' },
      { id: 'embed',   label: 'Embed with Jina CLIP v2', status: 'pending' },
      { id: 'project', label: 'Project to semantic canvas', status: 'pending' },
    ]);
    ps.addLogLine(`Prompt: "${prompt.substring(0, 60)}${prompt.length > 60 ? '…' : ''}"`);
    ps.addLogLine(`Using ${referenceIds.length} reference image${referenceIds.length > 1 ? 's' : ''} as conditioning`);

    try {
      const selectedImages = images.filter((img) =>
        referenceIds.includes(img.id)
      );

      if (selectedImages.length === 0) {
        throw new Error("No reference images found");
      }

      // Convert base64 images to fal.ai URLs
      const imageUrls: string[] = [];
      for (let i = 0; i < selectedImages.length; i++) {
        const img = selectedImages[i];
        ps.addLogLine(`Uploading reference ${i + 1}/${selectedImages.length} (id=${img.id})...`);
        const base64Data = img.base64_image;
        const blob = await (await fetch(`data:image/png;base64,${base64Data}`)).blob();
        const file = new File([blob], `reference-${img.id}.png`, { type: "image/png" });
        const url = await falClient.uploadFile(file);
        imageUrls.push(url);
        ps.addLogLine(`✓ Uploaded reference ${i + 1}/${selectedImages.length}`);
      }
      ps.updateProgress(20);
      ps.updateStepStatus('upload', 'done');
      ps.updateStepStatus('gen', 'active');

      ps.addLogLine(`Generating ${numImages} variation${numImages > 1 ? 's' : ''} via fal.ai...`);
      const result = await falClient.generateImageEdit({
        prompt,
        image_urls: imageUrls,
        num_images: numImages,
        aspect_ratio: "1:1",
        output_format: "jpeg",
      });
      ps.addLogLine(`✓ fal.ai returned ${result.images.length} image${result.images.length > 1 ? 's' : ''}`);
      ps.updateProgress(50);
      ps.updateStepStatus('gen', 'done');
      ps.updateStepStatus('embed', 'active');

      const parentIds = selectedImages.map((img) => img.id);
      ps.addLogLine(`Embedding ${result.images.length} image${result.images.length > 1 ? 's' : ''} with Jina CLIP v2...`);
      if (removeBackground) ps.addLogLine('Background removal enabled — processing...');
      const addResult = await apiClient.addExternalImages({
        images: result.images.map((img) => ({ url: img.url })),
        prompt: prompt,
        generation_method: "reference",
        remove_background: removeBackground,
        parent_ids: parentIds,
      });
      ps.addLogLine(`✓ CLIP embeddings computed (1024-dim), genealogy tracked`);
      ps.updateProgress(80);
      ps.updateStepStatus('embed', 'done');
      ps.updateStepStatus('project', 'active');

      addToExplorationCounter(numImages);
      addToAxisSuggestionCounter(numImages);
      triggerConcurrentGhosts(prompt, parentIds, imageUrls).catch(console.error);

      ps.addLogLine('Embeddings projected to semantic axes.');
      mergeImages(addResult.images);
      if (addResult.history_group) addHistoryGroup(addResult.history_group);

      if (addResult?.images?.length > 0) {
        const newIds = addResult.images.map((img: any) => img.id);
        useAppStore.getState().setSelectedImageIds(newIds);
        useAppStore.getState().setImagesLayer(newIds, 'default');
        const curIsolated = useAppStore.getState().isolatedImageIds;
        if (curIsolated !== null) {
          useAppStore.getState().setIsolatedImageIds([...curIsolated, ...newIds]);
        }
        ps.addLogLine(`✓ ${newIds.length} image${newIds.length > 1 ? 's' : ''} placed on canvas (parents: [${parentIds.join(', ')}])`);
      }
      ps.updateStepStatus('project', 'done');
      ps.updateProgress(100);
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

  // ─── Onboarding: radial dial opened → complete b-dial-intro ────────────────
  useEffect(() => {
    if (showRadialDial) completeOnboardingStep('b-dial-intro');
  }, [showRadialDial, completeOnboardingStep]);

  // ─── Onboarding: exploration tree opened → complete c-tree ────────────
  useEffect(() => {
    if (showExplorationTreeModal) completeOnboardingStep('c-tree');
  }, [showExplorationTreeModal, completeOnboardingStep]);

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
            data-tour="canvas"
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
                  const ps = useProgressStore.getState();
                  ps.showProgress("generating", `Generating ${count} image${count > 1 ? "s" : ""}...`, true);
                  ps.updateProgress(0);
                  ps.setSteps([
                    { id: 'gen',     label: `Generate ${count} image${count > 1 ? 's' : ''} via fal.ai`, status: 'active' },
                    { id: 'embed',   label: `Embed with Jina CLIP v2`, status: 'pending' },
                    { id: 'project', label: 'Project to semantic canvas', status: 'pending' },
                  ]);
                  ps.addLogLine(`Prompt: "${prompt.substring(0, 60)}${prompt.length > 60 ? '…' : ''}"`);

                  try {
                    if (!falClient.isConfigured()) {
                      alert(
                        "fal.ai API key not configured. Please set VITE_FAL_API_KEY in your .env file."
                      );
                      setIsGenerating(false);
                      useProgressStore.getState().hideProgress();
                      return;
                    }

                    ps.addLogLine(`Requesting ${count} image${count > 1 ? 's' : ''} from fal.ai nano-banana...`);
                    const result = await falClient.generateTextToImage({
                      prompt,
                      num_images: count,
                      aspect_ratio: "1:1",
                      output_format: "jpeg",
                    });
                    ps.addLogLine(`✓ fal.ai returned ${result.images.length} image${result.images.length > 1 ? 's' : ''}`);
                    ps.updateProgress(40);
                    ps.updateStepStatus('gen', 'done');
                    ps.updateStepStatus('embed', 'active');

                    ps.addLogLine(`Embedding ${result.images.length} image${result.images.length > 1 ? 's' : ''} with Jina CLIP v2...`);
                    if (removeBackground) ps.addLogLine('Background removal enabled — processing...');
                    const addResult = await apiClient.addExternalImages({
                      images: result.images.map((img) => ({ url: img.url })),
                      prompt: prompt,
                      generation_method: "batch",
                      remove_background: removeBackground,
                    });
                    ps.addLogLine(`✓ CLIP embeddings computed (1024-dim)`);
                    ps.updateProgress(75);
                    ps.updateStepStatus('embed', 'done');
                    ps.updateStepStatus('project', 'active');

                    ps.addLogLine('Embeddings projected to semantic axes.');
                    mergeImages(addResult.images);
                    if (addResult.history_group) addHistoryGroup(addResult.history_group);

                    // Auto-select newly generated images + assign to shoes layer
                    if (addResult?.images?.length > 0) {
                      const newIds = addResult.images.map((img: any) => img.id);
                      useAppStore.getState().setSelectedImageIds(newIds);
                      useAppStore.getState().setImagesLayer(newIds, 'default');
                      const curIsolated = useAppStore.getState().isolatedImageIds;
                      if (curIsolated !== null) {
                        useAppStore.getState().setIsolatedImageIds([...curIsolated, ...newIds]);
                      }
                      ps.addLogLine(`✓ ${newIds.length} image${newIds.length > 1 ? 's' : ''} placed on canvas`);
                    }
                    ps.updateStepStatus('project', 'done');

                    addToExplorationCounter(count);
                    addToAxisSuggestionCounter(count);
                    triggerConcurrentGhosts(prompt, [], []).catch(console.error);

                    ps.updateProgress(100);
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

        {/* Right column: Inspector + LayersSidebar stacked, independent expand */}
        <div className="right-column">
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
              const ids = [...selectedImageIds];
              showConfirm(
                `Remove ${ids.length} selected image${ids.length !== 1 ? "s" : ""} from canvas?`,
                () => {
                  ids.forEach((id) => {
                    useAppStore.getState().removeImage(id);
                    apiClient.deleteImage(id).catch(() => {});
                  });
                  clearSelection();
                },
                { confirmLabel: "Remove", danger: true }
              );
            }}
          />
          <LayersSidebar />
        </div>

        {/* Bottom Drawer */}
        <BottomDrawer />
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
            id: "isolate",
            icon: "◎",
            label: selectedImageIds.length > 0
              ? (useAppStore.getState().isolatedImageIds !== null ? "Unhide All" : `Isolate ${selectedImageIds.length}`)
              : (useAppStore.getState().isolatedImageIds !== null ? "Unhide All" : "Isolate"),
            description: useAppStore.getState().isolatedImageIds !== null
              ? "Exit isolate mode — show all images"
              : selectedImageIds.length > 0
                ? `Show only ${selectedImageIds.length} selected image(s)`
                : "Select shoes first to isolate them",
            category: "global",
            onClick: () => {
              const store = useAppStore.getState();
              if (store.isolatedImageIds !== null) {
                store.setIsolatedImageIds(null);
              } else if (selectedImageIds.length > 0) {
                store.setIsolatedImageIds([...selectedImageIds]);
              }
            },
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
                const ids = [...selectedImageIds];
                showConfirm(
                  `Remove ${ids.length} selected image${ids.length !== 1 ? "s" : ""} from canvas?`,
                  () => {
                    ids.forEach((id) => {
                      useAppStore.getState().removeImage(id);
                      apiClient.deleteImage(id).catch(() => {});
                    });
                    clearSelection();
                  },
                  { confirmLabel: "Remove", danger: true }
                );
              } else {
                handleClearCanvas();
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

      {/* Native confirm dialog — replaces window.confirm() */}
      <ConfirmDialog
        isOpen={confirmState !== null}
        message={confirmState?.message ?? ""}
        confirmLabel={confirmState?.confirmLabel}
        danger={confirmState?.danger}
        onConfirm={() => {
          confirmState?.onConfirm();
          setConfirmState(null);
        }}
        onCancel={() => setConfirmState(null)}
      />

      {/* Onboarding Tutorial Overlay */}
      <OnboardingTour />
    </>
  );
};
