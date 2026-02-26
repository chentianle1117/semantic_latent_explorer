/**
 * useAgentBehaviors — Streamlined agent system with 3 active behaviors:
 *
 *  B: Concurrent Ghosts  — fires in parallel with user generation
 *  C: Exploration Ghosts — fires when imagesSinceLastExploration >= 5, then resets
 *  D: Axis Suggestions   — fires when imagesSinceLastAxisSuggestion >= 20, then resets
 *
 * Ghost images are real fal.ai generated images stored at 45% opacity with colored badges.
 * No popups — results appear directly on canvas.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { apiClient } from '../api/client';
import { falClient } from '../api/falClient';
import type { GhostNode } from '../types';

// Unique ID counter for ghost nodes (negative to avoid collisions with real image IDs)
let ghostIdCounter = -1;
function nextGhostId(): number {
  return ghostIdCounter--;
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
        const result = await apiClient.getConcurrentPrompt(userPrompt, brief, refUrls);
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
      if (refUrls.length > 0) {
        falResult = await falClient.generateImageEdit({
          prompt: altPrompt,
          image_urls: refUrls.slice(0, 4),
          num_images: 1,
          aspect_ratio: '1:1',
          output_format: 'jpeg',
        });
      } else {
        falResult = await falClient.generateTextToImage({
          prompt: altPrompt,
          num_images: 1,
          aspect_ratio: '1:1',
          output_format: 'jpeg',
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
        const result = await apiClient.suggestGhosts(brief ?? '', 2);
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
    if (imagesSinceLastExploration >= 15) {
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
