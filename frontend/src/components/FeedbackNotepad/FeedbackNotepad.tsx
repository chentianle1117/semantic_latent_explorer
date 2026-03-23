/**
 * FeedbackNotepad — floating action button that expands into a quick-note popover.
 * Mounts at app root; persists above all canvas layers via z-index 10000.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../../store/appStore';
import { apiClient } from '../../api/client';
import './FeedbackNotepad.css';

const CATEGORIES = [
  { value: 'bug',      label: '🐛 Bug / Technical Issue',     placeholder: 'What went wrong?' },
  { value: 'ai-axes',  label: '🧠 AI & Semantic Axes',         placeholder: 'Did the AI interpret your axis as expected?' },
  { value: 'canvas',   label: '🗺️ Canvas & Organization',      placeholder: 'Thoughts on moving or grouping items?' },
  { value: 'lineage',  label: '🌳 Design Lineage / History',   placeholder: 'How is the family tree tracking working for you?' },
  { value: 'friction', label: '🚧 Workflow Friction',           placeholder: 'What felt difficult or slow just now?' },
  { value: 'aha',      label: '✨ "Aha!" Moment',              placeholder: 'What just sparked a new idea?' },
  { value: 'note',     label: '📝 General Note',               placeholder: 'Write anything you want to remember…' },
];

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

export const FeedbackNotepad: React.FC = () => {
  const participantId = useAppStore((s) => s.participantId);
  const currentCanvasId = useAppStore((s) => s.currentCanvasId);

  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[0].value);
  const [draft, setDraft] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [toast, setToast] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentPlaceholder = CATEGORIES.find(c => c.value === category)?.placeholder ?? '';

  // Auto-focus textarea when opened
  useEffect(() => {
    if (isOpen) setTimeout(() => textareaRef.current?.focus(), 50);
  }, [isOpen]);

  // Close on click-outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false); // draft is preserved in state
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Close on Escape (preserve draft)
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  const handleSubmit = useCallback(async () => {
    if (!draft.trim() || submitState === 'loading') return;
    setSubmitState('loading');
    setErrorMsg('');
    try {
      await apiClient.submitFeedback({
        category,
        content: draft.trim(),
        userId: participantId,
        context: {
          currentRoute: window.location.pathname + window.location.search,
          activeCanvasId: currentCanvasId ?? '',
          browser: navigator.userAgent,
        },
      });
      setSubmitState('success');
      setDraft('');
      setCategory(CATEGORIES[0].value);
      setIsOpen(false);
      // Show toast
      setToast(true);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToast(false), 3000);
    } catch {
      setSubmitState('error');
      setErrorMsg('Failed to save. Please try again.');
    } finally {
      if (submitState !== 'error') setSubmitState('idle');
      setTimeout(() => setSubmitState('idle'), 100);
    }
  }, [draft, category, participantId, currentCanvasId, submitState]);

  // Cmd/Ctrl+Enter to submit
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <>
      {/* Toast */}
      <div className={`fn-toast ${toast ? 'fn-toast-visible' : ''}`}>
        ✓ Note saved! Thanks.
      </div>

      <div className="fn-root" ref={popoverRef}>
        {/* Popover */}
        {isOpen && (
          <div className="fn-popover">
            <div className="fn-header">
              <span className="fn-title">Quick Note</span>
              <button className="fn-close" onClick={() => setIsOpen(false)} title="Close (ESC)">✕</button>
            </div>

            <select
              className="fn-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>

            <textarea
              ref={textareaRef}
              className="fn-textarea"
              placeholder={currentPlaceholder}
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setErrorMsg(''); }}
              onKeyDown={handleKeyDown}
              rows={5}
            />

            {errorMsg && <div className="fn-error">{errorMsg}</div>}

            <div className="fn-footer">
              <span className="fn-hint">⌘↵ to submit</span>
              <button
                className={`fn-submit ${submitState === 'loading' ? 'fn-submit-loading' : ''}`}
                onClick={handleSubmit}
                disabled={!draft.trim() || submitState === 'loading'}
              >
                {submitState === 'loading' ? (
                  <span className="fn-spinner" />
                ) : 'Submit'}
              </button>
            </div>
          </div>
        )}

        {/* FAB */}
        <button
          className={`fn-fab ${isOpen ? 'fn-fab-open' : ''}`}
          onClick={() => setIsOpen(o => !o)}
          title="Quick Notes & Feedback"
          aria-label="Open feedback notepad"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </button>
      </div>
    </>
  );
};
