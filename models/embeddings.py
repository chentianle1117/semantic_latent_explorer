"""
FashionCLIP embedding extraction using the ssmemo55 Space.
Target: https://ssmemo55-fashionclip-api.hf.space
"""

import os
import time
import base64
import json
import numpy as np
import requests as http_requests
from io import BytesIO
from typing import List, Union, Any
from PIL import Image
from pathlib import Path
import pickle
import hashlib
from tqdm import tqdm
from dotenv import load_dotenv

load_dotenv()

# CONFIGURATION
SPACE_URL = "https://ssmemo55-fashionclip-api.hf.space"
EMBEDDING_DIM = 512
EMBEDDINGS_CACHE = Path("cache/embeddings")

class CLIPEmbedder:
    """Client for the ssmemo55/fashionclip-api Space."""

    def __init__(self):
        self.api_key = os.getenv("HF_API_KEY")
        self.auth_headers = {}
        if self.api_key:
            self.auth_headers["Authorization"] = f"Bearer {self.api_key}"

        print(f"🔌 Connecting to FashionCLIP Space: {SPACE_URL}")
        EMBEDDINGS_CACHE.mkdir(parents=True, exist_ok=True)

    def _normalize(self, v: np.ndarray) -> np.ndarray:
        """L2-normalize vectors so Dot Product == Cosine Similarity."""
        # Ensure we are working with floats, not objects (dicts)
        if v.dtype == object:
            print("⚠️ Warning: Array contains objects/dicts, forcing float conversion failed.")
            return np.zeros((v.shape[0], EMBEDDING_DIM))

        if v.ndim == 1:
            norm = np.linalg.norm(v)
            return v / (norm + 1e-12)
        else:
            norm = np.linalg.norm(v, axis=1, keepdims=True)
            return v / (norm + 1e-12)

    def _parse_response(self, data: Any) -> np.ndarray:
        """Robustly extract embedding vector from API response."""
        # Case 1: Direct list
        if isinstance(data, list):
            vector = np.array(data)

        # Case 2: Dictionary wrapper
        elif isinstance(data, dict):
            # Try common keys used by HF Spaces/FastAPI
            vector = None
            for key in ['embedding', 'embeddings', 'vector', 'features', 'data', 'output']:
                if key in data:
                    val = data[key]
                    if isinstance(val, list):
                        vector = np.array(val)
                        break

            # Fallback: Return the first list value found
            if vector is None:
                print(f"⚠️ Unknown API Key structure. Received keys: {list(data.keys())}")
                for val in data.values():
                    if isinstance(val, list) and len(val) > 0 and isinstance(val[0], (float, int)):
                        vector = np.array(val)
                        break
        else:
            vector = None

        # Validate dimension
        if vector is None:
            print("❌ Failed to parse embedding from response.")
            return np.zeros(EMBEDDING_DIM)

        if vector.shape != (EMBEDDING_DIM,):
            print(f"❌ Dimension mismatch: expected {EMBEDDING_DIM}, got {vector.shape}")
            return np.zeros(EMBEDDING_DIM)

        return vector

    def create_cache_key(self, data: Union[str, List[str]], preserve_order: bool = False) -> str:
        """Create cache key. For images, preserve order. For texts, sorting is fine."""
        if isinstance(data, str):
            content = data
        else:
            content = "|".join(data if preserve_order else sorted(data))
        return hashlib.md5(content.encode()).hexdigest()

    def _prepare_image_file(self, path_or_img: Union[str, Image.Image]) -> dict:
        """Prepare image file for upload, handling transparency."""
        if isinstance(path_or_img, str):
            img = Image.open(path_or_img)
        else:
            img = path_or_img

        # Handle Transparency (RGBA -> RGB)
        if img.mode == 'RGBA':
            bg = Image.new('RGB', img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[3])
            img = bg
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        img_byte_arr = BytesIO()
        img.save(img_byte_arr, format='JPEG')
        img_byte_arr.seek(0)
        
        return {'file': ('image.jpg', img_byte_arr, 'image/jpeg')}

    def extract_image_embeddings(self, image_paths: List[str], batch_size: int = 1, use_cache: bool = True) -> np.ndarray:
        """Hit the POST /embed endpoint using File Upload."""

        if use_cache:
            cache_key = self.create_cache_key(image_paths, preserve_order=True)
            cache_file = EMBEDDINGS_CACHE / f"images_{cache_key}.pkl"
            if cache_file.exists():
                print(f"✅ Loading cached embeddings for {len(image_paths)} images")
                with open(cache_file, 'rb') as f: return pickle.load(f)

        print(f"🚀 Sending {len(image_paths)} images to Space...")
        all_embeddings = []

        for path in tqdm(image_paths, desc="Processing Images"):
            try:
                files = self._prepare_image_file(path)

                response = http_requests.post(
                    f"{SPACE_URL}/embed",
                    headers=self.auth_headers,
                    files=files,
                    timeout=30
                )

                if response.status_code != 200:
                    print(f"⚠️ Skipping {path}: API error {response.status_code}")
                    all_embeddings.append(np.zeros(EMBEDDING_DIM))
                    continue

                # Use parser here
                vector = self._parse_response(response.json())
                all_embeddings.append(vector)

            except Exception as e:
                print(f"⚠️ Error processing {path}: {e}")
                all_embeddings.append(np.zeros(EMBEDDING_DIM))

        if not all_embeddings:
            return np.zeros((len(image_paths), EMBEDDING_DIM))

        final_embeddings = np.vstack(all_embeddings)
        final_embeddings = self._normalize(final_embeddings)

        if use_cache:
            with open(cache_file, 'wb') as f: pickle.dump(final_embeddings, f)

        return final_embeddings

    def extract_text_embeddings(self, texts: List[str], use_cache: bool = True) -> np.ndarray:
        """Hit the POST /embed-text endpoint (JSON)."""

        if use_cache:
            cache_key = self.create_cache_key(texts, preserve_order=False)
            cache_file = EMBEDDINGS_CACHE / f"texts_{cache_key}.pkl"
            if cache_file.exists():
                with open(cache_file, 'rb') as f: return pickle.load(f)

        print(f"🚀 Sending {len(texts)} texts to Space...")
        all_embeddings = []

        headers = self.auth_headers.copy()
        headers["Content-Type"] = "application/json"

        for text in texts:
            try:
                payload = {"text": text}
                response = http_requests.post(
                    f"{SPACE_URL}/embed-text",
                    headers=headers,
                    json=payload,
                    timeout=30
                )

                if response.status_code != 200:
                    print(f"⚠️ Skipping '{text}': API error {response.status_code}")
                    all_embeddings.append(np.zeros(EMBEDDING_DIM))
                    continue

                # Use parser here
                vector = self._parse_response(response.json())
                all_embeddings.append(vector)

            except Exception as e:
                print(f"⚠️ Error on '{text}': {e}")
                all_embeddings.append(np.zeros(EMBEDDING_DIM))

        if not all_embeddings:
            return np.zeros((len(texts), EMBEDDING_DIM))

        final_embeddings = np.vstack(all_embeddings)
        final_embeddings = self._normalize(final_embeddings)

        if use_cache:
            with open(cache_file, 'wb') as f: pickle.dump(final_embeddings, f)

        return final_embeddings

    def extract_image_embeddings_from_pil(self, pil_images: List[Image.Image]) -> np.ndarray:
        """Helper for in-memory images."""
        if not pil_images:
            return np.zeros((0, EMBEDDING_DIM))

        all_embeddings = []
        for img in pil_images:
            try:
                files = self._prepare_image_file(img)

                response = http_requests.post(
                    f"{SPACE_URL}/embed",
                    headers=self.auth_headers,
                    files=files,
                    timeout=30
                )

                if response.status_code == 200:
                    # Use parser here
                    vector = self._parse_response(response.json())
                    all_embeddings.append(vector)
                else:
                    print(f"⚠️ Space Error (PIL): {response.text}")
                    all_embeddings.append(np.zeros(EMBEDDING_DIM))
            except Exception as e:
                print(f"⚠️ API Error (PIL): {e}")
                all_embeddings.append(np.zeros(EMBEDDING_DIM))

        if not all_embeddings:
            return np.zeros((0, EMBEDDING_DIM))
        return self._normalize(np.vstack(all_embeddings))


class HuggingFaceCLIPEmbedder:
    """
    Client for HuggingFace Inference API using sentence-transformers CLIP.
    More reliable than Gradio Spaces, but less fashion-specialized.
    """

    def __init__(self, model_id: str = "sentence-transformers/clip-ViT-B-32-multilingual-v1"):
        self.model_id = model_id
        self.api_key = os.getenv("HF_API_KEY")
        self.api_url = f"https://api-inference.huggingface.co/models/{model_id}"
        self.headers = {"Authorization": f"Bearer {self.api_key}"}

        print(f"🔌 Connecting to HuggingFace CLIP: {model_id}")
        EMBEDDINGS_CACHE.mkdir(parents=True, exist_ok=True)

    def _normalize(self, v: np.ndarray) -> np.ndarray:
        """L2-normalize vectors."""
        if v.ndim == 1:
            norm = np.linalg.norm(v)
            return v / (norm + 1e-12)
        else:
            norm = np.linalg.norm(v, axis=1, keepdims=True)
            return v / (norm + 1e-12)

    def _parse_response(self, data: Any) -> np.ndarray:
        """Parse HuggingFace API response (handles list or dict formats)."""
        # Format 1: Direct list [0.1, 0.2, ...] or [[0.1, 0.2, ...]]
        if isinstance(data, list):
            arr = np.array(data)
            # Unwrap if nested [[...]]
            if arr.ndim == 2 and arr.shape[0] == 1:
                arr = arr[0]
            vector = arr

        # Format 2: Dictionary {"embeddings": [...]} or {"data": [...]}
        elif isinstance(data, dict):
            vector = None
            for key in ['embeddings', 'data', 'vector']:
                if key in data:
                    arr = np.array(data[key])
                    if arr.ndim == 2 and arr.shape[0] == 1:
                        arr = arr[0]
                    vector = arr
                    break

            if vector is None:
                print(f"⚠️ Unknown HF response format: {list(data.keys())}")
                return np.zeros(EMBEDDING_DIM)
        else:
            vector = None

        # Validate dimension
        if vector is None or vector.shape != (EMBEDDING_DIM,):
            print(f"❌ Dimension mismatch: expected {EMBEDDING_DIM}, got {vector.shape if vector is not None else 'None'}")
            return np.zeros(EMBEDDING_DIM)

        return vector

    def _prepare_image_bytes(self, path_or_img: Union[str, Image.Image]) -> bytes:
        """Convert image to JPEG bytes for API."""
        if isinstance(path_or_img, str):
            img = Image.open(path_or_img)
        else:
            img = path_or_img

        # Handle transparency
        if img.mode == 'RGBA':
            bg = Image.new('RGB', img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[3])
            img = bg
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        buffered = BytesIO()
        img.save(buffered, format='JPEG')
        return buffered.getvalue()

    def extract_image_embeddings(self, image_paths: List[str], batch_size: int = 1, use_cache: bool = True) -> np.ndarray:
        """Extract embeddings via HuggingFace Inference API."""
        # Use same cache key format for consistency
        cache_key = hashlib.md5("|".join(image_paths).encode()).hexdigest()
        cache_file = EMBEDDINGS_CACHE / f"hf_images_{cache_key}.pkl"

        if use_cache and cache_file.exists():
            print(f"✅ Loading cached HF embeddings for {len(image_paths)} images")
            with open(cache_file, 'rb') as f:
                return pickle.load(f)

        print(f"🚀 Sending {len(image_paths)} images to HuggingFace...")
        all_embeddings = []

        for path in tqdm(image_paths, desc="HF Processing"):
            try:
                image_bytes = self._prepare_image_bytes(path)

                response = http_requests.post(
                    self.api_url,
                    headers=self.headers,
                    data=image_bytes,
                    timeout=30
                )

                if response.status_code != 200:
                    print(f"⚠️ Skipping {path}: API error {response.status_code}")
                    all_embeddings.append(np.zeros(EMBEDDING_DIM))
                    continue

                vector = self._parse_response(response.json())
                all_embeddings.append(vector)

            except Exception as e:
                print(f"⚠️ Error on {path}: {e}")
                all_embeddings.append(np.zeros(EMBEDDING_DIM))

        if not all_embeddings:
            return np.zeros((len(image_paths), EMBEDDING_DIM))

        final_embeddings = np.vstack(all_embeddings)
        final_embeddings = self._normalize(final_embeddings)

        if use_cache:
            with open(cache_file, 'wb') as f:
                pickle.dump(final_embeddings, f)

        return final_embeddings

    def extract_text_embeddings(self, texts: List[str], use_cache: bool = True) -> np.ndarray:
        """Extract text embeddings via HuggingFace Inference API."""
        cache_key = hashlib.md5("|".join(texts).encode()).hexdigest()
        cache_file = EMBEDDINGS_CACHE / f"hf_texts_{cache_key}.pkl"

        if use_cache and cache_file.exists():
            with open(cache_file, 'rb') as f:
                return pickle.load(f)

        print(f"🚀 Sending {len(texts)} texts to HuggingFace...")
        all_embeddings = []

        for text in texts:
            try:
                payload = {"inputs": text}
                response = http_requests.post(
                    self.api_url,
                    headers=self.headers,
                    json=payload,
                    timeout=30
                )

                if response.status_code != 200:
                    print(f"⚠️ Skipping '{text}': API error {response.status_code}")
                    all_embeddings.append(np.zeros(EMBEDDING_DIM))
                    continue

                vector = self._parse_response(response.json())
                all_embeddings.append(vector)

            except Exception as e:
                print(f"⚠️ Error on '{text}': {e}")
                all_embeddings.append(np.zeros(EMBEDDING_DIM))

        if not all_embeddings:
            return np.zeros((len(texts), EMBEDDING_DIM))

        final_embeddings = np.vstack(all_embeddings)
        final_embeddings = self._normalize(final_embeddings)

        if use_cache:
            with open(cache_file, 'wb') as f:
                pickle.dump(final_embeddings, f)

        return final_embeddings

    def extract_image_embeddings_from_pil(self, pil_images: List[Image.Image]) -> np.ndarray:
        """Helper for in-memory PIL images."""
        if not pil_images:
            return np.zeros((0, EMBEDDING_DIM))

        all_embeddings = []
        for img in pil_images:
            try:
                image_bytes = self._prepare_image_bytes(img)
                response = http_requests.post(
                    self.api_url,
                    headers=self.headers,
                    data=image_bytes,
                    timeout=30
                )

                if response.status_code == 200:
                    vector = self._parse_response(response.json())
                    all_embeddings.append(vector)
                else:
                    print(f"⚠️ PIL image error: {response.status_code}")
                    all_embeddings.append(np.zeros(EMBEDDING_DIM))
            except Exception as e:
                print(f"⚠️ PIL image error: {e}")
                all_embeddings.append(np.zeros(EMBEDDING_DIM))

        if not all_embeddings:
            return np.zeros((0, EMBEDDING_DIM))
        return self._normalize(np.vstack(all_embeddings))