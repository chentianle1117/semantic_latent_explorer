"""
CLIP embedding extraction via Jina AI API.

Primary:  jina-clip-v2 via https://api.jina.ai/v1/embeddings
          True CLIP-style shared embedding space for text AND images.
          Free tier: 10M tokens/key — get yours at https://jina.ai/

Fallback: CLIPEmbedder falls back to zeros if the API is unreachable,
          so the app degrades gracefully rather than crashing.
"""

import os
import base64
import time
import numpy as np
import requests as http_requests
from io import BytesIO
from typing import List, Union, Optional
from PIL import Image
from pathlib import Path
import pickle
import hashlib
from dotenv import load_dotenv

load_dotenv()

# ------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------
EMBEDDING_DIM = 1024          # jina-clip-v2 native dimension
EMBEDDINGS_CACHE = Path("cache/embeddings")
JINA_API_URL = "https://api.jina.ai/v1/embeddings"
JINA_MODEL = "jina-clip-v2"


class JinaCLIPEmbedder:
    """
    Embedder using Jina AI's jina-clip-v2 model.

    Both text and image inputs are projected to the same 1024-dim
    shared CLIP embedding space, so dot products between text axes
    and image embeddings are meaningful cosine similarities.

    Sign up at https://jina.ai/ to get a free API key (10M tokens).
    Set it as JINA_API_KEY in backend/.env.
    """

    def __init__(self):
        self.api_key = os.getenv("JINA_API_KEY", "")
        if not self.api_key:
            print("⚠️  JINA_API_KEY not set — embeddings will return zeros.")
            print("    Get a free key at https://jina.ai/ and add it to backend/.env")
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        EMBEDDINGS_CACHE.mkdir(parents=True, exist_ok=True)
        print(f"🔌 Jina CLIP v2 embedder ready ({JINA_MODEL}, dim={EMBEDDING_DIM})")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _normalize(self, v: np.ndarray) -> np.ndarray:
        """L2-normalize so dot product == cosine similarity."""
        if v.ndim == 1:
            norm = np.linalg.norm(v)
            return v / (norm + 1e-12)
        norm = np.linalg.norm(v, axis=1, keepdims=True)
        return v / (norm + 1e-12)

    def _prepare_image_b64(self, path_or_img: Union[str, Image.Image]) -> str:
        """Convert an image to a base64 data URI suitable for the Jina API."""
        img = Image.open(path_or_img) if isinstance(path_or_img, str) else path_or_img
        if img.mode == "RGBA":
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[3])
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")
        img = img.resize((512, 512), Image.LANCZOS)
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=85)
        # Return raw base64 (no data URI prefix) — Jina API expects {"image": "<raw b64>"}
        return base64.b64encode(buf.getvalue()).decode()

    def _post(self, payload: dict) -> Optional[dict]:
        """POST to the Jina embeddings endpoint with retry on rate-limit."""
        if not self.api_key:
            return None
        for attempt, delay in enumerate([5, 10, 20]):
            try:
                r = http_requests.post(
                    JINA_API_URL,
                    headers=self.headers,
                    json=payload,
                    timeout=90,
                )
                if r.status_code == 429:
                    print(f"⏳ Jina rate limit, waiting {delay}s… (attempt {attempt+1}/3)")
                    time.sleep(delay)
                    continue
                if r.status_code != 200:
                    print(f"⚠️ Jina API error {r.status_code}: {r.text[:300]}")
                    return None
                return r.json()
            except http_requests.exceptions.Timeout:
                print(f"⚠️ Jina request timed out (attempt {attempt+1}/3)")
                if attempt < 2:
                    time.sleep(delay)
            except Exception as e:
                print(f"⚠️ Jina request error: {e}")
                if attempt < 2:
                    time.sleep(delay)
        return None

    def _extract_embeddings(self, resp: Optional[dict], count: int) -> np.ndarray:
        """Parse the 'data' array from a Jina response into a numpy array."""
        if resp is None or "data" not in resp:
            return np.zeros((count, EMBEDDING_DIM), dtype=np.float32)
        items = sorted(resp["data"], key=lambda x: x["index"])
        rows = [np.array(item["embedding"], dtype=np.float32) for item in items]
        if len(rows) < count:
            rows += [np.zeros(EMBEDDING_DIM, dtype=np.float32)] * (count - len(rows))
        return np.vstack(rows[:count])

    def create_cache_key(self, data: Union[str, List[str]], preserve_order: bool = False) -> str:
        if isinstance(data, str):
            content = data
        else:
            content = "|".join(data if preserve_order else sorted(data))
        return hashlib.md5(f"{JINA_MODEL}|{content}".encode()).hexdigest()

    # ------------------------------------------------------------------
    # Public API (same interface as the old CLIPEmbedder)
    # ------------------------------------------------------------------

    def extract_text_embeddings(self, texts: List[str], use_cache: bool = True) -> np.ndarray:
        """Embed a list of text strings into the shared CLIP space."""
        if not texts:
            return np.zeros((0, EMBEDDING_DIM), dtype=np.float32)

        if use_cache:
            cache_key = self.create_cache_key(texts, preserve_order=False)
            cache_file = EMBEDDINGS_CACHE / f"jina_texts_{cache_key}.pkl"
            if cache_file.exists():
                with open(cache_file, "rb") as f:
                    return pickle.load(f)

        print(f"🚀 Jina CLIP: embedding {len(texts)} texts…")
        payload = {
            "model": JINA_MODEL,
            "normalized": True,
            "task": "retrieval.query",   # text axes are queries
            "input": [{"text": t} for t in texts],
        }
        resp = self._post(payload)
        arr = self._extract_embeddings(resp, len(texts))
        result = self._normalize(arr)

        if use_cache:
            with open(cache_file, "wb") as f:
                pickle.dump(result, f)
        return result

    def extract_image_embeddings(
        self,
        image_paths: List[str],
        batch_size: int = 8,
        use_cache: bool = True,
    ) -> np.ndarray:
        """Embed a list of image file paths into the shared CLIP space."""
        if not image_paths:
            return np.zeros((0, EMBEDDING_DIM), dtype=np.float32)

        if use_cache:
            cache_key = self.create_cache_key(image_paths, preserve_order=True)
            cache_file = EMBEDDINGS_CACHE / f"jina_images_{cache_key}.pkl"
            if cache_file.exists():
                print(f"✅ Cached Jina embeddings for {len(image_paths)} images")
                with open(cache_file, "rb") as f:
                    return pickle.load(f)

        print(f"🚀 Jina CLIP: embedding {len(image_paths)} images…")
        all_embeddings: List[np.ndarray] = []

        for i in range(0, len(image_paths), batch_size):
            batch_paths = image_paths[i : i + batch_size]
            inputs: List[Optional[dict]] = []
            for p in batch_paths:
                try:
                    b64 = self._prepare_image_b64(p)
                    inputs.append({"image": b64})
                except Exception as e:
                    print(f"⚠️ Image prep error for {p}: {e}")
                    inputs.append(None)

            valid = [inp for inp in inputs if inp is not None]
            if not valid:
                all_embeddings.extend([np.zeros(EMBEDDING_DIM)] * len(batch_paths))
                continue

            resp = self._post({"model": JINA_MODEL, "normalized": True, "task": "retrieval.query", "input": valid})
            valid_rows = self._extract_embeddings(resp, len(valid))

            vi = 0
            for inp in inputs:
                if inp is None:
                    all_embeddings.append(np.zeros(EMBEDDING_DIM, dtype=np.float32))
                else:
                    all_embeddings.append(valid_rows[vi])
                    vi += 1

        result = self._normalize(np.vstack(all_embeddings))
        if use_cache:
            with open(cache_file, "wb") as f:
                pickle.dump(result, f)
        return result

    def extract_image_embeddings_from_pil(self, pil_images: List[Image.Image]) -> np.ndarray:
        """Embed in-memory PIL images into the shared CLIP space (no file caching)."""
        if not pil_images:
            return np.zeros((0, EMBEDDING_DIM), dtype=np.float32)

        inputs: List[Optional[dict]] = []
        for img in pil_images:
            try:
                b64 = self._prepare_image_b64(img)
                inputs.append({"image": b64})
            except Exception as e:
                print(f"⚠️ PIL image prep error: {e}")
                inputs.append(None)

        valid = [inp for inp in inputs if inp is not None]
        if not valid:
            return np.zeros((len(pil_images), EMBEDDING_DIM), dtype=np.float32)

        resp = self._post({"model": JINA_MODEL, "normalized": True, "task": "retrieval.query", "input": valid})
        valid_rows = self._extract_embeddings(resp, len(valid))

        all_embeddings: List[np.ndarray] = []
        vi = 0
        for inp in inputs:
            if inp is None:
                all_embeddings.append(np.zeros(EMBEDDING_DIM, dtype=np.float32))
            else:
                all_embeddings.append(valid_rows[vi])
                vi += 1

        return self._normalize(np.vstack(all_embeddings))


# ------------------------------------------------------------------
# Backwards-compatibility aliases
# ------------------------------------------------------------------

class CLIPEmbedder(JinaCLIPEmbedder):
    """
    Main embedder class (used by backend/api.py via initialize_embedder).
    Delegates to JinaCLIPEmbedder (jina-clip-v2 API).
    """
    pass


class HuggingFaceCLIPEmbedder(JinaCLIPEmbedder):
    """
    Kept for import compatibility (models/__init__.py exports it).
    Now delegates to JinaCLIPEmbedder — the HF Inference API did not
    support multimodal CLIP reliably (model not deployed on any provider).
    """

    def __init__(self, model_id: str = "jina-clip-v2"):
        print(f"[HuggingFaceCLIPEmbedder] Redirecting to Jina CLIP v2 (HF API unavailable for CLIP)")
        super().__init__()
