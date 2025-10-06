/**
 * Progress Bar Component for image generation
 */

import React from "react";
import { useAppStore } from "../../store/appStore";
import "./ProgressBar.css";

interface ProgressBarProps {
  message?: string;
  isVisible: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  message = "Generating images...",
  isVisible,
}) => {
  const generationProgress = useAppStore((state) => state.generationProgress);
  const generationCurrent = useAppStore((state) => state.generationCurrent);
  const generationTotal = useAppStore((state) => state.generationTotal);

  if (!isVisible) return null;

  const displayMessage =
    generationTotal > 0
      ? `Generating image ${generationCurrent} of ${generationTotal}...`
      : message;

  return (
    <div className="progress-container-fixed">
      <div className="progress-message">{displayMessage}</div>
      <div className="progress-bar">
        <div
          className="progress-bar-fill-actual"
          style={{ width: `${generationProgress}%` }}
        ></div>
      </div>
      {generationTotal > 0 ? (
        <div className="progress-percentage">
          {generationCurrent}/{generationTotal} images
        </div>
      ) : (
        <div className="progress-percentage">{Math.round(generationProgress)}%</div>
      )}
    </div>
  );
};
