/**
 * Event-Based Agent Trigger System
 *
 * Design philosophy — parallel pipeline, non-intrusive:
 *
 *   STEP 1 (START): When user begins generating or loads images →
 *     kick off background Gemini analysis immediately (no UI change).
 *
 *   STEP 2 (COMPUTE): Gemini analyzes canvas gaps/clusters quietly.
 *     Results stored as pendingGhosts — nothing shown yet.
 *
 *   STEP 3 (REVEAL): After generation ends AND user has been idle for
 *     REVEAL_IDLE_MS → paint ghost hazes on canvas (very low opacity,
 *     distinct hue). Never interrupts active work.
 *
 *   STEP 4 (RESET): When user starts a new generation → cancel any
 *     pending reveal timer; restart fresh analysis for new canvas state.
 *
 * Ghost nodes carry isHaze=true so SemanticCanvas renders them as
 * soft background blobs rather than full shoe thumbnails.
 */

import { useEffect, useRef, useCallback } from "react";
import { useAppStore } from "../store/appStore";
import type { AgentInsight } from "../types";

// How long after generation ends before revealing ghost hazes
const REVEAL_IDLE_MS = 6000;

// How long after generation STARTS to kick off analysis
// (short — we want Gemini working while FAL generates)
const ANALYSIS_KICK_MS = 800;

// Minimum images needed before suggesting anything
const MIN_IMAGES = 3;

// Fire initial trigger after first load (when user hasn't done anything yet)
const INITIAL_DELAY_MS = 4000;

export function useAgentEventSystem() {
  const images = useAppStore((s) => s.images);
  const agentInsight = useAppStore((s) => s.agentInsight);
  const agentMode = useAppStore((s) => s.agentMode);
  const designBrief = useAppStore((s) => s.designBrief);
  const isInitialized = useAppStore((s) => s.isInitialized);
  const isGenerating = useAppStore((s) => s.isGenerating);
  const setAgentStatus = useAppStore((s) => s.setAgentStatus);
  const setAgentInsight = useAppStore((s) => s.setAgentInsight);
  const addGhostNode = useAppStore((s) => s.addGhostNode);
  const clearGhostNodes = useAppStore((s) => s.clearGhostNodes);

  const prevIsGeneratingRef = useRef(false);
  const prevImagesLenRef = useRef(0);
  const initialFiredRef = useRef(false);
  const isAnalyzingRef = useRef(false);

  // Pending ghosts: computed but not yet shown on canvas
  const pendingGhostsRef = useRef<any[]>([]);

  const analysisTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const brief = designBrief || "Explore shoe design variations";
  const visibleImages = images.filter((i) => i.visible);

  // ----------------------------------------------------------------
  // Axis suggestions (unchanged)
  // ----------------------------------------------------------------
  const triggerAxisSuggestions = useCallback(async () => {
    if (isAnalyzingRef.current) return;
    isAnalyzingRef.current = true;
    setAgentStatus("thinking");

    try {
      const store = useAppStore.getState();
      const xStr = `${store.axisLabels.x[0]} - ${store.axisLabels.x[1]}`;
      const yStr = `${store.axisLabels.y[0]} - ${store.axisLabels.y[1]}`;

      const res = await fetch("http://localhost:8000/api/agent/suggest-axes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, current_x_axis: xStr, current_y_axis: yStr }),
      });
      if (!res.ok) throw new Error(`suggest-axes HTTP ${res.status}`);
      const data = await res.json();
      const suggestions = data.suggestions || [];

      if (suggestions.length > 0) {
        useAppStore.getState().setInlineAxisData(suggestions);
        const insight: AgentInsight = {
          id: `insight-axis-${Date.now()}`,
          type: "axis",
          message: `${suggestions.length} new axis direction${suggestions.length > 1 ? "s" : ""} to explore`,
          data: { axisSuggestions: suggestions },
          isRead: false,
          timestamp: Date.now(),
        };
        setAgentInsight(insight);
      } else {
        setAgentStatus("idle");
      }
    } catch (err) {
      console.warn("[Companion] Axis suggestion failed:", err);
      setAgentStatus("idle");
    } finally {
      isAnalyzingRef.current = false;
    }
  }, [brief, setAgentStatus, setAgentInsight]);

  // ----------------------------------------------------------------
  // Background analysis — computes ghost positions silently,
  // stores in pendingGhostsRef WITHOUT touching canvas state.
  // ----------------------------------------------------------------
  const runBackgroundAnalysis = useCallback(async () => {
    if (isAnalyzingRef.current) return;
    isAnalyzingRef.current = true;
    console.log("[Companion] Background analysis starting…");

    try {
      const res = await fetch("http://localhost:8000/api/agent/suggest-ghosts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, num_suggestions: 3 }),
      });
      if (!res.ok) throw new Error(`suggest-ghosts HTTP ${res.status}`);
      const data = await res.json();
      // Map backend field names → what SemanticCanvas haze rendering expects
      const ghosts = (data.ghosts || []).map((g: any) => ({
        ...g,
        description: g.suggested_prompt || g.description || g.reasoning || "Explore",
      }));
      pendingGhostsRef.current = ghosts;
      console.log("[Companion] Background analysis done —", ghosts.length, "hints ready (pending reveal)");
    } catch (err) {
      console.warn("[Companion] Background analysis failed:", err);
      pendingGhostsRef.current = [];
    } finally {
      isAnalyzingRef.current = false;
    }
  }, [brief]);

  // ----------------------------------------------------------------
  // Reveal — paints pending ghosts onto canvas as background hazes.
  // Only called after user idle period.
  // ----------------------------------------------------------------
  const revealPendingGhosts = useCallback(() => {
    const ghosts = pendingGhostsRef.current;
    if (ghosts.length === 0) return;
    pendingGhostsRef.current = [];

    // Check no active insight (sticky insight blocks all triggers)
    const store = useAppStore.getState();
    if (store.agentInsight !== null) return;
    if (store.agentMode !== "auto") return;

    console.log("[Companion] Revealing", ghosts.length, "ghost hazes on canvas");
    clearGhostNodes();
    // Mark as haze style for subtle rendering in SemanticCanvas
    ghosts.forEach((g: any) => addGhostNode({ ...g, isHaze: true }));

    const insight: AgentInsight = {
      id: `insight-ghost-${Date.now()}`,
      type: "gap",
      message: `${ghosts.length} unexplored design zone${ghosts.length > 1 ? "s" : ""} highlighted on canvas`,
      data: { allRegions: [] },
      isRead: false,
      timestamp: Date.now(),
    };
    setAgentInsight(insight);
  }, [clearGhostNodes, addGhostNode, setAgentInsight]);

  // ----------------------------------------------------------------
  // Schedule reveal after idle period — cancellable
  // ----------------------------------------------------------------
  const scheduleReveal = useCallback(() => {
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    revealTimerRef.current = setTimeout(() => {
      // Final guard: don't reveal while generating
      if (useAppStore.getState().isGenerating) return;
      revealPendingGhosts();
    }, REVEAL_IDLE_MS);
  }, [revealPendingGhosts]);

  // ----------------------------------------------------------------
  // Trigger A: initial — first load after canvas is populated
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!isInitialized) return;
    if (initialFiredRef.current) return;
    if (agentMode !== "auto") return;

    const currentLen = visibleImages.length;
    prevImagesLenRef.current = currentLen;
    if (currentLen < MIN_IMAGES) return;

    const timer = setTimeout(() => {
      if (useAppStore.getState().agentMode !== "auto") return;
      initialFiredRef.current = true;
      console.log("[Companion] Initial trigger: canvas has", currentLen, "images");
      // Kick analysis + schedule reveal for initial load
      runBackgroundAnalysis().then(() => scheduleReveal());
    }, INITIAL_DELAY_MS);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized, visibleImages.length]);

  // ----------------------------------------------------------------
  // Trigger B: generation lifecycle
  //   → generation START: kick background analysis immediately
  //   → generation END: schedule reveal after idle period
  //   → new generation start: cancel pending reveal, re-analyze
  // ----------------------------------------------------------------
  useEffect(() => {
    const wasGenerating = prevIsGeneratingRef.current;
    prevIsGeneratingRef.current = isGenerating;

    if (agentMode !== "auto") return;
    if (visibleImages.length < MIN_IMAGES) return;

    if (!wasGenerating && isGenerating) {
      // Generation STARTED → cancel any pending reveal; start fresh analysis
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      if (analysisTimerRef.current) clearTimeout(analysisTimerRef.current);
      pendingGhostsRef.current = [];

      console.log("[Companion] Generation started — kicking off background analysis in", ANALYSIS_KICK_MS, "ms");
      analysisTimerRef.current = setTimeout(() => {
        runBackgroundAnalysis();
      }, ANALYSIS_KICK_MS);
    }

    if (wasGenerating && !isGenerating) {
      // Generation ENDED → schedule reveal after idle period
      console.log("[Companion] Generation ended — scheduling reveal in", REVEAL_IDLE_MS, "ms");
      scheduleReveal();
    }

    return () => {
      if (analysisTimerRef.current) clearTimeout(analysisTimerRef.current);
    };
  }, [isGenerating, agentMode, visibleImages.length, runBackgroundAnalysis, scheduleReveal]);

  // ----------------------------------------------------------------
  // Trigger C: image load (without generation) — e.g. load from disk
  // ----------------------------------------------------------------
  useEffect(() => {
    if (agentMode !== "auto") return;
    const currentLen = visibleImages.length;
    const delta = currentLen - prevImagesLenRef.current;

    if (delta > 0 && !isGenerating && currentLen >= MIN_IMAGES) {
      prevImagesLenRef.current = currentLen;
      console.log("[Companion] Images loaded (+", delta, ") — scheduling analysis + reveal");
      if (analysisTimerRef.current) clearTimeout(analysisTimerRef.current);
      analysisTimerRef.current = setTimeout(() => {
        runBackgroundAnalysis().then(() => scheduleReveal());
      }, 1500);
    } else if (delta > 0) {
      prevImagesLenRef.current = currentLen;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleImages.length]);
}
