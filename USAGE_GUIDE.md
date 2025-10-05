# Zappos Semantic Explorer - Usage Guide

## Quick Start

### 1. Installation

```bash
# Install dependencies
pip install -r requirements.txt
```

### 2. Run the Application

```bash
streamlit run app.py
```

## Interface Overview

The application features a **canvas-centric** layout optimized for exploration:

### Main Canvas (70% of screen)

- **Semantic Latent Space**: Interactive plot showing images in 2D semantic space
- **Image Display**: Shoes displayed directly on the canvas
- **Hover Information**: Genealogy info (parents/children) on hover
- **Selection**: Click images to select them (orange border indicates selection)
- **Pan/Zoom**: Use mouse to navigate the space

### Settings Sidebar (Right Side)

- **Axis Editor**: Customize semantic axes (e.g., formal↔sporty, dark↔colorful)
- **Visual Settings**:
  - Image size (30-200px)
  - Opacity (0.3-1.0)
  - Background removal toggle
  - Quick presets (S/M/L)

### Control Panel (Bottom 25%)

#### Quick Actions (Left)

1. **Initialize Generator**: Load Stable Diffusion model
2. **Generate Images**: Create new images from text prompts
3. **Load Dataset**: Import Zappos shoe dataset
4. **Clear Canvas**: Reset the workspace

#### History Timeline (Right)

- View all generation batches
- Toggle group visibility
- Track genealogy relationships

## Key Features

### 1. Text-to-Image Generation

```
1. Initialize the generator
2. Enter a prompt (e.g., "premium sporty sneaker")
3. Set number of images to generate
4. Click "Generate"
```

### 2. Reference-Based Generation

```
1. Select an image on the canvas (click it)
2. Add description in the Selected Actions panel
3. Click "Generate from Reference"
```

### 3. Image Interpolation

```
1. Select TWO images on the canvas
2. Click "Generate Interpolation" in Selected Actions
3. New image will appear between the parent images
```

### 4. Semantic Axis Customization

```
1. In the Axis Editor panel (right sidebar):
   - Set X-axis concepts (e.g., formal vs sporty)
   - Set Y-axis concepts (e.g., dark vs colorful)
2. Click "Recalculate UMAP"
3. Images will reposition based on new semantic axes
```

### 5. Genealogy Tracking

- **Hover over any image** to see:
  - Parent images (green connections)
  - Child images (orange connections)
- **Color coding**:
  - Blue: Batch generation
  - Purple: Reference-based
  - Green: Interpolation
  - Orange: Dataset images

## Interaction Tips

### Canvas Navigation

- **Pan**: Click and drag
- **Zoom**: Scroll wheel
- **Reset View**: Click reset button in modebar
- **Screenshot**: Use camera icon in modebar

### Selection

- **Single Click**: Select/deselect an image
- **Multiple Selection**: Click multiple images (all stay selected)
- **Clear Selection**: Click empty space or use Clear button

### Performance Tips

1. Start with smaller batches (8 images) to test
2. Adjust image size based on dataset density
3. Use background removal for cleaner visualization
4. Toggle group visibility to focus on specific batches

## Workflow Examples

### Workflow 1: Explore Design Space

```
1. Generate initial batch: "athletic running shoe"
2. Generate variations: "basketball shoe", "tennis shoe"
3. Observe clustering in semantic space
4. Interpolate between interesting pairs
```

### Workflow 2: Iterative Refinement

```
1. Generate base images from prompt
2. Select best result
3. Generate from reference with refinement prompt
4. Repeat until desired result achieved
5. Track genealogy to see evolution
```

### Workflow 3: Dataset Exploration

```
1. Load Zappos dataset
2. Set meaningful semantic axes
3. Observe natural clustering
4. Generate new images to fill gaps in the space
```

## Keyboard Shortcuts

- **Ctrl+R**: Refresh the page
- **Escape**: Clear selections (in development)

## Troubleshooting

### Generator Not Loading

- Ensure CUDA is available for GPU acceleration
- Check that sufficient GPU memory is available (8GB+ recommended)
- Try CPU mode if GPU unavailable (edit config.py)

### Images Not Appearing

- Check that images_metadata is populated
- Verify UMAP reducer is initialized
- Look for errors in the console

### Layout Issues

- Refresh the page (Ctrl+R)
- Check browser zoom level (should be 100%)
- Try different browser (Chrome recommended)

### Performance Issues

- Reduce image size in settings
- Decrease opacity slightly
- Generate smaller batches
- Toggle off unused groups in history

## Advanced Features

### Custom Semantic Axes

You can define domain-specific axes:

- Fashion: casual ↔ formal, minimalist ↔ ornate
- Color: monochrome ↔ colorful, warm ↔ cool
- Style: classic ↔ modern, athletic ↔ dress

### Batch Operations

Select multiple images to:

- Generate interpolations between them
- Hide/show as a group
- Export selections

### Export Options

Use the Plotly modebar to:

- Save canvas as PNG
- Export data as CSV (in development)
- Download high-resolution images

## Best Practices

1. **Start Small**: Begin with 8-16 images to understand the space
2. **Meaningful Axes**: Choose semantic axes relevant to your domain
3. **Track Genealogy**: Use parent-child relationships to understand evolution
4. **Iterative Refinement**: Build on successful generations
5. **Organize Groups**: Use history panel to manage different experiments

## Support

For issues or questions:

1. Check PLOTLY_MIGRATION_SUMMARY.md for technical details
2. Review IMPLEMENTATION_SUMMARY.md for architecture
3. Check console for error messages
4. Verify all dependencies are installed

## Version Information

- **Visualization**: Plotly 5.11+
- **UI Framework**: Streamlit 1.28+
- **ML Backend**: CLIP (OpenAI), Stable Diffusion
- **Python**: 3.8+

Enjoy exploring the semantic space! 👟✨
