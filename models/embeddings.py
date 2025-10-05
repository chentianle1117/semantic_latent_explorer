"""CLIP embedding extraction for images and text."""

import numpy as np
import torch
import open_clip
from PIL import Image
from typing import List, Union, Optional
import pickle
from pathlib import Path
from tqdm import tqdm
import hashlib

from config import *

class CLIPEmbedder:
    """Handles CLIP embedding extraction and caching."""
    
    def __init__(self, model_name: str = CLIP_MODEL, pretrained: str = CLIP_PRETRAINED):
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        print(f"Using device: {self.device}")
        
        # Load CLIP model
        print(f"Loading CLIP model: {model_name}")
        self.model, _, self.preprocess = open_clip.create_model_and_transforms(
            model_name, pretrained=pretrained
        )
        self.model = self.model.to(self.device)
        self.model.eval()
        
        # Load tokenizer for text
        self.tokenizer = open_clip.get_tokenizer(model_name)
        
        print("CLIP model loaded successfully!")
    
    def create_cache_key(self, data: Union[str, List[str]]) -> str:
        """Create a hash key for caching embeddings."""
        if isinstance(data, str):
            content = data
        else:
            content = "|".join(sorted(data))
        
        return hashlib.md5(content.encode()).hexdigest()
    
    def extract_image_embeddings(
        self, 
        image_paths: List[str], 
        batch_size: int = 32,
        use_cache: bool = True
    ) -> np.ndarray:
        """Extract CLIP embeddings from image paths."""
        
        # Check cache first
        if use_cache:
            cache_key = self.create_cache_key(image_paths)
            cache_file = EMBEDDINGS_CACHE / f"images_{cache_key}.pkl"
            
            if cache_file.exists():
                print(f"Loading cached embeddings for {len(image_paths)} images")
                with open(cache_file, 'rb') as f:
                    return pickle.load(f)
        
        print(f"Extracting embeddings for {len(image_paths)} images...")
        embeddings = []
        
        for i in tqdm(range(0, len(image_paths), batch_size)):
            batch_paths = image_paths[i:i + batch_size]
            batch_embeddings = self._process_image_batch(batch_paths)
            embeddings.append(batch_embeddings)
        
        # Concatenate all embeddings
        all_embeddings = np.vstack(embeddings) if embeddings else np.array([])
        
        # Cache the results
        if use_cache and len(all_embeddings) > 0:
            with open(cache_file, 'wb') as f:
                pickle.dump(all_embeddings, f)
            print(f"Cached embeddings to {cache_file}")
        
        return all_embeddings
    
    def _process_image_batch(self, image_paths: List[str]) -> np.ndarray:
        """Process a batch of images and extract embeddings."""
        batch_images = []
        valid_indices = []
        
        for idx, path in enumerate(image_paths):
            try:
                # Load and preprocess image
                image = Image.open(path).convert('RGB')
                image_tensor = self.preprocess(image)
                batch_images.append(image_tensor)
                valid_indices.append(idx)
                
            except Exception as e:
                print(f"Error loading {path}: {e}")
                # Skip invalid images
                continue
        
        if not batch_images:
            return np.array([]).reshape(0, EMBEDDING_DIM)
        
        # Stack tensors and move to device
        batch_tensor = torch.stack(batch_images).to(self.device)
        
        # Extract embeddings
        with torch.no_grad():
            image_features = self.model.encode_image(batch_tensor)
            # Normalize embeddings
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)
        
        return image_features.cpu().numpy()
    
    def extract_text_embeddings(
        self, 
        texts: List[str], 
        use_cache: bool = True
    ) -> np.ndarray:
        """Extract CLIP embeddings from text prompts."""
        
        # Check cache first
        if use_cache:
            cache_key = self.create_cache_key(texts)
            cache_file = EMBEDDINGS_CACHE / f"texts_{cache_key}.pkl"
            
            if cache_file.exists():
                print(f"Loading cached text embeddings for {len(texts)} texts")
                with open(cache_file, 'rb') as f:
                    return pickle.load(f)
        
        print(f"Extracting text embeddings for {len(texts)} texts...")
        
        # Tokenize texts
        text_tokens = self.tokenizer(texts).to(self.device)
        
        # Extract embeddings
        with torch.no_grad():
            text_features = self.model.encode_text(text_tokens)
            # Normalize embeddings
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)
        
        embeddings = text_features.cpu().numpy()
        
        # Cache the results
        if use_cache:
            with open(cache_file, 'wb') as f:
                pickle.dump(embeddings, f)
            print(f"Cached text embeddings to {cache_file}")
        
        return embeddings
    
    def compute_similarity(
        self, 
        image_embeddings: np.ndarray, 
        text_embeddings: np.ndarray
    ) -> np.ndarray:
        """Compute cosine similarity between image and text embeddings."""
        # Ensure embeddings are normalized
        image_embeddings = image_embeddings / np.linalg.norm(image_embeddings, axis=1, keepdims=True)
        text_embeddings = text_embeddings / np.linalg.norm(text_embeddings, axis=1, keepdims=True)
        
        # Compute similarity matrix
        similarity = np.dot(image_embeddings, text_embeddings.T)
        return similarity
    
    def find_similar_images(
        self, 
        query_embedding: np.ndarray, 
        image_embeddings: np.ndarray, 
        top_k: int = 10
    ) -> List[int]:
        """Find most similar images to a query embedding."""
        # Compute similarities
        similarities = np.dot(image_embeddings, query_embedding.T).flatten()
        
        # Get top-k indices
        top_indices = np.argsort(similarities)[::-1][:top_k]
        
        return top_indices.tolist()
    
    def extract_image_embeddings_from_pil(self, pil_images: List[Image.Image]) -> np.ndarray:
        """Extract embeddings directly from PIL Images (for generated images).
        
        Args:
            pil_images: List of PIL Image objects
            
        Returns:
            NumPy array of embeddings (N, 512)
        """
        embeddings = []
        
        for img in pil_images:
            # Preprocess PIL image
            img_tensor = self.preprocess(img).unsqueeze(0).to(self.device)
            
            with torch.no_grad():
                embedding = self.model.encode_image(img_tensor)
                embedding = embedding / embedding.norm(dim=-1, keepdim=True)
                embeddings.append(embedding.cpu().numpy())
        
        return np.vstack(embeddings) if embeddings else np.array([]).reshape(0, EMBEDDING_DIM)

def extract_embeddings_for_dataset(image_paths: List[str], batch_size: int = 32) -> np.ndarray:
    """Convenience function to extract embeddings for a list of image paths."""
    embedder = CLIPEmbedder()
    return embedder.extract_image_embeddings(image_paths, batch_size=batch_size)

if __name__ == "__main__":
    # Test the embedding extractor
    print("Testing CLIP Embedding Extractor...")
    
    embedder = CLIPEmbedder()
    
    # Test text embeddings
    test_texts = ["a red sneaker", "formal black shoes", "comfortable sandals"]
    text_embeddings = embedder.extract_text_embeddings(test_texts)
    print(f"Text embeddings shape: {text_embeddings.shape}")
    
    # Test image embeddings with a few sample images
    from data.loader import ZapposDataLoader
    
    loader = ZapposDataLoader()
    sample_paths = loader.get_category_sample("Shoes", n_images=5)
    
    if sample_paths:
        image_embeddings = embedder.extract_image_embeddings(sample_paths)
        print(f"Image embeddings shape: {image_embeddings.shape}")
        
        # Test similarity computation
        similarities = embedder.compute_similarity(image_embeddings, text_embeddings)
        print(f"Similarity matrix shape: {similarities.shape}")
        print(f"Sample similarities: {similarities[0]}")
    else:
        print("No sample images found for testing")