/**
 * AI Prompt Builder Panel
 *
 * TEXT MODE:
 *   5-column matrix of categorized tags (no horizontal scroll — panel widens to fit)
 *   Tags wrap within columns. Quick prompts section below COMBINES with selected chips.
 *   Quick prompt text highlights any matching category tags with their colors.
 *
 * REFERENCE MODE:
 *   Compact cards for each reference image (no thumbnails, no scroll per card)
 *   Each card shows 5-6 flat descriptor tags as clickable colored pills
 *   Combination prompts rendered with @A/@B colored inline chips + descriptor tag pills
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAppStore } from "../../store/appStore";
import { apiClient } from "../../api/client";
import { renderWithPills, type PillDef } from "../../utils/renderPills";
import type {
  ImageData,
  TagCategory,
  FullPromptSuggestion,
  ReferenceImageAnalysis,
  CombinationPrompt,
} from "../../types";
import "./SuggestionsPanel.css";

// ─── Color System ────────────────────────────────────────────────────────────

export const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  material:   { bg: "rgba(88, 130, 255, 0.13)",  border: "rgba(88, 130, 255, 0.5)",  text: "#8CB4FF" },
  color:      { bg: "rgba(255, 160, 64, 0.13)",   border: "rgba(255, 160, 64, 0.5)",  text: "#FFA040" },
  silhouette: { bg: "rgba(64, 210, 180, 0.13)",   border: "rgba(64, 210, 180, 0.5)",  text: "#40D2B4" },
  style:      { bg: "rgba(200, 100, 255, 0.13)",  border: "rgba(200, 100, 255, 0.5)", text: "#C864FF" },
  details:    { bg: "rgba(255, 100, 120, 0.13)",  border: "rgba(255, 100, 120, 0.5)", text: "#FF6478" },
};

export const REF_IMAGE_COLORS = ["#00d2ff", "#ffa040", "#ff60c0", "#80ff60"];

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface SuggestionsPanelProps {
  onSelectPrompt: (prompt: string) => void;
  /** Text mode: called when user toggles a tag pill */
  onToggleTag?: (tag: string, categoryKey: string, willBeSelected: boolean) => void;
  /** Which tags are currently selected */
  selectedTagSet?: Set<string>;
  /** Reference mode: called when user clicks a descriptor tag */
  onReferenceTagClick?: (tag: string, imageLabel: string) => void;
  referenceImages?: ImageData[];
  /** Called when tag data loads — parent can use for pill rendering */
  onTagsLoaded?: (pills: PillDef[]) => void;
  /** Called when reference analysis loads — parent can use descriptors for @A/@B resolution */
  onRefAnalysisLoaded?: (analysis: ReferenceImageAnalysis[]) => void;
}

// ─── Inline @A/@B chip + descriptor tag renderer for combination prompts ─────

function renderCombinationText(
  text: string,
  analysis: ReferenceImageAnalysis[]
): React.ReactNode[] {
  // Build pill definitions from @mentions + descriptor tags
  const pills: PillDef[] = [];

  // @A, @B, @C, @D mentions
  for (let i = 0; i < Math.min(analysis.length, 4); i++) {
    const label = String.fromCharCode(65 + i);
    pills.push({ text: `@${label}`, color: REF_IMAGE_COLORS[i % REF_IMAGE_COLORS.length] });
  }

  // Also add @A's, @B's possessive forms
  for (let i = 0; i < Math.min(analysis.length, 4); i++) {
    const label = String.fromCharCode(65 + i);
    pills.push({ text: `@${label}'s`, color: REF_IMAGE_COLORS[i % REF_IMAGE_COLORS.length] });
  }

  // Descriptor tags from each shoe — color them with the shoe's color
  for (let i = 0; i < analysis.length; i++) {
    const color = REF_IMAGE_COLORS[i % REF_IMAGE_COLORS.length];
    const raw = analysis[i] as Record<string, unknown>;
    const tags = analysis[i].descriptors
      ?? (raw.tags as string[])
      ?? (raw.key_descriptors as string[])
      ?? [];
    for (const tag of tags) {
      pills.push({ text: tag, color });
    }
  }

  return renderWithPills(text, pills);
}

// ─── Build pill defs from categories for text mode ───────────────────────────

function buildCategoryPills(categories: TagCategory[]): PillDef[] {
  const pills: PillDef[] = [];
  for (const cat of categories) {
    const catKey = cat.name.toLowerCase();
    const col = CATEGORY_COLORS[catKey] ?? CATEGORY_COLORS.details;
    for (const tag of cat.tags) {
      pills.push({ text: tag, color: col.text });
    }
  }
  return pills;
}

// ─── Text Mode ────────────────────────────────────────────────────────────────

const TextMode: React.FC<{
  categories: TagCategory[];
  fullPrompts: FullPromptSuggestion[];
  selectedTagSet: Set<string>;
  onToggleTag: (tag: string, categoryKey: string, willBeSelected: boolean) => void;
  onAppendPrompt: (prompt: string) => void;
}> = ({ categories, fullPrompts, selectedTagSet, onToggleTag, onAppendPrompt }) => {
  // Build pills from all category tags for highlighting in quick prompts
  const categoryPills = buildCategoryPills(categories);

  return (
    <div className="sp-text-mode">
      {/* 5-column matrix — no scroll, wraps within each column */}
      <div className="sp-matrix">
        {categories.map((cat) => {
          const catKey = cat.name.toLowerCase();
          const col = CATEGORY_COLORS[catKey] ?? CATEGORY_COLORS.details;
          return (
            <div key={cat.name} className="sp-matrix-col">
              <div
                className="sp-matrix-col-header"
                style={{ color: col.text, borderBottomColor: col.border }}
              >
                {cat.name}
              </div>
              {cat.tags.map((tag) => {
                const selected = selectedTagSet.has(tag);
                return (
                  <button
                    key={tag}
                    className={`sp-matrix-tag ${selected ? "selected" : ""}`}
                    style={
                      selected
                        ? { background: col.bg, borderColor: col.border, color: col.text }
                        : undefined
                    }
                    onClick={() => onToggleTag(tag, catKey, !selected)}
                    title={selected ? "Remove from prompt" : `Add "${tag}" (${cat.name})`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Quick prompts — APPENDS to free text, doesn't replace chips */}
      {fullPrompts.length > 0 && (
        <div className="sp-section">
          <div className="sp-section-label">Quick Prompts (appends)</div>
          {fullPrompts.map((s, i) => (
            <button
              key={i}
              className="sp-card"
              onClick={() => onAppendPrompt(s.prompt)}
              title={s.reasoning}
            >
              <span className="sp-prompt sp-prompt-rich">
                {renderWithPills(s.prompt, categoryPills)}
              </span>
              <span className="sp-reason">{s.reasoning}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Reference Mode ───────────────────────────────────────────────────────────

const RefMode: React.FC<{
  analysis: ReferenceImageAnalysis[];
  combinationPrompts: CombinationPrompt[];
  onSelectPrompt: (prompt: string) => void;
  onReferenceTagClick?: (tag: string, imageLabel: string) => void;
}> = ({ analysis, combinationPrompts, onSelectPrompt, onReferenceTagClick }) => {
  return (
    <div className="sp-ref-mode">
      {/* Horizontal cards — one per reference image, no thumbnails */}
      <div className="sp-ref-scroll">
        {analysis.map((item, imgIdx) => {
          const baseColor = REF_IMAGE_COLORS[imgIdx % REF_IMAGE_COLORS.length];
          const raw = item as Record<string, unknown>;
          const tags: string[] = item.descriptors
            ?? (raw.tags as string[])
            ?? (raw.key_descriptors as string[])
            ?? [];

          return (
            <div
              key={item.image_id}
              className="sp-ref-img-card"
              style={{ borderColor: hexToRgba(baseColor, 0.35) }}
            >
              <div className="sp-ref-img-label" style={{ color: baseColor }}>
                Image {item.label}
              </div>
              <div className="sp-ref-feat-tags">
                {tags.map((tag) => (
                  <button
                    key={tag}
                    className="sp-ref-feat-tag"
                    style={{
                      color: hexToRgba(baseColor, 0.9),
                      borderColor: hexToRgba(baseColor, 0.45),
                      background: hexToRgba(baseColor, 0.09),
                    }}
                    onClick={() => onReferenceTagClick?.(tag, item.label)}
                    title={`Add from Image ${item.label}`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Combination prompts with @A/@B colored chips + descriptor tag pills */}
      {combinationPrompts.length > 0 && (
        <div className="sp-section">
          <div className="sp-section-label">Suggested Combinations</div>
          {combinationPrompts.map((s, i) => (
            <button
              key={i}
              className="sp-card"
              onClick={() => onSelectPrompt(s.prompt)}
              title={s.reasoning}
            >
              <span className="sp-combo-text">
                {renderCombinationText(s.prompt, analysis)}
              </span>
              <span className="sp-reason">{s.reasoning}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main Panel ────────────────────────────────────────────────────────────────

export const SuggestionsPanel: React.FC<SuggestionsPanelProps> = ({
  onSelectPrompt,
  onToggleTag,
  selectedTagSet = new Set(),
  onReferenceTagClick,
  referenceImages,
  onTagsLoaded,
  onRefAnalysisLoaded,
}) => {
  const designBrief = useAppStore((s) => s.designBrief);

  const isRefMode = !!referenceImages && referenceImages.length > 0;
  const refIds = referenceImages?.map((img) => img.id) ?? [];

  const [categories, setCategories] = useState<TagCategory[]>([]);
  const [fullPrompts, setFullPrompts] = useState<FullPromptSuggestion[]>([]);
  const [refAnalysis, setRefAnalysis] = useState<ReferenceImageAnalysis[]>([]);
  const [combinationPrompts, setCombinationPrompts] = useState<CombinationPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  const refKey = refIds.join(",");

  // Only fetch once on mount — user clicks refresh for subsequent fetches
  const hasFetched = useRef(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(false);
    try {
      const brief = designBrief || "Explore shoe design variations";
      const result = await apiClient.getSuggestTags(
        brief,
        isRefMode ? refIds : [],
        isRefMode ? "reference" : "text"
      );
      if (result.mode === "reference") {
        setRefAnalysis(result.reference_analysis);
        setCombinationPrompts(result.combination_prompts);
        // Expose analysis to parent (for @A/@B resolution during generation)
        onRefAnalysisLoaded?.(result.reference_analysis);
        // Notify parent of available pills for overlay rendering
        if (onTagsLoaded) {
          const pills: PillDef[] = [];
          for (let i = 0; i < result.reference_analysis.length; i++) {
            const color = REF_IMAGE_COLORS[i % REF_IMAGE_COLORS.length];
            const raw = result.reference_analysis[i] as Record<string, unknown>;
            const descs = result.reference_analysis[i].descriptors
              ?? (raw.tags as string[])
              ?? (raw.key_descriptors as string[])
              ?? [];
            for (const t of descs) pills.push({ text: t, color });
          }
          // Also include @A, @B mentions
          for (let i = 0; i < result.reference_analysis.length; i++) {
            const label = String.fromCharCode(65 + i);
            const color = REF_IMAGE_COLORS[i % REF_IMAGE_COLORS.length];
            pills.push({ text: `@${label}`, color });
            pills.push({ text: `@${label}'s`, color });
          }
          onTagsLoaded(pills);
        }
      } else {
        setCategories(result.categories);
        setFullPrompts(result.full_prompts);
        // Notify parent of available category pills
        if (onTagsLoaded) {
          onTagsLoaded(buildCategoryPills(result.categories));
        }
      }
    } catch (e) {
      console.debug("[SuggestionsPanel] Failed to fetch:", e);
      setError(true);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designBrief, refKey, isRefMode]);

  // Fetch only once on mount
  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchData();
    }
  }, [fetchData]);

  // Wrapper: quick prompt APPENDS to free text in parent
  const handleAppendPrompt = (prompt: string) => {
    onSelectPrompt(`__APPEND__${prompt}`);
  };

  return (
    <div className="suggestions-panel">
      <div className="sp-header">
        <span className="sp-title">AI Suggestions</span>
        <button
          className="sp-refresh"
          onClick={fetchData}
          disabled={isLoading}
          title="Refresh suggestions"
        >
          ↺
        </button>
      </div>

      <div className="sp-body">
        {isLoading ? (
          <>
            <div className="sp-skeleton" />
            <div className="sp-skeleton" />
            <div className="sp-skeleton" />
          </>
        ) : error ? (
          <div className="sp-empty">Could not load suggestions</div>
        ) : isRefMode ? (
          refAnalysis.length === 0 ? (
            <div className="sp-empty">No analysis available</div>
          ) : (
            <RefMode
              analysis={refAnalysis}
              combinationPrompts={combinationPrompts}
              onSelectPrompt={onSelectPrompt}
              onReferenceTagClick={onReferenceTagClick}
            />
          )
        ) : categories.length === 0 ? (
          <div className="sp-empty">No suggestions yet</div>
        ) : (
          <TextMode
            categories={categories}
            fullPrompts={fullPrompts}
            selectedTagSet={selectedTagSet}
            onToggleTag={onToggleTag ?? (() => {})}
            onAppendPrompt={handleAppendPrompt}
          />
        )}
      </div>
    </div>
  );
};
