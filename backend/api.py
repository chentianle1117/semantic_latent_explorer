"""FastAPI backend for Zappos Semantic Explorer."""

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Request
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
from fastapi.responses import FileResponse, StreamingResponse
import google.generativeai as genai
from dotenv import load_dotenv
import re
import socket
from sklearn.neighbors import NearestNeighbors

# Load environment variables
load_dotenv()

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
from models import CLIPEmbedder, SemanticAxisBuilder
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

state = AppState()


def pil_to_base64(pil_image: Image.Image) -> str:
    """Convert PIL image to base64 string."""
    buffered = BytesIO()
    # Save as PNG to preserve transparency if present
    pil_image.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()
    return img_str


def project_embeddings_to_coordinates(embeddings: np.ndarray, use_3d: bool = None) -> np.ndarray:
    """
    Project embeddings onto semantic axes to get 2D or 3D coordinates.
    Uses current axis labels to create semantic directions.

    Args:
        embeddings: Image embeddings (N, embedding_dim)
        use_3d: If True, use 3D projection. If None, use state.is_3d_mode

    Returns:
        Array of shape (N, 2) or (N, 3) depending on mode
    """
    if state.axis_builder is None or state.embedder is None:
        raise RuntimeError("Models not initialized")

    # Determine 3D mode
    if use_3d is None:
        use_3d = state.is_3d_mode

    # Build semantic axes from current labels
    x_axis = state.axis_builder.create_clip_text_axis(
        f"shoe that is {state.axis_labels['x'][1]}",  # positive
        f"shoe that is {state.axis_labels['x'][0]}"   # negative
    )
    y_axis = state.axis_builder.create_clip_text_axis(
        f"shoe that is {state.axis_labels['y'][1]}",  # positive
        f"shoe that is {state.axis_labels['y'][0]}"   # negative
    )

    # Project embeddings onto axes
    x_coords = embeddings @ x_axis.direction
    y_coords = embeddings @ y_axis.direction

    # If 3D mode, add z-axis projection
    if use_3d and 'z' in state.axis_labels:
        z_axis = state.axis_builder.create_clip_text_axis(
            f"shoe that is {state.axis_labels['z'][1]}",  # positive
            f"shoe that is {state.axis_labels['z'][0]}"   # negative
        )
        z_coords = embeddings @ z_axis.direction
        coords = np.column_stack([x_coords, y_coords, z_coords])
    else:
        coords = np.column_stack([x_coords, y_coords])

    # Center projections at origin (ensures canvas auto-centering after axis updates)
    coords -= coords.mean(axis=0)
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
            "images": [image_metadata_to_response(img, neighbor_map).dict() for img in visible_metadata],
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
            "neighbor_map": neighbor_map  # K-nearest neighbors for physics simulation
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
        neighbor_map=neighbor_map  # K-nearest neighbors for physics simulation
    )


@app.post("/api/initialize-clip-only")
async def initialize_clip_only():
    """Initialize only CLIP embedder (for fal.ai mode)."""
    try:
        if state.embedder is None:
            print("Loading CLIP embedder...")
            state.embedder = CLIPEmbedder()
            print("CLIP loaded successfully")

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
        print(f"\n=== Updating Semantic Axes ===")
        print(f"X: {request.x_negative} → {request.x_positive}")
        print(f"Y: {request.y_negative} → {request.y_positive}")

        # Update axis labels (always allowed, even if models not initialized)
        state.axis_labels['x'] = (request.x_negative, request.x_positive)
        state.axis_labels['y'] = (request.y_negative, request.y_positive)

        # Update z-axis if provided
        if request.z_positive and request.z_negative:
            print(f"Z: {request.z_negative} → {request.z_positive}")
            state.axis_labels['z'] = (request.z_negative, request.z_positive)

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

            # Convert to RGB if needed
            if img.mode != 'RGB':
                img = img.convert('RGB')

            # Remove background if requested
            if request.remove_background is True:
                print(f"  Removing background from image {i+1}...")
                # Convert PIL image to bytes
                img_bytes = BytesIO()
                img.save(img_bytes, format='PNG')
                img_bytes.seek(0)

                # Remove background
                output_bytes = remove(img_bytes.getvalue())

                # Convert back to PIL image with transparency
                img = Image.open(BytesIO(output_bytes))
                # Keep as RGBA to preserve transparency
                if img.mode != 'RGBA':
                    img = img.convert('RGBA')
                print(f"  OK: Background removed from image {i+1} (transparent)")
            else:
                # Ensure RGB mode if not removing background
                if img.mode == 'RGBA':
                    # Convert RGBA to RGB with white background
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    background.paste(img, mask=img.split()[3])
                    img = background

            pil_images.append(img)

        # Extract embeddings
        print("Extracting CLIP embeddings...")
        embeddings = state.embedder.extract_image_embeddings_from_pil(pil_images)
        print("OK: Embeddings extracted")

        # Project embeddings onto semantic axes (for new images only, then reproject all for layout)
        print("Projecting onto semantic axes...")
        coords = project_embeddings_to_coordinates(embeddings)
        print(f"OK: Coordinates calculated: {coords.shape}")

        # Create ImageMetadata objects
        group_id = f"{request.generation_method}_{len(state.history_groups)}"
        new_metadata = []

        for i, (img, emb, coord) in enumerate(zip(pil_images, embeddings, coords)):
            img_meta = ImageMetadata(
                id=state.next_id,
                group_id=group_id,
                pil_image=img,
                embedding=emb,
                coordinates=tuple(float(c) for c in coord),  # Support 2D or 3D
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

        # Reproject ALL images whenever we encode new images
        if len(state.images_metadata) >= 1:
            print("Recalculating positions...")
            all_embeddings = np.array([img.embedding for img in state.images_metadata])
            all_coords = project_embeddings_to_coordinates(all_embeddings, use_3d=state.is_3d_mode)
            # Grid snapping disabled - using semantic projection directly
            for i, img_meta in enumerate(state.images_metadata):
                img_meta.coordinates = tuple(float(c) for c in all_coords[i])
            print("OK: Positions recalculated")
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
            "images": [image_metadata_to_response(img).dict() for img in new_metadata]
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


class InitialPromptsRequest(BaseModel):
    brief: str

@app.post("/api/agent/initial-prompts")
async def get_initial_prompts(request: InitialPromptsRequest):
    """Generate initial prompt suggestions based on design brief"""
    try:
        if not gemini_api_key:
            raise HTTPException(status_code=500, detail="Gemini API key not configured")

        print(f"\n=== Initial Prompts Request ===")
        print(f"Brief: {request.brief}")

        prompt = f"""You are a design exploration assistant helping with shoe design.

DESIGN BRIEF:
{request.brief}

TASK:
Suggest 3 specific, diverse prompts to start exploring this design space.
Each prompt should:
1. Be specific and detailed (not generic)
2. Cover different aspects of the brief
3. Be ready to use with an image generation model

Return JSON ONLY (no markdown, no explanation):
{{
  "prompts": [
    {{"prompt": "minimal white leather sneaker with clean lines", "reasoning": "Explores minimalism aspect"}},
    {{"prompt": "chunky athletic running shoe in bright colors", "reasoning": "Explores sporty/bold direction"}},
    {{"prompt": "sleek low-profile canvas casual shoe", "reasoning": "Explores everyday wearability"}}
  ]
}}"""

        # Using gemini-2.5-flash-lite (fast, low-cost, high-performance)
        # Note: gemini-1.5-flash was retired in April 2025
        model = genai.GenerativeModel('gemini-2.5-flash-lite')
        response = model.generate_content(prompt)

        # Parse JSON from response
        json_match = re.search(r'\{[\s\S]*\}', response.text)
        if json_match:
            result = json.loads(json_match.group(0))
            print(f"Generated {len(result.get('prompts', []))} initial prompts")
            return result

        # Fallback if parsing fails
        return {"prompts": [
            {"prompt": "minimal athletic sneaker", "reasoning": "Starting point"},
            {"prompt": "classic leather shoe", "reasoning": "Alternative style"},
            {"prompt": "modern running shoe", "reasoning": "Third direction"}
        ]}

    except Exception as e:
        print(f"ERROR in initial-prompts: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


class AnalyzeCanvasRequest(BaseModel):
    brief: str

@app.post("/api/agent/analyze-canvas")
async def analyze_canvas(request: AnalyzeCanvasRequest):
    """Analyze canvas and suggest exploration regions"""
    try:
        if not gemini_api_key:
            raise HTTPException(status_code=500, detail="Gemini API key not configured")

        print(f"\n=== Analyze Canvas Request ===")
        print(f"Brief: {request.brief}")

        # Get canvas digest
        digest = await get_canvas_digest()

        if digest["count"] == 0:
            return {"regions": []}

        print(f"Canvas has {digest['count']} images in {len(digest['clusters'])} clusters")

        # Build pre-computed regions from algorithmic detection
        # Clusters: use exact centers and ellipses from digest
        # Gaps: use algorithmically detected empty areas from digest
        precomputed_regions = []

        db = digest.get('bounds', {"x": [0, 1], "y": [0, 1]})
        dx_range = db["x"][1] - db["x"][0] if db["x"][1] != db["x"][0] else 1.0
        dy_range = db["y"][1] - db["y"][0] if db["y"][1] != db["y"][0] else 1.0

        for c in digest['clusters']:
            precomputed_regions.append({
                "data_center": c['center'],  # actual data coords for frontend positioning
                "normalized_center": c['normalized_center'],  # for Gemini semantic context
                "type": "cluster",
                "size": c['size'],
                "sample_prompts": c['sample_prompts'][:2],
                "ellipse": c.get('ellipse', {"rx": 0.1, "ry": 0.08, "angle": 0})
            })

        for g in digest.get('gaps', []):
            # Convert gap normalized center to actual data coordinates
            gap_data_x = db["x"][0] + g['center'][0] * dx_range
            gap_data_y = db["y"][0] + g['center'][1] * dy_range
            precomputed_regions.append({
                "data_center": [gap_data_x, gap_data_y],  # actual data coords
                "normalized_center": g['center'],  # for Gemini semantic context
                "type": "gap",
                "neighbor_density": g['neighbor_density'],
                "ellipse": g.get('ellipse', {"rx": 0.08, "ry": 0.06, "angle": 0})
            })

        # Build Gemini-facing summary (uses normalized coords for semantic interpretation)
        gemini_regions = []
        for r in precomputed_regions:
            gr = {"normalized_center": r["normalized_center"], "type": r["type"]}
            if "size" in r: gr["size"] = r["size"]
            if "sample_prompts" in r: gr["sample_prompts"] = r["sample_prompts"]
            gemini_regions.append(gr)

        # Format for Gemini — ask it only to NAME and DESCRIBE, not guess coordinates
        prompt = f"""You are a design exploration assistant. Name and describe pre-computed regions on a shoe design canvas.

DESIGN BRIEF:
{request.brief}

AXES:
- X-Axis: {digest['axis_labels']['x'][0]} (left/0.0) to {digest['axis_labels']['x'][1]} (right/1.0)
- Y-Axis: {digest['axis_labels']['y'][0]} (bottom/0.0) to {digest['axis_labels']['y'][1]} (top/1.0)

PRE-COMPUTED REGIONS (coordinates are algorithmically determined — do NOT change them):
{json.dumps(gemini_regions, indent=2)}

TASK:
For each region above (in order), provide a short title, 1-sentence description, and 1-2 specific shoe prompts.
Use the axis labels to interpret what each [x, y] coordinate means semantically.
Keep titles under 5 words. Keep descriptions under 15 words.

Return JSON ONLY (no markdown):
{{
  "regions": [
    {{
      "index": 0,
      "title": "Short Title",
      "description": "Brief description",
      "suggested_prompts": ["specific shoe prompt"]
    }}
  ]
}}"""

        model = genai.GenerativeModel('gemini-2.5-flash-lite')
        response = model.generate_content(prompt)

        # Parse JSON and merge Gemini names with precomputed geometry
        json_match = re.search(r'\{[\s\S]*\}', response.text)
        final_regions = []
        if json_match:
            try:
                result = json.loads(json_match.group(0))
                gemini_output = result.get('regions', [])
                for i, precomp in enumerate(precomputed_regions):
                    # Find matching Gemini output by index
                    gemini_r = next((g for g in gemini_output if g.get('index') == i), None)
                    if not gemini_r and i < len(gemini_output):
                        gemini_r = gemini_output[i]
                    final_regions.append({
                        "center": precomp["data_center"],  # actual data coords
                        "type": precomp["type"],
                        "title": gemini_r.get("title", f"Region {i+1}") if gemini_r else f"Region {i+1}",
                        "description": gemini_r.get("description", "") if gemini_r else "",
                        "suggested_prompts": gemini_r.get("suggested_prompts", precomp.get("sample_prompts", ["shoe design"])) if gemini_r else precomp.get("sample_prompts", ["shoe design"]),
                        "ellipse": precomp["ellipse"]
                    })
            except (json.JSONDecodeError, KeyError):
                pass

        # Fallback if Gemini parsing failed
        if not final_regions:
            for i, r in enumerate(precomputed_regions):
                final_regions.append({
                    "center": r["data_center"],
                    "type": r["type"],
                    "title": f"{'Cluster' if r['type'] == 'cluster' else 'Gap'} {i+1}",
                    "description": f"{'Existing group' if r['type'] == 'cluster' else 'Unexplored area'}",
                    "suggested_prompts": r.get("sample_prompts", ["shoe design variation"]),
                    "ellipse": r.get("ellipse", {"rx": 0.08, "ry": 0.06, "angle": 0})
                })

        print(f"Generated {len(final_regions)} region suggestions")
        return {"regions": final_regions}

    except Exception as e:
        print(f"ERROR in analyze-canvas: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


class AnalyzePreferencesRequest(BaseModel):
    brief: str

@app.post("/api/agent/analyze-preferences")
async def analyze_preferences(request: AnalyzePreferencesRequest):
    """Analyze user's exploration patterns and preferences"""
    try:
        if not gemini_api_key:
            raise HTTPException(status_code=500, detail="Gemini API key not configured")

        print(f"\n=== Analyze Preferences Request ===")
        print(f"Brief: {request.brief}")

        # Get canvas digest
        digest = await get_canvas_digest()

        if digest['count'] == 0:
            return {
                "preferences": {
                    "favored_attributes": [],
                    "avoided_attributes": [],
                    "exploration_style": "Getting started"
                },
                "trajectory": {
                    "current_focus": "No images yet",
                    "trends": []
                },
                "statistics": {
                    "total_images": 0,
                    "cluster_distribution": {}
                }
            }

        # Collect prompts from all clusters
        all_prompts = []
        cluster_sizes = {}
        for cluster in digest['clusters']:
            all_prompts.extend(cluster['sample_prompts'])
            cluster_sizes[cluster['id']] = cluster['size']

        prompt_analysis = f"""You are a design exploration analyst helping understand user preferences.

DESIGN BRIEF:
{request.brief}

EXPLORATION DATA:
- Total images: {digest['count']}
- Number of clusters: {len(digest['clusters'])}
- Sample prompts: {', '.join(all_prompts[:15])}
- Cluster sizes: {cluster_sizes}

TASK:
Analyze the user's exploration patterns and infer their preferences.

Return JSON ONLY (no markdown):
{{
  "preferences": {{
    "favored_attributes": ["Minimalist designs", "Light colors", "Clean lines"],
    "avoided_attributes": ["Heavy ornamentation", "Dark colors"],
    "exploration_style": "Focused on specific aesthetic"
  }},
  "trajectory": {{
    "current_focus": "Exploring minimalist white sneakers with subtle variations",
    "trends": ["Moving toward simpler designs", "Consistent color palette"]
  }},
  "statistics": {{
    "total_images": {digest['count']},
    "cluster_distribution": {json.dumps(cluster_sizes)},
    "dominant_themes": ["Minimalism", "White colorways"]
  }}
}}"""

        model = genai.GenerativeModel('gemini-2.5-flash-lite')
        response = model.generate_content(prompt_analysis)

        # Parse JSON
        json_match = re.search(r'\{[\s\S]*\}', response.text)
        if json_match:
            result = json.loads(json_match.group(0))
            print(f"Analyzed preferences for {digest['count']} images")
            return result

        # Fallback
        return {
            "preferences": {
                "favored_attributes": ["Contemporary"],
                "avoided_attributes": [],
                "exploration_style": "Broad exploration"
            },
            "trajectory": {
                "current_focus": "Exploring various styles",
                "trends": ["Diverse exploration"]
            },
            "statistics": {
                "total_images": digest['count'],
                "cluster_distribution": cluster_sizes
            }
        }

    except Exception as e:
        print(f"ERROR in analyze-preferences: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


class ExtractParametersRequest(BaseModel):
    brief: str

@app.post("/api/agent/extract-parameters")
async def extract_parameters(request: ExtractParametersRequest):
    """Extract design parameters from brief"""
    try:
        if not gemini_api_key:
            raise HTTPException(status_code=500, detail="Gemini API key not configured")

        print(f"\n=== Extract Parameters Request ===")
        print(f"Brief: {request.brief}")

        # Get canvas digest for context
        digest = await get_canvas_digest()
        
        # Get sample prompts from canvas if available
        sample_prompts = []
        if digest['count'] > 0:
            for cluster in digest['clusters'][:3]:
                sample_prompts.extend(cluster['sample_prompts'][:2])

        prompt = f"""You are a design analysis assistant helping with shoe design.

DESIGN BRIEF:
{request.brief}

CURRENT EXPLORATION:
- Total images: {digest['count']}
- Sample prompts: {', '.join(sample_prompts) if sample_prompts else 'None yet'}

TASK:
Extract structured design parameters from the brief and current exploration.
Identify key attributes that define the design space being explored.

Return JSON ONLY (no markdown):
{{
  "type": ["Running", "Casual", "Athletic"],
  "inspiration": ["Minimalist", "Modern", "Retro"],
  "materials": ["Leather", "Canvas", "Mesh"],
  "colors": ["White", "Black", "Blue accents"],
  "style_keywords": ["Clean lines", "Bold", "Performance"],
  "last_updated": "{json.dumps(sample_prompts) if sample_prompts else 'Initial extraction'}"
}}"""

        model = genai.GenerativeModel('gemini-2.5-flash-lite')
        response = model.generate_content(prompt)

        # Parse JSON
        json_match = re.search(r'\{[\s\S]*\}', response.text)
        if json_match:
            result = json.loads(json_match.group(0))
            print(f"Extracted parameters: {list(result.keys())}")
            return result

        # Fallback
        return {
            "type": ["Sneaker"],
            "inspiration": ["Modern"],
            "materials": ["Mixed"],
            "colors": ["Various"],
            "style_keywords": ["Contemporary"],
            "last_updated": "Fallback"
        }

    except Exception as e:
        print(f"ERROR in extract-parameters: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


class SuggestAxesRequest(BaseModel):
    brief: str
    current_x_axis: str
    current_y_axis: str

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

@app.post("/api/agent/generate-variation")
async def generate_variation(request: GenerateVariationRequest):
    """Generate alternative prompt variations to avoid design fixation"""
    try:
        if not gemini_api_key:
            raise HTTPException(status_code=500, detail="Gemini API key not configured")

        print(f"\n=== Generate Variation Request ===")
        print(f"Original prompt: {request.original_prompt}")
        print(f"Brief: {request.brief}")
        print(f"Num variations: {request.num_variations}")

        prompt = f"""You are a design exploration assistant helping with shoe design.

DESIGN BRIEF:
{request.brief}

USER'S CURRENT PROMPT:
{request.original_prompt}

TASK:
Generate {request.num_variations} alternative prompts that:
1. Are RELATED to the user's prompt but explore DIFFERENT design directions
2. Help avoid design fixation by introducing diversity
3. Stay within the scope of the design brief
4. Are specific enough for image generation

The variations should explore different aspects like:
- Different materials
- Different color schemes
- Different silhouettes or forms
- Different style inspirations

Return JSON ONLY (no markdown):
{{
  "variations": [
    {{"prompt": "...", "reasoning": "Explores different material/color/etc."}},
    {{"prompt": "...", "reasoning": "Alternative style direction"}}
  ]
}}"""

        model = genai.GenerativeModel('gemini-2.5-flash-lite')
        response = model.generate_content(prompt)

        # Parse JSON
        json_match = re.search(r'\{[\s\S]*\}', response.text)
        if json_match:
            result = json.loads(json_match.group(0))
            print(f"Generated {len(result.get('variations', []))} variations")
            return result

        # Fallback
        return {"variations": [
            {"prompt": f"{request.original_prompt} with different colors", "reasoning": "Color variation"},
            {"prompt": f"{request.original_prompt} in alternative style", "reasoning": "Style variation"}
        ]}

    except Exception as e:
        print(f"ERROR in generate-variation: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


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

        # Get canvas digest for gap detection
        digest_res = await get_canvas_digest()
        if not digest_res or "gaps" not in digest_res:
            return {"ghosts": []}

        gaps = digest_res["gaps"]
        if len(gaps) == 0:
            return {"ghosts": []}

        # Take top N largest gaps (by size)
        top_gaps = sorted(gaps, key=lambda g: g.get("size", 0), reverse=True)[:num_suggestions]

        # Build prompt for Gemini
        gap_descriptions = []
        for i, gap in enumerate(top_gaps):
            center = gap.get("center", [0, 0])
            gap_descriptions.append(
                f"Gap {i+1}: Located at ({center[0]:.2f}, {center[1]:.2f}) in semantic space. "
                f"Size: {gap.get('size', 0):.2f}. Bounded by: {gap.get('bounding_clusters', [])}"
            )

        prompt = f"""You are helping explore a shoe design semantic space. The user's design brief is:
"{brief}"

Current semantic axes:
- X-axis: {state.axis_labels['x'][0]} (left) → {state.axis_labels['x'][1]} (right)
- Y-axis: {state.axis_labels['y'][0]} (bottom) → {state.axis_labels['y'][1]} (top)

We've detected {len(top_gaps)} unexplored gaps in the canvas:
{chr(10).join(gap_descriptions)}

For each gap, suggest a shoe design prompt that would fit that semantic location. Return EXACTLY {num_suggestions} suggestions in JSON format:

{{
  "suggestions": [
    {{
      "prompt": "specific shoe design prompt",
      "reasoning": "why this fits the gap location",
      "gap_index": 0
    }},
    ...
  ]
}}

Make prompts diverse, creative, and aligned with the design brief."""

        # Call Gemini
        if not gemini_api_key:
            # Fallback without Gemini
            ghosts = []
            for i, gap in enumerate(top_gaps):
                center = gap.get("center", [0, 0])
                ghosts.append({
                    "id": state.next_id + i,
                    "coordinates": center,
                    "suggested_prompt": f"Shoe design at ({center[0]:.1f}, {center[1]:.1f})",
                    "reasoning": f"Fills gap {i+1} in the semantic space",
                    "is_ghost": True
                })
            return {"ghosts": ghosts}

        model = genai.GenerativeModel("gemini-2.0-flash-exp")
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
                }

                json_path = temp_path / f"{filename}.json"
                with open(json_path, 'w', encoding='utf-8') as f:
                    json.dump(metadata, f, indent=2, ensure_ascii=False)

            print(f"Saved all {saved_count} images successfully")

            # Create a summary metadata file
            summary = {
                "export_timestamp": datetime.now().isoformat(),
                "total_images": len(visible_images),
                "axis_labels": state.axis_labels,
                "is_3d_mode": state.is_3d_mode,
                "history_groups": [
                    {
                        "id": g.id,
                        "type": g.type,
                        "image_ids": g.image_ids,
                        "prompt": g.prompt,
                        "timestamp": g.timestamp.isoformat()
                    }
                    for g in state.history_groups
                ],
                "images": [
                    {
                        "id": img.id,
                        "filename": f"img_{img.id}_{img.timestamp.strftime('%Y%m%d_%H%M%S_%f')[:-3]}.png",
                        "prompt": img.prompt,
                        "generation_method": img.generation_method,
                        "parents": img.parents,
                        "children": img.children,
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
                "images": [image_metadata_to_response(img).dict() for img in state.images_metadata if img.visible],
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
