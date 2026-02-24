/**
 * OnboardingTour — v5 thin orchestrator
 *
 * Composes:  SmartSpotlight · SectionTransition · ChecklistPanel
 * Note: ProgressBar is rendered in HeaderBar (inline in header-right)
 * Hooks:     useAutoComplete · useAutoAdvance
 */

import React from 'react';
import { useAppStore } from '../../store/appStore';
import { TUTORIAL_STEPS } from './steps';
import { SmartSpotlight } from './SmartSpotlight';
import { SectionTransition } from './SectionTransition';
import { ChecklistPanel } from './ChecklistPanel';
import { useAutoComplete } from './useAutoComplete';
import { useAutoAdvance } from './useAutoAdvance';
import './OnboardingTour.css';

export const OnboardingTour: React.FC = () => {
  const onboardingActive    = useAppStore((s) => s.onboardingActive);
  const onboardingSpotlight = useAppStore((s) => s.onboardingSpotlight);
  const onboardingDismissed = useAppStore((s) => s.onboardingDismissed);
  const setOnboardingActive = useAppStore((s) => s.setOnboardingActive);

  // Wire up auto-complete watchers + auto-advance logic
  useAutoComplete();
  useAutoAdvance();

  if (onboardingDismissed) return null;

  const activeStep = onboardingSpotlight
    ? (TUTORIAL_STEPS.find((s) => s.id === onboardingSpotlight) ?? null)
    : null;

  return (
    <>
      {/* Section transition card ("Section A Complete!") */}
      <SectionTransition />

      {/* Smart spotlight card for the active step */}
      {activeStep && <SmartSpotlight key={activeStep.id} step={activeStep} />}

      {/* Checklist panel opened via "?" button */}
      {onboardingActive && <ChecklistPanel onClose={() => setOnboardingActive(false)} />}
    </>
  );
};
