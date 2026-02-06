# 👟 Zappos50K Semantic Latent Space Explorer

Interactive tool for exploring and generating images in semantic latent spaces using CLIP embeddings and fal.ai image generation.

![Version](https://img.shields.io/badge/version-2.0-blue)
![Python](https://img.shields.io/badge/python-3.8+-green)
![Node](https://img.shields.io/badge/node-18+-green)
![License](https://img.shields.io/badge/license-MIT-blue)

## ✨ Features

### Visualization

- **2D & 3D Canvas**: Toggle between 2D (D3.js) and 3D (Three.js) semantic space visualization
- **Custom Semantic Axes**: Define text-based axes (e.g., "casual ↔ formal", "dark ↔ bright")
- **Genealogy Tracking**: Visual parent-child relationships between generated images
- **Interactive Controls**: Zoom, pan, rotate (3D), hover, and multi-select

### Image Generation (via fal.ai)

- **Text-to-Image**: Generate from text prompts using fal.ai nanobanana
- **Reference-Based**: Generate variations from selected reference images
- **Batch Processing**: Generate multiple images in one request
- **Background Removal**: Optional transparent background extraction

### Smart Features

- **Real-time Positioning**: Images automatically positioned by CLIP semantic similarity
- **History Timeline**: Track all generations with thumbnails and prompts
- **Visual Settings**: Adjustable image size, opacity, spacing, and coordinate scaling

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (React)                     │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │  Canvas 2D  │  │  Canvas 3D   │  │  UI Controls   │ │
│  │  (D3.js)    │  │  (Three.js)  │  │  (Dialogs)     │ │
│  └─────────────┘  └──────────────┘  └────────────────┘ │
│         │                 │                  │           │
│         └─────────────────┴──────────────────┘           │
│                           │                              │
│                    Zustand Store                         │
│                           │                              │
└───────────────────────────┼──────────────────────────────┘
                            │ HTTP/WebSocket
┌───────────────────────────┼──────────────────────────────┐
│                    Backend (FastAPI)                     │
│  ┌──────────────────────────────────────────────────┐   │
│  │            Core ML Pipeline                       │   │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────┐ │   │
│  │  │ CLIP ViT-B  │→ │ Semantic     │→ │ Project │ │   │
│  │  │ Embedder    │  │ Axis Builder │  │ to 2D/3D│ │   │
│  │  └─────────────┘  └──────────────┘  └─────────┘ │   │
│  └──────────────────────────────────────────────────┘   │
│                           │                              │
└───────────────────────────┼──────────────────────────────┘
                            │ REST API
┌───────────────────────────┼──────────────────────────────┐
│                   fal.ai Cloud API                       │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Nanobanana Model (Fast Text-to-Image/Edit)       │ │
│  │  • Text-to-Image generation                        │ │
│  │  • Image editing with references                   │ │
│  │  • 4 images per batch                              │ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Python 3.10+** (recommended with conda/miniconda)
- **Node.js 18+** (with npm)
- **fal.ai API Key** ([Get one free](https://fal.ai))
- **Google Gemini API Key** ([Get one free](https://makersuite.google.com/app/apikey))

### 1. Clone Repository

```bash
git clone <repository-url>
cd Zappos50K_semantic_explorer
```

### 2. Setup Python Environment (Conda)

**Option A: Using Conda (Recommended)**

```bash
# Create conda environment from environment.yml
conda env create -f environment.yml

# Activate the environment
conda activate semantic_explorer
```

**Option B: Using pip**

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies (root requirements.txt includes backend deps)
pip install -r requirements.txt
```

### 3. Frontend Setup

```bash
cd frontend
npm install
```

### 4. Configure API Keys

**Backend Configuration** - Create `backend/.env`:

```bash
GOOGLE_API_KEY=your_gemini_api_key_here
FAL_KEY=your_fal_api_key_here
```

**Frontend Configuration** - Create `frontend/.env`:

```bash
VITE_FAL_API_KEY=your_fal_api_key_here
```

### 5. Run the Application

**Option A: One-click start (Windows)**

Double-click `start_app.bat` (activates conda and starts both servers).

**Option B: PowerShell script**

```powershell
.\scripts\start_app.ps1
```

**Option C: Manual (two terminals)**

Terminal 1 - Backend:

```bash
conda activate semantic_explorer
cd backend
python -m uvicorn api:app --reload
```

Terminal 2 - Frontend:

```bash
cd frontend
npm run dev
```

**Browser:** Open http://localhost:3000 (or http://localhost:5173 depending on Vite config)

## 🎮 Usage Guide

### Basic Interactions

| Action                      | Result                               |
| --------------------------- | ------------------------------------ |
| **Click image**             | Toggle selection (orange border)     |
| **Click canvas background** | Deselect all                         |
| **Hover image**             | Show genealogy (parent/child arrows) |
| **Scroll wheel**            | Zoom in/out                          |
| **Click + Drag**            | Pan canvas                           |
| **ESC key**                 | Close all dialogs                    |

### Generation Workflows

#### 1. Text-to-Image (No Selection)

1. Click **"🎨 Generate Images"**
2. Enter prompt: `"premium leather sneaker design"`
3. Enter count: `8` (batched as 2 requests of 4)
4. Wait ~15 seconds
5. Images appear on canvas positioned by semantic similarity

#### 2. Reference-Based Generation (1+ Images Selected)

1. Select one or more images
2. Floating panel appears → Click **"✨ Generate with prompt..."**
3. Enter modification prompt: `"make it more colorful and sporty"`
4. Adjust count (1-20)
5. Generated variations maintain genealogy connection

#### 3. Semantic Axis Editing

1. Click **X-axis** or **Y-axis** label at canvas edges
2. Enter format: `"negative term ... positive term"`
   - Example X: `"casual ... formal"`
   - Example Y: `"dark ... bright"`
3. All images automatically reposition along new semantic axes

#### 4. 3D Mode

1. Click the **2D/3D toggle** button in the canvas stats bar
2. Canvas switches to Three.js 3D view
3. Click + Drag to rotate, Scroll to zoom
4. Z-axis editor appears for third semantic dimension

### Visual Feedback

- 🟠 **Orange border** = Selected
- 🔵 **Blue border** = Hovered
- 🟢 **Green dashed lines** = Parent relationships (upstream)
- 🟠 **Orange dashed lines** = Child relationships (downstream)
- ✨ **Pulsing glow** = Images in hovered history group

## 🛠️ Tech Stack

### Generation

- **fal.ai nano-banana API** - Fast text-to-image generation (~2-8s per batch)
- **fal.ai nano-banana/edit** - Image editing with reference images

### Embedding & Projection

- **CLIP ViT-B-32** (OpenAI pretrained) - Image and text embeddings (512-dim)
- **Semantic Axis Projection** - Custom projection using CLIP text embeddings (no UMAP)

### Frontend / UI

| Technology                       | Purpose                 |
| -------------------------------- | ----------------------- |
| **React 18**                     | UI framework            |
| **TypeScript**                   | Type safety             |
| **Vite**                         | Build tool & dev server |
| **D3.js 7**                      | 2D canvas visualization |
| **Three.js + React Three Fiber** | 3D canvas visualization |
| **Zustand**                      | State management        |
| **Axios**                        | HTTP client             |
| **@fal-ai/client**               | Image generation API    |
| Real-time thumbnail rendering    | Canvas image display    |
| Interaction logging              | User action tracking    |

### Backend

| Technology              | Purpose                  |
| ----------------------- | ------------------------ |
| **FastAPI**             | REST API server          |
| **Uvicorn**             | ASGI server              |
| **WebSockets**          | Real-time state updates  |
| **PyTorch**             | ML framework             |
| **open-clip-torch**     | CLIP ViT-B-32 embeddings |
| **rembg**               | Background removal       |
| **NumPy, scikit-learn** | Numerical operations     |
| **Pillow (PIL)**        | Image processing         |

### Agent

- **Gemini 2.5 Flash Lite** (google-generativeai) - AI agent for design exploration
- Receives digest of: brief, recent generations, canvas clusters
- Outputs: prompt variants, axes, semantic observations, exploration cues

### External Services

| Service               | Purpose                                   |
| --------------------- | ----------------------------------------- |
| **fal.ai nanobanana** | Fast text-to-image generation (~2s/image) |
| **Google Gemini API** | AI agent service for design exploration   |

## 📁 Project Structure

```
Zappos50K_semantic_explorer/
├── backend/
│   ├── api.py                    # FastAPI server & endpoints
│   └── requirements.txt          # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Canvas/           # SemanticCanvas, SemanticCanvas3D
│   │   │   ├── Canvas3DToggle/    # 2D/3D mode switcher
│   │   │   ├── FloatingActionPanel/
│   │   │   ├── IntentPanel/      # Design brief + AI actions
│   │   │   └── ...
│   │   ├── store/                # Zustand (appStore, progressStore)
│   │   ├── api/                  # client.ts, falClient.ts
│   │   └── App.tsx
│   └── package.json
├── models/
│   ├── embeddings.py             # CLIP embedder
│   ├── semantic_axes.py          # Semantic axis projection
│   └── data_structures.py        # ImageMetadata, HistoryGroup
├── data/
│   └── loader.py                 # Zappos50K dataset loader (for tests)
├── config.py                     # Paths, CLIP config
├── start_app.bat                 # One-click start (activates conda)
├── scripts/
│   ├── start_app.ps1             # PowerShell launcher
│   ├── start_backend.bat
│   └── start_frontend.bat
└── ARCHITECTURE.md               # Detailed architecture doc
```

## 🧪 How It Works

### 1. Image Upload/Generation

```
User prompt → fal.ai API → Generated images (JPEGs)
                 ↓
Backend downloads images → Optionally removes background (rembg)
                 ↓
CLIP ViT-B/32 extracts 512-dim embeddings
```

### 2. Semantic Projection

```
User defines axes: "casual ... formal" (X), "dark ... bright" (Y)
                 ↓
Backend creates CLIP text embeddings for axis endpoints
                 ↓
Compute axis directions as normalized difference vectors
                 ↓
Project image embeddings onto axis directions via dot product
                 ↓
Result: (x, y) or (x, y, z) coordinates in semantic space
```

### 3. Real-time Updates

```
Backend state changes → WebSocket broadcast → Frontend receives update
                                  ↓
Zustand store updates → React re-renders → D3/Three.js updates canvas
```

### 4. Genealogy Tracking

```
Parent image ID → Generate with reference → Child image gets parent_id
                                  ↓
Backend maintains parent-child lists → Canvas draws connecting lines
                                  ↓
Hover parent → Highlight all descendants (recursive)
```

## ⚙️ Configuration

### Visual Settings (Sidebar)

- **Image Size**: 30-400px (default: 80px)
- **Opacity**: 0.3-1.0 (default: 1.0)
- **Layout Padding**: 5-30% spacing around images
- **Coordinate Scale**: 0.1x-5x spread multiplier

### Backend Settings (config.py)

```python
CLIP_MODEL = "ViT-B-32"           # CLIP architecture
EMBEDDING_DIM = 512               # Embedding dimension
CACHE_DIR = Path("cache")         # Embeddings cache location
```

### Frontend Environment (.env)

```bash
VITE_FAL_API_KEY=your_key         # fal.ai API key
```

## 🚧 Known Limitations

- **Interpolation disabled**: Requires local Stable Diffusion (not implemented with fal.ai)
- **Batch limit**: fal.ai processes 4 images per request (larger batches auto-split)
- **Background removal**: CPU-based, adds ~2s per image

## 🐛 Troubleshooting

### Backend won't start

```bash
# Check Python dependencies
cd backend
pip install -r requirements.txt

# Check PyTorch installation
python -c "import torch; print(torch.__version__)"
```

### Frontend won't start

```bash
# Clear cache and reinstall
cd frontend
rm -rf node_modules package-lock.json
npm install
```

### "fal.ai API key not configured"

Create `frontend/.env` with your API key:

```bash
VITE_FAL_API_KEY=your_actual_key_here
```

### Images not appearing

1. Check backend console for errors
2. Verify fal.ai API key is valid
3. Check browser console (F12) for network errors
4. Ensure both backend and frontend are running

### Slow generation

- fal.ai nanobanana is cloud-based (~2-8s per batch)
- Larger image counts are batched (4 images per request)
- Background removal adds ~2s per image

## 📚 API Endpoints

### Backend REST API (http://localhost:8000)

| Endpoint                    | Method    | Description                 |
| --------------------------- | --------- | --------------------------- |
| `/api/state`                | GET       | Get current canvas state    |
| `/api/initialize-clip-only` | POST      | Initialize CLIP embedder    |
| `/api/add-external-images`  | POST      | Add images from fal.ai URLs |
| `/api/update-axes`          | POST      | Change semantic axes        |
| `/api/set-3d-mode`          | POST      | Toggle 2D/3D mode           |
| `/api/clear`                | POST      | Clear all images            |
| `/ws`                       | WebSocket | Real-time state updates     |

### fal.ai API (via frontend)

| Model                    | Purpose                       |
| ------------------------ | ----------------------------- |
| `fal-ai/nanobanana`      | Fast text-to-image generation |
| `fal-ai/nanobanana/edit` | Image editing with references |

## 🤝 Contributing

This is an academic research project. Contributions welcome via pull requests.

## 📄 License

MIT License - See LICENSE file for details

## 🙏 Acknowledgments

- **Zappos50K Dataset**: UT Austin Vision Lab
- **CLIP**: OpenAI
- **fal.ai**: Fast cloud image generation
- **D3.js & Three.js**: Visualization libraries

## 📬 Contact

For questions or issues, please open a GitHub issue.

---

**Made with ❤️ for semantic space exploration** | Version 2.0 | 2025
