import React, { useEffect, useState, useRef } from "react";
import { SemanticCanvas } from "./components/Canvas/SemanticCanvas";
import { SemanticCanvas3D } from "./components/Canvas/SemanticCanvas3D";
import { PromptDialog } from "./components/PromptDialog/PromptDialog";
// FloatingActionPanel removed — actions moved to RightInspector
import { ProgressModal } from "./components/ProgressModal/ProgressModal";
import { HeaderBar } from "./components/HeaderBar/HeaderBar";
import { RightInspector } from "./components/RightInspector/RightInspector";
import { BottomDrawer } from "./components/BottomDrawer/BottomDrawer";
import { SettingsModal } from "./components/SettingsModal/SettingsModal";
import { useProgressStore } from "./store/progressStore";
import { BatchPromptDialog } from "./components/BatchPromptDialog/BatchPromptDialog";
import { ExternalImageLoader } from "./components/ExternalImageLoader/ExternalImageLoader";
import { StarterPromptsModal } from "./components/StarterPromptsModal/StarterPromptsModal";
import { AxisSuggestionModal } from "./components/AxisSuggestionModal/AxisSuggestionModal";
import { RegionPromptDialog } from "./components/RegionPromptDialog/RegionPromptDialog";
import { TextToImageDialog } from "./components/TextToImageDialog/TextToImageDialog";
import { RadialDial } from "./components/RadialDial/RadialDial";
import { ExplorationTreeModal } from "./components/ExplorationTreeModal/ExplorationTreeModal";
import { AgentToast } from "./components/AgentToast/AgentToast";
import { useAgentObserver } from "./hooks/useAgentObserver";
import { useAppStore } from "./store/appStore";
import { apiClient } from "./api/client";
import { falClient } from "./api/falClient";
import type {
  SuggestedPrompt,
  RegionHighlight,
  PendingImage,
} from "./types";
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
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    currentPrompt: string;
  } | null>(null);
  const [regionPromptDialog, setRegionPromptDialog] = useState<{
    prompt: string;
    region: RegionHighlight;
  } | null>(null);

  // Agent/AI state
  const [currentBrief, setCurrentBrief] = useState<string | null>(null);
  const [suggestedPrompts, setSuggestedPrompts] = useState<SuggestedPrompt[]>(
    []
  );
  const [regionHighlights, setRegionHighlights] = useState<RegionHighlight[]>(
    []
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [showAxisSuggestionModal, setShowAxisSuggestionModal] = useState(false);
  const [axisSuggestions, setAxisSuggestions] = useState<
    Array<{ x_axis: string; y_axis: string; reasoning: string }>
  >([]);
  const [isLoadingAxes, setIsLoadingAxes] = useState(false);
  const [unexpectedImagesCount, setUnexpectedImagesCount] = useState(2); // Number of additional unexpected images to generate (0-8)
  const [showLabels, setShowLabels] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showClusters, setShowClusters] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState("#0d1117");
  const [showRadialDial, setShowRadialDial] = useState(false);
  const [radialDialPos, setRadialDialPos] = useState({ x: 0, y: 0 });
  const [showExplorationTreeModal, setShowExplorationTreeModal] = useState(false);
  const [selectedGhost, setSelectedGhost] = useState<any>(null);
  const lastMousePosRef = useRef({
    x: typeof window !== "undefined" ? window.innerWidth / 2 : 400,
    y: typeof window !== "undefined" ? window.innerHeight / 2 : 300,
  });

  const images = useAppStore((state) =>
    state.images.filter((img) => img.visible)
  );
  const selectedImageIds = useAppStore((state) => state.selectedImageIds);
  const isInitialized = useAppStore((state) => state.isInitialized);
  const isGenerating = useAppStore((state) => state.isGenerating);
  const removeBackground = useAppStore((state) => state.removeBackground);
  const is3DMode = useAppStore((state) => state.is3DMode);

  // Mount passive observer agent
  useAgentObserver({ brief: currentBrief });

  const setImages = useAppStore((state) => state.setImages);
  const setHistoryGroups = useAppStore((state) => state.setHistoryGroups);
  const setIsInitialized = useAppStore((state) => state.setIsInitialized);
  const resetCanvasBounds = useAppStore((state) => state.resetCanvasBounds);
  const setIsGenerating = useAppStore((state) => state.setIsGenerating);
  const setGenerationProgress = useAppStore(
    (state) => state.setGenerationProgress
  );
  const setGenerationCount = useAppStore((state) => state.setGenerationCount);
  const clearSelection = useAppStore((state) => state.clearSelection);

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

  const handleGenerate = async () => {
    const prompt = window.prompt("Enter prompt for image generation:");
    if (!prompt) return;

    const count = window.prompt("How many images? (1-20)", "8");
    const nImages = parseInt(count || "8", 10);

    if (isNaN(nImages) || nImages < 1 || nImages > 20) {
      alert("Invalid count. Please enter a number between 1 and 20.");
      return;
    }

    // Check if fal.ai is configured
    if (!falClient.isConfigured()) {
      alert(
        "fal.ai API key not configured. Please set VITE_FAL_API_KEY in your .env file."
      );
      return;
    }

    // Inform user about batching for fal.ai
    if (nImages > 4) {
      const numBatches = Math.ceil(nImages / 4);
      console.log(
        `ℹ️ Generating ${nImages} images in ${numBatches} batches (fal.ai limit: 4 per request)`
      );
    }

    setIsGenerating(true);
    useProgressStore
      .getState()
      .showProgress(
        "generating",
        `Generating ${nImages} image${nImages > 1 ? "s" : ""}...`,
        true
      );
    useProgressStore.getState().updateProgress(0);

    try {
      useProgressStore
        .getState()
        .updateProgress(10, "Generating with fal.ai...");
      const result = await falClient.generateTextToImage({
        prompt,
        num_images: nImages,
        aspect_ratio: "1:1",
        output_format: "jpeg",
      });

      console.log("fal.ai generation result:", result);

      // Send images to backend for CLIP embedding extraction
      useProgressStore.getState().updateProgress(60, "Computing embeddings...");
      const addResult = await apiClient.addExternalImages({
        images: result.images.map((img) => ({ url: img.url })),
        prompt: prompt,
        generation_method: "batch",
        remove_background: removeBackground,
      });

      console.log(`✓ Added ${result.images.length} fal.ai images to canvas`);

      // Fetch updated state since we're not using WebSocket
      useProgressStore.getState().updateProgress(90, "Updating canvas...");
      const state = await apiClient.getState();
      setImages(state.images);
      setHistoryGroups(state.history_groups);

      // Auto-recenter canvas and select the newly generated images
      resetCanvasBounds();
      if (addResult.images && addResult.images.length > 0) {
        useAppStore.getState().setSelectedImageIds(addResult.images.map((img) => img.id));
      }

      useProgressStore.getState().updateProgress(100);

      // Auto-generate variations if brief is set
      if (currentBrief && unexpectedImagesCount > 0) {
        console.log(
          `🎨 Generating ${unexpectedImagesCount} variations in background...`
        );
        useProgressStore
          .getState()
          .updateProgress(100, "Generating variations...");
        try {
          const variationResponse = await apiClient.generateVariation(
            prompt,
            currentBrief,
            unexpectedImagesCount
          );
          console.log("Generated variations:", variationResponse.variations);

          // Generate images for each variation in background
          for (const variation of variationResponse.variations) {
            const varResult = await falClient.generateTextToImage({
              prompt: variation.prompt,
              num_images: 1,
              aspect_ratio: "1:1",
              output_format: "jpeg",
            });

            // Add to backend to get embeddings
            await apiClient.addExternalImages({
              images: varResult.images.map((img) => ({ url: img.url })),
              prompt: variation.prompt,
              generation_method: "variation",
              remove_background: removeBackground,
            });

            // Get the newly added image from state
            const updatedState = await apiClient.getState();
            const newImage =
              updatedState.images[updatedState.images.length - 1];

            // Add to pending images list
            setPendingImages((prev) => [
              ...prev,
              {
                id: `pending-${Date.now()}-${Math.random()}`,
                imageData: newImage,
                originalPrompt: prompt,
                variation: variation,
                isPending: true,
              },
            ]);
          }

          console.log("✓ Variations generated in background");
        } catch (error) {
          console.error("Failed to generate variations:", error);
        }
      }
    } catch (error) {
      console.error("Prompt generation failed:", error);
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
        await apiClient.addExternalImages({
          images: result.images.map((img) => ({ url: img.url })),
          prompt: prompt,
          generation_method: "batch",
          remove_background: removeBackground,
        });

        console.log(`✓ Added to canvas (${i + 1}/${totalPrompts})`);
        successCount++;

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
    setBatchProgress(null);
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

    // Auto-generate variations for first few prompts if brief is set
    if (currentBrief && successCount > 0 && unexpectedImagesCount > 0) {
      console.log(
        `🎨 Generating ${unexpectedImagesCount} auto-variations per prompt...`
      );
      const promptsToVary = prompts.slice(0, Math.min(3, prompts.length)); // Only first 3 to avoid spam

      for (const prompt of promptsToVary) {
        try {
          const variations = await apiClient.generateVariation(
            prompt,
            currentBrief,
            unexpectedImagesCount
          );
          console.log(
            `Generated ${
              variations.variations.length
            } variations for: "${prompt.substring(0, 30)}..."`
          );

          for (const variation of variations.variations) {
            try {
              const result = await falClient.generateTextToImage({
                prompt: variation.prompt,
                num_images: 1,
                aspect_ratio: "1:1",
                output_format: "jpeg",
              });

              const imageData = await apiClient.addExternalImages({
                images: result.images.map((img) => ({ url: img.url })),
                prompt: variation.prompt,
                generation_method: "auto-variation",
                remove_background: removeBackground,
              });

              // Add to pending images with accept/discard controls
              setPendingImages((prev) => [
                ...prev,
                {
                  id: `pending-${Date.now()}-${Math.random()}`,
                  imageData: imageData.images[0],
                  originalPrompt: prompt,
                  variation: variation,
                  isPending: true,
                },
              ]);
            } catch (error) {
              console.error("Failed to generate variation image:", error);
            }
          }
        } catch (error) {
          console.error("Failed to generate variations:", error);
        }
      }

      // Note: Canvas analysis is now manual-only (triggered via button)
      // Auto-generation of unexpected images remains active
    }
  };

  const handleLoadExternalImages = async (urls: string[], prompt: string) => {
    console.log(`📥 Loading ${urls.length} external images...`);
    setShowExternalImageLoader(false);
    setIsGenerating(true);
    useProgressStore
      .getState()
      .showProgress(
        "loading",
        `Loading ${urls.length} image${urls.length > 1 ? "s" : ""}...`,
        true
      );
    useProgressStore.getState().updateProgress(0);

    try {
      // Send all images in a single request so they form one history group/batch
      console.log(`📦 Sending all ${urls.length} images as one batch...`);
      const importResult = await apiClient.addExternalImages({
        images: urls.map((url) => ({ url })),
        prompt: prompt,
        generation_method: "external",
        remove_background: removeBackground,
      });

      useProgressStore.getState().updateProgress(80, "Updating canvas...");

      const state = await apiClient.getState();
      setImages(state.images);
      setHistoryGroups(state.history_groups);

      // Auto-recenter canvas and select the newly imported images
      resetCanvasBounds();
      if (importResult.images && importResult.images.length > 0) {
        useAppStore.getState().setSelectedImageIds(importResult.images.map((img) => img.id));
      }

      console.log(`✓ All ${urls.length} images loaded successfully`);
      useProgressStore.getState().updateProgress(100, "Complete");

      alert(`✅ Successfully loaded ${urls.length} images to canvas!`);
    } catch (error) {
      console.error("Failed to load external images:", error);
      useProgressStore.getState().hideProgress();
      alert(
        `Failed to load images: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
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
      await apiClient.addExternalImages({
        images: result.images.map((img) => ({ url: img.url })),
        prompt: prompt,
        generation_method: "reference",
        remove_background: removeBackground,
        parent_ids: parentIds,
      });

      console.log(
        `✓ Added ${result.images.length} fal.ai edited image(s) to canvas with ${parentIds.length} parent(s)`
      );

      // Fetch updated state since we're not using WebSocket
      useProgressStore.getState().updateProgress(90, "Updating canvas...");
      const state = await apiClient.getState();
      setImages(state.images);
      setHistoryGroups(state.history_groups);

      useProgressStore.getState().updateProgress(100);

      // Auto-generate variations if brief is set (only if images were successfully added)
      if (
        currentBrief &&
        unexpectedImagesCount > 0 &&
        state.images.length > 0
      ) {
        console.log(
          `🎨 Generating ${unexpectedImagesCount} variations from reference...`
        );
        useProgressStore
          .getState()
          .updateProgress(100, "Generating variations...");
        try {
          const variations = await apiClient.generateVariation(
            prompt,
            currentBrief,
            unexpectedImagesCount
          );

          for (const variation of variations.variations) {
            try {
              const result = await falClient.generateImageEdit({
                prompt: variation.prompt,
                image_urls: imageUrls, // Reuse the uploaded reference images
                num_images: 1,
                aspect_ratio: "1:1",
                output_format: "jpeg",
              });

              await apiClient.addExternalImages({
                images: result.images.map((img) => ({ url: img.url })),
                prompt: variation.prompt,
                generation_method: "auto-variation",
                remove_background: removeBackground,
                parent_ids: parentIds,
              });

              // Refresh state to get the new image
              const updatedState = await apiClient.getState();
              const newImage =
                updatedState.images[updatedState.images.length - 1];

              setPendingImages((prev) => [
                ...prev,
                {
                  id: `pending-${Date.now()}-${Math.random()}`,
                  imageData: newImage,
                  originalPrompt: prompt,
                  variation: variation,
                  isPending: true,
                },
              ]);
            } catch (error) {
              console.error("Failed to generate variation image:", error);
            }
          }
        } catch (error) {
          console.error("Failed to generate variations:", error);
        }
      }

      clearSelection();
      // }
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

      // Note: Auto-variations and analysis happen after progress modal closes
    }
  };

  // Agent handlers
  const handlePromptsGenerated = async (
    prompts: SuggestedPrompt[],
    brief: string
  ) => {
    setSuggestedPrompts(prompts);
    setCurrentBrief(brief);
    // Persist brief to backend
    try {
      await apiClient.updateDesignBrief(brief);
      console.log("✓ Generated prompts from brief and saved:", brief);
    } catch (error) {
      console.error("Failed to save design brief:", error);
    }
  };

  const handleAcceptPrompt = async (
    prompt: string,
    index: number,
    count: number = 4
  ) => {
    console.log(`Accepting prompt ${index + 1}:`, prompt, `(${count} images)`);
    setSuggestedPrompts([]); // Dismiss banner after accepting

    // Auto-generate with the accepted prompt
    setIsGenerating(true);
    useProgressStore
      .getState()
      .showProgress(
        "generating",
        `Generating ${count} image${count > 1 ? "s" : ""} from suggestion...`,
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

      // Generate using fal.ai
      useProgressStore
        .getState()
        .updateProgress(10, "Generating with fal.ai...");
      const result = await falClient.generateTextToImage({
        prompt,
        num_images: count,
        aspect_ratio: "1:1",
        output_format: "jpeg",
      });

      // Send to backend for CLIP embeddings
      useProgressStore.getState().updateProgress(60, "Computing embeddings...");
      await apiClient.addExternalImages({
        images: result.images.map((img) => ({ url: img.url })),
        prompt: prompt,
        generation_method: "batch",
        remove_background: removeBackground,
      });

      useProgressStore.getState().updateProgress(90, "Updating canvas...");
      const state = await apiClient.getState();
      setImages(state.images);
      setHistoryGroups(state.history_groups);

      useProgressStore.getState().updateProgress(100);

      // Auto-generate variations if brief is set
      if (currentBrief && unexpectedImagesCount > 0) {
        console.log(
          `🎨 Generating ${unexpectedImagesCount} variations for accepted prompt...`
        );
        useProgressStore
          .getState()
          .updateProgress(100, "Generating variations...");
        try {
          const variations = await apiClient.generateVariation(
            prompt,
            currentBrief,
            unexpectedImagesCount
          );

          for (const variation of variations.variations) {
            try {
              const result = await falClient.generateTextToImage({
                prompt: variation.prompt,
                num_images: 1,
                aspect_ratio: "1:1",
                output_format: "jpeg",
              });

              await apiClient.addExternalImages({
                images: result.images.map((img) => ({ url: img.url })),
                prompt: variation.prompt,
                generation_method: "auto-variation",
                remove_background: removeBackground,
              });

              // Refresh state to get the new image
              const updatedState = await apiClient.getState();
              const newImage =
                updatedState.images[updatedState.images.length - 1];

              setPendingImages((prev) => [
                ...prev,
                {
                  id: `pending-${Date.now()}-${Math.random()}`,
                  imageData: newImage,
                  originalPrompt: prompt,
                  variation: variation,
                  isPending: true,
                },
              ]);
            } catch (error) {
              console.error("Failed to generate variation image:", error);
            }
          }
        } catch (error) {
          console.error("Failed to generate variations:", error);
        }
      }

      console.log("✓ Generation complete");
      // Note: Canvas analysis is now manual-only (triggered via button)
      // Auto-generation of unexpected images remains active
    } catch (error) {
      console.error("Generation failed:", error);
      alert(
        `Generation failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setIsGenerating(false);
      setTimeout(() => {
        setGenerationProgress(0);
        setGenerationCount(0, 0);
      }, 1000);
    }
  };

  const handleDismissPrompts = () => {
    setSuggestedPrompts([]);
  };

  const handlePromptSuggestion = async () => {
    const brief = currentBrief || "Explore shoe design variations";
    try {
      useProgressStore
        .getState()
        .showProgress("analyzing", "Generating prompt ideas...", true);
      const result = await apiClient.getInitialPrompts(brief);
      setSuggestedPrompts(result.prompts || []);
      useProgressStore.getState().hideProgress();
      if (!result.prompts?.length) {
        alert("Could not generate prompts. Try adding a design brief in Settings.");
      }
    } catch (error) {
      console.error("Failed to get prompt suggestions:", error);
      useProgressStore.getState().hideProgress();
      alert("Failed to generate prompt ideas. Ensure Gemini API is configured.");
    }
  };

  const suggestGhostNodes = async () => {
    if (images.length < 5) {
      alert("Please generate at least 5 images before suggesting ideas");
      return;
    }

    useProgressStore.getState().showProgress("analyzing", "AI suggesting ideas...", true);
    try {
      const result = await apiClient.suggestGhosts(currentBrief || "Explore shoe designs", 3);

      // Clear existing ghosts and add new ones
      useAppStore.getState().clearGhostNodes();
      result.ghosts.forEach((ghost) => {
        useAppStore.getState().addGhostNode({
          ...ghost,
          isGhost: true,
          suggestedPrompt: ghost.suggested_prompt,
          group_id: `ghost-${ghost.id}`,
          parents: [],
          children: [],
          generation_method: 'batch',
          prompt: ghost.suggested_prompt,
          timestamp: new Date().toISOString(),
          visible: true,
          base64_image: '', // Ghost nodes don't have images yet
        } as any);
      });

      useProgressStore.getState().hideProgress();
      alert(`✨ ${result.ghosts.length} ideas suggested! Click the sparkles on canvas to accept.`);
    } catch (error) {
      console.error("Failed to suggest ghost nodes:", error);
      useProgressStore.getState().hideProgress();
      alert("Failed to generate suggestions. Ensure Gemini API is configured.");
    }
  };

  const analyzeCanvas = async () => {
    if (images.length < 5) {
      console.log("Skipping analysis: too few images (need at least 5)");
      alert("Please generate at least 5 images before analyzing the canvas");
      return;
    }

    setIsAnalyzing(true);
    useProgressStore
      .getState()
      .showProgress("analyzing", "AI analyzing canvas...", true);
    try {
      console.log("🔍 Fetching canvas digest...");
      useProgressStore
        .getState()
        .updateProgress(30, "Analyzing image clusters...");
      const digestResponse = await fetch(
        "http://localhost:8000/api/canvas-digest"
      );
      const digest = await digestResponse.json();

      console.log("🤖 Analyzing canvas with agent...");
      useProgressStore
        .getState()
        .updateProgress(60, "Finding exploration opportunities...");
      const analysisResponse = await fetch(
        "http://localhost:8000/api/agent/analyze-canvas",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brief: currentBrief || "Explore shoe design variations",
            canvas_summary: digest,
          }),
        }
      );

      const analysis = await analysisResponse.json();
      setRegionHighlights(analysis.regions || []);
      useProgressStore.getState().updateProgress(100, "Analysis complete");
      console.log(
        "✓ Canvas analysis complete:",
        analysis.regions?.length,
        "regions found"
      );
    } catch (error) {
      console.error("❌ Canvas analysis failed:", error);
      useProgressStore.getState().hideProgress();
    } finally {
      setIsAnalyzing(false);
      useProgressStore.getState().hideProgress();
    }
  };

  const handleRegionPromptClick = (prompt: string, region: RegionHighlight) => {
    setRegionPromptDialog({ prompt, region });
  };

  const handleConfirmRegionGeneration = async (count: number) => {
    if (!regionPromptDialog) return;

    const { prompt, region } = regionPromptDialog;
    setRegionPromptDialog(null); // Close dialog

    console.log(
      "Generating from region:",
      region.title,
      "with prompt:",
      prompt,
      `(${count} images)`
    );
    setIsGenerating(true);
    useProgressStore
      .getState()
      .showProgress(
        "generating",
        `Generating from ${region.type} region...`,
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

      // Generate using fal.ai
      useProgressStore
        .getState()
        .updateProgress(10, "Generating with fal.ai...");
      const result = await falClient.generateTextToImage({
        prompt,
        num_images: count,
        aspect_ratio: "1:1",
        output_format: "jpeg",
      });

      // Send to backend for CLIP embeddings
      useProgressStore.getState().updateProgress(60, "Computing embeddings...");
      await apiClient.addExternalImages({
        images: result.images.map((img) => ({ url: img.url })),
        prompt: prompt,
        generation_method: "batch",
        remove_background: removeBackground,
      });

      useProgressStore.getState().updateProgress(90, "Updating canvas...");
      const state = await apiClient.getState();
      setImages(state.images);
      setHistoryGroups(state.history_groups);

      useProgressStore.getState().updateProgress(100);
      console.log("✓ Region generation complete");

      // Auto-generate variations if brief is set
      if (currentBrief && unexpectedImagesCount > 0) {
        console.log(
          `🎨 Generating ${unexpectedImagesCount} variations for region...`
        );
        useProgressStore
          .getState()
          .updateProgress(100, "Generating variations...");
        try {
          const variations = await apiClient.generateVariation(
            prompt,
            currentBrief,
            unexpectedImagesCount
          );

          for (const variation of variations.variations) {
            try {
              const result = await falClient.generateTextToImage({
                prompt: variation.prompt,
                num_images: 1,
                aspect_ratio: "1:1",
                output_format: "jpeg",
              });

              await apiClient.addExternalImages({
                images: result.images.map((img) => ({ url: img.url })),
                prompt: variation.prompt,
                generation_method: "auto-variation",
                remove_background: removeBackground,
              });

              // Refresh state to get the new image
              const updatedState = await apiClient.getState();
              const newImage =
                updatedState.images[updatedState.images.length - 1];

              setPendingImages((prev) => [
                ...prev,
                {
                  id: `pending-${Date.now()}-${Math.random()}`,
                  imageData: newImage,
                  originalPrompt: prompt,
                  variation: variation,
                  isPending: true,
                },
              ]);
            } catch (error) {
              console.error("Failed to generate variation image:", error);
            }
          }
        } catch (error) {
          console.error("Failed to generate variations:", error);
        }
      }
    } catch (error) {
      console.error("Region generation failed:", error);
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
  };

  const handleAcceptPending = async (pendingId: string) => {
    console.log("Accepting pending image:", pendingId);

    try {
      // Remove from pending list (it's already in the main images list)
      setPendingImages((prev) => prev.filter((p) => p.id !== pendingId));

      // Refresh state to show the image in the main canvas
      const state = await apiClient.getState();
      setImages(state.images);
      setHistoryGroups(state.history_groups);
    } catch (error) {
      console.error("Failed to accept pending image:", error);
    }
  };

  const handleDiscardPending = async (pendingId: string) => {
    console.log("Discarding pending image:", pendingId);
    const pending = pendingImages.find((p) => p.id === pendingId);
    if (!pending) return;

    try {
      // Delete from backend
      await apiClient.deleteImage(pending.imageData.id);

      // Remove from pending list
      setPendingImages((prev) => prev.filter((p) => p.id !== pendingId));

      // Refresh state
      const state = await apiClient.getState();
      setImages(state.images);
      setHistoryGroups(state.history_groups);
    } catch (error) {
      console.error("Failed to discard pending image:", error);
    }
  };

  const handleRefreshLayout = async () => {
    const axisLabels = useAppStore.getState().axisLabels;
    try {
      useProgressStore
        .getState()
        .showProgress("reprojecting", "Refreshing layout...", false);
      await apiClient.updateAxes({
        x_negative: axisLabels.x[0],
        x_positive: axisLabels.x[1],
        y_negative: axisLabels.y[0],
        y_positive: axisLabels.y[1],
      });
      const state = await apiClient.getState();
      setImages(state.images);
      setHistoryGroups(state.history_groups);
      resetCanvasBounds();
      useProgressStore.getState().hideProgress();
    } catch (error) {
      console.error("Failed to refresh layout:", error);
      useProgressStore.getState().hideProgress();
      alert("Failed to refresh layout");
    }
  };

  const handleSuggestAxes = async () => {
    // Prevent overlapping requests
    if (isLoadingAxes || showAxisSuggestionModal) {
      console.log("⚠️ Axis suggestion already in progress, skipping...");
      return;
    }

    const axisLabels = useAppStore.getState().axisLabels;
    setIsLoadingAxes(true);
    useProgressStore
      .getState()
      .showProgress("analyzing", "Suggesting alternative axes...", true);

    try {
      // Format axis labels as "negative - positive"
      const xLabel = `${axisLabels.x[0]} - ${axisLabels.x[1]}`;
      const yLabel = `${axisLabels.y[0]} - ${axisLabels.y[1]}`;

      const result = await apiClient.suggestAxes(
        currentBrief || "Explore shoe design variations",
        xLabel,
        yLabel
      );
      setAxisSuggestions(result.suggestions);
      setShowAxisSuggestionModal(true);
      useProgressStore.getState().hideProgress();
    } catch (error) {
      console.error("Failed to suggest axes:", error);
      useProgressStore.getState().hideProgress();
      alert("Failed to generate axis suggestions");
    } finally {
      setIsLoadingAxes(false);
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

      setShowAxisSuggestionModal(false);
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

      {/* Starter Prompts Modal */}
      {suggestedPrompts.length > 0 && (
        <StarterPromptsModal
          prompts={suggestedPrompts}
          onAccept={handleAcceptPrompt}
          onClose={handleDismissPrompts}
        />
      )}

      {/* Agent Toast - floating notification */}
      <AgentToast
        onShowGap={(regions) => {
          setRegionHighlights(regions);
        }}
      />

      <div className="app-layout">
        {/* Header Bar */}
        <HeaderBar
          imageCount={images.length}
          isInitialized={isInitialized}
          isAnalyzing={isAnalyzing}
          isLoadingAxes={isLoadingAxes}
          is3DMode={is3DMode}
          onToggle3D={() => useAppStore.getState().setIs3DMode(!is3DMode)}
          onOpenSettings={() => setShowSettingsModal(true)}
          onInsightClick={() => {
            // When clicking the insight pill, show the regions on canvas
            const insight = useAppStore.getState().agentInsight;
            if (insight?.data?.allRegions) {
              setRegionHighlights(insight.data.allRegions);
            }
            useAppStore.getState().dismissInsight();
          }}
        />

        {/* Left Toolbar removed - all actions in Radial Dial (Space or middle-click) */}

        {/* Center Canvas */}
        <div className="center-canvas">
          {showAxisSuggestionModal && (
            <AxisSuggestionModal
              suggestions={axisSuggestions}
              onApply={handleApplyAxes}
              onClose={() => setShowAxisSuggestionModal(false)}
              isLoading={isLoadingAxes}
            />
          )}

          <div
            className="canvas-container"
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                setRadialDialPos({ x: e.clientX, y: e.clientY });
                setShowRadialDial(true);
              }
            }}
          >
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
                  // FloatingActionPanel removed — actions now in RightInspector
                }, [])}
                regionHighlights={regionHighlights}
                onGenerateFromRegion={(prompt, region) =>
                  handleRegionPromptClick(prompt, region)
                }
                pendingImages={pendingImages}
                onAcceptPending={handleAcceptPending}
                onDiscardPending={handleDiscardPending}
                onGhostClick={setSelectedGhost}
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
                onLoad={handleLoadExternalImages}
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
                    await apiClient.addExternalImages({
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

            {/* Region Prompt Dialog */}
            {regionPromptDialog && (
              <RegionPromptDialog
                prompt={regionPromptDialog.prompt}
                regionTitle={regionPromptDialog.region.title}
                regionType={regionPromptDialog.region.type}
                onConfirm={handleConfirmRegionGeneration}
                onCancel={() => setRegionPromptDialog(null)}
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
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        currentBrief={currentBrief}
        onBriefChange={setCurrentBrief}
        unexpectedImagesCount={unexpectedImagesCount}
        onUnexpectedImagesCountChange={setUnexpectedImagesCount}
        showLabels={showLabels}
        showGrid={showGrid}
        showClusters={showClusters}
        backgroundColor={backgroundColor}
        onToggleLabels={() => setShowLabels(!showLabels)}
        onToggleGrid={() => setShowGrid(!showGrid)}
        onToggleClusters={() => setShowClusters(!showClusters)}
        onBackgroundColorChange={setBackgroundColor}
        onExportZip={handleExportZip}
      />

      <ExplorationTreeModal
        isOpen={showExplorationTreeModal}
        onClose={() => setShowExplorationTreeModal(false)}
      />

      {/* Ghost Node Accept/Discard Modal */}
      {selectedGhost && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setSelectedGhost(null)}
        >
          <div
            style={{
              background: "#161b22",
              border: "1px solid #30363d",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "500px",
              width: "90%",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px 0", color: "#58a6ff", fontSize: "18px" }}>
              ✨ AI Suggestion
            </h3>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "14px", color: "#8b949e", marginBottom: "8px" }}>
                Suggested Prompt:
              </div>
              <div style={{ fontSize: "16px", color: "#c9d1d9", marginBottom: "16px" }}>
                "{selectedGhost.suggested_prompt}"
              </div>
              <div style={{ fontSize: "14px", color: "#8b949e", marginBottom: "8px" }}>
                Reasoning:
              </div>
              <div style={{ fontSize: "14px", color: "#8b949e" }}>
                {selectedGhost.reasoning}
              </div>
            </div>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setSelectedGhost(null)}
                style={{
                  padding: "8px 16px",
                  background: "#21262d",
                  border: "1px solid #30363d",
                  borderRadius: "6px",
                  color: "#c9d1d9",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                Dismiss
              </button>
              <button
                onClick={async () => {
                  const ghost = selectedGhost;
                  setSelectedGhost(null);

                  // Generate image from ghost suggestion
                  useProgressStore.getState().showProgress("generating", "Generating from suggestion...", true);
                  try {
                    const result = await falClient.generateTextToImage({
                      prompt: ghost.suggested_prompt,
                      num_images: 1,
                    });

                    if (result.images && result.images.length > 0) {
                      await apiClient.addExternalImages({
                        images: result.images.map(img => ({ url: img.url })),
                        prompt: ghost.suggested_prompt,
                        generation_method: "batch",
                        remove_background: removeBackground,
                        parent_ids: [],
                      });

                      // Remove ghost from store
                      useAppStore.getState().removeGhostNode(ghost.id);

                      // Fetch updated state
                      const state = await apiClient.getState();
                      setImages(state.images);
                      setHistoryGroups(state.history_groups);
                    }

                    useProgressStore.getState().hideProgress();
                  } catch (error) {
                    console.error("Failed to generate from ghost:", error);
                    useProgressStore.getState().hideProgress();
                    alert("Failed to generate image from suggestion");
                  }
                }}
                style={{
                  padding: "8px 16px",
                  background: "#238636",
                  border: "1px solid #2ea043",
                  borderRadius: "6px",
                  color: "white",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                Generate ✨
              </button>
            </div>
          </div>
        </div>
      )}

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
            id: "analyze",
            icon: "🔍",
            label: "Analyze",
            description: "Analyze canvas with AI",
            category: "agentic",
            onClick: analyzeCanvas,
          },
          {
            id: "analyze-axis",
            icon: "📐",
            label: "Suggest Axes",
            description: "Suggest alternative axis labels",
            category: "agentic",
            onClick: handleSuggestAxes,
          },
          {
            id: "prompt-suggestion",
            icon: "💡",
            label: "Prompt Ideas",
            description: "AI-generated starter prompts from brief",
            category: "agentic",
            onClick: handlePromptSuggestion,
          },
          {
            id: "suggest-ghosts",
            icon: "✨",
            label: "Suggest Ideas",
            description: "AI suggests unexplored gaps to fill",
            category: "agentic",
            onClick: suggestGhostNodes,
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
