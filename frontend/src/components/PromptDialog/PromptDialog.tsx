/**
 * Prompt Dialog for Reference-based Generation
 *
 * Features:
 * - Chip-based prompt area with pill overlay for colored tag rendering
 * - @A/@B/@C shorthand for referencing specific images
 * - @mention auto-suggest dropdown (type @ to trigger)
 * - Refine button directly updates prompt text
 * - Descriptor tags from reference analysis shown as colored pills
 */

import React, { useState, useRef, useCallback } from 'react';
import type { ImageData } from '../../types';
import { useAppStore } from '../../store/appStore';
import { apiClient } from '../../api/client';
import { ImageCountSlider } from '../ImageCountSlider/ImageCountSlider';
import { SuggestionsPanel, REF_IMAGE_COLORS } from '../SuggestionsPanel/SuggestionsPanel';
import type { PillDef } from '../../utils/renderPills';
import './PromptDialog.css';
import './PromptDialogRef.css';

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface PromptDialogProps {
  referenceImages: ImageData[];
  onClose: () => void;
  onGenerate: (referenceIds: number[], prompt: string, numImages: number) => void;
}

export const PromptDialog: React.FC<PromptDialogProps> = ({
  referenceImages,
  onClose,
  onGenerate,
}) => {
  // Chips added via tag clicks: tag text → imageLabel ('A', 'B', 'C', 'D')
  const [chipMap, setChipMap] = useState<Map<string, string>>(new Map());
  // Free-form text typed in the textarea (may contain @A/@B mentions)
  const [freeText, setFreeText] = useState('');
  const [numImages, setNumImages] = useState(2);
  const [showMentionDrop, setShowMentionDrop] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // All available pills from SuggestionsPanel (kept for future use)
  const [_availablePills, setAvailablePills] = useState<PillDef[]>([]);

  // Refine state
  const [isRefining, setIsRefining] = useState(false);
  const designBrief = useAppStore((s) => s.designBrief);

  const labels = referenceImages.map((_, i) => String.fromCharCode(65 + i)); // A, B, C...

  // Composed prompt = chips (flat text) + free text, separated by commas
  const composedPrompt = [
    ...Array.from(chipMap.keys()),
    freeText.trim(),
  ].filter(Boolean).join(', ');

  const handleGenerate = () => {
    if (!composedPrompt.trim()) {
      alert('Please enter a prompt or select tags');
      return;
    }
    // Resolve @A/@B/@C shorthand to plain text for the backend
    const resolved = composedPrompt
      .replace(/@A\b/gi, 'the first reference image')
      .replace(/@B\b/gi, 'the second reference image')
      .replace(/@C\b/gi, 'the third reference image')
      .replace(/@D\b/gi, 'the fourth reference image');
    const referenceIds = referenceImages.map(img => img.id);
    onGenerate(referenceIds, resolved, numImages);
  };

  const handleFreeTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setFreeText(val);
    // Show @mention dropdown when the last typed char is @
    const pos = e.target.selectionStart ?? val.length;
    setShowMentionDrop(val[pos - 1] === '@');
  };

  const insertMention = (label: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart ?? freeText.length;
    const before = freeText.slice(0, pos - 1);
    const after = freeText.slice(pos);
    const newText = before + `@${label}` + after;
    setFreeText(newText);
    setShowMentionDrop(false);
    setTimeout(() => {
      ta.focus();
      const newPos = before.length + label.length + 1;
      ta.setSelectionRange(newPos, newPos);
    }, 0);
  };

  // Tag click from reference analysis → add colored chip
  const handleReferenceTagClick = (tag: string, imageLabel: string) => {
    setChipMap(prev => {
      const next = new Map(prev);
      next.set(tag, imageLabel);
      return next;
    });
  };

  // Combination prompt or quick prompt selection from SuggestionsPanel
  const handleSelectPrompt = (prompt: string) => {
    if (prompt.startsWith('__APPEND__')) {
      const text = prompt.slice(10);
      setFreeText(prev => (prev ? `${prev}, ${text}` : text));
    } else {
      setFreeText(prompt);
    }
  };

  const removeChip = (tag: string) => {
    setChipMap(prev => {
      const next = new Map(prev);
      next.delete(tag);
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (showMentionDrop) {
        setShowMentionDrop(false);
      } else {
        onClose();
      }
    }
  };

  // Refine prompt via AI — directly replaces freeText
  const handleRefine = async () => {
    if (!composedPrompt || isRefining) return;
    setIsRefining(true);
    try {
      const tags = Array.from(chipMap.entries()).map(([text, imageLabel]) => {
        const labelIdx = imageLabel.charCodeAt(0) - 65;
        const color = REF_IMAGE_COLORS[labelIdx % REF_IMAGE_COLORS.length];
        return { text, source: imageLabel, color };
      });
      const refIds = referenceImages.map(img => img.id);
      const result = await apiClient.refinePrompt(
        composedPrompt,
        tags,
        refIds,
        designBrief || ''
      );
      // Directly update: clear chips, put refined text in freeText
      setChipMap(new Map());
      setFreeText(result.prompt);
    } catch (e) {
      console.error('Refine failed:', e);
    } finally {
      setIsRefining(false);
    }
  };

  // Callback from SuggestionsPanel
  const handleTagsLoaded = useCallback((pills: PillDef[]) => {
    setAvailablePills(pills);
  }, []);

  const hasChips = chipMap.size > 0;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="prompt-dialog-outer" onClick={(e) => e.stopPropagation()}>

        {/* Left panel: generate form */}
        <div className="dialog prompt-dialog-main">
          <h2>Generate from Reference{referenceImages.length > 1 ? 's' : ''}</h2>

          <div className="dialog-content">
            {/* Reference image thumbnails */}
            <div className="preview-section">
              {referenceImages.length === 1 ? (
                <>
                  <img
                    src={`data:image/png;base64,${referenceImages[0].base64_image}`}
                    alt="Reference"
                    className="reference-preview"
                  />
                  <p className="reference-label">Reference Image #{referenceImages[0].id}</p>
                </>
              ) : (
                <>
                  <div className="reference-grid">
                    {referenceImages.map((img, i) => (
                      <div key={img.id} className="ref-thumb-wrapper">
                        <img
                          src={`data:image/png;base64,${img.base64_image}`}
                          alt={`Reference ${img.id}`}
                          className="reference-thumb"
                          style={{ borderColor: REF_IMAGE_COLORS[i % REF_IMAGE_COLORS.length] }}
                        />
                        <span
                          className="ref-thumb-label"
                          style={{ color: REF_IMAGE_COLORS[i % REF_IMAGE_COLORS.length] }}
                        >
                          @{labels[i]}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="reference-label">{referenceImages.length} Reference Images</p>
                </>
              )}
            </div>

            <div className="input-section">
              <label>Prompt:</label>

              {/* Chip zone + textarea composite */}
              <div className="ttd-prompt-area" style={{ overflow: 'visible' }}>
                {hasChips && (
                  <div className="ttd-chips">
                    {Array.from(chipMap.entries()).map(([tag, imageLabel]) => {
                      const labelIdx = imageLabel.charCodeAt(0) - 65;
                      const color = REF_IMAGE_COLORS[labelIdx % REF_IMAGE_COLORS.length];
                      return (
                        <span
                          key={tag}
                          className="ttd-chip"
                          style={{
                            background: hexToRgba(color, 0.12),
                            borderColor: hexToRgba(color, 0.4),
                            color: hexToRgba(color, 0.9),
                          }}
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

                <div className="ref-textarea-wrapper">
                  <textarea
                    ref={textareaRef}
                    value={freeText}
                    onChange={handleFreeTextChange}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      hasChips
                        ? 'Add more details or type @ to reference...'
                        : (referenceImages.length > 1
                          ? 'e.g. more minimalist, @A sole with @B colors...'
                          : 'e.g. more minimalist, brighter colors...')
                    }
                    rows={hasChips ? 2 : 4}
                    autoFocus
                    className="ttd-textarea no-overlay"
                  />
                  {/* @mention dropdown */}
                  {showMentionDrop && (
                    <div className="ref-mention-drop">
                      {referenceImages.map((_, i) => (
                        <button
                          key={i}
                          className="ref-mention-opt"
                          style={{
                            color: REF_IMAGE_COLORS[i % REF_IMAGE_COLORS.length],
                            borderColor: `${REF_IMAGE_COLORS[i % REF_IMAGE_COLORS.length]}44`,
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            insertMention(labels[i]);
                          }}
                        >
                          @{labels[i]}
                          <span className="ref-mention-opt-desc">Image {labels[i]}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Refine button row */}
                {composedPrompt && (
                  <div className="ttd-refine-row">
                    <button
                      className="ttd-refine-btn"
                      onClick={handleRefine}
                      disabled={isRefining || !composedPrompt}
                      title="AI rewrites your prompt while keeping tag terms"
                    >
                      {isRefining ? 'Refining...' : 'Refine Prompt'}
                    </button>
                  </div>
                )}
              </div>

              {referenceImages.length > 1 && (
                <p className="ref-hint">Click tags to add colored chips · type @ to reference a specific image</p>
              )}

              <ImageCountSlider
                value={numImages}
                onChange={setNumImages}
                label="Number of Variations"
              />
            </div>
          </div>

          <div className="dialog-actions">
            <button onClick={onClose}>Cancel</button>
            <button
              className="primary"
              onClick={handleGenerate}
              disabled={!composedPrompt.trim()}
            >
              Generate
            </button>
          </div>
        </div>

        {/* Right panel: Reference Analysis */}
        <div className="dialog prompt-dialog-suggestions">
          <SuggestionsPanel
            onSelectPrompt={handleSelectPrompt}
            referenceImages={referenceImages}
            onReferenceTagClick={handleReferenceTagClick}
            onTagsLoaded={handleTagsLoaded}
          />
        </div>

      </div>
    </div>
  );
};
