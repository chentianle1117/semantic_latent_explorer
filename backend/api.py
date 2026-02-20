"""FastAPI backend for Zappos Semantic Explorer."""

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel
from typing import List, Optional, Dict, Tuple
import numpy as np
import base64
from io import BytesIO
from PIL import Image
import asyncio
from datetime import datetime
import uvicorn
import sys
import os
from pathlib import Path
import requests
from rembg import remove
import zipfile
import json
import tempfile


class _NumpyEncoder(json.JSONEncoder):
    """Fallback encoder that converts numpy scalars/arrays to native Python types."""
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)
from fastapi.responses import FileResponse, StreamingResponse
import google.generativeai as genai
from dotenv import load_dotenv
import re
import socket
from sklearn.neighbors import NearestNeighbors
import uuid as _uuid
import copy

# Load environment variables
load_dotenv()

# Session storage directory
DATA_DIR = Path(__file__).parent / "data"
ADMIN_KEY = os.getenv("ADMIN_KEY", "zappos-admin")

# Configure Gemini
gemini_api_key = os.getenv('GOOGLE_API_KEY')
if gemini_api_key:
    genai.configure(api_key=gemini_api_key)
    print("✓ Gemini API configured")
else:
    print("⚠ WARNING: GOOGLE_API_KEY not found in .env file")

# Add parent directory to Python path to import models
parent_dir = Path(__file__).parent.parent
sys.path.insert(0, str(parent_dir))

# Import our models (SemanticGenerator removed - using fal.ai for generation)
from models import CLIPEmbedder, HuggingFaceCLIPEmbedder, SemanticAxisBuilder
from models.data_structures import ImageMetadata, HistoryGroup

app = FastAPI(title="Zappos Semantic Explorer API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:5173"],  # React dev servers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add validation error handler for better error messages
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Return detailed validation errors to help debug API issues."""
    print(f"\n❌ VALIDATION ERROR on {request.method} {request.url}")
    print(f"Errors: {exc.errors()}")
    try:
        body = await request.body()
        body_str = body.decode('utf-8')[:500] if body else "No body"
    except Exception as e:
        body_str = f"Error reading body: {str(e)}"
    print(f"Body preview: {body_str}")
    return JSONResponse(
        status_code=400,
        content={
            "detail": exc.errors(),
            "body_preview": body_str
        }
    )


# Pydantic models for API
class AxisUpdateRequest(BaseModel):
    x_positive: str
    x_negative: str
    y_positive: str
    y_negative: str
    z_positive: Optional[str] = None  # New: optional z-axis
    z_negative: Optional[str] = None  # New: optional z-axis


class ExternalImage(BaseModel):
    url: str


class AddExternalImagesRequest(BaseModel):
    images: List[ExternalImage]
    prompt: str
    generation_method: str = 'batch'
    remove_background: Optional[bool] = False
    parent_ids: Optional[List[int]] = []  # Parent image IDs for genealogy tracking


class ImageResponse(BaseModel):
    id: int
    group_id: str
    base64_image: str
    coordinates: Tuple[float, ...]  # Changed to support 2D or 3D
    parents: List[int]
    children: List[int]
    generation_method: str
    prompt: str
    timestamp: str
    visible: bool
    is_ghost: bool = False  # Whether this is a ghost/preview suggestion
    suggested_prompt: str = ''  # Suggested prompt for ghost nodes
    reasoning: str = ''  # Why this ghost was suggested
    neighbors: List[int] = []  # K-nearest semantic neighbors for physics simulation


class StateResponse(BaseModel):
    images: List[ImageResponse]
    history_groups: List[Dict]
    axis_labels: Dict[str, Tuple[str, str]]
    is_3d_mode: bool = False  # New: track if in 3D mode
    design_brief: Optional[str] = None  # New: include design brief in state
    grid_cell_size: Tuple[float, float] = (0.7, 0.7)  # Grid cell size in coordinate space
    neighbor_map: Dict[int, List[int]] = {}  # K-nearest neighbors for physics simulation
    clip_model_type: str = "fashionclip"  # Current CLIP model (fashionclip or huggingface)
    expanded_concepts: Optional[Dict[str, List[str]]] = None  # Gemini-expanded concepts (x_neg, x_pos, y_neg, y_pos)


# Global state
class AppState:
    def __init__(self):
        self.embedder: Optional[CLIPEmbedder] = None
        self.axis_builder: Optional[SemanticAxisBuilder] = None
        self.images_metadata: List[ImageMetadata] = []
        self.history_groups: List[HistoryGroup] = []
        self.axis_labels = {
            'x': ('formal', 'sporty'),
            'y': ('dark', 'colorful'),
            'z': ('casual', 'elegant')  # New: default z-axis labels
        }
        self.is_3d_mode = False  # New: track 3D mode
        self.next_id = 0
        self.websocket_connections: List[WebSocket] = []
        self.design_brief: Optional[str] = None  # New: persist design brief
        self.cluster_centroids: List[List[float]] = []  # Cluster centers for edge bundling
        self.cluster_labels: List[int] = []  # Cluster assignment per image
        self.grid_cell_size: Tuple[float, float] = (0.7, 0.7)  # Grid cell size in coordinate space
        self.clip_model_type: str = os.getenv("CLIP_MODEL", "fashionclip")  # "fashionclip" or "huggingface"
        # Caches to avoid redundant Gemini/embedding calls
        self._gemini_expansion_cache: Dict[str, List[str]] = {}  # concept -> expanded concepts
        self._axis_directions_cache: Optional[Tuple] = None  # (labels_key, (x_dir, y_dir, z_dir?))
        # Session / multi-canvas tracking
        self.current_canvas_id: str = str(_uuid.uuid4())
        self.canvas_name: str = "Canvas 1"
        self.participant_id: str = "researcher"
        self.canvas_created_at: str = datetime.now().isoformat()
        self.parent_canvas_id: Optional[str] = None
        self.shared_image_ids: List[int] = []
        self.event_log: List[Dict] = []
        # Frontend-synced layer state (for export)
        self.image_layer_map: Dict[int, str] = {}   # image_id -> layer_id
        self.layer_definitions: List[Dict] = [      # ordered list of layer descriptors
            {"id": "default", "name": "Shoes", "color": "#58a6ff", "visible": True},
            {"id": "references", "name": "References", "color": "#f0883e", "visible": True},
        ]

state = AppState()


def pil_to_base64(pil_image: Image.Image) -> str:
    """Convert PIL image to base64 string."""
    buffered = BytesIO()
    # Save as PNG to preserve transparency if present
    pil_image.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()
    return img_str


# ─── Session helpers ──────────────────────────────────────────────────────────

def _session_path(participant_id: str, canvas_id: str) -> Path:
    """Return the path to a session JSON file, creating parent dirs as needed."""
    p = DATA_DIR / participant_id / "sessions" / f"{canvas_id}.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def _serialize_canvas() -> dict:
    """Serialize current AppState to a JSON-safe dict."""
    images_data = []
    for img in state.images_metadata:
        buf = BytesIO()
        img.pil_image.save(buf, format="PNG")
        b64 = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
        ts = img.timestamp.isoformat() if isinstance(img.timestamp, datetime) else str(img.timestamp)
        images_data.append({
            "id": img.id,
            "group_id": img.group_id,
            "base64_image": b64,
            "embedding": img.embedding.tolist(),
            "coordinates": [float(x) for x in img.coordinates],
            "parents": img.parents,
            "children": img.children,
            "reference_ids": img.reference_ids,
            "generation_method": img.generation_method,
            "prompt": img.prompt,
            "timestamp": ts,
            "visible": img.visible,
            "is_ghost": img.is_ghost,
            "suggested_prompt": img.suggested_prompt,
            "reasoning": img.reasoning,
        })
    history_data = []
    for hg in state.history_groups:
        ts = hg.timestamp.isoformat() if isinstance(hg.timestamp, datetime) else str(hg.timestamp)
        history_data.append({
            "id": hg.id,
            "type": hg.type,
            "image_ids": hg.image_ids,
            "prompt": hg.prompt,
            "visible": hg.visible,
            "thumbnail_id": hg.thumbnail_id,
            "timestamp": ts,
        })
    return {
        "id": state.current_canvas_id,
        "name": state.canvas_name,
        "participantId": state.participant_id,
        "createdAt": state.canvas_created_at,
        "updatedAt": datetime.now().isoformat(),
        "parentCanvasId": state.parent_canvas_id,
        "sharedImageIds": state.shared_image_ids,
        "axisLabels": {k: list(v) for k, v in state.axis_labels.items()},
        "designBrief": state.design_brief,
        "nextId": state.next_id,
        "images": images_data,
        "historyGroups": history_data,
        "eventLog": state.event_log,
    }


def _save_canvas_to_disk() -> Path:
    """Save current canvas state to disk and return the file path."""
    data = _serialize_canvas()
    path = _session_path(state.participant_id, state.current_canvas_id)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, cls=_NumpyEncoder)
    return path


def _deserialize_canvas(data: dict) -> None:
    """Restore AppState from a saved canvas dict (clears existing state)."""
    from models.data_structures import ImageMetadata, HistoryGroup

    # Restore canvas meta
    state.current_canvas_id = data.get("id") or str(_uuid.uuid4())
    state.canvas_name = data.get("name", "Canvas 1")
    state.participant_id = data.get("participantId", "researcher")
    state.canvas_created_at = data.get("createdAt", datetime.now().isoformat())
    state.parent_canvas_id = data.get("parentCanvasId")
    state.shared_image_ids = data.get("sharedImageIds", [])
    state.event_log = data.get("eventLog", [])
    state.design_brief = data.get("designBrief")
    state.next_id = data.get("nextId", 0)

    # Restore axis labels (tuples)
    raw_axes = data.get("axisLabels", {"x": ["formal","sporty"], "y": ["dark","colorful"]})
    state.axis_labels = {k: tuple(v) for k, v in raw_axes.items()}

    # Invalidate caches so reprojection uses restored axis labels
    state._axis_directions_cache = None
    state._gemini_expansion_cache = {}

    # Restore images
    state.images_metadata = []
    all_embeddings = []
    img_records = []
    for img_data in data.get("images", []):
        b64_str = img_data["base64_image"].split(",", 1)[-1]
        pil_img = Image.open(BytesIO(base64.b64decode(b64_str))).convert("RGBA")
        embedding = np.array(img_data["embedding"], dtype=np.float32)
        ts_raw = img_data.get("timestamp", "")
        try:
            ts = datetime.fromisoformat(ts_raw)
        except Exception:
            ts = datetime.now()
        all_embeddings.append(embedding)
        img_records.append((img_data, pil_img, embedding, ts))

    # Reproject all embeddings using restored axis labels
    if img_records and state.embedder and state.axis_builder:
        emb_matrix = np.array([e for _, _, e, _ in img_records])
        coords = project_embeddings_to_coordinates(emb_matrix)
    else:
        coords = [img_data.get("coordinates", [0.0, 0.0]) for img_data, _, _, _ in img_records]

    for i, (img_data, pil_img, embedding, ts) in enumerate(img_records):
        coord = tuple(coords[i]) if hasattr(coords[i], '__iter__') else (0.0, 0.0)
        meta = ImageMetadata(
            id=img_data["id"],
            group_id=img_data.get("group_id", ""),
            pil_image=pil_img,
            embedding=embedding,
            coordinates=coord,
            parents=img_data.get("parents", []),
            children=img_data.get("children", []),
            reference_ids=img_data.get("reference_ids", []),
            generation_method=img_data.get("generation_method", "batch"),
            prompt=img_data.get("prompt", ""),
            timestamp=ts,
            visible=img_data.get("visible", True),
            is_ghost=img_data.get("is_ghost", False),
            suggested_prompt=img_data.get("suggested_prompt", ""),
            reasoning=img_data.get("reasoning", ""),
        )
        state.images_metadata.append(meta)

    # Restore history groups
    from models.data_structures import HistoryGroup
    state.history_groups = []
    for hg_data in data.get("historyGroups", []):
        ts_raw = hg_data.get("timestamp", "")
        try:
            ts = datetime.fromisoformat(ts_raw)
        except Exception:
            ts = datetime.now()
        state.history_groups.append(HistoryGroup(
            id=hg_data["id"],
            type=hg_data.get("type", "batch"),
            image_ids=hg_data.get("image_ids", []),
            prompt=hg_data.get("prompt", ""),
            visible=hg_data.get("visible", True),
            thumbnail_id=hg_data.get("thumbnail_id"),
            timestamp=ts,
        ))

    # Reset cluster data
    state.cluster_centroids = []
    state.cluster_labels = []


def _list_sessions(participant_id: str) -> List[dict]:
    """List all saved canvases for a participant, sorted by updatedAt descending."""
    sessions_dir = DATA_DIR / participant_id / "sessions"
    if not sessions_dir.exists():
        return []
    result = []
    for f in sessions_dir.glob("*.json"):
        try:
            with open(f, encoding="utf-8") as fh:
                d = json.load(fh)
            result.append({
                "id": d.get("id", f.stem),
                "name": d.get("name", "Untitled"),
                "participantId": d.get("participantId", participant_id),
                "createdAt": d.get("createdAt", ""),
                "updatedAt": d.get("updatedAt", ""),
                "parentCanvasId": d.get("parentCanvasId"),
                "imageCount": len(d.get("images", [])),
            })
        except Exception:
            pass
    result.sort(key=lambda x: x.get("updatedAt", ""), reverse=True)
    return result


# ─────────────────────────────────────────────────────────────────────────────


def _get_cached_expansion(concept: str, num_expansions: int = 4) -> Optional[List[str]]:
    """Return cached Gemini expansion if available."""
    key = f"{concept}:{num_expansions}"
    if key in state._gemini_expansion_cache:
        return state._gemini_expansion_cache[key]
    return None


def _set_cached_expansion(concept: str, concepts: List[str], num_expansions: int = 4) -> None:
    """Store Gemini expansion in cache (bounded to ~50 entries)."""
    key = f"{concept}:{num_expansions}"
    state._gemini_expansion_cache[key] = concepts
    if len(state._gemini_expansion_cache) > 50:
        # Evict oldest half
        keys = list(state._gemini_expansion_cache.keys())[:25]
        for k in keys:
            del state._gemini_expansion_cache[k]


def project_embeddings_to_coordinates(embeddings: np.ndarray, use_3d: bool = None) -> np.ndarray:
    """
    Project embeddings onto semantic axes to get 2D or 3D coordinates.
    Uses current axis labels to create semantic directions.
    Caches Gemini expansions and axis directions to avoid redundant API calls.
    """
    if state.axis_builder is None or state.embedder is None:
        raise RuntimeError("Models not initialized")

    if use_3d is None:
        use_3d = state.is_3d_mode

    # Cache key: axis labels tuple
    labels_key = (
        state.axis_labels['x'],
        state.axis_labels['y'],
        state.axis_labels.get('z', (None, None)) if use_3d else (None, None),
    )
    if state._axis_directions_cache is not None:
        cache_key, cached = state._axis_directions_cache
        if cache_key == labels_key:
            x_dir, y_dir, z_dir = cached
            x_coords = embeddings @ x_dir
            y_coords = embeddings @ y_dir
            if z_dir is not None:
                z_coords = embeddings @ z_dir
                coords = np.column_stack([x_coords, y_coords, z_coords])
            else:
                coords = np.column_stack([x_coords, y_coords])
            return coords

    # Build semantic axes (Gemini + embeddings, with cache)
    x_neg, x_pos = state.axis_labels['x']
    x_neg_concepts = _get_cached_expansion(x_neg)
    if x_neg_concepts is None:
        x_neg_concepts = expand_concept_with_gemini(x_neg, num_expansions=4)
        _set_cached_expansion(x_neg, x_neg_concepts)
    x_pos_concepts = _get_cached_expansion(x_pos)
    if x_pos_concepts is None:
        x_pos_concepts = expand_concept_with_gemini(x_pos, num_expansions=4)
        _set_cached_expansion(x_pos, x_pos_concepts)

    x_neg_axis = state.axis_builder.create_ensemble_axis(x_neg_concepts, name=f"ensemble_{x_neg}", positive_concept="neg", negative_concept="neg")
    x_pos_axis = state.axis_builder.create_ensemble_axis(x_pos_concepts, name=f"ensemble_{x_pos}", positive_concept="pos", negative_concept="neg")
    x_direction = x_pos_axis.direction - x_neg_axis.direction
    if np.linalg.norm(x_direction) > 1e-12:
        x_direction = x_direction / np.linalg.norm(x_direction)

    y_neg, y_pos = state.axis_labels['y']
    y_neg_concepts = _get_cached_expansion(y_neg)
    if y_neg_concepts is None:
        y_neg_concepts = expand_concept_with_gemini(y_neg, num_expansions=4)
        _set_cached_expansion(y_neg, y_neg_concepts)
    y_pos_concepts = _get_cached_expansion(y_pos)
    if y_pos_concepts is None:
        y_pos_concepts = expand_concept_with_gemini(y_pos, num_expansions=4)
        _set_cached_expansion(y_pos, y_pos_concepts)

    y_neg_axis = state.axis_builder.create_ensemble_axis(y_neg_concepts, name=f"ensemble_{y_neg}", positive_concept="neg", negative_concept="neg")
    y_pos_axis = state.axis_builder.create_ensemble_axis(y_pos_concepts, name=f"ensemble_{y_pos}", positive_concept="pos", negative_concept="neg")
    y_direction = y_pos_axis.direction - y_neg_axis.direction
    if np.linalg.norm(y_direction) > 1e-12:
        y_direction = y_direction / np.linalg.norm(y_direction)

    z_direction = None
    if use_3d and 'z' in state.axis_labels:
        z_neg, z_pos = state.axis_labels['z']
        z_neg_concepts = _get_cached_expansion(z_neg)
        if z_neg_concepts is None:
            z_neg_concepts = expand_concept_with_gemini(z_neg, num_expansions=4)
            _set_cached_expansion(z_neg, z_neg_concepts)
        z_pos_concepts = _get_cached_expansion(z_pos)
        if z_pos_concepts is None:
            z_pos_concepts = expand_concept_with_gemini(z_pos, num_expansions=4)
            _set_cached_expansion(z_pos, z_pos_concepts)
        z_neg_axis = state.axis_builder.create_ensemble_axis(z_neg_concepts, name=f"ensemble_{z_neg}", positive_concept="neg", negative_concept="neg")
        z_pos_axis = state.axis_builder.create_ensemble_axis(z_pos_concepts, name=f"ensemble_{z_pos}", positive_concept="pos", negative_concept="neg")
        z_direction = z_pos_axis.direction - z_neg_axis.direction
        if np.linalg.norm(z_direction) > 1e-12:
            z_direction = z_direction / np.linalg.norm(z_direction)

    # Cache directions for reuse
    state._axis_directions_cache = (labels_key, (x_direction, y_direction, z_direction))

    x_coords = embeddings @ x_direction
    y_coords = embeddings @ y_direction
    if z_direction is not None:
        z_coords = embeddings @ z_direction
        coords = np.column_stack([x_coords, y_coords, z_coords])
    else:
        coords = np.column_stack([x_coords, y_coords])
    return coords


# Grid-based layout parameters
GRID_CELL_SIZE = 0.7  # Grid cell size as fraction of image size in coordinate space


def snap_to_grid(coords: np.ndarray, cell_size: float = GRID_CELL_SIZE,
                 target_aspect_range: Tuple[float, float] = (16/9, 1.0)) -> np.ndarray:
    """
    Snap coordinates to a grid layout with aspect ratio enforcement.

    Each shoe snaps to the nearest available grid cell. If multiple candidates,
    uses closest-first priority. Enforces overall distribution between 16:9 and 1:1.

    Args:
        coords: Projected coordinates (N, 2)
        cell_size: Grid cell size in coordinate space
        target_aspect_range: (min_aspect, max_aspect) for overall distribution

    Returns:
        Grid-snapped coordinates (N, 2)
    """
    if len(coords) < 1:
        return coords

    n = len(coords)
    result = coords.copy().astype(float)

    # Normalize coordinates to [0, 1] range for aspect ratio calculation
    min_vals = np.min(result, axis=0)
    max_vals = np.max(result, axis=0)
    extent = max_vals - min_vals

    # Enforce aspect ratio by adjusting extent
    current_aspect = extent[0] / max(extent[1], 1e-6)
    min_aspect, max_aspect = target_aspect_range

    if current_aspect < min_aspect:  # Too tall, stretch width
        target_width = extent[1] * min_aspect
        x_center = (min_vals[0] + max_vals[0]) / 2
        result[:, 0] = (result[:, 0] - x_center) * (target_width / max(extent[0], 1e-6)) + x_center
        extent[0] = target_width
    elif current_aspect > max_aspect:  # Too wide, stretch height
        target_height = extent[0] / max_aspect
        y_center = (min_vals[1] + max_vals[1]) / 2
        result[:, 1] = (result[:, 1] - y_center) * (target_height / max(extent[1], 1e-6)) + y_center
        extent[1] = target_height

    # Snap each point to nearest grid cell
    # Build occupancy map as we go: cell -> list of point indices
    occupied: Dict[Tuple[int, int], List[int]] = {}
    snapped = np.zeros_like(result)

    # Sort by distance from origin to process central points first
    distances = np.linalg.norm(result, axis=1)
    order = np.argsort(distances)

    for idx in order:
        point = result[idx]

        # Find nearest grid cell
        grid_x = int(np.round(point[0] / cell_size))
        grid_y = int(np.round(point[1] / cell_size))

        # Check if cell is available
        cell = (grid_x, grid_y)
        if cell not in occupied:
            occupied[cell] = [idx]
            snapped[idx] = np.array([grid_x * cell_size, grid_y * cell_size])
        else:
            # Cell occupied, spiral search for nearest available cell
            found = False
            for radius in range(1, 20):  # Max spiral radius
                for dx in range(-radius, radius + 1):
                    for dy in range(-radius, radius + 1):
                        if max(abs(dx), abs(dy)) != radius:
                            continue  # Only check perimeter of current radius

                        candidate = (grid_x + dx, grid_y + dy)
                        if candidate not in occupied:
                            occupied[candidate] = [idx]
                            snapped[idx] = np.array([candidate[0] * cell_size, candidate[1] * cell_size])
                            found = True
                            break
                    if found:
                        break
                if found:
                    break

            if not found:
                # Fallback: use original coordinate with small jitter
                snapped[idx] = point + np.random.uniform(-0.1, 0.1, 2)

    # Re-center to origin
    center = np.mean(snapped, axis=0)
    snapped -= center

    return snapped


def get_semantic_neighbors(metadata: List[ImageMetadata], k: int = 5) -> Dict[int, List[int]]:
    """
    Calculate K-nearest neighbors for each image based on CLIP embeddings.

    Args:
        metadata: List of ImageMetadata objects
        k: Number of neighbors to find for each image

    Returns:
        Dict mapping image_id -> list of neighbor image_ids
    """
    if len(metadata) < 2:
        return {img.id: [] for img in metadata}

    # Extract embeddings and IDs
    embeddings = np.array([img.embedding for img in metadata])
    image_ids = [img.id for img in metadata]

    # Use cosine similarity (1 - cosine distance) for semantic similarity
    # KNN with cosine metric
    k_actual = min(k + 1, len(metadata))  # +1 because each point is its own nearest neighbor
    nbrs = NearestNeighbors(n_neighbors=k_actual, metric='cosine').fit(embeddings)
    distances, indices = nbrs.kneighbors(embeddings)

    # Build neighbor map
    neighbor_map = {}
    for i, neighbors in enumerate(indices):
        source_id = image_ids[i]
        # Exclude self (first neighbor is always self with distance 0)
        neighbor_ids = [image_ids[n] for n in neighbors[1:]]
        neighbor_map[source_id] = neighbor_ids

    return neighbor_map


# Minimum coord distance to avoid overlap — just enough to prevent image clipping
MIN_COORD_DISTANCE = 0.15


def apply_layout_spread(coords: np.ndarray, min_spacing_ratio: float = 0.2,
                        max_iterations: int = 150, cluster_attraction: float = 0.10) -> np.ndarray:
    """
    Force-directed repulsion to prevent overlap while preserving relative positions.
    Adds centripetal attraction toward cluster centers to form visible groups.
    Iteratively pushes overlapping nodes apart, then re-centers to origin.
    """
    if len(coords) < 2:
        return coords

    n = len(coords)
    result = coords.copy().astype(float)
    rng = np.random.default_rng(42)

    # Pre-spread: scale coordinates so extent fills at least 1.0 units
    extent_pre = np.ptp(result, axis=0)
    max_extent_pre = float(np.max(extent_pre))
    if max_extent_pre > 1e-6 and max_extent_pre < 1.0:
        scale_factor = 1.0 / max_extent_pre
        center_pre = np.mean(result, axis=0)
        result = (result - center_pre) * scale_factor + center_pre

    # Handle degenerate case: all points identical
    dists_check = np.linalg.norm(result - result[0], axis=-1)
    if np.max(dists_check) < 1e-10:
        jitter = rng.uniform(-0.05, 0.05, result.shape)
        result += jitter

    # Compute clusters for centripetal attraction
    from sklearn.cluster import KMeans
    k = min(5, max(2, n // 8))
    km = KMeans(n_clusters=k, random_state=42, n_init=10).fit(result)

    # Calculate minimum allowed distance in coordinate space
    extent = np.ptp(result, axis=0)
    max_extent = max(float(np.max(extent)), 1e-6)
    min_dist = max(max_extent * min_spacing_ratio, MIN_COORD_DISTANCE)

    for iteration in range(max_iterations):
        forces = np.zeros_like(result)
        max_overlap = 0.0

        # Repulsion forces — gentle, just prevent overlap
        for i in range(n):
            for j in range(i + 1, n):
                delta = result[i] - result[j]
                dist = float(np.linalg.norm(delta))

                if dist < 1e-10:
                    # Identical points: add random jitter direction
                    delta = rng.uniform(-0.01, 0.01, delta.shape)
                    dist = float(np.linalg.norm(delta)) + 1e-10

                if dist < min_dist:
                    overlap = min_dist - dist
                    max_overlap = max(max_overlap, overlap)
                    # Repulsion force proportional to overlap
                    direction = delta / dist
                    force_magnitude = overlap * 0.5  # Gentler repulsion
                    forces[i] += direction * force_magnitude
                    forces[j] -= direction * force_magnitude

        # Centripetal attraction toward cluster centers
        for i in range(n):
            centroid = km.cluster_centers_[km.labels_[i]]
            attraction = (centroid - result[i]) * cluster_attraction
            forces[i] += attraction

        if max_overlap < min_dist * 0.02:  # Converged: <2% overlap remaining
            break

        result += forces

    # Re-center to origin (ensures canvas auto-centering works)
    center = np.mean(result, axis=0)
    result -= center

    return result


def update_clusters():
    """Compute and store cluster centroids and labels for edge bundling."""
    visible = [img for img in state.images_metadata if img.visible]
    if len(visible) < 2:
        state.cluster_centroids = []
        state.cluster_labels = []
        return

    coords = np.array([img.coordinates for img in visible])
    from sklearn.cluster import KMeans
    k = min(5, max(2, len(visible) // 8))
    km = KMeans(n_clusters=k, random_state=42, n_init=10).fit(coords)

    state.cluster_centroids = km.cluster_centers_.tolist()
    # Map image ID to cluster label
    id_to_label = {visible[i].id: int(km.labels_[i]) for i in range(len(visible))}
    # Create full label list aligned with images_metadata
    state.cluster_labels = [id_to_label.get(img.id, -1) for img in state.images_metadata]


def image_metadata_to_response(img: ImageMetadata, neighbor_map: Optional[Dict[int, List[int]]] = None) -> ImageResponse:
    """Convert ImageMetadata to API response."""
    neighbors = neighbor_map.get(img.id, []) if neighbor_map else []
    return ImageResponse(
        id=img.id,
        group_id=img.group_id,
        base64_image=pil_to_base64(img.pil_image),
        coordinates=img.coordinates,
        parents=img.parents,
        children=img.children,
        generation_method=img.generation_method,
        prompt=img.prompt,
        timestamp=img.timestamp.isoformat(),
        visible=img.visible,
        is_ghost=img.is_ghost,
        suggested_prompt=img.suggested_prompt,
        reasoning=img.reasoning,
        neighbors=neighbors
    )


async def broadcast_state_update():
    """Broadcast state update to all connected WebSocket clients."""
    if not state.websocket_connections:
        return

    # Calculate K-nearest neighbors for physics simulation
    visible_metadata = [img for img in state.images_metadata if img.visible]
    neighbor_map = get_semantic_neighbors(visible_metadata, k=5) if len(visible_metadata) > 1 else {}

    response = {
        "type": "state_update",
        "data": {
            "images": [image_metadata_to_response(img, neighbor_map).model_dump() for img in visible_metadata],
            "history_groups": [
                {
                    "id": g.id,
                    "type": g.type,
                    "image_ids": g.image_ids,
                    "prompt": g.prompt,
                    "visible": g.visible,
                    "thumbnail_id": g.thumbnail_id,
                    "timestamp": g.timestamp.isoformat()
                }
                for g in state.history_groups
            ],
            "axis_labels": state.axis_labels,
            "design_brief": state.design_brief,  # Include design brief in broadcast
            "cluster_centroids": state.cluster_centroids,  # For edge bundling
            "cluster_labels": state.cluster_labels,  # Per-image cluster assignment
            "grid_cell_size": list(state.grid_cell_size),  # Grid cell size for canvas overlay
            "neighbor_map": neighbor_map,  # K-nearest neighbors for physics simulation
            "clip_model_type": state.clip_model_type,  # Current CLIP model
            "expanded_concepts": _get_expanded_concepts_for_state()  # Gemini expansions for axis labels
        }
    }

    # Send to all connections
    dead_connections = []
    for ws in state.websocket_connections:
        try:
            await ws.send_json(response)
        except:
            dead_connections.append(ws)

    # Remove dead connections
    for ws in dead_connections:
        state.websocket_connections.remove(ws)


@app.get("/")
async def root():
    print("🏠 ROOT ENDPOINT HIT - NEW VERSION 2025-10-31")
    return {
        "message": "Zappos Semantic Explorer API",
        "status": "running",
        "version": "2025-10-31-UPDATED"
    }

@app.get("/api/test")
async def test():
    print("🧪 TEST ENDPOINT HIT")
    return {"message": "Backend is working!", "status": "ok"}


def _get_expanded_concepts_for_state() -> Optional[Dict[str, List[str]]]:
    """Return cached Gemini expansions for current axis labels, if available."""
    out: Dict[str, List[str]] = {}
    axes = ("x", "y", "z") if "z" in state.axis_labels else ("x", "y")
    for axis in axes:
        neg, pos = state.axis_labels.get(axis, ("", ""))
        key_neg = f"{axis}_negative"
        key_pos = f"{axis}_positive"
        for key, label in [(key_neg, neg), (key_pos, pos)]:
            cache_key = f"{label}:4"
            if label and cache_key in state._gemini_expansion_cache:
                out[key] = state._gemini_expansion_cache[cache_key]
    return out if out else None


@app.get("/api/state")
async def get_state():
    """Get current application state."""
    # Calculate K-nearest neighbors for physics simulation
    visible_metadata = [img for img in state.images_metadata if img.visible]
    neighbor_map = get_semantic_neighbors(visible_metadata, k=5) if len(visible_metadata) > 1 else {}

    return StateResponse(
        images=[image_metadata_to_response(img, neighbor_map) for img in visible_metadata],
        history_groups=[
            {
                "id": g.id,
                "type": g.type,
                "image_ids": g.image_ids,
                "prompt": g.prompt,
                "visible": g.visible,
                "thumbnail_id": g.thumbnail_id,
                "timestamp": g.timestamp.isoformat()
            }
            for g in state.history_groups
        ],
        axis_labels=state.axis_labels,
        is_3d_mode=state.is_3d_mode,  # New: include 3D mode state
        design_brief=state.design_brief,  # New: include design brief
        grid_cell_size=state.grid_cell_size,  # Grid cell size for canvas overlay
        neighbor_map=neighbor_map,  # K-nearest neighbors for physics simulation
        clip_model_type=state.clip_model_type,  # Current CLIP model
        expanded_concepts=_get_expanded_concepts_for_state()
    )


def initialize_embedder(model_type: str = "fashionclip"):
    """Initialize the appropriate CLIP embedder based on model type."""
    print(f"🔄 Initializing {model_type} embedder...")
    if model_type == "huggingface":
        return HuggingFaceCLIPEmbedder()
    else:
        return CLIPEmbedder()


def expand_concept_with_gemini(concept: str, num_expansions: int = 4) -> List[str]:
    """
    Use Gemini to expand a single concept into multiple visual descriptions.

    Args:
        concept: Single word/phrase (e.g., "sporty", "formal")
        num_expansions: Number of concrete descriptions to generate (default 4)

    Returns:
        List of visual descriptions suitable for CLIP text encoder

    Example:
        expand_concept_with_gemini("sporty", 5) →
        [
            "running shoe with mesh upper",
            "athletic sneaker with thick rubber sole",
            "sportswear footwear with cushioned midsole",
            "training shoe with breathable fabric",
            "gym sneaker with flexible design"
        ]
    """
    try:
        gemini_model = genai.GenerativeModel("gemini-2.5-flash-lite")

        prompt = f"""You are a fashion expert helping to create visual descriptions for AI image understanding.

Given the concept "{concept}", generate {num_expansions} diverse, concrete visual descriptions that capture different aspects of this concept in footwear.

Requirements:
- Each description should be 3-8 words
- Focus on VISUAL attributes (materials, colors, shapes, textures, construction)
- Be specific and concrete (avoid vague adjectives)
- Cover different interpretations of the concept
- Suitable for CLIP text encoder (trained on image captions)

Format: Return ONLY a JSON array of strings, no other text.

Example for "elegant":
["leather pump with pointed toe", "satin heel with crystal embellishment", "minimalist patent leather oxford", "sleek ankle boot with slim profile"]

Now generate {num_expansions} descriptions for "{concept}":"""

        response = gemini_model.generate_content(prompt)
        text = (getattr(response, "text", None) or "").strip()
        # Strip markdown code block if present (Gemini often returns ```json\n[...]\n```)
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*\n?", "", text)
            text = re.sub(r"\n?```\s*$", "", text)
            text = text.strip()
        # Extract JSON array by regex (handles any wrapping)
        match = re.search(r"\[[\s\S]*\]", text)
        if match:
            text = match.group(0)
        concepts = json.loads(text)

        if not isinstance(concepts, list) or len(concepts) == 0:
            print(f"⚠️ Gemini returned invalid format for '{concept}', using fallback")
            return [concept]  # Fallback to original

        print(f"✨ Expanded '{concept}' into {len(concepts)} concepts")
        return concepts[:num_expansions]  # Trim to requested count

    except Exception as e:
        print(f"❌ Gemini expansion failed for '{concept}': {e}")
        return [concept]  # Fallback to original single concept


@app.post("/api/initialize-clip-only")
async def initialize_clip_only():
    """Initialize only CLIP embedder (for fal.ai mode)."""
    try:
        if state.embedder is None:
            print(f"Loading {state.clip_model_type} embedder...")
            state.embedder = initialize_embedder(state.clip_model_type)
            print(f"{state.clip_model_type.upper()} loaded successfully")

        if state.axis_builder is None:
            state.axis_builder = SemanticAxisBuilder(state.embedder)
            print("Axis builder initialized")

        # Recalculate and rescale all image positions whenever encoding/axes become available
        if len(state.images_metadata) > 0 and state.axis_builder and state.embedder:
            print("Recalculating positions for existing images...")
            all_embeddings = np.array([img.embedding for img in state.images_metadata])
            new_coords = project_embeddings_to_coordinates(all_embeddings, use_3d=state.is_3d_mode)
            # Grid snapping disabled - using semantic projection directly
            for i, img_meta in enumerate(state.images_metadata):
                img_meta.coordinates = tuple(float(c) for c in new_coords[i])
            update_clusters()  # Update clusters for edge bundling
            await broadcast_state_update()
            print("OK: Positions recalculated and rescaled")

        return {"status": "success", "message": "CLIP initialized"}
    except Exception as e:
        print(f"ERROR initializing CLIP: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/update-axes")
async def update_semantic_axes(request: AxisUpdateRequest):
    """Update semantic axes and recalculate positions."""
    try:
        # Deduplicate: skip if labels unchanged (avoids redundant work from double frontend calls)
        new_x = (request.x_negative, request.x_positive)
        new_y = (request.y_negative, request.y_positive)
        new_z = (request.z_negative, request.z_positive) if request.z_positive and request.z_negative else state.axis_labels.get('z', (None, None))
        if (state.axis_labels['x'] == new_x and state.axis_labels['y'] == new_y and
            state.axis_labels.get('z', (None, None)) == new_z):
            await broadcast_state_update()
            return {"status": "success", "message": "Axes unchanged (skipped)"}

        print(f"\n=== Updating Semantic Axes ===")
        print(f"X: {request.x_negative} → {request.x_positive}")
        print(f"Y: {request.y_negative} → {request.y_positive}")

        state.axis_labels['x'] = new_x
        state.axis_labels['y'] = new_y
        if request.z_positive and request.z_negative:
            print(f"Z: {request.z_negative} → {request.z_positive}")
            state.axis_labels['z'] = new_z

        # Invalidate axis cache when labels change
        state._axis_directions_cache = None

        # Recalculate positions only if models are initialized and we have images
        if state.axis_builder is not None and state.embedder is not None and len(state.images_metadata) > 0:
            print(f"Recalculating positions for {len(state.images_metadata)} images...")
            all_embeddings = np.array([img.embedding for img in state.images_metadata])
            new_coords = project_embeddings_to_coordinates(all_embeddings)
            # Grid snapping disabled - using semantic projection directly

            for i, img_meta in enumerate(state.images_metadata):
                # Store coordinates as tuple (2D or 3D)
                img_meta.coordinates = tuple(float(c) for c in new_coords[i])
            update_clusters()  # Update clusters for edge bundling

            print(f"OK: All positions recalculated")
        elif len(state.images_metadata) > 0:
            print("⚠ WARNING: Models not initialized, axis labels updated but positions not recalculated")
            print("   Positions will be recalculated when models are initialized")

        await broadcast_state_update()

        return {"status": "success", "message": "Axes updated"}

    except Exception as e:
        print(f"ERROR updating axes: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/set-3d-mode")
async def set_3d_mode(use_3d: bool):
    """Toggle between 2D and 3D visualization mode."""
    try:
        if state.axis_builder is None or state.embedder is None:
            raise HTTPException(status_code=400, detail="Models not initialized")

        print(f"\n=== Setting 3D Mode: {use_3d} ===")
        state.is_3d_mode = use_3d

        # Recalculate ALL positions with new dimensionality
        if len(state.images_metadata) > 0:
            print(f"Recalculating positions for {len(state.images_metadata)} images in {'3D' if use_3d else '2D'} mode...")
            all_embeddings = np.array([img.embedding for img in state.images_metadata])
            new_coords = project_embeddings_to_coordinates(all_embeddings, use_3d=use_3d)
            # Grid snapping disabled - using semantic projection directly

            for i, img_meta in enumerate(state.images_metadata):
                # Store coordinates as tuple (2D or 3D)
                img_meta.coordinates = tuple(float(c) for c in new_coords[i])
            update_clusters()  # Update clusters for edge bundling

            print(f"OK: All positions recalculated to {'3D' if use_3d else '2D'}")

        await broadcast_state_update()

        return {
            "status": "success",
            "is_3d_mode": use_3d,
            "message": f"Switched to {'3D' if use_3d else '2D'} mode"
        }

    except Exception as e:
        print(f"ERROR setting 3D mode: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/set-clip-model")
async def set_clip_model(model_type: str):
    """Switch between FashionCLIP and HuggingFace CLIP models."""
    try:
        if model_type not in ["fashionclip", "huggingface"]:
            raise HTTPException(status_code=400, detail="Invalid model type. Must be 'fashionclip' or 'huggingface'")

        print(f"\n=== Switching CLIP Model: {model_type} ===")

        # Update model type
        old_model = state.clip_model_type
        state.clip_model_type = model_type

        # Reinitialize embedder with new model
        print(f"🔄 Reinitializing embedder from {old_model} to {model_type}...")
        state.embedder = initialize_embedder(model_type)
        state.axis_builder = SemanticAxisBuilder(state.embedder)
        state._axis_directions_cache = None  # Invalidate: axes depend on embedder
        print(f"✅ Embedder switched to {model_type}")

        # Re-project all images with new model
        if len(state.images_metadata) > 0:
            print(f"🔄 Re-projecting {len(state.images_metadata)} images with new model...")
            all_embeddings = np.array([img.embedding for img in state.images_metadata])
            new_coords = project_embeddings_to_coordinates(all_embeddings)

            for i, img_meta in enumerate(state.images_metadata):
                img_meta.coordinates = tuple(float(c) for c in new_coords[i])

            update_clusters()
            print(f"✅ All positions recalculated with {model_type} model")

        await broadcast_state_update()

        return {
            "status": "success",
            "model_type": model_type,
            "message": f"Switched to {model_type} CLIP model"
        }

    except Exception as e:
        # Revert on error
        state.clip_model_type = old_model if 'old_model' in locals() else "fashionclip"
        print(f"❌ ERROR switching CLIP model: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


class DesignBriefRequest(BaseModel):
    brief: str

@app.post("/api/update-design-brief")
async def update_design_brief(request: DesignBriefRequest):
    """Update the design brief in application state."""
    try:
        print(f"\n=== Updating Design Brief ===")
        print(f"Brief: {request.brief[:100]}..." if len(request.brief) > 100 else f"Brief: {request.brief}")
        state.design_brief = request.brief.strip() if request.brief else None
        await broadcast_state_update()
        return {"status": "success", "message": "Design brief updated", "brief": state.design_brief}
    except Exception as e:
        print(f"ERROR updating design brief: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/images/{image_id}")
async def delete_image(image_id: int):
    """Remove image from canvas."""
    img = next((img for img in state.images_metadata if img.id == image_id), None)
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    img.visible = False
    await broadcast_state_update()

    return {"status": "success"}


@app.post("/api/images/{image_id}/restore")
async def restore_image(image_id: int):
    """Restore a soft-deleted image back to the canvas."""
    img = next((img for img in state.images_metadata if img.id == image_id), None)
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    img.visible = True
    await broadcast_state_update()

    return {"status": "success"}


@app.post("/api/clear")
async def clear_canvas():
    """Clear all images."""
    state.images_metadata = []
    state.history_groups = []
    state.next_id = 0

    await broadcast_state_update()

    return {"status": "success"}


@app.post("/api/reapply-layout")
async def reapply_layout():
    """Re-apply layout spread to all images to fix overlap. Call after loading or when shoes overlap."""
    try:
        if state.axis_builder is None or state.embedder is None:
            raise HTTPException(status_code=400, detail="Models not initialized")
        if len(state.images_metadata) < 2:
            return {"status": "success", "message": "Nothing to spread"}

        print("Reapplying pure CLIP semantic projection...")
        all_embeddings = np.array([img.embedding for img in state.images_metadata])
        new_coords = project_embeddings_to_coordinates(all_embeddings, use_3d=state.is_3d_mode)
        # Pure CLIP projection - no grid, physics, or collision
        for i, img_meta in enumerate(state.images_metadata):
            img_meta.coordinates = tuple(float(c) for c in new_coords[i])
        update_clusters()  # Update clusters for edge bundling
        print("OK: Pure semantic layout applied")
        await broadcast_state_update()
        return {"status": "success", "message": "Layout reapplied"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR in reapply_layout: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/add-external-images")
async def add_external_images(request: AddExternalImagesRequest):
    """Add images from external URLs (e.g., fal.ai) or data URLs (local files) and compute embeddings."""
    print("\n" + "="*80)
    print("🚀 ADD EXTERNAL IMAGES ENDPOINT HIT!")
    print("="*80)
    try:
        print(f"\n=== Add External Images Request ===")
        print(f"Prompt: {request.prompt}")
        print(f"Count: {len(request.images)}")
        print(f"Method: {request.generation_method}")

        # Debug: check first URL
        if len(request.images) > 0:
            first_url = request.images[0].url
            print(f"First URL type: {type(first_url)}")
            print(f"First URL preview (100 chars): {str(first_url)[:100]}")
            print(f"Starts with 'data:': {str(first_url).startswith('data:')}")

        if state.embedder is None:
            raise HTTPException(status_code=400, detail="CLIP embedder not initialized. Call /api/initialize-clip-only first.")

        # Download images from URLs or decode data URLs
        print("Loading images...")
        pil_images = []
        for i, img_data in enumerate(request.images):
            url = str(img_data.url)  # Ensure it's a string
            print(f"  Processing image {i+1}/{len(request.images)}")
            print(f"  URL type: {type(url)}, first 50 chars: {url[:50]}")

            # Check if it's a data URL (base64 encoded) or HTTP URL
            is_data_url = url.startswith('data:')
            is_http_url = url.startswith('http://') or url.startswith('https://')

            print(f"  is_data_url={is_data_url}, is_http_url={is_http_url}")

            if is_data_url:
                print(f"  → Decoding from data URL...")
                # Extract base64 data from data URL
                # Format: data:image/png;base64,iVBORw0KGgoAAAANS...
                try:
                    if ',' not in url:
                        raise ValueError("Invalid data URL format: missing comma separator")

                    header, encoded = url.split(',', 1)
                    img_bytes = base64.b64decode(encoded)
                    img = Image.open(BytesIO(img_bytes))
                    print(f"  ✓ Image {i+1} decoded (size: {img.size})")
                except Exception as e:
                    print(f"  ✗ ERROR decoding data URL: {e}")
                    raise HTTPException(status_code=400, detail=f"Failed to decode image {i+1}: {str(e)}")
            elif is_http_url:
                print(f"  → Downloading from HTTP URL: {url[:50]}...")
                try:
                    response = requests.get(url, timeout=30)
                    response.raise_for_status()
                    img = Image.open(BytesIO(response.content))
                    print(f"  ✓ Image {i+1} downloaded (size: {img.size})")
                except Exception as e:
                    print(f"  ✗ ERROR downloading: {e}")
                    raise HTTPException(status_code=400, detail=f"Failed to download image {i+1}: {str(e)}")
            else:
                print(f"  ✗ ERROR: Unsupported URL format: {url[:100]}")
                raise HTTPException(status_code=400, detail=f"Unsupported URL format for image {i+1}: {url[:100]}")

            # Remove background if requested
            if request.remove_background is True:
                # rembg needs RGB input
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                print(f"  Removing background from image {i+1}...")
                img_bytes = BytesIO()
                img.save(img_bytes, format='PNG')
                img_bytes.seek(0)

                output_bytes = remove(img_bytes.getvalue())

                img = Image.open(BytesIO(output_bytes))
                if img.mode != 'RGBA':
                    img = img.convert('RGBA')
                print(f"  OK: Background removed from image {i+1} (transparent)")
            else:
                # Preserve RGBA transparency (agent ghost images already have BG removed).
                # Only normalise exotic modes (P, CMYK, etc.) to RGB.
                if img.mode not in ('RGB', 'RGBA'):
                    img = img.convert('RGB')

            pil_images.append(img)

        # Extract embeddings
        print("Extracting CLIP embeddings...")
        embeddings = state.embedder.extract_image_embeddings_from_pil(pil_images)
        print("OK: Embeddings extracted")

        # Create ImageMetadata objects (placeholder coords; we reproject all below)
        group_id = f"{request.generation_method}_{len(state.history_groups)}"
        new_metadata = []

        for i, (img, emb) in enumerate(zip(pil_images, embeddings)):
            img_meta = ImageMetadata(
                id=state.next_id,
                group_id=group_id,
                pil_image=img,
                embedding=emb,
                coordinates=(0.0, 0.0),  # Placeholder; reprojected below
                parents=request.parent_ids.copy(),  # Set parent relationships
                children=[],
                generation_method=request.generation_method,
                prompt=request.prompt,
                reference_ids=request.parent_ids.copy(),  # Reference IDs same as parents
                timestamp=datetime.now(),
                visible=True
            )
            new_metadata.append(img_meta)
            state.next_id += 1

        state.images_metadata.extend(new_metadata)

        # Incremental projection: only project new images onto current axes (existing images unchanged)
        if len(new_metadata) >= 1:
            print("Projecting new images onto axes...")
            new_coords = project_embeddings_to_coordinates(embeddings, use_3d=state.is_3d_mode)
            for i, img_meta in enumerate(new_metadata):
                img_meta.coordinates = tuple(float(c) for c in new_coords[i])
            print("OK: New positions assigned")
            update_clusters()  # Update clusters for edge bundling

        # Update parent images' children lists
        if request.parent_ids:
            print(f"Updating parent-child relationships for {len(request.parent_ids)} parents...")
            for parent_id in request.parent_ids:
                parent = next((img for img in state.images_metadata if img.id == parent_id), None)
                if parent:
                    # Add all new image IDs as children of this parent
                    for new_img in new_metadata:
                        if new_img.id not in parent.children:
                            parent.children.append(new_img.id)
                    print(f"  OK: Parent {parent_id} now has {len(parent.children)} children")
                else:
                    print(f"  WARNING: Parent {parent_id} not found")

        # Create history group
        image_ids = [m.id for m in new_metadata]
        history_group = HistoryGroup(
            id=group_id,
            type=request.generation_method,
            image_ids=image_ids,
            prompt=request.prompt,
            visible=True,
            thumbnail_id=image_ids[0] if image_ids else None,
            timestamp=datetime.now()
        )
        state.history_groups.append(history_group)

        # Broadcast update
        await broadcast_state_update()

        print(f"OK: Added {len(new_metadata)} external images to canvas")
        return {
            "status": "success",
            "images": [image_metadata_to_response(img).model_dump() for img in new_metadata]
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"\n!!! ERROR in add_external_images !!!")
        print(f"Error type: {type(e).__name__}")
        print(f"Error message: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# AGENT ENDPOINTS
# ============================================================================

@app.get("/api/canvas-digest")
async def get_canvas_digest():
    """Get lightweight canvas summary for agent analysis"""
    try:
        visible = [img for img in state.images_metadata if img.visible]

        if len(visible) == 0:
            return {
                "count": 0,
                "clusters": [],
                "axis_labels": state.axis_labels,
                "bounds": {"x": [0, 0], "y": [0, 0]}
            }

        coords = np.array([img.coordinates for img in visible])

        # Calculate bounds
        bounds = {
            "x": [float(coords[:,0].min()), float(coords[:,0].max())],
            "y": [float(coords[:,1].min()), float(coords[:,1].max())]
        }

        # Quick clustering (k=3-5)
        from sklearn.cluster import KMeans
        k = min(5, max(3, len(visible) // 10))
        km = KMeans(n_clusters=k, random_state=42, n_init=10).fit(coords)

        clusters = []
        for i in range(k):
            mask = km.labels_ == i
            cluster_imgs = [visible[j] for j in np.where(mask)[0]]

            # Get actual center coordinates
            actual_center = km.cluster_centers_[i]

            # Normalize to [0-1] range for the AI
            normalized_center = [
                (actual_center[0] - bounds["x"][0]) / (bounds["x"][1] - bounds["x"][0]) if bounds["x"][1] != bounds["x"][0] else 0.5,
                (actual_center[1] - bounds["y"][0]) / (bounds["y"][1] - bounds["y"][0]) if bounds["y"][1] != bounds["y"][0] else 0.5
            ]

            cluster_entry = {
                "id": f"cluster_{i}",
                "center": actual_center.tolist(),
                "normalized_center": normalized_center,
                "size": int(mask.sum()),
                "sample_prompts": [img.prompt for img in cluster_imgs[:3]],
                "generation_methods": list(set(img.generation_method for img in cluster_imgs))
            }

            # Compute bounding ellipse from covariance matrix (2σ)
            pts = coords[mask]
            if len(pts) >= 3:
                cov = np.cov(pts.T)
                eigenvalues, eigenvectors = np.linalg.eigh(cov)
                eigenvalues = np.maximum(eigenvalues, 1e-6)  # Avoid zero
                angle = float(np.degrees(np.arctan2(eigenvectors[1, 1], eigenvectors[0, 1])))
                rx, ry = 2.0 * np.sqrt(eigenvalues)
                # Normalize rx/ry to [0-1] space
                x_range = bounds["x"][1] - bounds["x"][0] if bounds["x"][1] != bounds["x"][0] else 1.0
                y_range = bounds["y"][1] - bounds["y"][0] if bounds["y"][1] != bounds["y"][0] else 1.0
                cluster_entry["ellipse"] = {
                    "rx": float(rx / x_range),
                    "ry": float(ry / y_range),
                    "angle": angle
                }

            clusters.append(cluster_entry)

        # Algorithmic gap detection via density grid
        x_range = bounds["x"][1] - bounds["x"][0] if bounds["x"][1] != bounds["x"][0] else 1.0
        y_range = bounds["y"][1] - bounds["y"][0] if bounds["y"][1] != bounds["y"][0] else 1.0
        grid_size = 10
        grid = np.zeros((grid_size, grid_size))
        for c in coords:
            gx = min(grid_size - 1, int(((c[0] - bounds["x"][0]) / x_range) * grid_size))
            gy = min(grid_size - 1, int(((c[1] - bounds["y"][0]) / y_range) * grid_size))
            grid[gx][gy] += 1

        # Find empty cells adjacent to occupied cells
        gaps = []
        for x in range(grid_size):
            for y in range(grid_size):
                if grid[x][y] == 0:
                    # Count occupied neighbors
                    x_lo, x_hi = max(0, x - 1), min(grid_size, x + 2)
                    y_lo, y_hi = max(0, y - 1), min(grid_size, y + 2)
                    neighbor_count = int(np.sum(grid[x_lo:x_hi, y_lo:y_hi] > 0))
                    if neighbor_count >= 2:
                        gaps.append({
                            "center": [(x + 0.5) / grid_size, (y + 0.5) / grid_size],
                            "neighbor_density": neighbor_count,
                            "ellipse": {"rx": 0.08, "ry": 0.06, "angle": 0}
                        })
        gaps.sort(key=lambda g: g["neighbor_density"], reverse=True)
        gaps = gaps[:3]  # Top 3 gaps

        return {
            "count": len(visible),
            "clusters": clusters,
            "gaps": gaps,
            "axis_labels": state.axis_labels,
            "bounds": bounds
        }
    except Exception as e:
        print(f"ERROR in canvas-digest: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


class ContextPromptsRequest(BaseModel):
    brief: str

@app.post("/api/agent/context-prompts")
async def get_context_prompts(request: ContextPromptsRequest):
    """Generate prompt suggestions based on current canvas context and design brief"""
    try:
        if not gemini_api_key:
            raise HTTPException(status_code=500, detail="Gemini API key not configured")

        print(f"\n=== Context Prompts Request ===")
        print(f"Brief: {request.brief}")

        # Get canvas digest for context
        digest = await get_canvas_digest()
        count = digest.get("count", 0)
        clusters = digest.get("clusters", [])
        gaps = digest.get("gaps", [])
        axis_info = f"X axis: {state.axis_labels.get('x', ['formal', 'sporty'])}, Y axis: {state.axis_labels.get('y', ['dark', 'colorful'])}"

        canvas_context = ""
        if count > 0:
            cluster_summary = ", ".join([
                f'"{c["sample_prompts"][0]}"' for c in clusters[:3] if c.get("sample_prompts")
            ])
            canvas_context = f"""
CURRENT CANVAS:
- {count} shoe designs already on canvas
- Main clusters: {cluster_summary or "none yet"}
- {len(gaps)} unexplored regions detected
- {axis_info}
"""
        else:
            canvas_context = f"\nCANVAS: Empty (no designs yet)\n- {axis_info}\n"

        prompt = f"""You are a design exploration assistant helping with shoe design.

DESIGN BRIEF:
{request.brief}
{canvas_context}
TASK:
Suggest 5 specific, actionable prompts to explore next. Given what's already on canvas, suggest prompts that:
1. Explore underrepresented directions
2. Are specific and detailed (not generic)
3. Are diverse from each other
4. Each under 20 words

Return JSON ONLY (no markdown):
{{
  "prompts": [
    {{"prompt": "minimal white leather sneaker with clean lines", "reasoning": "Unexplored minimalist direction"}},
    {{"prompt": "chunky athletic shoe in bold neon colors", "reasoning": "Missing sporty/colorful quadrant"}}
  ]
}}"""

        model = genai.GenerativeModel('gemini-2.5-flash-lite')
        response = model.generate_content(prompt)

        json_match = re.search(r'\{[\s\S]*\}', response.text)
        if json_match:
            result = json.loads(json_match.group(0))
            print(f"Generated {len(result.get('prompts', []))} context prompts")
            return result

        return {"prompts": [
            {"prompt": "minimal athletic sneaker with clean design", "reasoning": "Starting point"},
            {"prompt": "classic leather dress shoe", "reasoning": "Formal direction"},
            {"prompt": "modern running shoe with bold colors", "reasoning": "Sporty direction"},
        ]}

    except Exception as e:
        print(f"ERROR in context-prompts: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


class SuggestAxesRequest(BaseModel):
    brief: str
    current_x_axis: Optional[str] = None
    current_y_axis: Optional[str] = None

@app.post("/api/agent/suggest-axes")
async def suggest_axes(request: SuggestAxesRequest):
    """Suggest alternative semantic axes to avoid design fixation"""
    try:
        print(f"\n=== Suggest Axes Request ===")
        print(f"Request data: {request}")
        print(f"Brief: {request.brief}")
        print(f"Current X-axis type: {type(request.current_x_axis)}, value: {request.current_x_axis}")
        print(f"Current Y-axis type: {type(request.current_y_axis)}, value: {request.current_y_axis}")

        if not gemini_api_key:
            raise HTTPException(status_code=500, detail="Gemini API key not configured")

        # Ensure axis labels are strings
        x_axis_str = str(request.current_x_axis) if request.current_x_axis else "formal - sporty"
        y_axis_str = str(request.current_y_axis) if request.current_y_axis else "dark - colorful"

        print(f"Formatted axes: X={x_axis_str}, Y={y_axis_str}")

        # Get canvas digest for context
        digest = await get_canvas_digest()

        prompt = f"""You are a design exploration assistant helping with shoe design.

DESIGN BRIEF:
{request.brief}

CURRENT CANVAS:
- Images: {digest['count']}
- Current X-axis: {x_axis_str}
- Current Y-axis: {y_axis_str}

CRITICAL FORMATTING REQUIREMENT:
Every axis MUST be formatted as: "opposite1 - opposite2"
The " - " (space-dash-space) separator is MANDATORY.

TASK:
Suggest 3 alternative axis configurations. Each axis must:
1. Be a bipolar semantic spectrum (two opposite terms)
2. Use the exact format: "term1 - term2" with space-dash-space
3. Offer different perspectives than current axes
4. Be relevant to shoe design

VALID AXIS FORMAT EXAMPLES:
✓ "minimalist - maximalist"
✓ "casual - formal"
✓ "muted - vibrant"
✓ "athletic - fashion"
✓ "retro - futuristic"
✓ "comfort-focused - style-focused"
✓ "simple - complex"
✓ "traditional - innovative"

INVALID FORMATS (DO NOT USE):
✗ "Minimalism" (missing opposite)
✗ "Utilitarian" (missing opposite)
✗ "Color Intensity" (missing opposite)
✗ "minimalist-maximalist" (missing spaces around dash)

Return JSON ONLY (no markdown, no code blocks):
{{
  "suggestions": [
    {{
      "x_axis": "minimalist - maximalist",
      "y_axis": "casual - formal",
      "reasoning": "Reveals aesthetic spectrum from simple to complex and everyday to dressy"
    }},
    {{
      "x_axis": "muted - vibrant",
      "y_axis": "smooth - textured",
      "reasoning": "Focuses on visual and tactile qualities"
    }},
    {{
      "x_axis": "athletic - fashion-forward",
      "y_axis": "traditional - innovative",
      "reasoning": "Balances function vs. aesthetics and design approach"
    }}
  ]
}}

Remember: EVERY x_axis and y_axis value MUST contain " - " (space-dash-space)."""

        model = genai.GenerativeModel('gemini-2.5-flash-lite')
        response = model.generate_content(prompt)

        # Common semantic opposites for shoe design
        OPPOSITES = {
            'minimalist': 'maximalist',
            'simple': 'complex',
            'casual': 'formal',
            'athletic': 'fashion',
            'sporty': 'dressy',
            'comfort': 'style',
            'functional': 'decorative',
            'classic': 'modern',
            'traditional': 'innovative',
            'retro': 'futuristic',
            'muted': 'vibrant',
            'subtle': 'bold',
            'dark': 'light',
            'neutral': 'colorful',
            'smooth': 'textured',
            'plain': 'patterned',
            'everyday': 'special occasion',
            'practical': 'fashionable',
            'understated': 'eye-catching',
            'minimal': 'ornate',
            'basic': 'elaborate',
            'low-key': 'statement',
            'conservative': 'daring',
            'timeless': 'trendy',
            'utilitarian': 'stylish',
            'performance': 'aesthetic',
            'technical': 'artistic'
        }
        
        def create_bipolar_axis(term: str) -> str:
            """Convert a single term into a bipolar axis using opposites dictionary"""
            term_lower = term.lower().strip()
            
            # Check if it's already bipolar
            if ' - ' in term:
                return term
            
            # Check exact match in opposites dict
            if term_lower in OPPOSITES:
                return f"{term_lower} - {OPPOSITES[term_lower]}"
            
            # Check reverse mapping
            for key, val in OPPOSITES.items():
                if term_lower == val:
                    return f"{key} - {val}"
            
            # Check for partial matches (e.g., "minimalism" matches "minimalist")
            for key, val in OPPOSITES.items():
                if term_lower.startswith(key) or key.startswith(term_lower):
                    return f"{key} - {val}"
                if term_lower.startswith(val) or val.startswith(term_lower):
                    return f"{key} - {val}"
            
            # Fallback: try to create a sensible opposite based on keywords
            if 'color' in term_lower or 'hue' in term_lower:
                return f"muted - vibrant"
            elif 'intensity' in term_lower or 'brightness' in term_lower:
                return f"low - high"
            elif 'texture' in term_lower or 'surface' in term_lower:
                return f"smooth - rough"
            elif 'style' in term_lower or 'design' in term_lower or 'aesthetic' in term_lower:
                return f"simple - complex"
            elif 'comfort' in term_lower or 'function' in term_lower:
                return f"comfort-focused - style-focused"
            elif 'material' in term_lower or 'fabric' in term_lower:
                return f"natural - synthetic"
            else:
                # Last resort: use "low X - high X" pattern (cleaner than "less/more")
                clean_term = term_lower.replace('_', ' ')
                return f"low {clean_term} - high {clean_term}"
        
        # Parse JSON
        json_match = re.search(r'\{[\s\S]*\}', response.text)
        if json_match:
            result = json.loads(json_match.group(0))
            suggestions = result.get('suggestions', [])
            
            # Validate and fix axis format
            for suggestion in suggestions:
                x_axis = suggestion.get('x_axis', '')
                y_axis = suggestion.get('y_axis', '')
                
                # Fix x_axis if needed
                if ' - ' not in x_axis:
                    original = x_axis
                    suggestion['x_axis'] = create_bipolar_axis(x_axis)
                    print(f"✓ Converted X-axis: '{original}' → '{suggestion['x_axis']}'")
                
                # Fix y_axis if needed
                if ' - ' not in y_axis:
                    original = y_axis
                    suggestion['y_axis'] = create_bipolar_axis(y_axis)
                    print(f"✓ Converted Y-axis: '{original}' → '{suggestion['y_axis']}'")
                
                print(f"Validated suggestion: X={suggestion['x_axis']}, Y={suggestion['y_axis']}")
            
            print(f"Generated {len(suggestions)} axis suggestions")
            return result

        # Fallback
        return {"suggestions": [
            {"x_axis": "simple - complex", "y_axis": "subtle - bold", "reasoning": "Alternative design complexity view"},
            {"x_axis": "classic - modern", "y_axis": "traditional - innovative", "reasoning": "Temporal and innovation spectrum"},
            {"x_axis": "comfort-focused - style-focused", "y_axis": "casual - formal", "reasoning": "Function vs. form and usage context"}
        ]}

    except Exception as e:
        print(f"ERROR in suggest-axes: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


class GenerateVariationRequest(BaseModel):
    original_prompt: str
    brief: str
    num_variations: int = 2

@app.post("/api/agent/suggest-ghosts")
async def suggest_ghost_nodes(request: Request):
    """Generate ghost node suggestions for unexplored gaps in the semantic space.

    Returns 3-5 suggested prompts with coordinates and reasoning.
    Ghost nodes are preview suggestions rendered at 30% opacity before generation.
    """
    try:
        body = await request.json()
        brief = body.get("brief", "Explore shoe design variations")
        num_suggestions = body.get("num_suggestions", 3)

        # Get canvas digest for gap + cluster context
        digest_res = await get_canvas_digest()
        gaps = (digest_res or {}).get("gaps", [])
        clusters = (digest_res or {}).get("clusters", [])

        # Need at least some content on canvas to make useful suggestions
        if not gaps and not clusters and len(state.images) < 2:
            return {"ghosts": []}

        # Top gaps by size (or use all if fewer than requested)
        top_gaps = sorted(gaps, key=lambda g: g.get("size", 0), reverse=True)[:num_suggestions]

        # If no gaps detected, synthesize positions at axis extremes to still give suggestions
        if not top_gaps:
            synthetic_positions = [
                [0.75, 0.75], [-0.75, 0.75], [0.75, -0.75], [-0.75, -0.75]
            ]
            top_gaps = [{"center": pos, "size": 0} for pos in synthetic_positions[:num_suggestions]]

        # Describe semantic context using axis labels (not raw coordinates)
        x_neg, x_pos = state.axis_labels['x'][0], state.axis_labels['x'][1]
        y_neg, y_pos = state.axis_labels['y'][0], state.axis_labels['y'][1]

        gap_context = ""
        if top_gaps:
            gap_lines = []
            for i, gap in enumerate(top_gaps):
                cx, cy = gap.get("center", [0, 0])
                # Translate coordinates into semantic labels
                x_desc = x_pos if cx > 0 else x_neg
                y_desc = y_pos if cy > 0 else y_neg
                gap_lines.append(f"  - Unexplored zone {i+1}: leans {x_desc} on X-axis and {y_desc} on Y-axis")
            gap_context = "Unexplored semantic zones detected:\n" + "\n".join(gap_lines)

        cluster_context = ""
        if clusters:
            cluster_names = [c.get("label", f"cluster {j+1}") for j, c in enumerate(clusters[:3])]
            cluster_context = f"Existing clusters already explored: {', '.join(cluster_names)}"

        prompt = f"""You are an AI design partner helping a shoe designer explore their creative space.

Design brief: "{brief}"

Current semantic canvas axes:
- X-axis: {x_neg} (left) → {x_pos} (right)
- Y-axis: {y_neg} (bottom) → {y_pos} (top)

{gap_context}
{cluster_context}

Based on the design brief and the unexplored zones above, suggest {num_suggestions} SPECIFIC shoe designs the designer should create next. Each suggestion should:
1. Be a concrete, visually descriptive shoe prompt (not vague — mention materials, style, color, silhouette)
2. Target an area of the design space that isn't yet explored
3. Push the design brief forward in an interesting direction
4. Be directly generatable by an AI image model

Return EXACTLY {num_suggestions} suggestions as JSON:

{{
  "suggestions": [
    {{
      "prompt": "A specific, vivid shoe design prompt ready for AI generation",
      "reasoning": "One sentence: what gap this fills and why it's worth exploring",
      "gap_index": 0
    }}
  ]
}}

Be bold and specific. If no design brief is set, infer interesting directions from the axis labels."""

        # Call Gemini
        if not gemini_api_key:
            # Fallback without Gemini — axis-aware descriptions
            x_neg2, x_pos2 = state.axis_labels['x'][0], state.axis_labels['x'][1]
            y_neg2, y_pos2 = state.axis_labels['y'][0], state.axis_labels['y'][1]
            ghosts = []
            for i, gap in enumerate(top_gaps):
                center = gap.get("center", [0, 0])
                x_desc = x_pos2 if center[0] > 0 else x_neg2
                y_desc = y_pos2 if center[1] > 0 else y_neg2
                ghosts.append({
                    "id": state.next_id + i,
                    "coordinates": center,
                    "suggested_prompt": f"A shoe that is {x_desc} and {y_desc}",
                    "reasoning": f"Fills the {x_desc}/{y_desc} corner of the design space",
                    "is_ghost": True
                })
            return {"ghosts": ghosts}

        model = genai.GenerativeModel("gemini-2.5-flash-lite")
        response = model.generate_content(prompt)
        text = response.text.strip()

        # Parse JSON from response
        import json
        import re

        # Extract JSON block if wrapped in markdown
        json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
        if json_match:
            text = json_match.group(1)

        result = json.loads(text)
        suggestions = result.get("suggestions", [])

        # Convert to ghost node format
        ghosts = []
        for i, suggestion in enumerate(suggestions[:num_suggestions]):
            gap_index = suggestion.get("gap_index", i)
            if gap_index >= len(top_gaps):
                gap_index = 0

            gap = top_gaps[gap_index]
            center = gap.get("center", [0, 0])

            ghosts.append({
                "id": state.next_id + i,  # Temporary ID
                "coordinates": center,
                "suggested_prompt": suggestion.get("prompt", ""),
                "reasoning": suggestion.get("reasoning", ""),
                "is_ghost": True
            })

        return {"ghosts": ghosts}

    except Exception as e:
        print(f"ERROR in suggest-ghosts: {e}")
        import traceback
        traceback.print_exc()
        # Return empty on error rather than failing
        return {"ghosts": []}


@app.post("/api/embed-ghost")
async def embed_ghost_image(request: Request):
    """Embed an image and compute CLIP coordinates WITHOUT adding it to the canvas.
    Used by the frontend useAgentBehaviors hook after fal.ai generates a ghost image.
    Returns: { base64_image, coordinates }"""
    try:
        body = await request.json()
        image_url = body.get("image_url", "")

        if not image_url:
            raise HTTPException(status_code=400, detail="image_url is required")

        if state.embedder is None:
            raise HTTPException(status_code=400, detail="CLIP embedder not initialized")

        # Load image from data URL or HTTP URL
        if image_url.startswith("data:"):
            if "," not in image_url:
                raise HTTPException(status_code=400, detail="Invalid data URL")
            _, encoded = image_url.split(",", 1)
            img_bytes = base64.b64decode(encoded)
            img = Image.open(BytesIO(img_bytes))
        elif image_url.startswith("http://") or image_url.startswith("https://"):
            resp = requests.get(image_url, timeout=30)
            resp.raise_for_status()
            img = Image.open(BytesIO(resp.content))
        else:
            raise HTTPException(status_code=400, detail="Unsupported URL format")

        # Normalize to RGB for CLIP embedding
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")

        # Remove background so ghost shoes show transparent, like user-generated shoes
        try:
            img_bytes_in = BytesIO()
            img.convert("RGB").save(img_bytes_in, format="PNG")
            img_bytes_out = remove(img_bytes_in.getvalue())
            img = Image.open(BytesIO(img_bytes_out)).convert("RGBA")
            print(f"  ✓ Background removed from ghost image")
        except Exception as rembg_err:
            print(f"  ⚠ rembg failed for ghost ({rembg_err}), keeping original")
            img = img.convert("RGBA")  # ensure RGBA even without removal

        # Embed via CLIP using RGB version
        img_rgb = img.convert("RGB")
        embeddings = state.embedder.extract_image_embeddings_from_pil([img_rgb])
        emb = np.array(embeddings[0])

        # Project to 2D coordinates using current axes (no state mutation)
        coords = project_embeddings_to_coordinates(emb.reshape(1, -1), use_3d=False)
        x, y = float(coords[0][0]), float(coords[0][1])

        # Encode as PNG to preserve transparency
        buf = BytesIO()
        img.save(buf, format="PNG")
        base64_image = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

        return {"base64_image": base64_image, "coordinates": [x, y]}

    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR in embed-ghost: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


class ConcurrentPromptRequest(BaseModel):
    user_prompt: str
    brief: Optional[str] = None
    reference_image_urls: Optional[List[str]] = []

@app.post("/api/agent/concurrent-prompt")
async def concurrent_ghost_prompt(request: ConcurrentPromptRequest):
    """Generate an alternative prompt for Behavior B: Concurrent Ghost.
    Called in parallel with user generation — Gemini suggests a different design direction
    using the same references and brief.
    Returns: { prompt, reasoning }"""
    try:
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        if not gemini_api_key:
            # Fallback without Gemini
            axis_x = state.axis_labels.get("x", ["formal", "sporty"])
            axis_y = state.axis_labels.get("y", ["dark", "colorful"])
            return {
                "prompt": f"A shoe exploring the {axis_x[1]} and {axis_y[1]} direction",
                "reasoning": "Exploring an adjacent design direction"
            }

        genai.configure(api_key=gemini_api_key)

        brief_section = f"\nDESIGN BRIEF:\n{request.brief}" if request.brief else ""
        axis_x = state.axis_labels.get("x", ["formal", "sporty"])
        axis_y = state.axis_labels.get("y", ["dark", "colorful"])
        axis_info = f"X axis: {axis_x[0]} ↔ {axis_x[1]}, Y axis: {axis_y[0]} ↔ {axis_y[1]}"

        prompt = f"""You are a creative design exploration AI for shoe design.

The user just generated a shoe with this prompt:
"{request.user_prompt}"
{brief_section}

SEMANTIC AXES (canvas dimensions):
{axis_info}

TASK:
Suggest ONE alternative shoe design that takes a meaningfully different direction — exploring a different part of the design space while still being relevant to the same general intent. The alternative should:
1. Contrast meaningfully with the user's prompt (e.g., different style, material, or mood)
2. Be specific and concrete (not generic)
3. Be under 20 words

Return JSON ONLY (no markdown):
{{
  "prompt": "the alternative design prompt",
  "reasoning": "one sentence: what design direction this explores and why it's interesting"
}}"""

        model = genai.GenerativeModel("gemini-2.5-flash-lite")
        response = model.generate_content(prompt)
        text = response.text.strip()

        # Strip markdown if present
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            text = json_match.group(0)

        result = json.loads(text)
        return {
            "prompt": result.get("prompt", f"Alternative to: {request.user_prompt}"),
            "reasoning": result.get("reasoning", "Exploring an adjacent design direction")
        }

    except Exception as e:
        print(f"ERROR in concurrent-prompt: {e}")
        import traceback
        traceback.print_exc()
        # Fallback on error
        return {
            "prompt": f"Alternative shoe design: {request.user_prompt}",
            "reasoning": "Exploring an adjacent design direction"
        }


@app.post("/api/sync-layers")
async def sync_layers(request: Request):
    """Receive current frontend layer assignments + definitions and store in backend state.
    Called by frontend whenever layers or imageLayerMap change (so export always has fresh data)."""
    body = await request.json()
    state.image_layer_map = {int(k): v for k, v in body.get("imageLayerMap", {}).items()}
    state.layer_definitions = body.get("layerDefinitions", state.layer_definitions)
    return {"status": "ok"}


@app.post("/api/import-zip")
async def import_zip_canvas(file: UploadFile = File(...)):
    """Restore a canvas from a previously exported ZIP file.

    The ZIP must contain:
      - export_summary.json  (axis_labels, history_groups, layer info, image list)
      - img_{id}_*.png       (image files)
      - img_{id}_*.json      (per-image metadata including embedding array)

    Re-uses stored embeddings — no CLIP re-embedding needed.
    """
    import io as _io
    try:
        zip_bytes = await file.read()
        with zipfile.ZipFile(_io.BytesIO(zip_bytes)) as zf:
            # ── 1. Parse summary ──────────────────────────────────────────
            if "export_summary.json" not in zf.namelist():
                raise HTTPException(status_code=400, detail="Missing export_summary.json in ZIP")
            summary = json.loads(zf.read("export_summary.json"))

            axis_raw = summary.get("axis_labels", {})
            new_axis_labels = {}
            for k, v in axis_raw.items():
                new_axis_labels[k] = tuple(v) if isinstance(v, list) else v
            if not new_axis_labels:
                new_axis_labels = state.axis_labels  # keep current if absent

            history_groups_raw = summary.get("history_groups", [])
            layer_defs = summary.get("layer_definitions", state.layer_definitions)
            img_layer_map_raw = summary.get("image_layer_map", {})

            # ── 2. Build index of per-image JSON/PNG pairs ────────────────
            # Filenames: img_{id}_{timestamp}.png / .json
            png_map: Dict[str, bytes] = {}   # filename_stem -> png bytes
            json_map: Dict[str, dict] = {}   # filename_stem -> metadata dict
            for name in zf.namelist():
                stem, ext = name.rsplit(".", 1) if "." in name else (name, "")
                if ext.lower() == "png" and stem.startswith("img_"):
                    png_map[stem] = zf.read(name)
                elif ext.lower() == "json" and stem.startswith("img_"):
                    json_map[stem] = json.loads(zf.read(name))

            # ── 3. Rebuild images ─────────────────────────────────────────
            new_images: List[ImageMetadata] = []
            max_id = 0
            for stem, meta in json_map.items():
                if stem not in png_map:
                    print(f"  ⚠ No PNG for {stem}, skipping")
                    continue
                img_id = meta.get("id", 0)
                max_id = max(max_id, img_id)
                pil_img = Image.open(_io.BytesIO(png_map[stem])).convert("RGBA")
                embedding_list = meta.get("embedding", None)
                if embedding_list:
                    embedding = np.array(embedding_list, dtype=np.float32)
                else:
                    embedding = np.zeros(1024, dtype=np.float32)  # fallback
                try:
                    ts = datetime.fromisoformat(meta.get("timestamp", datetime.now().isoformat()))
                except Exception:
                    ts = datetime.now()
                coord_raw = meta.get("coordinates", [0.0, 0.0])
                coord = tuple(coord_raw[:2]) if len(coord_raw) >= 2 else (0.0, 0.0)
                new_images.append(ImageMetadata(
                    id=img_id,
                    group_id=meta.get("group_id", ""),
                    pil_image=pil_img,
                    embedding=embedding,
                    coordinates=coord,
                    parents=meta.get("parents", []),
                    children=meta.get("children", []),
                    reference_ids=meta.get("reference_ids", []),
                    generation_method=meta.get("generation_method", "batch"),
                    prompt=meta.get("prompt", ""),
                    timestamp=ts,
                    visible=True,
                    is_ghost=False,
                    suggested_prompt="",
                    reasoning="",
                ))

            if not new_images:
                raise HTTPException(status_code=400, detail="No valid images found in ZIP")

            # If embedder available, reproject to current axes
            if state.embedder and state.axis_builder:
                state.axis_labels = new_axis_labels
                state._axis_directions_cache = None  # force recompute
                embeddings_matrix = np.array([img.embedding for img in new_images])
                new_coords = project_embeddings_to_coordinates(embeddings_matrix, use_3d=False)
                for i, img in enumerate(new_images):
                    img.coordinates = (float(new_coords[i][0]), float(new_coords[i][1]))
            else:
                state.axis_labels = new_axis_labels

            # ── 4. Rebuild history groups ─────────────────────────────────
            from models.data_structures import HistoryGroup
            new_history: List[HistoryGroup] = []
            for hg in history_groups_raw:
                try:
                    ts_hg = datetime.fromisoformat(hg.get("timestamp", datetime.now().isoformat()))
                except Exception:
                    ts_hg = datetime.now()
                new_history.append(HistoryGroup(
                    id=hg["id"],
                    type=hg.get("type", "batch"),
                    image_ids=hg.get("image_ids", []),
                    prompt=hg.get("prompt", ""),
                    visible=True,
                    thumbnail_id=hg.get("thumbnail_id", None),
                    timestamp=ts_hg,
                ))

            # ── 5. Commit to state ────────────────────────────────────────
            state.images_metadata = sorted(new_images, key=lambda x: x.id)
            state.history_groups = new_history
            state.next_id = max_id + 1
            state.image_layer_map = {int(k): v for k, v in img_layer_map_raw.items()}
            state.layer_definitions = layer_defs

            print(f"✓ Import complete: {len(new_images)} images, {len(new_history)} groups")
            await broadcast_state_update()
            return {"status": "ok", "images_loaded": len(new_images), "groups_loaded": len(new_history)}

    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR in import-zip: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/export-zip")
async def export_zip(ids: Optional[str] = None):
    """Export images and metadata as ZIP. If ids query param provided (comma-separated),
    export only those image IDs; otherwise export all visible images."""
    try:
        print(f"\n=== Export ZIP Request ===")
        print(f"Total images in state: {len(state.images_metadata)}")

        visible_images = [img for img in state.images_metadata if img.visible]
        if ids:
            id_set = {int(x.strip()) for x in ids.split(",") if x.strip()}
            visible_images = [img for img in visible_images if img.id in id_set]
            print(f"Exporting selected only: {len(visible_images)} images (ids={id_set})")
        print(f"Visible images to export: {len(visible_images)}")

        if len(visible_images) == 0:
            raise HTTPException(status_code=400, detail="No visible images to export")

        # Create a temporary directory
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            print(f"Created temp directory: {temp_path}")

            # Save each image with timestamp-based filename
            print(f"Saving {len(visible_images)} images...")
            saved_count = 0
            for img_meta in visible_images:
                # Create timestamp-based filename
                timestamp_str = img_meta.timestamp.strftime("%Y%m%d_%H%M%S_%f")[:-3]  # Remove last 3 digits of microseconds
                filename = f"img_{img_meta.id}_{timestamp_str}"

                # Save image as PNG
                img_path = temp_path / f"{filename}.png"
                img_meta.pil_image.save(img_path, format="PNG")
                saved_count += 1
                if saved_count % 10 == 0:
                    print(f"  Saved {saved_count}/{len(visible_images)} images...")

                # Create metadata JSON
                metadata = {
                    "id": img_meta.id,
                    "group_id": img_meta.group_id,
                    "prompt": img_meta.prompt,
                    "generation_method": img_meta.generation_method,
                    "timestamp": img_meta.timestamp.isoformat(),
                    "coordinates": list(img_meta.coordinates),
                    "parents": img_meta.parents,
                    "children": img_meta.children,
                    "reference_ids": img_meta.reference_ids,
                    "embedding": img_meta.embedding.tolist(),
                }

                json_path = temp_path / f"{filename}.json"
                with open(json_path, 'w', encoding='utf-8') as f:
                    json.dump(metadata, f, indent=2, ensure_ascii=False)

            print(f"Saved all {saved_count} images successfully")

            # Build generation sequence map: image_id -> (group_index, position_in_group)
            gen_sequence: Dict[int, Dict] = {}
            for g_idx, g in enumerate(state.history_groups):
                for pos, img_id in enumerate(g.image_ids):
                    gen_sequence[img_id] = {
                        "group_index": g_idx,
                        "position_in_group": pos,
                        "group_id": g.id,
                        "group_type": g.type,
                        "group_prompt": g.prompt,
                        "group_timestamp": g.timestamp.isoformat(),
                    }

            # Create a summary metadata file
            summary = {
                "export_timestamp": datetime.now().isoformat(),
                "total_images": len(visible_images),
                "axis_labels": {k: list(v) for k, v in state.axis_labels.items()},
                "is_3d_mode": state.is_3d_mode,
                "design_brief": state.design_brief,
                "layer_definitions": state.layer_definitions,
                "image_layer_map": {str(k): v for k, v in state.image_layer_map.items()},
                "history_groups": [
                    {
                        "id": g.id,
                        "type": g.type,
                        "image_ids": g.image_ids,
                        "prompt": g.prompt,
                        "timestamp": g.timestamp.isoformat(),
                        "thumbnail_id": g.thumbnail_id,
                    }
                    for g in state.history_groups
                ],
                "images": [
                    {
                        "id": img.id,
                        "filename": f"img_{img.id}_{img.timestamp.strftime('%Y%m%d_%H%M%S_%f')[:-3]}.png",
                        "prompt": img.prompt,
                        "generation_method": img.generation_method,
                        "timestamp": img.timestamp.isoformat(),
                        "coordinates": list(img.coordinates),
                        "parents": img.parents,
                        "children": img.children,
                        "reference_ids": img.reference_ids,
                        "layer_id": state.image_layer_map.get(img.id, "default"),
                        **gen_sequence.get(img.id, {"group_index": -1, "position_in_group": -1, "group_id": None, "group_type": None, "group_prompt": None, "group_timestamp": None}),
                    }
                    for img in state.images_metadata if img.visible
                ]
            }

            summary_path = temp_path / "export_summary.json"
            print("Writing summary JSON...")
            with open(summary_path, 'w', encoding='utf-8') as f:
                json.dump(summary, f, indent=2, ensure_ascii=False)

            # Create ZIP file
            print("Creating ZIP archive...")
            zip_path = temp_path / "zappos_export.zip"
            files_to_zip = list(temp_path.glob("*"))
            print(f"Files to zip: {len(files_to_zip)}")

            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for file_path in files_to_zip:
                    if file_path != zip_path:
                        zipf.write(file_path, file_path.name)

            png_count = len(list(temp_path.glob('*.png')))
            json_count = len(list(temp_path.glob('*.json')))
            print(f"OK: ZIP file created with {png_count} PNG images and {json_count} JSON files")

            # Read the ZIP file and return it
            print("Reading ZIP file for response...")
            with open(zip_path, 'rb') as f:
                zip_content = f.read()

            zip_size = len(zip_content)
            print(f"ZIP file size: {zip_size} bytes ({zip_size / 1024:.2f} KB)")

            if zip_size == 0:
                raise Exception("Generated ZIP file is empty!")

            print("Sending ZIP file to client...")
            return StreamingResponse(
                BytesIO(zip_content),
                media_type="application/zip",
                headers={
                    "Content-Disposition": f"attachment; filename=zappos_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip",
                    "Content-Length": str(zip_size)
                }
            )

    except Exception as e:
        print(f"\n!!! ERROR in export_zip !!!")
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# HTML export endpoint removed - was unstable with embedded base64 images


# ─── Session / Multi-Canvas Endpoints ─────────────────────────────────────────

@app.get("/api/session/current")
async def get_current_session():
    """Return metadata about the currently active canvas."""
    return {
        "canvasId": state.current_canvas_id,
        "canvasName": state.canvas_name,
        "participantId": state.participant_id,
        "createdAt": state.canvas_created_at,
    }


class SaveSessionRequest(BaseModel):
    pass  # body optional — saves current state


@app.post("/api/sessions/save")
async def save_session():
    """Save the current canvas state to disk."""
    try:
        path = _save_canvas_to_disk()
        return {"success": True, "path": str(path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sessions/list")
async def list_sessions():
    """List all saved canvases for the current participant."""
    return {"sessions": _list_sessions(state.participant_id)}


class LoadSessionRequest(BaseModel):
    canvas_id: str


@app.post("/api/sessions/load")
async def load_session(request: LoadSessionRequest):
    """Save current canvas, then load a different one from disk."""
    try:
        # Save current canvas first
        _save_canvas_to_disk()
        # Find and load the requested canvas
        path = _session_path(state.participant_id, request.canvas_id)
        if not path.exists():
            # Also search other participant dirs for this canvas_id
            found = None
            for pid_dir in DATA_DIR.iterdir():
                candidate = pid_dir / "sessions" / f"{request.canvas_id}.json"
                if candidate.exists():
                    found = candidate
                    break
            if not found:
                raise HTTPException(status_code=404, detail=f"Canvas {request.canvas_id} not found")
            path = found
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        _deserialize_canvas(data)
        await broadcast_state_update()
        visible = [img for img in state.images_metadata if img.visible]
        neighbor_map = get_semantic_neighbors(visible, k=5) if len(visible) > 1 else {}
        return {
            "canvasId": state.current_canvas_id,
            "canvasName": state.canvas_name,
            "state": StateResponse(
                images=[image_metadata_to_response(img, neighbor_map) for img in visible],
                history_groups=[{
                    "id": g.id, "type": g.type, "image_ids": g.image_ids,
                    "prompt": g.prompt, "visible": g.visible,
                    "thumbnail_id": g.thumbnail_id,
                    "timestamp": g.timestamp.isoformat() if isinstance(g.timestamp, datetime) else str(g.timestamp)
                } for g in state.history_groups],
                axis_labels=state.axis_labels,
                is_3d_mode=state.is_3d_mode,
                design_brief=state.design_brief,
                grid_cell_size=state.grid_cell_size,
                neighbor_map=neighbor_map,
                clip_model_type=state.clip_model_type,
            ).model_dump()
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


class NewCanvasRequest(BaseModel):
    name: str = "Canvas 1"
    participant_id: Optional[str] = None


@app.post("/api/sessions/new")
async def new_canvas(request: NewCanvasRequest):
    """Save current canvas, then start a fresh empty canvas."""
    try:
        _save_canvas_to_disk()
        # Reset state (like /api/clear but also resets session meta)
        state.images_metadata = []
        state.history_groups = []
        state.next_id = 0
        state.event_log = []
        state.cluster_centroids = []
        state.cluster_labels = []
        state.current_canvas_id = str(_uuid.uuid4())
        state.canvas_name = request.name
        state.canvas_created_at = datetime.now().isoformat()
        state.parent_canvas_id = None
        state.shared_image_ids = []
        if request.participant_id:
            state.participant_id = request.participant_id
        await broadcast_state_update()
        return {
            "canvasId": state.current_canvas_id,
            "canvasName": state.canvas_name,
            "participantId": state.participant_id,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class BranchCanvasRequest(BaseModel):
    name: str = "Branch"
    image_ids: List[int]


@app.post("/api/sessions/branch")
async def branch_canvas(request: BranchCanvasRequest):
    """Save current canvas, then create a new canvas pre-seeded with selected images."""
    try:
        parent_canvas_id = state.current_canvas_id
        _save_canvas_to_disk()

        # Deep-copy selected images
        selected = [img for img in state.images_metadata if img.id in request.image_ids]
        if not selected:
            raise HTTPException(status_code=400, detail="No matching images found")

        import copy as _copy
        new_images = [_copy.copy(img) for img in selected]
        # Remap IDs so they start fresh
        old_to_new: Dict[int, int] = {}
        for i, img in enumerate(new_images):
            old_to_new[img.id] = i
            img.id = i
        # Fix genealogy references
        for img in new_images:
            img.parents = [old_to_new[p] for p in img.parents if p in old_to_new]
            img.children = [old_to_new[c] for c in img.children if c in old_to_new]
            img.reference_ids = [old_to_new[r] for r in img.reference_ids if r in old_to_new]
            img._cached_base64_url = None  # clear cache

        # Reset state with new images
        state.images_metadata = new_images
        state.history_groups = []
        state.next_id = len(new_images)
        state.event_log = []
        state.cluster_centroids = []
        state.cluster_labels = []
        state.current_canvas_id = str(_uuid.uuid4())
        state.canvas_name = request.name
        state.canvas_created_at = datetime.now().isoformat()
        state.parent_canvas_id = parent_canvas_id
        state.shared_image_ids = request.image_ids

        await broadcast_state_update()
        return {
            "canvasId": state.current_canvas_id,
            "canvasName": state.canvas_name,
            "parentCanvasId": state.parent_canvas_id,
            "imageCount": len(state.images_metadata),
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


class RenameCanvasRequest(BaseModel):
    name: str


class DeleteCanvasRequest(BaseModel):
    canvas_id: str


@app.post("/api/sessions/delete")
async def delete_canvas(request: DeleteCanvasRequest):
    """Delete a saved canvas from disk. Cannot delete the currently active canvas."""
    if request.canvas_id == state.current_canvas_id:
        raise HTTPException(status_code=400, detail="Cannot delete the active canvas. Switch to another canvas first.")
    path = _session_path(state.participant_id, request.canvas_id)
    if not path.exists():
        # Search other participant dirs
        found = None
        for pid_dir in DATA_DIR.iterdir():
            candidate = pid_dir / "sessions" / f"{request.canvas_id}.json"
            if candidate.exists():
                found = candidate
                break
        if not found:
            raise HTTPException(status_code=404, detail=f"Canvas {request.canvas_id} not found")
        path = found
    path.unlink()
    return {"success": True, "deleted": request.canvas_id}


@app.post("/api/sessions/rename")
async def rename_canvas(request: RenameCanvasRequest):
    """Rename the current canvas."""
    state.canvas_name = request.name.strip() or "Untitled"
    return {"canvasId": state.current_canvas_id, "canvasName": state.canvas_name}


class SetParticipantRequest(BaseModel):
    participant_id: str


@app.post("/api/session/set-participant")
async def set_participant(request: SetParticipantRequest):
    """Update the participant ID (affects where future saves are written)."""
    state.participant_id = request.participant_id.strip() or "researcher"
    return {"participantId": state.participant_id}


@app.get("/api/admin/sessions")
async def admin_sessions(admin_key: str = ""):
    """List all participants' canvases (admin only)."""
    if admin_key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Invalid admin key")
    if not DATA_DIR.exists():
        return {"participants": []}
    result = []
    for pid_dir in DATA_DIR.iterdir():
        if pid_dir.is_dir():
            sessions = _list_sessions(pid_dir.name)
            result.append({"participantId": pid_dir.name, "sessions": sessions})
    return {"participants": result}


class EventLogRequest(BaseModel):
    type: str
    data: Optional[Dict] = None


@app.post("/api/events/log")
async def log_event(request: EventLogRequest):
    """Append an event to the current canvas event log (fire-and-forget)."""
    state.event_log.append({
        "type": request.type,
        "timestamp": datetime.now().isoformat(),
        "data": request.data or {},
    })
    return {"ok": True}

# ─────────────────────────────────────────────────────────────────────────────


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates."""
    await websocket.accept()
    state.websocket_connections.append(websocket)

    try:
        # Send initial state
        await websocket.send_json({
            "type": "state_update",
            "data": {
                "images": [image_metadata_to_response(img).model_dump() for img in state.images_metadata if img.visible],
                "history_groups": [
                    {
                        "id": g.id,
                        "type": g.type,
                        "image_ids": g.image_ids,
                        "prompt": g.prompt,
                        "visible": g.visible,
                        "thumbnail_id": g.thumbnail_id,
                        "timestamp": g.timestamp.isoformat()
                    }
                    for g in state.history_groups
                ],
                "axis_labels": state.axis_labels,
                "design_brief": state.design_brief  # Include design brief in WebSocket initial state
            }
        })

        # Keep connection alive
        while True:
            data = await websocket.receive_text()
            # Echo back for keep-alive
            await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        state.websocket_connections.remove(websocket)


if __name__ == "__main__":
    # Allow port to be configured via env and automatically fall back
    # to the next available port if the desired one is already in use.
    def find_free_port(start_port: int = 8000, max_attempts: int = 20) -> int:
        """
        Find a free TCP port, starting from start_port and scanning upward.
        This avoids crashes when the default backend port is already in use.
        """
        for port in range(start_port, start_port + max_attempts):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                try:
                    s.bind(("0.0.0.0", port))
                except OSError:
                    continue
                return port
        raise RuntimeError(f"Could not find a free port in range {start_port}-{start_port + max_attempts - 1}")

    # Prefer explicit env var if provided; otherwise start at 8000 and scan.
    env_port = os.getenv("BACKEND_PORT") or os.getenv("PORT")
    if env_port:
        try:
            port = int(env_port)
        except ValueError:
            print(f"⚠ Invalid BACKEND_PORT/PORT value '{env_port}', falling back to auto-detected port.")
            port = find_free_port(8000)
    else:
        port = find_free_port(8000)

    print(f"🚀 Starting Zappos Semantic Explorer backend on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
