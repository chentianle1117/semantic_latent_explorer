/**
 * Type definitions matching the artifact interaction model
 */

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
  selectedImageIds: number[];
  hoveredImageId: number | null;
  hoveredGroupId: string | null;
  visualSettings: VisualSettings;
  canvasBounds: CanvasBounds | null; // null = auto-calculate from data
  removeBackground: boolean;
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

  // Isolate mode: when set, only these image IDs are shown at full opacity
  isolatedImageIds: number[] | null;

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
  type: 'generation' | 'axis_change' | 'canvas_save' | 'canvas_switch';
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
  category: 'ref_image' | 'ref_shoe' | 'user' | 'agent';
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
  | { mode: 'reference'; reference_analysis: ReferenceImageAnalysis[]; combination_prompts: CombinationPrompt[] };