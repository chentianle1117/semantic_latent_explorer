# Iterative Semantic Generation Workflow - User Guide

## Overview

This guide demonstrates how to use the new **Iterative Semantic Generation** feature in the Zappos Semantic Explorer. This feature allows you to generate shoe designs using Stable Diffusion and see them automatically positioned in the CLIP semantic space alongside real images.

## Quick Start

### 1. Initialize the Generator

1. Launch the app: `streamlit run app.py`
2. In the sidebar, find the **🎨 Generation Workflow** section
3. Click **"Initialize Generator"** (this loads Stable Diffusion models, takes ~30 seconds)
4. Wait for "Generator ready!" confirmation

### 2. Generate Initial Batch

**Mode:** Initial batch

- **Prompt:** Enter a text description (e.g., "sporty premium sneaker design")
- **Number of images:** Choose 4-20 images (start with 12)
- Click **"Generate Batch"**
- Watch the progress bar as images are generated (~45-60 seconds for 12 images)
- Images automatically appear in the semantic space!

### 3. Refine with Reference + Text

**Mode:** From reference + text

- **Purpose:** Generate variations of an existing design
- **Reference image index:** Enter the index of an image you like
- **Additional description:** Add text to guide the variation (e.g., "more premium looking", "add leather texture")
- Preview shows your reference image
- Click **"Generate from Reference"**
- New image appears near the reference in semantic space

### 4. Blend Two Designs

**Mode:** Interpolate between two

- **Purpose:** Combine characteristics from two different shoes
- **First image:** Index of first design
- **Second image:** Index of second design
- Preview shows both images side-by-side
- Click **"Generate Interpolated"**
- New design appears between the two sources in semantic space

## Generation History

Below the main visualization, the **📊 Generation History** panel shows:

- **Table:** All generation iterations with method, prompt, and image count
- **Metrics:**
  - Total iterations
  - Total images generated
  - Breakdown by generation method

## Tips & Best Practices

### Effective Prompts

**Good prompts:**

- "sporty premium sneaker design"
- "elegant formal leather shoe"
- "colorful athletic running shoe"
- "minimalist white sneaker"

**Adding detail:**

- "more premium looking"
- "add leather texture"
- "make it more casual"
- "brighter colors"

### Workflow Examples

#### Example 1: Find "Sporty but Premium" Design

1. Generate initial batch: "sporty sneaker design" (12 images)
2. Identify most sporty example in space (e.g., index 3)
3. Generate from reference + "more premium, luxury materials" (index 3)
4. Repeat refinement until satisfied

#### Example 2: Explore Design Space

1. Generate batch A: "athletic running shoe" (8 images)
2. Generate batch B: "formal dress shoe" (8 images)
3. Pick one from each (e.g., index 2 and index 10)
4. Generate interpolated to find middle ground
5. Use interpolated result as new reference

#### Example 3: Iterative Narrowing

1. Start broad: "modern shoe design" (12 images)
2. Select favorite (index 5)
3. Refine: "more minimalist" → new image
4. Refine again: "add subtle color accent" → new image
5. Compare progression in semantic space

## Technical Details

### Performance

- **Model load:** 20-30 seconds (first time only)
- **Single image:** 3-5 seconds
- **Batch of 12:** ~45-60 seconds
- **Memory:** ~6GB VRAM (RTX 4060 or better)

### Models Used

- **Text-to-Image:** Stable Diffusion v1.5
- **Image-to-Image:** Stable Diffusion v1.5
- **Embeddings:** CLIP ViT-B/32
- **Projection:** UMAP

### How It Works

1. **Generation:** Stable Diffusion creates images from prompts
2. **Embedding:** CLIP extracts semantic features (512-dim vectors)
3. **Projection:** UMAP maps to 2D space or transforms into existing space
4. **Integration:** New images seamlessly appear alongside dataset images

## Troubleshooting

### "Out of memory" error

- Reduce batch size (try 8 or 6 images)
- Close other GPU applications
- Reduce image resolution in `generator.py` (512→384)

### Slow generation

- Normal for CPU or low VRAM
- Reduce inference steps in `generator.py` (20→15)
- Generate smaller batches

### Images don't match prompt

- Try more detailed prompts
- Adjust guidance scale (higher = more prompt adherence)
- Use reference + text mode for more control

### New images appear far from expected location

- CLIP and SD may interpret concepts differently
- Use reference mode for better control
- Generate more variations to explore the space

## Advanced: Custom Semantic Axes

Combine generation with semantic reorganization:

1. Generate initial batch
2. Enable **Semantic Reorganization** in sidebar
3. Set custom axes (e.g., X: "sporty ↔ formal", Y: "colorful ↔ plain")
4. See where generated images fall on your custom semantic dimensions
5. Generate new images targeting specific regions

## Next Steps

After mastering the workflow:

- Experiment with different prompt styles
- Combine with semantic axis analysis
- Track which prompts produce desired characteristics
- Use generation history to document successful iterations

## Research Use Case

This workflow demonstrates **semantic-guided iterative design**:

- Navigate design space intentionally (not randomly)
- See semantic relationships between variations
- Track exploration path through generation history
- Compare to traditional prompt iteration (no spatial context)

**Key insight:** The semantic space provides **navigational context** that makes exploration more efficient and intentional than blind prompt iteration.
