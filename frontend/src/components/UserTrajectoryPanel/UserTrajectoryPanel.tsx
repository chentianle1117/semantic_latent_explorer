import React, { useEffect, useState } from "react";
import "./UserTrajectoryPanel.css";

interface UserPreferences {
  favored_attributes: string[];
  avoided_attributes: string[];
  exploration_style: string;
}

interface UserTrajectory {
  current_focus: string;
  trends: string[];
}

interface TrajectoryData {
  preferences: UserPreferences;
  trajectory: UserTrajectory;
  statistics: {
    total_images: number;
    cluster_distribution: { [key: string]: number };
    dominant_themes?: string[];
  };
}

interface UserTrajectoryPanelProps {
  brief: string | null;
  totalImages: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const UserTrajectoryPanel: React.FC<UserTrajectoryPanelProps> = ({
  brief,
  totalImages,
  isCollapsed,
  onToggleCollapse,
}) => {
  const [trajectoryData, setTrajectoryData] = useState<TrajectoryData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (brief && totalImages >= 5) {
      loadTrajectory();
    }
  }, [brief, totalImages]);

  const loadTrajectory = async () => {
    if (!brief) return;

    setIsLoading(true);
    try {
      const response = await fetch("http://localhost:8000/api/agent/analyze-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief }),
      });

      if (response.ok) {
        const data = await response.json();
        setTrajectoryData(data);
      }
    } catch (error) {
      console.error("Failed to load trajectory:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!brief || totalImages < 5) {
    return null;
  }

  return (
    <div className={`user-trajectory-panel ${isCollapsed ? "collapsed" : ""}`}>
      <div className="panel-header">
        <h3>🎯 Your Trajectory</h3>
        <button
          className="collapse-button"
          onClick={onToggleCollapse}
          title={isCollapsed ? "Expand panel" : "Collapse panel"}
        >
          {isCollapsed ? "←" : "→"}
        </button>
      </div>

      {!isCollapsed && (
        <div className="panel-content">
          {isLoading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Analyzing patterns...</p>
            </div>
          ) : trajectoryData ? (
            <div className="trajectory-content">
              {/* Current Focus */}
              <div className="section">
                <label className="section-label">Current Focus</label>
                <p className="focus-text">{trajectoryData.trajectory.current_focus}</p>
              </div>

              {/* Preferences */}
              <div className="section">
                <label className="section-label">Preferences</label>
                
                {trajectoryData.preferences.favored_attributes.length > 0 && (
                  <div className="subsection">
                    <span className="subsection-title">✓ Favors:</span>
                    <div className="tags">
                      {trajectoryData.preferences.favored_attributes.map((attr, idx) => (
                        <span key={idx} className="tag tag-positive">{attr}</span>
                      ))}
                    </div>
                  </div>
                )}

                {trajectoryData.preferences.avoided_attributes.length > 0 && (
                  <div className="subsection">
                    <span className="subsection-title">✗ Avoids:</span>
                    <div className="tags">
                      {trajectoryData.preferences.avoided_attributes.map((attr, idx) => (
                        <span key={idx} className="tag tag-negative">{attr}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="style-note">
                  <strong>Style:</strong> {trajectoryData.preferences.exploration_style}
                </div>
              </div>

              {/* Trends */}
              {trajectoryData.trajectory.trends.length > 0 && (
                <div className="section">
                  <label className="section-label">Trends</label>
                  <ul className="trends-list">
                    {trajectoryData.trajectory.trends.map((trend, idx) => (
                      <li key={idx}>{trend}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Statistics */}
              <div className="section">
                <label className="section-label">Statistics</label>
                <div className="stats-grid">
                  <div className="stat-item">
                    <span className="stat-value">{trajectoryData.statistics.total_images}</span>
                    <span className="stat-label">Total Images</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{Object.keys(trajectoryData.statistics.cluster_distribution).length}</span>
                    <span className="stat-label">Clusters</span>
                  </div>
                </div>
              </div>

              <button
                className="refresh-button"
                onClick={loadTrajectory}
                disabled={isLoading}
              >
                🔄 Refresh
              </button>
            </div>
          ) : (
            <div className="empty-state">
              <p>No trajectory data available</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

