/**
 * Onboarding tutorial step definitions — v5
 *
 * 4 color-coded sections, 36 steps:
 *   A  UI Layout   — 11 steps (includes Load Files)
 *   B  Generation  — 5 steps
 *   C  Utilities   — 16 steps (includes Axis Tuning)
 *   D  AI Agent    — 4 steps
 *
 * Steps with `dialButtonId` use two-phase spotlight:
 *   Phase A (dial closed) → spotlight canvas, instruction = "Press Space"
 *   Phase B (dial open)   → spotlight the dial button, instruction = dialInstruction
 */

// ─── Section types ───────────────────────────────────────────────────────────

export type SectionKey = 'a' | 'b' | 'c' | 'd';

export interface TutorialSection {
  key: SectionKey;
  label: string;
  color: string;
  icon: string;
  completionSummary: string;
}

/** Unified tutorial accent — bright orange for all sections. */
export const OB_ACCENT = '#FF6B2B';

export const TUTORIAL_SECTIONS: TutorialSection[] = [
  { key: 'a', label: 'UI Layout',  color: OB_ACCENT, icon: '1', completionSummary: 'You now know where everything is — panels, layers, inspector, and the AI context.' },
  { key: 'b', label: 'Generation', color: OB_ACCENT, icon: '2', completionSummary: 'You can generate shoes from text prompts and reference images.' },
  { key: 'c', label: 'Utilities',  color: OB_ACCENT, icon: '3', completionSummary: 'You can isolate, delete, rate, filter, and explore the genealogy tree.' },
  { key: 'd', label: 'AI Agent',   color: OB_ACCENT, icon: '4', completionSummary: 'You can ask the AI to explore gaps and suggest semantic axes.' },
];

export function getSectionByKey(key: SectionKey): TutorialSection {
  return TUTORIAL_SECTIONS.find((s) => s.key === key)!;
}

// ─── Step types ──────────────────────────────────────────────────────────────

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  instruction: string;
  dialInstruction?: string;
  targetSelector: string;
  cardPosition: 'right' | 'left' | 'below' | 'above';
  section: SectionKey;
  /** Radial dial button action.id to spotlight in Phase B. */
  dialButtonId?: string;
  /** Key for prerequisite check — if unmet, shows guidance card. */
  prerequisiteKey?: string;
  /** Active guidance text shown when prerequisite is not met. */
  prerequisiteGuide?: string;
  /** Step ID for auto-complete detection (matched in useAutoComplete). */
  completionKey?: string;
  /** Label shown while async operation is in progress. */
  waitingLabel?: string;
  /** If true, "Got it" is the only completion method (no auto-complete). */
  isInformational?: boolean;
  /** Secondary selector for observation area (bright cutout where results appear). */
  observationSelector?: string;
  /** Selector for a dialog/modal that opens as a third phase (after dial click). */
  dialogSelector?: string;
  /** Instruction shown when the dialog is open. */
  dialogInstruction?: string;
  /** Atomic unit ID — Back button hidden at unit boundaries. */
  atomicUnit: string;
}

// ─── Atomic unit definitions ─────────────────────────────────────────────────
// Steps sharing an atomicUnit can navigate Back/Forward between each other.
// Back is hidden at the first step of each unit.

export const ATOMIC_UNITS = [
  'ui-orientation',   // steps 1-9: all reversible panel exploration
  'deselect-dial',    // steps 10-11: selection + dial intro
  'gen-text',         // step 12: irreversible once generated
  'gen-ref',          // step 13: irreversible once generated
  'isolate-manage',   // steps 14-17: all reversible utilities
  'ai-actions',       // steps 19-21: independent AI triggers
] as const;

// ─── 21 Tutorial Steps ──────────────────────────────────────────────────────

export const TUTORIAL_STEPS: TutorialStep[] = [

  // ═══ Section A: UI Layout (12 steps) ═══════════════════════════════════════

  {
    id: 'a-canvas',
    section: 'a',
    atomicUnit: 'ui-orientation',
    title: 'AI Agent Context',
    description: '',
    instruction: '**Write a design prompt** — e.g. "minimalist running shoes with bold accents". Expand **Parameters** below to see how the AI interprets your prompt into structured categories (shoe type, material, color, etc.). You can **edit or add parameters** to refine exactly what the AI considers when suggesting designs.',
    targetSelector: '[data-tour="brief"]',
    cardPosition: 'below',
    completionKey: 'a-canvas',
    observationSelector: '[data-tour="canvas"]',
  },

  {
    id: 'a-select',
    section: 'a',
    atomicUnit: 'ui-orientation',
    title: 'Select a Shoe',
    description: '',
    instruction: '**Click any shoe** to select it — it gets a bright glow. **Click more shoes** to add them to the selection. You can also **drag** across the canvas to select multiple shoes at once.',
    targetSelector: '[data-tour="canvas"]',
    cardPosition: 'right',
    completionKey: 'a-select',
    observationSelector: '[data-tour="inspector"]',
  },

  {
    id: 'a-select-visual',
    section: 'a',
    atomicUnit: 'ui-orientation',
    title: 'Selection Effects',
    description: '',
    instruction: 'Unselected shoes **fade to 30%** so you can focus on your selection. If a selected shoe has **parents or children**, they stay visible with **cyan connecting lines** showing the family tree. Click **empty canvas** to deselect all.',
    targetSelector: '[data-tour="canvas"]',
    cardPosition: 'right',
    isInformational: true,
    prerequisiteKey: 'a-select-visual',
    prerequisiteGuide: '**Select a shoe** on the canvas first.',
  },

  {
    id: 'a-history-expand',
    section: 'a',
    atomicUnit: 'ui-orientation',
    title: 'History Panel',
    description: '',
    instruction: '**Click the bottom bar** to expand the History panel.',
    targetSelector: '[data-tour="bottom-drawer-bar"]',
    cardPosition: 'right',
    completionKey: 'a-history-expand',
    observationSelector: '[data-tour="canvas"]',
  },

  {
    id: 'a-history-browse',
    section: 'a',
    atomicUnit: 'ui-orientation',
    title: 'Browse Batches',
    description: '',
    instruction: '**Browse the generation batches** in the History panel. Each batch is one generation run.',
    targetSelector: '[data-tour="bottom-drawer-content"]',
    cardPosition: 'above',
    prerequisiteKey: 'a-history-browse',
    prerequisiteGuide: '**Expand the History panel** first (click the bottom bar).',
    isInformational: true,
    observationSelector: '[data-tour="canvas"]',
  },

  {
    id: 'a-lineage-tab',
    section: 'a',
    atomicUnit: 'ui-orientation',
    title: 'Lineage Tree',
    description: '',
    instruction: '**Click the Lineage Tree tab** to see parent-child genealogy. Node colors: **orange** = reference shoes you loaded, **green** = AI-generated, **purple** = AI agent suggestions. Lines show which shoes were used as parents for each generation.',
    targetSelector: '[data-tour="tab-lineage"]',
    cardPosition: 'right',
    prerequisiteKey: 'a-lineage-tab',
    prerequisiteGuide: '**Expand the History panel** first (click the bottom bar).',
    completionKey: 'a-lineage-tab',
    observationSelector: '[data-tour="bottom-drawer-content"]',
  },

  {
    id: 'a-layers-expand',
    section: 'a',
    atomicUnit: 'ui-orientation',
    title: 'Layers Panel',
    description: '',
    instruction: '**Click the Layers bar** (bottom-right) to expand. Loaded reference images and shoes are **auto-sorted** into their own layers. **Click any layer row** to toggle its visibility on/off. Double-click a name to rename it.',
    targetSelector: '[data-tour="layers-bar"]',
    cardPosition: 'left',
    completionKey: 'a-layers-expand',
    observationSelector: '[data-tour="canvas"]',
  },

  {
    id: 'a-inspector',
    section: 'a',
    atomicUnit: 'ui-orientation',
    title: 'Inspector Panel',
    description: '',
    instruction: 'The **Inspector** (right) has two parts: the **top bar** shows all your selected shoes — these become **reference images** when you generate variations. Below is the **family tree** showing parents above and children below.',
    targetSelector: '[data-tour="inspector"]',
    cardPosition: 'left',
    prerequisiteKey: 'a-inspector',
    prerequisiteGuide: '**Select a shoe that has parents or children** — generated shoes have lineage.',
    isInformational: true,
    observationSelector: '[data-tour="canvas"]',
  },

  {
    id: 'a-inspector-actions',
    section: 'a',
    atomicUnit: 'ui-orientation',
    title: 'Inspector Actions',
    description: '',
    instruction: 'Action buttons: **Generate**, **Isolate**, **Remove**, and **Deselect**.',
    targetSelector: '[data-tour="action-bar"]',
    cardPosition: 'left',
    prerequisiteKey: 'a-inspector-actions',
    prerequisiteGuide: '**Select a shoe** on the canvas first.',
    isInformational: true,
  },

  {
    id: 'a-topbar',
    section: 'a',
    atomicUnit: 'ui-orientation',
    title: 'Top Bar',
    description: '',
    instruction: 'The header has **Import / Save / Export** and **Settings / Onboarding** buttons.',
    targetSelector: '[data-tour="header"]',
    cardPosition: 'below',
    isInformational: true,
  },

  {
    id: 'a-load',
    section: 'a',
    atomicUnit: 'ui-orientation',
    title: 'Load Files',
    description: '',
    instruction: '**Space** or **middle-click** → **Load Files** to import external images. Choose **"Shoes"** for background removal, or **"References"** to keep backgrounds (mood boards, logos, etc.).',
    dialInstruction: '**Click Load Files** to open the file loader.',
    targetSelector: '[data-tour="canvas"]',
    cardPosition: 'left',
    dialButtonId: 'load',
    isInformational: true,
  },

  // ═══ Section B: Generation (5 steps) ═══════════════════════════════════════

  {
    id: 'b-deselect',
    section: 'b',
    atomicUnit: 'deselect-dial',
    title: 'Clear Selection',
    description: '',
    instruction: '**Click an empty area** of the canvas to deselect all shoes.',
    targetSelector: '[data-tour="canvas"]',
    cardPosition: 'left',
    completionKey: 'b-deselect',
    observationSelector: '[data-tour="inspector"]',
  },

  {
    id: 'b-dial-intro',
    section: 'b',
    atomicUnit: 'deselect-dial',
    title: 'Radial Dial',
    description: '',
    instruction: '**Press Space** or **middle-click** to open the Radial Dial — your main action hub.',
    targetSelector: '[data-tour="canvas"]',
    cardPosition: 'left',
    completionKey: 'b-dial-intro',
  },

  {
    id: 'b-gen-text',
    section: 'b',
    atomicUnit: 'gen-text',
    title: 'Generate from Text',
    description: '',
    instruction: '**Press Space** or **middle-click** → click **Generate**. With nothing selected, this creates shoes from a text prompt.',
    dialInstruction: '**Click Generate** to open the text prompt dialog.',
    dialogSelector: '[data-tour="gen-dialog-text"]',
    dialogInstruction: 'Pick features from the **Tag Matrix** on the right, or type directly in the **text box** — or both! Click **Refine Prompt** to have Gemini combine everything into a polished description. Then click **Generate**.',
    targetSelector: '[data-tour="canvas"]',
    cardPosition: 'left',
    dialButtonId: 'generate',
    prerequisiteKey: 'b-gen-text',
    prerequisiteGuide: '**Deselect all shoes** first (click an empty area).',
    completionKey: 'b-gen-text',
    waitingLabel: 'Generating... ~10-20 seconds.',
  },

  {
    id: 'b-gen-ref',
    section: 'b',
    atomicUnit: 'gen-ref',
    title: 'Generate Variations',
    description: '',
    instruction: '**Select one or more shoes**, then **press Space** or **middle-click** → **Generate**. This creates variations blending their designs.',
    dialInstruction: '**Click Generate** to open the reference dialog.',
    dialogSelector: '[data-tour="gen-dialog-ref"]',
    dialogInstruction: 'Pick **descriptor tags** on the right, or type directly — use **@A**, **@B** to reference specific shoes. Click **Refine Prompt** to have Gemini polish everything together. Then click **Generate**!',
    targetSelector: '[data-tour="canvas"]',
    cardPosition: 'left',
    dialButtonId: 'generate',
    prerequisiteKey: 'b-gen-ref',
    prerequisiteGuide: '**Select at least one shoe** on the canvas first.',
    completionKey: 'b-gen-ref',
    waitingLabel: 'Generating variations...',
    observationSelector: '[data-tour="inspector"]',
  },

  {
    id: 'b-axes',
    section: 'b',
    atomicUnit: 'gen-ref',
    title: 'Edit Axes',
    description: '',
    instruction: 'The **axis labels** (bottom + left) define how shoes are arranged. **Click a label** to type a new concept (e.g. "formal ↔ sporty"), then press **Enter**. All shoes reproject instantly along the new dimension.',
    targetSelector: '[data-tour="axis-x"]',
    cardPosition: 'above',
    completionKey: 'b-axes',
  },

  // ═══ Section C: Utilities (10 steps) ═══════════════════════════════════════

  {
    id: 'c-isolate',
    section: 'c',
    atomicUnit: 'isolate-manage',
    title: 'Isolate',
    description: '',
    instruction: '**Select a shoe** → **Space** or **middle-click** → **Isolate**. This hides everything else so you can focus.',
    dialInstruction: '**Click Isolate** to hide all other shoes and focus on the selected one.',
    targetSelector: '[data-tour="canvas"]',
    cardPosition: 'left',
    dialButtonId: 'isolate',
    prerequisiteKey: 'c-isolate',
    prerequisiteGuide: '**Select a shoe** on the canvas first.',
    completionKey: 'c-isolate',
  },

  {
    id: 'c-unhide',
    section: 'c',
    atomicUnit: 'isolate-manage',
    title: 'Unhide All',
    description: '',
    instruction: 'Click the **⊙ Unhide All** button (bottom-right) to restore all hidden shoes back to the canvas.',
    targetSelector: '[data-tour="unhide-all-btn"]',
    cardPosition: 'left',
    completionKey: 'c-unhide',
  },

  {
    id: 'c-controls',
    section: 'c',
    atomicUnit: 'isolate-manage',
    title: 'Visual Controls',
    description: '',
    instruction: 'Try the **Size/Opacity sliders** on the right edge to adjust how shoes appear on the canvas.',
    targetSelector: '[data-tour="canvas-sliders"]',
    cardPosition: 'left',
    isInformational: true,
  },

  {
    id: 'c-visual-reset',
    section: 'c',
    atomicUnit: 'isolate-manage',
    title: 'Visual Reset',
    description: '',
    instruction: '**Click the Visual Reset button** (bottom-right) to restore the default size and opacity of all shoes — useful after adjusting the size/opacity sliders.',
    targetSelector: '[data-tour="visual-reset-btn"]',
    cardPosition: 'left',
    isInformational: true,
  },

  {
    id: 'c-recenter',
    section: 'c',
    atomicUnit: 'isolate-manage',
    title: 'Recenter Canvas',
    description: '',
    instruction: '**Click the Recenter button** (bottom-right) to fit all shoes back into view — like "fit to screen" in any design tool. Handy after generating many shoes or after reprojecting axes.',
    targetSelector: '[data-tour="recenter-btn"]',
    cardPosition: 'left',
    isInformational: true,
  },

  {
    id: 'c-delete',
    section: 'c',
    atomicUnit: 'isolate-manage',
    title: 'Delete a Shoe',
    description: '',
    instruction: '**Select a shoe** → **Space** or **middle-click** → **Delete** to remove it from the canvas.',
    dialInstruction: '**Click Delete** to remove the selected shoe.',
    targetSelector: '[data-tour="canvas"]',
    cardPosition: 'left',
    dialButtonId: 'delete',
    prerequisiteKey: 'c-delete',
    prerequisiteGuide: '**Select a shoe** on the canvas first.',
    completionKey: 'c-delete',
  },

  {
    id: 'c-revert',
    section: 'c',
    atomicUnit: 'isolate-manage',
    title: 'Restore Deleted',
    description: '',
    instruction: 'After deleting, a **↩ button** appears (bottom-right). Click it to see all deleted shoes and **Restore** any of them back to the canvas.',
    targetSelector: '[data-tour="deleted-panel-trigger"]',
    cardPosition: 'left',
    prerequisiteKey: 'c-revert',
    prerequisiteGuide: '**Delete a shoe** first so the restore button appears.',
    completionKey: 'c-revert',
  },

  {
    id: 'c-minimap',
    section: 'c',
    atomicUnit: 'isolate-manage',
    title: 'Minimap Navigation',
    description: '',
    instruction: 'The **Minimap** (bottom-left) shows all shoes at a glance. **Drag the white rectangle** to pan the canvas, or **click anywhere** on the minimap to jump to that region.',
    targetSelector: '[data-tour="minimap"]',
    cardPosition: 'right',
    isInformational: true,
  },

  {
    id: 'c-axis-scale',
    section: 'c',
    atomicUnit: 'isolate-manage',
    title: 'Axis Stretch',
    description: '',
    instruction: 'The **axis scale sliders** (below X-axis and left of Y-axis) let you **stretch or compress** the canvas along each dimension to spread out clusters or tighten gaps.',
    targetSelector: '[data-tour="axis-scale-x"]',
    cardPosition: 'above',
    isInformational: true,
  },

  {
    id: 'c-axis-tune-intro',
    section: 'c',
    atomicUnit: 'axis-tuning',
    title: 'Axis Fine-Tuning',
    description: '',
    instruction: 'Click the **Tune** button between the axis labels to open **Axis Tuning Mode**. A blue border appears on the canvas — clicking shoes now **adds them as anchors** instead of selecting them.',
    targetSelector: '[data-tour="axis-tune-btn"]',
    cardPosition: 'above',
    isInformational: true,
  },

  {
    id: 'c-axis-tune-sentences',
    section: 'c',
    atomicUnit: 'axis-tuning',
    title: 'Tuning Sentences',
    description: '',
    instruction: 'The tuning panel shows **4 AI-expanded sentences** for each axis end (e.g. "formal" → "plain canvas, rubber sole"). You can **edit these directly** to refine what each end of the axis means, or use the **AI Refine** box to describe changes in natural language.',
    targetSelector: '[data-tour="axis-tuning-rail"]',
    cardPosition: 'right',
    isInformational: true,
  },

  {
    id: 'c-axis-tune-anchors',
    section: 'c',
    atomicUnit: 'axis-tuning',
    title: 'Image Anchors',
    description: '',
    instruction: 'With tuning mode active, **click any shoe on the canvas** to add it as an anchor on the rail. **Drag anchors** left/right (or up/down for Y axis) to set their position on the 0-10 scale. Anchors near 10 push the axis toward that shoe; anchors near 0 push it away.',
    targetSelector: '[data-tour="axis-tuning-rail"]',
    cardPosition: 'right',
    isInformational: true,
  },

  {
    id: 'c-axis-tune-reproject',
    section: 'c',
    atomicUnit: 'axis-tuning',
    title: 'Reproject',
    description: '',
    instruction: 'Adjust the **Text weight** slider to control how much the sentence descriptions vs. image anchors influence the axis. When ready, click **Reproject** — all shoes animate to their new positions based on the tuned axis. Click **✕** to exit tuning mode.',
    targetSelector: '[data-tour="axis-tuning-rail"]',
    cardPosition: 'right',
    isInformational: true,
  },

  {
    id: 'c-rate',
    section: 'c',
    atomicUnit: 'isolate-manage',
    title: 'Rate a Shoe',
    description: '',
    instruction: '**Select a shoe**, then use the **star buttons** in the Inspector\'s action bar to give it a rating (1-5 stars). Click the same star again to clear.',
    targetSelector: '[data-tour="action-stars"]',
    cardPosition: 'left',
    prerequisiteKey: 'c-rate',
    prerequisiteGuide: '**Select a shoe** on the canvas first.',
    completionKey: 'c-rate',
  },

  {
    id: 'c-star-filter',
    section: 'c',
    atomicUnit: 'isolate-manage',
    title: 'Star Filter',
    description: '',
    instruction: 'The **star filter** (top-right) lets you show only highly-rated shoes. Click a star to filter — e.g. clicking **4★** shows all shoes rated **4 stars or above**. Click again to clear.',
    targetSelector: '[data-tour="star-filter"]',
    cardPosition: 'left',
    completionKey: 'c-star-filter',
  },

  {
    id: 'c-tree',
    section: 'c',
    atomicUnit: 'isolate-manage',
    title: 'Exploration Tree',
    description: '',
    instruction: '**Space** or **middle-click** → **Exploration Tree** to see the full genealogy graph of all your shoes. **Click any node** to select it and fly to it on the canvas. Nodes are color-coded: **orange** = reference, **green** = generated, **purple** = AI agent.',
    dialInstruction: '**Click Exploration Tree** to open the full genealogy view.',
    targetSelector: '[data-tour="canvas"]',
    cardPosition: 'left',
    dialButtonId: 'exploration-tree',
    isInformational: true,
  },

  // ═══ Section D: AI Agent (4 steps) ═════════════════════════════════════════

  {
    id: 'd-explore',
    section: 'd',
    atomicUnit: 'ai-actions',
    title: 'Explore Canvas',
    description: '',
    instruction: '**Space** or **middle-click** → **Explore Canvas**. The AI scans your canvas for unexplored regions in the design space. This also triggers **automatically every 15 generations**. Processing takes 20–30 seconds — **you can move on** while it works in the background.',
    dialInstruction: '**Click Explore Canvas** to start the analysis. It runs in the background — you\'ll see ghost suggestions appear once it finishes. Feel free to proceed!',
    targetSelector: '[data-tour="canvas"]',
    cardPosition: 'left',
    dialButtonId: 'explore-canvas',
    prerequisiteKey: 'd-explore',
    prerequisiteGuide: '**Generate some shoes** first so the AI has content to analyze.',
    isInformational: true,
  },

  {
    id: 'd-ghosts',
    section: 'd',
    atomicUnit: 'ai-actions',
    title: 'AI Suggestions',
    description: '',
    instruction: 'After **Explore Canvas**, the AI analyzes gaps and generates **translucent ghost shoes** — this may take **20-30 seconds**. Watch for glowing shoes to appear on the canvas. **Hover** to see why it was suggested, then click **Keep** to add it or **Skip** to dismiss.',
    targetSelector: '[data-tour="canvas"]',
    cardPosition: 'left',
    completionKey: 'd-ghosts',
    isInformational: true,
  },

  {
    id: 'd-insight',
    section: 'd',
    atomicUnit: 'ai-actions',
    title: 'Dynamic Island',
    description: '',
    instruction: 'The **Dynamic Island** (top-center) shows the AI\'s status. When the AI is **working** it pulses; when it **spots something** — a gap, a suggestion — hover to read the insight. Think of it as a live status bar for background AI activity.',
    targetSelector: '.dynamic-island',
    cardPosition: 'below',
    isInformational: true,
    observationSelector: '[data-tour="canvas"]',
  },

  {
    id: 'd-axes',
    section: 'd',
    atomicUnit: 'ai-actions',
    title: 'Suggest Axes',
    description: '',
    instruction: '**Space** or **middle-click** → **Suggest Axes**. The AI proposes semantic dimensions and reprojects all shoes.',
    dialInstruction: '**Click Suggest Axes** — the AI will propose new axis pairs for your canvas.',
    targetSelector: '[data-tour="canvas"]',
    cardPosition: 'left',
    dialButtonId: 'analyze-axis',
    prerequisiteKey: 'd-axes',
    prerequisiteGuide: '**Generate some shoes** first so the AI has content to analyze.',
    completionKey: 'd-axes',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Get all steps for a section. */
export function getStepsForSection(key: SectionKey): TutorialStep[] {
  return TUTORIAL_STEPS.filter((s) => s.section === key);
}

/** Get the section a step belongs to. */
export function getStepSection(stepId: string): TutorialSection | undefined {
  const step = TUTORIAL_STEPS.find((s) => s.id === stepId);
  return step ? getSectionByKey(step.section) : undefined;
}

/** Check if a step is the first in its atomic unit. */
export function isFirstInUnit(stepId: string): boolean {
  const step = TUTORIAL_STEPS.find((s) => s.id === stepId);
  if (!step) return true;
  const unitSteps = TUTORIAL_STEPS.filter((s) => s.atomicUnit === step.atomicUnit);
  return unitSteps[0]?.id === stepId;
}

/** Get the previous step within the same atomic unit (for Back navigation). */
export function getPrevInUnit(stepId: string): TutorialStep | null {
  const step = TUTORIAL_STEPS.find((s) => s.id === stepId);
  if (!step) return null;
  const unitSteps = TUTORIAL_STEPS.filter((s) => s.atomicUnit === step.atomicUnit);
  const idx = unitSteps.findIndex((s) => s.id === stepId);
  return idx > 0 ? unitSteps[idx - 1] : null;
}
