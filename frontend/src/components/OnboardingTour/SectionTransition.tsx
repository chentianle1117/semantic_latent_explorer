/**
 * SectionTransition — non-blocking toast shown when a section completes.
 * Slides in from the bottom-right, auto-dismisses after 6s or on click.
 */

import React from 'react';
import { useAppStore } from '../../store/appStore';
import { TUTORIAL_SECTIONS, type SectionKey } from './steps';
import { advanceToNextSection } from './useAutoAdvance';

export const SectionTransition: React.FC = () => {
  const sectionKey = useAppStore((s) => s.onboardingSectionTransition) as SectionKey | null;
  const showSectionTransition = useAppStore((s) => s.showSectionTransition);

  if (!sectionKey) return null;

  const section    = TUTORIAL_SECTIONS.find((s) => s.key === sectionKey);
  const sectionIdx = TUTORIAL_SECTIONS.findIndex((s) => s.key === sectionKey);
  const nextSection = TUTORIAL_SECTIONS[sectionIdx + 1];
  const isLast     = !nextSection;

  if (!section) return null;

  return (
    <div className="ob-section-toast" style={{ borderLeftColor: section.color }}>
      <div className="ob-st-toast-header">
        <span className="ob-st-toast-badge" style={{ color: section.color }}>
          {isLast ? 'Tutorial Complete' : `${section.label} Complete`}
        </span>
        <button
          className="ob-st-toast-close"
          onClick={() => {
            if (nextSection) {
              advanceToNextSection(sectionKey);
            } else {
              showSectionTransition(null);
            }
          }}
          title="Dismiss"
        >
          &times;
        </button>
      </div>
      <p className="ob-st-toast-summary">{section.completionSummary}</p>
      <button
        className="ob-st-toast-continue"
        style={{ backgroundColor: isLast ? section.color : nextSection.color }}
        onClick={() => {
          if (nextSection) {
            advanceToNextSection(sectionKey);
          } else {
            showSectionTransition(null);
          }
        }}
      >
        {isLast ? 'Close Tutorial' : `Continue to ${nextSection.label} →`}
      </button>
    </div>
  );
};
