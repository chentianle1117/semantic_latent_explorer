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

import React, { useState, useRef, useCallback, useMemo } from 'react';
import type { ImageData, ReferenceImageAnalysis } from '../../types';
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
  onGenerate: (referenceIds: number[], prompt: string, numImages: number, shoeType?: string) => void;
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
  const [dropdownIdx, setDropdownIdx] = useState(0);
  const [textScrollTop, setTextScrollTop] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // All available pills from SuggestionsPanel (kept for future use)
  const [_availablePills, setAvailablePills] = useState<PillDef[]>([]);

  // Shoe type override — highest-priority hard constraint, pre-filled from AI context
  const briefFields = useAppStore((s) => s.briefFields);
  const [shoeType, setShoeType] = useState(
    () => briefFields.find(f => f.key === 'shoe_type')?.value?.trim() ?? ''
  );

  // Reference analysis — loaded from SuggestionsPanel, used to expand @A/@B at generation time
  const [refAnalysis, setRefAnalysis] = useState<ReferenceImageAnalysis[]>([]);

  // Refine state
  const [isRefining, setIsRefining] = useState(false);
  // Snapshot before refine — allows undo
  const [preRefineState, setPreRefineState] = useState<{
    freeText: string;
    chipMap: Map<string, string>;
  } | null>(null);
  const designBrief = useAppStore((s) => s.designBrief);

  // Tutorial guide
  const onboardingSpotlight = useAppStore((s) => s.onboardingSpotlight);
  const [guideDismissed, setGuideDismissed] = useState(false);
  const showTutorialGuide = !guideDismissed && onboardingSpotlight === 'b-gen-ref';

  const labels = referenceImages.map((_, i) => String.fromCharCode(65 + i)); // A, B, C...

  // Active mention labels in freeText — drives overlay highlight + thumbnail pulse
  const activeMentionLabels = useMemo(() => {
    const s = new Set<string>();
    const re = /@([A-D])/gi;
    let m;
    while ((m = re.exec(freeText)) !== null) s.add(m[1].toUpperCase());
    return s;
  }, [freeText]);
  const hasMentions = activeMentionLabels.size > 0 && referenceImages.length > 1;

  // Render freeText with colored spans for @A/@B/@C/@D mentions
  const highlightMentions = (text: string): React.ReactNode[] => {
    if (!text) return [''];
    const re = /@([A-D])(?:'s)?/gi;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      const labelIdx = match[1].toUpperCase().charCodeAt(0) - 65;
      if (labelIdx >= referenceImages.length) continue;
      if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
      parts.push(
        <span key={match.index} style={{ color: REF_IMAGE_COLORS[labelIdx] }}>
          {match[0]}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return parts;
  };

  // Composed prompt = chips (flat text) + free text, separated by commas
  const composedPrompt = [
    ...Array.from(chipMap.keys()),
    freeText.trim(),
  ].filter(Boolean).join(', ');

  const handleGenerate = () => {
    // Require finalized prompt: tags alone are not enough — user must type or refine first
    if (!freeText.trim()) {
      return; // Generate button will be disabled; this is a safety guard
    }
    if (!composedPrompt.trim()) return;

    // Expand @A/@B/@C/@D using descriptor lists from the reference analysis,
    // so the fal.ai model gets concrete visual descriptions instead of generic labels.
    let resolved = composedPrompt;
    for (const item of refAnalysis) {
      const label = item.label; // 'A', 'B', 'C', 'D'
      const descriptors = item.descriptors?.join(', ') || `reference image ${label}`;
      resolved = resolved
        .replace(new RegExp(`@${label}'s\\b`, 'gi'), `${descriptors}'s`)
        .replace(new RegExp(`@${label}\\b`, 'gi'), descriptors);
    }
    // Fallback for any @X not covered by analysis — only resolve labels that have actual images
    const fallbackLabels = ['the first reference image', 'the second reference image', 'the third reference image', 'the fourth reference image'];
    for (let i = 0; i < referenceImages.length; i++) {
      const lbl = String.fromCharCode(65 + i);
      resolved = resolved
        .replace(new RegExp(`@${lbl}'s\\b`, 'gi'), `${fallbackLabels[i]}'s`)
        .replace(new RegExp(`@${lbl}\\b`, 'gi'), fallbackLabels[i]);
    }
    // Strip any remaining @X references that don't correspond to actual images
    resolved = resolved.replace(/@[A-D]'s\b/gi, 'the reference image\'s').replace(/@[A-D]\b/gi, 'the reference image');

    const referenceIds = referenceImages.map(img => img.id);
    onGenerate(referenceIds, resolved, numImages, shoeType.trim() || undefined);
  };

  const handleFreeTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setFreeText(val);
    const pos = e.target.selectionStart ?? val.length;
    const showDrop = val[pos - 1] === '@';
    setShowMentionDrop(showDrop);
    if (showDrop) setDropdownIdx(0);
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
    if (showMentionDrop && referenceImages.length > 1) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setDropdownIdx(i => (i + 1) % referenceImages.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setDropdownIdx(i => (i - 1 + referenceImages.length) % referenceImages.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        insertMention(labels[dropdownIdx]);
        return;
      }
      if (e.key === 'Escape') {
        setShowMentionDrop(false);
        return;
      }
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleTextareaScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    setTextScrollTop((e.target as HTMLTextAreaElement).scrollTop);
  };

  // Refine prompt via AI — directly replaces freeText
  const handleRefine = async () => {
    if (!composedPrompt || isRefining) return;
    // Snapshot current state for undo
    setPreRefineState({ freeText, chipMap: new Map(chipMap) });
    setIsRefining(true);
    try {
      const tags = Array.from(chipMap.entries()).map(([text, imageLabel]) => {
        const labelIdx = imageLabel.charCodeAt(0) - 65;
        const color = REF_IMAGE_COLORS[labelIdx % REF_IMAGE_COLORS.length];
        return { text, source: imageLabel, color };
      });

      // For multiple references: pre-attribute chip tags with @A's/@B's notation.
      // For single reference: just use the tag text directly (no @A labels needed).
      const preAttributedChips = referenceImages.length > 1
        ? Array.from(chipMap.entries()).map(([text, imageLabel]) => `@${imageLabel}'s ${text}`)
        : Array.from(chipMap.keys());
      const preAttributedPrompt = [...preAttributedChips, freeText.trim()]
        .filter(Boolean)
        .join(', ');

      const refIds = referenceImages.map(img => img.id);
      const genMode = referenceImages.length >= 2 ? 'multi-ref' : 'single-ref';
      const result = await apiClient.refinePrompt(
        preAttributedPrompt,
        tags,
        refIds,
        designBrief || '',
        'shoe',
        genMode
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

  const handleUndoRefine = () => {
    if (!preRefineState) return;
    setFreeText(preRefineState.freeText);
    setChipMap(preRefineState.chipMap);
    setPreRefineState(null);
  };

  // Callback from SuggestionsPanel
  const handleTagsLoaded = useCallback((pills: PillDef[]) => {
    setAvailablePills(pills);
  }, []);

  const hasChips = chipMap.size > 0;

  return (
    <div className="dialog-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="prompt-dialog-outer" data-tour="gen-dialog-ref" onClick={(e) => e.stopPropagation()}>

        {/* Left panel: generate form */}
        <div className="dialog prompt-dialog-main">
          <h2>Generate from Reference{referenceImages.length > 1 ? 's' : ''}</h2>

          {/* ── Shoe Type override — highest-priority constraint ── */}
          <div className="shoe-type-row" title="This overrides the AI context shoe type for this generation only">
            <span className="shoe-type-icon">⚡</span>
            <label className="shoe-type-label">Shoe Type</label>
            <input
              type="text"
              className="shoe-type-input"
              placeholder="slide, trail runner, sneaker…"
              value={shoeType}
              onChange={e => setShoeType(e.target.value)}
            />
          </div>

          {/* ── Tutorial guide banner ── */}
          {showTutorialGuide && (
            <div className="ttd-guide" role="note" aria-label="Tutorial: how to generate from references">
              <div className="ttd-guide-header">
                <span>🎓</span>
                <strong>How to generate from references</strong>
                <button className="ttd-guide-dismiss" onClick={() => setGuideDismissed(true)} title="Dismiss">×</button>
              </div>
              <ol className="ttd-guide-steps">
                <li>
                  <strong>Your reference {referenceImages.length === 1 ? 'shoe is' : 'shoes are'}</strong> shown above{referenceImages.length > 1 ? <> — each is labeled{' '}
                  {labels.map((lbl, i) => (
                    <span
                      key={lbl}
                      style={{
                        display: 'inline-block',
                        padding: '1px 6px',
                        borderRadius: 3,
                        fontSize: 9,
                        fontWeight: 700,
                        marginLeft: 3,
                        background: `${REF_IMAGE_COLORS[i % REF_IMAGE_COLORS.length]}22`,
                        border: `1px solid ${REF_IMAGE_COLORS[i % REF_IMAGE_COLORS.length]}88`,
                        color: REF_IMAGE_COLORS[i % REF_IMAGE_COLORS.length],
                      }}
                    >@{lbl}</span>
                  ))}</> : null}.
                </li>
                <li>
                  <strong>Right panel — Descriptor Tags</strong>: The AI has analyzed {referenceImages.length === 1 ? 'the shoe' : 'each shoe'}.
                  Click colored descriptor tags to add them to your prompt as chips.
                </li>
                <li>
                  <strong>Text box</strong>: Describe what you want.{referenceImages.length > 1 ? <> Type <code>@</code> to reference
                  a specific shoe (e.g. <em>@A's sole with @B's colors</em>).</> : <> Describe variations you'd like
                  (e.g. <em>chunkier sole, brighter colors</em>).</>}
                </li>
                <li>
                  Click <strong>Refine Prompt</strong> to let the AI weave your chips and text
                  into a polished prompt.
                </li>
                <li>
                  Click <strong>Generate</strong> — results may {referenceImages.length > 1 ? 'blend references in unexpected and creative ways' : 'explore variations of your reference'}!
                </li>
              </ol>
            </div>
          )}

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
                    {referenceImages.map((img, i) => {
                      const isActive = activeMentionLabels.has(labels[i]);
                      const color = REF_IMAGE_COLORS[i % REF_IMAGE_COLORS.length];
                      return (
                        <div key={img.id} className={`ref-thumb-wrapper${isActive ? ' ref-thumb-active' : ''}`}>
                          <img
                            src={`data:image/png;base64,${img.base64_image}`}
                            alt={`Reference ${img.id}`}
                            className="reference-thumb"
                            style={{
                              borderColor: color,
                              ...(isActive ? { boxShadow: `0 0 10px ${color}80, 0 0 20px ${color}40` } : {}),
                            }}
                          />
                          <span
                            className={`ref-thumb-label${isActive ? ' ref-thumb-label--active' : ''}`}
                            style={{ color }}
                          >
                            @{labels[i]}
                          </span>
                        </div>
                      );
                    })}
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
                    onScroll={handleTextareaScroll}
                    placeholder={
                      hasChips
                        ? 'Add more details...'
                        : (referenceImages.length > 1
                          ? 'e.g. @A\'s sole with @B\'s colors, more minimalist...'
                          : 'e.g. make it more minimalist, chunkier sole, brighter colors...')
                    }
                    rows={hasChips ? 2 : 4}
                    autoFocus
                    className="ttd-textarea"
                    style={hasMentions ? { color: 'transparent', caretColor: 'rgba(200, 210, 220, 0.9)' } : undefined}
                  />
                  {/* Inline syntax highlight overlay — shows colored @A/@B spans */}
                  {hasMentions && (
                    <div ref={overlayRef} className="ref-highlight-overlay" aria-hidden>
                      <div
                        className="ref-highlight-overlay-inner"
                        style={{ transform: `translateY(-${textScrollTop}px)` }}
                      >
                        {highlightMentions(freeText)}
                      </div>
                    </div>
                  )}
                  {/* @mention dropdown — only when multiple references */}
                  {showMentionDrop && referenceImages.length > 1 && (
                    <div className="ref-mention-drop">
                      {referenceImages.map((img, i) => (
                        <button
                          key={i}
                          className={`ref-mention-opt${dropdownIdx === i ? ' ref-mention-opt--active' : ''}`}
                          style={{
                            color: REF_IMAGE_COLORS[i % REF_IMAGE_COLORS.length],
                            borderColor: `${REF_IMAGE_COLORS[i % REF_IMAGE_COLORS.length]}44`,
                            background: dropdownIdx === i
                              ? `${REF_IMAGE_COLORS[i % REF_IMAGE_COLORS.length]}18`
                              : undefined,
                          }}
                          onMouseEnter={() => setDropdownIdx(i)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            insertMention(labels[i]);
                          }}
                        >
                          <img
                            src={`data:image/png;base64,${img.base64_image}`}
                            alt=""
                            className="ref-mention-thumb"
                          />
                          @{labels[i]}
                          <span className="ref-mention-opt-desc">Image {labels[i]}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Refine button row */}
                {(composedPrompt || preRefineState) && (
                  <div className="ttd-refine-row">
                    <button
                      className={`ttd-refine-btn${showTutorialGuide ? ' ttd-btn-pulse' : ''}`}
                      onClick={handleRefine}
                      disabled={isRefining || !composedPrompt}
                      title="AI rewrites your prompt while keeping tag terms"
                    >
                      {isRefining ? 'Refining...' : 'Refine Prompt'}
                    </button>
                    {preRefineState && (
                      <button
                        className="ttd-refine-btn ttd-undo-btn"
                        onClick={handleUndoRefine}
                        title="Revert to your original prompt before refinement"
                      >
                        Undo Refine
                      </button>
                    )}
                  </div>
                )}
              </div>

              {referenceImages.length > 1 && (
                <p className="ref-hint">Click tags to add colored chips · type @ to reference a specific image</p>
              )}

              {/* Refine gate: warn when user has chips but hasn't finalized prompt */}
              {chipMap.size > 0 && !freeText.trim() && (
                <p className="ref-refine-gate">
                  Click <strong>Refine Prompt</strong> to build your prompt from the selected tags, or type directly in the field above.
                </p>
              )}

              <ImageCountSlider
                value={numImages}
                onChange={setNumImages}
                label="Number of Variations"
              />

            </div>
          </div>

          <div className="dialog-actions">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(150,165,180,0.7)', cursor: 'pointer', marginRight: 'auto' }}>
              <input
                type="checkbox"
                checked={useAppStore.getState().concurrentGhostsEnabled}
                onChange={(e) => useAppStore.getState().setConcurrentGhostsEnabled(e.target.checked)}
                style={{ accentColor: '#58a6ff' }}
              />
              AI alternative
            </label>
            <button onClick={onClose}>Cancel</button>
            <button
              className={`primary${showTutorialGuide && freeText.trim() ? ' ttd-btn-pulse' : ''}`}
              onClick={handleGenerate}
              disabled={!freeText.trim()}
              title={!freeText.trim() ? 'Type a prompt or click Refine Prompt first' : undefined}
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
            onRefAnalysisLoaded={setRefAnalysis}
          />
        </div>

      </div>
    </div>
  );
};
