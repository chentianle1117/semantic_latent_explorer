/**
 * Zustand store for application state
 * Matches the artifact's interaction model
 */

import { create } from 'zustand';
import type { AppState, ImageData, HistoryGroup, VisualSettings, CanvasBounds, AgentInsight, AgentStatus, AgentMode, GhostNode, CanvasLayer, CanvasMeta, EventLogEntry, BriefField, BriefSuggestedParam, MinimapDot, ViewportRect, MultiViewHistoryEntry } from '../types';
import { apiClient } from '../api/client';

interface AppStore extends AppState {
  // Actions
  setImages: (images: ImageData[]) => void;
  addImages: (images: ImageData[]) => void;
  mergeImages: (newImages: ImageData[]) => void;
  updateImage: (id: number, updates: Partial<ImageData>) => void;
  removeImage: (id: number) => void;
  restoreImageLocally: (id: number) => void;
  clearDeletedStack: () => void;

  setHistoryGroups: (groups: HistoryGroup[]) => void;
  addHistoryGroup: (group: HistoryGroup) => void;

  setSelectedImageIds: (ids: number[]) => void;
  toggleImageSelection: (id: number, ctrlKey: boolean) => void;
  clearSelection: () => void;

  setHoveredImageId: (id: number | null) => void;
  setHoveredGroupId: (groupId: string | null) => void;

  updateVisualSettings: (settings: Partial<VisualSettings>) => void;
  setImageSizeOverrides: (ids: number[], size: number) => void;
  setImageOpacityOverrides: (ids: number[], opacity: number) => void;
  clearImageOverrides: () => void;

  setAxisLabels: (labels: { x: [string, string]; y: [string, string]; z?: [string, string] }) => void;
  pushAxisHistory: () => void; // Snapshot current axisLabels into history before changing
  restoreAxisFromHistory: (index: number) => void; // Restore a specific history entry

  setCanvasBounds: (bounds: CanvasBounds | null) => void;
  resetCanvasBounds: () => void; // Trigger rescale on next render

  setIsGenerating: (isGenerating: boolean) => void;
  setIsInitialized: (isInitialized: boolean) => void;
  setGenerationProgress: (progress: number | ((prev: number) => number)) => void;
  setGenerationCount: (current: number, total: number) => void;

  setRemoveBackground: (remove: boolean) => void;
  setStudyMode: (on: boolean) => void;

  setIs3DMode: (is3D: boolean) => void;

  // UI layout
  setIsInspectorCollapsed: (collapsed: boolean) => void;
  setIsDrawerExpanded: (expanded: boolean) => void;
  setIsHistoryExpanded: (expanded: boolean) => void;
  setIsLayersExpanded: (expanded: boolean) => void;
  setActiveToolbarFlyout: (flyout: string | null) => void;
  setFlyToImageId: (id: number | null) => void;

  // Minimap
  setMinimapDots: (dots: MinimapDot[]) => void;
  setMinimapGhostDots: (dots: MinimapDot[]) => void;
  setMinimapViewport: (rect: ViewportRect | null) => void;
  setMinimapCanvasSize: (size: { w: number; h: number } | null) => void;
  setMinimapPanRequest: (req: { centerX: number; centerY: number } | null) => void;

  // Agent — DynamicIsland state
  agentStatus: AgentStatus;
  agentInsights: AgentInsight[];
  isAgentWorking: boolean;
  agentWorkingLabel: string;
  setAgentStatus: (status: AgentStatus) => void;
  addAgentInsight: (insight: AgentInsight) => void;
  dismissInsight: () => void; // removes the oldest insight
  setIsAgentWorking: (v: boolean) => void;
  setAgentWorkingLabel: (label: string) => void;

  // Agent — exploration accumulator (Behavior C trigger)
  imagesSinceLastExploration: number;
  addToExplorationCounter: (count: number) => void;
  resetExplorationCounter: () => void;

  // Agent — axis suggestion accumulator (Behavior D trigger: every 20 images)
  imagesSinceLastAxisSuggestion: number;
  addToAxisSuggestionCounter: (count: number) => void;
  resetAxisSuggestionCounter: () => void;

  // Agent mode (kept for SettingsModal compat)
  setAgentMode: (mode: AgentMode) => void;

  // Ghost nodes — real generated images shown semi-transparent on canvas
  addGhostNode: (ghost: GhostNode) => void;
  removeGhostNode: (id: number) => void;
  clearGhostNodes: () => void;
  acceptGhostNode: (id: number) => void;

  // CLIP model selection
  setClipModelType: (modelType: 'fashionclip' | 'huggingface') => void;

  // Axis update progress
  setIsUpdatingAxes: (isUpdating: boolean) => void;
  setAxisUpdateProgress: (progress: number) => void;

  // Gemini-expanded concepts (from backend)
  setExpandedConcepts: (c: { x_negative?: string[]; x_positive?: string[]; y_negative?: string[]; y_positive?: string[] } | undefined) => void;

  // Design brief
  setDesignBrief: (brief: string | null) => void;

  // Inline axis suggestions (decoupled from agentInsight)
  setInlineAxisData: (data: Array<{ x_axis: string; y_axis: string; reasoning: string }> | null) => void;
  clearInlineAxisData: () => void;

  // Layer system
  addLayer: (name: string) => string;
  removeLayer: (id: string) => void;
  renameLayer: (id: string, name: string) => void;
  toggleLayerVisibility: (id: string) => void;
  setImageLayer: (imageId: number, layerId: string) => void;
  setImagesLayer: (imageIds: number[], layerId: string) => void;
  moveLayerUp: (id: string) => void;
  moveLayerDown: (id: string) => void;
  reorderLayers: (fromIndex: number, toIndex: number) => void;

  clearAll: () => void;

  // Isolate mode
  setIsolatedImageIds: (ids: number[] | null) => void;

  // Hide images (blacklist, separate from delete)
  hideImages: (ids: number[]) => void;
  unhideImages: (ids: number[]) => void;
  unhideAll: () => void;

  // Shoe view filter toggles
  toggleSatelliteView: (viewType: string) => void;
  enableSatelliteViews: (views: string[]) => void;

  // Star ratings
  setImageRating: (imageId: number, rating: number) => void;
  setStarFilter: (n: number | null) => void;

  // Design brief glow
  setIsAgentUsingBrief: (v: boolean) => void;

  // Structured brief fields
  setBriefFields: (fields: BriefField[]) => void;
  setBriefSuggestedParams: (params: BriefSuggestedParam[]) => void;
  setBriefInterpretation: (text: string | null) => void;
  setBriefLoading: (v: boolean) => void;
  updateBriefFieldValue: (key: string, value: string) => void;
  addBriefField: (param: BriefSuggestedParam) => void;
  removeBriefField: (key: string) => void;

  // Session / Multi-Canvas
  setCurrentCanvasId: (id: string | null) => void;
  setCanvasName: (name: string) => void;
  setParticipantId: (id: string) => void;
  setCanvasList: (list: CanvasMeta[]) => void;
  addEventLogEntry: (entry: EventLogEntry) => void;

  // Onboarding tutorial
  setOnboardingActive: (active: boolean) => void;
  setOnboardingSpotlight: (stepId: string | null) => void;
  completeOnboardingStep: (stepId: string) => void;
  dismissOnboarding: () => void;
  undismissOnboarding: () => void;
  resetOnboarding: (canvasId?: string) => void;
  loadOnboardingState: (canvasId: string) => void;
  showSectionTransition: (key: string | null) => void;

  // Multi-View Editor history
  pushMultiViewHistory: (sideId: number, entry: MultiViewHistoryEntry) => void;
  clearMultiViewHistory: (sideId: number) => void;

  // Bottom drawer tab — in store so handleClearCanvas can collapse it
  drawerActiveTab: 'history' | 'lineage' | null;
  setDrawerActiveTab: (tab: 'history' | 'lineage' | null) => void;

  /** Reset all transient UI state (panels, ghosts, agent) — called on Clear Canvas */
  resetTransientUIState: () => void;
}

const initialState: AppState = {
  images: [],
  historyGroups: [],
  axisLabels: {
    x: ['formal', 'sporty'],
    y: ['dark', 'colorful'],
    z: ['casual', 'elegant'],  // New: default z-axis labels
  },
  axisHistory: [],
  selectedImageIds: [],
  hoveredImageId: null,
  hoveredGroupId: null,
  visualSettings: {
    imageSize: 120,
    imageOpacity: 1.0,
    removeBackground: true,
    layoutPadding: 0.2, // 20% padding by default (reduces clutter)
    coordinateScale: 1.4, // Scale multiplier for coordinates (affects spacing — 1.4 spreads images further apart)
    coordinateOffset: [0, 0, 0], // Offset for recentering [x, y, z]
    axisScaleX: 1.0, // Stretch X from center (1 = no stretch)
    axisScaleY: 1.0, // Stretch Y from center (1 = no stretch)
    contourStrength: 6, // 1–10, contour highlight thickness (higher = more visible)
    showGenealogyOnCanvas: false, // Show parent/child lines on canvas (default off to reduce clutter)
  },
  canvasBounds: null, // Will auto-calculate on first render
  clusterCentroids: [], // Cluster centers for edge bundling
  clusterLabels: [], // Cluster assignment per image
  removeBackground: true,
  studyMode: true, // Default ON: side-view only, no mood boards, no MVE
  isGenerating: false,
  isInitialized: false,
  generationProgress: 0,
  generationCurrent: 0,
  generationTotal: 0,
  is3DMode: false,

  // UI layout defaults
  isInspectorCollapsed: false,
  isDrawerExpanded: false,
  isHistoryExpanded: false,
  isLayersExpanded: false,
  activeToolbarFlyout: null,
  flyToImageId: null,

  // Minimap
  minimapDots: [] as MinimapDot[],
  minimapGhostDots: [] as MinimapDot[],
  minimapViewport: null as ViewportRect | null,
  minimapCanvasSize: null as { w: number; h: number } | null,
  minimapPanRequest: null as { centerX: number; centerY: number; id: number } | null,

  // Agent defaults
  agentStatus: 'idle' as AgentStatus,
  agentInsights: [] as AgentInsight[],
  isAgentWorking: false,
  agentWorkingLabel: 'Analyzing…',
  imagesSinceLastExploration: 0,
  imagesSinceLastAxisSuggestion: 0,
  agentMode: 'auto' as AgentMode, // kept for SettingsModal compat
  ghostNodes: [] as GhostNode[],

  // CLIP model selection
  clipModelType: 'fashionclip' as 'fashionclip' | 'huggingface',

  // Axis update progress
  isUpdatingAxes: false,
  axisUpdateProgress: 0,

  // Gemini-expanded concepts
  expandedConcepts: undefined as { x_negative?: string[]; x_positive?: string[]; y_negative?: string[]; y_positive?: string[]; z_negative?: string[]; z_positive?: string[] } | undefined,

  // Design brief
  designBrief: null as string | null,

  // Inline axis suggestions (decoupled from agentInsight so DynamicIsland dismiss doesn't kill them)
  inlineAxisData: null as Array<{ x_axis: string; y_axis: string; reasoning: string }> | null,

  // Per-image visual overrides (selection-aware sliders)
  imageSizeOverrides: {} as Record<number, number>,
  imageOpacityOverrides: {} as Record<number, number>,

  // Layer system
  layers: [
    { id: 'default', name: 'Shoes', visible: true, color: '#58a6ff' },
    { id: 'mood-boards', name: 'Mood Boards', visible: true, color: '#FF6B2B' },
    { id: 'references', name: 'References', visible: true, color: '#ff7b72' },
  ] as CanvasLayer[],
  imageLayerMap: {} as Record<number, string>,
  isolatedImageIds: null,
  hiddenImageIds: [] as number[],

  // Star ratings
  imageRatings: {} as Record<number, number>,
  starFilter: null as number | null,

  // Design brief glow
  isAgentUsingBrief: false,

  // Structured brief interpretation
  briefFields: [] as BriefField[],
  briefSuggestedParams: [] as BriefSuggestedParam[],
  briefInterpretation: null as string | null,
  briefLoading: false,

  // Deletion undo stack
  deletedImageStack: [] as ImageData[],

  // Session / Multi-Canvas
  currentCanvasId: null as string | null,
  canvasName: 'Canvas 1',
  participantId: 'researcher',
  studySessionName: '' as string,
  canvasList: [] as CanvasMeta[],
  eventLog: [] as EventLogEntry[],

  // Shoe view filter toggles
  visibleSatelliteViews: {} as Record<string, boolean>,  // all off by default

  // Multi-View Editor history (keyed by side image ID)
  multiViewHistory: {} as Record<number, MultiViewHistoryEntry[]>,

  // Onboarding tutorial
  onboardingActive: false,
  onboardingSpotlight: null as string | null,
  completedSteps: [] as string[],
  onboardingDismissed: false,
  onboardingSectionTransition: null as string | null,

  // Bottom drawer tab
  drawerActiveTab: null as 'history' | 'lineage' | null,
};

export const useAppStore = create<AppStore>((set) => ({
  ...initialState,

  // Image actions
  setImages: (images) => set({ images }),

  addImages: (newImages) =>
    set((state) => ({
      images: [...state.images, ...newImages],
    })),

  updateImage: (id, updates) =>
    set((state) => ({
      images: state.images.map((img) =>
        img.id === id ? { ...img, ...updates } : img
      ),
    })),

  removeImage: (id) =>
    set((state) => {
      const target = state.images.find((img) => img.id === id);
      return {
        images: state.images.map((img) =>
          img.id === id ? { ...img, visible: false } : img
        ),
        selectedImageIds: state.selectedImageIds.filter((sid) => sid !== id),
        // Push a snapshot to the undo stack (before it becomes invisible)
        deletedImageStack: target
          ? [{ ...target, visible: false }, ...state.deletedImageStack]
          : state.deletedImageStack,
      };
    }),

  restoreImageLocally: (id) =>
    set((state) => ({
      images: state.images.map((img) =>
        img.id === id ? { ...img, visible: true } : img
      ),
      deletedImageStack: state.deletedImageStack.filter((img) => img.id !== id),
    })),

  clearDeletedStack: () => set({ deletedImageStack: [] }),

  // Append-only image merge (used after generation to avoid full-state replacement)
  mergeImages: (newImages) =>
    set((state) => ({
      images: [...state.images, ...newImages],
    })),

  // History group actions
  setHistoryGroups: (groups) => set({ historyGroups: groups }),

  addHistoryGroup: (group) =>
    set((state) => ({
      historyGroups: [...state.historyGroups, group],
    })),

  // Selection actions (matches artifact's click behavior)
  setSelectedImageIds: (ids) => {
    console.log("📋 setSelectedImageIds called with:", ids);
    set({ selectedImageIds: ids });
  },

  toggleImageSelection: (id, _ctrlKey) =>
    set((state) => {
      console.log("🔄 toggleImageSelection called:", {
        id,
        currentSelection: state.selectedImageIds,
        isSelected: state.selectedImageIds.includes(id)
      });
      // Always additive selection - clicking an image adds it to selection
      // Clicking again removes it (toggle off)
      const isSelected = state.selectedImageIds.includes(id);
      const newSelection = isSelected
        ? state.selectedImageIds.filter((sid) => sid !== id)
        : [...state.selectedImageIds, id];
      console.log("➡️ New selection:", newSelection);
      return {
        selectedImageIds: newSelection,
      };
    }),

  clearSelection: () => set({ selectedImageIds: [] }),

  // Hover actions (matches artifact's hover behavior)
  setHoveredImageId: (id) => set({ hoveredImageId: id }),
  setHoveredGroupId: (groupId) => set({ hoveredGroupId: groupId }),

  // Visual settings
  updateVisualSettings: (settings) =>
    set((state) => ({
      visualSettings: { ...state.visualSettings, ...settings },
    })),

  // Per-image visual overrides (selection-aware sliders)
  setImageSizeOverrides: (ids: number[], size: number) =>
    set((state) => {
      const overrides = { ...state.imageSizeOverrides };
      ids.forEach((id) => { overrides[id] = size; });
      return { imageSizeOverrides: overrides };
    }),
  setImageOpacityOverrides: (ids: number[], opacity: number) =>
    set((state) => {
      const overrides = { ...state.imageOpacityOverrides };
      ids.forEach((id) => { overrides[id] = opacity; });
      return { imageOpacityOverrides: overrides };
    }),
  clearImageOverrides: () => set({ imageSizeOverrides: {}, imageOpacityOverrides: {} }),

  // Axis labels
  setAxisLabels: (labels) => set({ axisLabels: labels }),
  pushAxisHistory: () => set((state) => {
    const snapshot = { labels: { ...state.axisLabels }, timestamp: Date.now() };
    const history = [snapshot, ...state.axisHistory].slice(0, 10);
    return { axisHistory: history };
  }),
  restoreAxisFromHistory: (index) => set((state) => {
    const entry = state.axisHistory[index];
    if (!entry) return {};
    return { axisLabels: entry.labels };
  }),

  // Canvas bounds
  setCanvasBounds: (bounds) => set({ canvasBounds: bounds }),
  resetCanvasBounds: () => set({ canvasBounds: null }),

  // Loading states
  setIsGenerating: (isGenerating) => set({
    isGenerating,
    generationProgress: isGenerating ? 0 : 100,
    generationCurrent: isGenerating ? 0 : 0,
    generationTotal: isGenerating ? 0 : 0,
  }),
  setIsInitialized: (isInitialized) => set({ isInitialized }),
  setGenerationProgress: (progress) =>
    set((state) => ({
      generationProgress: typeof progress === 'function' ? progress(state.generationProgress) : progress,
    })),
  setGenerationCount: (current, total) =>
    set({ generationCurrent: current, generationTotal: total }),

  setRemoveBackground: (remove) => set({ removeBackground: remove }),
  setStudyMode: (on) => set({ studyMode: on }),

  // 3D mode
  setIs3DMode: (is3D) => set({ is3DMode: is3D }),

  // UI layout
  setIsInspectorCollapsed: (collapsed) => set({ isInspectorCollapsed: collapsed }),
  setIsDrawerExpanded: (expanded) => set({ isDrawerExpanded: expanded }),
  setIsHistoryExpanded: (expanded) => set({ isHistoryExpanded: expanded }),
  setIsLayersExpanded: (expanded) => set({ isLayersExpanded: expanded }),
  setActiveToolbarFlyout: (flyout) => set((state) => ({
    activeToolbarFlyout: state.activeToolbarFlyout === flyout ? null : flyout,
  })),
  setDrawerActiveTab: (tab) => set({ drawerActiveTab: tab }),
  resetTransientUIState: () => set({
    activeToolbarFlyout: null,
    drawerActiveTab: null,
    ghostNodes: [],
    inlineAxisData: null,
    agentStatus: 'idle',
    agentInsights: [],
    isAgentWorking: false,
  }),
  setFlyToImageId: (id) => set({ flyToImageId: id }),

  // Minimap
  setMinimapDots: (dots) => set({ minimapDots: dots }),
  setMinimapGhostDots: (dots) => set({ minimapGhostDots: dots }),
  setMinimapViewport: (rect) => set({ minimapViewport: rect }),
  setMinimapCanvasSize: (size) => set({ minimapCanvasSize: size }),
  setMinimapPanRequest: (req) => set((s) => ({
    minimapPanRequest: req
      ? { ...req, id: (s.minimapPanRequest?.id ?? 0) + 1 }
      : null,
  })),

  // Agent — DynamicIsland state
  agentStatus: 'idle',
  agentInsights: [],
  isAgentWorking: false,
  setAgentStatus: (status) => set({ agentStatus: status }),
  addAgentInsight: (insight) => set((state) => ({
    agentInsights: [...state.agentInsights, insight],
    agentStatus: 'insight-ready',
  })),
  dismissInsight: () => set((state) => {
    const remaining = state.agentInsights.slice(1); // remove oldest
    return { agentInsights: remaining, agentStatus: remaining.length > 0 ? 'insight-ready' : 'idle' };
  }),
  setIsAgentWorking: (v) => set({ isAgentWorking: v }),
  setAgentWorkingLabel: (label) => set({ agentWorkingLabel: label }),

  // Agent — exploration accumulator
  imagesSinceLastExploration: 0,
  addToExplorationCounter: (count) => set((state) => ({ imagesSinceLastExploration: state.imagesSinceLastExploration + count })),
  resetExplorationCounter: () => set({ imagesSinceLastExploration: 0 }),

  // Agent — axis suggestion accumulator (Behavior D)
  imagesSinceLastAxisSuggestion: 0,
  addToAxisSuggestionCounter: (count) => set((state) => ({ imagesSinceLastAxisSuggestion: state.imagesSinceLastAxisSuggestion + count })),
  resetAxisSuggestionCounter: () => set({ imagesSinceLastAxisSuggestion: 0 }),

  // Agent mode compat
  setAgentMode: (mode) => set({ agentMode: mode }),

  // Ghost nodes
  addGhostNode: (ghost) => set((state) => ({ ghostNodes: [...state.ghostNodes, ghost] })),
  removeGhostNode: (id) => set((state) => ({ ghostNodes: state.ghostNodes.filter(g => g.id !== id) })),
  clearGhostNodes: () => set({ ghostNodes: [] }),
  acceptGhostNode: (id) => {
    // Promote ghost to real image: move base64_image into a stub ImageData
    const store = useAppStore.getState();
    const ghost = store.ghostNodes.find(g => g.id === id);
    if (!ghost) return;
    store.removeGhostNode(id);
    // The accepted image was already generated by the backend (suggest-ghosts endpoint)
    // The actual promotion (registering server-side) is handled by the hook caller
    console.log('Ghost promoted:', ghost.prompt);
  },

  // CLIP model selection
  setClipModelType: (modelType) => set({ clipModelType: modelType }),

  // Axis update progress
  setIsUpdatingAxes: (isUpdating) => set({ isUpdatingAxes: isUpdating, axisUpdateProgress: isUpdating ? 0 : 100 }),
  setAxisUpdateProgress: (progress) => set({ axisUpdateProgress: Math.min(100, Math.max(0, progress)) }),

  // Gemini-expanded concepts
  setExpandedConcepts: (c) => set({ expandedConcepts: c }),

  // Design brief
  setDesignBrief: (brief) => set({ designBrief: brief }),

  // Inline axis suggestions (persists independently of agentInsight)
  setInlineAxisData: (data: Array<{ x_axis: string; y_axis: string; reasoning: string }> | null) => set({ inlineAxisData: data }),
  clearInlineAxisData: () => set({ inlineAxisData: null }),

  // Layer system
  addLayer: (name) => {
    const id = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const colors = ['#f0883e', '#3fb950', '#a371f7', '#ec6547', '#d2a022', '#58a6ff'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const newLayer: CanvasLayer = { id, name, visible: true, color };
    set((state) => ({ layers: [...state.layers, newLayer] }));
    return id;
  },

  removeLayer: (id) =>
    set((state) => {
      if (id === 'default') return state; // can't remove default
      const newMap = { ...state.imageLayerMap };
      Object.entries(newMap).forEach(([imgId, lid]) => {
        if (lid === id) newMap[Number(imgId)] = 'default';
      });
      return { layers: state.layers.filter((l) => l.id !== id), imageLayerMap: newMap };
    }),

  renameLayer: (id, name) =>
    set((state) => ({
      layers: state.layers.map((l) => (l.id === id ? { ...l, name } : l)),
    })),

  toggleLayerVisibility: (id) =>
    set((state) => ({
      layers: state.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
    })),

  setImageLayer: (imageId, layerId) =>
    set((state) => ({ imageLayerMap: { ...state.imageLayerMap, [imageId]: layerId } })),

  setImagesLayer: (imageIds, layerId) =>
    set((state) => {
      const updates: Record<number, string> = {};
      imageIds.forEach((id) => { updates[id] = layerId; });
      return { imageLayerMap: { ...state.imageLayerMap, ...updates } };
    }),

  moveLayerUp: (id) =>
    set((state) => {
      const idx = state.layers.findIndex((l) => l.id === id);
      if (idx <= 0) return state;
      const layers = [...state.layers];
      [layers[idx - 1], layers[idx]] = [layers[idx], layers[idx - 1]];
      return { layers };
    }),

  moveLayerDown: (id) =>
    set((state) => {
      const idx = state.layers.findIndex((l) => l.id === id);
      if (idx < 0 || idx >= state.layers.length - 1) return state;
      const layers = [...state.layers];
      [layers[idx], layers[idx + 1]] = [layers[idx + 1], layers[idx]];
      return { layers };
    }),

  reorderLayers: (fromIndex, toIndex) =>
    set((state) => {
      if (fromIndex === toIndex) return state;
      const layers = [...state.layers];
      const [moved] = layers.splice(fromIndex, 1);
      layers.splice(toIndex, 0, moved);
      return { layers };
    }),

  // Clear all
  clearAll: () =>
    set({
      images: [],
      historyGroups: [],
      selectedImageIds: [],
      hoveredImageId: null,
      hoveredGroupId: null,
      minimapDots: [],
      minimapGhostDots: [],
      isolatedImageIds: null,
    }),

  // Isolate mode
  setIsolatedImageIds: (ids) => set({ isolatedImageIds: ids }),

  // Hide images (blacklist, separate from delete)
  hideImages: (ids) => set((state) => ({
    hiddenImageIds: [...new Set([...state.hiddenImageIds, ...ids])],
    selectedImageIds: state.selectedImageIds.filter(id => !ids.includes(id)),
  })),
  unhideImages: (ids) => set((state) => ({
    hiddenImageIds: state.hiddenImageIds.filter(id => !ids.includes(id)),
  })),
  unhideAll: () => set({ hiddenImageIds: [] }),

  // Satellite view filter toggles
  toggleSatelliteView: (viewType) => set((s) => {
    const current = s.visibleSatelliteViews[viewType];
    // 'side' defaults to visible (undefined → treat as true); satellites default to hidden (undefined → false)
    const wasVisible = viewType === 'side' ? current !== false : !!current;
    apiClient.logEvent('satellite_view_toggle', { viewType, visible: !wasVisible });
    return { visibleSatelliteViews: { ...s.visibleSatelliteViews, [viewType]: !wasVisible } };
  }),
  enableSatelliteViews: (views) => set((s) => {
    const updated = { ...s.visibleSatelliteViews };
    for (const v of views) updated[v] = true;
    return { visibleSatelliteViews: updated };
  }),

  // Multi-View Editor history
  pushMultiViewHistory: (sideId, entry) => set((s) => {
    const prev = s.multiViewHistory[sideId] || [];
    // Cap at 10 snapshots per shoe to limit memory
    const updated = [...prev, entry].slice(-10);
    return { multiViewHistory: { ...s.multiViewHistory, [sideId]: updated } };
  }),
  clearMultiViewHistory: (sideId) => set((s) => {
    const { [sideId]: _, ...rest } = s.multiViewHistory;
    return { multiViewHistory: rest };
  }),

  // Star ratings
  setImageRating: (imageId, rating) =>
    set((state) => ({ imageRatings: { ...state.imageRatings, [imageId]: rating } })),
  setStarFilter: (n) => set({ starFilter: n }),

  // Design brief glow
  setIsAgentUsingBrief: (v) => set({ isAgentUsingBrief: v }),

  // Structured brief fields
  setBriefFields: (fields) => set({ briefFields: fields }),
  setBriefSuggestedParams: (params) => set({ briefSuggestedParams: params }),
  setBriefInterpretation: (text) => set({ briefInterpretation: text }),
  setBriefLoading: (v) => set({ briefLoading: v }),
  updateBriefFieldValue: (key, value) => set((s) => ({
    briefFields: s.briefFields.map((f) => f.key === key ? { ...f, value } : f),
  })),
  addBriefField: (param) => set((s) => ({
    briefFields: [...s.briefFields, { key: param.key, label: param.label, value: '' }],
    briefSuggestedParams: s.briefSuggestedParams.filter((p) => p.key !== param.key),
  })),
  removeBriefField: (key) => set((s) => ({
    briefFields: s.briefFields.filter((f) => f.key !== key),
  })),

  // Session / Multi-Canvas actions
  setCurrentCanvasId: (id) => set({ currentCanvasId: id }),
  setCanvasName: (name) => set({ canvasName: name }),
  setParticipantId: (id) => set({ participantId: id }),
  setStudySessionName: (name: string) => set({ studySessionName: name }),
  setCanvasList: (list) => set({ canvasList: list }),
  addEventLogEntry: (entry) => set((s) => ({ eventLog: [...s.eventLog, entry] })),

  // Onboarding tutorial actions
  setOnboardingActive: (active) => set({ onboardingActive: active }),
  setOnboardingSpotlight: (stepId) => {
    set({ onboardingSpotlight: stepId });
    // Persist spotlight to localStorage (G6: survive refresh)
    const cid = useAppStore.getState().currentCanvasId;
    if (cid) {
      try {
        const raw = localStorage.getItem(`onboarding_${cid}`);
        const data = raw ? JSON.parse(raw) : {};
        data.spotlight = stepId;
        localStorage.setItem(`onboarding_${cid}`, JSON.stringify(data));
      } catch {}
    }
  },
  completeOnboardingStep: (stepId) => set((s) => {
    if (s.completedSteps.includes(stepId)) return s;
    const next = [...s.completedSteps, stepId];
    // Persist per-canvas (v2 format)
    if (s.currentCanvasId) {
      try {
        const raw = localStorage.getItem(`onboarding_${s.currentCanvasId}`);
        const data = raw ? JSON.parse(raw) : {};
        data.version = 2;
        data.completed = next;
        data.dismissed = s.onboardingDismissed;
        localStorage.setItem(`onboarding_${s.currentCanvasId}`, JSON.stringify(data));
      } catch {}
    }
    return { completedSteps: next };
  }),
  dismissOnboarding: () => set((s) => {
    if (s.currentCanvasId) {
      try {
        const raw = localStorage.getItem(`onboarding_${s.currentCanvasId}`);
        const data = raw ? JSON.parse(raw) : {};
        data.version = 2;
        data.completed = s.completedSteps;
        data.dismissed = true;
        data.spotlight = null;
        localStorage.setItem(`onboarding_${s.currentCanvasId}`, JSON.stringify(data));
      } catch {}
    }
    return { onboardingDismissed: true, onboardingActive: false, onboardingSpotlight: null, onboardingSectionTransition: null };
  }),
  undismissOnboarding: () => set((s) => {
    if (s.currentCanvasId) {
      try {
        const raw = localStorage.getItem(`onboarding_${s.currentCanvasId}`);
        const data = raw ? JSON.parse(raw) : {};
        data.dismissed = false;
        localStorage.setItem(`onboarding_${s.currentCanvasId}`, JSON.stringify(data));
      } catch {}
    }
    return { onboardingDismissed: false };
  }),
  resetOnboarding: (canvasId?: string) => {
    const id = canvasId ?? useAppStore.getState().currentCanvasId;
    if (id) { try { localStorage.removeItem(`onboarding_${id}`); } catch {} }
    set({ completedSteps: [], onboardingDismissed: false, onboardingActive: false, onboardingSpotlight: null, onboardingSectionTransition: null });
  },
  loadOnboardingState: (canvasId) => {
    // G4: Validate canvasId
    const safeId = canvasId && canvasId.trim() ? canvasId : 'default';
    try {
      const raw = localStorage.getItem(`onboarding_${safeId}`);
      if (raw) {
        const data = JSON.parse(raw);
        // G11: Version migration — v1 data uses old step IDs, clear them
        if (!data.version || data.version < 2) {
          set({ completedSteps: [], onboardingDismissed: false, onboardingSpotlight: null });
          // Upgrade to v2 format
          try { localStorage.setItem(`onboarding_${safeId}`, JSON.stringify({ version: 2, completed: [], dismissed: false, spotlight: null })); } catch {}
          return;
        }
        // G6: Restore persisted spotlight
        set({
          completedSteps: data.completed ?? [],
          onboardingDismissed: data.dismissed ?? false,
          onboardingSpotlight: data.spotlight ?? null,
        });
      } else {
        // First time on this canvas — show onboarding
        set({ completedSteps: [], onboardingDismissed: false, onboardingSpotlight: null });
      }
    } catch {
      set({ completedSteps: [], onboardingDismissed: false, onboardingSpotlight: null });
    }
  },
  showSectionTransition: (key) => set({ onboardingSectionTransition: key }),
}));
