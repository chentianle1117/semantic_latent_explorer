import React, { useEffect, useRef } from 'react';
import { useProgressStore, TaskEntry } from '../../store/progressStore';
import { useAppStore } from '../../store/appStore';
import './ProgressModal.css';

const OPERATION_ICONS: Record<string, string> = {
  initializing: '⚙️',
  generating:   '✦',
  loading:      '↓',
  reprojecting: '⟳',
  analyzing:    '◈',
  exporting:    '↑',
};

const OPERATION_TITLES: Record<string, string> = {
  initializing: 'Initializing',
  generating:   'Generating Images',
  loading:      'Loading',
  reprojecting: 'Updating Canvas',
  analyzing:    'AI Analyzing',
  exporting:    'Exporting',
};

// ─── Full modal for active task ──────────────────────────────────────────────
const FullModal: React.FC<{ task: TaskEntry }> = ({ task }) => {
  const { minimizeTask } = useProgressStore();
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [task.logLines]);

  const isIndeterminate = task.progress === undefined;
  const pct = Math.round(task.progress ?? 0);
  const hasSteps = task.steps.length > 0;
  const hasLog   = task.logLines.length > 0;

  return (
    <>
      <div className="pm-overlay" />
      <div className="pm-modal">
        <div className="pm-header">
          <span className={`pm-icon ${isIndeterminate ? 'pm-icon--spin' : ''}`}>
            {OPERATION_ICONS[task.operation]}
          </span>
          <div className="pm-header-text">
            <div className="pm-title">{OPERATION_TITLES[task.operation]}</div>
            <div className="pm-subtitle">{task.message}</div>
          </div>
          {task.allowDismiss && (
            <button className="pm-close" onClick={() => minimizeTask(task.id)} title="Minimize">−</button>
          )}
        </div>

        <div className="pm-bar-wrap">
          {isIndeterminate ? (
            <div className="pm-bar-indeterminate"><div className="pm-bar-shimmer" /></div>
          ) : (
            <>
              <div className="pm-bar-track">
                <div className="pm-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="pm-pct">{pct}%</span>
            </>
          )}
        </div>

        {task.currentStep && !hasSteps && (
          <div className="pm-step-label">{task.currentStep}</div>
        )}

        {hasSteps && (
          <div className="pm-steps">
            {task.steps.map((s) => (
              <div key={s.id} className={`pm-step pm-step--${s.status}`}>
                <span className="pm-step-dot" />
                <span className="pm-step-name">{s.label}</span>
                {s.status === 'active' && <span className="pm-step-pulse" />}
              </div>
            ))}
          </div>
        )}

        {hasLog && (
          <div className="pm-log" ref={logRef}>
            {task.logLines.map((line, i) => (
              <div key={i} className="pm-log-line">{line}</div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

// ─── Minimized chip (stacks in bottom-right) ─────────────────────────────────
export const MinimizedTaskChips: React.FC = () => {
  const { tasks, maximizeTask, completeTask } = useProgressStore();
  const isDrawerExpanded = useAppStore(s => s.isDrawerExpanded);
  const minimized = tasks.filter(t => t.isMinimized);
  if (minimized.length === 0) return null;

  // Offset chips above the bottom drawer so they don't overlap
  const drawerH = isDrawerExpanded
    ? 'clamp(330px, 36vh, 520px)'
    : '44px';

  return (
    <>
      {minimized.map((task, idx) => {
        const isIndeterminate = task.progress === undefined;
        const pct = Math.round(task.progress ?? 0);
        return (
          <div
            key={task.id}
            className="pm-minimized"
            style={{ bottom: `calc(${drawerH} + ${16 + idx * 58}px)` }}
            onClick={() => maximizeTask(task.id)}
            role="button"
            aria-label="Restore progress"
          >
            <span className="pm-min-icon">{OPERATION_ICONS[task.operation]}</span>
            <span className="pm-min-text">{task.message}</span>
            {!isIndeterminate && <span className="pm-min-pct">{pct}%</span>}
            {task.allowDismiss && (
              <button
                className="pm-min-dismiss"
                onClick={(e) => { e.stopPropagation(); completeTask(task.id); }}
                title="Dismiss"
              >×</button>
            )}
            <div className="pm-min-bar">
              <div className="pm-min-bar-fill" style={{ width: isIndeterminate ? '100%' : `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </>
  );
};

// ─── Main export ─────────────────────────────────────────────────────────────
export const ProgressModal: React.FC = () => {
  const { tasks, currentTaskId } = useProgressStore();

  // Find the non-minimized (active) task to show as full modal
  const activeTask = tasks.find(t => t.id === currentTaskId && !t.isMinimized)
    ?? tasks.find(t => !t.isMinimized)
    ?? null;

  return (
    <>
      {activeTask && <FullModal task={activeTask} />}
      <MinimizedTaskChips />
    </>
  );
};
