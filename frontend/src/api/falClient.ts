/**
 * fal.ai API client for nano-banana image generation
 */

import { fal } from "@fal-ai/client";

// System prompt for consistent shoe generation
const NANO_BANANA_SYSTEM_PROMPT = "side view, a realistic rendering of a shoe, toe towards right, white background, without logo";

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
      const MAX_IMAGES_PER_BATCH = 4; // fal.ai nano-banana limit

      // Combine system prompt with user prompt
      const fullPrompt = `${NANO_BANANA_SYSTEM_PROMPT}, ${request.prompt}`;
      console.log("Full prompt:", fullPrompt);
      console.log(`Generating ${numImages} images (batches of ${MAX_IMAGES_PER_BATCH})`);

      const allImages: FalImageFile[] = [];

      // Calculate number of batches needed
      const numBatches = Math.ceil(numImages / MAX_IMAGES_PER_BATCH);

      for (let batchIdx = 0; batchIdx < numBatches; batchIdx++) {
        const imagesInThisBatch = Math.min(
          MAX_IMAGES_PER_BATCH,
          numImages - (batchIdx * MAX_IMAGES_PER_BATCH)
        );

        console.log(`📦 Batch ${batchIdx + 1}/${numBatches}: Generating ${imagesInThisBatch} images...`);

        const result = await fal.subscribe("fal-ai/nano-banana", {
          input: {
            prompt: fullPrompt,
            num_images: imagesInThisBatch,
            output_format: request.output_format || "jpeg",
            aspect_ratio: request.aspect_ratio || "1:1",
            sync_mode: request.sync_mode
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
        console.log(`✓ Batch ${batchIdx + 1}/${numBatches} complete: ${batchData.images.length} images`);
      }

      console.log(`✓ All batches complete: ${allImages.length} total images`);

      return {
        images: allImages,
        description: `Generated ${allImages.length} images in ${numBatches} batch(es)`
      };
    } catch (error) {
      console.error("fal.ai text-to-image generation failed:", error);
      throw error;
    }
  }

  /**
   * Edit images using reference images with nano-banana/edit
   */
  async generateImageEdit(request: FalImageEditRequest): Promise<FalImageEditResponse> {
    try {
      // Combine system prompt with user prompt
      const fullPrompt = `${NANO_BANANA_SYSTEM_PROMPT}, ${request.prompt}`;
      console.log("Full prompt for edit:", fullPrompt);

      const result = await fal.subscribe("fal-ai/nano-banana/edit", {
        input: {
          prompt: fullPrompt,
          image_urls: request.image_urls,
          num_images: request.num_images || 1,
          output_format: request.output_format || "jpeg",
          aspect_ratio: request.aspect_ratio,
          sync_mode: request.sync_mode
        },
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === "IN_PROGRESS") {
            update.logs.map((log) => log.message).forEach(console.log);
          }
        },
      });

      return result.data as FalImageEditResponse;
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
