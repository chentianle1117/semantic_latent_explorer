import { create } from 'zustand';

export type ProgressOperation = 
  | 'initializing' 
  | 'generating' 
  | 'loading' 
  | 'reprojecting' 
  | 'analyzing'
  | 'exporting';

interface ProgressState {
  isVisible: boolean;
  operation: ProgressOperation | null;
  message: string;
  progress: number | undefined; // 0-100, undefined = indeterminate
  currentStep: string;
  totalSteps: number;
  allowDismiss: boolean;
  isMinimized: boolean;

  // Actions
  showProgress: (
    operation: ProgressOperation,
    message: string,
    allowDismiss?: boolean
  ) => void;
  updateProgress: (progress: number, currentStep?: string) => void;
  hideProgress: () => void;
  minimize: () => void;
  maximize: () => void;
}

export const useProgressStore = create<ProgressState>((set) => ({
  isVisible: false,
  operation: null,
  message: '',
  progress: undefined,
  currentStep: '',
  totalSteps: 0,
  allowDismiss: false,
  isMinimized: false,

  showProgress: (operation, message, allowDismiss = false) =>
    set({
      isVisible: true,
      operation,
      message,
      progress: undefined,
      currentStep: '',
      totalSteps: 0,
      allowDismiss,
      isMinimized: false,
    }),

  updateProgress: (progress, currentStep = '') =>
    set((state) => ({
      progress,
      currentStep: currentStep || state.currentStep,
    })),

  hideProgress: () =>
    set({
      isVisible: false,
      operation: null,
      message: '',
      progress: undefined,
      currentStep: '',
      isMinimized: false,
    }),

  minimize: () => set({ isMinimized: true }),
  maximize: () => set({ isMinimized: false }),
}));

