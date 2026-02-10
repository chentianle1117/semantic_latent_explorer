/**
 * Passive Observer Agent Hook
 * Always-active background agent that periodically analyzes the canvas
 * and provides insights about clusters and gaps.
 *
 * STICKY INSIGHT: When an insight exists (not null), ALL timers stop completely.
 * No polling, no analysis, zero wasted tokens. Timers restart only after dismiss.
 */

import { useEffect, useRef, useCallback } from "react";
import { useAppStore } from "../store/appStore";
import type { AgentInsight } from "../types";

const POST_GENERATION_DELAY = 2000; // 2s after generation finishes
const PERIODIC_INTERVAL = 45000; // 45s periodic check
const MIN_IMAGES_FOR_ANALYSIS = 5;
const MIN_COOLDOWN = 20000; // Minimum 20s between analyses

interface UseAgentObserverOptions {
  brief: string | null;
}

export function useAgentObserver({ brief }: UseAgentObserverOptions) {
  const isGenerating = useAppStore((s) => s.isGenerating);
  const images = useAppStore((s) => s.images);
  const setAgentStatus = useAppStore((s) => s.setAgentStatus);
  const setAgentInsight = useAppStore((s) => s.setAgentInsight);
  const agentInsight = useAppStore((s) => s.agentInsight);

  const prevIsGeneratingRef = useRef(isGenerating);
  const postGenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const periodicTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isAnalyzingRef = useRef(false);
  const lastAnalysisTimeRef = useRef(0);

  const visibleImages = images.filter((img) => img.visible);

  const effectiveBrief = brief || "Explore shoe design variations";

  // Sticky check: if insight exists, do nothing
  const hasInsight = agentInsight !== null;

  const runAnalysis = useCallback(async () => {
    // STICKY: if insight exists, STOP completely
    if (hasInsight) return;
    if (isAnalyzingRef.current) return;
    if (visibleImages.length < MIN_IMAGES_FOR_ANALYSIS) return;
    if (Date.now() - lastAnalysisTimeRef.current < MIN_COOLDOWN) return;

    isAnalyzingRef.current = true;
    lastAnalysisTimeRef.current = Date.now();
    setAgentStatus("thinking");

    try {
      const digestRes = await fetch("http://localhost:8000/api/canvas-digest");
      if (!digestRes.ok) throw new Error("Digest fetch failed");
      const digest = await digestRes.json();

      const analysisRes = await fetch(
        "http://localhost:8000/api/agent/analyze-canvas",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brief: effectiveBrief,
            canvas_summary: digest,
          }),
        }
      );
      if (!analysisRes.ok) throw new Error("Analysis fetch failed");
      const analysis = await analysisRes.json();

      const regions = analysis.regions || [];
      if (regions.length > 0) {
        const gaps = regions.filter((r: any) => r.type === "gap");
        const bestRegion = gaps.length > 0 ? gaps[0] : regions[0];

        const insight: AgentInsight = {
          id: `insight-${Date.now()}`,
          type: bestRegion.type === "gap" ? "gap" : "prompt",
          message:
            bestRegion.type === "gap"
              ? `Found unexplored area: "${bestRegion.title}"`
              : `Cluster insight: "${bestRegion.title}"`,
          data: {
            region: bestRegion,
            allRegions: regions,
          },
          isRead: false,
          timestamp: Date.now(),
        };

        setAgentInsight(insight);
      } else {
        setAgentStatus("idle");
      }
    } catch (error) {
      console.debug("[AgentObserver] Analysis failed silently:", error);
      setAgentStatus("idle");
    } finally {
      isAnalyzingRef.current = false;
    }
  }, [visibleImages.length, effectiveBrief, hasInsight, setAgentStatus, setAgentInsight]);

  // Trigger 1: Post-generation (isGenerating flips true -> false)
  useEffect(() => {
    const wasGenerating = prevIsGeneratingRef.current;
    prevIsGeneratingRef.current = isGenerating;

    // STICKY: don't start timers if insight exists
    if (hasInsight) return;

    if (wasGenerating && !isGenerating) {
      if (postGenTimerRef.current) clearTimeout(postGenTimerRef.current);
      postGenTimerRef.current = setTimeout(() => {
        runAnalysis();
      }, POST_GENERATION_DELAY);
    }

    return () => {
      if (postGenTimerRef.current) clearTimeout(postGenTimerRef.current);
    };
  }, [isGenerating, runAnalysis, hasInsight]);

  // Trigger 2: Periodic interval — completely stopped when insight exists
  useEffect(() => {
    // STICKY: if insight exists, don't run any timers at all
    if (hasInsight) {
      // Clear any existing timers
      if (periodicTimerRef.current) {
        clearInterval(periodicTimerRef.current);
        periodicTimerRef.current = null;
      }
      return;
    }

    // No insight — start periodic polling
    const initialTimer = setTimeout(() => {
      runAnalysis();
    }, 5000);

    periodicTimerRef.current = setInterval(() => {
      runAnalysis();
    }, PERIODIC_INTERVAL);

    return () => {
      clearTimeout(initialTimer);
      if (periodicTimerRef.current) clearInterval(periodicTimerRef.current);
    };
  }, [runAnalysis, hasInsight]);
}
