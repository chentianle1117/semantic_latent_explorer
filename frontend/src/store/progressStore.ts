import { create } from 'zustand';

export type ProgressOperation =
  | 'initializing'
  | 'generating'
  | 'loading'
  | 'reprojecting'
  | 'analyzing'
  | 'exporting';

export interface ProgressStep {
  id: string;
  label: string;
  status: 'done' | 'active' | 'pending';
}

interface ProgressState {
  isVisible: boolean;
  operation: ProgressOperation | null;
  message: string;
  progress: number | undefined; // 0-100, undefined = indeterminate
  currentStep: string;
  totalSteps: number;
  allowDismiss: boolean;
  isMinimized: boolean;
  logLines: string[];           // timestamped activity log
  steps: ProgressStep[];        // vertical step breakdown

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
  addLogLine: (line: string) => void;
  setSteps: (steps: ProgressStep[]) => void;
  updateStepStatus: (id: string, status: ProgressStep['status']) => void;
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
  logLines: [],
  steps: [],

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
      logLines: [],
      steps: [],
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
      logLines: [],
      steps: [],
    }),

  minimize: () => set({ isMinimized: true }),
  maximize: () => set({ isMinimized: false }),

  addLogLine: (line) =>
    set((state) => ({
      logLines: [...state.logLines.slice(-29), `${_ts()} ${line}`],
    })),

  setSteps: (steps) => set({ steps }),

  updateStepStatus: (id, status) =>
    set((state) => ({
      steps: state.steps.map((s) => (s.id === id ? { ...s, status } : s)),
    })),
}));

function _ts(): string {
  const d = new Date();
  return `[${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}]`;
}
