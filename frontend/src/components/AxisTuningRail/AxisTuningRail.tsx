/**
 * AxisTuningRail — translucent overlay along axis edge of the canvas.
 * Shows a 0-10 linear scale where users can place image anchors,
 * plus editable sentences per axis end and AI Refine / Reproject controls.
 *
 * Supports drag-to-rail: pointerdown on a canvas shoe in tuning mode starts a
 * drag. A floating ghost follows the cursor, and a shadow magnet preview appears
 * on the rail when the cursor is over it. Release on the rail to place the anchor.
 *
 * Appears when axisTuningMode is true in the store.
 * The active axis (x or y) determines which edge the rail sits on.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../store/appStore";
import { useProgressStore } from "../../store/progressStore";
import { apiClient } from "../../api/client";
import "./AxisTuningRail.css";

/* ─── Sub-component: Editable sentence list ────────────────────────────────── */
const SentenceEditor: React.FC<{
  label: string;
  sentenceKey: string; // e.g. "x_negative"
}> = ({ label, sentenceKey }) => {
  const sentences = useAppStore(s => s.axisTuningSentences[sentenceKey] || []);
  const updateSentence = useAppStore(s => s.updateAxisTuningSentence);
  const [expanded, setExpanded] = useState(false);

  const preview = sentences[0] ?? "No sentences loaded";

  return (
    <div className="atr-sentence-group">
      <button className="atr-sentence-header" onClick={() => setExpanded(v => !v)}>
        <span className="atr-sentence-label">{label}</span>
        {!expanded && (
          <span className="atr-sentence-preview" title={sentences.join(" / ")}>{preview}</span>
        )}
        <span className="atr-sentence-chevron">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="atr-sentence-list">
          {sentences.map((sent, i) => (
            <input
              key={`${sentenceKey}-${i}`}
              className="atr-sentence-input"
              value={sent}
              onChange={e => updateSentence(sentenceKey, i, e.target.value)}
              title={sent}
            />
          ))}
          {sentences.length === 0 && (
            <span className="atr-sentence-empty">No sentences loaded</span>
          )}
        </div>
      )}
    </div>
  );
};

/* ─── Sub-component: Anchor on the rail ─────────────────────────────────────── */
const AnchorThumb: React.FC<{
  imageId: number;
  position: number;
  axis: 'x' | 'y';
  railLength: number;
}> = ({ imageId, position, axis, railLength }) => {
  const img = useAppStore(s => s.images.find(i => i.id === imageId));
  const updatePosition = useAppStore(s => s.updateAxisTuningAnchorPosition);
  const removeAnchor = useAppStore(s => s.removeAxisTuningAnchor);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ startPos: 0, startMouse: 0 });

  const offset = (position / 10) * railLength;

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    startRef.current = {
      startPos: position,
      startMouse: axis === 'x' ? e.clientX : e.clientY,
    };
  }, [position, axis]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const delta = axis === 'x'
      ? e.clientX - startRef.current.startMouse
      : -(e.clientY - startRef.current.startMouse); // Y inverted in screen coords
    const newPos = Math.max(0, Math.min(10, startRef.current.startPos + (delta / railLength) * 10));
    updatePosition(imageId, axis, Math.round(newPos * 10) / 10);
  }, [dragging, axis, imageId, railLength, updatePosition]);

  const handlePointerUp = useCallback(() => setDragging(false), []);

  if (!img) return null;

  return (
    <div
      className={`atr-anchor-thumb ${dragging ? 'dragging' : ''}`}
      style={axis === 'x'
        ? { left: offset, top: '50%', transform: 'translate(-50%, -50%)' }
        : { bottom: offset, left: '50%', transform: 'translate(-50%, 50%)' }
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      title={`Image ${imageId} at position ${position.toFixed(1)}`}
    >
      {img.base64_image && (
        <img
          className="atr-anchor-img"
          src={`data:image/png;base64,${img.base64_image}`}
          alt=""
          draggable={false}
        />
      )}
      <button
        className="atr-anchor-remove"
        onClick={e => { e.stopPropagation(); removeAnchor(imageId, axis); }}
        title="Remove anchor"
      >
        ×
      </button>
    </div>
  );
};

/* ─── Floating drag ghost that follows the cursor ──────────────────────────── */
const DragGhost: React.FC = () => {
  const dragImageId = useAppStore(s => s.axisTuningDragImageId);
  const img = useAppStore(s => dragImageId !== null ? s.images.find(i => i.id === dragImageId) : null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (dragImageId === null) return;
    const onMove = (e: PointerEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [dragImageId]);

  if (dragImageId === null || !img?.base64_image) return null;

  return (
    <div
      className="atr-drag-ghost"
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      <img
        src={`data:image/png;base64,${img.base64_image}`}
        alt=""
        draggable={false}
        style={{
          width: 52,
          height: 52,
          objectFit: "cover",
          borderRadius: 8,
          border: "2px solid rgba(88,166,255,0.7)",
          boxShadow: "0 4px 20px rgba(88,166,255,0.4), 0 0 40px rgba(88,166,255,0.15)",
          opacity: 0.85,
        }}
      />
    </div>
  );
};

/* ─── Main component ───────────────────────────────────────────────────────── */
export const AxisTuningRail: React.FC = () => {
  const tuningMode = useAppStore(s => s.axisTuningMode);
  const tuningAxis = useAppStore(s => s.axisTuningAxis);
  const sentences = useAppStore(s => s.axisTuningSentences);
  const anchors = useAppStore(s => s.axisTuningAnchors);
  const textWeight = useAppStore(s => s.axisTuningTextWeight);
  const setTextWeight = useAppStore(s => s.setAxisTuningTextWeight);
  const setSentences = useAppStore(s => s.setAxisTuningSentences);
  const setTuningAxis = useAppStore(s => s.setAxisTuningAxis);
  const clearTuning = useAppStore(s => s.clearAxisTuning);
  const axisLabels = useAppStore(s => s.axisLabels);
  const dragImageId = useAppStore(s => s.axisTuningDragImageId);
  const setDragImageId = useAppStore(s => s.setAxisTuningDragImageId);

  const railRef = useRef<HTMLDivElement>(null);
  const [railLength, setRailLength] = useState(400);
  const [loading, setLoading] = useState(false);
  const [refineInput, setRefineInput] = useState('');

  // Shadow magnet state: position on 0-10 scale when cursor is over rail during drag
  const [shadowPos, setShadowPos] = useState<number | null>(null);
  const shadowPosRef = useRef<number | null>(null);
  shadowPosRef.current = shadowPos; // keep ref in sync for closure access
  const shadowImgData = useAppStore(s =>
    dragImageId !== null ? s.images.find(i => i.id === dragImageId) : null
  );

  // Measure rail
  useEffect(() => {
    if (!railRef.current) return;
    const measure = () => {
      const el = railRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setRailLength(tuningAxis === 'x' ? rect.width : rect.height);
    };
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(railRef.current);
    return () => obs.disconnect();
  }, [tuningAxis]);

  // Load sentences when opening
  useEffect(() => {
    if (!tuningMode) return;
    setLoading(true);
    apiClient.getAxisSentences()
      .then(data => setSentences(data))
      .catch(err => console.error('Failed to load axis sentences:', err))
      .finally(() => setLoading(false));
  }, [tuningMode, setSentences]);

  // ── Global drag tracking: pointermove for shadow magnet, pointerup for drop ──
  useEffect(() => {
    if (dragImageId === null) return;

    const activeAxis = tuningAxis || 'x';

    const onMove = (e: PointerEvent) => {
      const railEl = railRef.current;
      if (!railEl) { setShadowPos(null); return; }
      const railRect = railEl.getBoundingClientRect();

      // Check if cursor is within the rail bounds (with some padding for tolerance)
      const pad = 30;
      const inX = e.clientX >= railRect.left - pad && e.clientX <= railRect.right + pad;
      const inY = e.clientY >= railRect.top - pad && e.clientY <= railRect.bottom + pad;

      if (inX && inY) {
        // Compute 0-10 position based on cursor
        let ratio: number;
        if (activeAxis === 'x') {
          ratio = (e.clientX - railRect.left) / railRect.width;
        } else {
          // Y axis: bottom=0, top=10
          ratio = 1 - (e.clientY - railRect.top) / railRect.height;
        }
        const pos10 = Math.max(0, Math.min(10, Math.round(ratio * 20) / 2)); // snap to 0.5
        setShadowPos(pos10);
      } else {
        setShadowPos(null);
      }
    };

    const onUp = () => {
      const store = useAppStore.getState();
      const imgId = store.axisTuningDragImageId;
      const currentShadow = shadowPosRef.current; // use ref to avoid stale closure
      if (imgId !== null && currentShadow !== null && tuningAxis) {
        // Drop on rail — add anchor at the shadow position
        store.addAxisTuningAnchor({ imageId: imgId, axis: tuningAxis, position: currentShadow });
      }
      // Always clear drag state
      setDragImageId(null);
      setShadowPos(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragImageId, tuningAxis, setDragImageId]);

  const axisAnchors = useMemo(
    () => anchors.filter(a => a.axis === tuningAxis),
    [anchors, tuningAxis],
  );

  const handleReproject = useCallback(async () => {
    setLoading(true);
    useProgressStore.getState().showProgress("reprojecting", "Reprojecting with tuned axes...", false);
    apiClient.logEvent('axis_tuning_reproject', {
      sentences,
      anchorCount: anchors.length,
      anchors: anchors.map(a => ({ imageId: a.imageId, axis: a.axis, position: a.position })),
      textWeight,
    });
    try {
      await apiClient.updateAxesTuned({
        custom_sentences: sentences,
        image_anchors: anchors.map(a => ({ imageId: a.imageId, axis: a.axis, position: a.position })),
        text_weight: textWeight,
      });

      useProgressStore.getState().updateProgress(50, "Fetching updated coordinates...");
      // WebSocket broadcast doesn't reach us — fetch state explicitly
      const freshState = await apiClient.getState();
      // CRITICAL: batch all updates in one setState call so SemanticCanvas sees
      // both images AND canvasBounds change simultaneously (prevents fast-path
      // from treating new coordinates as a no-op reorder)
      useAppStore.setState({
        images: freshState.images,
        ...(freshState.history_groups ? { historyGroups: freshState.history_groups } : {}),
        canvasBounds: null,  // force full re-render with new coordinate extents
      });

      useProgressStore.getState().updateProgress(100);
      useProgressStore.getState().hideProgress();
    } catch (err) {
      console.error('Reproject failed:', err);
      useProgressStore.getState().hideProgress();
    } finally {
      setLoading(false);
    }
  }, [sentences, anchors, textWeight]);

  const handleRefine = useCallback(async () => {
    if (!refineInput.trim()) return;
    setLoading(true);
    try {
      const result = await apiClient.refineSentences({
        sentences,
        instruction: refineInput.trim(),
      });
      setSentences(result);
      setRefineInput('');
    } catch (err) {
      console.error('Refine failed:', err);
    } finally {
      setLoading(false);
    }
  }, [sentences, refineInput, setSentences]);

  if (!tuningMode) return null;

  const activeAxis = tuningAxis || 'x';
  const negLabel = activeAxis === 'x' ? axisLabels.x[0] : axisLabels.y[0];
  const posLabel = activeAxis === 'x' ? axisLabels.x[1] : axisLabels.y[1];
  const negKey = `${activeAxis}_negative`;
  const posKey = `${activeAxis}_positive`;

  // Compute shadow magnet offset in pixels
  const shadowOffset = shadowPos !== null ? (shadowPos / 10) * railLength : 0;

  return (
    <>
      {/* Floating ghost that follows cursor during drag */}
      <DragGhost />

      <div className={`axis-tuning-overlay atr-axis-${activeAxis}`} data-tour="axis-tuning-rail">
        {/* Tab switcher */}
        <div className="atr-axis-tabs">
          <button
            className={`atr-axis-tab ${activeAxis === 'x' ? 'active' : ''}`}
            onClick={() => setTuningAxis('x')}
          >
            X Axis
          </button>
          <button
            className={`atr-axis-tab ${activeAxis === 'y' ? 'active' : ''}`}
            onClick={() => setTuningAxis('y')}
          >
            Y Axis
          </button>
          <button className="atr-close" onClick={clearTuning} title="Exit tuning mode">✕</button>
        </div>

        {/* Sentence editors (negative + positive) */}
        <div className="atr-sentences">
          <SentenceEditor label={`← ${negLabel}`} sentenceKey={negKey} />
          <SentenceEditor label={`${posLabel} →`} sentenceKey={posKey} />
        </div>

        {/* AI Refine */}
        <div className="atr-refine">
          <input
            className="atr-refine-input"
            value={refineInput}
            onChange={e => setRefineInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRefine()}
            placeholder="Refine sentences... e.g. 'make negative more about flat soles'"
            disabled={loading}
          />
          <button className="atr-refine-btn" onClick={handleRefine} disabled={loading || !refineInput.trim()}>
            AI Refine
          </button>
        </div>

        {/* Hint */}
        <div className="atr-hint">
          Drag shoes from the canvas onto the rail to anchor them
        </div>

        {/* Rail (linear 0-10 scale with anchors) */}
        <div
          ref={railRef}
          className={`atr-rail ${dragImageId !== null ? 'atr-rail-drop-ready' : ''}`}
        >
          <div className="atr-rail-track">
            {/* Tick marks */}
            {Array.from({ length: 11 }, (_, i) => (
              <div
                key={i}
                className="atr-rail-tick"
                style={activeAxis === 'x'
                  ? { left: `${(i / 10) * 100}%` }
                  : { bottom: `${(i / 10) * 100}%` }
                }
              >
                <span className="atr-tick-label">{i}</span>
              </div>
            ))}

            {/* Shadow magnet: ghost preview on rail during drag */}
            {dragImageId !== null && shadowPos !== null && shadowImgData?.base64_image && (
              <div
                className="atr-shadow-magnet"
                style={activeAxis === 'x'
                  ? { left: shadowOffset, top: '50%', transform: 'translate(-50%, -50%)' }
                  : { bottom: shadowOffset, left: '50%', transform: 'translate(-50%, 50%)' }
                }
              >
                <img
                  src={`data:image/png;base64,${shadowImgData.base64_image}`}
                  alt=""
                  draggable={false}
                  className="atr-anchor-img"
                />
                <span className="atr-shadow-label">{shadowPos.toFixed(1)}</span>
              </div>
            )}

            {/* Anchor thumbnails */}
            {axisAnchors.map(a => (
              <AnchorThumb
                key={`${a.imageId}-${a.axis}`}
                imageId={a.imageId}
                position={a.position}
                axis={activeAxis}
                railLength={railLength}
              />
            ))}
          </div>

          <div className="atr-rail-labels">
            <span className="atr-rail-neg">{negLabel}</span>
            <span className="atr-rail-pos">{posLabel}</span>
          </div>
        </div>

        {/* Text weight slider + Reproject button */}
        <div className="atr-controls">
          <label className="atr-weight-label">
            Text weight
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={textWeight}
              onChange={e => setTextWeight(parseFloat(e.target.value))}
              className="atr-weight-slider"
            />
            <span className="atr-weight-value">{(textWeight * 100).toFixed(0)}%</span>
          </label>

          <span className="atr-anchor-count">
            {axisAnchors.length} anchor{axisAnchors.length !== 1 ? 's' : ''}
          </span>

          <button
            className="atr-reproject-btn"
            onClick={handleReproject}
            disabled={loading}
          >
            {loading ? 'Projecting…' : 'Reproject'}
          </button>
        </div>
      </div>
    </>
  );
};
