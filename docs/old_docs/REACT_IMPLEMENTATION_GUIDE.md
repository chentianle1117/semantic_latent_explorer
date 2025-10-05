# React Implementation Guide

## Current Progress

### ✅ Completed
1. Project setup (package.json, vite.config, tsconfig)
2. Type definitions
3. Zustand store
4. API client
5. Global CSS styles

### 🚧 Next Steps

## Phase 1: Core Canvas Component (CRITICAL)

File: `frontend/src/components/Canvas/SemanticCanvas.tsx`

**Key Requirements from Artifact:**
1. SVG-based rendering with D3.js
2. Images displayed as `<image>` elements in SVG
3. Zoom/pan with D3 zoom behavior
4. Click to select (orange border #ffa657)
5. Hover shows:
   - Blue border on hovered image (#58a6ff)
   - Green dashed lines to parents (#3fb950)
   - Orange dashed lines to children (#d29922)
   - Parent/child images get colored borders
6. Tooltip shows genealogy info

**Implementation:**
```typescript
- Use D3 zoom behavior
- Render images in SVG <image> tags
- Use D3 selections for hover/click
- Draw curved arrows with D3 path
```

## Phase 2: Control Panel Components

### QuickActions.tsx
- Prompt input
- Generate button (calls API)
- Load dataset / Clear canvas buttons
- Shows loading spinner when generating

### ContextMenu.tsx
**Behavior from artifact:**
- 1 selected: "Generate with prompt", "View details", "Remove"
- 2 selected: "Interpolate between", "Generate using both"
- 3+ selected: "Generate from selection", "Analyze cluster"

Position: Near selected images

## Phase 3: History Timeline

File: `frontend/src/components/HistoryTimeline/HistoryTimeline.tsx`

**Key Interactions:**
- Hover over group → highlight all images in group with orange glow
- Click group → select all images in group
- Eye icon toggles visibility
- Shows thumbnail, badge, prompt

## Phase 4: Settings Sidebar

Files:
- `VisualSettings.tsx` - Size/opacity sliders, background toggle
- `AxisEditor.tsx` - Edit semantic axes

## Phase 5: Integration

1. Wire up WebSocket for real-time updates
2. Connect all components to Zustand store
3. Test all interactions match artifact

## Testing Checklist

### Canvas Interactions
- [ ] Hover shows blue border
- [ ] Hover shows green parent lines
- [ ] Hover shows orange child lines
- [ ] Hover highlights parent/child images
- [ ] Click toggles selection (orange border)
- [ ] Ctrl+click for multi-select
- [ ] Zoom with mouse wheel
- [ ] Pan with drag

### Control Panel
- [ ] Generate from prompt works
- [ ] Context menu appears on selection
- [ ] 1 image: shows reference generation option
- [ ] 2 images: shows interpolation option
- [ ] Remove image works

### History Timeline
- [ ] Hover group highlights images
- [ ] Click group selects images
- [ ] Eye toggle hides/shows images
- [ ] Scrolls horizontally

### Settings
- [ ] Image size slider updates in real-time
- [ ] Opacity slider works
- [ ] Background toggle works
- [ ] Axis editor updates positions

## File Structure

```
frontend/src/
├── components/
│   ├── Canvas/
│   │   ├── SemanticCanvas.tsx      # Main canvas with D3
│   │   ├── ImageNode.tsx           # Individual image rendering
│   │   ├── GenealogyLines.tsx      # Arrow drawing logic
│   │   └── Tooltip.tsx             # Hover tooltip
│   ├── ControlPanel/
│   │   ├── QuickActions.tsx
│   │   ├── ContextMenu.tsx
│   │   └── index.ts
│   ├── HistoryTimeline/
│   │   ├── HistoryTimeline.tsx
│   │   ├── TimelineGroup.tsx
│   │   └── index.ts
│   ├── Settings/
│   │   ├── VisualSettings.tsx
│   │   ├── AxisEditor.tsx
│   │   └── index.ts
│   └── Layout/
│       └── MainLayout.tsx
├── store/
│   └── appStore.ts
├── api/
│   └── client.ts
├── types/
│   └── index.ts
├── styles/
│   └── app.css
├── App.tsx
└── main.tsx
```

## Backend Testing

Before building frontend, test backend endpoints:

```bash
# Terminal 1: Start backend
cd backend
python api.py

# Terminal 2: Test endpoints
curl http://localhost:8000/api/initialize -X POST
curl http://localhost:8000/api/state
curl http://localhost:8000/api/generate -X POST -H "Content-Type: application/json" -d '{"prompt": "test", "n_images": 2}'
```

## Deployment Steps

1. Backend: `cd backend && python api.py`
2. Frontend: `cd frontend && npm install && npm run dev`
3. Open http://localhost:3000

## Cleanup Old Code

After React app is working, archive/remove:
- `app.py` (old Streamlit app)
- `visualization/bokeh_canvas.py`
- `components/*.py` (Streamlit components)
- All Streamlit-specific files

Keep:
- `models/` (used by backend)
- `data/`
- `config.py`
