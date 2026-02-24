import React, { useState, useCallback, useRef } from "react";
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
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'done'>('idle');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setImages = useAppStore((s) => s.setImages);
  const setHistoryGroups = useAppStore((s) => s.setHistoryGroups);
  const setAxisLabels = useAppStore((s) => s.setAxisLabels);
  const resetCanvasBounds = useAppStore((s) => s.resetCanvasBounds);

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

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-selected later
    e.target.value = '';

    setImportStatus('importing');
    try {
      await apiClient.importZip(file);
      // Reload full state from backend after import (necessary — replacing entire canvas)
      const state = await apiClient.getState();
      setImages(state.images ?? []);
      setHistoryGroups(state.history_groups ?? []);
      if (state.axis_labels) setAxisLabels(state.axis_labels);
      resetCanvasBounds();
      setImportStatus('done');
      setTimeout(() => setImportStatus('idle'), 1800);
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setImportStatus('idle');
    }
  }, [setImages, setHistoryGroups, setAxisLabels, resetCanvasBounds]);

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

  const handleExport = useCallback(() => {
    // Use relative URL so it works both locally and via ngrok
    window.open('/api/export-zip', '_blank');
  }, []);

  return (
    <>
      <div className="header-bar" data-tour="header">
        {/* Hidden file input for ZIP import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          style={{ display: 'none' }}
          onChange={handleFileSelected}
        />

        <div className="header-left">
          <CanvasSwitcher />
          <button
            className="header-canvas-action"
            data-tour="import"
            onClick={handleImportClick}
            title="Import canvas from ZIP file"
            disabled={importStatus === 'importing'}
          >
            {importStatus === 'importing' ? '…' : importStatus === 'done' ? '✓ Imported' : '↑ Import'}
          </button>
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
            onClick={handleExport}
            title="Export canvas as ZIP download"
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
