/**
 * Physics Controls Modal - Adjust force simulation parameters
 * Exposes semantic gravity, cluster springs, and collision radius sliders
 */

import React from "react";
import { useAppStore } from "../../store/appStore";
import "./PhysicsControls.css";

interface PhysicsControlsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PhysicsControls: React.FC<PhysicsControlsProps> = ({
  isOpen,
  onClose,
}) => {
  const visualSettings = useAppStore((state) => state.visualSettings);
  const updateVisualSettings = useAppStore(
    (state) => state.updateVisualSettings
  );

  if (!isOpen) return null;

  const usePhysics = visualSettings.usePhysics ?? false;
  const axisStrength = visualSettings.axisStrength ?? 0.3;
  const clusterStrength = visualSettings.clusterStrength ?? 0.5;
  const collisionRadius = visualSettings.collisionRadius ?? 0.8;

  return (
    <div className="physics-controls-overlay" onClick={onClose}>
      <div
        className="physics-controls-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="physics-controls-header">
          <h2>⚙️ Physics Engine Controls</h2>
          <button className="physics-controls-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="physics-controls-content">
          {/* Physics Toggle */}
          <div className="physics-control-section">
            <div className="physics-control-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={usePhysics}
                  onChange={(e) =>
                    updateVisualSettings({ usePhysics: e.target.checked })
                  }
                />
                <span>Enable Physics Simulation</span>
              </label>
              <p className="physics-control-description">
                {usePhysics
                  ? "Dynamic force-based layout"
                  : "Static semantic projection"}
              </p>
            </div>
          </div>

          {/* Physics Controls (only shown when enabled) */}
          {usePhysics && (
            <>
              {/* Semantic Gravity */}
              <div className="physics-control-group">
                <div className="physics-control-header-small">
                  <label>Semantic Gravity</label>
                  <span className="physics-control-value">
                    {(axisStrength * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={axisStrength}
                  onChange={(e) =>
                    updateVisualSettings({
                      axisStrength: parseFloat(e.target.value),
                    })
                  }
                  className="physics-control-slider"
                />
                <p className="physics-control-description">
                  Strength of pull toward axis positions
                </p>
              </div>

              {/* Cluster Springs */}
              <div className="physics-control-group">
                <div className="physics-control-header-small">
                  <label>Cluster Springs</label>
                  <span className="physics-control-value">
                    {(clusterStrength * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={clusterStrength}
                  onChange={(e) =>
                    updateVisualSettings({
                      clusterStrength: parseFloat(e.target.value),
                    })
                  }
                  className="physics-control-slider"
                />
                <p className="physics-control-description">
                  Strength of connections between semantically similar neighbors
                </p>
              </div>

              {/* Collision Radius */}
              <div className="physics-control-group">
                <div className="physics-control-header-small">
                  <label>Collision Radius</label>
                  <span className="physics-control-value">
                    {collisionRadius.toFixed(2)}×
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.05"
                  value={collisionRadius}
                  onChange={(e) =>
                    updateVisualSettings({
                      collisionRadius: parseFloat(e.target.value),
                    })
                  }
                  className="physics-control-slider"
                />
                <p className="physics-control-description">
                  Collision detection radius (0.8× for background-removed images,
                  1.0× for normal)
                </p>
              </div>

              {/* Preset Configurations */}
              <div className="physics-control-section">
                <h3>Presets</h3>
                <div className="physics-control-presets">
                  <button
                    className="physics-preset-btn"
                    onClick={() =>
                      updateVisualSettings({
                        axisStrength: 0.1,
                        clusterStrength: 0.2,
                        collisionRadius: 0.8,
                      })
                    }
                  >
                    Free Floating
                  </button>
                  <button
                    className="physics-preset-btn"
                    onClick={() =>
                      updateVisualSettings({
                        axisStrength: 0.5,
                        clusterStrength: 0.5,
                        collisionRadius: 0.8,
                      })
                    }
                  >
                    Balanced
                  </button>
                  <button
                    className="physics-preset-btn"
                    onClick={() =>
                      updateVisualSettings({
                        axisStrength: 0.8,
                        clusterStrength: 0.8,
                        collisionRadius: 1.0,
                      })
                    }
                  >
                    Tight Clustering
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="physics-controls-footer">
          <button className="physics-controls-close-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
