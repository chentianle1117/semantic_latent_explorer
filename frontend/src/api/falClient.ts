/**
 * fal.ai API client for nano-banana image generation
 */

import { fal } from "@fal-ai/client";

// System prompt for consistent shoe generation
const NANO_BANANA_SYSTEM_PROMPT = "side view, a realistic rendering of a shoe, toe towards right, white background, without logo";

// Diversity suffixes to append to each batch for more varied results
const DIVERSITY_SUFFIXES = [
  ", unique creative interpretation, bold design choices",
  ", distinctive style variation, unexpected material combination",
  ", fresh perspective, novel silhouette, inventive details",
  ", experimental design approach, striking visual contrast",
  ", unconventional proportions, creative color palette",
  ", artistic reinterpretation, innovative construction",
  ", avant-garde aesthetic, surprising texture mix",
  ", dynamic form factor, eye-catching details",
];

// Configure fal.ai with API key from environment
const FAL_API_KEY = import.meta.env.VITE_FAL_API_KEY;

if (FAL_API_KEY && FAL_API_KEY !== 'your_fal_api_key_here') {
  fal.config({
    credentials: FAL_API_KEY
  });
}

export interface FalTextToImageRequest {
  prompt: string;
  num_images?: number;
  output_format?: "jpeg" | "png";
  aspect_ratio?: "21:9" | "1:1" | "4:3" | "3:2" | "2:3" | "5:4" | "4:5" | "3:4" | "16:9" | "9:16";
  sync_mode?: boolean;
}

export interface FalImageEditRequest {
  prompt: string;
  image_urls: string[];
  num_images?: number;
  output_format?: "jpeg" | "png";
  aspect_ratio?: "21:9" | "1:1" | "4:3" | "3:2" | "2:3" | "5:4" | "4:5" | "3:4" | "16:9" | "9:16";
  sync_mode?: boolean;
}

export interface FalImageFile {
  url: string;
  content_type?: string;
  file_name?: string;
  file_size?: number;
}

export interface FalTextToImageResponse {
  images: FalImageFile[];
  description?: string;
}

export interface FalImageEditResponse {
  images: FalImageFile[];
  description?: string;
}

class FalClient {
  /**
   * Generate images from text prompt using nano-banana
   * Note: nano-banana has a max of 4 images per request, so we batch if needed
   */
  async generateTextToImage(request: FalTextToImageRequest): Promise<FalTextToImageResponse> {
    try {
      const numImages = request.num_images || 1;

      // Combine system prompt with user prompt
      const basePrompt = `${NANO_BANANA_SYSTEM_PROMPT}, ${request.prompt}`;
      console.log("Base prompt:", basePrompt);
      console.log(`Generating ${numImages} images individually for maximum diversity`);

      const allImages: FalImageFile[] = [];

      // Generate each image individually with a unique diversity suffix
      // This produces much more varied results than batching num_images > 1
      for (let i = 0; i < numImages; i++) {
        const suffix = DIVERSITY_SUFFIXES[i % DIVERSITY_SUFFIXES.length];
        const fullPrompt = numImages > 1 ? `${basePrompt}${suffix}` : basePrompt;
        console.log(`📦 Image ${i + 1}/${numImages}: Generating...`);

        const result = await fal.subscribe("fal-ai/nano-banana", {
          input: {
            prompt: fullPrompt,
            num_images: 1,
            output_format: request.output_format || "jpeg",
            aspect_ratio: request.aspect_ratio || "1:1"
          },
          logs: true,
          onQueueUpdate: (update) => {
            if (update.status === "IN_PROGRESS") {
              update.logs.map((log) => log.message).forEach(console.log);
            }
          },
        });

        const batchData = result.data as FalTextToImageResponse;
        allImages.push(...batchData.images);
        console.log(`✓ Image ${i + 1}/${numImages} complete`);
      }

      console.log(`✓ All ${allImages.length} images generated`);

      return {
        images: allImages,
        description: `Generated ${allImages.length} images`
      };
    } catch (error) {
      console.error("fal.ai text-to-image generation failed:", error);
      throw error;
    }
  }

  /**
   * Edit images using reference images with nano-banana/edit.
   * Generates each image individually with a unique diversity suffix,
   * matching the approach of generateTextToImage for maximum variation.
   */
  async generateImageEdit(request: FalImageEditRequest): Promise<FalImageEditResponse> {
    try {
      const basePrompt = `${NANO_BANANA_SYSTEM_PROMPT}, ${request.prompt}`;
      const numImages = Math.min(request.num_images || 1, 8);
      // Cap reference images to 4 per fal.ai limits
      const cappedUrls = request.image_urls.slice(0, 4);

      console.log(`Generating ${numImages} edit images individually for maximum diversity`);

      const allImages: FalImageFile[] = [];

      for (let i = 0; i < numImages; i++) {
        const suffix = numImages > 1 ? DIVERSITY_SUFFIXES[i % DIVERSITY_SUFFIXES.length] : "";
        const fullPrompt = suffix ? `${basePrompt}${suffix}` : basePrompt;
        console.log(`📦 Edit ${i + 1}/${numImages}: Generating...`);

        const result = await fal.subscribe("fal-ai/nano-banana/edit", {
          input: {
            prompt: fullPrompt,
            image_urls: cappedUrls,
            num_images: 1,
            output_format: request.output_format || "jpeg",
            aspect_ratio: request.aspect_ratio,
          },
          logs: true,
          onQueueUpdate: (update) => {
            if (update.status === "IN_PROGRESS") {
              update.logs.map((log) => log.message).forEach(console.log);
            }
          },
        });

        const data = result.data as FalImageEditResponse;
        allImages.push(...data.images);
        console.log(`✓ Edit ${i + 1}/${numImages} complete`);
      }

      console.log(`✓ All ${allImages.length} edit images generated`);

      return {
        images: allImages,
        description: `Generated ${allImages.length} variations`,
      };
    } catch (error) {
      console.error("fal.ai image edit generation failed:", error);
      throw error;
    }
  }

  /**
   * Upload a file to fal.ai storage (for reference images)
   */
  async uploadFile(file: File): Promise<string> {
    try {
      const url = await fal.storage.upload(file);
      return url;
    } catch (error) {
      console.error("fal.ai file upload failed:", error);
      throw error;
    }
  }

  /**
   * Check if API key is configured
   */
  isConfigured(): boolean {
    return !!FAL_API_KEY && FAL_API_KEY !== 'your_fal_api_key_here';
  }
}

export const falClient = new FalClient();
