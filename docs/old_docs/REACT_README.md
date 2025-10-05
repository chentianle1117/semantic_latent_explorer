# Zappos Semantic Explorer - React + FastAPI Version

## 🎉 What's Been Built

### ✅ Complete and Working
1. **FastAPI Backend** (`backend/api.py`)
   - REST API for all operations
   - WebSocket for real-time updates
   - Integration with CLIP and Stable Diffusion

2. **React Frontend Core**
   - Type-safe TypeScript setup
   - Zustand state management
   - D3.js-based interactive canvas
   - WebSocket client
   - All interactions matching the artifact

3. **Canvas Component** - Fully Functional
   - ✅ Click to select images (orange border)
   - ✅ Ctrl/Cmd + click for multi-select
   - ✅ Hover shows blue border
   - ✅ Hover draws genealogy lines (green to parents, orange to children)
   - ✅ Zoom and pan with mouse
   - ✅ Editable axis labels
   - ✅ Group highlighting from history timeline

4. **Basic UI Components**
   - Quick Actions panel with generate button
   - Simple history timeline
   - Visual settings (size/opacity sliders)
   - Context-sensitive actions based on selection

## 🚀 How to Run

### Prerequisites
- Python 3.8+ with:
  - PyTorch
  - transformers (for CLIP)
  - diffusers (for Stable Diffusion)
  - FastAPI
  - uvicorn
  - PIL, numpy, scikit-learn
- Node.js 16+ and npm

### Quick Start

**Option 1: Using Batch Scripts (Windows)**

1. **Start Backend** (Terminal 1):
   ```bash
   start_backend.bat
   ```
   - Backend runs on http://localhost:8000
   - Wait for "Models initialized" message

2. **Start Frontend** (Terminal 2):
   ```bash
   start_frontend.bat
   ```
   - Frontend runs on http://localhost:3000
   - Auto-installs dependencies on first run

**Option 2: Manual Start**

1. **Backend**:
   ```bash
   cd backend
   python api.py
   ```

2. **Frontend**:
   ```bash
   cd frontend
   npm install  # First time only
   npm run dev
   ```

3. **Open** http://localhost:3000

## 📖 Usage Guide

### Generating Images

1. Click **"🎨 Generate Images"** button
2. Enter a prompt (e.g., "sporty premium sneaker design")
3. Enter number of images (1-20)
4. Wait for generation to complete
5. Images appear in the canvas with semantic positioning

### Interacting with Images

**Hover:**
- Hover over any image to see:
  - Blue border on the hovered image
  - Green dashed lines pointing to parent images (images it was generated from)
  - Orange dashed lines pointing to child images (images generated from it)
  - Genealogy tooltip showing parent/child relationships

**Selection:**
- Click image: Toggle selection (orange border)
- Ctrl/Cmd + Click: Multi-select
- Click empty space: Deselect all

**Actions Based on Selection:**
- **1 Image Selected:** "Generate from Reference" button appears
- **2 Images Selected:** "Interpolate Between" button appears
- **3+ Images:** Group actions available

### Canvas Controls

- **Mouse Wheel:** Zoom in/out
- **Click + Drag:** Pan around the space
- **Axis Labels:** Click to edit semantic meaning

### Visual Settings (Right Panel)

- **Image Size:** Adjust size of all images (30-200px)
- **Opacity:** Adjust transparency (0.3-1.0)

### History Timeline (Bottom)

- Shows all generation groups
- Click a group to select all images in that group
- Badge shows number of images in group
- Color-coded by type:
  - Blue: Initial batch
  - Purple: Reference-based
  - Green: Interpolation

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│   React Frontend (Port 3000)        │
│   ┌───────────────────────────────┐ │
│   │ Canvas (D3.js + SVG)          │ │
│   │ - Zoom/Pan                    │ │
│   │ - Click selection             │ │
│   │ - Hover genealogy             │ │
│   └───────────────────────────────┘ │
│   ┌───────────────────────────────┐ │
│   │ Zustand Store                 │ │
│   │ - Images state                │ │
│   │ - Selection state             │ │
│   │ - Visual settings             │ │
│   └───────────────────────────────┘ │
└─────────────────────────────────────┘
              ↕ WebSocket + REST API
┌─────────────────────────────────────┐
│   FastAPI Backend (Port 8000)       │
│   - CLIP embeddings                 │
│   - Stable Diffusion                │
│   - Semantic axis computation       │
│   - Real-time state sync            │
└─────────────────────────────────────┘
```

## 📂 Project Structure

```
Zappos50K_semantic_explorer/
├── backend/
│   ├── api.py                 # FastAPI server
│   └── __init__.py
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── Canvas/
│   │   │       └── SemanticCanvas.tsx  # Main canvas
│   │   ├── store/
│   │   │   └── appStore.ts    # Zustand state
│   │   ├── api/
│   │   │   └── client.ts      # API client
│   │   ├── types/
│   │   │   └── index.ts       # TypeScript types
│   │   ├── styles/
│   │   │   └── app.css        # Global styles
│   │   ├── App.tsx            # Main app component
│   │   └── main.tsx           # Entry point
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── models/                    # ML models (used by backend)
├── data/                      # Data loaders
├── config.py                  # Configuration
├── start_backend.bat          # Backend startup script
├── start_frontend.bat         # Frontend startup script
└── REACT_README.md            # This file
```

## 🎨 Interactions Reference (From Artifact)

### Canvas Interactions
| Action | Result |
|--------|--------|
| Hover image | Blue border + genealogy lines + tooltip |
| Click image | Toggle selection (orange border) |
| Ctrl+Click | Multi-select |
| Wheel scroll | Zoom in/out |
| Click+drag | Pan canvas |
| Click axis | Edit semantic meaning |

### Genealogy Visualization
| Element | Color | Meaning |
|---------|-------|---------|
| Green dashed line | `#3fb950` | Points to parent (generated FROM) |
| Orange dashed line | `#d29922` | Points to child (generated THIS as ref) |
| Green border | `#3fb950` | Parent image highlight |
| Orange border | `#d29922` | Child image highlight |
| Blue border | `#58a6ff` | Currently hovered |
| Orange border (thick) | `#ffa657` | Selected image |

## 🐛 Troubleshooting

### Backend Issues

**"Models not initialized"**
- Make sure CLIP and Stable Diffusion are properly installed
- Check backend console for error messages
- Ensure GPU is available (or set `device='cpu'` in api.py)

**"Port 8000 already in use"**
- Kill existing process: `taskkill /F /IM python.exe`
- Or change port in `backend/api.py` and `frontend/vite.config.ts`

### Frontend Issues

**"Failed to connect to backend"**
- Ensure backend is running on port 8000
- Check browser console for errors
- Verify WebSocket connection in Network tab

**"Images not appearing"**
- Check if backend generation succeeded
- Inspect state in React DevTools
- Look for base64 encoding errors in console

**"Hover/click not working"**
- Ensure images have loaded
- Check browser console for D3 errors
- Verify pointer-events are not disabled

## 🔧 Development

### Adding New Features

1. **New API Endpoint:**
   - Add to `backend/api.py`
   - Add TypeScript types to `frontend/src/types/index.ts`
   - Add client method to `frontend/src/api/client.ts`

2. **New UI Component:**
   - Create in `frontend/src/components/`
   - Import and use in `App.tsx`
   - Update state in `appStore.ts` if needed

3. **New Interaction:**
   - Update D3 code in `SemanticCanvas.tsx`
   - Add event handlers
   - Update store actions as needed

### Testing

**Backend:**
```bash
# Test initialize
curl -X POST http://localhost:8000/api/initialize

# Test generate
curl -X POST http://localhost:8000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test shoe", "n_images": 2}'

# Get state
curl http://localhost:8000/api/state
```

**Frontend:**
- Use React DevTools to inspect state
- Use browser console to check for errors
- Use Network tab to monitor API calls

## 📝 Known Limitations

1. **UMAP vs PCA:** Currently using PCA for coordinate projection. Original used UMAP, which is better for visualization but slower. Can be swapped in `backend/api.py`.

2. **Image Caching:** Images are re-encoded on each state update. Could implement better caching.

3. **History Timeline:** Basic implementation. Could add more interactions (drag to reorder, delete groups, etc.).

4. **Axis Editor:** Uses browser `prompt()`. Could be replaced with custom modal.

## 🎯 Next Steps

See `REACT_STATUS.md` for:
- Remaining components to build
- Enhancement ideas
- Full testing checklist
- Cleanup tasks

## 📚 Resources

- **FastAPI Docs:** https://fastapi.tiangolo.com/
- **React Docs:** https://react.dev/
- **D3.js Docs:** https://d3js.org/
- **Zustand Docs:** https://github.com/pmndrs/zustand
- **Vite Docs:** https://vitejs.dev/

## 💡 Tips

1. **Performance:** If canvas is slow with many images, reduce image size or opacity.

2. **GPU Memory:** If backend runs out of memory, reduce batch size in generation requests.

3. **Hot Reload:** Frontend auto-reloads on code changes. Backend requires restart.

4. **Debugging:** Use browser DevTools + React DevTools for frontend, print statements for backend.

---

**Enjoy exploring the semantic latent space! 👟✨**
