/**
 * Zustand store for application state
 * Matches the artifact's interaction model
 */

import { create } from 'zustand';
import type { AppState, ImageData, HistoryGroup, VisualSettings } from '../types';

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

  setAxisLabels: (labels: { x: [string, string]; y: [string, string] }) => void;

  setIsGenerating: (isGenerating: boolean) => void;
  setIsInitialized: (isInitialized: boolean) => void;

  clearAll: () => void;
}

const initialState: AppState = {
  images: [],
  historyGroups: [],
  axisLabels: {
    x: ['formal', 'sporty'],
    y: ['dark', 'colorful'],
  },
  selectedImageIds: [],
  hoveredImageId: null,
  hoveredGroupId: null,
  visualSettings: {
    imageSize: 120,
    imageOpacity: 0.9,
    removeBackground: true,
  },
  isGenerating: false,
  isInitialized: false,
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
  setSelectedImageIds: (ids) => set({ selectedImageIds: ids }),

  toggleImageSelection: (id, _ctrlKey) =>
    set((state) => {
      // Always additive selection - clicking an image adds it to selection
      // Clicking again removes it (toggle off)
      const isSelected = state.selectedImageIds.includes(id);
      return {
        selectedImageIds: isSelected
          ? state.selectedImageIds.filter((sid) => sid !== id)
          : [...state.selectedImageIds, id],
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

  // Loading states
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setIsInitialized: (isInitialized) => set({ isInitialized }),

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
