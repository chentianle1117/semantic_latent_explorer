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
  }> {
    const response = await axios.get(`${API_BASE}/state`);
    return response.data;
  }

  // Update semantic axes
  async updateAxes(request: AxisUpdateRequest): Promise<{ status: string }> {
    const response = await axios.post(`${API_BASE}/update-axes`, request);
    return response.data;
  }

  // Delete image
  async deleteImage(imageId: number): Promise<{ status: string }> {
    const response = await axios.delete(`${API_BASE}/images/${imageId}`);
    return response.data;
  }

  // Clear canvas
  async clearCanvas(): Promise<{ status: string }> {
    const response = await axios.post(`${API_BASE}/clear`);
    return response.data;
  }

  // Add external images (e.g., from fal.ai)
  async addExternalImages(request: {
    images: { url: string }[];
    prompt: string;
    generation_method: string;
    remove_background?: boolean;
    parent_ids?: number[];
  }): Promise<{ status: string; images: ImageData[] }> {
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
  async generateVariation(originalPrompt: string, brief: string, numVariations: number = 2): Promise<{
    variations: Array<{ prompt: string; reasoning: string }>;
  }> {
    const response = await axios.post('http://localhost:8000/api/agent/generate-variation', {
      original_prompt: originalPrompt,
      brief,
      num_variations: numVariations
    });
    return response.data;
  }

  async suggestAxes(brief: string, currentXAxis: string, currentYAxis: string): Promise<{
    suggestions: Array<{ x_axis: string; y_axis: string; reasoning: string }>;
  }> {
    const response = await axios.post('http://localhost:8000/api/agent/suggest-axes', {
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
}

export const apiClient = new APIClient();
