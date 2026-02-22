/**
 * Onboarding tutorial step definitions — v4
 *
 * Flow:
 *   1. UI Layout  → explore all panels first (header, history drawer, brief)
 *   2. Navigation → click a shoe, open the radial dial
 *   3. Generate   → text gen and variation gen via dial
 *   4. Manipulate → axes, isolate, layers, tree via dial
 *   5. AI Agent   → explore canvas, read insights
 *   6. Save       → persist your canvas
 *
 * Steps with `dialButtonId` use two-phase spotlight:
 *   Phase A (dial closed) → spotlight canvas, instruction = "Press Space"
 *   Phase B (dial open)   → spotlight the dial button, instruction = dialInstruction
 */

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  instruction: string;
  dialInstruction?: string;
  targetSelector: string;
  cardPosition: 'right' | 'left' | 'below' | 'above';
  icon: string;
  category: string;
  /** ID of the radial dial button (action.id) to spotlight when dial is open. */
  dialButtonId?: string;
  prerequisiteKey?: string;
  setupHint?: string;
  completionKey?: string;
  waitingLabel?: string;
  isInformational?: boolean;
}

export interface StepCategory {
  key: string;
  label: string;
  icon: string;
}

export const STEP_CATEGORIES: StepCategory[] = [
  { key: 'ui-layout',    label: 'UI Layout',           icon: '🗂️' },
  { key: 'navigation',   label: 'Canvas Navigation',   icon: '🖱️' },
  { key: 'generating',   label: 'Generating Images',   icon: '✨' },
  { key: 'manipulation', label: 'Canvas Manipulation', icon: '🔧' },
  { key: 'ai-agent',     label: 'AI Agent',            icon: '🤖' },
  { key: 'saving',       label: 'Save & Export',       icon: '💾' },
];

export const TUTORIAL_STEPS: TutorialStep[] = [

  // ─── 1. UI Layout: explore all panels ────────────────────────────────────

  {
    id: 'ui-header',
    category: 'ui-layout',
    title: 'Header Bar',
    description: 'The top bar holds **↑ Import / ↓ Save / ↓ Export** on the left and **Settings (⚙) / Tutorial (?)** on the right.',
    instruction: 'Take a look at the header, then click **Got it ✓** to continue.',
    targetSelector: '[data-tour="header"]',
    cardPosition: 'below',
    icon: '📌',
    isInformational: true,
  },

  {
    id: 'ui-panels',
    category: 'ui-layout',
    title: 'Expand the History Panel',
    description: 'The **History** bar at the bottom shows all your generation batches. Click the bar (or ▲) to expand it — click again to collapse.',
    instruction: 'Click the **▲ bar at the bottom** to expand the History panel.',
    targetSelector: '[data-tour="bottom-drawer-bar"]',
    cardPosition: 'above',
    icon: '🗂️',
    completionKey: 'ui-panels',
  },

  {
    id: 'ui-tabs',
    category: 'ui-layout',
    title: 'Switch to Lineage Tree',
    description: 'Two tabs are available: **History** (generation batches) and **Lineage Tree** (parent-child genealogy graph).',
    instruction: 'Click the **Lineage Tree** tab. Click **History** to switch back.',
    targetSelector: '[data-tour="tab-lineage"]',
    cardPosition: 'above',
    icon: '🌲',
    prerequisiteKey: 'ui-tabs',
    setupHint: 'First expand the History panel by clicking the ▲ bar at the bottom.',
    completionKey: 'ui-tabs',
  },

  {
    id: 'load-brief',
    category: 'ui-layout',
    title: 'Set the AI Agent Context',
    description: 'The **AI Agent Context** box (top-left of canvas) gives every AI action context — generation prompts, axis suggestions, and canvas exploration all use it.',
    instruction: 'Click the **AI Agent Context** box at the top-left and type a design direction — e.g. *"minimalist running shoe with bold color accents"*.',
    targetSelector: '[data-tour="brief"]',
    cardPosition: 'below',
    icon: '📝',
    completionKey: 'load-brief',
  },

  // ─── 2. Navigation ────────────────────────────────────────────────────────

  {
    id: 'nav-canvas',
    category: 'navigation',
    title: 'Select a Shoe',
    description: '**Drag** to pan the canvas, **scroll** to zoom. The canvas is a semantic map — similar shoes cluster together.',
    instruction: '**Click any shoe** on the canvas — ideally one with parent and child connections. It will glow cyan and the **Inspector** panel on the right will come alive.',
    targetSelector: '[data-tour="canvas"]',
    cardPosition: 'right',
    icon: '🖱️',
    prerequisiteKey: 'nav-canvas',
    setupHint: 'Waiting for shoes to appear on the canvas…',
    completionKey: 'nav-canvas',
  },

  {
    id: 'nav-inspector',
    category: 'navigation',
    title: 'Inspector — Lineage & Genealogy',
    description: 'The **Inspector** shows the selected shoe\'s full design lineage. **Ancestors** (cyan border, above) are the shoes it was generated from. **Children** (amber border, below) are designs created from it. Click any node to navigate the tree.',
    instruction: 'Look at the **Inspector panel** on the right. The selected shoe is in the center — its **parent** is above (cyan) and its **children** are below (amber). This shows the full design genealogy.',
    targetSelector: '[data-tour="inspector"]',
    cardPosition: 'left',
    icon: '🔍',
    isInformational: true,
  },

  {
    id: 'nav-radial',
    category: 'navigation',
    title: 'Open the Radial Dial',
    description: 'The **Radial Dial** is your action hub — all major features live here: Generate, Explore, Suggest Axes, Exploration Tree, Isolate, and more.',
    instruction: 'Press **Space** (or middle-click the canvas) to open the **Radial Dial**. Close it with Escape or by clicking outside.',
    targetSelector: '[data-tour="canvas"]',
    cardPosition: 'right',
    icon: '⌨️',
    completionKey: 'nav-radial',
  },

  // ─── 3. Generating Images ─────────────────────────────────────────────────

  {
    id: 'gen-text',
    category: 'generating',
    title: 'Generate from Text',
    description: 'When **no shoe is selected**, the Generate action creates designs from a text prompt. First click an empty area of the canvas to deselect, then open the Radial Dial.',
    instruction: '**Click an empty area** of the canvas to deselect any shoes, then press **Space** to open the Radial Dial.',
    dialInstruction: 'Click **Generate** — with nothing selected this opens the text prompt dialog. Type a description and generate!',
    targetSelector: '[data-tour="canvas"]',
    cardPosition: 'right',
    icon: '✨',
    dialButtonId: 'generate',
    prerequisiteKey: 'gen-text',
    setupHint: 'Waiting for the app to finish loading…',
    completionKey: 'gen-text',
    waitingLabel: 'Generating your images… this usually takes 10–20 seconds.',
  },

  {
    id: 'gen-ref',
    category: 'generating',
    title: 'Generate from References',
    description: 'When **shoes are selected** (glowing cyan), Generate creates **variations** that blend or extend their design features — using the selected shoes as visual references.',
    instruction: '**Click one or more shoes** on the canvas to select them (they glow cyan), then press **Space** to open the Radial Dial.',
    dialInstruction: 'Click **Generate** — with shoes selected, this opens the reference dialog. Use the tag matrix and Refine to craft your prompt!',
    targetSelector: '[data-tour="canvas"]',
    cardPosition: 'right',
    icon: '🎨',
    dialButtonId: 'generate',
    prerequisiteKey: 'gen-ref',
    setupHint: 'Click at least 1 shoe on the canvas to select it first (it will glow cyan).',
    completionKey: 'gen-ref',
    waitingLabel: 'Generating variations… please wait.',
  },

  // ─── 4. Canvas Manipulation ───────────────────────────────────────────────

  {
    id: 'manip-axes',
    category: 'manipulation',
    title: 'Suggest Semantic Axes',
    description: 'Shoes are positioned along two **semantic dimensions** (e.g. casual ↔ formal). The AI suggests new axis pairs and reprojects all shoes.',
    instruction: 'Press **Space** to open the Radial Dial, then click **Suggest Axes**.',
    dialInstruction: 'Click **Suggest Axes** — the AI will propose new semantic dimensions based on your canvas.',
    targetSelector: '[data-tour="canvas"]',
    cardPosition: 'right',
    icon: '📐',
    dialButtonId: 'analyze-axis',
    prerequisiteKey: 'manip-axes',
    setupHint: 'Generate some shoes first so the AI has content to analyze.',
    completionKey: 'manip-axes',
  },

  {
    id: 'manip-isolate',
    category: 'manipulation',
    title: 'Isolate Selected Shoes',
    description: '**Isolate** hides all other shoes — great for focused comparison. Use **Unhide All** (same button) to restore.',
    instruction: '**Click a shoe** to select it, then press **Space** to open the Radial Dial.',
    dialInstruction: 'Click **Isolate** — all other shoes fade away so you can focus on your selection.',
    targetSelector: '[data-tour="canvas"]',
    cardPosition: 'right',
    icon: '👁️',
    dialButtonId: 'isolate',
    prerequisiteKey: 'manip-isolate',
    setupHint: 'Click one or more shoes on the canvas to select them first (they glow cyan).',
    completionKey: 'manip-isolate',
  },

  {
    id: 'manip-layers',
    category: 'manipulation',
    title: 'Use the Layers Panel',
    description: '**Layers** let you color-code and group shoes for A/B comparisons. Toggle visibility with eye icons to isolate groups.',
    instruction: 'Click the **▲ Layers bar** at the bottom-right to expand the panel. With a shoe selected, click a layer button to assign it — the shoe node will take that layer\'s color.',
    targetSelector: '[data-tour="layers"]',
    cardPosition: 'above',
    icon: '📁',
    prerequisiteKey: 'manip-layers',
    setupHint: 'Click a shoe on the canvas to select it first (it will glow cyan), then expand the Layers panel.',
    completionKey: 'manip-layers',
  },

  {
    id: 'manip-tree',
    category: 'manipulation',
    title: 'Exploration Tree',
    description: 'The **Exploration Tree** shows the full genealogy of all generated images — every parent-child relationship by generation run.',
    instruction: 'Press **Space** to open the Radial Dial, then click **Exploration Tree**.',
    dialInstruction: 'Click **Exploration Tree** to open the full genealogy graph of your designs.',
    targetSelector: '[data-tour="canvas"]',
    cardPosition: 'right',
    icon: '🌳',
    dialButtonId: 'exploration-tree',
    prerequisiteKey: 'manip-tree',
    setupHint: 'Generate at least 2 shoes first to see a meaningful genealogy tree.',
    completionKey: 'manip-tree',
  },

  // ─── 5. AI Agent ──────────────────────────────────────────────────────────

  {
    id: 'ai-explore',
    category: 'ai-agent',
    title: 'Explore Canvas',
    description: 'The AI agent analyzes your canvas for **unexplored design regions** — gaps in the semantic space worth investigating.',
    instruction: 'Press **Space** to open the Radial Dial, then click **Explore Canvas**.',
    dialInstruction: 'Click **Explore Canvas** — the AI will find unexplored regions in your design space.',
    targetSelector: '[data-tour="canvas"]',
    cardPosition: 'right',
    icon: '🔭',
    dialButtonId: 'explore-canvas',
    prerequisiteKey: 'ai-explore',
    setupHint: 'Generate some shoes first so the AI has a canvas to explore.',
    completionKey: 'ai-explore',
    waitingLabel: 'AI is analyzing the canvas… this takes a few seconds.',
  },

  {
    id: 'ai-island',
    category: 'ai-agent',
    title: 'Read the AI Insight',
    description: 'The **Dynamic Island** (top center) shows AI status. After Explore Canvas or Suggest Axes, hover it to read the AI insight.',
    instruction: 'Hover the **Dynamic Island** at the top-center to read the AI insight.',
    targetSelector: '.dynamic-island',
    cardPosition: 'below',
    icon: '🤖',
    prerequisiteKey: 'ai-island',
    setupHint: 'Trigger an AI action first — press Space → Suggest Axes or Explore Canvas.',
    completionKey: 'ai-island',
    isInformational: true,
  },

  // ─── 6. Save & Export ─────────────────────────────────────────────────────

  {
    id: 'save-export',
    category: 'saving',
    title: 'Save Your Canvas',
    description: '**↓ Save** persists your canvas to the server. **↓ Export** downloads a ZIP you can re-import later on any machine.',
    instruction: 'Click **↓ Save** in the header to save your canvas.',
    targetSelector: '[data-tour="save"]',
    cardPosition: 'below',
    icon: '💾',
    prerequisiteKey: 'save-export',
    setupHint: 'Generate or load some shoes first, then save the canvas.',
    completionKey: 'save-export',
  },
];
