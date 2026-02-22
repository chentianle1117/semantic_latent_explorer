/**
 * Radial Dial - Global actions (Grasshopper-style)
 * Triggered by Space (toggle) or middle-click on canvas.
 * Circular layout with color-coded groups: agentic, image, global.
 */

import React, { useEffect } from "react";
import "./RadialDial.css";

export type RadialDialCategory = "agentic" | "image" | "global" | "system";

const CATEGORY_META: Record<RadialDialCategory, { color: string; label: string }> = {
  agentic: { color: '#a855f7', label: 'Agent' },
  image:   { color: '#14b8a6', label: 'Create' },
  global:  { color: '#fbbf24', label: 'Canvas' },
  system:  { color: '#58a6ff', label: 'Utility' },
};

const ARC_R = 52;   // inner arc radius — kept well inside button ring (buttons at RADIUS=100, 48px wide → inner edge at 76px)
const ARC_W = 11;   // background arc stroke width

export interface RadialDialAction {
  id: string;
  icon: string;
  label: string;
  description?: string;
  category: RadialDialCategory;
  onClick: () => void;
}

interface RadialDialProps {
  x: number;
  y: number;
  isOpen: boolean;
  onClose: () => void;
  actions: RadialDialAction[];
}

const RADIUS = 100;
const BUTTON_SIZE = 48;
const PAD = 120;

export const RadialDial: React.FC<RadialDialProps> = ({
  x,
  y,
  isOpen,
  onClose,
  actions,
}) => {
  const size = RADIUS * 2 + BUTTON_SIZE + PAD * 2;
  const clampedX = Math.max(size / 2 + 20, Math.min(window.innerWidth - size / 2 - 20, x));
  const clampedY = Math.max(size / 2 + 20, Math.min(window.innerHeight - size / 2 - 20, y));

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      onClose();
    }
  };

  const cx = size / 2;
  const cy = size / 2;
  const n = actions.length;
  const startAngle = -90;

  // ── Category arc decorations ─────────────────────────────────────────────
  // 0.32 = ~64% of a step → leaves a 36% gap (wider gaps between color groups)
  const halfStepDeg = (360 / n) * 0.32;
  const catGroups = new Map<RadialDialCategory, number[]>();
  actions.forEach((action, i) => {
    const deg = (360 / n) * i + startAngle;
    const arr = catGroups.get(action.category) ?? [];
    arr.push(deg);
    catGroups.set(action.category, arr);
  });

  // Text label radius: slightly outside the background arc band
  const TEXT_R = ARC_R + ARC_W / 2 + 7;

  const arcElems = Array.from(catGroups.entries()).map(([cat, degs]) => {
    const meta = CATEGORY_META[cat];
    if (!meta || degs.length === 0) return null;
    const sorted = [...degs].sort((a, b) => a - b);
    const a1Deg = sorted[0] - halfStepDeg;
    const a2Deg = sorted[sorted.length - 1] + halfStepDeg;
    const midDeg = (a1Deg + a2Deg) / 2;
    const midRad = midDeg * (Math.PI / 180);
    const a1Rad = a1Deg * (Math.PI / 180);
    const a2Rad = a2Deg * (Math.PI / 180);
    const span = a2Rad - a1Rad;
    const x1 = cx + ARC_R * Math.cos(a1Rad);
    const y1 = cy + ARC_R * Math.sin(a1Rad);
    const x2 = cx + ARC_R * Math.cos(a2Rad);
    const y2 = cy + ARC_R * Math.sin(a2Rad);
    const largeArc = span > Math.PI ? 1 : 0;
    const bgD = `M ${x1} ${y1} A ${ARC_R} ${ARC_R} 0 ${largeArc} 1 ${x2} ${y2}`;
    // Label position: at TEXT_R from center, at arc midpoint angle
    const tx = cx + TEXT_R * Math.cos(midRad);
    const ty = cy + TEXT_R * Math.sin(midRad);
    // Rotation: tangent to circle (+90° from radial). Flip 180° in the left/bottom half
    // so text always reads left-to-right.
    let textRot = midDeg + 90;
    if (textRot > 90 && textRot <= 270) textRot += 180;
    return (
      <g key={cat}>
        <path d={bgD} fill="none" stroke={meta.color} strokeWidth={ARC_W} strokeOpacity={0.15} strokeLinecap="round" />
        <text
          x={tx}
          y={ty}
          fontSize="8"
          fontWeight="700"
          letterSpacing="0.08em"
          fill={meta.color}
          fillOpacity={0.7}
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(${textRot}, ${tx}, ${ty})`}
        >
          {meta.label.toUpperCase()}
        </text>
      </g>
    );
  });

  if (!isOpen) return null;

  return (
    <div
      className="radial-dial-backdrop"
      onClick={handleBackdropClick}
      onMouseDown={handleBackdropMouseDown}
      role="dialog"
      aria-label="Global actions menu"
    >
      <div
        className="radial-dial radial-dial-circular"
        style={{
          left: clampedX,
          top: clampedY,
          transform: "translate(-50%, -50%)",
          width: size,
          height: size,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Category arc decorations */}
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
          viewBox={`0 0 ${size} ${size}`}
        >
          {arcElems}
        </svg>

        {/* Center close button */}
        <button
          type="button"
          className="radial-dial-center"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        {actions.map((action, i) => {
          const angle = ((360 / n) * i + startAngle) * (Math.PI / 180);
          const tx = cx + RADIUS * Math.cos(angle);
          const ty = cy + RADIUS * Math.sin(angle);
          const labelDist = 78;
          const lx = BUTTON_SIZE / 2 + labelDist * Math.cos(angle);
          const ly = BUTTON_SIZE / 2 + labelDist * Math.sin(angle);
          return (
            <div
              key={action.id}
              className="radial-dial-item"
              style={{
                left: tx - BUTTON_SIZE / 2,
                top: ty - BUTTON_SIZE / 2,
              }}
            >
              <button
                type="button"
                className={`radial-dial-btn radial-dial-btn--${action.category}`}
                title={action.description ?? action.label}
                onClick={() => {
                  action.onClick();
                  onClose();
                }}
              >
                <span className="radial-dial-btn-icon">{action.icon}</span>
              </button>
              <span
                className="radial-dial-label"
                style={{
                  left: lx,
                  top: ly,
                  transform: "translate(-50%, -50%)",
                }}
              >
                {action.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
