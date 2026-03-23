"""FastAPI backend for Zappos Semantic Explorer."""

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
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
# fal.ai rembg called via REST (no fal_client dependency needed)
import zipfile
import json
import tempfile


def remove_background(image_bytes: bytes) -> bytes:
    """Remove background via fal.ai's rembg REST API (replaces local rembg/PyTorch)."""
    fal_key = os.getenv("FAL_KEY", "")
    b64_input = base64.b64encode(image_bytes).decode()
    data_url = f"data:image/png;base64,{b64_input}"
    resp = requests.post(
        "https://fal.run/fal-ai/imageutils/rembg",
        headers={"Authorization": f"Key {fal_key}", "Content-Type": "application/json"},
        json={"image_url": data_url},
        timeout=60,
    )
    resp.raise_for_status()
    result = resp.json()
    img_url = result.get("image", {}).get("url", "")
    if not img_url:
        raise RuntimeError(f"fal.ai rembg returned no image URL: {result}")
    img_resp = requests.get(img_url, timeout=30)
    img_resp.raise_for_status()
    return img_resp.content


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
    print("[OK] Gemini API configured")
else:
    print("[WARNING] GOOGLE_API_KEY not found in .env file")

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
    allow_origins=["*"],  # Allow all origins (Railway + localhost dev)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health_check():
    """Health check endpoint for Railway deployment."""
    return {"status": "ok"}

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
    precomputed_coordinates: Optional[List[float]] = None  # Skip projection if already known (ghost accept)
    realm: str = 'shoe'        # 'shoe' or 'mood-board'
    shoe_view: str = 'side'    # 'side', '3/4-front', '3/4-back'
    parent_side_id: int = -1   # For 3/4 satellites: ID of parent side-view shoe (-1 = none)


class InterpretBriefRequest(BaseModel):
    brief: str


class UpdateBriefFieldsRequest(BaseModel):
    fields: List[Dict]  # [{key, label, value}, ...]


class SuggestTagsRequest(BaseModel):
    brief: str
    reference_image_ids: List[int] = []
    mode: str = "text"  # "text", "reference", "mood-board", or "mood-board-reference"


class ComposePromptRequest(BaseModel):
    selected_tags: List[str]
    brief: str


class RefinePromptRequest(BaseModel):
    prompt: str
    tags: List[Dict] = []  # [{"text": "white leather", "source": "A", "color": "#00d2ff"}, ...]
    reference_image_ids: List[int] = []
    brief: str = ""
    realm: str = "shoe"  # "shoe" or "mood-board"
    generation_mode: str = "single-ref"  # "scratch" | "single-ref" | "multi-ref"


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
    realm: str = 'shoe'        # 'shoe' or 'mood-board'
    shoe_view: str = 'side'    # 'side', '3/4-front', '3/4-back'
    parent_side_id: int = -1   # For 3/4 satellites: ID of parent side-view shoe (-1 = none)


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
        self.event_log_path: Optional[Path] = None       # current JSONL event log file path
        self.event_log_session_start: Optional[str] = None  # ISO timestamp of session start
        self.study_session_name: str = ""  # User-set study session identifier (prefixed to filenames)
        # Structured brief interpretation (auto-generated by Gemini on brief save)
        self.brief_fields: List[Dict] = []               # [{key, label, value}, ...]
        self.brief_interpretation: Optional[str] = None  # AI one-sentence summary
        self.brief_suggested_params: List[Dict] = []     # [{key, label, hint}, ...]
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


# ─── AI prompt helpers ────────────────────────────────────────────────────────

def _get_shoe_type_constraint() -> str:
    """Extract shoe type from brief_fields and return an explicit constraint string."""
    for f in (state.brief_fields or []):
        key = (f.get("key") or "").lower()
        val = (f.get("value") or "").strip()
        if val and ("shoe" in key or "type" in key or "silhouette" in key or "category" in key):
            return f'The shoe type is "{val}" — every suggestion MUST be a {val}.'
    # Fallback: try to extract from brief text
    if state.design_brief:
        return f'Infer the shoe type from this brief: "{state.design_brief[:200]}". Every suggestion must match that shoe type.'
    return "Infer the shoe type from context and stay within it."


# ─── Session helpers ──────────────────────────────────────────────────────────

def _slugify(name: str) -> str:
    """Convert a canvas name to a filesystem-safe slug.
    e.g. 'My Canvas 1!' → 'my-canvas-1'
    """
    import re as _re
    slug = name.lower().strip()
    slug = _re.sub(r'[^\w\s-]', '', slug)   # strip non-alphanumeric (keep - and _)
    slug = _re.sub(r'[\s_]+', '-', slug)     # spaces/underscores → hyphen
    slug = _re.sub(r'-+', '-', slug)         # collapse multiple hyphens
    slug = slug.strip('-')
    return slug or 'canvas'


def _session_path(participant_id: str, canvas_id: str, canvas_name: str = "") -> Path:
    """Return the canonical path for a session file.

    Filename format: {study_session}_{slug}_{canvas_id}.json
    Falls back to bare {canvas_id}.json when canvas_name is empty (legacy).
    Always creates parent dirs.
    """
    sessions_dir = DATA_DIR / participant_id / "sessions"
    sessions_dir.mkdir(parents=True, exist_ok=True)
    prefix = (_slugify(state.study_session_name) + "_") if state.study_session_name else ""
    if canvas_name:
        slug = _slugify(canvas_name)
        return sessions_dir / f"{prefix}{slug}_{canvas_id}.json"
    return sessions_dir / f"{prefix}{canvas_id}.json"


def _find_session_file(participant_id: str, canvas_id: str) -> Optional[Path]:
    """Locate the session JSON file for canvas_id regardless of its name slug.

    Search order:
    1. Any file matching *_{canvas_id}.json  (new descriptive format)
    2. Bare {canvas_id}.json                 (legacy format)
    3. Scan all participant dirs             (cross-participant fallback)
    Returns None if not found.
    """
    sessions_dir = DATA_DIR / participant_id / "sessions"
    if sessions_dir.exists():
        # New descriptive format
        matches = list(sessions_dir.glob(f"*_{canvas_id}.json"))
        if matches:
            return matches[0]
        # Legacy bare UUID format
        legacy = sessions_dir / f"{canvas_id}.json"
        if legacy.exists():
            return legacy
    # Cross-participant fallback
    if DATA_DIR.exists():
        for pid_dir in DATA_DIR.iterdir():
            if not pid_dir.is_dir():
                continue
            s_dir = pid_dir / "sessions"
            matches = list(s_dir.glob(f"*_{canvas_id}.json"))
            if matches:
                return matches[0]
            legacy = s_dir / f"{canvas_id}.json"
            if legacy.exists():
                return legacy
    return None


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
        "briefFields": state.brief_fields,
        "briefInterpretation": state.brief_interpretation,
        "briefSuggestedParams": state.brief_suggested_params,
        "nextId": state.next_id,
        "images": images_data,
        "historyGroups": history_data,
    }


def _save_canvas_to_disk() -> Path:
    """Save current canvas state to disk and return the file path.

    Uses the descriptive {slug}_{canvas_id}.json filename.
    If the canvas was renamed since the last save the old file is deleted.
    Event logs are saved ONLY in the events/ directory as JSONL (see _open_event_log).
    """
    data = _serialize_canvas()
    new_path = _session_path(state.participant_id, state.current_canvas_id, state.canvas_name)
    # Delete old file if it exists under a different name (rename case)
    old_path = _find_session_file(state.participant_id, state.current_canvas_id)
    if old_path and old_path.resolve() != new_path.resolve():
        try:
            old_path.unlink()
        except OSError:
            pass
    with open(new_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, cls=_NumpyEncoder)

    return new_path


def _close_event_log():
    """Write session_end to the current JSONL event log and clear the path."""
    if state.event_log_path:
        try:
            with open(state.event_log_path, "a", encoding="utf-8") as f:
                f.write(json.dumps({
                    "type": "session_end",
                    "timestamp": datetime.now().isoformat(),
                    "canvas_id": state.current_canvas_id,
                }) + "\n")
        except Exception:
            pass
    state.event_log_path = None
    state.event_log_session_start = None


def _open_event_log():
    """Open or append to the daily JSONL event log for the current participant.

    All visits within one calendar day go into one file:
      Alice_2026-03-23_eventlog.jsonl
    Subsequent visits append a session_resume marker instead of creating a new file.
    """
    now = datetime.now()
    state.event_log_session_start = now.isoformat()
    date_str = now.strftime("%Y-%m-%d")
    participant = state.participant_id or "researcher"
    fname = f"{participant}_{date_str}_eventlog.jsonl"
    path = DATA_DIR / participant / "events" / fname
    path.parent.mkdir(parents=True, exist_ok=True)
    state.event_log_path = path
    is_new = not path.exists()
    with open(path, "a", encoding="utf-8") as f:
        if is_new:
            f.write(json.dumps({
                "type": "session_start",
                "timestamp": state.event_log_session_start,
                "canvas_id": state.current_canvas_id,
                "canvas_name": state.canvas_name,
                "participant_id": participant,
            }) + "\n")
        else:
            f.write(json.dumps({
                "type": "session_resume",
                "timestamp": state.event_log_session_start,
                "canvas_id": state.current_canvas_id,
                "canvas_name": state.canvas_name,
                "participant_id": participant,
            }) + "\n")


def _log_event_to_file(entry: dict):
    """Append an event dict to the current JSONL file (fire-and-forget)."""
    if state.event_log_path:
        try:
            with open(state.event_log_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, cls=_NumpyEncoder) + "\n")
        except Exception:
            pass


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
    state.brief_fields = data.get("briefFields", [])
    state.brief_interpretation = data.get("briefInterpretation")
    state.brief_suggested_params = data.get("briefSuggestedParams", [])
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
            realm=img_data.get("realm", "shoe"),
            shoe_view=img_data.get("shoe_view", "side"),
            parent_side_id=img_data.get("parent_side_id", -1),
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
        neighbors=neighbors,
        realm=getattr(img, 'realm', 'shoe'),
        shoe_view=getattr(img, 'shoe_view', 'side'),
        parent_side_id=getattr(img, 'parent_side_id', -1),
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
    """Serve frontend in production, API info in dev."""
    _dist = Path(__file__).resolve().parent.parent / "frontend" / "dist" / "index.html"
    if _dist.is_file():
        return FileResponse(str(_dist))
    return {"message": "Zappos Semantic Explorer API", "status": "running"}

@app.get("/api/test")
async def test():
    print("🧪 TEST ENDPOINT HIT")
    return {"message": "Backend is working!", "status": "ok"}


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ─── fal.ai Backend Proxy (API Gateway pattern) ─────────────────────────────
# All fal.ai calls routed through backend so FAL_KEY stays server-side.
# Uses asyncio.to_thread to avoid blocking the event loop during long generations.

def _fal_sync_call(endpoint: str, input_data: dict) -> dict:
    """Blocking HTTP call to fal.ai synchronous endpoint."""
    fal_key = os.getenv("FAL_KEY", "")
    resp = requests.post(
        f"https://fal.run/{endpoint}",
        headers={"Authorization": f"Key {fal_key}", "Content-Type": "application/json"},
        json=input_data,
        timeout=180,
    )
    resp.raise_for_status()
    return resp.json()


@app.post("/api/fal/run")
async def fal_run_proxy(request: Request):
    """Proxy a fal.ai model call. Keeps FAL_KEY server-side.
    Body: { endpoint: "fal-ai/nano-banana", input: { prompt: "...", ... } }
    Returns: the fal.ai response JSON directly.
    """
    body = await request.json()
    endpoint = body.get("endpoint", "")
    input_data = body.get("input", {})
    if not endpoint:
        raise HTTPException(status_code=400, detail="Missing 'endpoint' field")
    print(f"[fal-proxy] {endpoint} — input keys: {list(input_data.keys())}")
    result = await asyncio.to_thread(_fal_sync_call, endpoint, input_data)
    print(f"[fal-proxy] {endpoint} — done")
    return result


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
            print(f"[WARN] Gemini returned invalid format for '{concept}', using fallback")
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

        # Open event log file for this session (if not already open)
        if state.event_log_path is None:
            _open_event_log()

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
        print(f"X: {request.x_negative} -> {request.x_positive}")
        print(f"Y: {request.y_negative} -> {request.y_positive}")

        state.axis_labels['x'] = new_x
        state.axis_labels['y'] = new_y
        if request.z_positive and request.z_negative:
            print(f"Z: {request.z_negative} -> {request.z_positive}")
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
            print("[WARNING] Models not initialized, axis labels updated but positions not recalculated")
            print("   Positions will be recalculated when models are initialized")

        await broadcast_state_update()

        return {"status": "success", "message": "Axes updated"}

    except Exception as e:
        print(f"ERROR updating axes: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/axis-sentences")
async def get_axis_sentences():
    """Return the current Gemini-expanded sentences for all axis ends (from cache)."""
    try:
        result: Dict[str, List[str]] = {}
        for axis in ("x", "y"):
            neg, pos = state.axis_labels.get(axis, ("", ""))
            for suffix, label in [("negative", neg), ("positive", pos)]:
                key = f"{axis}_{suffix}"
                cache_key = f"{label}:4"
                if label and cache_key in state._gemini_expansion_cache:
                    result[key] = state._gemini_expansion_cache[cache_key]
                elif label:
                    # Generate on the fly if not cached
                    concepts = expand_concept_with_gemini(label, num_expansions=4)
                    _set_cached_expansion(label, concepts)
                    result[key] = concepts
                else:
                    result[key] = []
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class TunedAxesRequest(BaseModel):
    custom_sentences: Dict[str, List[str]]  # e.g. { "x_negative": [...], "x_positive": [...], ... }
    image_anchors: List[Dict]  # [{ "imageId": int, "axis": "x"|"y", "position": float (0-10) }]
    text_weight: float = 1.0  # Weight for text-based direction (vs image anchors)


@app.post("/api/update-axes-tuned")
async def update_axes_tuned(request: TunedAxesRequest):
    """
    Compute blended axis vectors from custom sentences + image anchors, then reproject.
    axis_vector = α * normalize(text_direction) + Σ(wᵢ * normalize(imageᵢ_embedding))
    where wᵢ = (position_i - 5) / 5  (maps 0-10 to [-1, +1])
    """
    try:
        if state.axis_builder is None or state.embedder is None:
            raise HTTPException(status_code=400, detail="Models not initialized")

        print(f"\n=== Tuned Axis Update ===")
        print(f"  Text weight: {request.text_weight}")
        print(f"  Image anchors: {len(request.image_anchors)}")

        # Build image ID → embedding lookup
        img_embed_map: Dict[int, np.ndarray] = {}
        for img_meta in state.images_metadata:
            img_embed_map[img_meta.id] = img_meta.embedding

        directions = {}
        for axis in ("x", "y"):
            neg_key = f"{axis}_negative"
            pos_key = f"{axis}_positive"
            neg_sentences = request.custom_sentences.get(neg_key, [])
            pos_sentences = request.custom_sentences.get(pos_key, [])

            # Text direction (same as standard projection)
            text_dir = np.zeros(len(next(iter(img_embed_map.values()))))
            if neg_sentences and pos_sentences:
                neg_axis = state.axis_builder.create_ensemble_axis(
                    neg_sentences, name=f"tuned_{neg_key}", positive_concept="neg", negative_concept="neg"
                )
                pos_axis = state.axis_builder.create_ensemble_axis(
                    pos_sentences, name=f"tuned_{pos_key}", positive_concept="pos", negative_concept="neg"
                )
                text_dir = pos_axis.direction - neg_axis.direction
                norm = np.linalg.norm(text_dir)
                if norm > 1e-12:
                    text_dir = text_dir / norm

            # Image anchor direction
            anchor_dir = np.zeros_like(text_dir)
            axis_anchors = [a for a in request.image_anchors if a.get("axis") == axis]
            if axis_anchors:
                for anchor in axis_anchors:
                    img_id = anchor["imageId"]
                    position = anchor["position"]  # 0-10
                    weight = (position - 5) / 5  # maps to [-1, +1]
                    emb = img_embed_map.get(img_id)
                    if emb is not None:
                        emb_norm = emb / (np.linalg.norm(emb) + 1e-12)
                        anchor_dir += weight * emb_norm
                norm = np.linalg.norm(anchor_dir)
                if norm > 1e-12:
                    anchor_dir = anchor_dir / norm

            # Additive blend: α * text_dir + anchor_dir (anchors always contribute)
            # This matches: axis_vector = α * normalize(text) + Σ(wᵢ * normalize(imgᵢ))
            alpha = request.text_weight
            combined = alpha * text_dir + anchor_dir
            norm = np.linalg.norm(combined)
            if norm > 1e-12:
                combined = combined / norm

            directions[axis] = combined
            print(f"  {axis}: text_norm={np.linalg.norm(text_dir):.3f}, anchor_contrib={np.linalg.norm(anchor_dir):.3f}, n_anchors={len(axis_anchors)}")

        # Project all images onto tuned axes
        all_embeddings = np.array([img.embedding for img in state.images_metadata])
        x_coords = all_embeddings @ directions["x"]
        y_coords = all_embeddings @ directions["y"]

        for i, img_meta in enumerate(state.images_metadata):
            img_meta.coordinates = (float(x_coords[i]), float(y_coords[i]))

        # Update the expansion cache with custom sentences
        for key, sentences in request.custom_sentences.items():
            parts = key.split("_")
            axis = parts[0]
            direction = parts[1]
            label = state.axis_labels.get(axis, ("", ""))[0 if direction == "negative" else 1]
            if label and sentences:
                _set_cached_expansion(label, sentences)

        # Invalidate direction cache (custom directions don't match standard projection)
        state._axis_directions_cache = None

        update_clusters()
        await broadcast_state_update()

        return {"status": "success", "message": "Tuned axes applied"}

    except Exception as e:
        print(f"ERROR in tuned axis update: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


class RefineSentencesRequest(BaseModel):
    sentences: Dict[str, List[str]]  # Current sentences per axis end
    instruction: str  # Natural language instruction for refinement


@app.post("/api/refine-sentences")
async def refine_sentences(request: RefineSentencesRequest):
    """Use Gemini to refine axis sentences based on natural language instruction."""
    try:
        gemini_model = genai.GenerativeModel("gemini-2.5-flash-lite")

        prompt = f"""You are refining visual description sentences used for semantic axis projection in a shoe design tool.

Current axis sentences:
{json.dumps(request.sentences, indent=2)}

User instruction: "{request.instruction}"

Rewrite each group of sentences to reflect the user's instruction. Rules:
- Keep exactly 4 sentences per axis end
- Each sentence should be 3-8 words
- Focus on VISUAL attributes (materials, colors, shapes, textures)
- Be specific and concrete
- Return ONLY a JSON object with the same keys, no other text.

Example output:
{{"x_negative": ["sentence1", "sentence2", "sentence3", "sentence4"], "x_positive": [...]}}"""

        response = gemini_model.generate_content(prompt)
        text = (getattr(response, "text", None) or "").strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*\n?", "", text)
            text = re.sub(r"\n?```\s*$", "", text)
            text = text.strip()
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            text = match.group(0)
        result = json.loads(text)

        # Validate structure
        for key in request.sentences:
            if key not in result or not isinstance(result[key], list):
                result[key] = request.sentences[key]

        return result

    except Exception as e:
        print(f"ERROR refining sentences: {e}")
        return request.sentences  # Fallback: return originals


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


@app.post("/api/agent/interpret-brief")
async def interpret_brief(request: InterpretBriefRequest):
    """Use Gemini to extract structured design parameters from the raw brief text."""
    brief = request.brief.strip()
    if not brief:
        return {"status": "success", "interpretation": "", "extracted": [], "unmentioned": []}

    try:
        prompt = f"""You are a shoe design expert. The user described their design intent:

"{brief}"

TASK: Extract structured design parameters.

PARAMETER DICTIONARY (extract if mentioned; suggest the rest):
- shoe_type: Type of shoe (sneaker, boot, sandal, heel, flat, loafer, etc.)
- silhouette: Shape profile (high-top, low-top, mid-top, slip-on, mule, etc.)
- material: Primary material (leather, mesh, suede, canvas, knit, synthetic, etc.)
- color: Color palette (monochrome, earth tones, neon, pastel, black/white, etc.)
- texture: Surface texture (smooth, perforated, woven, quilted, embossed, etc.)
- sole: Sole style (chunky, flat, platform, wedge, thin, rubber, etc.)
- occasion: Use case (streetwear, athletic, formal, casual, outdoor, etc.)
- mood: Aesthetic mood (futuristic, vintage, minimalist, maximalist, bold, etc.)
- era: Era/period inspiration (70s retro, Y2K, contemporary, timeless, etc.)
- brand_ref: Brand or model reference (Nike AF1, Yeezy, Converse Chuck, etc.)

Rules:
1. Only include a field in "extracted" if the brief clearly mentions or strongly implies it
2. Values should be specific but faithful to the brief (2-5 words max)
3. All parameters NOT mentioned go in "unmentioned" with 3-5 example hints
4. interpretation = one sentence describing what the user seems to be designing

Return JSON ONLY (no markdown):
{{
  "interpretation": "A basketball shoe inspired by the Nike Air Force 1 silhouette",
  "extracted": [
    {{"key": "shoe_type", "label": "Shoe Type", "value": "Basketball shoe"}},
    {{"key": "brand_ref", "label": "Brand Reference", "value": "Nike Air Force 1"}}
  ],
  "unmentioned": [
    {{"key": "material", "label": "Material", "hint": "leather, mesh, suede, synthetic"}},
    {{"key": "color", "label": "Color Palette", "hint": "monochrome, earth tones, neon"}}
  ]
}}"""

        model = genai.GenerativeModel('gemini-2.5-flash-lite')
        response = model.generate_content(prompt)
        text = (getattr(response, "text", None) or "").strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()

        import json as _json
        data = _json.loads(text)
        extracted = data.get("extracted", [])
        unmentioned = data.get("unmentioned", [])
        interpretation = data.get("interpretation", "")

        # Persist in state
        state.brief_fields = extracted
        state.brief_interpretation = interpretation
        state.brief_suggested_params = unmentioned

        return {
            "status": "success",
            "interpretation": interpretation,
            "extracted": extracted,
            "unmentioned": unmentioned,
        }
    except Exception as e:
        print(f"ERROR in interpret_brief: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agent/update-brief-fields")
async def update_brief_fields(request: UpdateBriefFieldsRequest):
    """Update structured brief fields (called when user edits a field value or adds/removes a field)."""
    state.brief_fields = [dict(f) for f in request.fields]
    return {"status": "success"}


class SynthesizeBriefRequest(BaseModel):
    fields: List[Dict]  # [{key, label, value}, ...]

@app.post("/api/agent/synthesize-brief")
async def synthesize_brief(request: SynthesizeBriefRequest):
    """Use Gemini to synthesize a natural language brief from structured fields."""
    if not gemini_api_key:
        raise HTTPException(status_code=500, detail="Gemini API key not configured")

    filled = [f for f in request.fields if f.get("value", "").strip()]
    if not filled:
        return {"brief": ""}

    field_lines = "\n".join(f"- {f['label']}: {f['value']}" for f in filled)

    prompt = f"""Convert these structured shoe design parameters into a concise, natural language design brief (2–4 sentences max):

{field_lines}

Write as if a designer is describing their shoe concept — specific, evocative, and faithful to the parameters. No bullet points, just flowing prose."""

    try:
        model = genai.GenerativeModel('gemini-2.5-flash-lite')
        response = model.generate_content(prompt)
        brief = (getattr(response, "text", None) or "").strip()
        # Persist in state so it's included in future prompts
        state.design_brief = brief
        return {"brief": brief}
    except Exception as e:
        print(f"ERROR in synthesize_brief: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agent/suggest-tags")
async def suggest_tags(request: SuggestTagsRequest):
    """Suggest categorized design attribute tags (text mode) or analyze reference images (reference mode)."""
    if not gemini_api_key:
        raise HTTPException(status_code=500, detail="Gemini API key not configured")

    brief = request.brief.strip() or "Explore shoe design variations"

    # Build canvas context
    visible = [img for img in state.images_metadata if img.visible and not img.is_ghost]
    count = len(visible)
    x_labels = state.axis_labels.get('x', ('formal', 'sporty'))
    y_labels = state.axis_labels.get('y', ('dark', 'colorful'))
    axis_info = f"{x_labels[0]}-{x_labels[1]} × {y_labels[0]}-{y_labels[1]}"

    # Structured brief fields section
    fields_section = ""
    if state.brief_fields:
        fields_section = "\nSTRUCTURED DESIGN PARAMETERS:\n"
        for f in state.brief_fields:
            if f.get("value"):
                fields_section += f"- {f['label']}: {f['value']}\n"

    # Normalize: mood-board-reference without refs → mood-board
    effective_mode = request.mode
    if effective_mode == "mood-board-reference" and not request.reference_image_ids:
        effective_mode = "mood-board"
    print(f"[suggest_tags] mode={request.mode}, effective_mode={effective_mode}, ref_ids={request.reference_image_ids}")

    try:
        model = genai.GenerativeModel('gemini-2.5-flash-lite')

        if effective_mode == "reference" and request.reference_image_ids:
            # ── Reference mode: multimodal analysis ──────────────────────────
            ref_imgs = [img for img in state.images_metadata if img.id in request.reference_image_ids]
            labels = [chr(65 + i) for i in range(len(ref_imgs))]  # A, B, C...
            label_map = {img.id: labels[i] for i, img in enumerate(ref_imgs)}

            n = len(ref_imgs)

            # Shared analysis instructions
            analysis_instructions = f"""You are a visual design AI. The user selected {n} reference image{"s" if n > 1 else ""}.

DESIGN BRIEF: {brief}{fields_section}

Analyze each image (labeled {", ".join(labels)}). Note: these may be shoes, clothing, or generic reference images — analyze whatever is shown.

For each image, extract exactly 5-6 SHORT KEY DESCRIPTORS (1-3 words each) that best capture the visual character of that item. Return them as a FLAT JSON ARRAY of strings in the "descriptors" field. Do NOT categorize them, do NOT use a nested object/dict — just a flat list of the 5-6 most distinctive and useful design tags.

Good examples of descriptors: "white leather", "chunky sole", "minimalist upper", "perforated toe box", "high-top", "earth tones", "woven mesh", "contrast stitching"
CORRECT format: "descriptors": ["white leather", "chunky sole", "minimalist upper", "high-top", "contrast stitching"]
WRONG format: "features": {{"material": "leather", "color": "white"}} — NEVER use this format"""

            if n == 1:
                # Single image: suggest VARIATIONS of this one shoe, using @A's descriptors
                prompt_text = f"""{analysis_instructions}

Then suggest 2-3 VARIATION prompts for this single shoe. Each prompt should describe a specific design modification or iteration of @A — changing one or two aspects while keeping the rest.

Use @A's notation to reference specific features from the analysis. Use the EXACT descriptor phrases from your analysis.

GOOD examples:
- "@A's oxford silhouette with a chunkier sole and contrast stitching"
- "make @A's upper more minimalist, remove the brogue details, keep the cap toe"
- "@A's leather construction but in a high-top version with a gum outsole"
- "sleeker version of @A with a thinner sole and cleaner lines"

BAD examples (too generic — NEVER write these):
- "a stylish shoe inspired by the reference"
- "improve the design"
- "make it better"

IMPORTANT: Only reference @A. Do NOT mention @B, @C, or @D — there is only ONE reference image.

Return JSON ONLY (no markdown):
{{
  "reference_analysis": [
    {{"image_id": 0, "label": "A", "descriptors": ["white leather", "chunky sole", "low-top", "minimalist", "perforated toe", "clean lines"]}}
  ],
  "combination_prompts": [
    {{"prompt": "@A's chunky sole with a knit upper and earth tones", "reasoning": "keeps the bold sole from A, swaps leather for knit"}}
  ]
}}"""
            else:
                # Multiple images: suggest COMBINATION prompts that cross-reference @A, @B, etc.
                prompt_text = f"""{analysis_instructions}

Then suggest 2-3 combination prompts that EXPLICITLY REFERENCE specific images using @A, @B notation.
Each combination MUST describe a RELATIONSHIP between the images — which specific feature from which image combines with which feature from another. Be specific about parts (upper, sole, silhouette, colorway, material, texture).

Use the EXACT descriptor phrases from your analysis when referring to features. This is critical — if image A has "chunky sole", write "@A's chunky sole", not "@A's sole".

GOOD examples:
- "@A's chunky sole with @B's knit upper and minimalist colorway"
- "blend @A's retro silhouette with @B's modern mesh material"
- "@A's earth tones applied to @B's high-top silhouette with contrast stitching"

BAD examples (too generic — NEVER write these):
- "a stylish shoe combining elements of both images"
- "a shoe inspired by @A and @B"
- "blend the best of @A and @B"

Return JSON ONLY (no markdown):
{{
  "reference_analysis": [
    {{"image_id": 0, "label": "A", "descriptors": ["white leather", "chunky sole", "low-top", "minimalist", "perforated toe", "clean lines"]}}
  ],
  "combination_prompts": [
    {{"prompt": "@A's chunky sole with @B's knit upper and earth tones", "reasoning": "structural sole from A, material and colorway from B"}}
  ]
}}"""

            # Build content list: [text, pil_img_A, pil_img_B, ...]
            content = [prompt_text]
            for img in ref_imgs:
                try:
                    resized = img.pil_image.resize((256, 256))
                    content.append(resized)
                except Exception:
                    pass

            response = model.generate_content(content)
            text = (getattr(response, "text", None) or "").strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
                text = text.strip()

            import json as _json
            data = _json.loads(text)

            # Inject real image_ids into reference_analysis
            analysis = data.get("reference_analysis", [])
            for i, entry in enumerate(analysis):
                if i < len(ref_imgs):
                    entry["image_id"] = ref_imgs[i].id
                    entry["label"] = labels[i]
                # Gemini may use different key names — normalize to "descriptors"
                if "descriptors" not in entry or not entry.get("descriptors"):
                    entry["descriptors"] = (
                        entry.get("tags")
                        or entry.get("key_descriptors")
                        or entry.get("key_features")
                        or entry.get("features")
                        or []
                    )
                    # If features is a dict (legacy format), flatten values
                    if isinstance(entry["descriptors"], dict):
                        flat = []
                        for v in entry["descriptors"].values():
                            if isinstance(v, list):
                                flat.extend(v)
                            elif isinstance(v, str):
                                flat.extend([t.strip() for t in v.split(",") if t.strip()])
                        entry["descriptors"] = flat
            print(f"[suggest_tags] reference_analysis: {[{k: v for k, v in e.items() if k != 'image_id'} for e in analysis]}")

            return {
                "mode": "reference",
                "reference_analysis": analysis,
                "combination_prompts": data.get("combination_prompts", []),
            }

        elif effective_mode == "mood-board-reference" and request.reference_image_ids:
            # ── Mood board reference mode: multimodal analysis + concept categories ──
            # Combines per-image visual analysis (A/B/C/D descriptors) with mood-board
            # concept categories, so users iterating on boards get both.
            ref_imgs = [img for img in state.images_metadata if img.id in request.reference_image_ids]
            labels = [chr(65 + i) for i in range(len(ref_imgs))]
            label_map = {img.id: labels[i] for i, img in enumerate(ref_imgs)}

            n = len(ref_imgs)

            # Shared mood board analysis instructions
            mb_analysis_instructions = f"""You are a creative visual analysis AI for SHOE DESIGN mood boards and concept exploration.

DESIGN BRIEF: {brief}{fields_section}

The user selected {n} reference image{"s" if n > 1 else ""} (labeled {", ".join(labels)}). These are shoe design mood boards, concept sheets, or design sketches — analyze the visual and conceptual character of each board as it relates to shoe/footwear design.

For each image, extract exactly 6-8 SHORT KEY DESCRIPTORS (1-3 words each) that capture the visual/conceptual character of that board. Include:
- Mood/feeling (e.g., "aggressive energy", "calm elegance")
- Color story (e.g., "warm earth tones", "neon accents")
- Artistic technique (e.g., "gestural ink strokes", "collage layers")
- Form language (e.g., "angular tension", "organic flow")
- Shoe design COMPONENTS visible (e.g., "exaggerated toe cap", "chunky midsole", "wraparound strap", "sculpted heel counter", "geometric outsole", "oversized tongue")

IMPORTANT: Include at least 2 shoe component descriptors per image. All descriptors should relate to footwear design concepts. This is a SHOE design tool.

Return descriptors as a FLAT JSON ARRAY of strings."""

            if n == 1:
                # Single mood board: suggest ITERATIONS of this one board
                combination_instructions = f"""
Then suggest 2-3 iteration prompts for this single board using @A notation.
Each prompt should describe how to BUILD ON or ITERATE this shoe design board — what concepts to push further, what new direction to explore.
Use the EXACT descriptor phrases from your analysis. Keep it conceptual but always about shoe design.

GOOD: "@A's warm earth tones pushed toward bolder gestural marks with an exaggerated toe cap"
GOOD: "explore @A's angular tension in a more minimal palette with floating midsole"
BAD: "a product inspired by this board" — too generic and not shoe-specific, NEVER write this

IMPORTANT: Only reference @A. Do NOT mention @B, @C, or @D — there is only ONE reference image."""
            else:
                # Multiple mood boards: suggest COMBINATIONS across boards
                combination_instructions = f"""
Then suggest 2-3 combination/iteration prompts that reference specific boards using @A, @B notation.
Each combination should describe how to BUILD ON or ITERATE these shoe design boards — what shoe concepts to explore further, what to combine, what new footwear direction to take.
Use the EXACT descriptor phrases from your analysis. Keep it conceptual but always about shoe design.

GOOD: "@A's warm earth tones with @B's angular tension, pushing toward bolder gestural marks and an exaggerated toe cap"
BAD: "a product inspired by both boards" — too generic and not shoe-specific, NEVER write this"""

            prompt_text = f"""{mb_analysis_instructions}
{combination_instructions}

Also generate 6 concept categories with 4-6 tags each, informed by the reference boards but going BEYOND them to suggest new shoe design directions:
1. Mood — emotional/tonal direction for the shoe
2. Form Language — shoe shape and structural vocabulary
3. Era — time period / cultural footwear reference
4. Technique — artistic rendering style for shoe sketches
5. Palette — color direction for shoe design
6. Components — specific shoe parts/elements (e.g., "sculpted heel", "exaggerated toe", "floating midsole", "wraparound lacing", "deconstructed upper")

Return JSON ONLY (no markdown):
{{
  "reference_analysis": [
    {{"image_id": 0, "label": "A", "descriptors": ["warm earth tones", "gestural strokes", "layered textures", "organic flow", "exaggerated toe cap", "chunky outsole", "muted contrast"]}}
  ],
  "combination_prompts": [
    {{"prompt": "@A's warm palette and exaggerated toe cap with @B's angular composition, more expressive marks", "reasoning": "combines warmth from A with structural energy from B"}}
  ],
  "categories": [
    {{"name": "Mood", "tags": ["energetic", "serene", "aggressive", "playful"]}},
    {{"name": "Form Language", "tags": ["organic curves", "angular", "fluid", "geometric"]}},
    {{"name": "Era", "tags": ["retro 70s", "Y2K", "futurist", "contemporary"]}},
    {{"name": "Technique", "tags": ["bold marker", "watercolor wash", "charcoal", "ink"]}},
    {{"name": "Palette", "tags": ["earth tones", "neon pop", "monochrome", "pastel"]}},
    {{"name": "Components", "tags": ["sculpted heel", "exaggerated toe", "floating midsole", "wraparound strap"]}}
  ],
  "full_prompts": [
    {{"prompt": "bold angular tension with futuristic shoe silhouette, exaggerated toe cap and warm earth tones", "reasoning": "..."}}
  ]
}}"""

            # Build content list: [text, pil_img_A, pil_img_B, ...]
            content = [prompt_text]
            for img in ref_imgs:
                try:
                    resized = img.pil_image.resize((256, 256))
                    content.append(resized)
                except Exception as img_err:
                    print(f"[suggest_tags] mood-board-reference: failed to load image {img.id}: {img_err}")

            print(f"[suggest_tags] mood-board-reference: sending {len(content)-1} images to Gemini")
            response = model.generate_content(content)
            text = (getattr(response, "text", None) or "").strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
                text = text.strip()

            import json as _json
            data = _json.loads(text)
            print(f"[suggest_tags] mood-board-reference: parsed JSON keys: {list(data.keys())}")

            # Normalize reference_analysis
            analysis = data.get("reference_analysis", [])
            for i, entry in enumerate(analysis):
                if i < len(ref_imgs):
                    entry["image_id"] = ref_imgs[i].id
                    entry["label"] = labels[i]
                if "descriptors" not in entry or not entry.get("descriptors"):
                    entry["descriptors"] = (
                        entry.get("tags")
                        or entry.get("key_descriptors")
                        or entry.get("key_features")
                        or entry.get("features")
                        or []
                    )
                    if isinstance(entry["descriptors"], dict):
                        flat = []
                        for v in entry["descriptors"].values():
                            if isinstance(v, list):
                                flat.extend(v)
                            elif isinstance(v, str):
                                flat.extend([t.strip() for t in v.split(",") if t.strip()])
                        entry["descriptors"] = flat
            print(f"[suggest_tags] mood-board-reference: returning {len(analysis)} analyses, {len(data.get('categories', []))} categories")

            return {
                "mode": "mood-board-reference",
                "reference_analysis": analysis,
                "combination_prompts": data.get("combination_prompts", []),
                "categories": data.get("categories", []),
                "full_prompts": data.get("full_prompts", []),
            }

        elif effective_mode == "mood-board":
            # ── Mood board mode: concept-oriented tag generation ───────────────
            prompt_text = f"""You are a creative concept and style exploration assistant for SHOE DESIGN mood boards, concept sketches, and footwear design exploration sheets.

DESIGN BRIEF: {brief}
CANVAS: {count} designs, axes: {axis_info}{fields_section}

Generate attribute tags organized into exactly 6 categories for SHOE DESIGN mood boards, style boards, and concept sketches.
4-6 short tags (1-3 words each) per category. Tags should inspire shoe design visual direction, feeling, atmosphere, artistic style, and specific footwear elements.

IMPORTANT: This is a SHOE/FOOTWEAR design tool. All tags and prompts must relate to shoe design concepts, even when expressed in low-fi, conceptual terms.

Categories: Mood, Form Language, Era, Technique, Palette, Components
(Components = specific shoe design elements like "sculpted heel", "exaggerated toe", "floating midsole", "wraparound strap", "deconstructed upper")

Also suggest 2-3 complete shoe concept prompts (under 20 words each) that read like footwear designer briefs — evocative, atmospheric, and conceptual but always about shoes.

Return JSON ONLY (no markdown):
{{
  "categories": [
    {{"name": "Mood", "tags": ["energetic", "serene", "aggressive", "playful", "bold", "understated"]}},
    {{"name": "Form Language", "tags": ["organic curves", "angular", "fluid lines", "geometric", "asymmetric"]}},
    {{"name": "Era", "tags": ["retro 70s runner", "Y2K sneaker", "futurist boot", "vintage 90s trainer", "contemporary"]}},
    {{"name": "Technique", "tags": ["bold marker", "cross-hatch", "watercolor wash", "gestural ink", "charcoal"]}},
    {{"name": "Palette", "tags": ["earth tones", "neon pop", "monochrome", "pastel", "jewel tones"]}},
    {{"name": "Components", "tags": ["sculpted heel", "exaggerated toe", "floating midsole", "wraparound strap"]}}
  ],
  "full_prompts": [
    {{"prompt": "bold angular shoe with futuristic silhouette, exaggerated toe cap and warm earth tones", "reasoning": "..."}}
  ]
}}"""

            response = model.generate_content(prompt_text)
            text = (getattr(response, "text", None) or "").strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
                text = text.strip()

            import json as _json
            data = _json.loads(text)
            return {
                "mode": "text",
                "categories": data.get("categories", []),
                "full_prompts": data.get("full_prompts", []),
            }

        else:
            # ── Text mode: categorized tag generation ─────────────────────────
            prompt_text = f"""You are a shoe design exploration assistant.

DESIGN BRIEF: {brief}
CANVAS: {count} designs, axes: {axis_info}{fields_section}

Generate attribute tags organized into exactly 5 categories for shoe design.
4-6 short tags (1-3 words each) per category. Tags should be relevant to the brief.

Categories: Material, Color, Silhouette, Style, Details

Also suggest 2-3 complete prompts (under 20 words each) based on the brief.

Return JSON ONLY (no markdown):
{{
  "categories": [
    {{"name": "Material", "tags": ["leather", "suede", "mesh", "canvas", "knit"]}},
    {{"name": "Color", "tags": ["navy blue", "matte black", "cream white", "forest green"]}},
    {{"name": "Silhouette", "tags": ["low-top", "ankle boot", "slip-on", "chunky"]}},
    {{"name": "Style", "tags": ["minimalist", "retro", "athletic", "streetwear"]}},
    {{"name": "Details", "tags": ["thick sole", "contrast stitching", "perforated toe", "metallic eyelets"]}}
  ],
  "full_prompts": [
    {{"prompt": "a clean leather sneaker with minimalist design", "reasoning": "..."}}
  ]
}}"""

            response = model.generate_content(prompt_text)
            text = (getattr(response, "text", None) or "").strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
                text = text.strip()

            import json as _json
            data = _json.loads(text)
            return {
                "mode": "text",
                "categories": data.get("categories", []),
                "full_prompts": data.get("full_prompts", []),
            }

    except Exception as e:
        print(f"ERROR in suggest_tags (mode={effective_mode}): {e}")
        import traceback
        traceback.print_exc()
        # Fallback: return default categories per mode
        mood_board_cats = [
            {"name": "Mood", "tags": ["energetic", "serene", "aggressive", "playful", "bold"]},
            {"name": "Form Language", "tags": ["organic curves", "angular", "fluid", "geometric"]},
            {"name": "Era", "tags": ["retro 70s", "Y2K", "futurist", "vintage 90s"]},
            {"name": "Technique", "tags": ["bold marker", "cross-hatch", "watercolor", "charcoal"]},
            {"name": "Palette", "tags": ["earth tones", "neon pop", "monochrome", "pastel"]},
            {"name": "Components", "tags": ["sculpted heel", "exaggerated toe", "floating midsole", "wraparound strap"]},
        ]
        if effective_mode == "mood-board-reference":
            return {
                "mode": "mood-board-reference",
                "reference_analysis": [],
                "combination_prompts": [],
                "categories": mood_board_cats,
                "full_prompts": [],
            }
        if effective_mode == "mood-board":
            return {
                "mode": "text",
                "categories": mood_board_cats,
                "full_prompts": [],
            }
        if effective_mode == "text":
            return {
                "mode": "text",
                "categories": [
                    {"name": "Material", "tags": ["leather", "suede", "mesh", "canvas", "knit"]},
                    {"name": "Color", "tags": ["black", "white", "navy", "cream", "earth tones"]},
                    {"name": "Silhouette", "tags": ["low-top", "high-top", "chunky", "slip-on"]},
                    {"name": "Style", "tags": ["minimalist", "retro", "athletic", "streetwear"]},
                    {"name": "Details", "tags": ["thick sole", "stitching", "perforated", "lace-up"]},
                ],
                "full_prompts": [],
            }
        return {"mode": "reference", "reference_analysis": [], "combination_prompts": []}


class RembgBatchRequest(BaseModel):
    images: Dict[str, str]  # key → base64 (no data: prefix)


@app.post("/api/rembg-batch")
async def rembg_batch(request: RembgBatchRequest):
    """Remove backgrounds from a batch of base64 images via rembg."""
    results: Dict[str, str] = {}
    for key, b64 in request.images.items():
        try:
            if b64.startswith("data:"):
                b64 = b64.split(",", 1)[1]
            img_bytes = base64.b64decode(b64)
            pil_img = Image.open(BytesIO(img_bytes))
            if pil_img.mode != 'RGB':
                pil_img = pil_img.convert('RGB')

            buf = BytesIO()
            pil_img.save(buf, format='PNG')
            buf.seek(0)
            output_bytes = remove_background(buf.getvalue())

            result_b64 = base64.b64encode(output_bytes).decode()
            results[key] = result_b64
        except Exception as e:
            print(f"[rembg-batch] failed for {key}: {e}")
            results[key] = b64  # fallback: return original
    print(f"[rembg-batch] processed {len(results)} images")
    return {"images": results}


class AnalyzeViewsRequest(BaseModel):
    view_images: Dict[str, str]  # view_type → base64 (no data: prefix)
    brief: str = ""


@app.post("/api/agent/analyze-views")
async def analyze_views(request: AnalyzeViewsRequest):
    """Multi-view design analysis via Gemini: extract components, colors, suggest edits."""
    if not gemini_api_key:
        raise HTTPException(status_code=500, detail="Gemini API key not configured")

    view_names = list(request.view_images.keys())
    n = len(view_names)
    if n == 0:
        raise HTTPException(status_code=400, detail="No view images provided")

    brief = request.brief.strip() or "Analyze this shoe design"
    print(f"[analyze-views] {n} views: {view_names}")

    try:
        model = genai.GenerativeModel('gemini-2.5-flash-lite')

        prompt_text = f"""You are a professional footwear design analyst. You are shown {n} views of the SAME shoe.
Views provided: {", ".join(view_names)}
DESIGN BRIEF: {brief}

Analyze the shoe design and return JSON with these fields:

1. "components" — array of shoe components you can identify:
   Each: {{"name": "toe cap", "current": ["rounded", "smooth leather"], "visible_in": ["front", "side"]}}
   "current" = 2-3 SHORT descriptors of what this component CURRENTLY looks like.
   Identify: toe box/cap, upper/vamp, collar/tongue, sole unit (midsole + outsole), closure system, heel counter, any decorative details.

2. "descriptor_matrix" — for each component, provide alternative descriptors the user might apply.
   This is a matrix: rows = components, columns = descriptor categories.
   Each: {{"component": "toe cap", "descriptors": {{
     "shape": ["pointed", "squared", "almond", "rounded"],
     "material": ["patent leather", "suede", "mesh", "knit"],
     "detail": ["perforated", "brogue", "plain", "contrast stitched"]
   }}}}
   Descriptor categories: "shape", "material", "color", "texture", "proportion", "detail"
   Each category should have 3-5 short options (1-3 words each). Include the CURRENT descriptor as one option.
   Not every component needs every category — only include relevant ones.

3. "color_palette" — array of dominant colors:
   Each: {{"hex": "#F5F5F0", "name": "off-white", "location": "upper panels"}}
   Extract 3-6 distinct colors.

4. "style_summary" — 1-2 sentence description of the overall design aesthetic.

5. "suggested_edits" — array of 4-6 specific, actionable edit suggestions:
   Each: {{"category": "<cat>", "suggestion": "<specific edit>", "reasoning": "<why>"}}
   Categories: "component", "material", "color", "proportion", "detail", "style"

Return ONLY valid JSON, no markdown fences:
{{
  "components": [...],
  "descriptor_matrix": [...],
  "color_palette": [...],
  "style_summary": "...",
  "suggested_edits": [...]
}}"""

        # Build multimodal content: [prompt, pil_img_1, pil_img_2, ...]
        content = [prompt_text]
        for vt in view_names:
            try:
                b64 = request.view_images[vt]
                # Strip data: prefix if present
                if b64.startswith("data:"):
                    b64 = b64.split(",", 1)[1]
                img_bytes = base64.b64decode(b64)
                pil_img = Image.open(BytesIO(img_bytes)).convert("RGB")
                pil_img = pil_img.resize((256, 256))
                content.append(pil_img)
            except Exception as img_err:
                print(f"[analyze-views] failed to load {vt}: {img_err}")

        response = model.generate_content(content)
        text = (getattr(response, "text", None) or "").strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()

        import json as _json
        data = _json.loads(text)

        result = {
            "components": data.get("components", []),
            "descriptor_matrix": data.get("descriptor_matrix", []),
            "color_palette": data.get("color_palette", []),
            "style_summary": data.get("style_summary", ""),
            "suggested_edits": data.get("suggested_edits", []),
        }
        print(f"[analyze-views] {len(result['components'])} components, {len(result['descriptor_matrix'])} matrix rows, {len(result['color_palette'])} colors, {len(result['suggested_edits'])} suggestions")
        return result

    except Exception as e:
        print(f"ERROR in analyze_views: {e}")
        import traceback
        traceback.print_exc()
        # Fallback
        return {
            "components": [],
            "descriptor_matrix": [],
            "color_palette": [],
            "style_summary": "Analysis unavailable",
            "suggested_edits": [],
        }


class ComposeEditPromptRequest(BaseModel):
    selected_pairs: List[Dict[str, str]]  # [{"component": "toe cap", "descriptor": "pointed"}, ...]
    style_summary: str = ""
    brief: str = ""


@app.post("/api/agent/compose-edit-prompt")
async def compose_edit_prompt(request: ComposeEditPromptRequest):
    """Compose a coherent edit prompt from selected component+descriptor pairs."""
    if not gemini_api_key:
        raise HTTPException(status_code=500, detail="Gemini API key not configured")
    if not request.selected_pairs:
        raise HTTPException(status_code=400, detail="No pairs provided")

    pairs_text = "\n".join(
        f"- {p['component']}: {p['descriptor']}" for p in request.selected_pairs
    )
    print(f"[compose-edit-prompt] {len(request.selected_pairs)} pairs")

    try:
        model = genai.GenerativeModel('gemini-2.5-flash-lite')
        prompt = f"""You are a footwear design prompt engineer. A designer has selected these component+descriptor pairs to modify a shoe:

{pairs_text}

Current shoe style: {request.style_summary or 'not specified'}
Design brief: {request.brief or 'general shoe design'}

Compose ONE concise, natural-language edit prompt (1-2 sentences) that incorporates ALL the selected changes.
The prompt should be specific and actionable — it will be used as input to an image generation model.

GOOD: "make the toe cap more pointed with patent leather finish, switch the upper panels to woven mesh, and increase the midsole stack height"
BAD: "improve the shoe design" (too vague)
BAD: "Component: toe cap, Descriptor: pointed" (just listing — not natural language)

Return ONLY the prompt text, no JSON, no quotes, no explanation."""

        response = model.generate_content(prompt)
        text = (getattr(response, "text", None) or "").strip().strip('"').strip("'")
        print(f"[compose-edit-prompt] result: {text[:100]}...")
        return {"prompt": text}

    except Exception as e:
        print(f"ERROR in compose_edit_prompt: {e}")
        # Fallback: simple concatenation
        parts = [f"{p['descriptor']} {p['component']}" for p in request.selected_pairs]
        return {"prompt": ", ".join(parts)}


@app.post("/api/agent/compose-prompt")
async def compose_prompt_endpoint(request: ComposePromptRequest):
    """Compose a natural-language prompt from selected tags + brief."""
    if not gemini_api_key:
        raise HTTPException(status_code=500, detail="Gemini API key not configured")
    if not request.selected_tags:
        raise HTTPException(status_code=400, detail="No tags provided")
    try:
        prompt_text = f"""Selected shoe design attributes: {', '.join(request.selected_tags)}
Design brief: {request.brief or 'shoe design'}

Compose ONE clear shoe design prompt (under 25 words) that naturally combines all the attributes.
Write as a descriptive phrase, not a list.

Return JSON ONLY: {{"prompt": "..."}}"""

        model = genai.GenerativeModel('gemini-2.5-flash-lite')
        response = model.generate_content(prompt_text)
        text = (getattr(response, "text", None) or "").strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()

        import json as _json
        data = _json.loads(text)
        return {"prompt": data.get("prompt", ", ".join(request.selected_tags))}
    except Exception as e:
        print(f"ERROR in compose_prompt: {e}")
        return {"prompt": ", ".join(request.selected_tags)}


@app.post("/api/agent/refine-prompt")
async def refine_prompt(request: RefinePromptRequest):
    """AI rewrites the user's prompt, keeping tag terms intact for pill rendering."""
    if not gemini_api_key:
        raise HTTPException(status_code=500, detail="Gemini API key not configured")
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="No prompt provided")

    is_mood_board = request.realm == "mood-board"
    brief = request.brief.strip() or ("Explore shoe design concepts and visual directions" if is_mood_board else "Explore shoe design variations")

    # Build tag list for the system prompt
    tag_list = ""
    if request.tags:
        tag_entries = []
        for t in request.tags:
            src = t.get("source", "")
            txt = t.get("text", "")
            if src:
                tag_entries.append(f'"{txt}" (from {src})')
            else:
                tag_entries.append(f'"{txt}"')
        tag_list = "\nDESIGN TAGS in the prompt: " + ", ".join(tag_entries)

    if is_mood_board:
        prompt_text = f"""You are a creative shoe design mood board and concept art prompt writer. The user wants to generate a SHOE DESIGN STYLE BOARD, CONCEPT SKETCH, or MOOD BOARD — low-fi and conceptual, but always about footwear/shoe design.

DESIGN BRIEF: {brief}
USER PROMPT: {request.prompt}{tag_list}

Rewrite this into an evocative, artistic concept prompt (under 40 words) for a shoe design mood board or style exploration sheet.

CRITICAL RULES:
1. Keep it conceptual and low-fi but always grounded in SHOE/FOOTWEAR design. You can mention shoe parts (sole, upper, toe, heel), silhouettes, and footwear concepts. Think in terms of: mood, shoe silhouette, texture, sole form, upper treatment, color story, gestural energy, material exploration.
2. When a tag has a source attribution (e.g. "bold" (from A), "angular" (from B)), write "@A's bold energy" and "@B's angular tension" — use the @letter possessive form with evocative, conceptual language.
3. If the user already typed @A, @B, @C, @D references, keep them EXACTLY as-is.
4. Keep the EXACT tag phrases intact word-for-word — do NOT rephrase them.
5. PRESERVE the user's original freetext wording as much as possible. Do NOT simplify, shorten, or rewrite their words. Only fix grammar if needed. Never remove details the user wrote — only add context from tags. The designer's voice and intent must come through.
6. The prompt should feel artistic, expressive, and conceptual — like briefing a footwear designer on a shoe concept board.

EXAMPLES:
- "A bold gestural shoe exploration with @A's raw energy and @B's structured sole tension, earth-tone palette"
- "Moody shoe collage of @A's organic upper flow meeting angular heel precision, charcoal and warm amber tones"
- "Abstract shoe material study blending sleek leather surfaces with rugged outsole textures, minimal and powerful"

Return JSON ONLY (no markdown): {{"prompt": "..."}}"""
    elif request.generation_mode == "scratch":
        # No reference images — creating from scratch. No "modify" language.
        prompt_text = f"""You are a design prompt writer for shoe generation. The user is designing a NEW shoe from scratch — there is no reference image to modify.

DESIGN BRIEF: {brief}
USER PROMPT: {request.prompt}{tag_list}

Rewrite this into a vivid, specific generation prompt (under 40 words) that describes the shoe to CREATE.

CRITICAL RULES:
1. Use generative language — "a shoe with...", "design featuring...", "create a...". Never use words like "modify", "update", "adjust", "change", or "restyle".
2. Do NOT use @A or @B labels — there are no reference images.
3. Keep the EXACT tag phrases intact word-for-word — do NOT rephrase them.
4. PRESERVE the user's original freetext wording as much as possible. Do NOT simplify, shorten, or rewrite their words. Only fix grammar if needed. Never remove or condense details the user wrote — their specific descriptions matter.
5. Be specific about the shoe's aesthetic, materials, silhouette, and mood.

EXAMPLES:
- Input: "chunky sole, bright colors" → "A bold sneaker with an exaggerated chunky sole and vivid, high-contrast colorway"
- Input: "minimalist, sleek" → "A clean minimalist sneaker with a sleek silhouette, tonal colorway, and refined proportions"

Return JSON ONLY (no markdown): {{"prompt": "..."}}"""
    elif request.generation_mode == "single-ref":
        # One reference — using it as inspiration to guide an update. Soft, exploratory language.
        prompt_text = f"""You are a design prompt refiner. The user is using a reference shoe as inspiration — they want to explore updates or variations informed by it.

DESIGN BRIEF: {brief}
USER PROMPT: {request.prompt}{tag_list}

Rewrite this into a natural, exploratory prompt (under 40 words) that uses the reference as a starting point.

CRITICAL RULES:
1. Use light, exploratory language — "using this as a reference", "building on", "drawing from", "taking cues from", "informed by". Avoid harsh words like "overhaul" or "drastically change".
2. Do NOT use @A or @B labels — there is only one reference shoe.
3. Keep the EXACT tag phrases intact word-for-word — do NOT rephrase them.
4. PRESERVE the user's original freetext wording as much as possible. Do NOT simplify, shorten, or rewrite their words. Only fix grammar if needed. Never remove or condense details the user wrote — their specific descriptions and vocabulary matter.
5. Make it feel like a natural next step, not a complete redesign.

EXAMPLES:
- Input: "chunkier sole, brighter colors" → "Using this as a reference, update the sole to be chunkier and push the colorway toward something brighter"
- Input: "more minimalist, sleeker" → "Taking cues from the reference, refine the silhouette toward something sleeker and more minimal"

Return JSON ONLY (no markdown): {{"prompt": "..."}}"""
    else:
        # Multiple references — combining elements from several shoes. Use "combine/blend/@A @B" language.
        prompt_text = f"""You are a design prompt refiner. The user has selected descriptor tags from multiple reference images and wants to COMBINE elements from them.

DESIGN BRIEF: {brief}
USER PROMPT: {request.prompt}{tag_list}

Rewrite this into a polished, specific combination prompt (under 40 words).

CRITICAL RULES:
1. When a tag has a source attribution in parentheses (e.g. "formal wear" (from A), "platform sole" (from B)), you MUST write "@A's formal wear" and "@B's platform sole" — use the @letter possessive form to attribute the tag to its source image. This is the most important rule.
2. If the user already typed @A, @B, @C, @D references, keep them EXACTLY as-is — do NOT rephrase or remove them.
3. Keep the EXACT tag phrases intact word-for-word — do NOT rephrase or paraphrase them.
4. PRESERVE the user's original freetext wording as much as possible. Do NOT simplify, shorten, or rewrite their words. Only fix grammar if needed. Never remove or condense details the user wrote — their specific descriptions and vocabulary matter.
5. Use combining language — "fusing", "blending", "merging", "@A's X with @B's Y" — to make clear this draws from multiple sources.

EXAMPLE:
Input prompt: "formal wear, platform sole"
Tags: "formal wear" (from A), "platform sole" (from B)
Output: "Fuse @A's formal wear aesthetic with @B's platform sole into a sleek elevated design"

Return JSON ONLY (no markdown): {{"prompt": "..."}}"""

    try:
        model = genai.GenerativeModel('gemini-2.5-flash-lite')

        # If reference images are provided, include them for multimodal context
        if request.reference_image_ids:
            ref_imgs = [img for img in state.images_metadata if img.id in request.reference_image_ids]
            content = [prompt_text]
            for img in ref_imgs:
                try:
                    resized = img.pil_image.resize((256, 256))
                    content.append(resized)
                except Exception:
                    pass
            response = model.generate_content(content)
        else:
            response = model.generate_content(prompt_text)

        text = (getattr(response, "text", None) or "").strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()

        import json as _json
        data = _json.loads(text)
        return {"prompt": data.get("prompt", request.prompt)}
    except Exception as e:
        print(f"ERROR in refine_prompt: {e}")
        import traceback
        traceback.print_exc()
        return {"prompt": request.prompt}


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
                print(f"  Decoding from data URL...")
                # Extract base64 data from data URL
                # Format: data:image/png;base64,iVBORw0KGgoAAAANS...
                try:
                    if ',' not in url:
                        raise ValueError("Invalid data URL format: missing comma separator")

                    header, encoded = url.split(',', 1)
                    img_bytes = base64.b64decode(encoded)
                    img = Image.open(BytesIO(img_bytes))
                    print(f"  [OK] Image {i+1} decoded (size: {img.size})")
                except Exception as e:
                    print(f"  [ERROR] decoding data URL: {e}")
                    raise HTTPException(status_code=400, detail=f"Failed to decode image {i+1}: {str(e)}")
            elif is_http_url:
                print(f"  Downloading from HTTP URL: {url[:50]}...")
                try:
                    response = requests.get(url, timeout=30)
                    response.raise_for_status()
                    img = Image.open(BytesIO(response.content))
                    print(f"  [OK] Image {i+1} downloaded (size: {img.size})")
                except Exception as e:
                    print(f"  [ERROR] downloading: {e}")
                    raise HTTPException(status_code=400, detail=f"Failed to download image {i+1}: {str(e)}")
            else:
                print(f"  [ERROR] Unsupported URL format: {url[:100]}")
                raise HTTPException(status_code=400, detail=f"Unsupported URL format for image {i+1}: {url[:100]}")

            # Remove background if requested
            if request.remove_background is True:
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                print(f"  Removing background from image {i+1}...")
                img_bytes = BytesIO()
                img.save(img_bytes, format='PNG')
                img_bytes.seek(0)

                output_bytes = remove_background(img_bytes.getvalue())

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
                visible=True,
                realm=request.realm,
                shoe_view=request.shoe_view,
                parent_side_id=request.parent_side_id,
            )
            new_metadata.append(img_meta)
            state.next_id += 1

        state.images_metadata.extend(new_metadata)

        # Incremental projection: only project new images onto current axes (existing images unchanged)
        if len(new_metadata) >= 1:
            if request.precomputed_coordinates and len(request.precomputed_coordinates) >= 2:
                # Use caller-supplied coordinates (e.g. ghost accept — avoids redundant reprojection)
                coords_tuple = tuple(float(c) for c in request.precomputed_coordinates[:2])
                for img_meta in new_metadata:
                    img_meta.coordinates = coords_tuple
                print(f"OK: Using precomputed coordinates {coords_tuple}")
            else:
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
            "images": [image_metadata_to_response(img).model_dump() for img in new_metadata],
            "history_group": {
                "id": history_group.id,
                "type": history_group.type,
                "image_ids": history_group.image_ids,
                "prompt": history_group.prompt,
                "visible": history_group.visible,
                "thumbnail_id": history_group.thumbnail_id,
                "timestamp": history_group.timestamp.isoformat(),
            }
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
    reference_prompts: List[str] = []  # Prompts of reference images currently selected

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

        reference_section = ""
        if request.reference_prompts:
            ref_list = "\n".join(f"- {p}" for p in request.reference_prompts[:6])
            reference_section = f"""
SELECTED REFERENCE IMAGES (user is generating FROM these):
{ref_list}
Suggest prompts that complement, contrast, or creatively extend these references.
"""

        # Structured brief fields section (enhances Gemini context)
        fields_section = ""
        if state.brief_fields:
            fields_section = "\nSTRUCTURED DESIGN PARAMETERS:\n"
            for f in state.brief_fields:
                if f.get("value"):
                    fields_section += f"- {f['label']}: {f['value']}\n"

        prompt = f"""You are a design exploration assistant helping with shoe design.

DESIGN BRIEF:
{request.brief}{fields_section}
{canvas_context}{reference_section}
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

        # Structured brief fields section
        axes_fields_section = ""
        if state.brief_fields:
            axes_fields_section = "\nSTRUCTURED DESIGN PARAMETERS:\n"
            for f in state.brief_fields:
                if f.get("value"):
                    axes_fields_section += f"- {f['label']}: {f['value']}\n"

        prompt = f"""You are a design exploration assistant helping with shoe design.

DESIGN BRIEF:
{request.brief}{axes_fields_section}

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
                    print(f"[OK] Converted X-axis: '{original}' -> '{suggestion['x_axis']}'")

                # Fix y_axis if needed
                if ' - ' not in y_axis:
                    original = y_axis
                    suggestion['y_axis'] = create_bipolar_axis(y_axis)
                    print(f"[OK] Converted Y-axis: '{original}' -> '{suggestion['y_axis']}'")
                
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


def generate_thumbnail_grid() -> Optional[str]:
    """Generate a contact sheet of representative shoes on canvas.

    Uses coordinate-stratified sampling (4x4 grid) to pick up to 16 diverse
    shoes, resizes each to 128x128, pastes onto a dark canvas, and returns
    a base64 JPEG data URI (quality 70, ~30-50KB).

    Returns None if fewer than 4 visible images exist (not enough diversity).
    """
    visible = [img for img in state.images_metadata if img.visible and img.pil_image is not None]
    if len(visible) < 4:
        return None

    # Get coordinate bounds
    coords = [img.coordinates for img in visible]
    xs = [c[0] for c in coords]
    ys = [c[1] for c in coords]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    range_x = max(max_x - min_x, 0.01)
    range_y = max(max_y - min_y, 0.01)

    # Stratified sampling: 4x4 grid, pick nearest image to each cell center
    cols, rows = 4, 4
    cell_w = range_x / cols
    cell_h = range_y / rows
    selected = {}  # (row, col) -> ImageMetadata
    for img in visible:
        ix, iy = img.coordinates
        col_i = min(int((ix - min_x) / cell_w), cols - 1)
        row_i = min(int((iy - min_y) / cell_h), rows - 1)
        key = (row_i, col_i)
        if key not in selected:
            selected[key] = img
        else:
            # Keep the one closer to cell center
            cell_cx = min_x + (col_i + 0.5) * cell_w
            cell_cy = min_y + (row_i + 0.5) * cell_h
            existing = selected[key]
            ex_ix, ex_iy = existing.coordinates
            d_existing = (ex_ix - cell_cx) ** 2 + (ex_iy - cell_cy) ** 2
            d_new = (ix - cell_cx) ** 2 + (iy - cell_cy) ** 2
            if d_new < d_existing:
                selected[key] = img

    chosen = list(selected.values())
    if not chosen:
        return None

    thumb_size = 128
    grid_cols = min(4, len(chosen))
    grid_rows = (len(chosen) + grid_cols - 1) // grid_cols
    canvas_img = Image.new("RGB", (grid_cols * thumb_size, grid_rows * thumb_size), (17, 24, 39))

    for idx, img in enumerate(chosen):
        try:
            thumb = img.pil_image.convert("RGB").resize((thumb_size, thumb_size), Image.LANCZOS)
            col_i = idx % grid_cols
            row_i = idx // grid_cols
            canvas_img.paste(thumb, (col_i * thumb_size, row_i * thumb_size))
        except Exception:
            pass

    buf = BytesIO()
    canvas_img.save(buf, format="JPEG", quality=70)
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"


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
        canvas_screenshot = body.get("canvas_screenshot")  # base64 JPEG of semantic scatter-plot

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

        # Structured brief fields section
        ghosts_fields_section = ""
        if state.brief_fields:
            ghosts_fields_section = "\nStructured design parameters:\n"
            for f in state.brief_fields:
                if f.get("value"):
                    ghosts_fields_section += f"- {f['label']}: {f['value']}\n"

        # Generate thumbnail contact sheet from backend PIL images
        thumbnail_grid = generate_thumbnail_grid()

        # Canvas screenshot visual instruction
        canvas_map_instruction = ""
        if canvas_screenshot or thumbnail_grid:
            canvas_map_instruction = "\nI'm attaching visual context of the current canvas:"
            if canvas_screenshot:
                canvas_map_instruction += "\n- Image 1: scatter-plot showing spatial distribution of all designs (each dot = one shoe)"
            if thumbnail_grid:
                canvas_map_instruction += "\n- Image 2: contact sheet of actual shoe thumbnails currently on canvas"
            canvas_map_instruction += "\nUse both to understand what aesthetic territory is already covered AND where spatial gaps exist. Suggest designs that are visually AND spatially distinct."

        prompt = f"""##ABSOLUTE RULE — READ FIRST##
{_get_shoe_type_constraint()}
Every suggestion MUST strictly match this shoe type. This overrides all other instructions. No exceptions.

You are an AI design partner helping a shoe designer explore their creative space.

Design brief: "{brief}"{ghosts_fields_section}{canvas_map_instruction}

Current semantic canvas axes:
- X-axis: {x_neg} (left) → {x_pos} (right)
- Y-axis: {y_neg} (bottom) → {y_pos} (top)

{gap_context}
{cluster_context}

Based on the design brief and unexplored zones, suggest {num_suggestions} SPECIFIC shoe designs the designer should create next.
Prioritize areas of the semantic canvas that have few or no existing designs — the goal is to EXPAND the design space, not cluster around existing work.

Each suggestion should:
1. Be a concrete, visually descriptive shoe prompt (mention materials, style, color, surface details)
2. Start with the shoe type explicitly (e.g. "A basketball shoe with...")
3. Target a sparse or empty area of the canvas (use the scatter-plot if attached, or the gap descriptions above)
4. Contrast meaningfully with existing clusters — push into new aesthetic territory
5. Be directly generatable by an AI image model

Return EXACTLY {num_suggestions} suggestions as JSON:

{{
  "suggestions": [
    {{
      "prompt": "A specific, vivid shoe design prompt ready for AI generation",
      "reasoning": "One sentence: what gap this fills and why it's worth exploring",
      "target_region": "2-4 word label for the axis region this targets (e.g. 'formal + dark', 'minimal + colorful')",
      "contrasts_with": "One sentence: what existing canvas cluster this contrasts with and why",
      "gap_index": 0
    }}
  ]
}}

Be bold and specific. Push into corners of the design space that are visually empty."""

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

        # Build multimodal content — attach canvas scatter-plot + thumbnail grid
        ghosts_content: list = [prompt]
        if canvas_screenshot:
            try:
                _hdr, _b64 = canvas_screenshot.split(",", 1)
                _img_bytes = base64.b64decode(_b64)
                _canvas_img = Image.open(BytesIO(_img_bytes))
                ghosts_content.append(_canvas_img)
            except Exception:
                pass  # fall back to text-only if screenshot is malformed
        if thumbnail_grid:
            try:
                _hdr2, _b64_2 = thumbnail_grid.split(",", 1)
                _grid_bytes = base64.b64decode(_b64_2)
                _grid_img = Image.open(BytesIO(_grid_bytes))
                ghosts_content.append(_grid_img)
            except Exception:
                pass

        response = model.generate_content(ghosts_content)
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
                "target_region": suggestion.get("target_region"),
                "contrasts_with": suggestion.get("contrasts_with"),
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
            img_bytes_out = remove_background(img_bytes_in.getvalue())
            img = Image.open(BytesIO(img_bytes_out)).convert("RGBA")
            print(f"  [OK] Background removed from ghost image")
        except Exception as rembg_err:
            print(f"  [WARN] rembg failed for ghost ({rembg_err}), keeping original")
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
    canvas_screenshot: Optional[str] = None  # base64 JPEG of semantic scatter-plot

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

        # Build brief + structured fields section
        brief_section = ""
        if request.brief:
            brief_section = f"\nDESIGN BRIEF:\n{request.brief}"
            if state.brief_fields:
                brief_section += "\nStructured parameters:\n"
                for f in state.brief_fields:
                    if f.get("value"):
                        brief_section += f"- {f['label']}: {f['value']}\n"
        axis_x = state.axis_labels.get("x", ["formal", "sporty"])
        axis_y = state.axis_labels.get("y", ["dark", "colorful"])
        axis_info = f"X axis: {axis_x[0]} ↔ {axis_x[1]}, Y axis: {axis_y[0]} ↔ {axis_y[1]}"

        # Extract explicit shoe type constraint (hard rule)
        shoe_type_constraint = _get_shoe_type_constraint()

        # Generate thumbnail contact sheet from backend PIL images
        concurrent_thumbnail_grid = generate_thumbnail_grid()

        # Canvas screenshot context
        canvas_map_instruction = ""
        if request.canvas_screenshot or concurrent_thumbnail_grid:
            canvas_map_instruction = "\nI'm attaching visual context of the current canvas:"
            if request.canvas_screenshot:
                canvas_map_instruction += "\n- Scatter-plot: spatial distribution of all designs (each dot = one shoe)"
            if concurrent_thumbnail_grid:
                canvas_map_instruction += "\n- Contact sheet: actual shoe thumbnails currently on canvas"
            canvas_map_instruction += "\nUse these to pick a direction that is visually AND spatially distinct from what already exists."

        prompt = f"""##ABSOLUTE RULE — READ FIRST##
{shoe_type_constraint}
Every suggestion MUST be this exact shoe type. This overrides all other instructions. No exceptions.

You are a creative design exploration AI for shoe design.

The user just generated a shoe with this prompt:
"{request.user_prompt}"
{brief_section}{canvas_map_instruction}

SEMANTIC AXES (canvas dimensions):
{axis_info}

TASK:
Suggest ONE alternative shoe design that takes a meaningfully different direction within the SAME shoe category AND targets an area of the semantic canvas that is less populated (sparse or empty region).

Guidelines:
1. Contrast meaningfully in style, material, or mood — stay within the same shoe category
2. Be specific and concrete (not generic)
3. Start the prompt with the shoe type (e.g. "A basketball shoe with...")
4. Be under 20 words
5. If a canvas map is attached, look for empty/sparse areas and target those

Return JSON ONLY (no markdown):
{{
  "prompt": "the alternative design prompt",
  "reasoning": "one sentence: what design direction this explores and why it's interesting",
  "your_design_was": "3-6 word description of the user's design direction (style + material + mood)",
  "this_explores": "3-6 word description of what this alternative explores",
  "key_shifts": ["shift1 description", "shift2 description", "shift3 description"]
}}

key_shifts should be 2-3 concise contrasts like "leather → mesh" or "muted → neon". Exactly 2-3 items."""

        model = genai.GenerativeModel("gemini-2.5-flash-lite")

        # Build multimodal content: prompt + reference shoes + canvas map
        content: list = [prompt]
        if request.reference_image_urls:
            for url in request.reference_image_urls[:3]:  # limit to 3 refs
                if url and url.startswith("data:image"):
                    try:
                        header, b64data = url.split(",", 1)
                        img_bytes = base64.b64decode(b64data)
                        pil_img = Image.open(BytesIO(img_bytes)).resize((256, 256))
                        content.append(pil_img)
                    except Exception:
                        pass
        # Attach canvas scatter-plot + thumbnail grid so Gemini sees spatial + visual context
        if request.canvas_screenshot:
            try:
                header, b64data = request.canvas_screenshot.split(",", 1)
                img_bytes = base64.b64decode(b64data)
                canvas_img = Image.open(BytesIO(img_bytes))
                content.append(canvas_img)
            except Exception:
                pass
        if concurrent_thumbnail_grid:
            try:
                header, b64data = concurrent_thumbnail_grid.split(",", 1)
                img_bytes = base64.b64decode(b64data)
                grid_img = Image.open(BytesIO(img_bytes))
                content.append(grid_img)
            except Exception:
                pass
        response = model.generate_content(content)
        text = response.text.strip()

        # Strip markdown if present
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            text = json_match.group(0)

        result = json.loads(text)
        return {
            "prompt": result.get("prompt", f"Alternative to: {request.user_prompt}"),
            "reasoning": result.get("reasoning", "Exploring an adjacent design direction"),
            "your_design_was": result.get("your_design_was"),
            "this_explores": result.get("this_explores"),
            "key_shifts": result.get("key_shifts"),
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


def _import_from_zip(zf: "zipfile.ZipFile") -> dict:
    """Shared ZIP import logic — supports new unified format and legacy format.

    New format (canvas.json present):
      - canvas.json  — identical schema to local save, images have a `filename` field
      - img_*.png    — image pixel data referenced by filename

    Legacy format (export_summary.json present):
      - export_summary.json  — canvas-level metadata
      - img_*.png / img_*.json — per-image pixel + metadata pairs

    Returns dict with keys: images_loaded, groups_loaded, design_brief.
    """
    import io as _io
    from models.data_structures import HistoryGroup

    namelist = zf.namelist()

    # ── New unified canvas.json path ──────────────────────────────────────────
    if "canvas.json" in namelist:
        print("[import] Unified canvas.json format detected")
        data = json.loads(zf.read("canvas.json"))
        # Replace filename references with inline base64 so _deserialize_canvas works unchanged
        valid_images = []
        for img_data in data.get("images", []):
            fname = img_data.get("filename", "")
            if fname and fname in namelist:
                png_bytes = zf.read(fname)
                img_data["base64_image"] = (
                    "data:image/png;base64," + base64.b64encode(png_bytes).decode()
                )
                valid_images.append(img_data)
            else:
                print(f"  [WARN] PNG '{fname}' not found in ZIP, skipping image {img_data.get('id')}")
        data["images"] = valid_images
        # Layer state lives outside _deserialize_canvas — restore it first
        state.layer_definitions = data.get("layerDefinitions", state.layer_definitions)
        state.image_layer_map = {int(k): v for k, v in data.get("imageLayerMap", {}).items()}
        _deserialize_canvas(data)
        # Re-project coordinates using restored axis labels if models are ready
        if state.images_metadata and state.embedder and state.axis_builder:
            state._axis_directions_cache = None
            emb_matrix = np.array([img.embedding for img in state.images_metadata])
            new_coords = project_embeddings_to_coordinates(emb_matrix, use_3d=False)
            for i, img in enumerate(state.images_metadata):
                img.coordinates = (float(new_coords[i][0]), float(new_coords[i][1]))
        print(f"[OK] Import (canvas.json): {len(state.images_metadata)} images, {len(state.history_groups)} groups")
        return {
            "images_loaded": len(state.images_metadata),
            "groups_loaded": len(state.history_groups),
            "design_brief": state.design_brief,
        }

    # ── Legacy format ─────────────────────────────────────────────────────────
    if "export_summary.json" not in namelist:
        raise HTTPException(status_code=400, detail="ZIP must contain canvas.json or export_summary.json")

    print("[import] Legacy export_summary.json format detected")
    summary = json.loads(zf.read("export_summary.json"))

    axis_raw = summary.get("axis_labels", {})
    new_axis_labels = {k: tuple(v) if isinstance(v, list) else v for k, v in axis_raw.items()}
    if not new_axis_labels:
        new_axis_labels = state.axis_labels

    history_groups_raw = summary.get("history_groups", [])
    layer_defs = summary.get("layer_definitions", state.layer_definitions)
    img_layer_map_raw = summary.get("image_layer_map", {})
    design_brief = summary.get("design_brief", None)

    # Build index of per-image JSON/PNG pairs
    png_map: Dict[str, bytes] = {}
    json_map: Dict[str, dict] = {}
    for name in namelist:
        stem, ext = name.rsplit(".", 1) if "." in name else (name, "")
        if ext.lower() == "png" and stem.startswith("img_"):
            png_map[stem] = zf.read(name)
        elif ext.lower() == "json" and stem.startswith("img_"):
            json_map[stem] = json.loads(zf.read(name))

    new_images: List[ImageMetadata] = []
    max_id = 0
    for stem, meta in json_map.items():
        if stem not in png_map:
            print(f"  [WARN] No PNG for {stem}, skipping")
            continue
        img_id = meta.get("id", 0)
        max_id = max(max_id, img_id)
        pil_img = Image.open(_io.BytesIO(png_map[stem])).convert("RGBA")
        embedding_list = meta.get("embedding", None)
        embedding = np.array(embedding_list, dtype=np.float32) if embedding_list else np.zeros(1024, dtype=np.float32)
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
            visible=meta.get("visible", True),
            is_ghost=meta.get("is_ghost", False),
            suggested_prompt=meta.get("suggested_prompt", ""),
            reasoning=meta.get("reasoning", ""),
            realm=meta.get("realm", "shoe"),
            shoe_view=meta.get("shoe_view", "side"),
            parent_side_id=meta.get("parent_side_id", -1),
        ))

    if not new_images:
        raise HTTPException(status_code=400, detail="No valid images found in ZIP")

    if state.embedder and state.axis_builder:
        state.axis_labels = new_axis_labels
        state._axis_directions_cache = None
        emb_matrix = np.array([img.embedding for img in new_images])
        new_coords = project_embeddings_to_coordinates(emb_matrix, use_3d=False)
        for i, img in enumerate(new_images):
            img.coordinates = (float(new_coords[i][0]), float(new_coords[i][1]))
    else:
        state.axis_labels = new_axis_labels

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
            visible=hg.get("visible", True),
            thumbnail_id=hg.get("thumbnail_id", None),
            timestamp=ts_hg,
        ))

    state.images_metadata = sorted(new_images, key=lambda x: x.id)
    state.history_groups = new_history
    state.next_id = max_id + 1
    state.image_layer_map = {int(k): v for k, v in img_layer_map_raw.items()}
    state.layer_definitions = layer_defs
    if design_brief is not None:
        state.design_brief = design_brief

    print(f"[OK] Import (legacy): {len(new_images)} images, {len(new_history)} groups")
    return {
        "images_loaded": len(new_images),
        "groups_loaded": len(new_history),
        "design_brief": state.design_brief,
    }


@app.post("/api/import-zip")
async def import_zip_canvas(file: UploadFile = File(...)):
    """Restore a canvas from a previously exported ZIP file.

    Supports two formats:
    - New unified format: canvas.json + img_*.png
    - Legacy format: export_summary.json + img_*.png + img_*.json
    """
    import io as _io
    try:
        zip_bytes = await file.read()
        with zipfile.ZipFile(_io.BytesIO(zip_bytes)) as zf:
            result = _import_from_zip(zf)
        await broadcast_state_update()
        return {"status": "ok", **result}
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR in import-zip: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/import-starter")
async def import_starter_canvas():
    """Load the onboarding template for new participants.

    Checks for template.json first (plain JSON, preferred), then falls back
    to starter.zip. Returns 404 if neither exists (graceful fallback).
    """
    import io as _io
    starter_dir = Path(__file__).parent / "data" / "starter"

    # Preferred: plain JSON template (saved via /api/sessions/save-as-template)
    template_path = starter_dir / "template.json"
    if template_path.exists():
        try:
            data = json.loads(template_path.read_text(encoding="utf-8"))
            _deserialize_canvas(data)
            # Assign fresh canvas ID so the template isn't overwritten on save
            state.current_canvas_id = str(_uuid.uuid4())
            state.event_log = []  # clean slate
            _open_event_log()
            await broadcast_state_update()
            return {
                "status": "ok",
                "images_loaded": len(state.images_metadata),
                "groups_loaded": len(state.history_groups),
                "design_brief": state.design_brief,
            }
        except Exception as e:
            print(f"ERROR loading template.json: {e}")
            import traceback
            traceback.print_exc()
            # Fall through to starter.zip

    # Fallback: legacy starter.zip
    starter_path = starter_dir / "starter.zip"
    if not starter_path.exists():
        raise HTTPException(status_code=404, detail="No onboarding template found")
    try:
        zip_bytes = starter_path.read_bytes()
        with zipfile.ZipFile(_io.BytesIO(zip_bytes)) as zf:
            result = _import_from_zip(zf)
        await broadcast_state_update()
        return {"status": "ok", **result}
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR in import-starter: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/sessions/save-as-template")
async def save_as_template():
    """Save current canvas as the onboarding template (plain JSON, no zip).

    Saves to backend/data/starter/template.json. New canvases auto-import
    this template via /api/import-starter when empty.
    """
    try:
        template_dir = DATA_DIR / "starter"
        template_dir.mkdir(parents=True, exist_ok=True)
        data = _serialize_canvas()
        path = template_dir / "template.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, cls=_NumpyEncoder)
        print(f"[save-as-template] Saved to {path} ({len(state.images_metadata)} images)")
        return {"status": "ok", "path": str(path), "images": len(state.images_metadata)}
    except Exception as e:
        print(f"ERROR in save-as-template: {e}")
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
            # img_id -> png filename stem (used when building canvas.json)
            img_filename_map: Dict[int, str] = {}
            for img_meta in visible_images:
                # Create timestamp-based filename
                timestamp_str = img_meta.timestamp.strftime("%Y%m%d_%H%M%S_%f")[:-3]  # Remove last 3 digits of microseconds
                filename = f"img_{img_meta.id}_{timestamp_str}"
                img_filename_map[img_meta.id] = filename

                # Save image as PNG
                img_path = temp_path / f"{filename}.png"
                img_meta.pil_image.save(img_path, format="PNG")
                saved_count += 1
                if saved_count % 10 == 0:
                    print(f"  Saved {saved_count}/{len(visible_images)} images...")

                # Legacy per-image metadata JSON (kept for backward compat with old importers)
                legacy_metadata = {
                    "id": img_meta.id,
                    "group_id": img_meta.group_id,
                    "prompt": img_meta.prompt,
                    "generation_method": img_meta.generation_method,
                    "timestamp": img_meta.timestamp.isoformat(),
                    "coordinates": list(img_meta.coordinates),
                    "parents": img_meta.parents,
                    "children": img_meta.children,
                    "reference_ids": img_meta.reference_ids,
                    "visible": img_meta.visible,
                    "is_ghost": img_meta.is_ghost,
                    "suggested_prompt": img_meta.suggested_prompt,
                    "reasoning": img_meta.reasoning,
                    "embedding": img_meta.embedding.tolist(),
                }

                json_path = temp_path / f"{filename}.json"
                with open(json_path, 'w', encoding='utf-8') as f:
                    json.dump(legacy_metadata, f, indent=2, ensure_ascii=False)

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

            # ── Unified canvas.json (mirrors local save format, filename ref instead of base64) ──
            canvas_images_data = []
            for img_meta in visible_images:
                ts = img_meta.timestamp.isoformat()
                filename = img_filename_map[img_meta.id]
                canvas_images_data.append({
                    "id": img_meta.id,
                    "group_id": img_meta.group_id,
                    "filename": f"{filename}.png",  # PNG in same ZIP, no base64 here
                    "embedding": img_meta.embedding.tolist(),
                    "coordinates": [float(x) for x in img_meta.coordinates],
                    "parents": img_meta.parents,
                    "children": img_meta.children,
                    "reference_ids": img_meta.reference_ids,
                    "generation_method": img_meta.generation_method,
                    "prompt": img_meta.prompt,
                    "timestamp": ts,
                    "visible": img_meta.visible,
                    "is_ghost": img_meta.is_ghost,
                    "suggested_prompt": img_meta.suggested_prompt,
                    "reasoning": img_meta.reasoning,
                    "realm": getattr(img_meta, 'realm', 'shoe'),
                    "shoe_view": getattr(img_meta, 'shoe_view', 'side'),
                    "parent_side_id": getattr(img_meta, 'parent_side_id', -1),
                })
            canvas_history_data = []
            for hg in state.history_groups:
                ts = hg.timestamp.isoformat() if isinstance(hg.timestamp, datetime) else str(hg.timestamp)
                canvas_history_data.append({
                    "id": hg.id,
                    "type": hg.type,
                    "image_ids": hg.image_ids,
                    "prompt": hg.prompt,
                    "visible": hg.visible,
                    "thumbnail_id": hg.thumbnail_id,
                    "timestamp": ts,
                })
            canvas_doc = {
                "id": state.current_canvas_id,
                "name": state.canvas_name,
                "participantId": state.participant_id,
                "createdAt": state.canvas_created_at,
                "updatedAt": datetime.now().isoformat(),
                "parentCanvasId": state.parent_canvas_id,
                "sharedImageIds": state.shared_image_ids,
                "axisLabels": {k: list(v) for k, v in state.axis_labels.items()},
                "designBrief": state.design_brief,
                "briefFields": state.brief_fields,
                "briefInterpretation": state.brief_interpretation,
                "briefSuggestedParams": state.brief_suggested_params,
                "nextId": state.next_id,
                "layerDefinitions": state.layer_definitions,
                "imageLayerMap": {str(k): v for k, v in state.image_layer_map.items()},
                "images": canvas_images_data,
                "historyGroups": canvas_history_data,
                "eventLog": state.event_log,
            }
            canvas_path = temp_path / "canvas.json"
            print("Writing unified canvas.json...")
            with open(canvas_path, 'w', encoding='utf-8') as f:
                json.dump(canvas_doc, f, ensure_ascii=False, cls=_NumpyEncoder)

            # ── Legacy export_summary.json (kept for old importers / human inspection) ──
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
                        "visible": g.visible,
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
            print("Writing legacy export_summary.json...")
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
        _close_event_log()
        # Save current canvas first
        _save_canvas_to_disk()
        # Find and load the requested canvas
        path = _find_session_file(state.participant_id, request.canvas_id)
        if not path:
            raise HTTPException(status_code=404, detail=f"Canvas {request.canvas_id} not found")
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        _deserialize_canvas(data)
        _open_event_log()
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
        _close_event_log()
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
        _open_event_log()
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
        _close_event_log()
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
        _open_event_log()

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
    path = _find_session_file(state.participant_id, request.canvas_id)
    if not path:
        raise HTTPException(status_code=404, detail=f"Canvas {request.canvas_id} not found")
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


class SetStudySessionRequest(BaseModel):
    name: str


@app.post("/api/session/set-study-name")
async def set_study_session_name(request: SetStudySessionRequest):
    """Set the study session identifier (prefixed to all saved filenames)."""
    old_name = state.study_session_name
    state.study_session_name = request.name.strip()
    # Reopen event log with new prefix if name changed
    if state.study_session_name != old_name and state.event_log_path:
        _close_event_log()
        _open_event_log()
    return {"studySessionName": state.study_session_name}


@app.get("/api/session/study-name")
async def get_study_session_name():
    """Get the current study session name."""
    return {"studySessionName": state.study_session_name}


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
    """Append an event to the current canvas event log (fire-and-forget).

    Writes to both the in-memory list (included in canvas JSON auto-save)
    and the dedicated JSONL event log file.
    """
    entry = {
        "type": request.type,
        "timestamp": datetime.now().isoformat(),
        "data": request.data or {},
    }
    state.event_log.append(entry)
    _log_event_to_file(entry)
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


# ─── Static file serving (production: serve built React app) ───
_frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
print(f"[SPA] Looking for frontend dist at: {_frontend_dist}")
print(f"[SPA] Exists: {_frontend_dist.is_dir()}")
if _frontend_dist.is_dir():
    _index_html = _frontend_dist / "index.html"
    _assets_dir = _frontend_dist / "assets"
    print(f"[SPA] index.html exists: {_index_html.is_file()}")
    print(f"[SPA] assets/ exists: {_assets_dir.is_dir()}")

    if _assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="static-assets")

    # SPA fallback: any non-API route returns index.html
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = _frontend_dist / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(_index_html))
else:
    print(f"[SPA] WARNING: frontend dist not found! Contents of parent: {list((_frontend_dist.parent).iterdir()) if _frontend_dist.parent.is_dir() else 'parent missing'}")

@app.get("/api/debug/spa")
async def debug_spa():
    """Debug endpoint to check frontend dist status."""
    return {
        "frontend_dist": str(_frontend_dist),
        "exists": _frontend_dist.is_dir(),
        "index_html": (_frontend_dist / "index.html").is_file() if _frontend_dist.is_dir() else False,
        "contents": [str(f.name) for f in _frontend_dist.iterdir()] if _frontend_dist.is_dir() else [],
    }


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
            print(f"[WARN] Invalid BACKEND_PORT/PORT value '{env_port}', falling back to auto-detected port.")
            port = find_free_port(8000)
    else:
        port = find_free_port(8000)

    print(f"🚀 Starting Zappos Semantic Explorer backend on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
