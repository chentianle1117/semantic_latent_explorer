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
            return np.array(data)
        
        # Case 2: Dictionary wrapper
        if isinstance(data, dict):
            # Try common keys used by HF Spaces/FastAPI
            for key in ['embedding', 'embeddings', 'vector', 'features', 'data', 'output']:
                if key in data:
                    val = data[key]
                    if isinstance(val, list):
                        return np.array(val)
            
            # Debug: If standard keys fail, print what we got
            print(f"⚠️ Unknown API Key structure. Received keys: {list(data.keys())}")
            
            # Fallback: Return the first list value found
            for val in data.values():
                if isinstance(val, list) and len(val) > 0 and isinstance(val[0], (float, int)):
                    return np.array(val)
                    
        print("❌ Failed to parse embedding from response.")
        return np.zeros(EMBEDDING_DIM)

    def create_cache_key(self, data: Union[str, List[str]]) -> str:
        if isinstance(data, str): content = data
        else: content = "|".join(sorted(data))
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
            cache_key = self.create_cache_key(image_paths)
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
                    files=files
                )
                
                if response.status_code != 200:
                    print(f"❌ Space Error {response.status_code}: {response.text}")
                    break
                
                # Use parser here
                vector = self._parse_response(response.json())
                all_embeddings.append(vector)

            except Exception as e:
                print(f"⚠️ Error processing {path}: {e}")

        if not all_embeddings: return np.array([]).reshape(0, EMBEDDING_DIM)

        final_embeddings = np.vstack(all_embeddings)
        final_embeddings = self._normalize(final_embeddings)

        if use_cache:
            with open(cache_file, 'wb') as f: pickle.dump(final_embeddings, f)
        
        return final_embeddings

    def extract_text_embeddings(self, texts: List[str], use_cache: bool = True) -> np.ndarray:
        """Hit the POST /embed-text endpoint (JSON)."""
        
        if use_cache:
            cache_key = self.create_cache_key(texts)
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
                    json=payload
                )
                
                if response.status_code != 200:
                    print(f"❌ Space Error {response.status_code}: {response.text}")
                    break

                # Use parser here
                vector = self._parse_response(response.json())
                all_embeddings.append(vector)

            except Exception as e:
                print(f"❌ API Error (Text): {e}")

        if not all_embeddings: return np.zeros((len(texts), EMBEDDING_DIM))

        final_embeddings = np.vstack(all_embeddings)
        final_embeddings = self._normalize(final_embeddings)

        if use_cache:
            with open(cache_file, 'wb') as f: pickle.dump(final_embeddings, f)

        return final_embeddings

    def extract_image_embeddings_from_pil(self, pil_images: List[Image.Image]) -> np.ndarray:
        """Helper for in-memory images."""
        if not pil_images: return np.array([]).reshape(0, EMBEDDING_DIM)
        
        all_embeddings = []
        for img in pil_images:
            try:
                files = self._prepare_image_file(img)

                response = http_requests.post(
                    f"{SPACE_URL}/embed",
                    headers=self.auth_headers,
                    files=files
                )
                
                if response.status_code == 200:
                    # Use parser here
                    vector = self._parse_response(response.json())
                    all_embeddings.append(vector)
                else:
                    print(f"❌ Space Error (PIL): {response.text}")
            except Exception as e:
                print(f"❌ API Error (PIL): {e}")

        if not all_embeddings: return np.array([]).reshape(0, EMBEDDING_DIM)
        return self._normalize(np.vstack(all_embeddings))