"""FastAPI backend for Zappos Semantic Explorer."""

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
from pathlib import Path
import requests
from rembg import remove
import zipfile
import json
import tempfile
from fastapi.responses import FileResponse, StreamingResponse

# Add parent directory to Python path to import models
parent_dir = Path(__file__).parent.parent
sys.path.insert(0, str(parent_dir))

# Import our models
from models import CLIPEmbedder, SemanticAxisBuilder, SemanticGenerator
from models.data_structures import ImageMetadata, HistoryGroup

app = FastAPI(title="Zappos Semantic Explorer API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],  # React dev servers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Pydantic models for API
class GenerateRequest(BaseModel):
    prompt: str
    n_images: int = 8
    seed: Optional[int] = None


class GenerateFromReferenceRequest(BaseModel):
    reference_id: int
    prompt: str


class InterpolateRequest(BaseModel):
    id_a: int
    id_b: int
    alpha: float = 0.5


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
    remove_background: bool = False
    parent_ids: List[int] = []  # Parent image IDs for genealogy tracking


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


# Global state
class AppState:
    def __init__(self):
        self.embedder: Optional[CLIPEmbedder] = None
        self.generator: Optional[SemanticGenerator] = None
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
            "axis_labels": state.axis_labels
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
        is_3d_mode=state.is_3d_mode  # New: include 3D mode state
    )


@app.post("/api/initialize")
async def initialize_models():
    """Initialize ML models (SD 1.5 + CLIP)."""
    try:
        if state.embedder is None:
            print("Loading CLIP embedder...")
            state.embedder = CLIPEmbedder()
            print("OK: CLIP loaded")

        if state.generator is None:
            print("Loading Stable Diffusion generator...")
            # Try CUDA first, fall back to CPU if it fails
            try:
                state.generator = SemanticGenerator(device='cuda')
                print("OK: Generator loaded (GPU)")
            except Exception as gpu_error:
                print(f"GPU failed: {gpu_error}")
                print("Falling back to CPU mode...")
                state.generator = SemanticGenerator(device='cpu')
                print("OK: Generator loaded (CPU)")

        if state.axis_builder is None:
            state.axis_builder = SemanticAxisBuilder(state.embedder)

        return {"status": "success", "message": "Models initialized"}
    except Exception as e:
        print(f"ERROR initializing models: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


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


@app.post("/api/generate")
async def generate_images(request: GenerateRequest):
    """Generate images from text prompt."""
    try:
        print(f"\n=== Generate Request ===")
        print(f"Prompt: {request.prompt}")
        print(f"Count: {request.n_images}")

        if state.generator is None or state.embedder is None:
            raise HTTPException(status_code=400, detail="Models not initialized")

        # Generate images
        print("Generating images...")
        images = []
        for i in range(request.n_images):
            print(f"  Generating image {i+1}/{request.n_images}...")
            img = state.generator.generate_from_text(request.prompt)
            images.append(img)
            print(f"  OK: Image {i+1} generated")

        # Extract embeddings
        embeddings = state.embedder.extract_image_embeddings_from_pil(images)

        # Project embeddings onto semantic axes
        coords = project_embeddings_to_coordinates(embeddings)

        # Create ImageMetadata objects
        group_id = f"batch_{len(state.history_groups)}"
        new_metadata = []

        for i, (img, emb, coord) in enumerate(zip(images, embeddings, coords)):
            img_meta = ImageMetadata(
                id=state.next_id,
                group_id=group_id,
                pil_image=img,
                embedding=emb,
                coordinates=tuple(float(c) for c in coord),  # Support 2D or 3D
                parents=[],
                children=[],
                generation_method='batch',
                prompt=request.prompt,
                reference_ids=[],
                timestamp=datetime.now(),
                visible=True
            )
            new_metadata.append(img_meta)
            state.next_id += 1

        state.images_metadata.extend(new_metadata)

        # Create history group
        image_ids = [m.id for m in new_metadata]
        history_group = HistoryGroup(
            id=group_id,
            type='batch',
            image_ids=image_ids,
            prompt=request.prompt,
            visible=True,
            thumbnail_id=image_ids[0] if image_ids else None,
            timestamp=datetime.now()
        )
        state.history_groups.append(history_group)

        # Broadcast update
        await broadcast_state_update()

        print(f"OK: Generation complete! Created {len(new_metadata)} images")
        return {
            "status": "success",
            "images": [image_metadata_to_response(img).dict() for img in new_metadata]
        }

    except Exception as e:
        print(f"\n!!! ERROR in generate_images !!!")
        print(f"Error type: {type(e).__name__}")
        print(f"Error message: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/generate-from-reference")
async def generate_from_reference(request: GenerateFromReferenceRequest):
    """Generate image from reference."""
    try:
        if state.generator is None or state.embedder is None:
            raise HTTPException(status_code=400, detail="Models not initialized")

        # Find reference image
        ref_img = next((img for img in state.images_metadata if img.id == request.reference_id), None)
        if not ref_img:
            raise HTTPException(status_code=404, detail="Reference image not found")

        # Generate new image
        new_img = state.generator.generate_from_reference(ref_img.pil_image, request.prompt)

        # Extract embedding
        new_embedding = state.embedder.extract_image_embeddings_from_pil([new_img])[0]

        # Project onto semantic axes
        new_coord = project_embeddings_to_coordinates(new_embedding.reshape(1, -1))[0]

        # Create metadata
        group_id = f"reference_{len(state.history_groups)}"
        img_meta = ImageMetadata(
            id=state.next_id,
            group_id=group_id,
            pil_image=new_img,
            embedding=new_embedding,
            coordinates=tuple(float(c) for c in new_coord),  # Support 2D or 3D
            parents=[request.reference_id],
            children=[],
            generation_method='reference',
            prompt=request.prompt,
            reference_ids=[request.reference_id],
            timestamp=datetime.now(),
            visible=True
        )

        # Update parent
        ref_img.children.append(state.next_id)
        state.next_id += 1

        state.images_metadata.append(img_meta)

        # Create history group
        history_group = HistoryGroup(
            id=group_id,
            type='reference',
            image_ids=[img_meta.id],
            prompt=request.prompt,
            visible=True,
            thumbnail_id=img_meta.id,
            timestamp=datetime.now()
        )
        state.history_groups.append(history_group)

        await broadcast_state_update()

        return {"status": "success", "image": image_metadata_to_response(img_meta).dict()}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/interpolate")
async def interpolate_images(request: InterpolateRequest):
    """Generate interpolated image."""
    try:
        if state.generator is None:
            raise HTTPException(
                status_code=400,
                detail="Interpolation requires local Stable Diffusion. Please switch to 'local-sd15' mode and initialize models."
            )

        if state.embedder is None:
            raise HTTPException(status_code=400, detail="CLIP embedder not initialized")

        # Find both images
        img_a = next((img for img in state.images_metadata if img.id == request.id_a), None)
        img_b = next((img for img in state.images_metadata if img.id == request.id_b), None)

        if not img_a or not img_b:
            raise HTTPException(status_code=404, detail="One or both images not found")

        # Generate interpolated image
        new_img = state.generator.generate_interpolated(
            img_a.pil_image,
            img_b.pil_image,
            alpha=request.alpha
        )

        # Extract embedding
        new_embedding = state.embedder.extract_image_embeddings_from_pil([new_img])[0]

        # Project onto semantic axes
        new_coord = project_embeddings_to_coordinates(new_embedding.reshape(1, -1))[0]

        # Create metadata
        group_id = f"interpolation_{len(state.history_groups)}"
        img_meta = ImageMetadata(
            id=state.next_id,
            group_id=group_id,
            pil_image=new_img,
            embedding=new_embedding,
            coordinates=tuple(float(c) for c in new_coord),  # Support 2D or 3D
            parents=[request.id_a, request.id_b],
            children=[],
            generation_method='interpolation',
            prompt=f"Interpolation between {request.id_a} and {request.id_b}",
            reference_ids=[request.id_a, request.id_b],
            timestamp=datetime.now(),
            visible=True
        )

        # Update parents
        img_a.children.append(state.next_id)
        img_b.children.append(state.next_id)
        state.next_id += 1

        state.images_metadata.append(img_meta)

        # Create history group
        history_group = HistoryGroup(
            id=group_id,
            type='interpolation',
            image_ids=[img_meta.id],
            prompt=f"Between #{request.id_a} & #{request.id_b}",
            visible=True,
            thumbnail_id=img_meta.id,
            timestamp=datetime.now()
        )
        state.history_groups.append(history_group)

        await broadcast_state_update()

        return {"status": "success", "image": image_metadata_to_response(img_meta).dict()}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/update-axes")
async def update_semantic_axes(request: AxisUpdateRequest):
    """Update semantic axes and recalculate positions."""
    try:
        if state.axis_builder is None or state.embedder is None:
            raise HTTPException(status_code=400, detail="Models not initialized")

        print(f"\n=== Updating Semantic Axes ===")
        print(f"X: {request.x_negative} → {request.x_positive}")
        print(f"Y: {request.y_negative} → {request.y_positive}")

        # Update axis labels
        state.axis_labels['x'] = (request.x_negative, request.x_positive)
        state.axis_labels['y'] = (request.y_negative, request.y_positive)

        # Update z-axis if provided
        if request.z_positive and request.z_negative:
            print(f"Z: {request.z_negative} → {request.z_positive}")
            state.axis_labels['z'] = (request.z_negative, request.z_positive)

        # Recalculate ALL positions using the new axes
        if len(state.images_metadata) > 0:
            print(f"Recalculating positions for {len(state.images_metadata)} images...")
            all_embeddings = np.array([img.embedding for img in state.images_metadata])
            new_coords = project_embeddings_to_coordinates(all_embeddings)

            for i, img_meta in enumerate(state.images_metadata):
                # Store coordinates as tuple (2D or 3D)
                img_meta.coordinates = tuple(float(c) for c in new_coords[i])

            print(f"OK: All positions recalculated")

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
            if request.remove_background:
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
                "axis_labels": state.axis_labels
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
