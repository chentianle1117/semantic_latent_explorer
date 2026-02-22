import React, { useState, useCallback, useRef } from "react";
import "./HeaderBar.css";
import { CanvasSwitcher } from "../CanvasSwitcher/CanvasSwitcher";
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
  const onboardingActive = useAppStore((s) => s.onboardingActive);
  const completedSteps = useAppStore((s) => s.completedSteps);
  const onboardingDismissed = useAppStore((s) => s.onboardingDismissed);
  const setOnboardingSpotlight = useAppStore((s) => s.setOnboardingSpotlight);
  const setOnboardingActive = useAppStore((s) => s.setOnboardingActive);
  const completeOnboardingStep = useAppStore((s) => s.completeOnboardingStep);

  const isIncomplete = !onboardingDismissed && completedSteps.length < TUTORIAL_STEPS.length;

  const handleTutorialClick = useCallback(() => {
    if (onboardingDismissed) return;
    const allDone = completedSteps.length >= TUTORIAL_STEPS.length;
    if (allDone) {
      // Post-completion: toggle the checklist for step replay
      setOnboardingActive(!onboardingActive);
    } else if (onboardingSpotlight) {
      // Active spotlight open: close it
      setOnboardingSpotlight(null);
    } else {
      // Jump to first incomplete step
      const firstIncomplete = TUTORIAL_STEPS.find((s) => !completedSteps.includes(s.id));
      setOnboardingSpotlight(firstIncomplete?.id ?? TUTORIAL_STEPS[0].id);
    }
  }, [onboardingSpotlight, onboardingActive, completedSteps, onboardingDismissed, setOnboardingSpotlight, setOnboardingActive]);

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
      completeOnboardingStep('save-export');
      setTimeout(() => setSaveStatus('idle'), 1800);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2500);
    }
  }, [completeOnboardingStep]);

  const handleExport = useCallback(() => {
    // Use relative URL so it works both locally and via ngrok
    window.open('/api/export-zip', '_blank');
  }, []);

  return (
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
        {/* Tutorial button */}
        <button
          className={`header-icon-btn ob-header-btn${isIncomplete ? ' ob-incomplete' : ''}`}
          onClick={handleTutorialClick}
          title="Tutorial Guide"
        >
          ?
          {isIncomplete && <span className="ob-btn-badge" />}
        </button>
        <button className="header-icon-btn" onClick={onOpenSettings} title="Settings">
          &#9881;
        </button>
      </div>
    </div>
  );
};
