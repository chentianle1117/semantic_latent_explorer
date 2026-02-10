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
  generation_method: 'batch' | 'reference' | 'interpolation' | 'dataset';
  prompt: string;
  timestamp: string;
  visible: boolean;
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
  activeToolbarFlyout: string | null; // 'generate' | 'batch' | 'analyze' | 'axes' | null
  flyToImageId: number | null;
}

export interface VisualSettings {
  imageSize: number;
  imageOpacity: number;
  removeBackground: boolean;
  layoutPadding: number; // Padding factor for canvas bounds (0.05 = 5%, 0.2 = 20%)
  coordinateScale: number; // Scale multiplier for coordinates (affects spacing between items)
  coordinateOffset: [number, number, number]; // Offset for recentering [x, y, z]
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

export interface RegionHighlight {
  center: [number, number]; // Normalized coordinates (0-1)
  title: string;
  description: string;
  suggested_prompts: string[];
  type: 'cluster' | 'gap'; // Type of region: existing cluster vs unexplored gap
  confidence?: number; // 0-1, for clusters (how dense/confident the cluster is)
}

export interface InitialPromptsRequest {
  brief: string;
}

export interface InitialPromptsResponse {
  prompts: SuggestedPrompt[];
}

export interface AnalyzeCanvasRequest {
  brief: string;
  canvas_summary: {
    num_images: number;
    clusters: Array<{
      center: [number, number];
      size: number;
      avg_prompt: string;
    }>;
    axis_labels: AxisLabels;
    bounds: {
      x_range: [number, number];
      y_range: [number, number];
    };
  };
}

export interface AnalyzeCanvasResponse {
  regions: RegionHighlight[];
}

export interface PromptVariation {
  prompt: string;
  reasoning: string;
}

export interface PendingImage {
  id: string; // temporary ID
  imageData: ImageData;
  originalPrompt: string;
  variation: PromptVariation;
  isPending: true;
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