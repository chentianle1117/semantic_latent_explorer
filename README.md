# 👟 Zappos Semantic Latent Space Explorer

Interactive tool for exploring semantic image spaces using CLIP embeddings and Stable Diffusion.

## Features

- **Interactive Canvas**: D3-based visualization of images in 2D semantic space
- **Genealogy Tracking**: Visual parent-child relationships between generated images
- **Semantic Axes**: Custom text-based axes (e.g., "casual ↔ formal", "dark ↔ bright")
- **Image Generation**:
  - Generate from text prompts
  - Generate from reference images
  - Interpolate between two images
- **Real-time Updates**: WebSocket-based live canvas updates

## Quick Start

### 1. Start Backend (Python)
```bash
cd backend
pip install -r requirements.txt
python api.py
```

Backend runs on http://localhost:8000

### 2. Start Frontend (React)
```bash
cd frontend
npm install
npm run dev
```

Frontend runs on http://localhost:5173

## Usage

### Selection
- **Click image** → Select (additive, toggles in/out)
- **Click canvas background** → Deselect all
- **ESC key** → Close all panels

### Generation
- **1 image selected** → "Generate with prompt..." (reference-based)
- **2 images selected** → "Interpolate between (2 selected)"
- **No selection** → "Generate Images" (from text prompt)

### Semantic Axes
- Click X or Y axis labels to edit
- Format: `"negative ... positive"`
- Example: `"casual ... formal"`

## Visual Feedback

- **Orange border** = Selected
- **Blue border** = Hovered
- **Green dashed lines** = Parent relationships
- **Orange dashed lines** = Child relationships
- **Animated dashes** = Genealogy flow direction

## Tech Stack

**Backend**:
- FastAPI
- PyTorch (Stable Diffusion, CLIP)
- scikit-learn (PCA/UMAP)

**Frontend**:
- React + TypeScript
- D3.js (visualization)
- Zustand (state management)
- Axios (API client)

## Project Structure

```
├── backend/           # FastAPI server
│   ├── api.py        # Main API endpoints
│   └── requirements.txt
├── frontend/          # React application
│   └── src/
│       ├── components/  # React components
│       ├── store/       # State management
│       ├── api/         # API client
│       └── styles/      # CSS themes
├── models/            # ML models (embeddings, generation)
├── data/              # Dataset utilities
├── scripts/           # Utility scripts
└── docs/              # Documentation
```

## Documentation

- [Quick Start Guide](QUICK_START.md)
- [Installation Guide](INSTALLATION.md)
- [React Fixes Summary](REACT_FIXES_SUMMARY.md)
- [Old Documentation](docs/old_docs/)

## License

MIT
