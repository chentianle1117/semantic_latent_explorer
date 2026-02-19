/**
 * Dynamic Island — iPhone-style animated pill for agent notifications.
 * Idle: small pill. Thinking: pulsing. Expanded: message + action.
 *
 * For axis-type insights, the InlineAxisSuggestions panel handles the actual interaction.
 * DynamicIsland just shows the notification and dismisses itself — inlineAxisData persists.
 */

import React, { useEffect, useRef } from "react";
import { useAppStore } from "../../store/appStore";
import type { RegionHighlight } from "../../types";
import "./DynamicIsland.css";

interface DynamicIslandProps {
  onShowGap: (regions: RegionHighlight[]) => void;
}

export const DynamicIsland: React.FC<DynamicIslandProps> = ({ onShowGap }) => {
  const agentStatus = useAppStore((s) => s.agentStatus);
  const insight = useAppStore((s) => s.agentInsight);
  const dismissInsight = useAppStore((s) => s.dismissInsight);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss expanded state after 8 seconds
  useEffect(() => {
    if (!insight) return;
    if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    autoDismissRef.current = setTimeout(() => {
      // Just dismiss the DI notification — inlineAxisData persists independently
      dismissInsight();
    }, 8000);
    return () => {
      if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    };
  }, [insight, dismissInsight]);

  const handleAction = () => {
    if (!insight) return;
    if (insight.type === "gap" || insight.type === "prompt") {
      const regions = insight.data?.allRegions || [];
      if (regions.length > 0) onShowGap(regions);
    }
    // For axis type: InlineAxisSuggestions panel is already visible at the bottom,
    // so clicking "Show" just dismisses the DI notification — axis data persists.
    dismissInsight();
  };

  const isExpanded = !!insight;
  const isThinking = agentStatus === "thinking" && !insight;

  const stateClass = isExpanded
    ? "di-expanded"
    : isThinking
    ? "di-thinking"
    : "di-idle";

  // Choose icon and action label based on insight type
  const insightIcon = insight?.type === "gap" ? "🔭" : insight?.type === "axis" ? "📐" : "💡";
  const actionLabel = insight?.type === "axis" ? "Got it" : "Show";

  return (
    <div className={`dynamic-island ${stateClass}`}>
      {isExpanded ? (
        <div className="di-content">
          <span className="di-icon">{insightIcon}</span>
          <span className="di-message">{insight!.message}</span>
          <div className="di-btns">
            <button className="di-action-btn" onClick={handleAction}>
              {actionLabel}
            </button>
            <button className="di-dismiss-btn" onClick={dismissInsight}>
              ×
            </button>
          </div>
        </div>
      ) : (
        <div className="di-content">
          <span className={`di-indicator ${isThinking ? "di-pulse" : "di-dot"}`} />
          <span className="di-label">
            {isThinking ? "Analyzing…" : "Companion"}
          </span>
        </div>
      )}
    </div>
  );
};
