import React from 'react';
import { useProgressStore } from '../../store/progressStore';
import './ProgressModal.css';

const OPERATION_ICONS = {
  initializing: '⚙️',
  generating: '🎨',
  loading: '📥',
  reprojecting: '📊',
  analyzing: '🤖',
  exporting: '📦',
};

const OPERATION_TITLES = {
  initializing: 'Initializing',
  generating: 'Generating Images',
  loading: 'Loading Images',
  reprojecting: 'Updating Canvas',
  analyzing: 'AI Analyzing',
  exporting: 'Exporting',
};

export const ProgressModal: React.FC = () => {
  const {
    isVisible,
    operation,
    message,
    progress,
    currentStep,
    allowDismiss,
    isMinimized,
    hideProgress,
    minimize,
    maximize,
  } = useProgressStore();

  if (!isVisible || !operation) return null;

  const isIndeterminate = progress === undefined;
  const progressPercent = progress ?? 0;

  if (isMinimized) {
    return (
      <div className="progress-minimized" onClick={maximize}>
        <div className="minimized-icon">{OPERATION_ICONS[operation]}</div>
        <div className="minimized-text">{message}</div>
        {!isIndeterminate && (
          <div className="minimized-progress">{Math.round(progressPercent)}%</div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="progress-modal-overlay" />
      <div className="progress-modal">
        <div className="progress-header">
          <div className="progress-icon">{OPERATION_ICONS[operation]}</div>
          <div className="progress-title">
            {OPERATION_TITLES[operation]}
          </div>
          <div className="progress-controls">
            {allowDismiss && (
              <button className="minimize-btn" onClick={minimize} title="Minimize">
                −
              </button>
            )}
          </div>
        </div>

        <div className="progress-body">
          <div className="progress-message">{message}</div>

          {!isIndeterminate ? (
            <>
              <div className="progress-circle">
                <svg className="circle-svg" viewBox="0 0 100 100">
                  <defs>
                    <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#58a6ff" />
                      <stop offset="100%" stopColor="#bc8cff" />
                    </linearGradient>
                  </defs>
                  <circle
                    className="circle-bg"
                    cx="50"
                    cy="50"
                    r="45"
                  />
                  <circle
                    className="circle-progress"
                    cx="50"
                    cy="50"
                    r="45"
                    style={{
                      strokeDasharray: `${2 * Math.PI * 45}`,
                      strokeDashoffset: `${2 * Math.PI * 45 * (1 - progressPercent / 100)}`,
                    }}
                  />
                  <text
                    x="50"
                    y="50"
                    className="circle-text"
                    dominantBaseline="middle"
                    textAnchor="middle"
                  >
                    {Math.round(progressPercent)}%
                  </text>
                </svg>
              </div>
              {currentStep && (
                <div className="progress-step">{currentStep}</div>
              )}
            </>
          ) : (
            <div className="progress-spinner">
              <div className="spinner-ring"></div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

