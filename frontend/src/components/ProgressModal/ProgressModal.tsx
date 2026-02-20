import React, { useEffect, useRef } from 'react';
import { useProgressStore } from '../../store/progressStore';
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

export const ProgressModal: React.FC = () => {
  const {
    isVisible, operation, message, progress,
    currentStep, allowDismiss, isMinimized,
    logLines, steps,
    hideProgress, minimize, maximize,
  } = useProgressStore();

  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logLines]);

  if (!isVisible || !operation) return null;

  const isIndeterminate = progress === undefined;
  const pct = Math.round(progress ?? 0);

  if (isMinimized) {
    return (
      <div className="pm-minimized" onClick={maximize} role="button" aria-label="Restore progress">
        <span className="pm-min-icon">{OPERATION_ICONS[operation]}</span>
        <span className="pm-min-text">{message}</span>
        {!isIndeterminate && <span className="pm-min-pct">{pct}%</span>}
        <div className="pm-min-bar">
          <div className="pm-min-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  const hasSteps = steps.length > 0;
  const hasLog   = logLines.length > 0;

  return (
    <>
      <div className="pm-overlay" />
      <div className="pm-modal">

        {/* Header */}
        <div className="pm-header">
          <span className={`pm-icon ${isIndeterminate ? 'pm-icon--spin' : ''}`}>
            {OPERATION_ICONS[operation]}
          </span>
          <div className="pm-header-text">
            <div className="pm-title">{OPERATION_TITLES[operation]}</div>
            <div className="pm-subtitle">{message}</div>
          </div>
          {allowDismiss && (
            <button className="pm-close" onClick={minimize} title="Minimize">−</button>
          )}
        </div>

        {/* Progress bar */}
        <div className="pm-bar-wrap">
          {isIndeterminate ? (
            <div className="pm-bar-indeterminate">
              <div className="pm-bar-shimmer" />
            </div>
          ) : (
            <>
              <div className="pm-bar-track">
                <div
                  className="pm-bar-fill"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="pm-pct">{pct}%</span>
            </>
          )}
        </div>

        {/* Current step label */}
        {currentStep && !hasSteps && (
          <div className="pm-step-label">{currentStep}</div>
        )}

        {/* Vertical steps breakdown */}
        {hasSteps && (
          <div className="pm-steps">
            {steps.map((s) => (
              <div key={s.id} className={`pm-step pm-step--${s.status}`}>
                <span className="pm-step-dot" />
                <span className="pm-step-name">{s.label}</span>
                {s.status === 'active' && <span className="pm-step-pulse" />}
              </div>
            ))}
          </div>
        )}

        {/* Activity log */}
        {hasLog && (
          <div className="pm-log" ref={logRef}>
            {logLines.map((line, i) => (
              <div key={i} className="pm-log-line">{line}</div>
            ))}
          </div>
        )}

      </div>
    </>
  );
};
