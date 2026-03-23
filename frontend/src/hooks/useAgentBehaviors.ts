/**
 * useAgentBehaviors — Streamlined agent system with 3 active behaviors:
 *
 *  B: Concurrent Ghosts  — fires on every user generation (no throttle)
 *  C: Exploration Ghosts — fires every 4 generations, then resets
 *  D: Axis Suggestions   — fires when imagesSinceLastAxisSuggestion >= 20, then resets
 *
 * Ghost images are real fal.ai generated images stored at 45% opacity with colored badges.
 * No popups — results appear directly on canvas.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { apiClient } from '../api/client';
import { falClient, extractBriefConstraint } from '../api/falClient';
import type { GhostNode } from '../types';

// Unique ID counter for ghost nodes (negative to avoid collisions with real image IDs)
let ghostIdCounter = -1;
function nextGhostId(): number {
  return ghostIdCounter--;
}

/**
 * Generate a 300×300 semantic scatter-plot image (JPEG base64) from current canvas state.
 * Shows where each visible shoe sits in 2D semantic space, with axis labels at the edges.
 * Sent to Gemini so it can visually see the distribution and suggest unexplored directions.
 * Returns null if no images or canvas API unavailable.
 */
function generateSemanticMapImage(): string | null {
  try {
    const appState = useAppStore.getState();
    const images = appState.images.filter(img => img.visible && img.coordinates?.length >= 2);
    const axisLabels = appState.axisLabels;
    if (images.length === 0) return null;

    const SIZE = 300;
    const MARGIN = 36;
    const INNER = SIZE - 2 * MARGIN;

    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Dark background
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Get coordinate bounds, add small padding so edge dots aren't clipped
    const xs = images.map(img => img.coordinates[0]);
    const ys = images.map(img => img.coordinates[1]);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xRange = Math.max(xMax - xMin, 1e-6);
    const yRange = Math.max(yMax - yMin, 1e-6);

    const toCanvasX = (x: number) => MARGIN + ((x - xMin) / xRange) * INNER;
    const toCanvasY = (y: number) => SIZE - MARGIN - ((y - yMin) / yRange) * INNER;

    // Axis crosshairs at semantic midpoint
    const midX = toCanvasX((xMin + xMax) / 2);
    const midY = toCanvasY((yMin + yMax) / 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(midX, MARGIN); ctx.lineTo(midX, SIZE - MARGIN);
    ctx.moveTo(MARGIN, midY); ctx.lineTo(SIZE - MARGIN, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Dots — cyan for shoes, orange for mood boards
    images.forEach(img => {
      const cx = toCanvasX(img.coordinates[0]);
      const cy = toCanvasY(img.coordinates[1]);
      ctx.fillStyle = img.realm === 'mood-board'
        ? 'rgba(255,107,43,0.9)'
        : 'rgba(0,210,255,0.85)';
      ctx.beginPath();
      ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Axis labels at edges
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    const trim = (s: string) => (s || '').slice(0, 14);

    // X-axis: left (neg) and right (pos)
    ctx.textAlign = 'left';
    ctx.fillText('← ' + trim(axisLabels.x[0]), 2, SIZE / 2 + 4);
    ctx.textAlign = 'right';
    ctx.fillText(trim(axisLabels.x[1]) + ' →', SIZE - 2, SIZE / 2 + 4);

    // Y-axis: top (pos) and bottom (neg)
    ctx.textAlign = 'center';
    ctx.fillText('↑ ' + trim(axisLabels.y[1]), SIZE / 2, 14);
    ctx.fillText('↓ ' + trim(axisLabels.y[0]), SIZE / 2, SIZE - 4);

    // Image count label
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '9px sans-serif';
    ctx.fillText(`${images.length} designs`, MARGIN, MARGIN - 6);

    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return null;
  }
}

export function useAgentBehaviors() {
  const {
    images,
    designBrief,
    inlineAxisData,
    imagesSinceLastExploration,
    imagesSinceLastAxisSuggestion,
    axisLabels,
    isAgentWorking,
    addGhostNode,
    setIsAgentWorking,
    setAgentStatus,
    addAgentInsight,
    resetExplorationCounter,
    addToExplorationCounter,
    resetAxisSuggestionCounter,
    setInlineAxisData,
    setIsAgentUsingBrief,
  } = useAppStore();

  const imagesRef = useRef(images);
  imagesRef.current = images;

  const designBriefRef = useRef(designBrief);
  designBriefRef.current = designBrief;

  const inlineAxisDataRef = useRef(inlineAxisData);
  inlineAxisDataRef.current = inlineAxisData;

  const isAgentWorkingRef = useRef(isAgentWorking);
  isAgentWorkingRef.current = isAgentWorking;

  // ─────────────────────────────────────────────────────────────
  // Shared: embed a fal.ai URL into a ghost coordinate
  // ─────────────────────────────────────────────────────────────
  async function embedGhostUrl(falUrl: string): Promise<{ base64_image: string; coordinates: [number, number] } | null> {
    try {
      return await apiClient.embedGhost(falUrl);
    } catch (err) {
      console.error('[Agent] embed-ghost failed:', err);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // BEHAVIOR B: Concurrent Ghost
  // Called by generation handlers immediately after user generates
  // ─────────────────────────────────────────────────────────────
  const triggerConcurrentGhosts = useCallback(async (
    userPrompt: string,
    parentIds: number[],
    refUrls: string[]  // fal.ai storage URLs of reference images
  ) => {
    const currentImages = imagesRef.current;
    const brief = designBriefRef.current;

    // Skip if not enough context
    if (currentImages.filter(img => img.visible).length < 1) return;

    // Respect opt-in toggle — fires on every generation (no throttle)
    const store = useAppStore.getState();
    if (!store.concurrentGhostsEnabled) return;

    console.log('[Agent B] Concurrent ghost triggered for prompt:', userPrompt.substring(0, 50));

    try {
      setIsAgentWorking(true);
      setAgentStatus('thinking');

      // Get alternative prompt from Gemini — glow the brief while it's being used
      if (brief) setIsAgentUsingBrief(true);
      let altPrompt = '';
      let reasoning = '';
      let yourDesignWas = '';
      let thisExplores = '';
      let keyShifts: string[] = [];
      try {
        const canvasMap = generateSemanticMapImage();
        const result = await apiClient.getConcurrentPrompt(userPrompt, brief, refUrls, canvasMap ?? undefined);
        altPrompt = result.prompt;
        reasoning = result.reasoning;
        yourDesignWas = result.your_design_was || '';
        thisExplores = result.this_explores || '';
        keyShifts = result.key_shifts || [];
      } finally {
        setIsAgentUsingBrief(false);
      }
      if (!altPrompt) return;

      console.log('[Agent B] Alt prompt:', altPrompt);

      // Generate ghost image via fal.ai
      let falResult;
      const agentBriefConstraint = extractBriefConstraint(useAppStore.getState().briefFields);
      if (refUrls.length > 0) {
        falResult = await falClient.generateImageEdit({
          prompt: altPrompt,
          image_urls: refUrls.slice(0, 4),
          num_images: 1,
          aspect_ratio: '1:1',
          output_format: 'jpeg',
          briefConstraint: agentBriefConstraint,
        });
      } else {
        falResult = await falClient.generateTextToImage({
          prompt: altPrompt,
          num_images: 1,
          aspect_ratio: '1:1',
          output_format: 'jpeg',
          briefConstraint: agentBriefConstraint,
        });
      }

      if (!falResult.images.length) {
        console.warn('[Agent B] fal.ai returned no images');
        return;
      }

      // Embed + project coordinates
      const embedded = await embedGhostUrl(falResult.images[0].url);
      if (!embedded) return;

      const ghost: GhostNode = {
        id: nextGhostId(),
        coordinates: embedded.coordinates,
        base64_image: embedded.base64_image,
        prompt: altPrompt,
        reasoning,
        parents: parentIds,
        source: 'concurrent',
        timestamp: Date.now(),
        your_design_was: yourDesignWas,
        this_explores: thisExplores,
        key_shifts: keyShifts,
      };

      const insightMessage = yourDesignWas && thisExplores
        ? `Your design was ${yourDesignWas}. Exploring: ${thisExplores}`
        : `Generated an alternative: "${altPrompt.substring(0, 60)}..."`;

      addGhostNode(ghost);
      addAgentInsight({
        id: `b-${Date.now()}`,
        type: 'variation',
        message: insightMessage,
        data: { ghost },
        isRead: false,
        timestamp: Date.now(),
      });
      setAgentStatus('insight-ready');
      console.log('[Agent B] Ghost added:', ghost.id, 'at', ghost.coordinates);
    } catch (err) {
      console.error('[Agent B] Concurrent ghost failed:', err);
    } finally {
      setIsAgentWorking(false);
    }
  }, [addGhostNode, setIsAgentWorking, setAgentStatus, addAgentInsight]);

  // ─────────────────────────────────────────────────────────────
  // BEHAVIOR C: Exploration Ghosts
  // Called manually or auto-triggered by accumulator
  // ─────────────────────────────────────────────────────────────
  const triggerExplorationGhosts = useCallback(async () => {
    const currentImages = imagesRef.current;
    const brief = designBriefRef.current;

    if (currentImages.filter(img => img.visible).length < 3) {
      console.log('[Agent C] Not enough images for exploration (need ≥3)');
      return;
    }

    console.log('[Agent C] Exploration triggered');

    try {
      setIsAgentWorking(true);
      setAgentStatus('thinking');

      // Get gap-fill suggestions from backend (Gemini uses brief for context)
      if (brief) setIsAgentUsingBrief(true);
      let suggestions: any[] = [];
      try {
        const canvasMap = generateSemanticMapImage();
        const result = await apiClient.suggestGhosts(brief ?? '', 2, canvasMap ?? undefined);
        suggestions = result.ghosts;
      } finally {
        setIsAgentUsingBrief(false);
      }

      if (!suggestions.length) {
        console.log('[Agent C] No gap suggestions returned');
        return;
      }

      const addedGhosts: GhostNode[] = [];

      for (const suggestion of suggestions) {
        const prompt = (suggestion as any).suggested_prompt || (suggestion as any).prompt || '';
        if (!prompt) continue;

        try {
          // Generate ghost image via fal.ai
          const falResult = await falClient.generateTextToImage({
            prompt,
            num_images: 1,
            aspect_ratio: '1:1',
            output_format: 'jpeg',
          });

          if (!falResult.images.length) continue;

          // Embed + project
          const embedded = await embedGhostUrl(falResult.images[0].url);
          if (!embedded) continue;

          const ghost: GhostNode = {
            id: nextGhostId(),
            coordinates: embedded.coordinates,
            base64_image: embedded.base64_image,
            prompt,
            reasoning: (suggestion as any).reasoning ?? 'Fills an unexplored region',
            parents: [],
            source: 'exploration',
            timestamp: Date.now(),
            target_region: (suggestion as any).target_region,
            contrasts_with: (suggestion as any).contrasts_with,
          };

          addGhostNode(ghost);
          addedGhosts.push(ghost);
          console.log('[Agent C] Exploration ghost added:', ghost.id, 'at', ghost.coordinates);
        } catch (err) {
          console.error('[Agent C] Ghost gen failed for prompt:', prompt.substring(0, 40), err);
        }
      }

      if (addedGhosts.length > 0) {
        const regionLabels = addedGhosts
          .map((g) => g.target_region)
          .filter(Boolean)
          .join(', ');
        const explorationMessage = regionLabels
          ? `Exploring ${regionLabels} — check the canvas`
          : `Explored ${addedGhosts.length} canvas gap${addedGhosts.length > 1 ? 's' : ''} — check the canvas for suggestions`;
        addAgentInsight({
          id: `c-${Date.now()}`,
          type: 'gap',
          message: explorationMessage,
          data: { ghosts: addedGhosts },
          isRead: false,
          timestamp: Date.now(),
        });
        setAgentStatus('insight-ready');
      }
    } catch (err) {
      console.error('[Agent C] Exploration failed:', err);
    } finally {
      setIsAgentWorking(false);
    }
  }, [addGhostNode, setIsAgentWorking, setAgentStatus, addAgentInsight]);

  // ─────────────────────────────────────────────────────────────
  // BEHAVIOR D: Axis Suggestions (session clock, 2-min interval)
  // ─────────────────────────────────────────────────────────────
  const triggerAxisSuggestions = useCallback(async () => {
    const currentImages = imagesRef.current;
    const brief = designBriefRef.current;

    if (currentImages.filter(img => img.visible).length < 3) {
      console.log('[Agent D] Not enough images for axis suggestions (need ≥3)');
      return;
    }

    if (inlineAxisDataRef.current !== null) {
      console.log('[Agent D] Skipping — previous axis suggestion still pending');
      return;
    }

    console.log('[Agent D] Axis suggestion triggered');

    try {
      const currentX = useAppStore.getState().axisLabels.x.join(' - ');
      const currentY = useAppStore.getState().axisLabels.y.join(' - ');

      if (brief) setIsAgentUsingBrief(true);
      let axisResult: { suggestions: any[] } | null = null;
      try {
        axisResult = await apiClient.suggestAxes(brief ?? '', currentX, currentY);
      } finally {
        setIsAgentUsingBrief(false);
      }
      if (!axisResult) return;
      const { suggestions } = axisResult;

      if (suggestions && suggestions.length > 0) {
        setInlineAxisData(suggestions.map(s => ({
          x_axis: s.x_axis,
          y_axis: s.y_axis,
          reasoning: s.reasoning,
        })));
        console.log('[Agent D] Axis suggestions set:', suggestions.length);
      }
    } catch (err) {
      console.error('[Agent D] Axis suggestions failed:', err);
    }
  }, [setInlineAxisData]);

  // ─────────────────────────────────────────────────────────────
  // AUTO-TRIGGER C: watch imagesSinceLastExploration
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (imagesSinceLastExploration >= 4) {
      console.log('[Agent C] Accumulator hit', imagesSinceLastExploration, '— auto-triggering exploration');
      resetExplorationCounter();
      triggerExplorationGhosts();
    }
  }, [imagesSinceLastExploration, resetExplorationCounter, triggerExplorationGhosts]);

  // ─────────────────────────────────────────────────────────────
  // AUTO-TRIGGER D: every 20 new images generated (accumulation)
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (imagesSinceLastAxisSuggestion >= 20) {
      console.log('[Agent D] Accumulator hit', imagesSinceLastAxisSuggestion, '— auto-triggering axis suggestions');
      resetAxisSuggestionCounter();
      triggerAxisSuggestions();
    }
  }, [imagesSinceLastAxisSuggestion, resetAxisSuggestionCounter, triggerAxisSuggestions]);

  return {
    triggerConcurrentGhosts,
    triggerExplorationGhosts,
    triggerAxisSuggestions,
  };
}
