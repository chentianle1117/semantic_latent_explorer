# Semantic Latent Space Explorer - React Frontend

## Overview

A modern React + TypeScript frontend for exploring semantic latent spaces with full genealogy tracking, interactive visualizations, and real-time image generation.

## Features

✅ **Interactive D3 Canvas**

- Pan, zoom, and click to select images
- Hover to see genealogy relationships
- Right-click context menus
- Animated dash-flow genealogy lines

✅ **Genealogy Tracking**

- Visual parent-child relationships (green → orange)
- Bidirectional highlighting (canvas ↔ history)
- Multi-parent support for interpolations

✅ **Context-Aware Actions**

- Single image: Generate from reference, view details, remove
- Dual images: Interpolate between two images
- Multiple images: Cluster analysis, batch generation

✅ **Smart Dialogs**

- Prompt dialog with reference preview
- Variation strength slider
- Real-time generation status

✅ **History Timeline**

- Horizontal scrollable timeline
- Hover to highlight images in canvas
- Click to select entire group
- Visual thumbnails per generation batch

✅ **Visual Settings**

- Adjustable image size (30-200px)
- Opacity control (0.3-1.0)
- Background removal toggle

## Tech Stack

- **React 18+** - UI framework
- **TypeScript** - Type safety
- **Zustand** - State management
- **D3.js** - Canvas visualization
- **Vite** - Build tool

## Project Structure

```
frontend/
├── src/
│   ├── api/
│   │   └── client.ts              # Backend API client + WebSocket
│   ├── components/
│   │   ├── Canvas/
│   │   │   └── SemanticCanvas.tsx # D3-based interactive canvas
│   │   ├── ContextMenu/
│   │   │   ├── ContextMenu.tsx    # Right-click context menu
│   │   │   └── ContextMenu.css
│   │   └── PromptDialog/
│   │       ├── PromptDialog.tsx   # Reference generation dialog
│   │       └── PromptDialog.css
│   ├── store/
│   │   └── appStore.ts            # Zustand state management
│   ├── styles/
│   │   └── app.css                # Global styles (dark theme)
│   ├── types/
│   │   └── index.ts               # TypeScript type definitions
│   ├── App.tsx                    # Main application component
│   └── main.tsx                   # Entry point
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Installation

```bash
cd frontend
npm install
```

## Development

```bash
# Start development server (http://localhost:5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Usage

### Basic Workflow

1. **Generate Initial Images**

   - Click "🎨 Generate Images"
   - Enter prompt (e.g., "sporty running shoe")
   - Specify count (1-20)

2. **Select Images**

   - Click to select single image
   - Ctrl/Cmd+Click for multi-select
   - Right-click for context menu

3. **Generate Variations**

   - **Single selected**: Generate from reference with prompt
   - **Two selected**: Interpolate between them
   - **Multiple**: Cluster analysis (coming soon)

4. **Explore Genealogy**

   - Hover over image to see relationships
   - Green lines = parents (upstream)
   - Orange lines = children (downstream)
   - Dashed lines animate for visual flow

5. **History Management**
   - Scroll through history timeline
   - Hover timeline card → highlights images in canvas
   - Click timeline card → selects all images in group

### Keyboard Shortcuts

- **Escape** - Close context menu/dialog
- **Ctrl/Cmd+Click** - Multi-select images
- **Click outside** - Deselect all

### Context Menu Actions

**Single Image Selected:**

- ✨ Generate with prompt - Create variation from reference
- 🔍 View details - Show metadata and genealogy
- 🗑️ Remove from space - Hide image

**Two Images Selected:**

- 🔀 Interpolate between - Blend two images
- ✨ Generate batch using both - Multiple variations
- ✖️ Clear selection

**Multiple Images Selected:**

- ✨ Generate from selection - Cluster-based generation
- 📊 Analyze cluster - Statistics and patterns
- ✖️ Clear selection

## API Integration

The frontend connects to the Python backend via:

1. **HTTP REST API** - `/api/*` endpoints
2. **WebSocket** - Real-time state updates

### API Client Methods

```typescript
// Initialize models
await apiClient.initialize();

// Generate images
await apiClient.generate({ prompt: "...", n_images: 8 });

// Generate from reference
await apiClient.generateFromReference({
  reference_id: 0,
  prompt: "more minimalist",
});

// Interpolate
await apiClient.interpolate({
  id_a: 0,
  id_b: 1,
  alpha: 0.5,
});

// Clear canvas
await apiClient.clearCanvas();

// Get current state
const state = await apiClient.getState();
```

## State Management

Using Zustand for predictable state updates:

```typescript
// Select images
const selectedIds = useAppStore((state) => state.selectedImageIds);
const toggleSelection = useAppStore((state) => state.toggleImageSelection);

// Hover interactions
const hoveredImageId = useAppStore((state) => state.hoveredImageId);
const setHoveredImageId = useAppStore((state) => state.setHoveredImageId);

// Visual settings
const settings = useAppStore((state) => state.visualSettings);
const updateSettings = useAppStore((state) => state.updateVisualSettings);
```

## Styling

Dark theme based on GitHub's design system:

```css
--bg-primary: #0d1117
--bg-secondary: #161b22
--primary-blue: #58a6ff
--success-green: #3fb950
--warning-orange: #d29922
--selection-orange: #ffa657
```

All animations and transitions use CSS for performance:

- Dash-flow animation (1s linear infinite)
- Fade-in for context menu (0.15s)
- Pulse for group highlighting (1.5s)

## Performance Optimizations

1. **D3 Virtualization** - Only renders visible images
2. **WebSocket Updates** - Real-time without polling
3. **Zustand Selectors** - Minimal re-renders
4. **CSS Animations** - GPU-accelerated
5. **Image Caching** - Base64 stored in state

## Troubleshooting

### Backend Connection Failed

```
Error: Failed to connect to backend
```

**Solution**: Ensure backend is running on `http://localhost:8000`

```bash
cd backend
python main.py
```

### Images Not Appearing

**Check:**

1. Backend initialized successfully
2. No console errors
3. Images have `visible: true`
4. Coordinates are valid numbers

### Context Menu Not Showing

**Ensure:**

1. Images are selected
2. Right-click is on image (not empty space)
3. Browser allows context menu override

### Genealogy Lines Not Showing

**Verify:**

1. Hover is on image with parents/children
2. Parent/child images are visible
3. Canvas is not zoomed out too far

## Browser Support

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Edge 90+
- ✅ Safari 14+

## Contributing

### Code Style

- Use Prettier for formatting
- Follow TypeScript strict mode
- Prefer functional components with hooks
- Use semantic HTML

### Adding New Features

1. Update types in `types/index.ts`
2. Add state to `store/appStore.ts`
3. Create component in `components/`
4. Add API method to `api/client.ts`
5. Update this README

## License

MIT License - See LICENSE file for details

## Support

For issues or questions:

1. Check backend logs for API errors
2. Check browser console for frontend errors
3. Verify WebSocket connection in Network tab
4. Review this README for common solutions

---

**Built with ❤️ using React + TypeScript + D3**
