/**
 * SmartSpotlight — bright orange spotlight card with 6 states:
 *   1. Prereq guide (amber) + optional "Do it for me" button
 *   2. Ready (orange)
 *   3. Dial Phase A ("Press Space")
 *   4. Dial Phase B (dial button spotlight)
 *   5. Waiting (spinner)
 *   6. Just completed (checkmark, 1.5s pause)
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useAppStore } from '../../store/appStore';
import {
  TUTORIAL_STEPS,
  getStepsForSection,
  getSectionByKey,
  OB_ACCENT,
  type TutorialStep,
} from './steps';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Prerequisite checker ─────────────────────────────────────────────────────

interface PrereqContext {
  imageCount: number;
  selCount: number;
  selHasLineage: boolean;
  isInitialized: boolean;
  isHistoryExpanded: boolean;
  isLayersExpanded: boolean;
  hasInsight: boolean;
  hasDeleted: boolean;
}

function checkPrerequisite(key: string, ctx: PrereqContext): boolean {
  const { imageCount, selCount, selHasLineage, isInitialized, isHistoryExpanded, isLayersExpanded, hasInsight } = ctx;
  switch (key) {
    // Section A
    case 'a-select-visual':   return selCount > 0;
    case 'a-history-browse':  return isHistoryExpanded;
    case 'a-lineage-tab':     return isHistoryExpanded;
    case 'a-layers-assign':   return selCount > 0;
    case 'a-inspector':       return selCount > 0 && selHasLineage;
    case 'a-inspector-actions': return selCount > 0;
    // Section B
    case 'b-gen-text':        return isInitialized && selCount === 0;
    case 'b-gen-ref':         return selCount >= 1;
    // Section C
    case 'c-isolate':         return selCount > 0;
    case 'c-delete':          return selCount > 0;
    case 'c-rate':            return selCount > 0;
    case 'c-revert':          return ctx.hasDeleted;
    // Section D
    case 'd-explore':         return imageCount > 0;
    case 'd-insight':         return hasInsight;
    case 'd-axes':            return imageCount > 0;
    default:                  return true;
  }
}

/** Find a shoe with both parents and children (ideal), or at least one relation. */
function findShoeWithLineage(): number | null {
  const { images } = useAppStore.getState();
  const visible = images.filter((i) => i.visible !== false);
  // Prefer shoe with both parents AND children
  const best = visible.find((i) => (i.parents?.length ?? 0) > 0 && (i.children?.length ?? 0) > 0);
  if (best) return best.id;
  // Fallback: shoe with any relation
  const any = visible.find((i) => (i.parents?.length ?? 0) > 0 || (i.children?.length ?? 0) > 0);
  return any?.id ?? null;
}

// ─── Auto-resolve actions ("Do it for me") ────────────────────────────────────

function getAutoResolve(key: string): (() => void) | null {
  switch (key) {
    case 'a-history-browse':
    case 'a-lineage-tab':
      return () => useAppStore.getState().setIsHistoryExpanded(true);
    case 'a-inspector': {
      const shoeId = findShoeWithLineage();
      if (!shoeId) return null;
      return () => useAppStore.getState().setSelectedImageIds([shoeId]);
    }
    case 'b-gen-text':
      return () => useAppStore.getState().clearSelection();
    case 'b-deselect':
      return () => useAppStore.getState().clearSelection();
    default:
      return null;
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CARD_W   = 300;
const CARD_PAD = 16;
const HOLE_PAD = 10;
const CARD_H_EST = 340;

// ─── Component ────────────────────────────────────────────────────────────────

export const SmartSpotlight: React.FC<{ step: TutorialStep }> = ({ step }) => {
  const setSpotlight      = useAppStore((s) => s.setOnboardingSpotlight);
  const completeStep      = useAppStore((s) => s.completeOnboardingStep);
  const completedSteps    = useAppStore((s) => s.completedSteps);
  const dismissOnboarding = useAppStore((s) => s.dismissOnboarding);

  const images             = useAppStore((s) => s.images);
  const selectedImageIds   = useAppStore((s) => s.selectedImageIds);
  const isInitialized      = useAppStore((s) => s.isInitialized);
  const isGenerating       = useAppStore((s) => s.isGenerating);
  const isHistoryExpanded  = useAppStore((s) => s.isHistoryExpanded);
  const isLayersExpanded   = useAppStore((s) => s.isLayersExpanded);
  const agentInsights      = useAppStore((s) => s.agentInsights);
  const deletedStack       = useAppStore((s) => s.deletedImageStack);

  const section = getSectionByKey(step.section);

  const prereqCtx = useMemo<PrereqContext>(() => {
    // Check if the currently selected shoe has any lineage (parents or children)
    const selHasLineage = selectedImageIds.length > 0 && images.some((i) =>
      selectedImageIds.includes(i.id) && ((i.parents?.length ?? 0) > 0 || (i.children?.length ?? 0) > 0)
    );
    return {
      imageCount: images.filter((i) => i.visible !== false).length,
      selCount: selectedImageIds.length,
      selHasLineage,
      isInitialized,
      isHistoryExpanded,
      isLayersExpanded,
      hasInsight: agentInsights.length > 0,
      hasDeleted: deletedStack.length > 0,
    };
  }, [images, selectedImageIds, isInitialized, isHistoryExpanded, isLayersExpanded, agentInsights.length, deletedStack.length]);

  const prereqOk  = step.prerequisiteKey ? checkPrerequisite(step.prerequisiteKey, prereqCtx) : true;
  const isWaiting = !!(step.waitingLabel && isGenerating);

  // ── Three-phase targeting: base → dial → dialog ──────────────────────
  const [dialOpen, setDialOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!step.dialButtonId && !step.dialogSelector) return;
    const check = () => {
      if (step.dialButtonId) setDialOpen(!!document.querySelector(`[data-tour="dial-${step.dialButtonId}"]`));
      if (step.dialogSelector) setDialogOpen(!!document.querySelector(step.dialogSelector));
    };
    check();
    const t = setInterval(check, 80);
    return () => clearInterval(t);
  }, [step.dialButtonId, step.dialogSelector]);

  // Phase 3 (dialog open) > Phase 2 (dial open) > Phase 1 (base)
  // Block dial/dialog phases when prereq not met (prevents highlighting e.g. delete button when nothing is selected)
  const effectiveSelector = (step.dialogSelector && dialogOpen && prereqOk)
    ? step.dialogSelector
    : (step.dialButtonId && dialOpen && prereqOk)
      ? `[data-tour="dial-${step.dialButtonId}"]`
      : step.targetSelector;

  // ── Target rect tracking ──────────────────────────────────────────────
  const [rect, setRect] = useState<TargetRect | null>(null);
  const rafRef = useRef<number | null>(null);

  const updateRect = useCallback(() => {
    const r = getTargetRect(effectiveSelector);
    setRect(r);
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

  // ── Completion checkmark state ──────────────────────────────────────
  const isComplete = completedSteps.includes(step.id);
  const wasCompleteRef = useRef(isComplete);
  const [showCheckmark, setShowCheckmark] = useState(false);

  useEffect(() => {
    if (isComplete && !wasCompleteRef.current) {
      setShowCheckmark(true);
      const t = setTimeout(() => setShowCheckmark(false), 1500);
      wasCompleteRef.current = true;
      return () => clearTimeout(t);
    }
    wasCompleteRef.current = isComplete;
  }, [isComplete]);

  // ── Step index helpers (free navigation) ─────────────────────────────
  const stepIdx   = TUTORIAL_STEPS.findIndex((s) => s.id === step.id);
  const prevStep  = stepIdx > 0 ? TUTORIAL_STEPS[stepIdx - 1] : null;
  const hasPrev   = !!prevStep;

  const handlePrevStep = useCallback(() => {
    if (prevStep) setSpotlight(prevStep.id);
  }, [prevStep, setSpotlight]);

  // ── "Got it" — mark complete + advance ─────────────────────────────────
  const handleGotIt = useCallback(() => {
    completeStep(step.id);
  }, [completeStep, step.id]);

  // ── "Complete for me" — run auto-resolve action then complete ──────────
  const handleCompleteForMe = useCallback(() => {
    const resolve = getAutoResolve(step.id);
    if (resolve) resolve();
    completeStep(step.id);
  }, [completeStep, step.id]);

  const handleClose = useCallback(() => setSpotlight(null), [setSpotlight]);

  // ── Section badge ──────────────────────────────────────────────────────
  const sectionSteps = getStepsForSection(step.section);
  const stepInSection = sectionSteps.findIndex((s) => s.id === step.id) + 1;
  const sectionTotal  = sectionSteps.length;

  // ── Card position with collision avoidance ────────────────────────────
  const cardStyle = useMemo((): React.CSSProperties => {
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!rect) return { position: 'fixed', top: 80, right: 16, width: CARD_W };
    const s: React.CSSProperties = { position: 'fixed', width: CARD_W };
    const clampL = (x: number) => Math.max(8, Math.min(x, vw - CARD_W - 8));
    const clampT = (y: number) => Math.max(8, Math.min(y, vh - CARD_H_EST - 8));

    // Step 1: Place card at preferred position
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

    // Step 2: Collision detection — does card overlap the target?
    const tExp = {
      left:   rect.left   - HOLE_PAD - 4,
      top:    rect.top    - HOLE_PAD - 4,
      right:  rect.right  + HOLE_PAD + 4,
      bottom: rect.bottom + HOLE_PAD + 4,
    };
    const cL = (s.left as number) ?? 0;
    const cT = (s.top as number) ?? 0;
    const overlaps = cL < tExp.right && (cL + CARD_W) > tExp.left && cT < tExp.bottom && (cT + CARD_H_EST) > tExp.top;

    if (overlaps) {
      const candidates = [
        { left: clampL(rect.right + HOLE_PAD + CARD_PAD), top: clampT(rect.top) },
        { left: clampL(rect.left), top: clampT(rect.bottom + HOLE_PAD + CARD_PAD) },
        { left: clampL(rect.left - HOLE_PAD - CARD_PAD - CARD_W), top: clampT(rect.top) },
        { left: clampL(rect.left), top: clampT(rect.top - HOLE_PAD - CARD_PAD - CARD_H_EST) },
      ];
      for (const c of candidates) {
        const co = c.left < tExp.right && (c.left + CARD_W) > tExp.left && c.top < tExp.bottom && (c.top + CARD_H_EST) > tExp.top;
        if (!co) { s.left = c.left; s.top = c.top; break; }
      }
    }
    return s;
  }, [rect, step.cardPosition]);

  // ── Highlight border (bright orange) ──────────────────────────────────
  const borderColor = prereqOk ? OB_ACCENT : '#f59e0b';
  // Clamp highlight rect so border stays within viewport (2px inset from edge)
  const hlLeft   = Math.max(2, rect ? rect.left   - HOLE_PAD : 0);
  const hlTop    = Math.max(2, rect ? rect.top    - HOLE_PAD : 0);
  const hlRight  = Math.min(window.innerWidth  - 2, rect ? rect.right  + HOLE_PAD : 0);
  const hlBottom = Math.min(window.innerHeight - 2, rect ? rect.bottom + HOLE_PAD : 0);
  const highlightStyle: React.CSSProperties = rect ? {
    position: 'fixed',
    left:   hlLeft,
    top:    hlTop,
    width:  hlRight  - hlLeft,
    height: hlBottom - hlTop,
    borderRadius: dialogOpen ? 18 : (dialOpen && step.dialButtonId ? 10 : 12),
    border: `3px solid ${borderColor}`,
    boxShadow: `0 0 0 2px ${borderColor}40, 0 0 24px ${borderColor}66, inset 0 0 12px ${borderColor}15`,
    pointerEvents: 'none',
    zIndex: 10510,
    transition: 'left .2s ease, top .2s ease, width .2s ease, height .2s ease',
    animation: 'ob-highlight-pulse 2s ease-in-out infinite',
  } : {};

  // Phase-aware instruction text
  const getInstruction = (): string => {
    if (step.dialogSelector && dialogOpen && step.dialogInstruction) return step.dialogInstruction;
    if (step.dialButtonId && dialOpen && step.dialInstruction) return step.dialInstruction;
    if (step.dialButtonId && !dialOpen) return step.instruction;
    return step.instruction;
  };

  // ── Pulsing orange ring — only for small/medium targets (buttons, dropdowns, bars) ──
  const isSmallTarget = rect && rect.width < 500 && rect.height < 200;
  const showClickCircle = prereqOk && !isWaiting && !isComplete && rect && !step.isInformational && isSmallTarget && !dialogOpen;
  const clickCircleStyle: React.CSSProperties = (showClickCircle && rect) ? {
    position: 'fixed',
    left: rect.left + rect.width / 2 - 24,
    top:  rect.top  + rect.height / 2 - 24,
    width: 48,
    height: 48,
    borderRadius: '50%',
    border: `2.5px solid ${borderColor}`,
    pointerEvents: 'none',
    zIndex: 10512,
    animation: 'ob-click-circle-pulse 1.2s ease-in-out infinite',
  } : { display: 'none' };

  // ── Badge rendering helper ─────────────────────────────────────────────
  const renderBadge = (color: string) => (
    <span className="ob-section-badge" style={{ backgroundColor: `${color}20`, color, borderColor: `${color}50` }}>
      {section.label} · {stepInSection}/{sectionTotal}
    </span>
  );

  // ── Card body rendering ────────────────────────────────────────────────
  const renderCardBody = () => {
    // State: just completed (checkmark)
    if (showCheckmark) {
      return (
        <>
          <div className="ob-card-meta">{renderBadge(OB_ACCENT)}</div>
          <div className="ob-card-checkmark">
            <span className="ob-checkmark-icon">&#10003;</span>
          </div>
        </>
      );
    }

    // State: prerequisite not met
    if (!prereqOk) {
      const autoResolve = step.prerequisiteKey ? getAutoResolve(step.prerequisiteKey) : null;
      return (
        <>
          <div className="ob-card-meta">{renderBadge(borderColor)}</div>
          <p className="ob-card-desc ob-prereq-hint">{renderMd(step.prerequisiteGuide || 'Complete the prerequisite first.')}</p>
          {autoResolve && (
            <button className="ob-do-it-for-me" onClick={autoResolve} style={{ borderColor: `${borderColor}60`, color: borderColor }}>
              Do it for me
            </button>
          )}
          <button className="ob-card-skip" onClick={() => dismissOnboarding()}>Dismiss tutorial</button>
        </>
      );
    }

    // State: waiting (async op in progress)
    if (isWaiting) {
      return (
        <>
          <div className="ob-card-meta">{renderBadge(OB_ACCENT)}</div>
          <p className="ob-card-desc">{step.waitingLabel}</p>
          <div className="ob-waiting-bar"><div className="ob-waiting-fill" style={{ backgroundColor: OB_ACCENT }} /></div>
        </>
      );
    }

    // State: ready / dial phases
    const isDialPhaseA = step.dialButtonId && !dialOpen && !dialogOpen && !isComplete;
    const isDialogPhase = step.dialogSelector && dialogOpen;
    // Only show "Got it" for informational steps (no auto-detection)
    const showGotIt = step.isInformational;
    // "Complete for me" — escape hatch on every non-informational interactive step
    const showCompleteForMe = !step.isInformational && !isComplete;

    return (
      <>
        <div className="ob-card-meta">{renderBadge(OB_ACCENT)}</div>

        {isDialPhaseA && (
          <div className="ob-dial-hint">
            <span className="ob-dial-hint-key">Space</span>
            <span className="ob-dial-hint-label">open Radial Dial</span>
          </div>
        )}

        {isDialogPhase && (
          <div className="ob-dialog-phase-hint">
            <span className="ob-dialog-phase-icon">📋</span>
            <span className="ob-dialog-phase-label">Dialog open — follow the steps below</span>
          </div>
        )}

        <p className="ob-card-desc">{renderMd(getInstruction())}</p>

        <div className="ob-card-actions">
          {hasPrev && <button className="ob-card-prev" onClick={handlePrevStep}>←</button>}
          {showGotIt && (
            <button className="ob-card-got-it" onClick={handleGotIt} style={{ borderColor: `${OB_ACCENT}80`, color: OB_ACCENT }}>
              Got it
            </button>
          )}
          {showCompleteForMe && (
            <button className="ob-complete-for-me" onClick={handleCompleteForMe}>
              Complete for me
            </button>
          )}
          <button className="ob-card-close" onClick={handleClose}>Close</button>
        </div>
        <button className="ob-card-skip" onClick={() => dismissOnboarding()}>Dismiss tutorial</button>
      </>
    );
  };

  const cardClass = [
    'ob-spotlight-card',
    !prereqOk ? 'ob-card-prereq' : '',
    isWaiting  ? 'ob-card-waiting' : '',
    showCheckmark ? 'ob-card-checkmark-state' : '',
  ].filter(Boolean).join(' ');

  // Show highlight when navigating back to completed steps too — only hide during checkmark animation
  const showHighlight = rect && !showCheckmark;

  return (
    <>
      {showHighlight && <div className="ob-highlight-border" style={highlightStyle} />}
      {showClickCircle && !showCheckmark && <div style={clickCircleStyle} />}
      <div className={cardClass} style={{ ...cardStyle, zIndex: 10520, '--ob-accent': OB_ACCENT } as React.CSSProperties}>
        {renderCardBody()}
      </div>
    </>
  );
};
