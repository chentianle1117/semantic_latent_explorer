/**
 * AxisTuningRail — translucent overlay along axis edge of the canvas.
 * Shows a 0-10 linear scale where users can place image anchors,
 * plus editable sentences per axis end and AI Refine / Reproject controls.
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

  return (
    <div className="atr-sentence-group">
      <span className="atr-sentence-label">{label}</span>
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
      : -(e.clientY - startRef.current.startMouse); // Y axis is inverted in screen coords
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

  const railRef = useRef<HTMLDivElement>(null);
  const [railLength, setRailLength] = useState(400);
  const [loading, setLoading] = useState(false);
  const [refineInput, setRefineInput] = useState('');

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

  const axisAnchors = useMemo(
    () => anchors.filter(a => a.axis === tuningAxis),
    [anchors, tuningAxis],
  );

  const handleReproject = useCallback(async () => {
    setLoading(true);
    useProgressStore.getState().showProgress("reprojecting", "Reprojecting with tuned axes...", false);
    try {
      await apiClient.updateAxesTuned({
        custom_sentences: sentences,
        image_anchors: anchors.map(a => ({ imageId: a.imageId, axis: a.axis, position: a.position })),
        text_weight: textWeight,
      });

      useProgressStore.getState().updateProgress(50, "Fetching updated coordinates...");
      // WebSocket broadcast doesn't reach us — fetch state explicitly
      const freshState = await apiClient.getState();
      const store = useAppStore.getState();
      store.setImages(freshState.images);
      if (freshState.history_groups) store.setHistoryGroups(freshState.history_groups);
      store.resetCanvasBounds();

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

  return (
    <div className={`axis-tuning-overlay atr-axis-${activeAxis}`}>
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

      {/* Rail (linear 0-10 scale with anchors) */}
      <div
        ref={railRef}
        className="atr-rail"
        title="Click a shoe on canvas, then click here to place it as an anchor"
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
  );
};
