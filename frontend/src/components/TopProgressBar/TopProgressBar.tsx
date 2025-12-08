import React from 'react';
import './TopProgressBar.css';

interface TopProgressBarProps {
  isVisible: boolean;
  message: string;
  progress?: number;
}

export const TopProgressBar: React.FC<TopProgressBarProps> = ({
  isVisible,
  message,
  progress,
}) => {
  if (!isVisible) return null;

  return (
    <div className="top-progress-bar">
      <div className="progress-content">
        <span className="progress-message">{message}</span>
        {progress !== undefined && (
          <span className="progress-percentage">{Math.round(progress)}%</span>
        )}
      </div>
      {progress !== undefined && (
        <div className="progress-bar-track">
          <div 
            className="progress-bar-fill" 
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
};
