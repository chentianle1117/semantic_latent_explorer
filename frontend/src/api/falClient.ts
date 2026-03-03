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
    'three-quarter front view of a right-foot shoe. The camera is rotated approximately 45 degrees counterclockwise from the standard side view, facing the front-lateral corner of the shoe. The toe points to the RIGHT and slightly toward the camera. You can see the lateral side, the toe box, and a glimpse of the top — revealing three faces of the shoe. Realistic rendering, white background, without logo',
  '3/4-back':
    'three-quarter back view of a right-foot shoe. The camera is at the diagonally opposite angle from the 3/4-front — rotated approximately 45 degrees clockwise from the standard side view, facing the heel-medial corner. The toe points to the LEFT and away from the camera. You can see the medial side, the heel counter, and a glimpse of the top — revealing the opposite three faces. Realistic rendering, white background, without logo',
  'top':
    'top-down bird\'s eye view looking straight down at a shoe, showing the full outline of the upper, lacing system, tongue, and toe box shape from above, white background, without logo',
  'medial':
    'medial inner-side view, a realistic rendering of a shoe from the inner arch side, showing the medial upper panel, arch support area, and inner heel counter, toe towards left, white background, without logo',
  'front':
    'front view looking directly at the toe of a shoe, showing the toe box shape, front upper, and the front profile of the sole unit, centered composition, white background, without logo',
  'back':
    'rear heel view looking directly at the back of a shoe, showing the heel counter, pull tab, rear sole profile, and Achilles collar, centered composition, white background, without logo',
  'outsole':
    'bottom outsole view looking straight up at the sole of a shoe, showing the full tread pattern, rubber outsole design, flex grooves, and brand markings on the bottom, centered composition, white background, without logo',
};

// Human-readable labels for each view type
export const SHOE_VIEW_LABELS: Record<ShoeViewType, string> = {
  'side': 'Side',
  '3/4-front': '3/4 Front',
  '3/4-back': '3/4 Back',
  'top': 'Top',
  'medial': 'Medial',
  'front': 'Front',
  'back': 'Back',
  'outsole': 'Outsole',
};

// All satellite view types (everything except 'side')
export const SATELLITE_VIEWS: ShoeViewType[] = ['3/4-front', '3/4-back', 'top', 'outsole', 'medial', 'front', 'back'];

// ── Mood board / sketch style presets ────────────────────────────────────────
// Each prompt is designed to keep generation in the low-fi / sketch / concept realm.
// They are comprehensive to cover different stylistic approaches designers use.
export const MOOD_BOARD_STYLES: Record<string, { label: string; prompt: string }> = {
  'concept-sheet': {
    label: 'Concept Sheet',
    prompt:
      'a professional shoe design concept exploration sheet, multiple rough sketches of shoe designs from different angles, hand-drawn pencil and marker style with confident gestural strokes, shoe silhouette explorations showing sole, upper, toe box, and heel proportions, color palette swatches along the edge, material callout annotations with arrow lines pointing to shoe parts, footwear designer notes and measurements, industrial design presentation board layout, clean white background',
  },
  'marker-render': {
    label: 'Marker Render',
    prompt:
      'a shoe design marker rendering board, bold confident Copic marker illustration showing a shoe concept in dramatic perspective, smooth color gradients from light to shadow on the upper and sole, crisp highlight lines on shoe surfaces, secondary smaller sketches showing sole tread pattern, heel detail, and construction, color exploration swatches, expressive loose linework with final clean shoe outlines, professional footwear design sketch style, white background',
  },
  'collage-mood': {
    label: 'Collage Mood Board',
    prompt:
      'a creative shoe design mood board collage, mixed media layout combining leather and fabric texture swatches, Pantone color chips, close-up material photography of soles and uppers, abstract geometric shape studies of shoe silhouettes, rough shoe sketches, inspirational footwear imagery fragments, small typography labels, hand-written designer notes about construction, overlapping editorial layout with varied scale elements, captures shoe design direction and emotional tone, white background',
  },
  'technical-flat': {
    label: 'Technical Flat',
    prompt:
      'a shoe design technical specification flat drawing sheet, precise clean line-art blueprints showing shoe from side, top, bottom, and back views, exploded component breakdown of sole unit, upper, insole, and lacing system, cross-section callout circles highlighting shoe construction details, stitching and seam line indicators on the upper, material zone labels with leader lines, outsole tread pattern detail, engineering drawing aesthetic with title block, minimal color on white background',
  },
  'abstract-gesture': {
    label: 'Abstract Gesture',
    prompt:
      'an abstract gestural shoe design exploration sheet, loose energetic brush and ink strokes suggesting shoe forms and movement without photorealistic detail, multiple rapid gesture drawings of shoe silhouettes at different scales, focus on overall shoe proportions, toe shape, and heel attitude rather than surface details, charcoal smudge and ink wash techniques, expressive spontaneous linework capturing the essence of footwear form, some areas more defined than others creating focal points, white background with raw paper texture feel',
  },
  'vintage-blueprint': {
    label: 'Vintage Blueprint',
    prompt:
      'a vintage-style shoe design blueprint illustration, sepia-toned or aged paper background with precise technical line drawings of a shoe from multiple orthographic views, hand-lettered annotations and measurements for sole height, upper dimensions, and toe box angle, cross-hatch shading for depth on shoe surfaces, patent drawing aesthetic with numbered callout labels for shoe components, elegant serif lettering for labels, detailed footwear construction breakdowns, classic industrial design documentation style',
  },
  'editorial-concept': {
    label: 'Editorial Concept',
    prompt:
      'a high-concept editorial shoe design style board, sophisticated layout mixing dramatic shoe compositions with abstract material texture crops of leather, mesh, and rubber, color story with gradient swatches, inspirational footwear lifestyle imagery fragments, clean modern typography labels, negative space composition, shoe design concepts shown as both rendered forms and stripped-down sole and upper silhouettes, design brief keywords overlaid as ghost text, professional footwear brand presentation aesthetic, white background',
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
  ", completely different shoe sketch layout composition, unique footwear design arrangement, fresh color story",
  ", radically different shoe design direction, unexpected material exploration for the upper, bold new sole perspective",
  ", alternative shoe form language exploration, contrasting silhouette study of heel and toe, distinct mood",
  ", different artistic technique emphasis on shoe surfaces, varied line weight and texture, new proportions",
  ", opposite shoe design philosophy approach, minimalist vs maximalist contrast, surprising construction combination",
  ", unique cultural footwear influence blending, innovative sole construction method focus, abstract shoe interpretation",
  ", dramatic shoe scale and proportion variation, raw gestural energy, experimental media mix",
  ", focused shoe detail study vs wide overview contrast, different annotation style, fresh design hierarchy",
];

/**
 * Extract a hard shoe-type constraint string from the user's structured brief fields.
 * Only constrains shoe_type and silhouette — not material/color/mood which users may want to vary.
 * Returns empty string if no relevant fields are filled.
 */
export function extractBriefConstraint(briefFields: Array<{ key: string; label: string; value: string }>): string {
  const get = (key: string) => briefFields.find(f => f.key === key)?.value?.trim() || '';
  const shoeType = get('shoe_type');
  const silhouette = get('silhouette');
  if (!shoeType && !silhouette) return '';
  const parts: string[] = [];
  if (shoeType) parts.push(`This MUST be a ${shoeType}`);
  if (silhouette) parts.push(`${shoeType ? 'with' : 'This MUST have'} a ${silhouette} silhouette`);
  return parts.join(', ') + '. Do not change the shoe type or silhouette — only vary aesthetics, materials, colors, and surface details';
}

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
  briefConstraint?: string;      // hard shoe-type constraint from design brief
}

export interface FalImageEditRequest {
  prompt: string;
  image_urls: string[];
  num_images?: number;
  output_format?: "jpeg" | "png";
  aspect_ratio?: "21:9" | "1:1" | "4:3" | "3:2" | "2:3" | "5:4" | "4:5" | "3:4" | "16:9" | "9:16";
  sync_mode?: boolean;
  genConfig?: GenerationConfig;  // realm/view configuration
  briefConstraint?: string;      // hard shoe-type constraint from design brief
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

      // Brief constraint is the TOP-MOST priority — placed first so image models parse it before anything else
      const basePrompt = (request.briefConstraint && cfg?.realm !== 'mood-board')
        ? `STRICT REQUIREMENT — ${request.briefConstraint}. ${systemPrompt}, ${request.prompt}`
        : `${systemPrompt}, ${request.prompt}`;
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
      const isSatelliteView = cfg?.shoeView && cfg.shoeView !== 'side';
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
      } else if (isSatelliteView) {
        const viewPrompt = SHOE_VIEW_PROMPTS[cfg!.shoeView!];
        // For satellite views: strongly instruct to CHANGE THE VIEWING ANGLE
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
        // Constraint FIRST — ensures image model reads it before any styling instructions
        basePrompt = [
          request.briefConstraint ? `STRICT REQUIREMENT — ${request.briefConstraint}` : null,
          systemPrompt,
          `Use the reference image(s) as DESIGN INSPIRATION — extract their color palette, textures, patterns, mood, and design language.`,
          `Do NOT literally copy or paste elements from the references onto the shoe.`,
          `Instead, create a new shoe design that is INSPIRED BY the aesthetic qualities of the references.`,
          request.prompt,
        ].filter(Boolean).join('. ');
      }

      const numImages = Math.min(request.num_images || 1, 8);
      // Cap reference images to 4 per fal.ai limits
      const cappedUrls = request.image_urls.slice(0, 4);
      const diversitySuffixes = isMoodBoard ? MOOD_BOARD_DIVERSITY_SUFFIXES : DIVERSITY_SUFFIXES;

      console.log(`[${isMoodBoard ? 'mood-board' : isSatelliteView ? 'satellite-view' : 'shoe'}] Generating ${numImages} edit images individually`);
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
   * Generate a 5-view multi-view sheet using a template + side view as dual reference.
   * Template provides positional layout; side view provides shoe design.
   * Returns a single image URL. Use sliceMultiViewSheet() to split into 5 views.
   */
  async generateMultiViewSheet(
    prompt: string,
    sideViewUrl: string,
    templateUrl: string,
    options?: { outputFormat?: string; additionalRefUrls?: string[] }
  ): Promise<{ url: string }> {
    const positions = [
      `The 5 positions are:`,
      `- TOP-LEFT: medial (inner side) view, toe pointing left`,
      `- TOP-RIGHT: top-down bird's eye view looking straight down at the shoe`,
      `- BOTTOM-LEFT: front toe view, looking directly at the toe box`,
      `- BOTTOM-CENTER: rear heel view, looking at the back of the shoe`,
      `- BOTTOM-RIGHT: outsole (bottom sole) view, looking up at the tread pattern`,
    ];

    const sheetPrompt = [
      `Generate a multi-view shoe sheet based on this template layout.`,
      `The template shows labeled bounding boxes — these are POSITION GUIDES ONLY.`,
      `Do NOT reproduce the bounding boxes, borders, rounded rectangles, or text labels in the output.`,
      `Instead, place the exact shoe from the reference photo at each position on a clean white background.`,
      ...positions,
      `Keep the EXACT same shoe design in every position — only the camera angle changes.`,
      `White background everywhere. No borders, no text, no grid lines.`,
      prompt ? `Shoe: ${prompt}` : '',
    ].filter(Boolean).join(' ');

    // Build image_urls: primary reference + optional additional refs + template (max 4 total)
    const imageUrls = [sideViewUrl, ...(options?.additionalRefUrls || []), templateUrl].slice(0, 4);

    console.log(`[multi-view-sheet] Generating 5-view template sheet...`);
    console.log('[multi-view-sheet] PROMPT:', sheetPrompt);
    console.log('[multi-view-sheet] image_urls:', imageUrls);
    console.log('[multi-view-sheet] aspect_ratio: 3:2');

    const result = await fal.subscribe("fal-ai/nano-banana/edit", {
      input: {
        prompt: sheetPrompt,
        image_urls: imageUrls,
        num_images: 1,
        output_format: options?.outputFormat || "jpeg",
        aspect_ratio: "3:2",
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          update.logs.map((log) => log.message).forEach(console.log);
        }
      },
    });

    const data = result.data as FalImageEditResponse;
    if (!data.images.length) throw new Error('Multi-view sheet generation returned no images');
    console.log(`[multi-view-sheet] ✓ 5-view sheet generated, URL:`, data.images[0].url);
    return { url: data.images[0].url };
  }

  /**
   * Generate a 2-view 3/4 sheet using a template + side view as dual reference.
   * Template provides positional layout; side view provides shoe design.
   * Returns a single image URL. Use sliceQuarterSheet() to split into 2 views.
   */
  async generateQuarterViewSheet(
    prompt: string,
    sideViewUrl: string,
    templateUrl: string,
    options?: { outputFormat?: string }
  ): Promise<{ url: string }> {
    const sheetPrompt = [
      `Generate two three-quarter angle views of the shoe from the reference photo, using the template for positioning.`,
      `The template bounding boxes and text are POSITION GUIDES ONLY — do NOT reproduce them.`,
      `The reference photo shows a right-foot shoe from the standard side view with toe pointing right.`,
      `Place shoes on a clean white background at these positions:`,
      `- LEFT (3/4-front): Rotate the camera ~45 degrees counterclockwise from the side view, facing the front-lateral corner. The toe still points to the RIGHT and slightly toward the camera. You see the lateral side, toe box, and a glimpse of the top — three faces of the shoe.`,
      `- RIGHT (3/4-back): The diagonally opposite camera angle. Rotate ~45 degrees clockwise from the side view, facing the heel-medial corner. The toe points to the LEFT and away from the camera. You see the medial side, heel counter, and a glimpse of the top — the opposite three faces.`,
      `Together these two views plus the side view reveal all six sides of the shoe.`,
      `Same shoe design in both views. White background. No borders, no text.`,
      prompt ? `Shoe: ${prompt}` : '',
    ].filter(Boolean).join(' ');

    console.log('[quarter-view-sheet] Generating 3/4-view sheet...');
    console.log('[quarter-view-sheet] PROMPT:', sheetPrompt);
    console.log('[quarter-view-sheet] image_urls:', [sideViewUrl, templateUrl]);
    console.log('[quarter-view-sheet] aspect_ratio: 16:9');

    const result = await fal.subscribe("fal-ai/nano-banana/edit", {
      input: {
        prompt: sheetPrompt,
        image_urls: [sideViewUrl, templateUrl],
        num_images: 1,
        output_format: options?.outputFormat || "jpeg",
        aspect_ratio: "16:9",
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          update.logs.map((log) => log.message).forEach(console.log);
        }
      },
    });

    const data = result.data as FalImageEditResponse;
    if (!data.images.length) throw new Error('3/4 view sheet generation returned no images');
    console.log('[quarter-view-sheet] ✓ 3/4-view sheet generated, URL:', data.images[0].url);
    return { url: data.images[0].url };
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
