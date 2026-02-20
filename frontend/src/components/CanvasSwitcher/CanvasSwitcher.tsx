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
import { apiClient } from '../../api/client';
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
    setIsOpen(false);
    setIsSwitching(true);
    try {
      const result = await apiClient.loadSession(canvasId);
      const s = result.state;
      setImages(s.images ?? []);
      setHistoryGroups(s.history_groups ?? []);
      if (s.axis_labels) setAxisLabels(s.axis_labels);
      if (s.design_brief !== undefined) setDesignBrief(s.design_brief);
      setCurrentCanvasId(result.canvasId);
      setCanvasName(result.canvasName);
      resetCanvasBounds();
      await refreshList();
    } catch (e) {
      alert(`Failed to load canvas: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setIsSwitching(false);
    }
  };

  const handleNewCanvas = async () => {
    setIsOpen(false);
    const name = window.prompt('New canvas name:', 'Canvas ' + (canvasList.length + 2));
    if (!name) return;
    try {
      const result = await apiClient.newCanvas(name);
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
    try {
      const result = await apiClient.branchCanvas(name, selectedImageIds);
      // Reload state from backend after branch
      const loadResult = await apiClient.loadSession(result.canvasId);
      const s = loadResult.state;
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
    const port = window.location.port || '8000';
    const base = `http://localhost:${port}/api`;
    window.open(`${base}/export-zip`, '_blank');
    setIsOpen(false);
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
                <button
                  key={c.id}
                  className={`cs-canvas-row ${c.id === currentCanvasId ? 'cs-current' : ''}`}
                  onClick={() => handleSwitchCanvas(c.id)}
                >
                  <span className="cs-check">{c.id === currentCanvasId ? '✓' : ' '}</span>
                  <span className="cs-row-name">{c.name}</span>
                  <span className="cs-row-count">{c.imageCount} img</span>
                </button>
              ))
            )}
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

          <div className="cs-sep" />

          {/* Save / export */}
          <button className="cs-action" onClick={handleSaveNow}>
            <span className="cs-action-icon">↑</span>
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved ✓' : 'Save now'}
          </button>
          <button className="cs-action" onClick={handleExportZip}>
            <span className="cs-action-icon">↓</span> Export ZIP
          </button>
        </div>
      )}
    </div>
  );
};
