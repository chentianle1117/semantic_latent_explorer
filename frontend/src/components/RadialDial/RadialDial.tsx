/**
 * Radial Dial - Global actions (Grasshopper-style)
 * Triggered by Space (toggle) or middle-click on canvas.
 * Circular layout with color-coded groups: agentic, image, global.
 */

import React, { useEffect } from "react";
import "./RadialDial.css";

export type RadialDialCategory = "agentic" | "image" | "global" | "system";

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
          const labelDist = 44;
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
