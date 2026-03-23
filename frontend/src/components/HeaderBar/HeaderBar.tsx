import React, { useState, useCallback, useEffect, useRef } from "react";
import "./HeaderBar.css";
import { CanvasSwitcher } from "../CanvasSwitcher/CanvasSwitcher";
import { ProgressBar } from "../OnboardingTour/ProgressBar";
import { apiClient } from "../../api/client";
import { useAppStore } from "../../store/appStore";
import { TUTORIAL_STEPS } from "../OnboardingTour/steps";

interface HeaderBarProps {
  imageCount: number;
  isInitialized: boolean;
  isAnalyzing: boolean;
  isLoadingAxes: boolean;
  is3DMode?: boolean;
  onToggle3D?: () => void;
  onOpenSettings: () => void;
  onInsightClick?: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  onOpenSettings,
}) => {
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const participantId = useAppStore((s) => s.participantId);
  const participantLockedFromUrl = useAppStore((s) => s.participantLockedFromUrl);
  const studySessionName = useAppStore((s) => s.studySessionName);
  const setStudySessionName = useAppStore((s) => s.setStudySessionName);
  const [sessionDraft, setSessionDraft] = useState(studySessionName);
  const sessionInputRef = useRef<HTMLInputElement>(null);
  const hasFetchedSession = useRef(false);

  // Fetch study session name from backend on mount
  useEffect(() => {
    if (hasFetchedSession.current) return;
    hasFetchedSession.current = true;
    apiClient.getStudySessionName().then((res) => {
      setStudySessionName(res.studySessionName);
      setSessionDraft(res.studySessionName);
    }).catch(() => {});
  }, [setStudySessionName]);

  // Sync draft when store changes externally
  useEffect(() => { setSessionDraft(studySessionName); }, [studySessionName]);

  const commitSessionName = useCallback(async () => {
    const trimmed = sessionDraft.trim();
    if (trimmed === studySessionName) return;
    setStudySessionName(trimmed);
    try {
      await apiClient.setStudySessionName(trimmed);
    } catch { /* silent */ }
  }, [sessionDraft, studySessionName, setStudySessionName]);

  const onboardingSpotlight = useAppStore((s) => s.onboardingSpotlight);
  const completedSteps = useAppStore((s) => s.completedSteps);
  const onboardingDismissed = useAppStore((s) => s.onboardingDismissed);
  const setOnboardingSpotlight = useAppStore((s) => s.setOnboardingSpotlight);
  const undismissOnboarding = useAppStore((s) => s.undismissOnboarding);
  const setIsHistoryExpanded = useAppStore((s) => s.setIsHistoryExpanded);
  const setIsLayersExpanded = useAppStore((s) => s.setIsLayersExpanded);
  const isIncomplete = completedSteps.length < TUTORIAL_STEPS.length;

  const handleTutorialClick = useCallback(() => {
    // Collapse bottom panels so onboarding starts with a clean canvas view
    setIsHistoryExpanded(false);
    setIsLayersExpanded(false);

    // If dismissed, un-dismiss and resume where we left off (preserve progress)
    if (onboardingDismissed) {
      undismissOnboarding();
      const firstIncomplete = TUTORIAL_STEPS.find((s) => !completedSteps.includes(s.id));
      setOnboardingSpotlight(firstIncomplete?.id ?? TUTORIAL_STEPS[0].id);
      return;
    }
    // If tutorial already active, do nothing (user can navigate via progress dots)
    if (onboardingSpotlight) return;
    // Start or resume tutorial
    const firstIncomplete = TUTORIAL_STEPS.find((s) => !completedSteps.includes(s.id));
    setOnboardingSpotlight(firstIncomplete?.id ?? TUTORIAL_STEPS[0].id);
  }, [onboardingSpotlight, completedSteps, onboardingDismissed, setOnboardingSpotlight, undismissOnboarding, setIsHistoryExpanded, setIsLayersExpanded]);

  const handleSave = useCallback(async () => {
    setSaveStatus('saving');
    try {
      await apiClient.saveSession();
      setSaveStatus('done');
      setTimeout(() => setSaveStatus('idle'), 1800);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2500);
    }
  }, []);

  return (
    <>
      <div className="header-bar" data-tour="header">
        <div className="header-left">
          <CanvasSwitcher />
          <div className="session-name-group">
            <span className="session-name-label">Session:</span>
            <input
              ref={sessionInputRef}
              className="session-name-input"
              type="text"
              placeholder="e.g. P1-day1"
              value={sessionDraft}
              onChange={(e) => setSessionDraft(e.target.value)}
              onBlur={commitSessionName}
              onKeyDown={(e) => { if (e.key === 'Enter') sessionInputRef.current?.blur(); }}
              title="Study session name — prefixed to all saved files for traceability"
            />
          </div>
          {participantLockedFromUrl && (
            <span className="participant-pill" title={`Logged in as ${participantId}`}>
              {participantId}
            </span>
          )}
          <button
            className="header-canvas-action"
            data-tour="save"
            onClick={handleSave}
            title="Save canvas to server"
            disabled={saveStatus === 'saving'}
          >
            {saveStatus === 'saving' ? '…' : saveStatus === 'done' ? '✓ Saved' : saveStatus === 'error' ? '✗ Error' : '↓ Save'}
          </button>
          <button
            className="header-canvas-action"
            onClick={() => window.open('/api/export-zip', '_blank')}
            title="Export all images as individual PNGs + metadata ZIP"
          >
            ↓ Export
          </button>
        </div>
        <div className="header-center" />
        <div className="header-right">
          {/* Inline tutorial progress */}
          <ProgressBar />
          {/* Tutorial button */}
          <button
            className={`header-canvas-action ob-header-btn${isIncomplete ? ' ob-incomplete' : ''}`}
            onClick={handleTutorialClick}
            title="Start or resume onboarding tutorial"
          >
            Onboarding
            {isIncomplete && <span className="ob-btn-badge" />}
          </button>
          <button className="header-icon-btn" onClick={onOpenSettings} title="Settings">
            &#9881;
          </button>
        </div>
      </div>
    </>
  );
};
