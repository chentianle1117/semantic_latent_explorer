"""Data structures for canvas-centric interface with genealogy tracking."""

from dataclasses import dataclass, field
from typing import List, Tuple, Optional
from PIL import Image
import numpy as np
from datetime import datetime


@dataclass
class ImageMetadata:
    """Metadata for a single image in the semantic space with genealogy tracking.

    Attributes:
        id: Unique identifier for this image
        group_id: ID of the history group this image belongs to
        pil_image: The actual PIL Image object
        embedding: CLIP embedding vector (512-dim)
        coordinates: 2D UMAP coordinates (x, y)
        parents: List of parent image IDs (images used to generate this one)
        children: List of child image IDs (images generated from this one)
        generation_method: How this image was created ('initial', 'reference', 'interpolation', 'dataset')
        prompt: Text prompt used for generation (empty for dataset images)
        reference_ids: IDs of reference images used (for reference-based generation)
        timestamp: When this image was added to the space
        visible: Whether this image is currently visible on canvas
    """
    id: int
    group_id: str
    pil_image: Image.Image
    embedding: np.ndarray
    coordinates: Tuple[float, float]
    parents: List[int] = field(default_factory=list)
    children: List[int] = field(default_factory=list)
    generation_method: str = 'initial'
    prompt: str = ''
    reference_ids: List[int] = field(default_factory=list)
    timestamp: datetime = field(default_factory=datetime.now)
    visible: bool = True


@dataclass
class HistoryGroup:
    """A group of related images in the generation history.

    Attributes:
        id: Unique identifier for this group
        type: Type of generation ('batch', 'reference', 'interpolation', 'dataset')
        image_ids: List of image IDs belonging to this group
        prompt: Text prompt used for this group (if applicable)
        visible: Whether this group's images are visible
        thumbnail_id: ID of the image to use as thumbnail for this group
        timestamp: When this group was created
    """
    id: str
    type: str
    image_ids: List[int]
    prompt: str = ''
    visible: bool = True
    thumbnail_id: Optional[int] = None
    timestamp: datetime = field(default_factory=datetime.now)
