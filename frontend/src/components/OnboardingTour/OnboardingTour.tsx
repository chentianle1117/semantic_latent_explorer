/**
 * Onboarding Tutorial Overlay — v3 (Dial-driven Action Walkthrough)
 *
 * Key design choices:
 *  • NO dark backdrop — canvas stays fully visible at all times (so users see
 *    isolation results, generation output, axis reprojection, etc.)
 *  • Target element is highlighted with a pulsing cyan/amber glow border only
 *  • For dial steps: two-phase targeting
 *      Phase A (dial closed) → spotlight `[data-tour="canvas"]`, instruction = "Press Space"
 *      Phase B (dial open)   → spotlight `[data-tour="dial-{id}"]`, instruction = dialInstruction
 *  • Centralized auto-advance: one effect watches completedSteps for changes and
 *    advances the spotlight whenever the currently shown step is newly completed
 *  • Checklist only shown on explicit `?` click — never auto-opened
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useAppStore } from '../../store/appStore';
import { TUTORIAL_STEPS, STEP_CATEGORIES, type TutorialStep } from './steps';
import './OnboardingTour.css';

// ─── Prerequisite evaluation ───────────────────────────────────────────────────

function checkPrerequisite(
  key: string,
  ctx: { imageCount: number; selCount: number; isInitialized: boolean; isHistoryExpanded: boolean },
): boolean {
  const { imageCount, selCount, isInitialized, isHistoryExpanded } = ctx;
  switch (key) {
    case 'ui-tabs':       return isHistoryExpanded;
    case 'nav-canvas':    return imageCount > 0;
    case 'save-export':   return imageCount > 0;
    case 'gen-text':      return isInitialized;
    case 'gen-ref':       return selCount >= 1;
    case 'manip-axes':    return imageCount > 0;
    case 'manip-isolate': return selCount > 0;
    case 'manip-layers':  return selCount > 0;
    case 'manip-tree':    return imageCount > 1;
    case 'ai-explore':    return imageCount > 0;
    case 'ai-island':     return imageCount > 0;
    default:              return true;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Render **bold** markdown inline */
function renderMd(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

interface TargetRect { left: number; top: number; width: number; height: number; right: number; bottom: number; }

function getTargetRect(selector: string): TargetRect | null {
  try {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  } catch { return null; }
}

// ─── ChecklistPanel ────────────────────────────────────────────────────────────

const ChecklistPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const completedSteps      = useAppStore((s) => s.completedSteps);
  const onboardingSpotlight = useAppStore((s) => s.onboardingSpotlight);
  const setSpotlight        = useAppStore((s) => s.setOnboardingSpotlight);
  const dismissOnboarding   = useAppStore((s) => s.dismissOnboarding);
  const resetOnboarding     = useAppStore((s) => s.resetOnboarding);

  const images             = useAppStore((s) => s.images);
  const selectedImageIds   = useAppStore((s) => s.selectedImageIds);
  const isInitialized      = useAppStore((s) => s.isInitialized);
  const isHistoryExpanded  = useAppStore((s) => s.isHistoryExpanded);
  const prereqCtx = useMemo(() => ({
    imageCount: images.filter((i) => i.visible !== false).length,
    selCount: selectedImageIds.length,
    isInitialized,
    isHistoryExpanded,
  }), [images, selectedImageIds, isInitialized, isHistoryExpanded]);

  const total  = TUTORIAL_STEPS.length;
  const done   = completedSteps.length;
  const pct    = Math.round((done / total) * 100);
  const allDone = done >= total;

  return (
    <div className="ob-checklist" role="dialog" aria-label="Tutorial Guide">
      <div className="ob-checklist-header">
        <span className="ob-checklist-title">{allDone ? '🎉 Tutorial Complete!' : '📖 Tutorial Guide'}</span>
        <button className="ob-checklist-close" onClick={onClose} title="Close">×</button>
      </div>

      <div className="ob-progress-bar">
        <div className="ob-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="ob-progress-label">{done} of {total} completed</div>

      {allDone && <div className="ob-all-done">All done! Click any step to revisit it.</div>}

      <div className="ob-steps-list">
        {STEP_CATEGORIES.map((cat) => {
          const catSteps = TUTORIAL_STEPS.filter((s) => s.category === cat.key);
          return (
            <div key={cat.key} className="ob-category">
              <div className="ob-category-header">
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </div>
              {catSteps.map((step) => {
                const isComplete = completedSteps.includes(step.id);
                const isActive   = onboardingSpotlight === step.id;
                const prereqMet  = step.prerequisiteKey
                  ? checkPrerequisite(step.prerequisiteKey, prereqCtx)
                  : true;
                const showAmber  = !isComplete && !!step.prerequisiteKey && !prereqMet;
                return (
                  <button
                    key={step.id}
                    className={`ob-step-item${isComplete ? ' ob-step-done' : ''}${isActive ? ' ob-step-active' : ''}`}
                    onClick={() => { setSpotlight(step.id); onClose(); }}
                    title={step.instruction.replace(/\*\*/g, '')}
                  >
                    <span className={`ob-step-check${isComplete ? ' ob-step-check-done' : ''}`}>
                      {isComplete ? '✓' : ''}
                    </span>
                    <span className="ob-step-icon">{step.icon}</span>
                    <span className="ob-step-title">{step.title}</span>
                    {showAmber && <span className="ob-prereq-dot" title="Setup needed first" />}
                    {isActive && !showAmber && <span className="ob-step-active-dot" />}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="ob-checklist-footer">
        <button className="ob-footer-btn ob-footer-reset" onClick={() => resetOnboarding()}>Reset Progress</button>
        <button className="ob-footer-btn ob-footer-skip" onClick={() => dismissOnboarding()}>Dismiss Tutorial</button>
      </div>
    </div>
  );
};

// ─── SpotlightOverlay ─────────────────────────────────────────────────────────

const CARD_W   = 300;
const CARD_PAD = 16;
const HOLE_PAD = 10;
const CARD_H_EST = 320; // generous height estimate for clamping

const SpotlightOverlay: React.FC<{ step: TutorialStep; stepNumber: number; total: number }> = ({
  step, stepNumber, total,
}) => {
  const setSpotlight      = useAppStore((s) => s.setOnboardingSpotlight);
  const completeStep      = useAppStore((s) => s.completeOnboardingStep);
  const completedSteps    = useAppStore((s) => s.completedSteps);
  const dismissOnboarding = useAppStore((s) => s.dismissOnboarding);

  const images             = useAppStore((s) => s.images);
  const selectedImageIds   = useAppStore((s) => s.selectedImageIds);
  const isInitialized      = useAppStore((s) => s.isInitialized);
  const isGenerating       = useAppStore((s) => s.isGenerating);
  const isHistoryExpanded  = useAppStore((s) => s.isHistoryExpanded);

  const prereqCtx = useMemo(() => ({
    imageCount: images.filter((i) => i.visible !== false).length,
    selCount: selectedImageIds.length,
    isInitialized,
    isHistoryExpanded,
  }), [images, selectedImageIds, isInitialized, isHistoryExpanded]);

  const prereqOk  = step.prerequisiteKey ? checkPrerequisite(step.prerequisiteKey, prereqCtx) : true;
  const isWaiting = !!(step.waitingLabel && isGenerating);

  // ── Two-phase dial targeting ──────────────────────────────────────────────
  const [dialOpen, setDialOpen] = useState(false);

  useEffect(() => {
    if (!step.dialButtonId) return;
    const check = () => setDialOpen(!!document.querySelector(`[data-tour="dial-${step.dialButtonId}"]`));
    check();
    const t = setInterval(check, 120);
    return () => clearInterval(t);
  }, [step.dialButtonId]);

  const effectiveSelector = step.dialButtonId && dialOpen
    ? `[data-tour="dial-${step.dialButtonId}"]`
    : step.targetSelector;

  // ── Target rect tracking ──────────────────────────────────────────────────
  const [rect, setRect] = useState<TargetRect | null>(null);
  const rafRef = useRef<number | null>(null);

  const updateRect = useCallback(() => {
    setRect(getTargetRect(effectiveSelector));
  }, [effectiveSelector]);

  useEffect(() => {
    updateRect();
    let count = 0;
    const poll = () => { count++; updateRect(); if (count < 120) rafRef.current = requestAnimationFrame(poll); };
    rafRef.current = requestAnimationFrame(poll);
    const obs = new ResizeObserver(updateRect);
    const el = document.querySelector(effectiveSelector);
    if (el) obs.observe(el);
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      obs.disconnect();
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [updateRect, effectiveSelector]);

  // ── Step index helpers ────────────────────────────────────────────────────
  const currentIdx = TUTORIAL_STEPS.findIndex((s) => s.id === step.id);
  const hasPrev    = currentIdx > 0;

  // ── "← Back" — go to previous step (no completion change) ────────────────
  const handlePrevStep = useCallback(() => {
    if (currentIdx > 0) setSpotlight(TUTORIAL_STEPS[currentIdx - 1].id);
  }, [currentIdx, setSpotlight]);

  // ── "Got it" — mark complete + advance ───────────────────────────────────
  const handleGotIt = useCallback(() => {
    completeStep(step.id);
    const upcoming = [...TUTORIAL_STEPS.slice(currentIdx + 1), ...TUTORIAL_STEPS.slice(0, currentIdx)];
    const nextStep = upcoming.find((s) => !completedSteps.includes(s.id) && s.id !== step.id);
    setSpotlight(nextStep?.id ?? null);
  }, [completeStep, completedSteps, currentIdx, setSpotlight, step.id]);

  const handleClose = useCallback(() => setSpotlight(null), [setSpotlight]);

  // ── Card position (no dark overlay — just floating card) ─────────────────
  const cardStyle = useMemo((): React.CSSProperties => {
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!rect) return { position: 'fixed', top: 80, right: 16, width: CARD_W };
    const s: React.CSSProperties = { position: 'fixed', width: CARD_W };
    const clampL = (x: number) => Math.max(8, Math.min(x, vw - CARD_W - 8));
    const clampT = (y: number) => Math.max(8, Math.min(y, vh - CARD_H_EST - 8));
    switch (step.cardPosition) {
      case 'right':
        s.left = clampL(rect.right + HOLE_PAD + CARD_PAD);
        s.top  = clampT(rect.top);
        break;
      case 'left':
        s.left = clampL(rect.left - HOLE_PAD - CARD_PAD - CARD_W);
        s.top  = clampT(rect.top);
        break;
      case 'below':
        s.top  = clampT(rect.bottom + HOLE_PAD + CARD_PAD);
        s.left = clampL(rect.left);
        break;
      case 'above': {
        const spaceAbove = rect.top - HOLE_PAD - CARD_PAD;
        if (spaceAbove >= CARD_H_EST + 8) {
          s.top = Math.max(8, spaceAbove - CARD_H_EST);
        } else {
          s.top = clampT(rect.bottom + HOLE_PAD + CARD_PAD);
        }
        s.left = clampL(rect.left);
        break;
      }
    }
    return s;
  }, [rect, step.cardPosition]);

  // ── Highlight border (no dark overlay) ──────────────────────────────────
  // A glowing border around the target element; canvas stays fully visible.
  const highlightStyle: React.CSSProperties = rect ? {
    position: 'fixed',
    left:   rect.left   - HOLE_PAD,
    top:    rect.top    - HOLE_PAD,
    width:  rect.width  + HOLE_PAD * 2,
    height: rect.height + HOLE_PAD * 2,
    borderRadius: dialOpen && step.dialButtonId ? 10 : 12,
    border: `2px solid ${prereqOk ? 'rgba(0,210,255,0.75)' : 'rgba(255,160,50,0.75)'}`,
    boxShadow: prereqOk
      ? '0 0 0 1px rgba(0,210,255,0.2), 0 0 18px rgba(0,210,255,0.35)'
      : '0 0 0 1px rgba(255,160,50,0.2), 0 0 18px rgba(255,160,50,0.35)',
    pointerEvents: 'none',
    zIndex: 10510,
    transition: 'left .2s ease, top .2s ease, width .2s ease, height .2s ease',
    animation: 'ob-highlight-pulse 2s ease-in-out infinite',
  } : {};

  const isComplete     = completedSteps.includes(step.id);
  const hasAutoComplete = !!step.completionKey && !step.isInformational;

  // Phase-aware instruction text
  const getInstruction = (): string => {
    if (step.dialButtonId && !dialOpen) {
      // Phase A: dial closed — tell user to open it
      return step.instruction;
    }
    if (step.dialButtonId && dialOpen && step.dialInstruction) {
      // Phase B: dial open — tell user to click the button
      return step.dialInstruction;
    }
    return step.instruction;
  };

  // ── Card variants ──────────────────────────────────────────────────────────
  const renderCardBody = () => {
    // State 1 — prerequisite not met
    if (!prereqOk) {
      return (
        <>
          <div className="ob-card-meta">
            <span className="ob-card-icon">⚠️</span>
            <span className="ob-prereq-label">Setup Needed</span>
            <span className="ob-card-counter">{stepNumber} / {total}</span>
          </div>
          <h3 className="ob-card-title">{step.title}</h3>
          <p className="ob-card-desc ob-prereq-hint">{step.setupHint}</p>
          <div className="ob-card-actions">
            {hasPrev && (
              <button className="ob-card-prev" onClick={handlePrevStep}>← Back</button>
            )}
            <button className="ob-card-close" onClick={handleClose}>Close</button>
          </div>
          <button className="ob-card-skip" onClick={() => dismissOnboarding()}>Dismiss tutorial</button>
        </>
      );
    }

    // State 2 — waiting (async op in progress)
    if (isWaiting) {
      return (
        <>
          <div className="ob-card-meta">
            <span className="ob-card-icon">⏳</span>
            <span className="ob-card-counter ob-waiting-label">Working…</span>
          </div>
          <h3 className="ob-card-title">{step.title}</h3>
          <p className="ob-card-desc">{step.waitingLabel}</p>
          <div className="ob-waiting-bar"><div className="ob-waiting-fill" /></div>
          <p className="ob-auto-note">The tutorial will advance automatically when done.</p>
        </>
      );
    }

    // State 3 — dial-step Phase A: show "open the dial" prompt prominently
    const isDialPhaseA = step.dialButtonId && !dialOpen && !isComplete;

    return (
      <>
        <div className="ob-card-meta">
          <span className="ob-card-icon">{step.icon}</span>
          <span className="ob-card-counter">{stepNumber} / {total}</span>
          {isComplete && <span className="ob-card-done-badge">✓ Done</span>}
        </div>
        <h3 className="ob-card-title">{step.title}</h3>

        {/* Phase A hint: "Press Space" */}
        {isDialPhaseA && (
          <div className="ob-dial-hint">
            <span className="ob-dial-hint-key">Space</span>
            <span className="ob-dial-hint-label">open the Radial Dial first</span>
          </div>
        )}

        <p className="ob-card-desc">{renderMd(getInstruction())}</p>

        {!isComplete && step.description && (
          <p className="ob-card-context">{renderMd(step.description)}</p>
        )}
        <div className="ob-card-actions">
          {hasPrev && (
            <button className="ob-card-prev" onClick={handlePrevStep}>← Back</button>
          )}
          <button className="ob-card-got-it" onClick={handleGotIt}>
            {isComplete ? 'Next ›' : 'Got it ✓'}
          </button>
          <button className="ob-card-close" onClick={handleClose}>Close</button>
        </div>
        {hasAutoComplete && !isComplete && !isDialPhaseA && (
          <p className="ob-auto-note">Will auto-advance when action is detected.</p>
        )}
        <button className="ob-card-skip" onClick={() => dismissOnboarding()}>Dismiss tutorial</button>
      </>
    );
  };

  const cardClass = [
    'ob-spotlight-card',
    !prereqOk ? 'ob-card-prereq' : '',
    isWaiting  ? 'ob-card-waiting' : '',
  ].filter(Boolean).join(' ');

  // Show a pulsing click-circle for small/button targets to guide the user exactly where to click
  const showClickCircle = prereqOk && !isWaiting && rect &&
    ((dialOpen && !!step.dialButtonId) || (rect.width < 200 && rect.height < 80));
  const clickCircleStyle: React.CSSProperties = (showClickCircle && rect) ? {
    position: 'fixed',
    left: rect.left + rect.width / 2 - 22,
    top:  rect.top  + rect.height / 2 - 22,
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: `2px solid ${prereqOk ? 'rgba(0,210,255,0.9)' : 'rgba(255,160,50,0.9)'}`,
    pointerEvents: 'none',
    zIndex: 10512,
    animation: 'ob-click-circle-pulse 1.2s ease-in-out infinite',
  } : { display: 'none' };

  return (
    <>
      {rect && <div style={highlightStyle} />}
      {showClickCircle && <div style={clickCircleStyle} />}
      <div className={cardClass} style={{ ...cardStyle, zIndex: 10520 }}>
        {renderCardBody()}
      </div>
    </>
  );
};

// ─── Main OnboardingTour ──────────────────────────────────────────────────────

export const OnboardingTour: React.FC = () => {
  const onboardingActive    = useAppStore((s) => s.onboardingActive);
  const onboardingSpotlight = useAppStore((s) => s.onboardingSpotlight);
  const onboardingDismissed = useAppStore((s) => s.onboardingDismissed);
  const completedSteps      = useAppStore((s) => s.completedSteps);
  const setOnboardingActive = useAppStore((s) => s.setOnboardingActive);
  const setSpotlight        = useAppStore((s) => s.setOnboardingSpotlight);
  const completeStep        = useAppStore((s) => s.completeOnboardingStep);

  // State watched for auto-complete
  const images           = useAppStore((s) => s.images);
  const selectedImageIds = useAppStore((s) => s.selectedImageIds);
  const isGenerating     = useAppStore((s) => s.isGenerating);
  const isHistoryExpanded  = useAppStore((s) => s.isHistoryExpanded);
  const axisLabels       = useAppStore((s) => s.axisLabels);
  const isolatedImageIds = useAppStore((s) => s.isolatedImageIds);
  const imageLayerMap    = useAppStore((s) => s.imageLayerMap);
  const agentInsights    = useAppStore((s) => s.agentInsights);
  const inlineAxisData   = useAppStore((s) => s.inlineAxisData);
  const designBrief      = useAppStore((s) => s.designBrief);

  // Change-detection refs
  const prevAxes         = useRef(JSON.stringify(axisLabels));
  const prevIsolated     = useRef(isolatedImageIds);
  const prevLayerMap     = useRef(JSON.stringify(imageLayerMap));
  const prevInsightCount = useRef(agentInsights.length);
  const prevInlineAxis   = useRef(inlineAxisData);
  const wasGenerating    = useRef(false);
  const selAtGenStart    = useRef(0);
  const selCountRef      = useRef(selectedImageIds.length);
  const prevImageCount   = useRef(images.length);
  const genCompletedRef  = useRef(false);

  // For centralized auto-advance: track previously completed steps
  const prevCompletedRef = useRef(new Set(completedSteps));

  // Keep selCountRef in sync
  useEffect(() => { selCountRef.current = selectedImageIds.length; }, [selectedImageIds.length]);

  // ── Centralized auto-advance ────────────────────────────────────────────────
  // Whenever a step is NEWLY added to completedSteps AND it's the current spotlight → advance
  useEffect(() => {
    if (onboardingDismissed || !onboardingSpotlight) {
      prevCompletedRef.current = new Set(completedSteps);
      return;
    }
    const prev = prevCompletedRef.current;
    const newlyCompleted = completedSteps.filter((id) => !prev.has(id));
    prevCompletedRef.current = new Set(completedSteps);

    if (newlyCompleted.includes(onboardingSpotlight)) {
      const currentIdx = TUTORIAL_STEPS.findIndex((s) => s.id === onboardingSpotlight);
      const upcoming   = [...TUTORIAL_STEPS.slice(currentIdx + 1), ...TUTORIAL_STEPS.slice(0, currentIdx)];
      const nextStep   = upcoming.find((s) => !completedSteps.includes(s.id) && s.id !== onboardingSpotlight);
      const timer = setTimeout(() => setSpotlight(nextStep?.id ?? null), 700);
      return () => clearTimeout(timer);
    }
  }, [completedSteps, onboardingSpotlight, onboardingDismissed, setSpotlight]);

  // ── Auto-complete: selection → nav-canvas ──────────────────────────────────
  useEffect(() => {
    if (!onboardingDismissed && selectedImageIds.length > 0) {
      completeStep('nav-canvas');
    }
  }, [selectedImageIds.length, onboardingDismissed, completeStep]);

  // ── Auto-complete: design brief → load-brief ──────────────────────────────
  useEffect(() => {
    if (!onboardingDismissed && designBrief && designBrief.trim().length > 0) {
      completeStep('load-brief');
    }
  }, [designBrief, onboardingDismissed, completeStep]);

  // ── Auto-complete: history expanded → ui-panels ───────────────────────────
  useEffect(() => {
    if (!onboardingDismissed && isHistoryExpanded) {
      completeStep('ui-panels');
    }
  }, [isHistoryExpanded, onboardingDismissed, completeStep]);

  // ── Auto-complete: lineage tab active → ui-tabs ───────────────────────────
  useEffect(() => {
    if (onboardingDismissed) return;
    const check = () => {
      const el = document.querySelector('[data-tour="tab-lineage"]');
      if (el && el.classList.contains('active')) completeStep('ui-tabs');
    };
    const obs = new MutationObserver(check);
    const container = document.querySelector('[data-tour="drawer-tabs"]');
    if (container) obs.observe(container, { attributes: true, subtree: true, attributeFilter: ['class'] });
    const t = setInterval(check, 300);
    return () => { obs.disconnect(); clearInterval(t); };
  }, [onboardingDismissed, completeStep]);

  // ── Auto-complete: generation → gen-text / gen-ref ────────────────────────
  useEffect(() => {
    if (onboardingDismissed) return;
    if (!wasGenerating.current && isGenerating) {
      selAtGenStart.current  = selCountRef.current;
      genCompletedRef.current = false;
    } else if (wasGenerating.current && !isGenerating && !genCompletedRef.current) {
      genCompletedRef.current = true;
      const nowCount = useAppStore.getState().images.length;
      if (nowCount > prevImageCount.current) {
        const stepId = selAtGenStart.current >= 1 ? 'gen-ref' : 'gen-text';
        completeStep(stepId);
        // Note: centralized advance effect handles spotlight advancement
      }
      prevImageCount.current = nowCount;
    }
    wasGenerating.current = isGenerating;
  }, [isGenerating, onboardingDismissed, completeStep]);

  // Track image count outside generation
  useEffect(() => {
    if (!isGenerating) prevImageCount.current = images.length;
  }, [images.length, isGenerating]);

  // ── Auto-complete: axis change → manip-axes ───────────────────────────────
  useEffect(() => {
    if (!onboardingDismissed) {
      const nowAxes = JSON.stringify(axisLabels);
      if (prevAxes.current !== '{}' && nowAxes !== prevAxes.current) {
        completeStep('manip-axes');
      }
      prevAxes.current = nowAxes;
    }
  }, [axisLabels, onboardingDismissed, completeStep]);

  // ── Auto-complete: isolation → manip-isolate ──────────────────────────────
  useEffect(() => {
    if (!onboardingDismissed) {
      if (prevIsolated.current === null && isolatedImageIds !== null) {
        completeStep('manip-isolate');
      }
      prevIsolated.current = isolatedImageIds;
    }
  }, [isolatedImageIds, onboardingDismissed, completeStep]);

  // ── Auto-complete: non-default layer → manip-layers ──────────────────────
  useEffect(() => {
    if (!onboardingDismissed) {
      const nowMap = JSON.stringify(imageLayerMap);
      if (nowMap !== prevLayerMap.current) {
        const hasNonDefault = Object.values(imageLayerMap).some((v) => v !== 'default');
        if (hasNonDefault) completeStep('manip-layers');
        prevLayerMap.current = nowMap;
      }
    }
  }, [imageLayerMap, onboardingDismissed, completeStep]);

  // ── Auto-complete: AI insight → ai-explore + ai-island ───────────────────
  useEffect(() => {
    if (!onboardingDismissed && agentInsights.length > prevInsightCount.current) {
      completeStep('ai-explore');
      completeStep('ai-island');
      prevInsightCount.current = agentInsights.length;
    }
  }, [agentInsights.length, onboardingDismissed, completeStep]);

  // ── Auto-complete: inline axis data → ai-explore ─────────────────────────
  useEffect(() => {
    if (!onboardingDismissed && inlineAxisData !== null && prevInlineAxis.current === null) {
      completeStep('ai-explore');
    }
    prevInlineAxis.current = inlineAxisData;
  }, [inlineAxisData, onboardingDismissed, completeStep]);

  if (onboardingDismissed) return null;

  const activeStep = onboardingSpotlight
    ? (TUTORIAL_STEPS.find((s) => s.id === onboardingSpotlight) ?? null)
    : null;
  const stepNumber = activeStep ? TUTORIAL_STEPS.findIndex((s) => s.id === activeStep.id) + 1 : 0;

  return (
    <>
      {onboardingActive && <ChecklistPanel onClose={() => setOnboardingActive(false)} />}
      {activeStep && (
        <SpotlightOverlay
          key={activeStep.id}
          step={activeStep}
          stepNumber={stepNumber}
          total={TUTORIAL_STEPS.length}
        />
      )}
    </>
  );
};
