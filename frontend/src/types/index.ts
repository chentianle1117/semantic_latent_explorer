/**
 * Type definitions matching the artifact interaction model
 */

export type ImageRealm = 'mood-board' | 'shoe';
export type ShoeViewType = 'side' | '3/4-front' | '3/4-back' | 'top' | 'outsole' | 'medial' | 'front' | 'back';

// AI Design Assistant types (Multi-View Editor)
export interface ShoeComponent {
  name: string;
  current: string[];  // current descriptors of this component
  visible_in: string[];
}

export interface DescriptorMatrixRow {
  component: string;
  descriptors: Record<string, string[]>;  // category → options, e.g. { shape: ["pointed", "rounded"], material: [...] }
}

export interface ColorSwatch {
  hex: string;
  name: string;
  location: string;
}

export interface EditSuggestion {
  category: 'component' | 'material' | 'color' | 'proportion' | 'detail' | 'style';
  suggestion: string;
  reasoning: string;
}

export interface ViewAnalysisResponse {
  components: ShoeComponent[];
  descriptor_matrix: DescriptorMatrixRow[];
  color_palette: ColorSwatch[];
  style_summary: string;
  suggested_edits: EditSuggestion[];
}

/** Lightweight MVE history entry (stores side thumbnail + prompt, not all 8 views) */
export interface MultiViewHistoryEntry {
  timestamp: number; // Date.now()
  prompt: string;
  /** base64 of the side view at this snapshot (for thumbnail display) */
  sideBase64: string;
  /** All 8 view base64s keyed by ShoeViewType (for full revert) */
  viewBases: Record<string, string | null>;
}

export interface AxisTuningAnchor {
  imageId: number;
  axis: 'x' | 'y';
  position: number; // 0-10 scale
}

export interface ImageData {
  id: number;
  group_id: string;
  base64_image: string;
  coordinates: [number, number] | [number, number, number];  // 2D or 3D coordinates
  parents: number[];
  children: number[];
  generation_method: 'batch' | 'reference' | 'interpolation' | 'dataset' | 'auto-variation' | 'agent' | 'external';
  prompt: string;
  timestamp: string;
  visible: boolean;
  is_ghost?: boolean;  // Whether this is a ghost/preview suggestion
  suggested_prompt?: string;  // Suggested prompt for ghost nodes
  reasoning?: string;  // Why this ghost was suggested
  neighbors: number[];  // K-nearest semantic neighbors for physics simulation
  layerId?: string;  // undefined = 'default' layer
  realm?: ImageRealm;           // 'shoe' (default) or 'mood-board'
  shoe_view?: ShoeViewType;     // 'side' (default) or any satellite view type
  parent_side_id?: number;      // For satellite views: ID of parent side-view shoe (-1 or absent = none)
}

export interface CanvasLayer {
  id: string;
  name: string;
  visible: boolean;
  color: string; // hex accent for dot/chip
}

export interface HistoryGroup {
  id: string;
  type: 'batch' | 'reference' | 'interpolation' | 'dataset';
  image_ids: number[];
  prompt: string;
  visible: boolean;
  thumbnail_id: number | null;
  timestamp: string;
}

export interface AxisLabels {
  x: [string, string]; // [negative, positive]
  y: [string, string];
  z?: [string, string];  // Optional z-axis for 3D mode
}

export interface AxisLabelSnapshot {
  labels: AxisLabels;
  timestamp: number; // Date.now()
}

export interface CanvasBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin?: number;  // Optional for 3D mode
  zMax?: number;  // Optional for 3D mode
}

export interface AppState {
  images: ImageData[];
  historyGroups: HistoryGroup[];
  axisLabels: AxisLabels;
  axisHistory: AxisLabelSnapshot[]; // Past axis label sets (max 10)
  selectedImageIds: number[];
  hoveredImageId: number | null;
  hoveredGroupId: string | null;
  visualSettings: VisualSettings;
  canvasBounds: CanvasBounds | null; // null = auto-calculate from data
  removeBackground: boolean;
  studyMode: boolean; // When on: side-view only, no mood boards, no multi-view editor
  isGenerating: boolean;
  isInitialized: boolean;
  generationProgress: number;
  generationCurrent: number;
  generationTotal: number;
  is3DMode: boolean;

  // UI layout state
  isInspectorCollapsed: boolean;
  isDrawerExpanded: boolean;
  isHistoryExpanded: boolean;
  isLayersExpanded: boolean;
  activeToolbarFlyout: string | null; // 'generate' | 'batch' | 'analyze' | 'axes' | null
  flyToImageId: number | null;

  // Minimap data (published by SemanticCanvas)
  minimapDots: MinimapDot[];
  minimapGhostDots: MinimapDot[];  // ghost-only positions for DI blobs
  minimapViewport: ViewportRect | null;
  minimapCanvasSize: { w: number; h: number } | null;
  // Pan request: Minimap drag sets this; SemanticCanvas applies and clears
  minimapPanRequest: { centerX: number; centerY: number; id: number } | null;

  // Cluster data for edge bundling
  clusterCentroids: number[][]; // [[x,y], [x,y], ...]
  clusterLabels: number[]; // Per-image cluster assignment

  // Agent state
  agentStatus: AgentStatus;
  agentInsights: AgentInsight[];
  isAgentWorking: boolean;
  agentWorkingLabel: string;
  imagesSinceLastExploration: number;
  agentMode: AgentMode; // kept for SettingsModal compat
  ghostNodes: GhostNode[];

  // CLIP model selection
  clipModelType: 'fashionclip' | 'huggingface';

  // Axis update progress
  isUpdatingAxes: boolean; // Whether axes are currently being recalculated
  axisUpdateProgress: number; // 0-100, percentage completion

  // Gemini-expanded concepts for axis labels (debug display)
  expandedConcepts?: { x_negative?: string[]; x_positive?: string[]; y_negative?: string[]; y_positive?: string[]; z_negative?: string[]; z_positive?: string[] };

  // Design brief for AI agent guidance
  designBrief: string | null;

  // Inline axis suggestions (decoupled from agentInsight so DI dismiss doesn't kill them)
  inlineAxisData: Array<{ x_axis: string; y_axis: string; reasoning: string }> | null;

  // Per-image visual overrides (selection-aware sliders)
  imageSizeOverrides: Record<number, number>;    // imageId → size override
  imageOpacityOverrides: Record<number, number>; // imageId → opacity override

  // Layer system
  layers: CanvasLayer[];
  imageLayerMap: Record<number, string>; // imageId → layerId

  // Canvas view mode: which view is active in the main canvas area
  canvasViewMode: 'semantic' | 'lineage';

  // Isolate mode: when set, only these image IDs are shown at full opacity
  isolatedImageIds: number[] | null;

  // Hidden images: temporarily hidden (blacklist), separate from deletion
  hiddenImageIds: number[];

  // Hidden batches: set of HistoryGroup IDs whose images should be hidden from canvas
  hiddenBatchIds: Set<string>;

  // Star ratings: imageId → 1-5 (0 or absent = unrated)
  imageRatings: Record<number, number>;
  // Star filter: null = show all, 1-5 = show only images with rating >= this
  starFilter: number | null;

  // Design brief glow: true when Gemini is actively referencing the brief
  isAgentUsingBrief: boolean;

  // Structured brief interpretation (AI-extracted fields + suggestions)
  briefFields: BriefField[];
  briefSuggestedParams: BriefSuggestedParam[];
  briefInterpretation: string | null;
  briefLoading: boolean;

  // Session / Multi-Canvas
  currentCanvasId: string | null;
  canvasName: string;
  participantId: string;
  canvasList: CanvasMeta[];
  eventLog: EventLogEntry[];

  // Deletion undo stack (soft-deleted images, most recent first)
  deletedImageStack: ImageData[];

  // Axis suggestion accumulator
  imagesSinceLastAxisSuggestion: number;

  // Shoe view filter toggles — per-view visibility (side defaults visible, satellites default hidden)
  visibleSatelliteViews: Record<string, boolean>;  // keyed by ShoeViewType; side: false=hidden; satellites: true=visible

  // Multi-View Editor history (keyed by side image ID, persists across dialog open/close)
  multiViewHistory: Record<number, MultiViewHistoryEntry[]>;

  // Axis Tuning Mode
  axisTuningMode: boolean;
  axisTuningAxis: 'x' | 'y' | null;
  axisTuningSentences: Record<string, string[]>; // "x_negative" | "x_positive" | "y_negative" | "y_positive" → string[]
  axisTuningAnchors: AxisTuningAnchor[];
  axisTuningTextWeight: number; // 0-1, weight of text vs image anchors
  axisTuningDragImageId: number | null; // image being dragged from canvas to rail

  // Onboarding tutorial
  onboardingActive: boolean;
  onboardingSpotlight: string | null; // step ID currently spotlighted
  completedSteps: string[];
  onboardingDismissed: boolean;
  onboardingSectionTransition: string | null; // section key shown in transition card
}

export interface VisualSettings {
  imageSize: number;
  imageOpacity: number;
  removeBackground: boolean;
  layoutPadding: number; // Padding factor for canvas bounds (0.05 = 5%, 0.2 = 20%)
  coordinateScale: number; // Scale multiplier for coordinates (affects spacing between items)
  coordinateOffset: [number, number, number]; // Offset for recentering [x, y, z]
  axisScaleX: number; // Stretch X-axis from center (1 = no stretch, >1 = expand, <1 = compress)
  axisScaleY: number; // Stretch Y-axis from center (1 = no stretch, >1 = expand, <1 = compress)
  contourStrength: number; // 1–10, controls contour highlight thickness/visibility
  showGenealogyOnCanvas: boolean; // Show parent/child lines on canvas (default: false)
}

export interface AxisUpdateRequest {
  x_positive: string;
  x_negative: string;
  y_positive: string;
  y_negative: string;
  z_positive?: string;  // Optional for 3D mode
  z_negative?: string;  // Optional for 3D mode
}

export interface WebSocketMessage {
  type: 'state_update' | 'pong' | 'error' | 'progress';
  data?: any;
  error?: string;
  progress?: number;
}

// D3 specific types
export interface D3Image extends ImageData {
  x: number; // screen x coordinate
  y: number; // screen y coordinate
}

export interface GenealogyLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  type: 'parent' | 'child';
}

// Agent/AI-related types
export interface SuggestedPrompt {
  prompt: string;
  reasoning: string;
}

// Agent Passive Observer types
export type AgentInsightType = 'gap' | 'axis' | 'prompt' | 'variation';

export interface AgentInsight {
  id: string;
  type: AgentInsightType;
  message: string;
  data: any;
  isRead: boolean;
  timestamp: number;
}

export type AgentStatus = 'idle' | 'thinking' | 'insight-ready';

export type AgentMode = 'auto' | 'manual'; // kept for SettingsModal backward compat

// Ghost node — real generated image shown at 45% opacity with colored badge
export interface GhostNode {
  id: number;
  coordinates: number[];
  base64_image: string;           // actual generated image
  prompt: string;
  reasoning: string;
  parents: number[];              // same parents as user's gen (B) or [] (C)
  source: 'concurrent' | 'exploration';
  timestamp: number;
  // Structured reasoning (optional, backwards-compatible)
  your_design_was?: string;       // Behavior B: description of user's design direction
  this_explores?: string;         // Behavior B: description of what this alternative explores
  key_shifts?: string[];          // Behavior B: e.g. ["leather → mesh", "muted → neon"]
  target_region?: string;         // Behavior C: e.g. "formal + dark"
  contrasts_with?: string;        // Behavior C: what cluster this contrasts with
}

// ─── Session / Multi-Canvas ───────────────────────────────────────────────────

export interface CanvasMeta {
  id: string;
  name: string;
  participantId: string;
  createdAt: string;
  updatedAt: string;
  parentCanvasId: string | null;
  imageCount: number;
}

export interface EventLogEntry {
  type: 'generation' | 'axis_change' | 'canvas_save' | 'canvas_switch'
    | 'selection' | 'design_brief_change' | 'delete' | 'file_upload'
    | 'prompt_submit' | 'suggestion_click' | 'star_rating'
    | 'image_hide' | 'image_restore' | 'layer_visibility_change';
  timestamp: string;
  data?: Record<string, any>;
}

// ─── Structured Design Brief ──────────────────────────────────────────────────

export interface BriefField {
  key: string;      // e.g. "shoe_type"
  label: string;    // e.g. "Shoe Type"
  value: string;    // e.g. "Basketball shoe"
}

export interface BriefSuggestedParam {
  key: string;      // e.g. "material"
  label: string;    // e.g. "Material"
  hint: string;     // e.g. "leather, mesh, suede, synthetic"
}

// ─── Prompt Builder (SuggestionsPanel) ────────────────────────────────────────

export interface TagCategory {
  name: string;      // e.g. "Material"
  tags: string[];    // e.g. ["leather", "suede", "mesh"]
}

export interface FullPromptSuggestion {
  prompt: string;
  reasoning: string;
}

// ─── Minimap ──────────────────────────────────────────────────────────────────

export interface MinimapDot {
  id: number;
  x: number;   // base screen X (pre-zoom)
  y: number;   // base screen Y (pre-zoom)
  category: 'ref_image' | 'ref_shoe' | 'user' | 'agent' | 'mood_board';
  color?: string; // optional — used by ghost dots for DI blob coloring
}

export interface ViewportRect {
  x1: number; y1: number; x2: number; y2: number; // base screen coords
}

/** Feature values are short comma-separated tags from the backend (split client-side) — legacy */
export type ReferenceFeatures = Record<string, string | string[]>;

export interface ReferenceImageAnalysis {
  image_id: number;
  label: string;       // "A", "B", "C"...
  summary?: string;
  /** New: flat list of 5-6 key design descriptors */
  descriptors?: string[];
  /** Legacy: categorized feature map */
  features?: ReferenceFeatures;
}

export interface CombinationPrompt {
  prompt: string;
  reasoning: string;
}

export type SuggestTagsResponse =
  | { mode: 'text'; categories: TagCategory[]; full_prompts: FullPromptSuggestion[] }
  | { mode: 'reference'; reference_analysis: ReferenceImageAnalysis[]; combination_prompts: CombinationPrompt[] }
  | { mode: 'mood-board-reference'; reference_analysis: ReferenceImageAnalysis[]; combination_prompts: CombinationPrompt[]; categories: TagCategory[]; full_prompts: FullPromptSuggestion[] };