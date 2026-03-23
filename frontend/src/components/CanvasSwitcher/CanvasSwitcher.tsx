/**
 * CanvasSwitcher — HeaderBar dropdown for canvas management.
 *
 * Shows current canvas name. Click to open dropdown with:
 *  - List of canvases (click to switch)
 *  - New canvas / Branch from selection
 *  - Save now / Export ZIP
 * Double-click name to inline-edit.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../../store/appStore';
import { useProgressStore } from '../../store/progressStore';
import { apiClient } from '../../api/client';
import { cancelPendingSave } from '../../hooks/useAutoSave';
import './CanvasSwitcher.css';

export const CanvasSwitcher: React.FC = () => {
  const canvasName = useAppStore((s) => s.canvasName);
  const currentCanvasId = useAppStore((s) => s.currentCanvasId);
  const canvasList = useAppStore((s) => s.canvasList);
  const selectedImageIds = useAppStore((s) => s.selectedImageIds);
  const isInitialized = useAppStore((s) => s.isInitialized);
  const setImages = useAppStore((s) => s.setImages);
  const setHistoryGroups = useAppStore((s) => s.setHistoryGroups);
  const setAxisLabels = useAppStore((s) => s.setAxisLabels);
  const setDesignBrief = useAppStore((s) => s.setDesignBrief);
  const resetCanvasBounds = useAppStore((s) => s.resetCanvasBounds);
  const setCurrentCanvasId = useAppStore((s) => s.setCurrentCanvasId);
  const setCanvasName = useAppStore((s) => s.setCanvasName);
  const setCanvasList = useAppStore((s) => s.setCanvasList);
  const setMinimapDots = useAppStore((s) => s.setMinimapDots);
  const setMinimapGhostDots = useAppStore((s) => s.setMinimapGhostDots);
  const setIsolatedImageIds = useAppStore((s) => s.setIsolatedImageIds);

  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(canvasName);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [isSwitching, setIsSwitching] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on click-outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing) { setEditValue(canvasName); inputRef.current?.select(); }
  }, [isEditing, canvasName]);

  const refreshList = useCallback(async () => {
    try {
      const { sessions } = await apiClient.listSessions();
      setCanvasList(sessions);
    } catch { /* silent */ }
  }, [setCanvasList]);

  const handleSwitchCanvas = async (canvasId: string) => {
    if (canvasId === currentCanvasId || isSwitching) return;
    // Cancel any pending auto-save timer to prevent cross-canvas corruption
    cancelPendingSave();
    setIsOpen(false);
    setIsSwitching(true);
    const ps = useProgressStore.getState();
    ps.showProgress('loading', 'Switching canvas…', false);
    ps.setSteps([
      { id: 'save',   label: 'Saving current canvas',   status: 'active' },
      { id: 'load',   label: 'Loading target canvas',   status: 'pending' },
      { id: 'render', label: 'Updating canvas view',    status: 'pending' },
    ]);
    ps.updateProgress(10);
    try {
      ps.addLogLine('Serializing current canvas to disk…');
      ps.updateStepStatus('save', 'done');
      ps.updateStepStatus('load', 'active');
      ps.updateProgress(35);
      apiClient.logEvent('canvas_switch', { fromCanvasId: currentCanvasId, toCanvasId: canvasId, action: 'load' });
      const result = await apiClient.loadSession(canvasId);
      ps.addLogLine(`Loaded "${result.canvasName}" — ${result.state.images?.length ?? 0} images`);
      ps.updateStepStatus('load', 'done');
      ps.updateStepStatus('render', 'active');
      ps.updateProgress(80);
      const s = result.state;
      setMinimapDots([]);
      setMinimapGhostDots([]);
      setIsolatedImageIds(null);
      setImages(s.images ?? []);
      setHistoryGroups(s.history_groups ?? []);
      if (s.axis_labels) setAxisLabels(s.axis_labels);
      if (s.design_brief !== undefined) setDesignBrief(s.design_brief);
      setCurrentCanvasId(result.canvasId);
      setCanvasName(result.canvasName);
      resetCanvasBounds();
      await refreshList();
      ps.updateStepStatus('render', 'done');
      ps.updateProgress(100);
      ps.addLogLine('Canvas ready.');
    } catch (e) {
      alert(`Failed to load canvas: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setIsSwitching(false);
      setTimeout(() => ps.hideProgress(), 800);
    }
  };

  const handleNewCanvas = async () => {
    setIsOpen(false);
    const name = window.prompt('New canvas name:', 'Canvas ' + (canvasList.length + 2));
    if (!name) return;
    cancelPendingSave(); // prevent stale auto-save from firing after switch
    try {
      apiClient.logEvent('canvas_switch', { fromCanvasId: currentCanvasId, action: 'new', newName: name });
      const result = await apiClient.newCanvas(name);
      setMinimapDots([]);
      setMinimapGhostDots([]);
      setIsolatedImageIds(null);
      setImages([]);
      setHistoryGroups([]);
      resetCanvasBounds();
      setCurrentCanvasId(result.canvasId);
      setCanvasName(result.canvasName);
      await refreshList();
    } catch (e) {
      alert(`Failed to create canvas: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  const handleBranch = async () => {
    if (selectedImageIds.length === 0) return;
    setIsOpen(false);
    const name = window.prompt('Branch canvas name:', canvasName + ' – Branch');
    if (!name) return;
    cancelPendingSave(); // prevent stale auto-save from firing after switch
    try {
      const result = await apiClient.branchCanvas(name, selectedImageIds);
      // Reload state from backend after branch
      const loadResult = await apiClient.loadSession(result.canvasId);
      const s = loadResult.state;
      setMinimapDots([]);
      setMinimapGhostDots([]);
      setIsolatedImageIds(null);
      setImages(s.images ?? []);
      setHistoryGroups(s.history_groups ?? []);
      if (s.axis_labels) setAxisLabels(s.axis_labels);
      setCurrentCanvasId(result.canvasId);
      setCanvasName(result.canvasName);
      resetCanvasBounds();
      await refreshList();
    } catch (e) {
      alert(`Failed to branch canvas: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  const handleSaveNow = async () => {
    setSaveStatus('saving');
    try {
      await apiClient.saveSession();
      await refreshList();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 1500);
    } catch {
      setSaveStatus('idle');
    }
  };

  const handleExportZip = () => {
    window.open(`/api/export-zip`, '_blank');
  };

  const handleDeleteCanvas = async (canvasId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this canvas? This cannot be undone.')) return;
    cancelPendingSave(); // prevent stale auto-save if deleting active canvas
    try {
      const result = await apiClient.deleteSession(canvasId);
      // If we deleted the active canvas, backend auto-switched — reload state
      if (result.switchedTo) {
        const freshState = await apiClient.getState();
        const session = await apiClient.getCurrentSession();
        useAppStore.setState({
          images: freshState.images,
          canvasBounds: null,
          currentCanvasId: session.canvasId,
          canvasName: session.canvasName,
        });
        if (freshState.history_groups) useAppStore.getState().setHistoryGroups(freshState.history_groups);
      }
      await refreshList();
    } catch (err) {
      alert(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleNameEdit = async (newName: string) => {
    setIsEditing(false);
    const trimmed = newName.trim();
    if (!trimmed || trimmed === canvasName) return;
    setCanvasName(trimmed);
    try {
      await apiClient.renameCanvas(trimmed);
      await refreshList();
    } catch { /* revert? */ }
  };

  return (
    <div className="canvas-switcher" ref={dropdownRef}>
      {/* Name pill / trigger */}
      {isEditing ? (
        <input
          ref={inputRef}
          className="cs-name-input"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => handleNameEdit(editValue)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleNameEdit(editValue);
            if (e.key === 'Escape') setIsEditing(false);
          }}
        />
      ) : (
        <button
          className={`cs-trigger ${isOpen ? 'cs-trigger-open' : ''} ${isSwitching ? 'cs-switching' : ''}`}
          onClick={() => { if (isInitialized) setIsOpen((o) => !o); }}
          onDoubleClick={() => { if (isInitialized) setIsEditing(true); }}
          title="Click to switch canvas · Double-click to rename"
          disabled={!isInitialized}
        >
          <span className="cs-name">{isSwitching ? 'Loading…' : canvasName}</span>
          <span className="cs-arrow">{isOpen ? '▲' : '▼'}</span>
        </button>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="cs-dropdown">
          {/* Canvas list */}
          <div className="cs-section cs-canvas-list">
            {canvasList.length === 0 ? (
              <div className="cs-empty">No saved canvases yet</div>
            ) : (
              canvasList.map((c) => (
                <div key={c.id} className={`cs-canvas-row ${c.id === currentCanvasId ? 'cs-current' : ''}`}>
                  <button
                    className="cs-row-main"
                    onClick={() => handleSwitchCanvas(c.id)}
                  >
                    <span className="cs-check">{c.id === currentCanvasId ? '✓' : ' '}</span>
                    <span className="cs-row-name">{c.name}</span>
                    <span className="cs-row-count">{c.imageCount} img</span>
                  </button>
                  {c.id !== currentCanvasId && (
                    <button
                      className="cs-row-delete"
                      onClick={(e) => handleDeleteCanvas(c.id, e)}
                      title="Delete canvas"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )))
            }
          </div>

          <div className="cs-sep" />

          {/* Create / branch */}
          <button className="cs-action" onClick={handleNewCanvas}>
            <span className="cs-action-icon">＋</span> New canvas
          </button>
          <button
            className={`cs-action ${selectedImageIds.length === 0 ? 'cs-action-disabled' : ''}`}
            onClick={handleBranch}
            disabled={selectedImageIds.length === 0}
            title={selectedImageIds.length === 0 ? 'Select images first' : `Branch with ${selectedImageIds.length} selected image(s)`}
          >
            <span className="cs-action-icon">⑂</span> Branch from selection
            {selectedImageIds.length > 0 && (
              <span className="cs-badge">{selectedImageIds.length}</span>
            )}
          </button>

        </div>
      )}
    </div>
  );
};
