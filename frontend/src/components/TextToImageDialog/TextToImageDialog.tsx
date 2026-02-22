import React, { useState, useCallback } from 'react';
import { useAppStore } from '../../store/appStore';
import { apiClient } from '../../api/client';
import { ImageCountSlider } from '../ImageCountSlider/ImageCountSlider';
import { SuggestionsPanel, CATEGORY_COLORS } from '../SuggestionsPanel/SuggestionsPanel';
import type { PillDef } from '../../utils/renderPills';
import '../PromptDialog/PromptDialog.css';
import './TextToImageDialog.css';

interface TextToImageDialogProps {
  onClose: () => void;
  onGenerate: (prompt: string, count: number) => void;
}

export const TextToImageDialog: React.FC<TextToImageDialogProps> = ({
  onClose,
  onGenerate,
}) => {
  // Selected tag chips: tag text → category key
  const [selectedTags, setSelectedTags] = useState<Map<string, string>>(new Map());
  // Free-form additional text
  const [freeText, setFreeText] = useState('');
  const [imageCount, setImageCount] = useState(2);

  // All available pills from SuggestionsPanel (kept for future use)
  const [_availablePills, setAvailablePills] = useState<PillDef[]>([]);

  // Refine state
  const [isRefining, setIsRefining] = useState(false);
  const designBrief = useAppStore((s) => s.designBrief);

  // The actual prompt composed from chips + free text
  const composedPrompt = [
    ...Array.from(selectedTags.keys()),
    freeText.trim(),
  ].filter(Boolean).join(', ');

  const handleSubmit = () => {
    if (!composedPrompt) {
      alert('Please enter a prompt or select tags');
      return;
    }
    onGenerate(composedPrompt, imageCount);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit();
    if (e.key === 'Escape') onClose();
  };

  // Called by SuggestionsPanel when a tag pill is clicked
  const handleToggleTag = (tag: string, categoryKey: string, willBeSelected: boolean) => {
    setSelectedTags((prev) => {
      const next = new Map(prev);
      if (willBeSelected) {
        next.set(tag, categoryKey);
      } else {
        next.delete(tag);
      }
      return next;
    });
  };

  // Called by SuggestionsPanel quick prompt click
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

  // Refine prompt via AI — directly replaces freeText
  const handleRefine = async () => {
    if (!composedPrompt || isRefining) return;
    setIsRefining(true);
    try {
      const tags = Array.from(selectedTags.entries()).map(([text, catKey]) => ({
        text,
        source: catKey,
        color: CATEGORY_COLORS[catKey]?.text ?? '#8CB4FF',
      }));
      const result = await apiClient.refinePrompt(
        composedPrompt,
        tags,
        [],
        designBrief || ''
      );
      // Directly update: clear chips, put refined text in freeText
      setSelectedTags(new Map());
      setFreeText(result.prompt);
    } catch (e) {
      console.error('Refine failed:', e);
    } finally {
      setIsRefining(false);
    }
  };

  // Callback from SuggestionsPanel: all available pills for overlay
  const handleTagsLoaded = useCallback((pills: PillDef[]) => {
    setAvailablePills(pills);
  }, []);

  const hasChips = selectedTags.size > 0;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="prompt-dialog-outer" onClick={(e) => e.stopPropagation()}>

        {/* Left panel: chip prompt area + count */}
        <div className="dialog prompt-dialog-main">
          <h2>Generate from Text</h2>

          <div className="input-section" style={{ flex: 1 }}>
            <label>Prompt</label>

            {/* Chip zone + textarea composite */}
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
                    ? 'Add more details...'
                    : "Describe the shoe design... or click tags on the right"
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
                    title="AI rewrites your prompt while keeping tag terms"
                  >
                    {isRefining ? 'Refining...' : 'Refine Prompt'}
                  </button>
                </div>
              )}
            </div>

            <ImageCountSlider
              value={imageCount}
              onChange={setImageCount}
              label="Number of Images"
            />
          </div>

          <div className="dialog-actions">
            <button onClick={onClose}>Cancel</button>
            <button
              className="primary"
              onClick={handleSubmit}
              disabled={!composedPrompt}
            >
              Generate {imageCount} Image{imageCount > 1 ? 's' : ''}
            </button>
          </div>
        </div>

        {/* Right panel: AI suggestions */}
        <div className="dialog prompt-dialog-suggestions">
          <SuggestionsPanel
            onSelectPrompt={handleSelectPrompt}
            onToggleTag={handleToggleTag}
            selectedTagSet={new Set(selectedTags.keys())}
            onTagsLoaded={handleTagsLoaded}
          />
        </div>

      </div>
    </div>
  );
};
