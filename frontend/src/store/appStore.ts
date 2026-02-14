/**
 * Zustand store for application state
 * Matches the artifact's interaction model
 */

import { create } from 'zustand';
import type { AppState, ImageData, HistoryGroup, VisualSettings, CanvasBounds, AgentInsight, AgentStatus, AgentMode, GhostNode } from '../types';

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
    imageOpacity: 0.9,
    removeBackground: true,
    layoutPadding: 0.2, // 20% padding by default (reduces clutter)
    coordinateScale: 1.0, // Scale multiplier for coordinates (affects spacing)
    coordinateOffset: [0, 0, 0], // Offset for recentering [x, y, z]
    contourStrength: 6, // 1–10, contour highlight thickness (higher = more visible)
    showGenealogyOnCanvas: false, // Show parent/child lines on canvas (default off to reduce clutter)
    gridDensity: 1.0, // Grid cell size multiplier (0.5–2.0)
  },
  canvasBounds: null, // Will auto-calculate on first render
  clusterCentroids: [], // Cluster centers for edge bundling
  clusterLabels: [], // Cluster assignment per image
  gridCellSize: [0.7, 0.7], // Grid cell size in coordinate space
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
