/**
 * Dynamic Island — 4 states:
 *  idle          → small pill: "· Companion"
 *  working       → pulsing pill: "⟳ Analyzing..."  (driven by isAgentWorking)
 *  insight-ready → glowing pill with badge (non-sticky, hover to expand)
 *  expanded      → hover reveals full message + dismiss button
 *
 * Non-sticky: insight-ready does NOT block agent timers.
 * Auto-dismisses after 10 seconds.
 */

import React, { useEffect, useRef, useState } from "react";
import { useAppStore } from "../../store/appStore";
import "./DynamicIsland.css";

export const DynamicIsland: React.FC = () => {
  const agentStatus = useAppStore((s) => s.agentStatus);
  const isAgentWorking = useAppStore((s) => s.isAgentWorking);
  const insight = useAppStore((s) => s.agentInsight);
  const dismissInsight = useAppStore((s) => s.dismissInsight);
  const [hovered, setHovered] = useState(false);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss insight after 10 seconds
  useEffect(() => {
    if (!insight) { setHovered(false); return; }
    if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    autoDismissRef.current = setTimeout(() => dismissInsight(), 10000);
    return () => { if (autoDismissRef.current) clearTimeout(autoDismissRef.current); };
  }, [insight, dismissInsight]);

  const isWorking = isAgentWorking || agentStatus === "thinking";
  const isInsightReady = !!insight && !isWorking;
  const isExpanded = isInsightReady && hovered;

  const stateClass = isExpanded
    ? "di-expanded"
    : isWorking
    ? "di-working"
    : isInsightReady
    ? "di-insight-ready"
    : "di-idle";

  const insightIcon = insight?.type === "gap"
    ? "🔭"
    : insight?.type === "axis"
    ? "📐"
    : insight?.type === "variation"
    ? "✨"
    : "💡";

  // Brief label for insight-ready pill
  const insightBadge = insight?.type === "axis"
    ? "New axes"
    : insight?.type === "gap"
    ? "Canvas explored"
    : insight?.type === "variation"
    ? "Alternative ready"
    : "New insight";

  return (
    <div
      className={`dynamic-island ${stateClass}`}
      onMouseEnter={() => isInsightReady && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {isExpanded ? (
        /* Expanded: full message + dismiss */
        <div className="di-content">
          <span className="di-icon">{insightIcon}</span>
          <span className="di-message">{insight!.message}</span>
          <button className="di-dismiss-btn" onClick={() => { dismissInsight(); setHovered(false); }}>
            ×
          </button>
        </div>
      ) : isInsightReady ? (
        /* Insight-ready: compact glow with badge label */
        <div className="di-content">
          <span className="di-indicator di-glow" />
          <span className="di-label">{insightBadge}</span>
        </div>
      ) : isWorking ? (
        /* Working: pulsing indicator */
        <div className="di-content">
          <span className="di-indicator di-pulse" />
          <span className="di-label">Analyzing…</span>
        </div>
      ) : (
        /* Idle: small dot + label */
        <div className="di-content">
          <span className="di-indicator di-dot" />
          <span className="di-label">Companion</span>
        </div>
      )}
    </div>
  );
};
