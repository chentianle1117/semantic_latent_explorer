# React Refactor Status

## ✅ Completed Components

### Backend (FastAPI)
- ✅ `backend/api.py` - Complete REST API + WebSocket
  - Initialize models endpoint
  - Generate images endpoint
  - Generate from reference endpoint
  - Interpolate endpoint
  - Update semantic axes endpoint
  - Delete/clear endpoints
  - WebSocket for real-time updates

### Frontend Setup
- ✅ Project configuration (package.json, vite.config.ts, tsconfig.json)
- ✅ Type definitions (`src/types/index.ts`)
- ✅ Zustand state management (`src/store/appStore.ts`)
- ✅ API client with WebSocket (`src/api/client.ts`)
- ✅ Global CSS matching artifact (`src/styles/app.css`)
- ✅ Canvas component with D3 interactions (`src/components/Canvas/SemanticCanvas.tsx`)

### Canvas Component Features (Matching Artifact)
- ✅ D3-based zoom/pan
- ✅ Click to select (toggle with orange border)
- ✅ Ctrl/Cmd + click for multi-select
- ✅ Hover shows blue border
- ✅ Hover draws green lines to parents
- ✅ Hover draws orange lines to children
- ✅ Hover highlights parent/child images
- ✅ Axis labels (clickable to edit)
- ✅ Group highlighting when history timeline is hovered

## 🚧 Remaining Work

### Components to Build

1. **ControlPanel/QuickActions.tsx** (~100 lines)
```typescript
- Prompt input field
- Generate button (calls apiClient.generate())
- Secondary buttons (Load Dataset, Clear Canvas)
- Loading spinner when isGenerating
```

2. **ControlPanel/ContextMenu.tsx** (~150 lines)
```typescript
- Shows based on selectedImageIds.length:
  - 1: Generate with prompt, View details, Remove
  - 2: Interpolate between, Generate using both
  - 3+: Generate from selection, Analyze
- Position near selected images
- Calls API functions from apiClient
```

3. **HistoryTimeline/HistoryTimeline.tsx** (~120 lines)
```typescript
- Map over historyGroups
- Render TimelineGroup for each
- Horizontal scroll container
```

4. **HistoryTimeline/TimelineGroup.tsx** (~80 lines)
```typescript
- Group header with title and badge
- Thumbnail image
- Visibility toggle (eye icon)
- onMouseEnter: setHoveredGroupId(group.id)
- onMouseLeave: setHoveredGroupId(null)
- onClick: select all images in group
```

5. **Settings/VisualSettings.tsx** (~100 lines)
```typescript
- Toggle for removeBackground
- Slider for imageSize (30-200px)
- Slider for imageOpacity (0.3-1.0)
- Updates visualSettings in store
```

6. **Layout/MainLayout.tsx** (~60 lines)
```typescript
- Compose all components
- Header with title and stats
- Canvas container with SemanticCanvas + VisualSettings
- Control panel with QuickActions + HistoryTimeline
```

7. **App.tsx** (~50 lines)
```typescript
- Initialize WebSocket connection
- Handle state updates from backend
- Render MainLayout
```

8. **main.tsx** (~10 lines)
```typescript
- ReactDOM.render
- Import CSS
```

## 📋 Implementation Checklist

### Phase 1: Complete Remaining Components
- [ ] Create QuickActions component
- [ ] Create ContextMenu component
- [ ] Create HistoryTimeline components
- [ ] Create VisualSettings component
- [ ] Create MainLayout component
- [ ] Create App component
- [ ] Create main.tsx entry point

### Phase 2: Testing
- [ ] Start backend: `cd backend && python api.py`
- [ ] Start frontend: `cd frontend && npm install && npm run dev`
- [ ] Test initialize endpoint
- [ ] Test generate from prompt
- [ ] Test selection interactions
- [ ] Test genealogy hover
- [ ] Test history timeline hover
- [ ] Test settings sliders
- [ ] Test WebSocket updates

### Phase 3: Cleanup
- [ ] Archive old Streamlit files:
  - Move `app.py` to `archive/app.py.old`
  - Move `visualization/bokeh_canvas.py` to `archive/`
  - Move `components/*.py` to `archive/`
- [ ] Update README with new instructions
- [ ] Add deployment scripts

## 🎯 Priority Order

1. **CRITICAL**: Complete App.tsx and main.tsx to get something running
2. **HIGH**: QuickActions + HistoryTimeline (core functionality)
3. **MEDIUM**: ContextMenu (enhances UX)
4. **LOW**: VisualSettings (nice to have)

## 📝 Quick Start Template

### Minimal App.tsx to Test Canvas

```typescript
import React, { useEffect } from 'react';
import { SemanticCanvas } from './components/Canvas/SemanticCanvas';
import { useAppStore } from './store/appStore';
import { apiClient } from './api/client';
import './styles/app.css';

export const App: React.FC = () => {
  const images = useAppStore((state) => state.images);
  const setImages = useAppStore((state) => state.setImages);
  const setHistoryGroups = useAppStore((state) => state.setHistoryGroups);
  const setIsInitialized = useAppStore((state) => state.setIsInitialized);

  useEffect(() => {
    // Connect WebSocket
    apiClient.connectWebSocket((message) => {
      if (message.type === 'state_update' && message.data) {
        setImages(message.data.images);
        setHistoryGroups(message.data.history_groups);
      }
    });

    // Initialize backend
    apiClient.initialize()
      .then(() => {
        setIsInitialized(true);
        return apiClient.getState();
      })
      .then((state) => {
        setImages(state.images);
        setHistoryGroups(state.history_groups);
      })
      .catch(console.error);

    return () => {
      apiClient.disconnectWebSocket(() => {});
    };
  }, []);

  return (
    <div className="app-container">
      <div className="canvas-container">
        <div className="canvas-header">
          <h1>👟 Semantic Latent Space</h1>
        </div>
        <div className="canvas-stats">
          <strong>{images.length}</strong> images
        </div>
        <SemanticCanvas onContextMenu={(x, y) => console.log('Context menu', x, y)} />
      </div>
      <div className="control-panel">
        <div className="quick-actions">
          <h3>Quick Actions</h3>
          <button className="action-button" onClick={async () => {
            const prompt = window.prompt('Enter prompt:');
            if (prompt) {
              await apiClient.generate({ prompt, n_images: 4 });
            }
          }}>
            Generate
          </button>
        </div>
      </div>
    </div>
  );
};
```

### main.tsx

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

## 🚀 How to Run

1. **Install frontend dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Start backend (Terminal 1):**
   ```bash
   cd backend
   python api.py
   ```
   Backend runs on http://localhost:8000

3. **Start frontend (Terminal 2):**
   ```bash
   cd frontend
   npm run dev
   ```
   Frontend runs on http://localhost:3000

4. **Test the app:**
   - Click "Initialize Generator" in backend logs
   - Use the Generate button to create images
   - Click/hover images to test interactions

## 📦 Next Deliverables

I can continue building:
1. All remaining components (QuickActions, ContextMenu, HistoryTimeline, Settings)
2. Complete integration testing
3. Cleanup old Streamlit code
4. Write deployment documentation

Would you like me to:
- A) Continue building all remaining components now
- B) Let you test the canvas component first, then continue
- C) Provide component templates for you to fill in
- D) Focus on specific components you need most

The canvas component is the most complex part and is complete. The rest are straightforward React components that wire up to the API and store.
