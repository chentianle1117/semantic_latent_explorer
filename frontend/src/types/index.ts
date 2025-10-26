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
  generationMode: GenerationMode;
  removeBackground: boolean;
  isGenerating: boolean;
  isInitialized: boolean;
  generationProgress: number;
  generationCurrent: number;
  generationTotal: number;
  is3DMode: boolean;  // New: track 3D visualization mode
}

export interface VisualSettings {
  imageSize: number;
  imageOpacity: number;
  removeBackground: boolean;
  layoutPadding: number; // Padding factor for canvas bounds (0.05 = 5%, 0.2 = 20%)
  coordinateScale: number; // Scale multiplier for coordinates (affects spacing between items)
  coordinateOffset: [number, number, number]; // Offset for recentering [x, y, z]
}

export type GenerationMode = 'local-sd15' | 'fal-nanobanana';

export interface GenerateRequest {
  prompt: string;
  n_images: number;
  seed?: number;
}

export interface GenerateFromReferenceRequest {
  reference_id: number;
  prompt: string;
}

export interface InterpolateRequest {
  id_a: number;
  id_b: number;
  alpha: number;
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
