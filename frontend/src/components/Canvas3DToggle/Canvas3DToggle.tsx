/**
 * 3D Mode Toggle Button Component
 * Switches between 2D (D3/SVG) and 3D (Three.js) canvas modes
 */

import React, { useState } from "react";
import { useAppStore } from "../../store/appStore";
import { apiClient } from "../../api/client";
import "./Canvas3DToggle.css";

export const Canvas3DToggle: React.FC = () => {
  const is3DMode = useAppStore((state) => state.is3DMode);
  const setIs3DMode = useAppStore((state) => state.setIs3DMode);
  const isInitialized = useAppStore((state) => state.isInitialized);
  const images = useAppStore((state) => state.images);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async () => {
    if (!isInitialized) {
      alert("Please wait for models to initialize before switching to 3D mode.");
      return;
    }

    setIsLoading(true);
    try {
      const newMode = !is3DMode;
      console.log(`🔄 Switching to ${newMode ? "3D" : "2D"} mode...`);

      // Only call backend if we have images to recalculate
      if (images.length > 0) {
        await apiClient.set3DMode(newMode);
      }

      // Update frontend state (can switch even with no images)
      setIs3DMode(newMode);

      console.log(`✓ Switched to ${newMode ? "3D" : "2D"} mode`);
    } catch (error) {
      console.error("Failed to toggle 3D mode:", error);
      alert("Failed to switch mode. Please check console for details.");
    } finally {
      setIsLoading(false);
    }
  };

  const isDisabled = !isInitialized || isLoading;
  const tooltipText = !isInitialized
    ? "Models must be initialized first"
    : is3DMode
      ? "Switch to 2D mode"
      : "Switch to 3D mode";

  return (
    <button
      className={`canvas-3d-toggle ${is3DMode ? "active" : ""}`}
      onClick={handleToggle}
      disabled={isDisabled}
      title={tooltipText}
    >
      {isLoading ? (
        <span>⏳</span>
      ) : is3DMode ? (
        <>
          <span className="toggle-icon">🎲</span>
          <span className="toggle-label">3D Mode</span>
        </>
      ) : (
        <>
          <span className="toggle-icon">📊</span>
          <span className="toggle-label">2D Mode</span>
        </>
      )}
    </button>
  );
};
