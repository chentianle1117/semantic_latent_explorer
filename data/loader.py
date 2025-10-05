"""Data loader for UT Zappos50K dataset."""

import os
import pandas as pd
import numpy as np
from pathlib import Path
from PIL import Image
from typing import List, Dict, Tuple, Optional
import random
from tqdm import tqdm
import pickle

from config import *

class ZapposDataLoader:
    """Loads and manages UT Zappos50K dataset."""
    
    def __init__(self):
        self.images_path = IMAGES_PATH
        self.data_path = DATA_PATH
        self.image_paths = []
        self.metadata = None
        self.attributes_data = None
        
    def discover_images(self, max_images: int = 1000) -> List[str]:
        """Discover all image paths in the dataset."""
        print(f"Discovering images in {self.images_path}")
        
        image_extensions = {'.jpg', '.jpeg', '.png', '.bmp'}
        all_paths = []
        
        # Walk through the directory structure
        for root, dirs, files in os.walk(self.images_path):
            for file in files:
                if Path(file).suffix.lower() in image_extensions:
                    full_path = os.path.join(root, file)
                    all_paths.append(full_path)
        
        print(f"Found {len(all_paths)} total images")
        
        # Randomly sample if we have more than max_images
        if len(all_paths) > max_images:
            all_paths = random.sample(all_paths, max_images)
            print(f"Randomly sampled {max_images} images")
        
        self.image_paths = all_paths
        return all_paths
    
    def load_metadata(self) -> Optional[pd.DataFrame]:
        """Load metadata CSV if available."""
        metadata_path = self.data_path / "meta-data.csv"
        
        if metadata_path.exists():
            try:
                metadata = pd.read_csv(metadata_path)
                print(f"Loaded metadata for {len(metadata)} items")
                self.metadata = metadata
                return metadata
            except Exception as e:
                print(f"Error loading metadata: {e}")
                return None
        else:
            print(f"Metadata file not found at {metadata_path}")
            return None
    
    def extract_path_metadata(self, image_path: str) -> Dict[str, str]:
        """Extract metadata from image path structure."""
        path_parts = Path(image_path).parts
        
        # Find the parts after 'ut-zap50k-images'
        try:
            start_idx = path_parts.index('ut-zap50k-images')
            relevant_parts = path_parts[start_idx + 1:]
            
            metadata = {
                'full_path': image_path,
                'filename': Path(image_path).name,
                'category': relevant_parts[0] if len(relevant_parts) > 0 else 'Unknown',
                'subcategory': relevant_parts[1] if len(relevant_parts) > 1 else 'Unknown',
                'brand': relevant_parts[2] if len(relevant_parts) > 2 else 'Unknown',
            }
            
            return metadata
            
        except (ValueError, IndexError):
            return {
                'full_path': image_path,
                'filename': Path(image_path).name,
                'category': 'Unknown',
                'subcategory': 'Unknown', 
                'brand': 'Unknown'
            }
    
    def create_image_dataframe(self) -> pd.DataFrame:
        """Create a dataframe with image paths and extracted metadata."""
        if not self.image_paths:
            self.discover_images()
        
        data = []
        print("Extracting metadata from image paths...")
        
        for img_path in tqdm(self.image_paths):
            metadata = self.extract_path_metadata(img_path)
            data.append(metadata)
        
        df = pd.DataFrame(data)
        print(f"Created dataframe with {len(df)} images")
        print(f"Categories: {df['category'].value_counts().to_dict()}")
        
        return df
    
    def load_sample_images(self, image_paths: List[str], size: Tuple[int, int] = IMAGE_SIZE) -> List[Image.Image]:
        """Load and preprocess a sample of images."""
        images = []
        
        print(f"Loading {len(image_paths)} images...")
        for path in tqdm(image_paths):  # Load all provided images
            try:
                img = Image.open(path).convert('RGB')
                if size:
                    img = img.resize(size, Image.Resampling.LANCZOS)
                images.append(img)
            except Exception as e:
                print(f"Error loading {path}: {e}")
                # Add a blank image as placeholder
                images.append(Image.new('RGB', size, color='white'))
        
        return images
    
    def get_category_sample(self, category: str, n_images: int = 50) -> List[str]:
        """Get a sample of images from a specific category."""
        if not self.image_paths:
            self.discover_images()
        
        category_paths = [path for path in self.image_paths 
                         if category.lower() in path.lower()]
        
        if len(category_paths) > n_images:
            category_paths = random.sample(category_paths, n_images)
        
        print(f"Found {len(category_paths)} images for category '{category}'")
        return category_paths
    
    def save_processed_data(self, df: pd.DataFrame, filename: str = "processed_dataset.pkl"):
        """Save processed dataframe to cache."""
        cache_path = CACHE_DIR / filename
        with open(cache_path, 'wb') as f:
            pickle.dump(df, f)
        print(f"Saved processed data to {cache_path}")
    
    def load_processed_data(self, filename: str = "processed_dataset.pkl") -> Optional[pd.DataFrame]:
        """Load processed dataframe from cache."""
        cache_path = CACHE_DIR / filename
        if cache_path.exists():
            with open(cache_path, 'rb') as f:
                df = pickle.load(f)
            print(f"Loaded processed data from {cache_path}")
            return df
        return None

def create_sample_dataset(n_images: int = 200) -> pd.DataFrame:
    """Create a sample dataset for prototyping."""
    loader = ZapposDataLoader()
    
    # Try to load from cache first
    cached_df = loader.load_processed_data()
    if cached_df is not None and len(cached_df) >= n_images:
        return cached_df.head(n_images)
    
    # Otherwise create new
    loader.discover_images(max_images=n_images)
    df = loader.create_image_dataframe()
    
    # Save to cache
    loader.save_processed_data(df)
    
    return df

if __name__ == "__main__":
    # Test the data loader
    print("Testing Zappos Data Loader...")
    
    loader = ZapposDataLoader()
    
    # Test image discovery
    paths = loader.discover_images(max_images=100)
    print(f"Discovered {len(paths)} images")
    
    # Test metadata extraction
    if paths:
        sample_metadata = loader.extract_path_metadata(paths[0])
        print(f"Sample metadata: {sample_metadata}")
    
    # Create sample dataframe
    df = loader.create_image_dataframe()
    print(f"Dataframe shape: {df.shape}")
    print(df.head())