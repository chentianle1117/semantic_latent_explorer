import React, { useEffect, useRef } from "react";
import { useAppStore } from "../../store/appStore";
import type { RegionHighlight } from "../../types";
import "./AgentToast.css";

interface AgentToastProps {
  onShowGap: (regions: RegionHighlight[]) => void;
}

export const AgentToast: React.FC<AgentToastProps> = ({ onShowGap }) => {
  const insight = useAppStore((s) => s.agentInsight);
  const dismissInsight = useAppStore((s) => s.dismissInsight);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss after 10 seconds
  useEffect(() => {
    if (!insight) return;

    if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    autoDismissRef.current = setTimeout(() => {
      dismissInsight();
    }, 10000);

    return () => {
      if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    };
  }, [insight, dismissInsight]);

  if (!insight) return null;

  const handleAction = () => {
    if (insight.type === "gap" || insight.type === "prompt") {
      // Show the region highlights on canvas
      const regions = insight.data?.allRegions || [];
      if (regions.length > 0) {
        onShowGap(regions);
      }
    }
    dismissInsight();
  };

  return (
    <div className="agent-toast">
      <div className="toast-icon">
        {insight.type === "gap" ? "🔭" : "💡"}
      </div>
      <div className="toast-body">
        <p className="toast-message">{insight.message}</p>
        <div className="toast-actions">
          <button className="toast-btn primary" onClick={handleAction}>
            Show Me
          </button>
          <button className="toast-btn dismiss" onClick={dismissInsight}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
