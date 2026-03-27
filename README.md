# Zappos50K Semantic Latent Space Explorer

Interactive design tool for exploring and generating shoe designs in semantic latent spaces. Uses Jina CLIP v2 embeddings for true text-image alignment, fal.ai for image generation, and Gemini for AI-assisted design exploration.

Built as a research prototype for a CMU thesis on AI-augmented footwear design.

![Version](https://img.shields.io/badge/version-3.0-blue)
![Python](https://img.shields.io/badge/python-3.10+-green)
![Node](https://img.shields.io/badge/node-18+-green)

## Features

### Semantic Canvas (D3.js)
- **Custom Semantic Axes**: Define text-based axes (e.g., "casual ... formal", "dark ... bright")
- **Pure CLIP Projection**: Images positioned exactly at their semantic coordinates (dot product with axis vectors)
- **Axis Tuning Mode**: Drag image anchors + editable sentences per axis end, with AI-refined axis descriptions
- **Genealogy Lines**: Bezier curves connecting parent-child relationships with color-coded lineage
- **Lineage Canvas**: Dedicated full-canvas tree view with d3 zoom/pan for exploring design history
- **Ethereal Glow System**: SVG filter-based hover/selection/parent/child glow effects

### Dual-Mode Generation (fal.ai)
- **Shoe Generation**: Text-to-image and reference-based iteration via nano-banana
- **Multi-View Sheets**: 5-view and 3/4-view sheets via nano-banana-2
- **Mood Board Generation**: 7 style presets (concept sheet, marker render, collage, etc.)
- **Satellite Views**: 3/4-front, 3/4-back, top, outsole, medial, front, back angles
- **Background Removal**: Optional transparent background extraction

### AI Agent (Gemini 2.5 Flash Lite)
- **Passive Observer**: Monitors canvas state and generates design insights
- **Design Brief Interpretation**: Colored text highlights (primary/secondary hierarchy)
- **Tag Suggestions**: Context-aware tag recommendations for shoes and mood boards
- **Sticky Insights**: All timers stop when insight is displayed (zero wasted tokens)

### Multi-User Study Mode
- **Per-participant isolation**: Each participant gets their own AppState via ContextVar middleware
- **Personal URLs**: `/?participant=Name` with per-user session persistence
- **Event Logging**: JSONL event logs per participant (session, generation, selection, feedback, etc.)
- **Feedback Notepad**: Floating quick-note FAB with categorized feedback
- **Canvas Management**: Create, branch, switch, and auto-save canvases per participant

### Expert Tool Layout
- **Left Toolbar**: 4 flyout panels (Generate, Files, AI Actions, Axes)
- **Right Inspector**: Stacked accordion (Selection deck + Genealogy tree + Actions)
- **Bottom Drawer**: Timeline with batch chips
- **Header Bar**: Settings modal, design brief, study session controls

## Architecture

```
Frontend (React 18 + TypeScript + Vite)
├── SemanticCanvas (D3.js)      ← 2D semantic space, zoom/pan, glow effects
├── LineageCanvas (D3.js)       ← Full-canvas genealogy tree view
├── Zustand Store               ← Global state (appStore.ts)
├── falClient.ts                ← fal.ai proxy calls (via backend BFF)
└── apiClient.ts                ← Backend REST API client
         │
         │ HTTP + X-Participant-Id header
         ▼
Backend (FastAPI + Uvicorn)
├── Per-participant state       ← _StateProxy + ContextVar isolation
├── Jina CLIP v2 embeddings     ← 1024-dim shared text+image CLIP space
├── Semantic Axis Builder       ← Text embedding projection
├── Gemini 2.5 Flash Lite       ← AI agent, brief interpretation, tag suggestions
├── Session persistence         ← JSON save/load per participant per canvas
└── Event logging               ← JSONL files per participant
         │
         │ REST API
         ▼
External Services
├── fal.ai nano-banana          ← Text-to-image & image editing (~2s/image)
├── fal.ai nano-banana-2/edit   ← Multi-view sheet generation
├── Jina AI API                 ← jina-clip-v2 embeddings (text + image)
└── Google Gemini API           ← AI agent & design brief analysis
```

## Quick Start

### Prerequisites

- **Python 3.10+**
- **Node.js 18+** (with npm)
- **API Keys**: fal.ai, Jina AI, Google Gemini

### 1. Clone & Install

```bash
git clone <repository-url>
cd Zappos50K_semantic_explorer

# Backend
cd backend
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

### 2. Configure API Keys

Create `backend/.env`:

```bash
FAL_KEY=your_fal_api_key
JINA_API_KEY=your_jina_api_key        # Free at https://jina.ai/ (10M tokens/key)
GOOGLE_API_KEY=your_gemini_api_key
ADMIN_KEY=your_admin_password          # For admin endpoints
```

No frontend `.env` needed -- all API keys are kept server-side (BFF pattern).

### 3. Run

**Option A: Manual (two terminals)**

```bash
# Terminal 1 - Backend
cd backend
python -m uvicorn api:app --reload --port 8000

# Terminal 2 - Frontend
cd frontend
npm run dev
```

**Option B: One-click (Windows)**

```bash
# Double-click start_app.bat
# Or: .\scripts\start_app.ps1
```

**Browser:** Open http://localhost:5173

### 4. Deploy (Railway)

The app is deployed on Railway with:
- Backend serves the built frontend as static files
- Persistent volume at `/app/backend/data` for participant data
- Environment variables set in Railway dashboard

Build frontend for production:
```bash
cd frontend && npx vite build
```

## Usage

### Participant Access

Each participant accesses the tool via a personal URL:
```
https://your-domain.railway.app/?participant=Name
```

### Canvas Interactions

| Action | Result |
|---|---|
| **Click image** | Select (cyan glow) |
| **Shift+Click** | Add to selection |
| **Click background** | Deselect all |
| **Hover image** | Show genealogy lines + silver glow |
| **Scroll wheel** | Zoom in/out |
| **Click + Drag** | Pan canvas |
| **Tab key** | Cycle through overlapping shoes |
| **ESC key** | Close dialogs |

### Generation Workflows

**Text-to-Image** (no selection): Left toolbar > Generate > enter prompt > generate

**Reference-Based** (1+ selected): Left toolbar > Generate > images auto-attached as references > enter prompt > generate

**Mood Board**: Left toolbar > Generate > switch to mood board mode > pick style preset > generate

**Satellite Views**: Enable "Also generate 3/4 views" checkbox in generation dialog

### Semantic Axes

1. Left toolbar > Axes panel
2. Edit axis text: `"casual ... formal"`
3. Images reposition by CLIP similarity to axis endpoints
4. **Tune mode**: Click "Tune" to drag image anchors and refine axis sentences

### Design Brief

1. Header bar > Settings > Design Brief textarea
2. Type design direction; AI interprets and highlights key phrases
3. Highlighted phrases (primary=blue, secondary=amber) inform generation context

## Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| React 18 + TypeScript | UI framework |
| Vite | Build tool & dev server |
| D3.js 7 | 2D canvas visualization |
| Zustand | State management |
| Axios | HTTP client |

### Backend
| Technology | Purpose |
|---|---|
| FastAPI | REST API server |
| Uvicorn | ASGI server |
| NumPy, scikit-learn | Numerical operations |
| Pillow (PIL) | Image processing |
| google-generativeai | Gemini AI agent |

### External Services
| Service | Purpose |
|---|---|
| fal.ai nano-banana | Text-to-image generation (~2s/image) |
| fal.ai nano-banana-2 | Multi-view sheet generation |
| Jina AI (jina-clip-v2) | 1024-dim CLIP embeddings (text + image) |
| Google Gemini 2.5 Flash Lite | AI agent, brief interpretation, tag suggestions |

## Project Structure

```
Zappos50K_semantic_explorer/
├── backend/
│   ├── api.py                         # FastAPI server (4800+ lines)
│   ├── models/
│   │   ├── embeddings.py              # JinaCLIPEmbedder (Jina API)
│   │   ├── semantic_axes.py           # Axis projection
│   │   └── data_structures.py         # ImageMetadata, HistoryGroup
│   ├── data/                          # Per-participant session data (volume)
│   │   └── {participant}/
│   │       ├── sessions/              # Canvas JSON files
│   │       ├── events/                # JSONL event logs
│   │       └── feedback.jsonl         # Feedback entries
│   ├── cache/embeddings/              # Jina embedding cache (.pkl)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Canvas/                # SemanticCanvas, LineageCanvas
│   │   │   ├── DesignBriefOverlay/    # Brief textarea + highlight mirror
│   │   │   ├── TextToImageDialog/     # Text-to-image generation
│   │   │   ├── PromptDialog/          # Reference-based generation
│   │   │   ├── MoodBoardDialog/       # Mood board generation
│   │   │   ├── AxisEditor/            # Semantic axis editing
│   │   │   ├── AxisTuningRail/        # Axis tuning overlay
│   │   │   ├── DynamicIsland/         # Ghost node accept/dismiss
│   │   │   ├── FeedbackNotepad/       # Floating feedback FAB
│   │   │   ├── CanvasSwitcher/        # Canvas create/branch/switch
│   │   │   └── ...
│   │   ├── store/appStore.ts          # Zustand global state
│   │   ├── api/
│   │   │   ├── client.ts             # Backend API client
│   │   │   └── falClient.ts          # fal.ai generation client
│   │   ├── types/index.ts            # TypeScript interfaces
│   │   └── App.tsx
│   └── package.json
├── Dockerfile                         # Railway deployment
├── start_app.bat                      # Windows one-click start
└── scripts/
    ├── start_app.ps1
    ├── start_backend.bat
    └── start_frontend.bat
```

## Admin Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/admin/sessions?admin_key=KEY` | GET | List all participants' canvases |
| `/api/admin/download-data?admin_key=KEY` | GET | Download all data as tar.gz |
| `/api/login` | POST | Participant login |
| `/api/events/log` | POST | Append event to participant log |

## Embedding System

**Active model**: Jina CLIP v2 via Jina AI API
- True shared CLIP space (text and image aligned in same 1024-dim space)
- Image input: base64 JPEG via `POST https://api.jina.ai/v1/embeddings`
- Text input: string via same endpoint
- Caching: `jina_images_<md5>.pkl` / `jina_texts_<md5>.pkl`
- Retry: 3 attempts with [5, 10, 20]s backoff on rate limits

## Acknowledgments

- **Zappos50K Dataset**: UT Austin Vision Lab
- **Jina AI**: CLIP v2 multimodal embeddings
- **fal.ai**: Fast cloud image generation
- **D3.js**: Visualization library

---

Version 3.0 | CMU Thesis Research | 2025-2026
