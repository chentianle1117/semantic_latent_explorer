import React, { useEffect, useState } from "react";
import { SemanticCanvas } from "./components/Canvas/SemanticCanvas";
import { SemanticCanvas3D } from "./components/Canvas/SemanticCanvas3D";
import { PromptDialog } from "./components/PromptDialog/PromptDialog";
import { InterpolationDialog } from "./components/InterpolationDialog/InterpolationDialog";
import { FloatingActionPanel } from "./components/FloatingActionPanel/FloatingActionPanel";
import { ProgressModal } from "./components/ProgressModal/ProgressModal";
import { IntentPanel } from "./components/IntentPanel/IntentPanel";
import { RightControlPanel } from "./components/RightControlPanel/RightControlPanel";
import { useProgressStore } from "./store/progressStore";
import { BatchPromptDialog } from "./components/BatchPromptDialog/BatchPromptDialog";
import { ExternalImageLoader } from "./components/ExternalImageLoader/ExternalImageLoader";
import { StarterPromptsModal } from "./components/StarterPromptsModal/StarterPromptsModal";
import { AxisSuggestionModal } from "./components/AxisSuggestionModal/AxisSuggestionModal";
import { RegionPromptDialog } from "./components/RegionPromptDialog/RegionPromptDialog";
import { TextToImageDialog } from "./components/TextToImageDialog/TextToImageDialog";
import { ExplorationMinimap } from "./components/ExplorationMinimap/ExplorationMinimap";
import { ExplorationTreeModal } from "./components/ExplorationTreeModal/ExplorationTreeModal";
import { useAppStore } from "./store/appStore";
import { apiClient } from "./api/client";
import { falClient } from "./api/falClient";
import type {
  ImageData,
  SuggestedPrompt,
  RegionHighlight,
  PendingImage,
} from "./types";
import "./styles/app.css";

export const App: React.FC = () => {
  const [floatingPanelPos, setFloatingPanelPos] = useState<{
    x: number;
    y: number;
    count: number;
  } | null>(null);
  const [showTextToImageDialog, setShowTextToImageDialog] = useState(false);
  const [showPromptDialog, setShowPromptDialog] = useState(false);
  const [promptDialogImageId, setPromptDialogImageId] = useState<number | null>(
    null
  );
  const [interpolationImageIds, setInterpolationImageIds] = useState<
    [number, number] | null
  >(null);
  const [showBatchPromptDialog, setShowBatchPromptDialog] = useState(false);
  const [showExternalImageLoader, setShowExternalImageLoader] = useState(false);
  const [showTreeModal, setShowTreeModal] = useState(false);
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

  const images = useAppStore((state) =>
    state.images.filter((img) => img.visible)
  );
  const selectedImageIds = useAppStore((state) => state.selectedImageIds);
  const isInitialized = useAppStore((state) => state.isInitialized);
  const isGenerating = useAppStore((state) => state.isGenerating);
  const removeBackground = useAppStore((state) => state.removeBackground);
  const is3DMode = useAppStore((state) => state.is3DMode);

  const setImages = useAppStore((state) => state.setImages);
  const setHistoryGroups = useAppStore((state) => state.setHistoryGroups);
  const setIsInitialized = useAppStore((state) => state.setIsInitialized);
  const setIsGenerating = useAppStore((state) => state.setIsGenerating);
  const setGenerationProgress = useAppStore(
    (state) => state.setGenerationProgress
  );
  const setGenerationCount = useAppStore((state) => state.setGenerationCount);
  const clearSelection = useAppStore((state) => state.clearSelection);

  useEffect(() => {
    // Initialize CLIP on mount
    console.log("🚀 Initializing CLIP embedder...");

    // COMMENTED OUT: Local SD 1.5 initialization - removed completely, only using fal.ai nanobanana now
    // if (false) {
    //   // Connect WebSocket for real-time updates
    //   apiClient.connectWebSocket((message) => {
    //     if (message.type === "state_update" && message.data) {
    //       setImages(message.data.images);
    //       setHistoryGroups(message.data.history_groups);
    //     } else if (message.type === "progress" && message.progress !== undefined) {
    //       setGenerationProgress(message.progress);
    //     }
    //   });

    //   // Initialize backend models (SD 1.5 + CLIP)
    //   apiClient
    //     .initialize()
    //     .then(() => {
    //       setIsInitialized(true);
    //       return apiClient.getState();
    //     })
    //     .then((state) => {
    //       setImages(state.images);
    //       setHistoryGroups(state.history_groups);
    //     })
    //     .catch((error) => {
    //       console.error("Failed to initialize:", error);
    //       setIsInitialized(false);
    //       alert(
    //         "Failed to connect to backend. Make sure backend is running on port 8000."
    //       );
    //     });

    //   return () => {
    //     apiClient.disconnectWebSocket(() => {});
    //   };
    // } else {
    // For fal.ai mode, only initialize CLIP (for embeddings)
    // NOTE: This is always used now since we only use fal.ai nanobanana for generation
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
        });
        setImages(state.images);
        setHistoryGroups(state.history_groups);
        // Load design brief from backend state
        if (state.design_brief) {
          setCurrentBrief(state.design_brief);
          console.log("✓ Loaded design brief from backend:", state.design_brief.substring(0, 50) + "...");
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
    // }
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
      // COMMENTED OUT: Local SD generation - removed completely
      // if (false) {
      //   // Use local SD 1.5 backend
      //   await apiClient.generate({ prompt, n_images: nImages });
      // } else {
      // Use fal.ai nano-banana text-to-image
      // NOTE: This is always used now
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
      await apiClient.addExternalImages({
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
      // }

      useProgressStore.getState().updateProgress(100);

      // Auto-generate variations if brief is set
      if (currentBrief && unexpectedImagesCount > 0) {
        console.log(`🎨 Generating ${unexpectedImagesCount} variations in background...`);
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
      setFloatingPanelPos(null);
    } catch (error) {
      console.error("Clear failed:", error);
      alert("Failed to clear canvas. Check console for details.");
    }
  };

  const handleExportZip = async () => {
    if (images.length === 0) {
      alert("No images to export. Generate some images first!");
      return;
    }

    // Show loading state
    setIsGenerating(true);
    setGenerationProgress(50);

    try {
      console.log(
        `📦 Exporting ${images.length} images and metadata as ZIP...`
      );
      console.log("Fetching from: http://localhost:8000/api/export-zip");

      const response = await fetch("http://localhost:8000/api/export-zip", {
        method: "GET",
        headers: {
          Accept: "application/zip",
        },
      });

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
        `✅ Successfully exported ${images.length} images with metadata!`
      );
      alert(`✅ Successfully exported ${images.length} images with metadata!`);
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
      console.log(`🎨 Generating ${unexpectedImagesCount} auto-variations per prompt...`);
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
      // Process images one at a time to avoid overwhelming the server
      const BATCH_SIZE = 1; // Process 1 image at a time for stability
      const numBatches = Math.ceil(urls.length / BATCH_SIZE);

      if (numBatches > 1) {
        console.log(`📦 Processing ${urls.length} images one at a time...`);
      }

      for (let i = 0; i < numBatches; i++) {
        const start = i * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, urls.length);
        const batchUrls = urls.slice(start, end);

        console.log(`📷 Loading image ${i + 1}/${numBatches}...`);

        // Send batch to backend for CLIP embedding extraction
        await apiClient.addExternalImages({
          images: batchUrls.map((url) => ({ url })),
          prompt: prompt,
          generation_method: "external",
          remove_background: removeBackground,
        });

        console.log(`✓ Image ${i + 1}/${numBatches} complete`);

        // Immediately fetch and update state after each image so it appears on canvas
        const state = await apiClient.getState();
        setImages(state.images);
        setHistoryGroups(state.history_groups);

        // Update progress
        const processed = end;
        const progress = (processed / urls.length) * 100;
        useProgressStore
          .getState()
          .updateProgress(progress, `Image ${processed}/${urls.length}`);
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

  // COMMENTED OUT: Local SD interpolation - not supported in fal.ai nanobanana
  // This feature requires local SD 1.5 with latent space interpolation
  const handleInterpolate = async (
    idA: number,
    idB: number,
    alpha: number,
    steps?: number
  ) => {
    alert(
      "Interpolation is only available with Local SD 1.5 mode. This feature is disabled when using fal.ai nanobanana."
    );
    return;

    // console.log(`Interpolating between images ${idA} and ${idB} (alpha: ${alpha}, steps: ${steps || 1})...`);
    // setInterpolationImageIds(null);
    // setIsGenerating(true);
    // setFloatingPanelPos(null);

    // const totalSteps = steps || 1;
    // setGenerationCount(0, totalSteps);
    // setGenerationProgress(0);

    // // Estimate 5 seconds per interpolation
    // const estimatedTimeMs = totalSteps * 5000;
    // const updateIntervalMs = 100;
    // const totalUpdates = estimatedTimeMs / updateIntervalMs;
    // let updates = 0;

    // const progressInterval = setInterval(() => {
    //   updates++;
    //   const progress = Math.min((updates / totalUpdates) * 90, 90);
    //   const currentStepEstimate = Math.floor((progress / 90) * totalSteps);
    //   setGenerationCount(currentStepEstimate, totalSteps);
    //   setGenerationProgress(progress);
    // }, updateIntervalMs);

    // // Safety timeout: auto-reset after 5 minutes
    // const safetyTimeout = setTimeout(() => {
    //   console.error("⚠️ Interpolation timed out after 5 minutes");
    //   clearInterval(progressInterval);
    //   setIsGenerating(false);
    //   setGenerationProgress(0);
    //   setGenerationCount(0, 0);
    //   alert("Interpolation timed out. Please try again.");
    // }, 300000);

    // try {
    //   if (steps && steps > 1) {
    //     // Generate multiple interpolations
    //     for (let i = 0; i < steps; i++) {
    //       const currentAlpha = i / (steps - 1);
    //       await apiClient.interpolate({ id_a: idA, id_b: idB, alpha: currentAlpha });
    //     }
    //   } else {
    //     // Single interpolation
    //     await apiClient.interpolate({ id_a: idA, id_b: idB, alpha });
    //   }
    //   clearInterval(progressInterval);
    //   clearTimeout(safetyTimeout);
    //   setGenerationCount(totalSteps, totalSteps);
    //   setGenerationProgress(100);
    //   console.log("Interpolation successful");
    //   clearSelection();
    // } catch (error) {
    //   clearInterval(progressInterval);
    //   clearTimeout(safetyTimeout);
    //   console.error("Interpolation failed:", error);
    //   alert(`Interpolation failed: ${error}`);
    // } finally {
    //   setIsGenerating(false);
    //   setTimeout(() => {
    //     setGenerationProgress(0);
    //     setGenerationCount(0, 0);
    //   }, 1000);
    // }
  };

  // Get all selected images for the prompt dialog
  const promptDialogImages =
    selectedImageIds.length > 0
      ? images.filter((img) => selectedImageIds.includes(img.id))
      : promptDialogImageId !== null
      ? images.filter((img) => img.id === promptDialogImageId)
      : [];

  const interpolationImages = interpolationImageIds
    ? ([
        images.find((img) => img.id === interpolationImageIds[0]),
        images.find((img) => img.id === interpolationImageIds[1]),
      ].filter(Boolean) as [ImageData, ImageData])
    : null;

  const handleGenerateFromReferenceClick = () => {
    // Use selected images, or if none selected, single image ID will be set
    // The promptDialogImages computed property handles this
    if (selectedImageIds.length === 0 && promptDialogImageId === null) {
      console.warn("No images selected for reference generation");
      return;
    }
    setShowPromptDialog(true);
  };

  const handleInterpolateClick = () => {
    if (selectedImageIds.length === 2) {
      setInterpolationImageIds([selectedImageIds[0], selectedImageIds[1]]);
      setFloatingPanelPos(null);
    }
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
    setFloatingPanelPos(null);
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
      // COMMENTED OUT: Local SD reference generation - removed completely
      // if (false) {
      //   // Use local SD 1.5 backend (only supports single reference)
      //   const result = await apiClient.generateFromReference({
      //     reference_id: referenceIds[0],  // Use first reference
      //     prompt,
      //   });
      //   clearInterval(progressInterval);
      //   clearTimeout(safetyTimeout);
      //   console.log("Generation from reference successful:", result);
      //   setGenerationCount(1, 1);
      //   setGenerationProgress(100);
      //   clearSelection();
      // } else {
      // Use fal.ai nano-banana image editing
      // NOTE: This is always used now
      // Get reference images from IDs
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
      if (currentBrief && unexpectedImagesCount > 0 && state.images.length > 0) {
        console.log(`🎨 Generating ${unexpectedImagesCount} variations from reference...`);
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
        console.log(`🎨 Generating ${unexpectedImagesCount} variations for accepted prompt...`);
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
        console.log(`🎨 Generating ${unexpectedImagesCount} variations for region...`);
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

  const handleDismissRegions = () => {
    setRegionHighlights([]);
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
        setShowPromptDialog(false);
        setInterpolationImageIds(null);
        setFloatingPanelPos(null);
        clearSelection(); // Also clear selection to close dialogs
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [clearSelection]);

  // Update floating panel position when selection changes
  useEffect(() => {
    if (selectedImageIds.length === 0) {
      setFloatingPanelPos(null);
      setShowPromptDialog(false);
    }
  }, [selectedImageIds]);

  return (
    <>
      {/* Progress Modal */}
      <ProgressModal />

      {/* Exploration Tree Modal */}
      {showTreeModal && (
        <ExplorationTreeModal
          images={images}
          onClose={() => setShowTreeModal(false)}
          onNodeClick={(id) => {
            useAppStore.getState().setSelectedImageIds([id]);
            setShowTreeModal(false);
          }}
          onNodeHover={(id) => {
            if (id !== null) {
              useAppStore.getState().setHoveredImageId(id);
            } else {
              useAppStore.getState().setHoveredImageId(null);
            }
          }}
        />
      )}

      {/* Starter Prompts Modal */}
      {suggestedPrompts.length > 0 && (
        <StarterPromptsModal
          prompts={suggestedPrompts}
          onAccept={handleAcceptPrompt}
          onClose={handleDismissPrompts}
        />
      )}

      <div className="app-layout">
        {/* Left Panel - Intent */}
        <div className="left-panel">
          <IntentPanel
            brief={currentBrief || ""}
            onBriefChange={async (newBrief: string) => {
              setCurrentBrief(newBrief);
              // Persist brief to backend
              try {
                await apiClient.updateDesignBrief(newBrief);
                console.log("✓ Design brief saved to backend");
              } catch (error) {
                console.error("Failed to save design brief:", error);
              }
            }}
            onGeneratePrompts={async () => {
              if (!currentBrief) return;
              try {
                const response = await fetch(
                  "http://localhost:8000/api/agent/initial-prompts",
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ brief: currentBrief.trim() }),
                  }
                );
                const data = await response.json();
                setSuggestedPrompts(data.prompts);
              } catch (err) {
                console.error("Failed to generate prompts:", err);
              }
            }}
            isGeneratingPrompts={false}
            onAnalyzeCanvas={analyzeCanvas}
            isAnalyzing={isAnalyzing}
            onSuggestAxes={handleSuggestAxes}
            isLoadingAxes={isLoadingAxes}
            unexpectedImagesCount={unexpectedImagesCount}
            onUnexpectedImagesCountChange={setUnexpectedImagesCount}
            focusRegions={regionHighlights}
            onSelectFocus={(idx) =>
              console.log("Focus on region:", regionHighlights[idx])
            }
            preferences={{
              liked: selectedImageIds.length,
              generated: images.length,
              exploration:
                images.length === 0
                  ? "Empty"
                  : images.length < 20
                  ? "Starting"
                  : images.length < 100
                  ? "Building"
                  : "Extensive",
            }}
          />
        </div>

        {/* Center Canvas */}
        <div className="center-canvas">
          <div className="canvas-header">
            <h1>👟 Semantic Latent Space</h1>
          </div>

          <div className="canvas-stats">
            <strong>{images.length}</strong> images •{" "}
            <strong>CLIP ViT-B/32</strong> •{" "}
            {isInitialized ? "✅ Ready" : "⏳ Initializing..."} •{" "}
            <strong>{is3DMode ? "3D" : "2D"}</strong> mode
            {isAnalyzing && (
              <span style={{ marginLeft: "8px" }}>• 🤖 Analyzing...</span>
            )}
          </div>

          {showAxisSuggestionModal && (
            <AxisSuggestionModal
              suggestions={axisSuggestions}
              onApply={handleApplyAxes}
              onClose={() => setShowAxisSuggestionModal(false)}
              isLoading={isLoadingAxes}
            />
          )}

          <div className="canvas-container">
            {/* Conditionally render 2D or 3D canvas */}
            {is3DMode ? (
              <SemanticCanvas3D
                onSelectionChange={React.useCallback((x, y, count) => {
                  console.log("🎯 App received 3D onSelectionChange:", {
                    x,
                    y,
                    count,
                  });
                  if (count > 0) {
                    if (x === -1 && y === -1) {
                      setFloatingPanelPos((prev) =>
                        prev ? { ...prev, count } : { x: 0, y: 0, count }
                      );
                    } else {
                      setFloatingPanelPos({ x, y, count });
                    }
                  } else {
                    setFloatingPanelPos(null);
                  }
                }, [])}
              />
            ) : (
              <SemanticCanvas
                onSelectionChange={React.useCallback((x, y, count) => {
                  console.log("🎯 App received 2D onSelectionChange:", {
                    x,
                    y,
                    count,
                  });
                  if (count > 0) {
                    if (x === -1 && y === -1) {
                      setFloatingPanelPos((prev) =>
                        prev ? { ...prev, count } : { x: 0, y: 0, count }
                      );
                    } else {
                      setFloatingPanelPos({ x, y, count });
                    }
                  } else {
                    setFloatingPanelPos(null);
                  }
                }, [])}
                regionHighlights={regionHighlights}
                onGenerateFromRegion={(prompt, region) =>
                  handleRegionPromptClick(prompt, region)
                }
                onDismissRegions={handleDismissRegions}
                pendingImages={pendingImages}
                onAcceptPending={handleAcceptPending}
                onDiscardPending={handleDiscardPending}
              />
            )}

            {/* Floating Action Panel (primary interaction) */}
            {floatingPanelPos && floatingPanelPos.count > 0 && (
              <FloatingActionPanel
                x={floatingPanelPos.x}
                y={floatingPanelPos.y}
                selectedCount={floatingPanelPos.count}
                onGenerateFromReference={() => {
                  // Open dialog with all selected images
                  handleGenerateFromReferenceClick();
                  setFloatingPanelPos(null);
                }}
                // COMMENTED OUT: Interpolation disabled - only available with local SD 1.5
                onInterpolate={
                  undefined
                  // Interpolation disabled - not supported with fal.ai
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

            {/* Interpolation Dialog */}
            {interpolationImages && interpolationImages.length === 2 && (
              <InterpolationDialog
                imageA={interpolationImages[0]}
                imageB={interpolationImages[1]}
                onClose={() => setInterpolationImageIds(null)}
                onInterpolate={handleInterpolate}
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

        {/* Right Panel - Controls (Non-collapsible) */}
        <div className="right-panel">
          <RightControlPanel
            onGenerateFromPrompt={() => setShowTextToImageDialog(true)}
            onBatchGenerate={() => setShowBatchPromptDialog(true)}
            onLoadImages={() => setShowExternalImageLoader(true)}
            onExport={handleExportZip}
            onClearAll={handleClearCanvas}
            isGenerating={isGenerating}
            showLabels={showLabels}
            showGrid={showGrid}
            showClusters={showClusters}
            backgroundColor={backgroundColor}
            onToggleLabels={() => setShowLabels(!showLabels)}
            onToggleGrid={() => setShowGrid(!showGrid)}
            onToggleClusters={() => setShowClusters(!showClusters)}
            onBackgroundColorChange={setBackgroundColor}
            images={images}
          />
        </div>

        {/* Bottom History Panel */}
        <div className="bottom-history-panel">
          <div className="history-header">
            <h3>Generation History & Exploration Map</h3>
            <div className="history-stats">
              <span>{useAppStore.getState().historyGroups.length} batches</span>
              <span>•</span>
              <span>{images.length} total images</span>
            </div>
          </div>
          <div className="history-content">
            <div className="minimap-container">
              <ExplorationMinimap
                images={images}
                historyGroups={useAppStore.getState().historyGroups}
                onImageClick={(id) =>
                  useAppStore.getState().setSelectedImageIds([id])
                }
                onExpandClick={() => setShowTreeModal(true)}
              />
            </div>
            <div className="history-timeline">
              {useAppStore.getState().historyGroups.map((group) => {
                const hoveredGroupId = useAppStore.getState().hoveredGroupId;
                const setHoveredGroupId =
                  useAppStore.getState().setHoveredGroupId;
                const thumbnailImage =
                  group.thumbnail_id !== null
                    ? images.find((img) => img.id === group.thumbnail_id)
                    : null;

                // Get reference images for metadata display
                const referenceImages =
                  group.type === "reference"
                    ? group.image_ids
                        .map((id) => images.find((img) => img.id === id))
                        .filter(Boolean)
                        .filter(
                          (img, index, self) =>
                            img &&
                            img.parent_id &&
                            self.findIndex(
                              (i) => i?.parent_id === img.parent_id
                            ) === index
                        )
                    : [];

                const referenceCount = referenceImages.length;
                const timestamp = new Date(group.timestamp).toLocaleTimeString(
                  [],
                  { hour: "2-digit", minute: "2-digit" }
                );

                return (
                  <div
                    key={group.id}
                    className={`history-group ${
                      hoveredGroupId === group.id ? "highlighting" : ""
                    }`}
                    onClick={() =>
                      useAppStore
                        .getState()
                        .setSelectedImageIds(group.image_ids)
                    }
                    onMouseEnter={() => setHoveredGroupId(group.id)}
                    onMouseLeave={() => setHoveredGroupId(null)}
                    title={`${group.type.toUpperCase()} - ${
                      group.prompt
                    }\nGenerated: ${timestamp}\nImages: ${
                      group.image_ids.length
                    }`}
                  >
                    <div className="group-header">
                      <span className="group-title">
                        {group.type === "reference"
                          ? "🔄"
                          : group.type === "batch"
                          ? "🎲"
                          : "📁"}{" "}
                        {group.type.toUpperCase()}
                      </span>
                      <span className="group-badge">
                        {group.image_ids.length}
                      </span>
                    </div>
                    <div className="group-content">
                      <div className="group-prompt" title={group.prompt}>
                        {group.prompt.substring(0, 40)}
                        {group.prompt.length > 40 ? "..." : ""}
                      </div>
                      {group.type === "reference" && referenceCount > 0 && (
                        <div className="group-metadata">
                          From {referenceCount} ref
                          {referenceCount > 1 ? "s" : ""}
                        </div>
                      )}
                      <div className="group-timestamp">{timestamp}</div>
                    </div>
                    {thumbnailImage ? (
                      <img
                        src={`data:image/png;base64,${thumbnailImage.base64_image}`}
                        alt={group.type}
                        className="group-thumbnail"
                      />
                    ) : (
                      <div className="group-thumbnail group-placeholder" />
                    )}
                  </div>
                );
              })}

              {useAppStore.getState().historyGroups.length === 0 && (
                <div className="history-empty">
                  No history yet. Generate some images to get started!
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
