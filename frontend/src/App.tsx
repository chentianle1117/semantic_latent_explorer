import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { SemanticCanvas } from "./components/Canvas/SemanticCanvas";
import { SemanticCanvas3D } from "./components/Canvas/SemanticCanvas3D";
import { LineageCanvas } from "./components/Canvas/LineageCanvas";
import { CanvasViewToggle } from "./components/Canvas/CanvasViewToggle";
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
import { MoodBoardDialog } from "./components/MoodBoardDialog/MoodBoardDialog";
import { RadialDial } from "./components/RadialDial/RadialDial";
import { ExplorationTreeModal } from "./components/ExplorationTreeModal/ExplorationTreeModal";
import { DynamicIsland } from "./components/DynamicIsland/DynamicIsland";
import { DesignBriefOverlay, commitBriefExternal } from "./components/DesignBriefOverlay/DesignBriefOverlay";
import { InlineAxisSuggestions } from "./components/InlineAxisSuggestions/InlineAxisSuggestions";
import { ConfirmDialog } from "./components/ConfirmDialog/ConfirmDialog";
import { OnboardingTour } from "./components/OnboardingTour/OnboardingTour";
import { MultiViewEditor } from "./components/MultiViewEditor/MultiViewEditor";
import { AxisTuningRail } from "./components/AxisTuningRail/AxisTuningRail";
import { FeedbackNotepad } from "./components/FeedbackNotepad/FeedbackNotepad";
import { useAppStore } from "./store/appStore";
import type { ImageData, ShoeViewType } from "./types";
import { useAgentBehaviors } from "./hooks/useAgentBehaviors";
import { useAutoSave } from "./hooks/useAutoSave";
import { useEventLog } from "./hooks/useEventLog";
import { apiClient, _registerParticipantIdGetter } from "./api/client";
// Register getter so axios interceptor can read participantId without require()
_registerParticipantIdGetter(() => useAppStore.getState().participantId || 'researcher');
import { falClient, extractBriefConstraint, SATELLITE_VIEWS } from "./api/falClient";
import { generateAllViews } from "./utils/generateAllViews";
import "./styles/app.css";

// Build brief constraint with optional per-generation shoe type override (highest priority).
// Falls back to briefFields.shoe_type from global AI context when no override provided.
function buildBriefConstraint(shoeTypeOverride?: string): string {
  const fields = useAppStore.getState().briefFields;
  const silhouette = fields.find(f => f.key === 'silhouette')?.value?.trim() || '';
  const shoeType = shoeTypeOverride?.trim() || fields.find(f => f.key === 'shoe_type')?.value?.trim() || '';
  if (!shoeType && !silhouette) return '';
  const parts: string[] = [];
  if (shoeType) parts.push(`This MUST be a ${shoeType}`);
  if (silhouette) parts.push(`${shoeType ? 'with' : 'This MUST have'} a ${silhouette} silhouette`);
  return parts.join(', ') + '. Do not change the shoe type or silhouette — only vary aesthetics, materials, colors, and surface details';
}

export const App: React.FC = () => {
  // floatingPanelPos removed — actions now in RightInspector
  const [showTextToImageDialog, setShowTextToImageDialog] = useState(false);
  const [showMoodBoardDialog, setShowMoodBoardDialog] = useState(false);
  const [showPromptDialog, setShowPromptDialog] = useState(false);

  // Ref always reflects current dialog open state — avoids stale closure bugs in async callbacks
  const anyDialogOpenRef = useRef(false);
  useEffect(() => {
    anyDialogOpenRef.current = showPromptDialog || showTextToImageDialog || showMoodBoardDialog;
  }, [showPromptDialog, showTextToImageDialog, showMoodBoardDialog]);

  const [promptDialogImageId, setPromptDialogImageId] = useState<number | null>(
    null
  );
  const [showBatchPromptDialog, setShowBatchPromptDialog] = useState(false);
  const [showExternalImageLoader, setShowExternalImageLoader] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Shared login handler: authenticate → load most recent canvas (if any)
  const handleLogin = async (username: string, password: string) => {
    const res = await apiClient.login(username, password);
    useAppStore.getState().setParticipantId(res.participantId);
    if (res.role === 'admin') useAppStore.getState().setParticipantLockedFromUrl(false);

    // Load the participant's last-active canvas (or most recent if marker missing)
    try {
      const resp = await apiClient.listSessions();
      const sessions = resp.sessions;
      const lastActiveId = (resp as any).lastActiveCanvasId;
      useAppStore.getState().setCanvasList(sessions);
      if (sessions.length > 0) {
        // Prefer the last-active canvas; fall back to most recently updated
        const target = (lastActiveId && sessions.find((s: any) => s.id === lastActiveId))
          || [...sessions].sort((a: any, b: any) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )[0];
        console.log(`[login] Loading canvas: "${target.name}" (${target.id})`);
        const loaded = await apiClient.loadSession(target.id);
        useAppStore.getState().setCurrentCanvasId(loaded.canvasId);
        useAppStore.getState().setCanvasName(loaded.canvasName);
        if (loaded.state?.images) setImages(loaded.state.images);
        if (loaded.state?.history_groups) setHistoryGroups(loaded.state.history_groups);
        if (loaded.state?.axis_labels) useAppStore.getState().setAxisLabels(loaded.state.axis_labels);
        if (loaded.state?.design_brief) useAppStore.getState().setDesignBrief(loaded.state.design_brief);
      } else {
        // No existing canvases — fetch default state (fresh canvas)
        const session = await apiClient.getCurrentSession();
        useAppStore.getState().setCurrentCanvasId(session.canvasId);
        useAppStore.getState().setCanvasName(session.canvasName);
      }
    } catch (err) {
      console.warn('[login] Failed to load sessions, using default canvas:', err);
    }

    apiClient.logEvent('login', { participantId: res.participantId, role: res.role });
    // Persist login so browser refresh doesn't require re-login
    sessionStorage.setItem('sc_auth', JSON.stringify({ participantId: res.participantId, role: res.role }));
    setShowLoginPrompt(false);
  };
  // Agent/AI state — designBrief lives in Zustand store (replaces local useState)
  const setCurrentBrief = useAppStore((s) => s.setDesignBrief);
  // AxisSuggestionModal removed — axes now shown via InlineAxisSuggestions + Dynamic Island
  // isLoadingAxes is set after useAgentBehaviors() hook below
  const [showLabels, setShowLabels] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showClusters, setShowClusters] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState("#0d1117");
  const [ghostCount, setGhostCount] = useState(1);
  const [showRadialDial, setShowRadialDial] = useState(false);
  const [radialDialPos, setRadialDialPos] = useState({ x: 0, y: 0 });
  const [showExplorationTreeModal, setShowExplorationTreeModal] = useState(false);
  const [multiViewTarget, setMultiViewTarget] = useState<{
    sideImage: ImageData; satellites: ImageData[];
  } | null>(null);

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
  const hiddenImageIds = useAppStore((state) => state.hiddenImageIds);
  const isInitialized = useAppStore((state) => state.isInitialized);

  // Determine the dominant realm of currently selected images (for dial button labels)
  // 'mixed' when both realms present, null when nothing selected
  const selectedRealmContext = useMemo(() => {
    if (selectedImageIds.length === 0) return null;
    const imageMap = new Map(images.map(img => [img.id, img]));
    const realms = selectedImageIds.map(id => imageMap.get(id)?.realm ?? 'shoe');
    const hasMoodBoard = realms.includes('mood-board');
    const hasShoe = realms.includes('shoe');
    if (hasMoodBoard && hasShoe) return 'mixed' as const;
    if (hasMoodBoard) return 'mood-board' as const;
    return 'shoe' as const;
  }, [selectedImageIds, images]);
  const removeBackground = useAppStore((state) => state.removeBackground);
  const is3DMode = useAppStore((state) => state.is3DMode);
  const canvasViewMode = useAppStore((state) => state.canvasViewMode);

  const setImages = useAppStore((state) => state.setImages);
  const mergeImages = useAppStore((state) => state.mergeImages);
  const updateImage = useAppStore((state) => state.updateImage);
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

  const { triggerConcurrentGhosts, triggerExplorationGhosts, triggerAxisSuggestions, isLoadingAxisSuggestions } = useAgentBehaviors();
  const isLoadingAxes = isLoadingAxisSuggestions;
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
    // Lock participant identity from URL param (e.g. ?participant=Alice)
    const urlParticipant = new URLSearchParams(window.location.search).get('participant');
    if (urlParticipant) {
      useAppStore.getState().setParticipantId(urlParticipant);
      useAppStore.getState().setParticipantLockedFromUrl(true);
      apiClient.setParticipant(urlParticipant).catch(() => {});
    } else {
      // Check sessionStorage for persisted login (survives refresh)
      const savedAuth = sessionStorage.getItem('sc_auth');
      if (savedAuth) {
        try {
          const { participantId, role } = JSON.parse(savedAuth);
          useAppStore.getState().setParticipantId(participantId);
          if (role === 'admin') useAppStore.getState().setParticipantLockedFromUrl(false);
          // Re-authenticate with backend so server state matches
          apiClient.setParticipant(participantId).catch(() => {});
          console.log(`[auth] Restored session for ${participantId} from sessionStorage`);
        } catch {
          setShowLoginPrompt(true);
        }
      } else {
        // No URL param, no saved session — show login form
        setShowLoginPrompt(true);
      }
    }

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
        // Load canvas session metadata, auto-load last active canvas if available
        return Promise.all([
          apiClient.getCurrentSession(),
          apiClient.listSessions(),
        ]).then(async ([session, { sessions, lastActiveCanvasId }]) => {
          useAppStore.getState().setCanvasList(sessions);

          // If there's a saved canvas on disk, load it instead of the fresh empty one
          const targetCanvasId = lastActiveCanvasId
            || (sessions.length > 0 ? sessions[0].id : null);  // fallback to most recent

          if (targetCanvasId && sessions.some(s => s.id === targetCanvasId)) {
            try {
              console.log(`[init] Auto-loading last active canvas: ${targetCanvasId}`);
              const loaded = await apiClient.loadSession(targetCanvasId);
              const s = loaded.state;
              if (s.images && s.images.length > 0) {
                setImages(s.images);
                setHistoryGroups(s.history_groups || []);
                if (s.axis_labels) useAppStore.getState().setAxisLabels(s.axis_labels);
                if (s.design_brief) useAppStore.getState().setDesignBrief(s.design_brief);
              }
              useAppStore.getState().setCurrentCanvasId(loaded.canvasId);
              useAppStore.getState().setCanvasName(loaded.canvasName);
              useAppStore.getState().setParticipantId(session.participantId);
              console.log(`[init] Loaded canvas "${loaded.canvasName}" with ${s.images?.length || 0} images`);
            } catch (err) {
              console.warn('[init] Failed to load last active canvas, using default:', err);
              useAppStore.getState().setCurrentCanvasId(session.canvasId);
              useAppStore.getState().setCanvasName(session.canvasName);
              useAppStore.getState().setParticipantId(session.participantId);
            }
          } else {
            useAppStore.getState().setCurrentCanvasId(session.canvasId);
            useAppStore.getState().setCanvasName(session.canvasName);
            useAppStore.getState().setParticipantId(session.participantId);
          }

          // Load per-canvas onboarding progress from localStorage
          useAppStore.getState().loadOnboardingState(
            useAppStore.getState().currentCanvasId
          );

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
          useAppStore.getState().resetTransientUIState();
        } catch (error) {
          console.error("Clear failed:", error);
        }
      },
      { confirmLabel: "Clear All", danger: true }
    );
  };

  const handleMultiViewSave = async (
    updatedViews: Record<ShoeViewType, ImageData | null>,
    editedViews: Set<ShoeViewType>,
  ) => {
    if (!multiViewTarget) return;
    const sideId = multiViewTarget.sideImage.id;
    const prompt = multiViewTarget.sideImage.prompt ?? '';

    // Only process views that were actually edited by the user (not normalization-only changes)
    const satelliteEntries: [ShoeViewType, ImageData][] = [];
    for (const [view, imgData] of Object.entries(updatedViews) as [ShoeViewType, ImageData | null][]) {
      if (!imgData) continue;
      if (!editedViews.has(view as ShoeViewType)) continue; // skip non-edited views
      if (view === 'side') continue; // side view handled separately below
      satelliteEntries.push([view as ShoeViewType, imgData]);
    }

    // Update side view in-place if it was edited (keeps same ID, position, and parent links)
    const sideEdited = editedViews.has('side') && updatedViews['side'];
    if (sideEdited) {
      useAppStore.getState().updateImage(sideId, {
        base64_image: updatedViews['side']!.base64_image,
      });
    }

    // Nothing else to save — just close
    if (satelliteEntries.length === 0) {
      setMultiViewTarget(null);
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(10);

    try {
      // Remove old satellites that are being replaced
      for (const [view] of satelliteEntries) {
        const origSat = multiViewTarget.satellites.find(s => s.shoe_view === view);
        if (origSat) {
          useAppStore.getState().removeImage(origSat.id);
        }
      }

      // Upload all files to fal.ai in parallel (major speedup vs sequential loop)
      setGenerationProgress(20);
      const uploadedEntries = await Promise.all(
        satelliteEntries.map(async ([view, imgData]) => {
          const blob = await (await fetch(`data:image/png;base64,${imgData.base64_image}`)).blob();
          const file = new File([blob], `${view}-${sideId}.png`, { type: 'image/png' });
          const url = await falClient.uploadFile(file);
          return { view, url };
        })
      );

      setGenerationProgress(60);

      // Save all via backend in parallel
      const results = await Promise.all(
        uploadedEntries.map(({ view, url }) =>
          apiClient.addExternalImages({
            images: [{ url }],
            prompt,
            generation_method: 'reference',
            remove_background: false, // Already processed by MVE pipeline (rembg already applied)
            realm: 'shoe',
            shoe_view: view,
            parent_side_id: sideId,
            parent_ids: [sideId],
          })
        )
      );

      for (const result of results) {
        mergeImages(result.images);
      }

      setGenerationProgress(90);

      // Enable visibility for any new satellite views
      const viewsToEnable = satelliteEntries.map(([v]) => v);
      if (viewsToEnable.length > 0) {
        useAppStore.getState().enableSatelliteViews(viewsToEnable);
      }

      // Clear MVE history so re-opening starts with a clean slate
      useAppStore.getState().clearMultiViewHistory(sideId);
    } catch (err) {
      console.error('Multi-View Editor save failed:', err);
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
      setMultiViewTarget(null);
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
          briefConstraint: extractBriefConstraint(useAppStore.getState().briefFields),
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
    apiClient.logEvent('file_upload', { shoeCount: shoes.length, referenceCount: references.length, totalCount: total });
    console.log(`Loading ${shoes.length} shoes + ${references.length} references...`);
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

  // Snapshot of reference images for the prompt dialog — set once when dialog opens,
  // NOT live-updated from selectedImageIds (prevents background generation from hijacking refs)
  const [promptDialogImages, setPromptDialogImages] = useState<ImageData[]>([]);

  // Helper: resolve selected IDs to side-view images (3/4 satellites → parent)
  const resolveRefImages = useCallback((sourceIds: number[]) => {
    if (sourceIds.length === 0) return [];
    const resolvedIds = new Set<number>();
    const allImgs = useAppStore.getState().images;
    for (const id of sourceIds) {
      const img = allImgs.find(i => i.id === id);
      if (!img) continue;
      if (img.shoe_view && img.shoe_view !== 'side' && img.parent_side_id != null && img.parent_side_id > 0) {
        resolvedIds.add(img.parent_side_id);
      } else {
        resolvedIds.add(id);
      }
    }
    return allImgs.filter(img => resolvedIds.has(img.id));
  }, []);

  const handleGenerateFromReferenceClick = () => {
    // Use selected images, or if none selected, single image ID will be set
    // The promptDialogImages computed property handles this
    if (selectedImageIds.length === 0 && promptDialogImageId === null) {
      console.warn("No images selected for reference generation");
      return;
    }
    // Snapshot reference images NOW — immune to later selection changes
    const sourceIds = selectedImageIds.length > 0
      ? selectedImageIds
      : promptDialogImageId !== null ? [promptDialogImageId] : [];
    setPromptDialogImages(resolveRefImages(sourceIds));
    setShowPromptDialog(true);
  };

  const handlePromptDialogGenerate = async (
    referenceIds: number[],
    prompt: string,
    numImages: number = 1,
    shoeType?: string,
  ) => {
    console.log(
      `Generating from ${referenceIds.length} reference(s) with prompt: "${prompt}", count: ${numImages}`
    );

    // Check if fal.ai is configured
    if (!falClient.isConfigured()) {
      alert(
        "fal.ai API key not configured. Please set FAL_KEY in backend .env file."
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
      { id: 'genviews', label: 'Generate satellite views (template sheets)', status: 'pending' as const },
      { id: 'project', label: 'Project to semantic canvas', status: 'pending' },
    ]);
    ps.addLogLine(`Prompt: "${prompt.substring(0, 60)}${prompt.length > 60 ? '…' : ''}"`);
    ps.addLogLine(`Using ${referenceIds.length} reference image${referenceIds.length > 1 ? 's' : ''} as conditioning`);

    try {
      // Resolve 3/4 satellite views to their parent side views
      // Side view is the source of truth; 3/4 views are only for visualization
      const allImgs = useAppStore.getState().images;
      const imgMap = new Map(allImgs.map(img => [img.id, img]));
      const resolvedIds = new Set<number>();
      for (const id of referenceIds) {
        const img = imgMap.get(id);
        if (!img) continue;
        if (img.shoe_view && img.shoe_view !== 'side' && img.parent_side_id != null && img.parent_side_id > 0) {
          // Resolve to parent side view
          resolvedIds.add(img.parent_side_id);
          ps.addLogLine(`Resolved 3/4 view #${id} → side view #${img.parent_side_id}`);
        } else {
          resolvedIds.add(id);
        }
      }
      const selectedImages = Array.from(resolvedIds)
        .map(id => imgMap.get(id))
        .filter(Boolean) as typeof images;

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
        briefConstraint: buildBriefConstraint(shoeType),
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
        remove_background: true,
        realm: 'shoe',
        shoe_view: 'side',
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

      // Update parent images' children arrays so genealogy lines show on canvas
      const newChildIds = addResult.images.map((img: any) => img.id);
      for (const pid of parentIds) {
        const parent = useAppStore.getState().images.find((img) => img.id === pid);
        if (parent) {
          const updatedChildren = [...(parent.children || []), ...newChildIds.filter((c: number) => !parent.children.includes(c))];
          updateImage(pid, { children: updatedChildren });
        }
      }

      const sideIds: number[] = addResult?.images?.length > 0
        ? addResult.images.map((img: any) => img.id)
        : [];

      if (sideIds.length > 0) {
        // Only auto-select if no generation dialog is currently open
        const anyDialogOpen = anyDialogOpenRef.current;
        if (!anyDialogOpen) {
          useAppStore.getState().setSelectedImageIds(sideIds);
        }
        useAppStore.getState().setImagesLayer(sideIds, 'default');
        const curIsolated = useAppStore.getState().isolatedImageIds;
        if (curIsolated !== null) {
          useAppStore.getState().setIsolatedImageIds([...curIsolated, ...sideIds]);
        }
        ps.addLogLine(`✓ ${sideIds.length} image${sideIds.length > 1 ? 's' : ''} placed on canvas (parents: [${parentIds.join(', ')}])`);
      }

      // ── Generate all satellite views via template sheets (skip in study mode) ──
      if (sideIds.length > 0 && !useAppStore.getState().studyMode) {
        ps.updateStepStatus('genviews', 'active');
        ps.addLogLine(`Generating all satellite views for ${sideIds.length} shoe${sideIds.length > 1 ? 's' : ''}...`);

        const allImgsForViews = images.concat(addResult.images.map((img: any) => img));
        const imgMapForViews = new Map(allImgsForViews.map((img: any) => [img.id, img]));

        for (let si = 0; si < sideIds.length; si++) {
          const sideId = sideIds[si];
          const sideImg = imgMapForViews.get(sideId);
          if (!sideImg?.base64_image) continue;

          ps.addLogLine(`  → Generating views for shoe ${si + 1}/${sideIds.length}...`);

          try {
            const satelliteViews = await generateAllViews({
              sideImageBase64: sideImg.base64_image,
              prompt,
              onProgress: (label, pct) => {
                ps.addLogLine(`    ${label}`);
                ps.updateProgress(80 + (pct / 100) * 15 * ((si + 1) / sideIds.length));
              },
            });

            for (const [viewType, genView] of Object.entries(satelliteViews)) {
              if (viewType === 'side') continue; // side already saved
              ps.addLogLine(`    → Saving ${viewType} view (${genView.w}×${genView.h})...`);
              const viewBlob = await (await fetch(`data:image/png;base64,${genView.base64}`)).blob();
              const viewFile = new File([viewBlob], `${viewType}-${sideId}.png`, { type: "image/png" });
              const viewUrl = await falClient.uploadFile(viewFile);

              const satResult = await apiClient.addExternalImages({
                images: [{ url: viewUrl }],
                prompt,
                generation_method: "reference",
                remove_background: true,
                realm: 'shoe',
                shoe_view: viewType as any,
                parent_side_id: sideId,
                parent_ids: [sideId],
              });
              mergeImages(satResult.images);
              if (satResult.images.length > 0) {
                useAppStore.getState().setImagesLayer(
                  satResult.images.map((img: any) => img.id),
                  'default'
                );
              }
            }
          } catch (viewErr) {
            console.error(`Failed to generate views for shoe ${sideId}:`, viewErr);
            ps.addLogLine(`  ⚠ View generation failed for shoe ${si + 1}, continuing...`);
          }
        }
        ps.updateStepStatus('genviews', 'done');
        ps.addLogLine(`✓ All satellite views generated`);
        useAppStore.getState().enableSatelliteViews(SATELLITE_VIEWS);
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

      // Snapshot current axes before replacing
      useAppStore.getState().pushAxisHistory();
      // Update both axis labels AND images with new coordinates
      useAppStore.getState().setAxisLabels(state.axis_labels);
      setImages(state.images);
      setHistoryGroups(state.history_groups);
      // Reset canvas bounds so SemanticCanvas recalculates from new coordinates
      useAppStore.getState().resetCanvasBounds();

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
        // If Multi-View Editor is open, close it instead of other actions
        if (multiViewTarget) {
          setMultiViewTarget(null);
          return;
        }
        setPromptDialogImageId(null);
        setShowPromptDialog(false);
        // floatingPanelPos removed
        setShowRadialDial(false);
        clearSelection(); // Also clear selection to close dialogs
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [clearSelection, multiViewTarget]);
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
            {/* Empty canvas guidance overlay */}
            {isInitialized && images.length === 0 && (
              <div className="empty-canvas-overlay">
                <p className="empty-canvas-message">
                  Start exploring — middle-click anywhere or use a button below
                </p>
                <div className="empty-canvas-actions">
                  <button
                    className="empty-canvas-btn empty-canvas-btn-primary"
                    onClick={() => setShowTextToImageDialog(true)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                    </svg>
                    Generate New Shoe
                  </button>
                  <button
                    className="empty-canvas-btn"
                    onClick={() => setShowExternalImageLoader(true)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Load Files
                  </button>
                </div>
                <div className="empty-canvas-inspiration">
                  <p className="empty-canvas-inspiration-label">or set a design direction →</p>
                  <div className="empty-canvas-chips">
                    {[
                      { label: '🌿  Material Shift', brief: 'I want to explore how a shoe concept shifts across a Biomimetic Organic ↔ Machined Aerospace axis — building out the design space between these two material extremes.' },
                      { label: '🌳  Branch a Lineage', brief: 'Start with a single baseline shoe and branch it into a large family of variations. I want to explore how small design decisions diverge into very different directions across multiple generations.' },
                      { label: '⚡  Opposite Worlds', brief: 'I want to combine two opposite design directions — one highly geometric and structural, one fluid and organic — and explore the creative space between them.' },
                    ].map(({ label, brief }) => (
                      <button
                        key={label}
                        className="empty-canvas-chip"
                        onClick={() => commitBriefExternal(brief)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {/* Canvas view toggle (Semantic | Lineage) */}
            <CanvasViewToggle />
            {/* Axis Tuning Rail overlay */}
            <AxisTuningRail />
            {/* Conditionally render canvas based on view mode */}
            {canvasViewMode === 'lineage' ? (
              <LineageCanvas
                onSelectionChange={React.useCallback((_x: number, _y: number, _count: number) => {
                  // Selection tracking handled by store (selectedImageIds)
                }, [])}
                onMiddleClick={React.useCallback((x: number, y: number) => {
                  setRadialDialPos({ x, y });
                  setShowRadialDial(true);
                }, [])}
              />
            ) : is3DMode ? (
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
                onGenerate={async (prompt, count, shoeType) => {
                  setShowTextToImageDialog(false);
                  setIsGenerating(true);
                  const ps = useProgressStore.getState();
                  ps.showProgress("generating", `Generating ${count} shoe${count > 1 ? 's' : ''} + all views...`, true);
                  ps.updateProgress(0);
                  ps.setSteps([
                    { id: 'gen',      label: `Generate ${count} side view${count > 1 ? 's' : ''} via fal.ai`, status: 'active' },
                    { id: 'embed',    label: `Embed with Jina CLIP v2`, status: 'pending' },
                    { id: 'genviews', label: `Generate satellite views (template sheets)`, status: 'pending' as const },
                    { id: 'project',  label: 'Project to semantic canvas', status: 'pending' as const },
                  ]);
                  ps.addLogLine(`Prompt: "${prompt.substring(0, 60)}${prompt.length > 60 ? '…' : ''}"`);

                  try {
                    if (!falClient.isConfigured()) {
                      alert(
                        "fal.ai API key not configured. Please set FAL_KEY in backend .env file."
                      );
                      setIsGenerating(false);
                      useProgressStore.getState().hideProgress();
                      return;
                    }

                    // ── 1. Generate side-view shoes ──────────────────────────
                    ps.addLogLine(`Requesting ${count} shoe${count > 1 ? 's' : ''} from fal.ai nano-banana...`);
                    const result = await falClient.generateTextToImage({
                      prompt,
                      num_images: count,
                      output_format: "jpeg",
                      genConfig: { realm: 'shoe', shoeView: 'side' },
                      briefConstraint: buildBriefConstraint(shoeType),
                    });
                    ps.addLogLine(`✓ fal.ai returned ${result.images.length} image${result.images.length > 1 ? 's' : ''}`);
                    ps.updateProgress(25);
                    ps.updateStepStatus('gen', 'done');
                    ps.updateStepStatus('embed', 'active');

                    ps.addLogLine(`Embedding with Jina CLIP v2...`);
                    ps.addLogLine('Background removal enabled for all views');
                    const addResult = await apiClient.addExternalImages({
                      images: result.images.map((img) => ({ url: img.url })),
                      prompt: prompt,
                      generation_method: "batch",
                      remove_background: true,
                      realm: 'shoe',
                      shoe_view: 'side',
                    });
                    ps.addLogLine(`✓ CLIP embeddings computed (1024-dim)`);
                    ps.updateProgress(40);
                    ps.updateStepStatus('embed', 'done');

                    mergeImages(addResult.images);
                    if (addResult.history_group) addHistoryGroup(addResult.history_group);

                    const sideIds: number[] = addResult?.images?.length > 0
                      ? addResult.images.map((img: any) => img.id)
                      : [];

                    if (sideIds.length > 0) {
                      const anyDialogOpen = anyDialogOpenRef.current;
                      if (!anyDialogOpen) {
                        useAppStore.getState().setSelectedImageIds(sideIds);
                      }
                      useAppStore.getState().setImagesLayer(sideIds, 'default');
                      const curIsolated = useAppStore.getState().isolatedImageIds;
                      if (curIsolated !== null) {
                        useAppStore.getState().setIsolatedImageIds([...curIsolated, ...sideIds]);
                      }
                      ps.addLogLine(`✓ ${sideIds.length} shoe${sideIds.length > 1 ? 's' : ''} placed on canvas`);
                    }

                    addToExplorationCounter(count);
                    addToAxisSuggestionCounter(count);
                    triggerConcurrentGhosts(prompt, [], []).catch(console.error);

                    // ── 2. Generate satellite views via template sheets (skip in study mode) ──
                    if (sideIds.length > 0 && !useAppStore.getState().studyMode) {
                      ps.updateStepStatus('genviews', 'active');
                      ps.addLogLine(`Generating all satellite views for ${sideIds.length} shoe${sideIds.length > 1 ? 's' : ''}...`);

                      const allImages = images.concat(
                        addResult.images.map((img: any) => img)
                      );
                      const imageMap = new Map(allImages.map((img: any) => [img.id, img]));

                      for (let si = 0; si < sideIds.length; si++) {
                        const sideId = sideIds[si];
                        const sideImg = imageMap.get(sideId);
                        if (!sideImg?.base64_image) continue;

                        ps.addLogLine(`  → Generating views for shoe ${si + 1}/${sideIds.length}...`);

                        try {
                          const satelliteViews = await generateAllViews({
                            sideImageBase64: sideImg.base64_image,
                            prompt,
                            onProgress: (label, pct) => {
                              ps.addLogLine(`    ${label}`);
                              ps.updateProgress(40 + (pct / 100) * 50 * ((si + 1) / sideIds.length));
                            },
                          });

                          // Save each satellite view (normalized)
                          for (const [viewType, genView] of Object.entries(satelliteViews)) {
                            if (viewType === 'side') continue; // side already saved
                            ps.addLogLine(`    → Saving ${viewType} view (${genView.w}×${genView.h})...`);
                            const viewBlob = await (await fetch(`data:image/png;base64,${genView.base64}`)).blob();
                            const viewFile = new File([viewBlob], `${viewType}-${sideId}.png`, { type: "image/png" });
                            const viewUrl = await falClient.uploadFile(viewFile);

                            const satResult = await apiClient.addExternalImages({
                              images: [{ url: viewUrl }],
                              prompt,
                              generation_method: "reference",
                              remove_background: true,
                              realm: 'shoe',
                              shoe_view: viewType as any,
                              parent_side_id: sideId,
                              parent_ids: [sideId],
                            });
                            mergeImages(satResult.images);
                            if (satResult.images.length > 0) {
                              useAppStore.getState().setImagesLayer(
                                satResult.images.map((img: any) => img.id),
                                'default'
                              );
                            }
                          }
                        } catch (viewErr) {
                          console.error(`Failed to generate views for shoe ${sideId}:`, viewErr);
                          ps.addLogLine(`  ⚠ View generation failed for shoe ${si + 1}, continuing...`);
                        }
                      }
                      ps.updateStepStatus('genviews', 'done');
                      ps.addLogLine(`✓ All satellite views generated`);
                      useAppStore.getState().enableSatelliteViews(SATELLITE_VIEWS);
                    }

                    ps.updateStepStatus('project', 'done');
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

            {/* Mood Board Dialog */}
            {showMoodBoardDialog && (
              <MoodBoardDialog
                onClose={() => setShowMoodBoardDialog(false)}
                referenceImages={selectedImageIds.length > 0
                  ? (() => {
                      // Resolve 3/4 views to parent side views
                      const resolvedIds = new Set<number>();
                      for (const id of selectedImageIds) {
                        const img = images.find(i => i.id === id);
                        if (!img) continue;
                        if (img.shoe_view && img.shoe_view !== 'side' && img.parent_side_id != null && img.parent_side_id > 0) {
                          resolvedIds.add(img.parent_side_id);
                        } else {
                          resolvedIds.add(id);
                        }
                      }
                      return images.filter(img => resolvedIds.has(img.id));
                    })()
                  : []}
                selectedRealmContext={selectedRealmContext}
                onGenerate={async (prompt, count, style, styleRefUrl) => {
                  setShowMoodBoardDialog(false);
                  setIsGenerating(true);
                  const ps = useProgressStore.getState();
                  ps.showProgress("generating", `Generating ${count} mood board${count > 1 ? "s" : ""}...`, true);
                  ps.updateProgress(0);
                  ps.setSteps([
                    { id: 'gen',     label: `Generate ${count} board${count > 1 ? 's' : ''} via fal.ai`, status: 'active' },
                    { id: 'embed',   label: 'Embed with Jina CLIP v2', status: 'pending' },
                    { id: 'project', label: 'Project to semantic canvas', status: 'pending' },
                  ]);
                  ps.addLogLine(`Style: "${style}" | Prompt: "${prompt.substring(0, 50)}${prompt.length > 50 ? '…' : ''}"`);

                  try {
                    if (!falClient.isConfigured()) {
                      alert("fal.ai API key not configured. Please set FAL_KEY in backend .env file.");
                      setIsGenerating(false);
                      useProgressStore.getState().hideProgress();
                      return;
                    }

                    const parentIds = selectedImageIds.length > 0 ? [...selectedImageIds] : [];

                    // Upload reference images if selected
                    let imageUrls: string[] = [];
                    if (styleRefUrl) {
                      imageUrls = [styleRefUrl];
                    } else if (parentIds.length > 0) {
                      ps.addLogLine(`Uploading ${parentIds.length} reference image${parentIds.length > 1 ? 's' : ''}...`);
                      const refImgs = images.filter(img => parentIds.includes(img.id));
                      for (const img of refImgs.slice(0, 4)) {
                        const blob = await (await fetch(`data:image/png;base64,${img.base64_image}`)).blob();
                        const file = new File([blob], `ref-${img.id}.png`, { type: "image/png" });
                        imageUrls.push(await falClient.uploadFile(file));
                      }
                    }

                    ps.addLogLine(`Requesting ${count} mood board${count > 1 ? 's' : ''} from fal.ai...`);
                    const result = imageUrls.length > 0
                      ? await falClient.generateImageEdit({
                          prompt,
                          image_urls: imageUrls,
                          num_images: count,
                          output_format: "jpeg",
                          genConfig: { realm: 'mood-board', moodBoardStyle: style },
                        })
                      : await falClient.generateTextToImage({
                          prompt,
                          num_images: count,
                          output_format: "jpeg",
                          genConfig: { realm: 'mood-board', moodBoardStyle: style },
                        });

                    ps.addLogLine(`✓ fal.ai returned ${result.images.length} board${result.images.length > 1 ? 's' : ''}`);
                    ps.updateProgress(50);
                    ps.updateStepStatus('gen', 'done');
                    ps.updateStepStatus('embed', 'active');

                    ps.addLogLine('Embedding with Jina CLIP v2...');
                    // Mood boards: never remove background
                    const addResult = await apiClient.addExternalImages({
                      images: result.images.map((img) => ({ url: img.url })),
                      prompt,
                      generation_method: parentIds.length > 0 ? "reference" : "batch",
                      remove_background: false,
                      realm: 'mood-board',
                      ...(parentIds.length > 0 ? { parent_ids: parentIds } : {}),
                    });
                    ps.addLogLine(`✓ CLIP embeddings computed`);
                    ps.updateProgress(80);
                    ps.updateStepStatus('embed', 'done');
                    ps.updateStepStatus('project', 'active');

                    mergeImages(addResult.images);
                    if (addResult.history_group) addHistoryGroup(addResult.history_group);

                    if (addResult?.images?.length > 0) {
                      const newIds = addResult.images.map((img: any) => img.id);
                      const anyDialogOpen = anyDialogOpenRef.current;
                      if (!anyDialogOpen) {
                        useAppStore.getState().setSelectedImageIds(newIds);
                      }
                      // Assign to mood-boards layer
                      useAppStore.getState().setImagesLayer(newIds, 'mood-boards');
                      const curIsolated = useAppStore.getState().isolatedImageIds;
                      if (curIsolated !== null) {
                        useAppStore.getState().setIsolatedImageIds([...curIsolated, ...newIds]);
                      }
                      ps.addLogLine(`✓ ${newIds.length} board${newIds.length > 1 ? 's' : ''} placed on canvas (Mood Boards layer)`);
                    }
                    ps.updateStepStatus('project', 'done');

                    addToExplorationCounter(count);
                    addToAxisSuggestionCounter(count);
                    triggerConcurrentGhosts(prompt, parentIds, imageUrls).catch(console.error);

                    ps.updateProgress(100);
                  } catch (error) {
                    console.error("Mood board generation failed:", error);
                    useProgressStore.getState().hideProgress();
                    alert(`Generation failed: ${error instanceof Error ? error.message : String(error)}`);
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
                  apiClient.logEvent('delete', { deletedIds: ids, count: ids.length });
                  ids.forEach((id) => {
                    useAppStore.getState().removeImage(id);
                    apiClient.deleteImage(id).catch(() => {});
                  });
                  clearSelection();
                },
                { confirmLabel: "Remove", danger: true }
              );
            }}
            onOpenMultiViewEditor={(sideImage, satellites) => {
              setMultiViewTarget({ sideImage, satellites });
            }}
          />
          <LayersSidebar />
        </div>

        {/* Bottom Drawer */}
        <BottomDrawer />
      </div>

      {/* Login — shown on direct URL access (no ?participant= param) */}
      {showLoginPrompt && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#161b22', border: '1px solid #30363d', borderRadius: '12px',
            padding: '36px 40px', width: '360px', display: 'flex', flexDirection: 'column', gap: '16px',
          }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#e6edf3' }}>Sign in</div>
            <div style={{ fontSize: '12px', color: '#8b949e', lineHeight: 1.5 }}>
              Enter the username and password provided by the researcher.
            </div>
            <input
              autoFocus
              type="text"
              placeholder="Username"
              value={loginUsername}
              onChange={(e) => { setLoginUsername(e.target.value); setLoginError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (document.getElementById('login-password-input') as HTMLInputElement)?.focus(); }}
              style={{
                padding: '9px 12px', borderRadius: '8px',
                border: `1px solid ${loginError ? '#f85149' : '#30363d'}`, background: '#0d1117',
                color: '#e6edf3', fontSize: '13px', outline: 'none',
              }}
            />
            <input
              id="login-password-input"
              type="password"
              placeholder="Password"
              value={loginPassword}
              onChange={(e) => { setLoginPassword(e.target.value); setLoginError(''); }}
              onKeyDown={async (e) => {
                if (e.key !== 'Enter' || !loginUsername.trim() || !loginPassword.trim()) return;
                try {
                  await handleLogin(loginUsername.trim(), loginPassword.trim());
                } catch {
                  setLoginError('Invalid username or password');
                }
              }}
              style={{
                padding: '9px 12px', borderRadius: '8px',
                border: `1px solid ${loginError ? '#f85149' : '#30363d'}`, background: '#0d1117',
                color: '#e6edf3', fontSize: '13px', outline: 'none',
              }}
            />
            {loginError && (
              <div style={{ fontSize: '12px', color: '#f85149' }}>{loginError}</div>
            )}
            <button
              disabled={!loginUsername.trim() || !loginPassword.trim()}
              onClick={async () => {
                setLoginError('');
                try {
                  await handleLogin(loginUsername.trim(), loginPassword.trim());
                } catch {
                  setLoginError('Invalid username or password');
                }
              }}
              style={{
                padding: '9px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
                background: loginUsername.trim() && loginPassword.trim() ? '#388bfd' : '#1c2a3a',
                border: '1px solid #388bfd',
                color: loginUsername.trim() && loginPassword.trim() ? '#fff' : '#555',
                fontWeight: 600,
              }}
            >
              Sign in
            </button>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        showLabels={showLabels}
        backgroundColor={backgroundColor}
        onToggleLabels={() => setShowLabels(!showLabels)}
        onBackgroundColorChange={setBackgroundColor}
        ghostCount={ghostCount}
        onGhostCountChange={setGhostCount}
      />

      <ExplorationTreeModal
        isOpen={showExplorationTreeModal}
        onClose={() => setShowExplorationTreeModal(false)}
      />

      {/* Floating feedback notepad — always visible for study participants */}
      <FeedbackNotepad />

      {/* Multi-View Editor overlay */}
      {multiViewTarget && (
        <MultiViewEditor
          sideViewImage={multiViewTarget.sideImage}
          satelliteViews={multiViewTarget.satellites}
          onClose={() => setMultiViewTarget(null)}
          onSave={handleMultiViewSave}
        />
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
            label: selectedRealmContext === 'mood-board'
              ? "Render from Board"
              : selectedRealmContext === 'mixed'
              ? "Render from Board"
              : selectedImageIds.length > 0
              ? "Iterate from Reference"
              : "New Shoe",
            description:
              selectedRealmContext === 'mood-board' || selectedRealmContext === 'mixed'
                ? `Consolidate ${selectedImageIds.length} board(s) into a shoe render`
                : selectedImageIds.length > 0
                ? `Generate shoe variation from ${selectedImageIds.length} reference(s)`
                : "Generate a new shoe render from text",
            category: "image",
            onClick: () =>
              selectedImageIds.length > 0
                ? handleGenerateFromReferenceClick()
                : setShowTextToImageDialog(true),
          },
          {
            id: "mood-board",
            icon: "🎨",
            label: selectedRealmContext === 'shoe'
              ? "Abstract from Shoes"
              : selectedRealmContext === 'mixed'
              ? "Abstract from Shoes"
              : selectedImageIds.length > 0
              ? "Iterate Board"
              : "New Mood Board",
            description:
              selectedRealmContext === 'shoe' || selectedRealmContext === 'mixed'
                ? `Abstract ${selectedImageIds.length} shoe(s) into a concept board`
                : selectedImageIds.length > 0
                ? "Iterate on selected mood board(s)"
                : "Generate a concept sketch or mood board",
            category: "image",
            onClick: () => setShowMoodBoardDialog(true),
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
            id: "hide",
            icon: "👁️",
            label: hiddenImageIds.length > 0 && selectedImageIds.length === 0
              ? `Unhide All (${hiddenImageIds.length})`
              : "Hide",
            description:
              selectedImageIds.length > 0
                ? `Temporarily hide ${selectedImageIds.length} selected image(s)`
                : hiddenImageIds.length > 0
                ? `Unhide all ${hiddenImageIds.length} hidden image(s)`
                : "No images selected to hide",
            category: "global",
            onClick: () => {
              if (selectedImageIds.length > 0) {
                useAppStore.getState().hideImages([...selectedImageIds]);
              } else if (hiddenImageIds.length > 0) {
                useAppStore.getState().unhideAll();
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
            category: "danger",
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
            id: "export",
            icon: "↓",
            label: selectedImageIds.length > 0 ? `Save ${selectedImageIds.length} Image${selectedImageIds.length !== 1 ? 's' : ''}` : "Save Image",
            description: selectedImageIds.length > 0
              ? `Download ${selectedImageIds.length} selected image(s) to disk`
              : "Select images first to save them",
            category: "system",
            onClick: () => {
              const imgs = images.filter(img => selectedImageIds.includes(img.id));
              if (imgs.length === 0) return;
              imgs.forEach((img) => {
                const a = document.createElement('a');
                a.href = `data:image/png;base64,${img.base64_image}`;
                a.download = `shoe_${img.id}.png`;
                a.click();
              });
            },
          },
          {
            id: "settings",
            icon: "🔧",
            label: "Settings",
            description: "App & visual preferences",
            category: "system",
            onClick: () => setShowSettingsModal(true),
          },
        ].filter(a => !useAppStore.getState().studyMode || a.id !== 'mood-board') as import('./components/RadialDial/RadialDial').RadialDialAction[]}
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
