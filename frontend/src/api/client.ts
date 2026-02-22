/**
 * API client for FastAPI backend
 */

import axios from 'axios';
import type {
  AxisUpdateRequest,
  ImageData,
  HistoryGroup,
  AxisLabels,
  WebSocketMessage,
  SuggestTagsResponse,
} from '../types';

const API_BASE = '/api';
const WS_URL = `ws://${window.location.host}/ws`;

class APIClient {
  private ws: WebSocket | null = null;
  private wsCallbacks: Set<(message: WebSocketMessage) => void> = new Set();

  // Initialize CLIP only (for fal.ai mode)
  async initializeClipOnly(): Promise<void> {
    const response = await axios.post(`${API_BASE}/initialize-clip-only`);
    return response.data;
  }

  // Get current state
  async getState(): Promise<{
    images: ImageData[];
    history_groups: HistoryGroup[];
    axis_labels: AxisLabels;
    design_brief?: string | null;
    is_3d_mode?: boolean;
    cluster_centroids?: number[][];
    cluster_labels?: number[];
    grid_cell_size?: [number, number];
    clip_model_type?: 'fashionclip' | 'huggingface';
    expanded_concepts?: { x_negative?: string[]; x_positive?: string[]; y_negative?: string[]; y_positive?: string[]; z_negative?: string[]; z_positive?: string[] };
  }> {
    const response = await axios.get(`${API_BASE}/state`);
    return response.data;
  }

  // Update semantic axes
  async updateAxes(request: AxisUpdateRequest): Promise<{ status: string }> {
    const response = await axios.post(`${API_BASE}/update-axes`, request);
    return response.data;
  }

  // Delete image (soft-delete: sets visible=false on backend)
  async deleteImage(imageId: number): Promise<{ status: string }> {
    const response = await axios.delete(`${API_BASE}/images/${imageId}`);
    return response.data;
  }

  // Restore soft-deleted image
  async restoreImage(imageId: number): Promise<{ status: string }> {
    const response = await axios.post(`${API_BASE}/images/${imageId}/restore`);
    return response.data;
  }

  // Clear canvas
  async clearCanvas(): Promise<{ status: string }> {
    const response = await axios.post(`${API_BASE}/clear`);
    return response.data;
  }

  // Reapply layout spread to fix overlap
  async reapplyLayout(): Promise<{ status: string; message?: string }> {
    const response = await axios.post(`${API_BASE}/reapply-layout`);
    return response.data;
  }

  // Add external images (e.g., from fal.ai)
  async addExternalImages(request: {
    images: { url: string }[];
    prompt: string;
    generation_method: string;
    remove_background?: boolean;
    parent_ids?: number[];
    precomputed_coordinates?: [number, number];
  }): Promise<{ status: string; images: ImageData[]; history_group?: HistoryGroup }> {
    const response = await axios.post(`${API_BASE}/add-external-images`, request);
    return response.data;
  }

  // Toggle 3D mode
  async set3DMode(use3D: boolean): Promise<{ status: string; is_3d_mode: boolean; message: string }> {
    const response = await axios.post(`${API_BASE}/set-3d-mode`, null, {
      params: { use_3d: use3D }
    });
    return response.data;
  }

  // Set CLIP model
  async setClipModel(modelType: 'fashionclip' | 'huggingface'): Promise<{ status: string; model_type: string; message: string }> {
    const response = await axios.post(`${API_BASE}/set-clip-model`, null, {
      params: { model_type: modelType }
    });
    return response.data;
  }

  // WebSocket connection for real-time updates
  connectWebSocket(onMessage: (message: WebSocketMessage) => void): void {
    this.wsCallbacks.add(onMessage);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    this.ws = new WebSocket(WS_URL);

    this.ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        this.wsCallbacks.forEach((callback) => callback(message));
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    this.ws.onopen = () => {
      console.log('WebSocket connected');
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      // Attempt to reconnect after 3 seconds
      setTimeout(() => {
        if (this.wsCallbacks.size > 0) {
          this.connectWebSocket(Array.from(this.wsCallbacks)[0]);
        }
      }, 3000);
    };
  }

  disconnectWebSocket(callback: (message: WebSocketMessage) => void): void {
    this.wsCallbacks.delete(callback);

    if (this.wsCallbacks.size === 0 && this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  sendWebSocketMessage(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  // Agent endpoints
  async suggestAxes(brief: string, currentXAxis: string, currentYAxis: string): Promise<{
    suggestions: Array<{ x_axis: string; y_axis: string; reasoning: string }>;
  }> {
    const response = await axios.post(`${API_BASE}/agent/suggest-axes`, {
      brief,
      current_x_axis: currentXAxis,
      current_y_axis: currentYAxis
    });
    return response.data;
  }

  // Update design brief
  async updateDesignBrief(brief: string): Promise<{ status: string; message: string; brief: string | null }> {
    const response = await axios.post(`${API_BASE}/update-design-brief`, { brief });
    return response.data;
  }

  // Interpret brief — Gemini extracts structured design parameters
  async interpretBrief(brief: string): Promise<{
    interpretation: string;
    extracted: Array<{ key: string; label: string; value: string }>;
    unmentioned: Array<{ key: string; label: string; hint: string }>;
  }> {
    const response = await axios.post(`${API_BASE}/agent/interpret-brief`, { brief });
    return response.data;
  }

  // Update structured brief fields (user edits)
  async updateBriefFields(fields: Array<{ key: string; label: string; value: string }>): Promise<void> {
    await axios.post(`${API_BASE}/agent/update-brief-fields`, { fields });
  }

  // Get ghost node suggestions for unexplored gaps
  async suggestGhosts(brief: string, numSuggestions: number = 3): Promise<{
    ghosts: Array<{
      id: number;
      coordinates: [number, number];
      suggested_prompt: string;
      reasoning: string;
      is_ghost: boolean;
    }>;
  }> {
    const response = await axios.post(`${API_BASE}/agent/suggest-ghosts`, {
      brief,
      num_suggestions: numSuggestions
    });
    return response.data;
  }

  // Get AI-generated prompt suggestions based on current canvas context + brief
  async getContextPrompts(brief: string, referencePrompts?: string[]): Promise<{
    prompts: Array<{ prompt: string; reasoning: string }>;
  }> {
    const response = await axios.post(`${API_BASE}/agent/context-prompts`, {
      brief,
      reference_prompts: referencePrompts ?? [],
    });
    return response.data;
  }

  // Get categorized design tags (text mode) or reference image analysis (reference mode)
  async getSuggestTags(brief: string, referenceImageIds?: number[], mode?: string): Promise<SuggestTagsResponse> {
    const response = await axios.post(`${API_BASE}/agent/suggest-tags`, {
      brief,
      reference_image_ids: referenceImageIds ?? [],
      mode: mode ?? 'text',
    });
    return response.data;
  }

  // Compose a natural-language prompt from selected tags + brief
  async composePrompt(selectedTags: string[], brief: string): Promise<{ prompt: string }> {
    const response = await axios.post(`${API_BASE}/agent/compose-prompt`, {
      selected_tags: selectedTags,
      brief,
    });
    return response.data;
  }

  // Refine a prompt using AI — keeps tag phrases intact for pill rendering
  async refinePrompt(
    prompt: string,
    tags: { text: string; source: string; color: string }[],
    referenceImageIds: number[],
    brief: string
  ): Promise<{ prompt: string }> {
    const response = await axios.post(`${API_BASE}/agent/refine-prompt`, {
      prompt,
      tags,
      reference_image_ids: referenceImageIds,
      brief,
    });
    return response.data;
  }

  // Embed a ghost image via CLIP and get coordinates without adding to canvas
  async embedGhost(imageUrl: string): Promise<{
    base64_image: string;
    coordinates: [number, number];
  }> {
    const response = await axios.post(`${API_BASE}/embed-ghost`, { image_url: imageUrl });
    return response.data;
  }

  // Generate an alternative prompt for concurrent ghost (Behavior B)
  async getConcurrentPrompt(userPrompt: string, brief: string | null, referenceImageUrls: string[]): Promise<{
    prompt: string;
    reasoning: string;
    your_design_was?: string;
    this_explores?: string;
    key_shifts?: string[];
  }> {
    const response = await axios.post(`${API_BASE}/agent/concurrent-prompt`, {
      user_prompt: userPrompt,
      brief: brief ?? '',
      reference_image_urls: referenceImageUrls,
    });
    return response.data;
  }

  // ─── Session / Multi-Canvas ───────────────────────────────────────────────

  async getCurrentSession(): Promise<{ canvasId: string; canvasName: string; participantId: string; createdAt: string }> {
    const response = await axios.get(`${API_BASE}/session/current`);
    return response.data;
  }

  async saveSession(): Promise<{ success: boolean; path: string }> {
    const response = await axios.post(`${API_BASE}/sessions/save`);
    return response.data;
  }

  async listSessions(): Promise<{ sessions: Array<{ id: string; name: string; participantId: string; createdAt: string; updatedAt: string; parentCanvasId: string | null; imageCount: number }> }> {
    const response = await axios.get(`${API_BASE}/sessions/list`);
    return response.data;
  }

  async loadSession(canvasId: string): Promise<{ canvasId: string; canvasName: string; state: any }> {
    const response = await axios.post(`${API_BASE}/sessions/load`, { canvas_id: canvasId });
    return response.data;
  }

  async newCanvas(name: string, participantId?: string): Promise<{ canvasId: string; canvasName: string; participantId: string }> {
    const response = await axios.post(`${API_BASE}/sessions/new`, { name, participant_id: participantId });
    return response.data;
  }

  async branchCanvas(name: string, imageIds: number[]): Promise<{ canvasId: string; canvasName: string; parentCanvasId: string; imageCount: number }> {
    const response = await axios.post(`${API_BASE}/sessions/branch`, { name, image_ids: imageIds });
    return response.data;
  }

  async renameCanvas(name: string): Promise<{ canvasId: string; canvasName: string }> {
    const response = await axios.post(`${API_BASE}/sessions/rename`, { name });
    return response.data;
  }

  async deleteSession(canvasId: string): Promise<{ success: boolean; deleted: string }> {
    const response = await axios.post(`${API_BASE}/sessions/delete`, { canvas_id: canvasId });
    return response.data;
  }

  async setParticipant(participantId: string): Promise<{ participantId: string }> {
    const response = await axios.post(`${API_BASE}/session/set-participant`, { participant_id: participantId });
    return response.data;
  }

  async logEvent(type: string, data?: Record<string, any>): Promise<void> {
    await axios.post(`${API_BASE}/events/log`, { type, data }).catch(() => {/* fire-and-forget */});
  }

  // Sync frontend layer state to backend (called when layers change, so export is always fresh)
  async syncLayers(imageLayerMap: Record<number, string>, layerDefinitions: Array<{id: string; name: string; color: string; visible: boolean}>): Promise<void> {
    await axios.post(`${API_BASE}/sync-layers`, { imageLayerMap, layerDefinitions }).catch(() => {/* non-critical */});
  }

  // Import a canvas from a previously exported ZIP file
  async importZip(file: File): Promise<{ status: string; images_loaded: number; groups_loaded: number }> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post(`${API_BASE}/import-zip`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }
}

export const apiClient = new APIClient();
