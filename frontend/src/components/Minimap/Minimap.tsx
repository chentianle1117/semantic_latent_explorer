/**
 * Minimap — bottom-left overlay showing all image positions + current viewport.
 * Auto-fits to the bounding box of all dots so the full extent is always visible.
 * The viewport rect can be dragged to pan the semantic canvas in real time.
 */

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useAppStore } from "../../store/appStore";
import { CATEGORY_COLORS } from "../../utils/generationCategories";
import "./Minimap.css";

const MAX_W = 196;
const MAX_H = 130;
const PAD = 8;
const EXTENT_PAD_FRAC = 0.08; // 8% padding around dot bounding box

export const Minimap: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const minimapDots = useAppStore((s) => s.minimapDots);
  const minimapViewport = useAppStore((s) => s.minimapViewport);
  const setMinimapPanRequest = useAppStore((s) => s.setMinimapPanRequest);

  // Compute bounding box of all dots + viewport (so viewport rect stays in view too)
  const { mapW, mapH, drawW, drawH, minX, minY, rangeX, rangeY } = useMemo(() => {
    const points: { x: number; y: number }[] = [...minimapDots];
    if (minimapViewport) {
      points.push(
        { x: minimapViewport.x1, y: minimapViewport.y1 },
        { x: minimapViewport.x2, y: minimapViewport.y2 }
      );
    }

    if (points.length === 0) {
      return { mapW: MAX_W, mapH: 100, drawW: MAX_W - PAD * 2, drawH: 100 - PAD * 2, minX: 0, minY: 0, rangeX: 100, rangeY: 100 };
    }

    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of points) {
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }

    const rX = Math.max(x1 - x0, 1);
    const rY = Math.max(y1 - y0, 1);
    const padX = rX * EXTENT_PAD_FRAC;
    const padY = rY * EXTENT_PAD_FRAC;

    const extX0 = x0 - padX;
    const extY0 = y0 - padY;
    const extRangeX = rX + padX * 2;
    const extRangeY = rY + padY * 2;

    const ratio = extRangeX / extRangeY;
    const maxDW = MAX_W - PAD * 2;
    const maxDH = MAX_H - PAD * 2;

    let dW = maxDW;
    let dH = dW / ratio;
    if (dH > maxDH) {
      dH = maxDH;
      dW = dH * ratio;
    }

    return {
      mapW: Math.round(dW + PAD * 2),
      mapH: Math.round(dH + PAD * 2),
      drawW: dW,
      drawH: dH,
      minX: extX0,
      minY: extY0,
      rangeX: extRangeX,
      rangeY: extRangeY,
    };
  }, [minimapDots, minimapViewport]);

  // Map world coords → minimap pixel coords
  const toMapX = (x: number) => PAD + ((x - minX) / rangeX) * drawW;
  const toMapY = (y: number) => PAD + ((y - minY) / rangeY) * drawH;

  // ── Drag-to-pan ────────────────────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    initCenterX: number;
    initCenterY: number;
  } | null>(null);

  // Store layout values in a ref so the document-level handlers stay fresh
  const layoutRef = useRef({ drawW, drawH, rangeX, rangeY, minX, minY });
  useEffect(() => {
    layoutRef.current = { drawW, drawH, rangeX, rangeY, minX, minY };
  }, [drawW, drawH, rangeX, rangeY, minX, minY]);

  const handleViewportMouseDown = (e: React.MouseEvent) => {
    if (!minimapViewport) return;
    e.preventDefault();
    e.stopPropagation();
    const initCenterX = (minimapViewport.x1 + minimapViewport.x2) / 2;
    const initCenterY = (minimapViewport.y1 + minimapViewport.y2) / 2;
    dragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, initCenterX, initCenterY };
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      const { drawW: dW, drawH: dH, rangeX: rX, rangeY: rY } = layoutRef.current;
      const dmx = e.clientX - start.mouseX;
      const dmy = e.clientY - start.mouseY;
      const dBaseX = (dmx / dW) * rX;
      const dBaseY = (dmy / dH) * rY;
      setMinimapPanRequest({
        centerX: start.initCenterX + dBaseX,
        centerY: start.initCenterY + dBaseY,
      });
    };
    const onUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, setMinimapPanRequest]);

  if (collapsed) {
    return (
      <div className="minimap-wrap">
        <button className="minimap-collapsed-btn" onClick={() => setCollapsed(false)}>
          Minimap
        </button>
      </div>
    );
  }

  // Viewport rect dimensions in minimap pixels
  const vpX = minimapViewport ? toMapX(minimapViewport.x1) : 0;
  const vpY = minimapViewport ? toMapY(minimapViewport.y1) : 0;
  const vpW = minimapViewport
    ? Math.max(4, (minimapViewport.x2 - minimapViewport.x1) / rangeX * drawW)
    : 0;
  const vpH = minimapViewport
    ? Math.max(4, (minimapViewport.y2 - minimapViewport.y1) / rangeY * drawH)
    : 0;

  return (
    <div className="minimap-wrap" data-tour="minimap">
      <div className="minimap-panel" style={{ width: mapW + 4 }}>
        <div className="minimap-header">
          <span className="minimap-title">Minimap</span>
          <button className="minimap-collapse-btn" onClick={() => setCollapsed(true)} title="Collapse">
            −
          </button>
        </div>

        <svg className="minimap-svg" width={mapW} height={mapH} style={{ cursor: isDragging ? "grabbing" : "default" }}>
          {/* Background */}
          <rect width={mapW} height={mapH} fill="rgba(8,12,18,0.6)" />

          {/* Image dots */}
          {minimapDots.map((dot) => (
            <circle
              key={dot.id}
              cx={toMapX(dot.x)}
              cy={toMapY(dot.y)}
              r={2.5}
              fill={CATEGORY_COLORS[dot.category]}
              fillOpacity={0.82}
            />
          ))}

          {/* Viewport rect — draggable */}
          {minimapViewport && (
            <g>
              {/* Transparent hit area slightly larger for easier grabbing */}
              <rect
                x={vpX - 3}
                y={vpY - 3}
                width={vpW + 6}
                height={vpH + 6}
                fill="transparent"
                style={{ cursor: isDragging ? "grabbing" : "grab" }}
                onMouseDown={handleViewportMouseDown}
              />
              {/* Visible viewport outline */}
              <rect
                x={vpX}
                y={vpY}
                width={vpW}
                height={vpH}
                fill="rgba(255,255,255,0.06)"
                stroke={isDragging ? "rgba(0, 210, 255, 0.85)" : "rgba(255,255,255,0.55)"}
                strokeWidth={isDragging ? 1.8 : 1.5}
                rx={2}
                style={{ pointerEvents: "none" }}
              />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
};
