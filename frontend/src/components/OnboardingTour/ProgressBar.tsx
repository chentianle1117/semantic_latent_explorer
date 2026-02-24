/**
 * ProgressBar v4 — compact inline bar in the header-right area.
 * Shows 4 section groups of clickable step dots.
 * Click any dot to jump to that step. Reset button restarts from step 1.
 */

import React, { useCallback } from 'react';
import { useAppStore } from '../../store/appStore';
import { TUTORIAL_SECTIONS, TUTORIAL_STEPS, getStepsForSection, type SectionKey } from './steps';

export const ProgressBar: React.FC = () => {
  const completedSteps      = useAppStore((s) => s.completedSteps);
  const onboardingSpotlight = useAppStore((s) => s.onboardingSpotlight);
  const onboardingDismissed = useAppStore((s) => s.onboardingDismissed);
  const setSpotlight        = useAppStore((s) => s.setOnboardingSpotlight);
  const resetOnboarding     = useAppStore((s) => s.resetOnboarding);

  const handleSectionClick = useCallback((sectionKey: SectionKey) => {
    const sectionSteps = getStepsForSection(sectionKey);
    const firstIncomplete = sectionSteps.find((s) => !completedSteps.includes(s.id));
    setSpotlight(firstIncomplete?.id ?? sectionSteps[0]?.id ?? null);
  }, [completedSteps, setSpotlight]);

  const handleStepClick = useCallback((stepId: string) => {
    setSpotlight(stepId);
  }, [setSpotlight]);

  const handleReset = useCallback(() => {
    resetOnboarding();
    setSpotlight(TUTORIAL_STEPS[0].id);
  }, [resetOnboarding, setSpotlight]);

  if (onboardingDismissed || !onboardingSpotlight) return null;

  const currentStep = TUTORIAL_STEPS.find((s) => s.id === onboardingSpotlight);
  const totalDone = completedSteps.length;
  const totalSteps = TUTORIAL_STEPS.length;

  return (
    <div className="ob-hdr-progress">
      <span className="ob-hdr-label">Tutorial</span>
      <span className="ob-hdr-counter">{totalDone}/{totalSteps}</span>
      <div className="ob-hdr-sections">
        {TUTORIAL_SECTIONS.map((sec) => {
          const sectionSteps = getStepsForSection(sec.key);
          const isActive = currentStep?.section === sec.key;

          return (
            <div
              key={sec.key}
              className={`ob-hdr-sec${isActive ? ' ob-hdr-sec-active' : ''}`}
              onClick={() => handleSectionClick(sec.key)}
              title={sec.label}
            >
              {sectionSteps.map((s) => {
                const done = completedSteps.includes(s.id);
                const isCurrent = s.id === onboardingSpotlight;
                return (
                  <button
                    key={s.id}
                    className={`ob-hdr-dot${done ? ' done' : ''}${isCurrent ? ' current' : ''}`}
                    onClick={(e) => { e.stopPropagation(); handleStepClick(s.id); }}
                    title={s.title}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
      <button className="ob-hdr-reset" onClick={handleReset} title="Restart tutorial from beginning">
        Reset
      </button>
    </div>
  );
};
