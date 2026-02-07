# Layout and Image Notes

## Image Resolution

- **fal.ai nano-banana**: Output resolution depends on the model (typically 512×512 or 1024×1024 for 1:1 aspect ratio). Check fal.ai API docs for exact specs.
- **CLIP input**: Config uses `IMAGE_SIZE = (224, 224)` for embedding extraction.
- **Canvas display**: Images are rendered at `visualSettings.imageSize` pixels (default 120px), independent of source resolution.

## Layout Optimization

After embedding projection, `apply_layout_spread()` in the backend ensures minimum spacing:

- When two points are closer than 8% of the data extent, coordinates are scaled from center.
- Applied on: `update_axes`, `set_3d_mode`, and `add_external_images` (reprojects all).
- Prevents overlap; use Visual Settings > Rescale to reset if layout feels too spread.

## Multi-Select

- **No limit**: You can select any number of images. Use **Ctrl+Click** (or Cmd+Click on Mac) to add/remove from selection.
- **Click**: Toggles that image (add if not selected, remove if selected).
- **FloatingActionPanel**: Shows when 1+ images selected; actions vary by count.

## Radial Dial (Space or Middle-Click)

Replaces the left toolbar. Actions: Text to Image, Batch Generate, Load Images, Analyze Canvas, Suggest Axes, Export ZIP, Clear All, Recenter, Rescale, Visual Settings, Settings.
