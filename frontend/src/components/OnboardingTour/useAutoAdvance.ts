/**
 * useAutoAdvance — centralized auto-advance + section transition detection
 *
 * Watches completedSteps for changes and advances the spotlight whenever
 * the currently shown step is newly completed. Also detects section boundaries
 * and triggers section transition cards.
 */

import { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/appStore';
import { TUTORIAL_STEPS, TUTORIAL_SECTIONS, getStepsForSection, type SectionKey } from './steps';

export function useAutoAdvance(): void {
  const completedSteps      = useAppStore((s) => s.completedSteps);
  const onboardingSpotlight = useAppStore((s) => s.onboardingSpotlight);
  const onboardingDismissed = useAppStore((s) => s.onboardingDismissed);
  const setSpotlight        = useAppStore((s) => s.setOnboardingSpotlight);
  const showSectionTransition = useAppStore((s) => s.showSectionTransition);

  const prevCompletedRef = useRef(new Set(completedSteps));
  const advanceTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Unmount-only cleanup
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (onboardingDismissed || !onboardingSpotlight) {
      prevCompletedRef.current = new Set(completedSteps);
      // Cancel pending advance if dismissed
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
      }
      return;
    }

    const prev = prevCompletedRef.current;
    const newlyCompleted = completedSteps.filter((id) => !prev.has(id));
    prevCompletedRef.current = new Set(completedSteps);

    if (!newlyCompleted.includes(onboardingSpotlight)) return;

    // Cancel any pending advance timer before setting a new one
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }

    // Check if we just completed the last step of a section
    const currentStep = TUTORIAL_STEPS.find((s) => s.id === onboardingSpotlight);
    if (currentStep) {
      const sectionSteps = getStepsForSection(currentStep.section);
      const allSectionDone = sectionSteps.every((s) => completedSteps.includes(s.id));

      if (allSectionDone) {
        const sectionIdx = TUTORIAL_SECTIONS.findIndex((sec) => sec.key === currentStep.section);
        const nextSection = TUTORIAL_SECTIONS[sectionIdx + 1];
        const advancingFrom = onboardingSpotlight;

        // 2.5s delay so user can see the result of the last step before the modal appears
        advanceTimerRef.current = setTimeout(() => {
          advanceTimerRef.current = null;
          const currentSpot = useAppStore.getState().onboardingSpotlight;
          if (currentSpot !== advancingFrom) return; // user navigated away

          if (nextSection) {
            showSectionTransition(currentStep.section);
          } else {
            // Last section (D) — show completion then clear
            showSectionTransition(currentStep.section);
          }
        }, 2500);
        return;
      }
    }

    // Normal advance: find next incomplete step
    const currentIdx = TUTORIAL_STEPS.findIndex((s) => s.id === onboardingSpotlight);
    const upcoming   = [...TUTORIAL_STEPS.slice(currentIdx + 1), ...TUTORIAL_STEPS.slice(0, currentIdx)];
    const nextStep   = upcoming.find((s) => !completedSteps.includes(s.id) && s.id !== onboardingSpotlight);

    // Capture which step we're advancing FROM
    const advancingFrom = onboardingSpotlight;

    // 1.5s pause to show checkmark before advancing
    advanceTimerRef.current = setTimeout(() => {
      advanceTimerRef.current = null;
      // Only advance if spotlight is still on the same step (user didn't navigate away)
      const currentSpot = useAppStore.getState().onboardingSpotlight;
      if (currentSpot === advancingFrom) {
        setSpotlight(nextStep?.id ?? null);
      }
    }, 1500);

    // NO cleanup return — timer must survive dependency changes during the 1.5s pause.
    // Timer is cancelled explicitly: on dismiss (above), on new completion (above),
    // and on unmount (separate effect).
  }, [completedSteps, onboardingSpotlight, onboardingDismissed, setSpotlight, showSectionTransition]);
}

/**
 * Advance to the first step of the next section.
 * Called from SectionTransition "Continue" button.
 */
export function advanceToNextSection(currentSectionKey: SectionKey): void {
  const sectionIdx = TUTORIAL_SECTIONS.findIndex((s) => s.key === currentSectionKey);
  const nextSection = TUTORIAL_SECTIONS[sectionIdx + 1];
  if (nextSection) {
    const firstStep = getStepsForSection(nextSection.key)[0];
    if (firstStep) {
      useAppStore.getState().setOnboardingSpotlight(firstStep.id);
    }
  }
  useAppStore.getState().showSectionTransition(null);
}
