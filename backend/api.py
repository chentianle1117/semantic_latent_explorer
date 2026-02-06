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


class StateResponse(BaseModel):
    images: List[ImageResponse]
    history_groups: List[Dict]
    axis_labels: Dict[str, Tuple[str, str]]
    is_3d_mode: bool = False  # New: track if in 3D mode
    design_brief: Optional[str] = None  # New: include design brief in state


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
        return np.column_stack([x_coords, y_coords, z_coords])

    return np.column_stack([x_coords, y_coords])


def image_metadata_to_response(img: ImageMetadata) -> ImageResponse:
    """Convert ImageMetadata to API response."""
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
        visible=img.visible
    )


async def broadcast_state_update():
    """Broadcast state update to all connected WebSocket clients."""
    if not state.websocket_connections:
        return

    response = {
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
            "design_brief": state.design_brief  # Include design brief in broadcast
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
    return StateResponse(
        images=[image_metadata_to_response(img) for img in state.images_metadata if img.visible],
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
        design_brief=state.design_brief  # New: include design brief
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

            for i, img_meta in enumerate(state.images_metadata):
                # Store coordinates as tuple (2D or 3D)
                img_meta.coordinates = tuple(float(c) for c in new_coords[i])

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

            for i, img_meta in enumerate(state.images_metadata):
                # Store coordinates as tuple (2D or 3D)
                img_meta.coordinates = tuple(float(c) for c in new_coords[i])

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

        # Project embeddings onto semantic axes
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

            clusters.append({
                "id": f"cluster_{i}",
                "center": actual_center.tolist(),  # Keep actual coordinates for reference
                "normalized_center": normalized_center,  # Add normalized [0-1] coordinates
                "size": int(mask.sum()),
                "sample_prompts": [img.prompt for img in cluster_imgs[:3]],
                "generation_methods": list(set(img.generation_method for img in cluster_imgs))
            })

        return {
            "count": len(visible),
            "clusters": clusters,
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

        # Format cluster info for AI with normalized centers
        cluster_info = []
        for c in digest['clusters']:
            cluster_info.append({
                "normalized_center": c['normalized_center'],
                "size": c['size'],
                "sample_prompts": c['sample_prompts'][:2]  # Just 2 examples
            })

        prompt = f"""You are a design exploration assistant analyzing a shoe design canvas.

DESIGN BRIEF:
{request.brief}

CURRENT CANVAS STATE:
- {digest['count']} shoes displayed
- X-Axis: {digest['axis_labels']['x'][0]} (left/0.0) ↔ {digest['axis_labels']['x'][1]} (right/1.0)
- Y-Axis: {digest['axis_labels']['y'][0]} (bottom/0.0) ↔ {digest['axis_labels']['y'][1]} (top/1.0)
- {len(digest['clusters'])} clusters detected

EXISTING CLUSTERS (normalized positions [x, y] in 0-1 range):
{json.dumps(cluster_info, indent=2)}

CRITICAL RULES:
1. For "cluster" type regions: Use the EXACT normalized_center from an existing cluster above
2. For "gap" type regions: Choose coordinates that are:
   - BETWEEN existing clusters (not on top of them)
   - Within reasonable distance (0.2-0.3 units) from nearest cluster
   - NOT in corners or edges unless clusters are there
3. Coordinates interpretation:
   - [0.0, 0.0] = bottom-left: {digest['axis_labels']['x'][0]}, {digest['axis_labels']['y'][0]}
   - [1.0, 1.0] = top-right: {digest['axis_labels']['x'][1]}, {digest['axis_labels']['y'][1]}
   - [x, y] where x is position on X-axis, y is position on Y-axis
4. Prompts MUST match the coordinates semantically (use axis labels as guide)

TASK:
Suggest 2-3 specific regions to explore. For each region:
1. Type: "cluster" (expand existing) OR "gap" (fill empty space between clusters)
2. Center: For clusters, copy exact normalized_center from above. For gaps, calculate position between clusters
3. Create HIGHLY SPECIFIC prompts that match the coordinate position based on axis meanings

Return JSON ONLY (no markdown):
{{
  "regions": [
    {{
      "center": [0.45, 0.62],
      "title": "Gap: Mid-range Exploration",
      "description": "Empty space between clusters - good for diversity",
      "suggested_prompts": [
        "Detailed prompt matching x=0.45, y=0.62 based on axis meanings",
        "Another detailed prompt for same position"
      ],
      "type": "gap"
    }},
    {{
      "center": [0.78, 0.23],
      "title": "Cluster Expansion",
      "description": "Expand existing cluster with more variations",
      "suggested_prompts": [
        "Variation of cluster's existing style",
        "Another variation similar to cluster"
      ],
      "type": "cluster"
    }}
  ]
}}"""

        # Using gemini-2.5-flash-lite (fast, low-cost, high-performance)
        # Note: gemini-1.5-flash was retired in April 2025
        model = genai.GenerativeModel('gemini-2.5-flash-lite')
        response = model.generate_content(prompt)

        # Parse JSON
        json_match = re.search(r'\{[\s\S]*\}', response.text)
        if json_match:
            result = json.loads(json_match.group(0))
            print(f"Generated {len(result.get('regions', []))} region suggestions")
            return result

        # Fallback
        return {"regions": []}

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


@app.get("/api/export-zip")
async def export_zip():
    """Export all images and metadata as a ZIP file."""
    try:
        print(f"\n=== Export ZIP Request ===")
        print(f"Total images in state: {len(state.images_metadata)}")

        visible_images = [img for img in state.images_metadata if img.visible]
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
    uvicorn.run(app, host="0.0.0.0", port=8000)
