/**
 * Dynamic Island — 4 states:
 *  idle          → small pill: "· AI Standby"
 *  working       → pulsing pill: "⟳ Analyzing..."  (driven by isAgentWorking)
 *  insight-ready → glowing pill with badge (non-sticky, hover to expand)
 *  expanded      → hover reveals full message + dismiss button
 *
 * Non-sticky: insight-ready does NOT block agent timers.
 * Auto-dismisses oldest insight after 10 seconds.
 * Multiple insights accumulate — count badge shows how many are pending.
 *
 * Directional blobs: purple glow dots rendered outside the pill edge,
 * pointing toward all agent-generated images on the canvas.
 * Size and opacity are inversely proportional to distance from viewport center.
 */

import React, { useEffect, useRef, useState, useMemo } from "react";
import { useAppStore } from "../../store/appStore";
import "./DynamicIsland.css";

const MERGE_ANGLE_RAD = 0.35; // ~20°

interface BlobSpec {
  key: string;
  x: number; // offset from DI center
  y: number;
  size: number;
  opacity: number;
  color: string;
}

function computeBlobs(
  agentDots: Array<{ id: number; x: number; y: number; color?: string }>,
  diScreenX: number,
  diScreenY: number,
  rx: number, // half-width of DI + margin
  ry: number, // half-height of DI + margin
): BlobSpec[] {
  if (agentDots.length === 0) return [];

  // Compute angle and distance from DI's screen position to each ghost
  const items = agentDots.map((dot) => {
    const dx = dot.x - diScreenX;
    const dy = dot.y - diScreenY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const angle = Math.atan2(dy, dx);
    return { id: dot.id, angle, dist, color: dot.color || '#a855f7' };
  });

  // Normalize distances for size/opacity mapping
  const maxDist = Math.max(...items.map((i) => i.dist), 1);

  // Sort by angle for merging
  items.sort((a, b) => a.angle - b.angle);

  // Merge blobs within MERGE_ANGLE_RAD
  const merged: { angle: number; weight: number; id: string; color: string }[] = [];
  for (const item of items) {
    const normDist = item.dist / maxDist;
    const weight = 1 - normDist * 0.7; // closer = heavier
    const last = merged[merged.length - 1];
    if (last && Math.abs(item.angle - last.angle) < MERGE_ANGLE_RAD) {
      const totalW = last.weight + weight;
      last.angle = (last.angle * last.weight + item.angle * weight) / totalW;
      last.weight = totalW;
      last.id += `_${item.id}`;
      // Keep dominant color (heavier weight wins)
      if (weight > last.weight - weight) last.color = item.color;
    } else {
      merged.push({ angle: item.angle, weight, id: String(item.id), color: item.color });
    }
  }

  // Convert to BlobSpec
  const maxWeight = Math.max(...merged.map((m) => m.weight), 1);
  return merged.map((m) => {
    const normW = Math.min(m.weight / maxWeight, 1);
    const size = 5 + normW * 9; // 5–14px
    const opacity = 0.35 + normW * 0.55; // 0.35–0.9
    return {
      key: m.id,
      x: Math.cos(m.angle) * rx,
      y: Math.sin(m.angle) * ry,
      size,
      opacity,
      color: m.color,
    };
  });
}

export const DynamicIsland: React.FC = () => {
  const agentStatus = useAppStore((s) => s.agentStatus);
  const isAgentWorking = useAppStore((s) => s.isAgentWorking);
  const agentWorkingLabel = useAppStore((s) => s.agentWorkingLabel);
  const agentInsights = useAppStore((s) => s.agentInsights);
  const dismissInsight = useAppStore((s) => s.dismissInsight);
  const minimapGhostDots = useAppStore((s) => s.minimapGhostDots);
  const minimapViewport = useAppStore((s) => s.minimapViewport);
  const [hovered, setHovered] = useState(false);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const diRef = useRef<HTMLDivElement>(null);
  const [diSize, setDiSize] = useState({ w: 140, h: 34 });

  // Track DI pill dimensions for blob positioning
  useEffect(() => {
    const el = diRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setDiSize({ w: r.width, h: r.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // The oldest insight is the one shown (FIFO — dismiss removes from front)
  const insight = agentInsights.length > 0 ? agentInsights[0] : null;
  const count = agentInsights.length;

  // Auto-dismiss oldest insight after 10 seconds
  useEffect(() => {
    if (!insight) { setHovered(false); return; }
    if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    autoDismissRef.current = setTimeout(() => dismissInsight(), 10000);
    return () => { if (autoDismissRef.current) clearTimeout(autoDismissRef.current); };
  }, [insight?.id, dismissInsight]);

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
  const insightBadge = count > 1
    ? `${count} suggestions`
    : insight?.type === "axis"
    ? "New axes"
    : insight?.type === "gap"
    ? "Canvas explored"
    : insight?.type === "variation"
    ? "Alternative ready"
    : "New insight";

  // Compute directional blobs — only for unaccepted ghost nodes
  // Direction computed from DI's screen position (top-center of viewport)
  const blobs = useMemo(() => {
    const agentDots = minimapGhostDots;
    if (agentDots.length === 0) return [];

    // DI is positioned at top-center of canvas area
    // Ghost dot coords are SVG screen-space, DI is at roughly (canvasCenter, ~30px from top)
    const diScreenX = minimapViewport
      ? (minimapViewport.x1 + minimapViewport.x2) / 2
      : window.innerWidth / 2;
    // DI is near the top of the viewport, not the center
    const diScreenY = minimapViewport
      ? minimapViewport.y1 + 30
      : 30;

    // Ellipse radii: pill half-dimensions + margin
    const margin = 10;
    const rx = diSize.w / 2 + margin;
    const ry = diSize.h / 2 + margin;

    return computeBlobs(agentDots, diScreenX, diScreenY, rx, ry);
  }, [minimapGhostDots, minimapViewport, diSize]);

  return (
    <div
      ref={diRef}
      className={`dynamic-island ${stateClass}`}
      onMouseEnter={() => isInsightReady && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Directional blobs — rendered outside the pill via overflow: visible */}
      {blobs.map((b) => (
        <div
          key={b.key}
          className="di-blob"
          style={{
            left: `calc(50% + ${b.x}px)`,
            top: `calc(50% + ${b.y}px)`,
            width: b.size,
            height: b.size,
            opacity: b.opacity,
            background: b.color,
            boxShadow: `0 0 8px 3px ${b.color}80`,
          }}
        />
      ))}

      {isExpanded ? (
        /* Expanded: full message + dismiss */
        <div className="di-content">
          <span className="di-icon">{insightIcon}</span>
          <span className="di-message">{insight!.message}</span>
          {count > 1 && (
            <span className="di-count-badge">{count}</span>
          )}
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
          <span className="di-label">{agentWorkingLabel}</span>
        </div>
      ) : (
        /* Idle: small dot + label */
        <div className="di-content">
          <span className="di-indicator di-dot" />
          <span className="di-label">AI Standby</span>
        </div>
      )}
    </div>
  );
};
