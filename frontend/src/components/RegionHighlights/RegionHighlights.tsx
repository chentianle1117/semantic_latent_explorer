import React, { useState } from "react";
import "./RegionHighlights.css";

interface RegionHighlight {
  center: [number, number];
  title: string;
  description: string;
  suggested_prompts: string[];
}

interface RegionHighlightsProps {
  regions: RegionHighlight[];
  canvasWidth: number;
  canvasHeight: number;
  onGenerateFromRegion: (prompt: string, region: RegionHighlight) => void;
  onDismiss: () => void;
}

export const RegionHighlights: React.FC<RegionHighlightsProps> = ({
  regions,
  canvasWidth,
  canvasHeight,
  onGenerateFromRegion,
  onDismiss,
}) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (regions.length === 0) return null;

  return (
    <div className="region-highlights-overlay">
      {/* SVG for circles and lines */}
      <svg
        className="highlights-svg"
        width={canvasWidth}
        height={canvasHeight}
        style={{ pointerEvents: "none" }}
      >
        {regions.map((region, index) => {
          const [x, y] = region.center;
          // Convert normalized coordinates (0-1) to pixel coordinates
          const pixelX = x * canvasWidth;
          const pixelY = y * canvasHeight;

          return (
            <g key={index}>
              {/* Pulsing circle */}
              <circle
                cx={pixelX}
                cy={pixelY}
                r="40"
                className="region-circle"
                style={{
                  animationDelay: `${index * 0.2}s`,
                }}
              />
              {/* Inner dot */}
              <circle cx={pixelX} cy={pixelY} r="6" className="region-dot" />
            </g>
          );
        })}
      </svg>

      {/* Floating cards */}
      {regions.map((region, index) => {
        const [x, y] = region.center;
        const pixelX = x * canvasWidth;
        const pixelY = y * canvasHeight;

        // Position card offset from the region center
        const cardX = Math.min(pixelX + 60, canvasWidth - 280);
        const cardY = Math.max(20, Math.min(pixelY - 40, canvasHeight - 200));

        const isExpanded = expandedIndex === index;

        return (
          <div
            key={index}
            className={`region-card ${isExpanded ? "expanded" : ""}`}
            style={{
              left: `${cardX}px`,
              top: `${cardY}px`,
              animationDelay: `${index * 0.15}s`,
            }}
          >
            <div className="card-header">
              <div className="card-title">{region.title}</div>
              <button
                className="card-expand-button"
                onClick={() => setExpandedIndex(isExpanded ? null : index)}
                title={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? "−" : "+"}
              </button>
            </div>

            <div className="card-description">{region.description}</div>

            {isExpanded && (
              <div className="card-prompts">
                <div className="prompts-label">Suggested prompts:</div>
                {region.suggested_prompts.map((prompt, pIndex) => (
                  <button
                    key={pIndex}
                    className="prompt-chip"
                    onClick={() => onGenerateFromRegion(prompt, region)}
                    title="Click to generate from this prompt"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Dismiss all button */}
      <button className="dismiss-all-button" onClick={onDismiss} title="Dismiss all highlights">
        ✕ Dismiss Highlights
      </button>
    </div>
  );
};
