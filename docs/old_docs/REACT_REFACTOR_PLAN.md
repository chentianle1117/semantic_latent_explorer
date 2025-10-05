# React Refactor Plan - Zappos Semantic Explorer

## Overview
Refactor Streamlit app to React + FastAPI for better performance and cleaner interactions.

## Architecture

```
┌─────────────────────────────────────────┐
│         React Frontend (Port 3000)      │
│  ┌────────────────────────────────────┐ │
│  │  Canvas Component (D3.js/SVG)      │ │
│  │  - Image rendering                 │ │
│  │  - Click selection                 │ │
│  │  - Hover genealogy                 │ │
│  └────────────────────────────────────┘ │
│  ┌────────────────────────────────────┐ │
│  │  Control Panel                     │ │
│  │  - Quick Actions                   │ │
│  │  - History Timeline                │ │
│  └────────────────────────────────────┘ │
│  ┌────────────────────────────────────┐ │
│  │  Settings Sidebar                  │ │
│  │  - Axis Editor                     │ │
│  │  - Visual Settings                 │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
              ↕ REST API + WebSocket
┌─────────────────────────────────────────┐
│      FastAPI Backend (Port 8000)        │
│  - CLIP embeddings                      │
│  - Stable Diffusion generation          │
│  - Semantic axis computation            │
│  - State management                     │
└─────────────────────────────────────────┘
```

## Interaction Model (From Original Artifact)

### Canvas Interactions
1. **Hover on image**:
   - Show blue border on hovered image
   - Display genealogy lines:
     - Green dashed lines to parents (upstream)
     - Orange dashed lines to children (downstream)
   - Show tooltip with:
     - Image ID
     - Group ID
     - Prompt
     - Parents list
     - Children list

2. **Click to select**:
   - Single click: Toggle selection (orange border)
   - Support multi-select (Ctrl/Cmd + click)
   - Selected images show in control panel

3. **Zoom/Pan**:
   - Mouse wheel to zoom
   - Click+drag to pan

### Control Panel Interactions

#### Single Image Selected
- Show "Generate with Prompt" input + button
- Show "View Details" button
- Show "Remove from Canvas" button

#### Two Images Selected
- Show "Interpolate Between" button
- Show "Generate Using Both" button

#### No Selection
- Show batch generation controls:
  - Prompt input
  - Count slider
  - Generate button
- Show "Load Dataset" button
- Show "Clear Canvas" button

### History Timeline
- Horizontal scrollable timeline
- Each group shows:
  - Thumbnail of first/representative image
  - Group type badge (batch/reference/interpolation)
  - Prompt text
  - Eye icon to toggle visibility
- Click thumbnail to select all images in group

## Tech Stack

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: TailwindCSS
- **Visualization**: D3.js (for canvas)
- **State Management**: Zustand
- **HTTP Client**: Axios
- **WebSocket**: native WebSocket API

### Backend
- **Framework**: FastAPI
- **ML Models**:
  - CLIP (OpenAI)
  - Stable Diffusion
- **Image Processing**: PIL
- **Numeric**: NumPy, scikit-learn

## Implementation Steps

### Phase 1: Backend Setup
1. ✅ Create FastAPI backend structure
2. Create API endpoints:
   - `POST /api/initialize` - Load models
   - `POST /api/generate` - Batch generation
   - `POST /api/generate-from-reference` - Reference generation
   - `POST /api/interpolate` - Interpolation
   - `POST /api/update-axes` - Update semantic axes
   - `GET /api/state` - Get current state
   - `DELETE /api/images/{id}` - Remove image
   - `POST /api/clear` - Clear canvas
   - `WS /ws` - WebSocket for real-time updates
3. Test each endpoint individually

### Phase 2: Frontend Setup
1. Initialize Vite + React + TypeScript project
2. Install dependencies:
   - tailwindcss
   - d3
   - zustand
   - axios
3. Set up project structure:
   ```
   frontend/
   ├── src/
   │   ├── components/
   │   │   ├── Canvas/
   │   │   │   ├── SemanticCanvas.tsx
   │   │   │   ├── ImageNode.tsx
   │   │   │   ├── GenealogyLine.tsx
   │   │   │   └── Tooltip.tsx
   │   │   ├── ControlPanel/
   │   │   │   ├── QuickActions.tsx
   │   │   │   ├── HistoryTimeline.tsx
   │   │   │   └── ContextMenu.tsx
   │   │   ├── Sidebar/
   │   │   │   ├── AxisEditor.tsx
   │   │   │   └── VisualSettings.tsx
   │   │   └── Layout/
   │   │       └── MainLayout.tsx
   │   ├── store/
   │   │   └── appStore.ts
   │   ├── api/
   │   │   └── client.ts
   │   ├── types/
   │   │   └── index.ts
   │   └── App.tsx
   ```

### Phase 3: Canvas Component (Critical)
1. Create D3.js canvas with SVG
2. Implement zoom/pan functionality
3. Render images as SVG `<image>` elements
4. Implement selection logic:
   - Click handler
   - Multi-select with Ctrl/Cmd
   - Visual feedback (orange border)
5. Implement hover interactions:
   - Border highlighting
   - Genealogy line rendering
   - Tooltip positioning
6. Test interactions thoroughly

### Phase 4: Control Panel
1. Build QuickActions component
2. Build ContextMenu component (changes based on selection)
3. Build HistoryTimeline component
4. Wire up generation functions to API

### Phase 5: Settings Sidebar
1. Build AxisEditor component
2. Build VisualSettings component
3. Wire up axis updates to backend

### Phase 6: State Management
1. Set up Zustand store
2. Connect to WebSocket for real-time updates
3. Handle optimistic updates

### Phase 7: Testing & Polish
1. Test all interaction flows
2. Add loading states
3. Add error handling
4. Polish animations and transitions
5. Ensure no memory leaks

## Color Scheme (From Artifact)
```css
--bg-primary: #0d1117
--bg-secondary: #161b22
--text-primary: #e0e0e0
--text-secondary: #8b949e
--border: #30363d
--border-hover: #58a6ff
--primary-blue: #58a6ff
--secondary-purple: #bc8cff
--success-green: #3fb950
--warning-orange: #d29922
--selection-orange: #ffa657
```

## Key Differences from Streamlit
1. **No page reloads** - Everything updates via WebSocket
2. **Smooth interactions** - Direct DOM manipulation via D3
3. **Better performance** - Virtual scrolling, lazy loading
4. **Clean state** - No session_state juggling
5. **Proper event handling** - Native browser events

## Testing Strategy
- Test each backend endpoint with curl/Postman first
- Test each React component in isolation
- Integration testing for full workflows
- Performance testing with many images

## Next Steps
1. Verify backend API works
2. Create minimal React app
3. Build canvas component first (most critical)
4. Iterate and test each feature
