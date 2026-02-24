/**
 * ChecklistPanel — section-grouped step list with progress bars.
 * Opened via the "?" button in the header.
 */

import React, { useMemo } from 'react';
import { useAppStore } from '../../store/appStore';
import { TUTORIAL_STEPS, TUTORIAL_SECTIONS, getStepsForSection } from './steps';

interface Props {
  onClose: () => void;
}

export const ChecklistPanel: React.FC<Props> = ({ onClose }) => {
  const completedSteps      = useAppStore((s) => s.completedSteps);
  const onboardingSpotlight = useAppStore((s) => s.onboardingSpotlight);
  const setSpotlight        = useAppStore((s) => s.setOnboardingSpotlight);
  const dismissOnboarding   = useAppStore((s) => s.dismissOnboarding);
  const resetOnboarding     = useAppStore((s) => s.resetOnboarding);

  const total  = TUTORIAL_STEPS.length;
  const done   = completedSteps.length;
  const allDone = done >= total;

  return (
    <div className="ob-checklist" role="dialog" aria-label="Tutorial Guide">
      <div className="ob-checklist-header">
        <span className="ob-checklist-title">{allDone ? 'Tutorial Complete!' : 'Tutorial Guide'}</span>
        <button className="ob-checklist-close" onClick={onClose} title="Close">×</button>
      </div>

      {/* Overall progress */}
      <div className="ob-checklist-progress">
        <div className="ob-checklist-progress-track">
          {TUTORIAL_SECTIONS.map((sec) => {
            const sectionSteps = getStepsForSection(sec.key);
            const widthPct = (sectionSteps.length / total) * 100;
            const fillPct  = sectionSteps.length > 0
              ? (sectionSteps.filter((s) => completedSteps.includes(s.id)).length / sectionSteps.length) * 100
              : 0;
            return (
              <div key={sec.key} className="ob-checklist-progress-segment" style={{ width: `${widthPct}%` }}>
                <div className="ob-checklist-progress-fill" style={{ width: `${fillPct}%`, backgroundColor: sec.color }} />
              </div>
            );
          })}
        </div>
        <span className="ob-checklist-progress-label">{done}/{total}</span>
      </div>

      {allDone && <div className="ob-all-done">All done! Click any step to revisit it.</div>}

      {/* Sections */}
      <div className="ob-steps-list">
        {TUTORIAL_SECTIONS.map((sec) => {
          const sectionSteps = getStepsForSection(sec.key);
          const sectionDone  = sectionSteps.filter((s) => completedSteps.includes(s.id)).length;

          return (
            <div key={sec.key} className="ob-category">
              <div className="ob-category-header">
                <div className="ob-category-accent" style={{ backgroundColor: sec.color }} />
                <span className="ob-category-label">{sec.label}</span>
                <span className="ob-category-count">{sectionDone}/{sectionSteps.length}</span>
              </div>
              {sectionSteps.map((step) => {
                const isComplete = completedSteps.includes(step.id);
                const isActive   = onboardingSpotlight === step.id;
                return (
                  <button
                    key={step.id}
                    className={`ob-step-item${isComplete ? ' ob-step-done' : ''}${isActive ? ' ob-step-active' : ''}`}
                    onClick={() => { setSpotlight(step.id); onClose(); }}
                    title={step.instruction.replace(/\*\*/g, '')}
                  >
                    <span className={`ob-step-check${isComplete ? ' ob-step-check-done' : ''}`} style={{ borderColor: isComplete ? sec.color : undefined, color: isComplete ? sec.color : undefined }}>
                      {isComplete ? '✓' : ''}
                    </span>
                    <span className="ob-step-title">{step.title}</span>
                    {isActive && <span className="ob-step-active-dot" style={{ backgroundColor: sec.color }} />}
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
