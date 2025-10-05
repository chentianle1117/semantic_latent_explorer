"""Configuration settings for Zappos Semantic Explorer."""

import os
from pathlib import Path

# Dataset paths - UPDATE THIS TO YOUR DATASET LOCATION
DATASET_ROOT = Path("W:/CMU_Academics/2025 Fall/Thesis Demo")
IMAGES_PATH = DATASET_ROOT / "ut-zap50k-images" / "ut-zap50k-images"
DATA_PATH = DATASET_ROOT / "ut-zap50k-data"
FEATS_PATH = DATASET_ROOT / "ut-zap50k-feats"

# Cache directories
CACHE_DIR = Path("cache")
EMBEDDINGS_CACHE = CACHE_DIR / "embeddings"
UMAP_CACHE = CACHE_DIR / "umap"

# Create cache directories
CACHE_DIR.mkdir(exist_ok=True)
EMBEDDINGS_CACHE.mkdir(exist_ok=True)
UMAP_CACHE.mkdir(exist_ok=True)

# Model settings
CLIP_MODEL = "ViT-B-32"
CLIP_PRETRAINED = "openai"
EMBEDDING_DIM = 512

# Processing settings
MAX_IMAGES = 1000  # Start small for prototyping
IMAGE_SIZE = (224, 224)  # CLIP input size
THUMBNAIL_SIZE = (64, 64)  # For visualization
BATCH_SIZE = 32  # Batch size for embedding extraction

# UMAP settings
UMAP_N_NEIGHBORS = 15
UMAP_MIN_DIST = 0.1
UMAP_N_COMPONENTS = 2
UMAP_RANDOM_STATE = 42

# Zappos attribute mapping
ZAPPOS_ATTRIBUTES = {
    1: "open",
    2: "pointy", 
    3: "sporty",
    4: "comfort"
}

# UI settings
STREAMLIT_PAGE_CONFIG = {
    "page_title": "Zappos Semantic Explorer",
    "page_icon": "👟",
    "layout": "wide",
    "initial_sidebar_state": "expanded"
}