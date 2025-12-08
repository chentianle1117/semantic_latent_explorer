import React, { useEffect, useState } from "react";
import { apiClient } from "../../api/client";
import "./DesignParametersPanel.css";

interface DesignParameters {
  type: string[];
  inspiration: string[];
  materials: string[];
  colors: string[];
  style_keywords: string[];
  last_updated: string;
}

interface DesignParametersPanelProps {
  brief: string | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onParameterClick?: (keyword: string) => void;
  activeKeyword?: string | null;
}

export const DesignParametersPanel: React.FC<DesignParametersPanelProps> = ({
  brief,
  isCollapsed,
  onToggleCollapse,
  onParameterClick,
  activeKeyword,
}) => {
  const [parameters, setParameters] = useState<DesignParameters | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (brief) {
      loadParameters();
    }
  }, [brief]);

  const loadParameters = async () => {
    if (!brief) return;

    setIsLoading(true);
    try {
      const response = await fetch("http://localhost:8000/api/agent/extract-parameters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief }),
      });

      if (response.ok) {
        const data = await response.json();
        setParameters(data);
      }
    } catch (error) {
      console.error("Failed to load parameters:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!brief) {
    return null;
  }

  return (
    <div className={`design-parameters-panel ${isCollapsed ? "collapsed" : ""}`}>
      <div className="panel-header">
        <h3>📊 Design Parameters</h3>
        <button
          className="collapse-button"
          onClick={onToggleCollapse}
          title={isCollapsed ? "Expand panel" : "Collapse panel"}
        >
          {isCollapsed ? "→" : "←"}
        </button>
      </div>

      {!isCollapsed && (
        <div className="panel-content">
          {isLoading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Analyzing design space...</p>
            </div>
          ) : parameters ? (
            <div className="parameters-grid">
              <div className="parameter-section">
                <label>Type</label>
                <div className="tags">
                  {parameters.type.map((item, idx) => (
                    <span
                      key={idx}
                      className={`tag ${activeKeyword === item ? 'active' : ''}`}
                      onClick={() => onParameterClick?.(item)}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div className="parameter-section">
                <label>Inspiration</label>
                <div className="tags">
                  {parameters.inspiration.map((item, idx) => (
                    <span
                      key={idx}
                      className={`tag ${activeKeyword === item ? 'active' : ''}`}
                      onClick={() => onParameterClick?.(item)}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div className="parameter-section">
                <label>Materials</label>
                <div className="tags">
                  {parameters.materials.map((item, idx) => (
                    <span
                      key={idx}
                      className={`tag ${activeKeyword === item ? 'active' : ''}`}
                      onClick={() => onParameterClick?.(item)}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div className="parameter-section">
                <label>Colors</label>
                <div className="tags">
                  {parameters.colors.map((item, idx) => (
                    <span
                      key={idx}
                      className={`tag ${activeKeyword === item ? 'active' : ''}`}
                      onClick={() => onParameterClick?.(item)}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div className="parameter-section">
                <label>Style Keywords</label>
                <div className="tags">
                  {parameters.style_keywords.map((item, idx) => (
                    <span
                      key={idx}
                      className={`tag ${activeKeyword === item ? 'active' : ''}`}
                      onClick={() => onParameterClick?.(item)}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <button
                className="refresh-button"
                onClick={loadParameters}
                disabled={isLoading}
              >
                🔄 Refresh
              </button>
            </div>
          ) : (
            <div className="empty-state">
              <p>No parameters extracted yet</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

