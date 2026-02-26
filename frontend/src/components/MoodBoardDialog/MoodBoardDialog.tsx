/**
 * Mood Board Generation Dialog
 *
 * Lets users generate concept sketches, mood boards, and design explorations
 * using various style presets. Supports optional style reference upload.
 *
 * Context-aware title based on selectedRealmContext:
 *   - null / no refs:  "New Mood Board"
 *   - shoe refs:       "Abstract from Shoes"
 *   - mood board refs: "Iterate on Board"
 *   - mixed refs:      "Abstract from Selection"
 */

import React, { useState, useCallback, useRef } from 'react';
import { useAppStore } from '../../store/appStore';
import { apiClient } from '../../api/client';
import { falClient, MOOD_BOARD_STYLES } from '../../api/falClient';
import { SuggestionsPanel, CATEGORY_COLORS } from '../SuggestionsPanel/SuggestionsPanel';
import { ImageCountSlider } from '../ImageCountSlider/ImageCountSlider';
import type { ImageData } from '../../types';
import type { PillDef } from '../../utils/renderPills';
import '../PromptDialog/PromptDialog.css';
import '../PromptDialog/PromptDialogRef.css';
import './MoodBoardDialog.css';

interface MoodBoardDialogProps {
  onClose: () => void;
  /** prompt, count, style key, optional uploaded style-ref URL */
  onGenerate: (prompt: string, count: number, style: string, styleRefUrl?: string) => void;
  /** Images selected on canvas — drives title + suggestion mode */
  referenceImages?: ImageData[];
  selectedRealmContext?: 'shoe' | 'mood-board' | 'mixed' | null;
}

const STYLE_KEYS = Object.keys(MOOD_BOARD_STYLES) as Array<keyof typeof MOOD_BOARD_STYLES>;

export const MoodBoardDialog: React.FC<MoodBoardDialogProps> = ({
  onClose,
  onGenerate,
  referenceImages = [],
  selectedRealmContext = null,
}) => {
  const [style, setStyle] = useState<string>('concept-sheet');
  const [styleRefUrl, setStyleRefUrl] = useState<string | null>(null);
  const [styleRefPreview, setStyleRefPreview] = useState<string | null>(null);
  const [isUploadingRef, setIsUploadingRef] = useState(false);

  const [selectedTags, setSelectedTags] = useState<Map<string, string>>(new Map());
  const [freeText, setFreeText] = useState('');
  const [imageCount, setImageCount] = useState(2);
  const [_availablePills, setAvailablePills] = useState<PillDef[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const designBrief = useAppStore((s) => s.designBrief);

  // Context-aware title
  const title =
    selectedRealmContext === 'shoe' || selectedRealmContext === 'mixed'
      ? 'Abstract from Shoes'
      : referenceImages.length > 0
      ? 'Iterate on Board'
      : 'New Mood Board';

  const composedPrompt = [
    ...Array.from(selectedTags.keys()),
    freeText.trim(),
  ]
    .filter(Boolean)
    .join(', ');

  const handleSubmit = () => {
    const prompt = composedPrompt || (designBrief ?? '');
    if (!prompt) {
      alert('Please enter a prompt or select tags');
      return;
    }
    onGenerate(prompt, imageCount, style, styleRefUrl ?? undefined);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit();
    if (e.key === 'Escape') onClose();
  };

  const handleToggleTag = (tag: string, categoryKey: string, willBeSelected: boolean) => {
    setSelectedTags((prev) => {
      const next = new Map(prev);
      if (willBeSelected) next.set(tag, categoryKey);
      else next.delete(tag);
      return next;
    });
  };

  const handleSelectPrompt = (prompt: string) => {
    if (prompt.startsWith('__APPEND__')) {
      const text = prompt.slice(10);
      setFreeText((prev) => (prev ? `${prev}, ${text}` : text));
    } else {
      setSelectedTags(new Map());
      setFreeText(prompt);
    }
  };

  const removeChip = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Map(prev);
      next.delete(tag);
      return next;
    });
  };

  const handleTagsLoaded = useCallback((pills: PillDef[]) => {
    setAvailablePills(pills);
  }, []);

  // When a reference descriptor tag is clicked, add it to freeText
  const handleReferenceTagClick = useCallback((tag: string, _imageLabel: string) => {
    setFreeText((prev) => (prev ? `${prev}, ${tag}` : tag));
  }, []);

  // Refine prompt via AI — directly replaces freeText
  const [isRefining, setIsRefining] = useState(false);
  const handleRefine = async () => {
    if (!composedPrompt || isRefining) return;
    setIsRefining(true);
    try {
      const tags = Array.from(selectedTags.entries()).map(([text, catKey]) => ({
        text,
        source: catKey,
        color: CATEGORY_COLORS[catKey]?.text ?? '#FF6B2B',
      }));
      const result = await apiClient.refinePrompt(
        composedPrompt,
        tags,
        [],
        designBrief || '',
        'mood-board'
      );
      // Replace chips with refined text
      setSelectedTags(new Map());
      setFreeText(result.prompt);
    } catch (e) {
      console.error('Refine failed:', e);
    } finally {
      setIsRefining(false);
    }
  };

  // Style reference image upload
  const handleRefFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingRef(true);
    try {
      // Show local preview immediately
      const reader = new FileReader();
      reader.onload = (ev) => setStyleRefPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
      // Upload to fal.ai storage
      const url = await falClient.uploadFile(file);
      setStyleRefUrl(url);
    } catch (err) {
      console.error('Style ref upload failed:', err);
      alert('Failed to upload reference image. Check console for details.');
    } finally {
      setIsUploadingRef(false);
    }
  };

  const clearStyleRef = () => {
    setStyleRefUrl(null);
    setStyleRefPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const hasChips = selectedTags.size > 0;

  return (
    <div className="dialog-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="prompt-dialog-outer mbd-outer"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* ── Left panel ────────────────────────────────────────────────── */}
        <div className="dialog prompt-dialog-main mbd-main">
          <h2 className="mbd-title">{title}</h2>

          {/* ── Reference image thumbnails (when images are selected) ──── */}
          {referenceImages.length > 0 && (
            <div className="mbd-section">
              <label className="mbd-label">
                Reference Images
                <span className="mbd-label-hint"> ({referenceImages.length} selected — will be used as design inspiration)</span>
              </label>
              <div className="mbd-ref-thumbs">
                {referenceImages.slice(0, 4).map((img, idx) => (
                  <div key={img.id} className="mbd-ref-thumb-item">
                    <img
                      src={`data:image/png;base64,${img.base64_image}`}
                      alt={`Reference ${String.fromCharCode(65 + idx)}`}
                      className="mbd-ref-thumb-img"
                      style={{
                        borderColor: ['#00d2ff', '#ffa040', '#ff60c0', '#80ff60'][idx % 4],
                      }}
                    />
                    <span
                      className="mbd-ref-thumb-label"
                      style={{
                        color: ['#00d2ff', '#ffa040', '#ff60c0', '#80ff60'][idx % 4],
                      }}
                    >
                      {String.fromCharCode(65 + idx)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Style preset pills ─────────────────────────────────────── */}
          <div className="mbd-section">
            <label className="mbd-label">Style Preset</label>
            <div className="mbd-style-pills">
              {STYLE_KEYS.map((key) => (
                <button
                  key={key}
                  className={`mbd-style-pill${style === key ? ' selected' : ''}`}
                  onClick={() => setStyle(key)}
                  title={MOOD_BOARD_STYLES[key].prompt.slice(0, 80) + '…'}
                >
                  {MOOD_BOARD_STYLES[key].label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Optional style reference upload ────────────────────────── */}
          <div className="mbd-section">
            <label className="mbd-label">
              Style Reference
              <span className="mbd-label-hint"> (optional — image to inspire the style)</span>
            </label>
            {styleRefPreview ? (
              <div className="mbd-ref-preview">
                <img src={styleRefPreview} alt="Style reference" className="mbd-ref-img" />
                <button className="mbd-ref-clear" onClick={clearStyleRef} title="Remove reference">
                  ×
                </button>
                {isUploadingRef && <span className="mbd-ref-uploading">Uploading…</span>}
              </div>
            ) : (
              <div
                className={`mbd-ref-dropzone${isUploadingRef ? ' uploading' : ''}`}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploadingRef ? (
                  <span>Uploading…</span>
                ) : (
                  <>
                    <span className="mbd-ref-icon">+</span>
                    <span>Click to add a reference image</span>
                  </>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleRefFileChange}
            />
          </div>

          {/* ── Prompt area (chip + freetext) ──────────────────────────── */}
          <div className="input-section" style={{ flex: 1 }}>
            <label>Concept Prompt</label>
            <div className="ttd-prompt-area">
              {hasChips && (
                <div className="ttd-chips">
                  {Array.from(selectedTags.entries()).map(([tag, catKey]) => {
                    const col = CATEGORY_COLORS[catKey] ?? CATEGORY_COLORS.details;
                    return (
                      <span
                        key={tag}
                        className="ttd-chip"
                        style={{ background: col.bg, borderColor: col.border, color: col.text }}
                      >
                        {tag}
                        <button
                          className="ttd-chip-remove"
                          onClick={() => removeChip(tag)}
                          title="Remove"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              <textarea
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  hasChips
                    ? 'Add more concept details…'
                    : 'Describe the concept, feeling, or design direction…'
                }
                rows={hasChips ? 2 : 3}
                autoFocus={!hasChips}
                className="ttd-textarea no-overlay"
              />

              {/* Refine button row */}
              {composedPrompt && (
                <div className="ttd-refine-row">
                  <button
                    className="ttd-refine-btn"
                    onClick={handleRefine}
                    disabled={isRefining || !composedPrompt}
                    title="AI rewrites your concept prompt while keeping tag terms"
                  >
                    {isRefining ? 'Refining...' : 'Refine Prompt'}
                  </button>
                </div>
              )}
            </div>

            <ImageCountSlider
              value={imageCount}
              onChange={setImageCount}
              label="Number of Boards"
            />
          </div>

          <div className="dialog-actions">
            <button onClick={onClose}>Cancel</button>
            <button
              className="primary mbd-generate-btn"
              onClick={handleSubmit}
              disabled={!composedPrompt && !designBrief}
            >
              Generate {imageCount} Board{imageCount > 1 ? 's' : ''}
            </button>
          </div>
        </div>

        {/* ── Right panel: AI Suggestions (mood-board mode) ─────────────── */}
        <div className="dialog prompt-dialog-suggestions">
          <SuggestionsPanel
            onSelectPrompt={handleSelectPrompt}
            onToggleTag={handleToggleTag}
            selectedTagSet={new Set(selectedTags.keys())}
            onTagsLoaded={handleTagsLoaded}
            onReferenceTagClick={handleReferenceTagClick}
            referenceImages={referenceImages.length > 0 ? referenceImages : undefined}
            mode="mood-board"
          />
        </div>
      </div>
    </div>
  );
};
