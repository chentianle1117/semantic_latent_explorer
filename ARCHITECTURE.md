# Zappos50K Semantic Explorer - Architecture

## Overview

The application consists of a React frontend, FastAPI backend, and external APIs (fal.ai, Google Gemini). Images are generated via fal.ai, embedded with CLIP, and projected onto user-defined semantic axes for visualization.

## Data Flow

```
User Action (prompt, reference, etc.)
    │
    ▼
Frontend (React)
    │
    ├──► fal.ai API (image generation)
    │         │
    │         ▼
    │    Image URLs
    │
    └──► Backend /api/add-external-images
              │
              ├── Download images
              ├── Optional: rembg (background removal)
              ├── CLIP embedder (512-dim vectors)
              ├── Semantic axis projection (2D or 3D coords)
              └── Store ImageMetadata + HistoryGroup
              │
              ▼
         Return updated state
              │
              ▼
         Frontend updates Zustand store
              │
              ▼
         Canvas re-renders (D3 or Three.js)
```

## Components

### Backend (FastAPI)

- **api.py**: All REST endpoints. No local image generation; uses fal.ai via frontend.
- **CLIPEmbedder**: ViT-B/32 for image and text embeddings.
- **SemanticAxisBuilder**: Creates axes from text pairs, projects embeddings.
- **AppState**: In-memory state (images, groups, axis labels, design brief).

### Frontend (React + TypeScript)

- **App.tsx**: Root component, orchestrates dialogs and panels.
- **IntentPanel**: Design brief textarea, AI actions (Analyze Canvas, Suggest Axes).
- **SemanticCanvas / SemanticCanvas3D**: 2D (D3) and 3D (Three.js) visualization.
- **Canvas3DToggle**: Switches between 2D and 3D mode.
- **Zustand**: appStore (images, selection, axes, settings), progressStore (modal).

### External Services

- **fal.ai**: Text-to-image and image editing. Frontend calls directly.
- **Google Gemini**: AI agent for prompts, canvas analysis, axis suggestions. Backend calls.

## Key Algorithms

### Semantic Projection

1. Define axis by positive/negative text (e.g., "sporty" vs "formal").
2. Encode both with CLIP: `pos_emb`, `neg_emb`.
3. Direction vector: `d = pos_emb - neg_emb`.
4. For each image embedding `e`: `coord = e · d`.

### Coordinate Pipeline

- Backend: Raw dot-product coordinates (unbounded).
- Frontend: Normalize to display range, apply user scale/offset, map to screen.

## File Layout

| Path                      | Purpose                            |
| ------------------------- | ---------------------------------- |
| backend/api.py            | FastAPI app, all endpoints         |
| models/embeddings.py      | CLIP embedder                      |
| models/semantic_axes.py   | Axis creation, projection          |
| models/data_structures.py | ImageMetadata, HistoryGroup        |
| config.py                 | Paths, CLIP model, cache dirs      |
| data/loader.py            | ZapposDataLoader (tests, optional) |
