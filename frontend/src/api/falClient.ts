/**
 * fal.ai API client for nano-banana image generation
 */

import { fal } from "@fal-ai/client";
import type { ShoeViewType } from '../types';

// ── Shoe render system prompts by view angle ──────────────────────────────────
export const SHOE_VIEW_PROMPTS: Record<ShoeViewType, string> = {
  'side':
    'side view, a realistic rendering of a shoe, toe towards right, white background, without logo',
  '3/4-front':
    'three-quarter front view from the toe-side, a realistic rendering of a shoe angled diagonally showing the front and lateral side, toe pointing towards bottom-right, white background, without logo',
  '3/4-back':
    'three-quarter back view from the heel-side, a realistic rendering of a shoe angled diagonally showing the heel and medial side, heel pointing towards bottom-left, white background, without logo',
};

// ── Mood board / sketch style presets ────────────────────────────────────────
// Each prompt is designed to keep generation in the low-fi / sketch / concept realm.
// They are comprehensive to cover different stylistic approaches designers use.
export const MOOD_BOARD_STYLES: Record<string, { label: string; prompt: string }> = {
  'concept-sheet': {
    label: 'Concept Sheet',
    prompt:
      'a professional design concept exploration sheet, multiple rough sketches showing form studies from different angles, hand-drawn pencil and marker style with confident gestural strokes, rough silhouette explorations and proportion studies, color palette swatches along the edge, material callout annotations with arrow lines, designer notes and measurements, industrial design presentation board layout, clean white background',
  },
  'marker-render': {
    label: 'Marker Render',
    prompt:
      'a design marker rendering board, bold confident Copic marker illustration showing a product concept in dramatic perspective, smooth color gradients from light to shadow, crisp highlight lines, secondary smaller sketches showing design details and construction, color exploration swatches, expressive loose linework with final clean outlines, professional industrial design sketch style, white background',
  },
  'collage-mood': {
    label: 'Collage Mood Board',
    prompt:
      'a creative mood board collage, mixed media layout combining fabric texture swatches, Pantone color chips, close-up material photography, abstract geometric shape studies, silhouette sketches, inspirational imagery fragments, small typography labels, hand-written designer notes, overlapping editorial layout with varied scale elements, captures design direction and emotional tone, white background',
  },
  'technical-flat': {
    label: 'Technical Flat',
    prompt:
      'a design technical specification flat drawing sheet, precise clean line-art blueprints showing multiple orthographic views, exploded component breakdown diagram, cross-section callout circles highlighting construction details, stitching and seam line indicators, material zone labels with leader lines, color-fill zones shown as flat swatches, engineering drawing aesthetic with title block, minimal color on white background',
  },
  'abstract-gesture': {
    label: 'Abstract Gesture',
    prompt:
      'an abstract gestural design exploration sheet, loose energetic brush and ink strokes suggesting form and movement without photorealistic detail, multiple rapid gesture drawings at different scales, focus on overall proportions and attitude rather than surface details, charcoal smudge and ink wash techniques, expressive spontaneous linework, some areas more defined than others creating focal points, white background with raw paper texture feel',
  },
  'vintage-blueprint': {
    label: 'Vintage Blueprint',
    prompt:
      'a vintage-style design blueprint illustration, sepia-toned or aged paper background with precise technical line drawings from multiple orthographic views, hand-lettered annotations and measurements, cross-hatch shading for depth, patent drawing aesthetic with numbered callout labels, elegant serif lettering for labels, detailed construction breakdowns, classic industrial design documentation style',
  },
  'editorial-concept': {
    label: 'Editorial Concept',
    prompt:
      'a high-concept editorial style board, sophisticated layout mixing dramatic visual compositions with abstract material texture crops, color story with gradient swatches, inspirational lifestyle imagery fragments, clean modern typography labels, negative space composition, design concepts shown as both rendered forms and stripped-down silhouettes, design brief keywords overlaid as ghost text, professional brand presentation aesthetic, white background',
  },
};

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

// Stronger diversity suffixes for mood boards (concept exploration needs more variation)
const MOOD_BOARD_DIVERSITY_SUFFIXES = [
  ", completely different layout composition, unique sketch arrangement, fresh color story",
  ", radically different design direction, unexpected material exploration, bold new perspective",
  ", alternative form language exploration, contrasting silhouette study, distinct mood",
  ", different artistic technique emphasis, varied line weight and texture, new proportions",
  ", opposite design philosophy approach, minimalist vs maximalist contrast, surprising combination",
  ", unique cultural influence blending, innovative construction method focus, abstract interpretation",
  ", dramatic scale and proportion variation, raw gestural energy, experimental media mix",
  ", focused detail study vs wide overview contrast, different annotation style, fresh hierarchy",
];

// Configure fal.ai with API key from environment
const FAL_API_KEY = import.meta.env.VITE_FAL_API_KEY;

if (FAL_API_KEY && FAL_API_KEY !== 'your_fal_api_key_here') {
  fal.config({
    credentials: FAL_API_KEY
  });
}

export interface GenerationConfig {
  realm?: 'shoe' | 'mood-board';
  shoeView?: ShoeViewType;       // which shoe angle (when realm='shoe')
  moodBoardStyle?: string;       // key into MOOD_BOARD_STYLES (when realm='mood-board')
}

export interface FalTextToImageRequest {
  prompt: string;
  num_images?: number;
  output_format?: "jpeg" | "png";
  aspect_ratio?: "21:9" | "1:1" | "4:3" | "3:2" | "2:3" | "5:4" | "4:5" | "3:4" | "16:9" | "9:16";
  sync_mode?: boolean;
  genConfig?: GenerationConfig;  // realm/view configuration
}

export interface FalImageEditRequest {
  prompt: string;
  image_urls: string[];
  num_images?: number;
  output_format?: "jpeg" | "png";
  aspect_ratio?: "21:9" | "1:1" | "4:3" | "3:2" | "2:3" | "5:4" | "4:5" | "3:4" | "16:9" | "9:16";
  sync_mode?: boolean;
  genConfig?: GenerationConfig;  // realm/view configuration
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

      // Resolve system prompt from realm config
      const cfg = request.genConfig;
      let systemPrompt: string;
      let aspectRatio = request.aspect_ratio || "1:1";
      if (cfg?.realm === 'mood-board') {
        const style = cfg.moodBoardStyle || 'concept-sheet';
        systemPrompt = MOOD_BOARD_STYLES[style]?.prompt ?? MOOD_BOARD_STYLES['concept-sheet'].prompt;
        aspectRatio = "3:2";
      } else {
        const view = cfg?.shoeView || 'side';
        systemPrompt = SHOE_VIEW_PROMPTS[view] ?? SHOE_VIEW_PROMPTS['side'];
      }

      // Combine system prompt with user prompt
      const basePrompt = `${systemPrompt}, ${request.prompt}`;
      console.log("Base prompt:", basePrompt);
      console.log(`Generating ${numImages} images individually for maximum diversity`);

      const allImages: FalImageFile[] = [];

      // Generate each image individually with a unique diversity suffix
      // This produces much more varied results than batching num_images > 1
      const diversitySuffixes = (cfg?.realm === 'mood-board') ? MOOD_BOARD_DIVERSITY_SUFFIXES : DIVERSITY_SUFFIXES;
      for (let i = 0; i < numImages; i++) {
        const suffix = diversitySuffixes[i % diversitySuffixes.length];
        const fullPrompt = numImages > 1 ? `${basePrompt}${suffix}` : basePrompt;
        console.log(`📦 Image ${i + 1}/${numImages}: Generating...`);

        const result = await fal.subscribe("fal-ai/nano-banana", {
          input: {
            prompt: fullPrompt,
            num_images: 1,
            output_format: request.output_format || "jpeg",
            aspect_ratio: aspectRatio
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
   *
   * For mood boards with shoe references: restructures prompt to emphasize
   * concept abstraction rather than image reproduction.
   * For 3/4 views: uses explicit angle-change instructions.
   */
  async generateImageEdit(request: FalImageEditRequest): Promise<FalImageEditResponse> {
    try {
      const cfg = request.genConfig;
      const isMoodBoard = cfg?.realm === 'mood-board';
      const is34View = cfg?.shoeView === '3/4-front' || cfg?.shoeView === '3/4-back';
      let aspectRatio = request.aspect_ratio || "1:1";

      // Build the base prompt depending on mode
      let basePrompt: string;

      if (isMoodBoard) {
        const style = cfg?.moodBoardStyle || 'concept-sheet';
        const stylePrompt = MOOD_BOARD_STYLES[style]?.prompt ?? MOOD_BOARD_STYLES['concept-sheet'].prompt;
        aspectRatio = "3:2";

        // For mood boards: strongly instruct to CREATE A NEW ARTWORK, not reproduce the reference
        basePrompt = [
          `Create a BRAND NEW original artwork: ${stylePrompt}`,
          `Use the reference image(s) ONLY as abstract inspiration — extract their mood, feeling, colors, textures, shapes, and design language`,
          `but DO NOT reproduce, copy, or render the reference image(s) directly.`,
          `The output must be a conceptual style board, design sketch sheet, or mood board — artistic, expressive, and low-fidelity.`,
          `Avoid photorealistic product renders. Focus on feeling, atmosphere, material exploration, and design direction.`,
          request.prompt ? `Creative direction: ${request.prompt}` : '',
        ].filter(Boolean).join('. ');
      } else if (is34View) {
        const viewPrompt = SHOE_VIEW_PROMPTS[cfg!.shoeView!];
        // For 3/4 views: strongly instruct to CHANGE THE VIEWING ANGLE
        basePrompt = [
          `Take this exact shoe design and REDRAW it from a completely different camera angle.`,
          `New angle: ${viewPrompt}`,
          `Keep the SAME shoe design, materials, colors, and details — only change the viewing angle and perspective.`,
          `The shoe must look identical in design but photographed from the specified angle.`,
          request.prompt ? `Shoe description: ${request.prompt}` : '',
        ].filter(Boolean).join('. ');
      } else {
        // Standard shoe iteration from reference
        const view = cfg?.shoeView || 'side';
        const systemPrompt = SHOE_VIEW_PROMPTS[view] ?? SHOE_VIEW_PROMPTS['side'];
        basePrompt = `${systemPrompt}, ${request.prompt}`;
      }

      const numImages = Math.min(request.num_images || 1, 8);
      // Cap reference images to 4 per fal.ai limits
      const cappedUrls = request.image_urls.slice(0, 4);
      const diversitySuffixes = isMoodBoard ? MOOD_BOARD_DIVERSITY_SUFFIXES : DIVERSITY_SUFFIXES;

      console.log(`[${isMoodBoard ? 'mood-board' : is34View ? '3/4-view' : 'shoe'}] Generating ${numImages} edit images individually`);
      console.log("Base prompt:", basePrompt.substring(0, 200) + "...");

      const allImages: FalImageFile[] = [];

      for (let i = 0; i < numImages; i++) {
        const suffix = numImages > 1 ? diversitySuffixes[i % diversitySuffixes.length] : "";
        const fullPrompt = suffix ? `${basePrompt}${suffix}` : basePrompt;
        console.log(`📦 Edit ${i + 1}/${numImages}: Generating...`);

        const result = await fal.subscribe("fal-ai/nano-banana/edit", {
          input: {
            prompt: fullPrompt,
            image_urls: cappedUrls,
            num_images: 1,
            output_format: request.output_format || "jpeg",
            aspect_ratio: aspectRatio,
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
