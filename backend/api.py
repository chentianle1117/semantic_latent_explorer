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
    coordinates: Tuple[float, float]
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
            'y': ('dark', 'colorful')
        }
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
    return {"message": "Zappos Semantic Explorer API", "status": "running"}


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
        axis_labels=state.axis_labels
    )


@app.post("/api/initialize")
async def initialize_models():
    """Initialize ML models (SD 1.5 + CLIP)."""
    try:
        if state.embedder is None:
            print("Loading CLIP embedder...")
            state.embedder = CLIPEmbedder()
            print("✓ CLIP loaded")

        if state.generator is None:
            print("Loading Stable Diffusion generator...")
            # Try CUDA first, fall back to CPU if it fails
            try:
                state.generator = SemanticGenerator(device='cuda')
                print("✓ Generator loaded (GPU)")
            except Exception as gpu_error:
                print(f"GPU failed: {gpu_error}")
                print("Falling back to CPU mode...")
                state.generator = SemanticGenerator(device='cpu')
                print("✓ Generator loaded (CPU)")

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
            print("✓ CLIP loaded")

        if state.axis_builder is None:
            state.axis_builder = SemanticAxisBuilder(state.embedder)

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
            print(f"  ✓ Image {i+1} generated")

        # Extract embeddings
        embeddings = state.embedder.extract_image_embeddings_from_pil(images)

        # Calculate UMAP coordinates (simplified - using PCA for now)
        from sklearn.decomposition import PCA
        if len(state.images_metadata) == 0:
            # First batch - create new space
            pca = PCA(n_components=2, random_state=42)
            coords = pca.fit_transform(embeddings)
        else:
            # Project to existing space
            all_embeddings = np.array([img.embedding for img in state.images_metadata])
            combined = np.vstack([all_embeddings, embeddings])
            pca = PCA(n_components=2, random_state=42)
            all_coords = pca.fit_transform(combined)
            coords = all_coords[-len(embeddings):]

        # Create ImageMetadata objects
        group_id = f"batch_{len(state.history_groups)}"
        new_metadata = []

        for i, (img, emb, coord) in enumerate(zip(images, embeddings, coords)):
            img_meta = ImageMetadata(
                id=state.next_id,
                group_id=group_id,
                pil_image=img,
                embedding=emb,
                coordinates=(float(coord[0]), float(coord[1])),
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

        print(f"✓ Generation complete! Created {len(new_metadata)} images")
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

        # Project coordinates (simplified)
        all_embeddings = np.array([img.embedding for img in state.images_metadata])
        combined = np.vstack([all_embeddings, new_embedding.reshape(1, -1)])
        from sklearn.decomposition import PCA
        pca = PCA(n_components=2, random_state=42)
        all_coords = pca.fit_transform(combined)
        new_coord = all_coords[-1]

        # Create metadata
        group_id = f"reference_{len(state.history_groups)}"
        img_meta = ImageMetadata(
            id=state.next_id,
            group_id=group_id,
            pil_image=new_img,
            embedding=new_embedding,
            coordinates=(float(new_coord[0]), float(new_coord[1])),
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

        # Project coordinates
        all_embeddings = np.array([img.embedding for img in state.images_metadata])
        combined = np.vstack([all_embeddings, new_embedding.reshape(1, -1)])
        from sklearn.decomposition import PCA
        pca = PCA(n_components=2, random_state=42)
        all_coords = pca.fit_transform(combined)
        new_coord = all_coords[-1]

        # Create metadata
        group_id = f"interpolation_{len(state.history_groups)}"
        img_meta = ImageMetadata(
            id=state.next_id,
            group_id=group_id,
            pil_image=new_img,
            embedding=new_embedding,
            coordinates=(float(new_coord[0]), float(new_coord[1])),
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

        # Update axis labels
        state.axis_labels = {
            'x': (request.x_negative, request.x_positive),
            'y': (request.y_negative, request.y_positive)
        }

        # Build semantic axes
        x_axis = state.axis_builder.create_clip_text_axis(
            f"shoe that is {request.x_positive}",
            f"shoe that is {request.x_negative}"
        )
        y_axis = state.axis_builder.create_clip_text_axis(
            f"shoe that is {request.y_positive}",
            f"shoe that is {request.y_negative}"
        )

        # Recalculate positions
        all_embeddings = np.array([img.embedding for img in state.images_metadata])
        x_coords = all_embeddings @ x_axis.direction
        y_coords = all_embeddings @ y_axis.direction

        for i, img_meta in enumerate(state.images_metadata):
            img_meta.coordinates = (float(x_coords[i]), float(y_coords[i]))

        await broadcast_state_update()

        return {"status": "success", "message": "Axes updated"}

    except Exception as e:
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
    """Add images from external URLs (e.g., fal.ai) and compute embeddings."""
    try:
        print(f"\n=== Add External Images Request ===")
        print(f"Prompt: {request.prompt}")
        print(f"Count: {len(request.images)}")
        print(f"Method: {request.generation_method}")

        if state.embedder is None:
            raise HTTPException(status_code=400, detail="CLIP embedder not initialized. Call /api/initialize-clip-only first.")

        # Download images from URLs
        print("Downloading images from URLs...")
        pil_images = []
        for i, img_data in enumerate(request.images):
            print(f"  Downloading image {i+1}/{len(request.images)} from {img_data.url[:50]}...")
            response = requests.get(img_data.url, timeout=30)
            response.raise_for_status()
            img = Image.open(BytesIO(response.content))
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
                print(f"  ✓ Background removed from image {i+1} (transparent)")
            else:
                # Ensure RGB mode if not removing background
                if img.mode == 'RGBA':
                    # Convert RGBA to RGB with white background
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    background.paste(img, mask=img.split()[3])
                    img = background

            pil_images.append(img)
            print(f"  ✓ Image {i+1} processed")

        # Extract embeddings
        print("Extracting CLIP embeddings...")
        embeddings = state.embedder.extract_image_embeddings_from_pil(pil_images)
        print("✓ Embeddings extracted")

        # Calculate UMAP coordinates (simplified - using PCA for now)
        from sklearn.decomposition import PCA
        if len(state.images_metadata) == 0:
            # First batch - create new space
            pca = PCA(n_components=2, random_state=42)
            coords = pca.fit_transform(embeddings)
        else:
            # Project to existing space
            all_embeddings = np.array([img.embedding for img in state.images_metadata])
            combined = np.vstack([all_embeddings, embeddings])
            pca = PCA(n_components=2, random_state=42)
            all_coords = pca.fit_transform(combined)
            coords = all_coords[-len(embeddings):]

        # Create ImageMetadata objects
        group_id = f"{request.generation_method}_{len(state.history_groups)}"
        new_metadata = []

        for i, (img, emb, coord) in enumerate(zip(pil_images, embeddings, coords)):
            img_meta = ImageMetadata(
                id=state.next_id,
                group_id=group_id,
                pil_image=img,
                embedding=emb,
                coordinates=(float(coord[0]), float(coord[1])),
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
                    print(f"  ✓ Parent {parent_id} now has {len(parent.children)} children")
                else:
                    print(f"  ⚠️ Parent {parent_id} not found")

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

        print(f"✓ Added {len(new_metadata)} external images to canvas")
        return {
            "status": "success",
            "images": [image_metadata_to_response(img).dict() for img in new_metadata]
        }

    except Exception as e:
        print(f"\n!!! ERROR in add_external_images !!!")
        print(f"Error type: {type(e).__name__}")
        print(f"Error message: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


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
