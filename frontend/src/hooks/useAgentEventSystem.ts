/**
 * Event-Based Agent Trigger System
 *
 * Fires when:
 *   A) isInitialized transitions to true AND canvas has >= 3 images (1.5s delay)
 *   B) 2+ new images added since last action → ghost suggestions
 *   C) 4+ new images added since last action → axis suggestions
 *
 * Key fix: watches isInitialized instead of a fixed timer,
 * and uses correct API field names (current_x_axis / current_y_axis).
 */

import { useEffect, useRef, useCallback } from "react";
import { useAppStore } from "../store/appStore";
import type { AgentInsight } from "../types";

const GHOST_SUGGEST_AFTER = 2;
const AXIS_SUGGEST_AFTER = 4;
const MIN_IMAGES = 3;
const COOLDOWN_MS = 12000;

export function useAgentEventSystem() {
  const images = useAppStore((s) => s.images);
  const agentInsight = useAppStore((s) => s.agentInsight);
  const agentMode = useAppStore((s) => s.agentMode);
  const axisLabels = useAppStore((s) => s.axisLabels);
  const designBrief = useAppStore((s) => s.designBrief);
  const isInitialized = useAppStore((s) => s.isInitialized);
  const setAgentStatus = useAppStore((s) => s.setAgentStatus);
  const setAgentInsight = useAppStore((s) => s.setAgentInsight);
  const addGhostNode = useAppStore((s) => s.addGhostNode);
  const clearGhostNodes = useAppStore((s) => s.clearGhostNodes);

  const prevImagesLenRef = useRef(0);
  const accumulatedEventsRef = useRef(0);
  const lastActionTimeRef = useRef(0);
  const isRunningRef = useRef(false);
  const initialFiredRef = useRef(false);

  const brief = designBrief || "Explore shoe design variations";
  const visibleImages = images.filter((i) => i.visible);

  const triggerAxisSuggestions = useCallback(async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    setAgentStatus("thinking");
    console.log("[Companion] Triggering axis suggestions...");

    try {
      // Backend expects current_x_axis / current_y_axis as "neg - pos" strings
      const store = useAppStore.getState();
      const xStr = `${store.axisLabels.x[0]} - ${store.axisLabels.x[1]}`;
      const yStr = `${store.axisLabels.y[0]} - ${store.axisLabels.y[1]}`;

      const res = await fetch("http://localhost:8000/api/agent/suggest-axes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief,
          current_x_axis: xStr,
          current_y_axis: yStr,
        }),
      });
      if (!res.ok) throw new Error(`suggest-axes HTTP ${res.status}`);
      const data = await res.json();
      const suggestions = data.suggestions || [];
      console.log("[Companion] Axis suggestions received:", suggestions.length, suggestions);

      if (suggestions.length > 0) {
        // Store axis data independently so InlineAxisSuggestions survives DynamicIsland dismiss
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
      isRunningRef.current = false;
    }
  }, [brief, setAgentStatus, setAgentInsight]);

  const triggerGhostSuggestions = useCallback(async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    setAgentStatus("thinking");
    console.log("[Companion] Triggering ghost suggestions...");

    try {
      const res = await fetch("http://localhost:8000/api/agent/suggest-ghosts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, num_suggestions: 3 }),
      });
      if (!res.ok) throw new Error(`suggest-ghosts HTTP ${res.status}`);
      const data = await res.json();
      const ghosts = data.ghosts || [];
      console.log("[Companion] Ghost suggestions received:", ghosts.length);

      if (ghosts.length > 0) {
        clearGhostNodes();
        ghosts.forEach((g: any) => addGhostNode(g));

        const insight: AgentInsight = {
          id: `insight-ghost-${Date.now()}`,
          type: "gap",
          message: `Found ${ghosts.length} unexplored design space${ghosts.length > 1 ? "s" : ""} — ghost nodes placed on canvas`,
          data: { allRegions: [] },
          isRead: false,
          timestamp: Date.now(),
        };
        setAgentInsight(insight);
      } else {
        // No gaps found — fall back to axis suggestions
        console.log("[Companion] No gaps found, trying axis suggestions");
        isRunningRef.current = false;
        triggerAxisSuggestions();
        return;
      }
    } catch (err) {
      console.warn("[Companion] Ghost suggestion failed:", err);
      setAgentStatus("idle");
    } finally {
      isRunningRef.current = false;
    }
  }, [brief, setAgentStatus, setAgentInsight, addGhostNode, clearGhostNodes, triggerAxisSuggestions]);

  // Trigger A: fire once after isInitialized becomes true + canvas populated
  useEffect(() => {
    if (!isInitialized) return;
    if (initialFiredRef.current) return;
    if (agentMode !== "auto") return;
    if (agentInsight !== null) return;

    const currentLen = visibleImages.length;

    // Sync baseline now that we know images are loaded
    prevImagesLenRef.current = currentLen;

    if (currentLen < MIN_IMAGES) return;

    const timer = setTimeout(() => {
      const store = useAppStore.getState();
      if (store.agentInsight !== null) return;
      if (store.agentMode !== "auto") return;

      initialFiredRef.current = true;
      lastActionTimeRef.current = Date.now();
      console.log("[Companion] Initial trigger: canvas has", currentLen, "images");
      triggerGhostSuggestions();
    }, 1500);

    return () => clearTimeout(timer);
  // Watch isInitialized and image count; fire once when both conditions met
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized, visibleImages.length]);

  // Trigger B/C: accumulate image-addition events after init
  useEffect(() => {
    if (agentMode !== "auto") return;
    if (agentInsight !== null) return;

    const currentLen = visibleImages.length;
    const delta = currentLen - prevImagesLenRef.current;

    if (delta > 0) {
      prevImagesLenRef.current = currentLen;
      accumulatedEventsRef.current += delta;

      const accumulated = accumulatedEventsRef.current;
      const cooldownPassed = Date.now() - lastActionTimeRef.current > COOLDOWN_MS;

      console.log(`[Companion] +${delta} images, accumulated=${accumulated}, cooldown=${cooldownPassed}`);

      if (currentLen >= MIN_IMAGES && cooldownPassed) {
        if (accumulated >= AXIS_SUGGEST_AFTER) {
          accumulatedEventsRef.current = 0;
          lastActionTimeRef.current = Date.now();
          triggerAxisSuggestions();
        } else if (accumulated >= GHOST_SUGGEST_AFTER) {
          accumulatedEventsRef.current = 0;
          lastActionTimeRef.current = Date.now();
          triggerGhostSuggestions();
        }
      }
    }
  }, [visibleImages.length, agentInsight, agentMode, triggerAxisSuggestions, triggerGhostSuggestions]);
}
