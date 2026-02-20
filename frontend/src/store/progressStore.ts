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

export interface TaskEntry {
  id: string;
  operation: ProgressOperation;
  message: string;
  progress: number | undefined;
  currentStep: string;
  allowDismiss: boolean;
  isMinimized: boolean;
  logLines: string[];
  steps: ProgressStep[];
  createdAt: number;
}

interface ProgressState {
  tasks: TaskEntry[];            // ordered newest-first, max 4
  currentTaskId: string | null;  // which task is shown as full modal

  // Task management (explicit ID versions)
  addTask: (id: string, operation: ProgressOperation, message: string, allowDismiss?: boolean) => void;
  updateTask: (id: string, progress: number, currentStep?: string) => void;
  completeTask: (id: string) => void;
  minimizeTask: (id: string) => void;
  maximizeTask: (id: string) => void;
  addTaskLog: (id: string, line: string) => void;
  setTaskSteps: (id: string, steps: ProgressStep[]) => void;
  updateTaskStepStatus: (id: string, stepId: string, status: ProgressStep['status']) => void;

  // Legacy single-task API (backward compat) — always operates on currentTaskId
  showProgress: (operation: ProgressOperation, message: string, allowDismiss?: boolean) => string;
  updateProgress: (progress: number, currentStep?: string) => void;
  hideProgress: () => void;
  minimize: () => void;
  maximize: () => void;
  addLogLine: (line: string) => void;
  setSteps: (steps: ProgressStep[]) => void;
  updateStepStatus: (id: string, status: ProgressStep['status']) => void;

  // Derived (for ProgressModal backward compat)
  isVisible: boolean;
  isMinimized: boolean;
  operation: ProgressOperation | null;
  message: string;
  progress: number | undefined;
  currentStep: string;
  totalSteps: number;
  allowDismiss: boolean;
  logLines: string[];
  steps: ProgressStep[];

  // Constraint helpers
  isAnyGenerating: () => boolean;
}

let _taskIdCounter = 0;
const newTaskId = () => `task_${Date.now()}_${++_taskIdCounter}`;
const MAX_TASKS = 4;

function _ts(): string {
  const d = new Date();
  return `[${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}]`;
}

function derivedFromCurrent(tasks: TaskEntry[], currentTaskId: string | null) {
  const cur = tasks.find(t => t.id === currentTaskId) ?? tasks[0] ?? null;
  return {
    isVisible: tasks.length > 0,
    isMinimized: cur?.isMinimized ?? false,
    operation: cur?.operation ?? null,
    message: cur?.message ?? '',
    progress: cur?.progress,
    currentStep: cur?.currentStep ?? '',
    totalSteps: cur?.steps.length ?? 0,
    allowDismiss: cur?.allowDismiss ?? false,
    logLines: cur?.logLines ?? [],
    steps: cur?.steps ?? [],
  };
}

export const useProgressStore = create<ProgressState>((set, get) => {
  const recalcDerived = (tasks: TaskEntry[], currentTaskId: string | null) =>
    ({ ...derivedFromCurrent(tasks, currentTaskId), tasks, currentTaskId });

  return {
    tasks: [],
    currentTaskId: null,

    // Derived (initialized empty)
    isVisible: false,
    isMinimized: false,
    operation: null,
    message: '',
    progress: undefined,
    currentStep: '',
    totalSteps: 0,
    allowDismiss: false,
    logLines: [],
    steps: [],

    isAnyGenerating: () => get().tasks.some(t => t.operation === 'generating'),

    addTask: (id, operation, message, allowDismiss = false) =>
      set((state) => {
        // Auto-minimize the currently shown task if there is one
        const updatedTasks = state.tasks.map(t =>
          t.id === state.currentTaskId && !t.isMinimized ? { ...t, isMinimized: true } : t
        );
        const newTask: TaskEntry = {
          id, operation, message,
          progress: undefined, currentStep: '',
          allowDismiss, isMinimized: false,
          logLines: [], steps: [],
          createdAt: Date.now(),
        };
        // Prepend (newest first), cap at MAX_TASKS
        const tasks = [newTask, ...updatedTasks].slice(0, MAX_TASKS);
        return recalcDerived(tasks, id);
      }),

    updateTask: (id, progress, currentStep = '') =>
      set((state) => {
        const tasks = state.tasks.map(t =>
          t.id === id ? { ...t, progress, currentStep: currentStep || t.currentStep } : t
        );
        return recalcDerived(tasks, state.currentTaskId);
      }),

    completeTask: (id) =>
      set((state) => {
        const tasks = state.tasks.filter(t => t.id !== id);
        // If completed task was current, pick next non-minimized or any remaining
        let nextCurrentId = state.currentTaskId === id
          ? (tasks.find(t => !t.isMinimized)?.id ?? tasks[0]?.id ?? null)
          : state.currentTaskId;
        return recalcDerived(tasks, nextCurrentId);
      }),

    minimizeTask: (id) =>
      set((state) => {
        const tasks = state.tasks.map(t => t.id === id ? { ...t, isMinimized: true } : t);
        return recalcDerived(tasks, state.currentTaskId);
      }),

    maximizeTask: (id) =>
      set((state) => {
        // Minimize old current (if different)
        const tasks = state.tasks.map(t => {
          if (t.id === id) return { ...t, isMinimized: false };
          if (t.id === state.currentTaskId) return { ...t, isMinimized: true };
          return t;
        });
        return recalcDerived(tasks, id);
      }),

    addTaskLog: (id, line) =>
      set((state) => {
        const tasks = state.tasks.map(t =>
          t.id === id ? { ...t, logLines: [...t.logLines.slice(-29), `${_ts()} ${line}`] } : t
        );
        return recalcDerived(tasks, state.currentTaskId);
      }),

    setTaskSteps: (id, steps) =>
      set((state) => {
        const tasks = state.tasks.map(t => t.id === id ? { ...t, steps } : t);
        return recalcDerived(tasks, state.currentTaskId);
      }),

    updateTaskStepStatus: (id, stepId, status) =>
      set((state) => {
        const tasks = state.tasks.map(t =>
          t.id === id ? {
            ...t,
            steps: t.steps.map(s => s.id === stepId ? { ...s, status } : s)
          } : t
        );
        return recalcDerived(tasks, state.currentTaskId);
      }),

    // ─── Legacy single-task API ───────────────────────────────────────────────

    showProgress: (operation, message, allowDismiss = false) => {
      const id = newTaskId();
      get().addTask(id, operation, message, allowDismiss);
      return id;
    },

    updateProgress: (progress, currentStep = '') => {
      const id = get().currentTaskId;
      if (id) get().updateTask(id, progress, currentStep);
    },

    hideProgress: () => {
      const id = get().currentTaskId;
      if (id) get().completeTask(id);
    },

    minimize: () => {
      const id = get().currentTaskId;
      if (id) get().minimizeTask(id);
    },

    maximize: () => {
      const id = get().currentTaskId;
      if (id) get().maximizeTask(id);
    },

    addLogLine: (line) => {
      const id = get().currentTaskId;
      if (id) get().addTaskLog(id, line);
    },

    setSteps: (steps) => {
      const id = get().currentTaskId;
      if (id) get().setTaskSteps(id, steps);
    },

    updateStepStatus: (stepId, status) => {
      const id = get().currentTaskId;
      if (id) get().updateTaskStepStatus(id, stepId, status);
    },
  };
});
