/**
 * Zustand store for application state
 * Matches the artifact's interaction model
 */

import { create } from 'zustand';
import type { AppState, ImageData, HistoryGroup, VisualSettings, CanvasBounds, AgentInsight, AgentStatus, AgentMode, GhostNode, CanvasLayer } from '../types';

interface AppStore extends AppState {
  // Actions
  setImages: (images: ImageData[]) => void;
  addImages: (images: ImageData[]) => void;
  updateImage: (id: number, updates: Partial<ImageData>) => void;
  removeImage: (id: number) => void;

  setHistoryGroups: (groups: HistoryGroup[]) => void;
  addHistoryGroup: (group: HistoryGroup) => void;

  setSelectedImageIds: (ids: number[]) => void;
  toggleImageSelection: (id: number, ctrlKey: boolean) => void;
  clearSelection: () => void;

  setHoveredImageId: (id: number | null) => void;
  setHoveredGroupId: (groupId: string | null) => void;

  updateVisualSettings: (settings: Partial<VisualSettings>) => void;

  setAxisLabels: (labels: { x: [string, string]; y: [string, string]; z?: [string, string] }) => void;

  setCanvasBounds: (bounds: CanvasBounds | null) => void;
  resetCanvasBounds: () => void; // Trigger rescale on next render

  setIsGenerating: (isGenerating: boolean) => void;
  setIsInitialized: (isInitialized: boolean) => void;
  setGenerationProgress: (progress: number | ((prev: number) => number)) => void;
  setGenerationCount: (current: number, total: number) => void;

  setRemoveBackground: (remove: boolean) => void;

  setIs3DMode: (is3D: boolean) => void;

  // UI layout
  setIsInspectorCollapsed: (collapsed: boolean) => void;
  setIsDrawerExpanded: (expanded: boolean) => void;
  setActiveToolbarFlyout: (flyout: string | null) => void;
  setFlyToImageId: (id: number | null) => void;

  // Agent passive observer
  agentStatus: AgentStatus;
  agentInsight: AgentInsight | null;
  setAgentStatus: (status: AgentStatus) => void;
  setAgentInsight: (insight: AgentInsight | null) => void;
  dismissInsight: () => void;

  // Agent proactive mode
  setAgentMode: (mode: AgentMode) => void;
  addGhostNode: (ghost: GhostNode) => void;
  removeGhostNode: (id: number) => void;
  clearGhostNodes: () => void;
  acceptGhostNode: (id: number) => Promise<void>;

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

  clearAll: () => void;
}

const initialState: AppState = {
  images: [],
  historyGroups: [],
  axisLabels: {
    x: ['formal', 'sporty'],
    y: ['dark', 'colorful'],
    z: ['casual', 'elegant'],  // New: default z-axis labels
  },
  selectedImageIds: [],
  hoveredImageId: null,
  hoveredGroupId: null,
  visualSettings: {
    imageSize: 120,
    imageOpacity: 1.0,
    removeBackground: true,
    layoutPadding: 0.2, // 20% padding by default (reduces clutter)
    coordinateScale: 1.0, // Scale multiplier for coordinates (affects spacing)
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
  isGenerating: false,
  isInitialized: false,
  generationProgress: 0,
  generationCurrent: 0,
  generationTotal: 0,
  is3DMode: false,

  // UI layout defaults
  isInspectorCollapsed: false,
  isDrawerExpanded: false,
  activeToolbarFlyout: null,
  flyToImageId: null,

  // Agent defaults
  agentStatus: 'idle' as AgentStatus,
  agentInsight: null as AgentInsight | null,
  agentMode: 'auto' as AgentMode, // Default to proactive mode
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

  // Layer system
  layers: [
    { id: 'default', name: 'Shoes', visible: true, color: '#58a6ff' },
    { id: 'references', name: 'References', visible: true, color: '#ff7b72' },
  ] as CanvasLayer[],
  imageLayerMap: {} as Record<number, string>,
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
    set((state) => ({
      images: state.images.map((img) =>
        img.id === id ? { ...img, visible: false } : img
      ),
      selectedImageIds: state.selectedImageIds.filter((sid) => sid !== id),
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

  // Axis labels
  setAxisLabels: (labels) => set({ axisLabels: labels }),

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

  // 3D mode
  setIs3DMode: (is3D) => set({ is3DMode: is3D }),

  // UI layout
  setIsInspectorCollapsed: (collapsed) => set({ isInspectorCollapsed: collapsed }),
  setIsDrawerExpanded: (expanded) => set({ isDrawerExpanded: expanded }),
  setActiveToolbarFlyout: (flyout) => set((state) => ({
    activeToolbarFlyout: state.activeToolbarFlyout === flyout ? null : flyout,
  })),
  setFlyToImageId: (id) => set({ flyToImageId: id }),

  // Agent passive observer
  agentStatus: 'idle',
  agentInsight: null,
  setAgentStatus: (status) => set({ agentStatus: status }),
  setAgentInsight: (insight) => set({
    agentInsight: insight,
    agentStatus: insight ? 'insight-ready' : 'idle',
  }),
  dismissInsight: () => set({ agentInsight: null, agentStatus: 'idle' }),

  // Agent proactive mode actions
  setAgentMode: (mode) => set({ agentMode: mode }),
  addGhostNode: (ghost) => set((state) => ({ ghostNodes: [...state.ghostNodes, ghost] })),
  removeGhostNode: (id) => set((state) => ({ ghostNodes: state.ghostNodes.filter(g => g.id !== id) })),
  clearGhostNodes: () => set({ ghostNodes: [] }),
  acceptGhostNode: async (id) => {
    // Convert ghost to real image by generating it
    const ghost = useAppStore.getState().ghostNodes.find(g => g.id === id);
    if (!ghost) return;

    // Remove from ghost nodes
    useAppStore.getState().removeGhostNode(id);

    // Trigger generation with the suggested prompt
    // This will be implemented when we wire up the generation flow
    console.log('Accepting ghost node:', ghost.suggestedPrompt);
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

  // Clear all
  clearAll: () =>
    set({
      images: [],
      historyGroups: [],
      selectedImageIds: [],
      hoveredImageId: null,
      hoveredGroupId: null,
    }),
}));
