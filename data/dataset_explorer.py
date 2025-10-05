"""Quick script to explore your Zappos dataset structure."""

import os
from pathlib import Path
import pandas as pd

# Your paths
DATASET_ROOT = Path("W:/CMU_Academics/2025 Fall/Thesis Demo/raw_data")
IMAGES_PATH = DATASET_ROOT / "ut-zap50k-images" / "ut-zap50k-images"
DATA_PATH = DATASET_ROOT / "ut-zap50k-data" / "ut-zap50k-data"

def explore_folder_structure(path, max_depth=3, current_depth=0):
    """Explore folder structure."""
    if current_depth >= max_depth:
        return
    
    try:
        items = list(path.iterdir())
        folders = [item for item in items if item.is_dir()]
        files = [item for item in items if item.is_file()]
        
        indent = "  " * current_depth
        print(f"{indent}{path.name}/ ({len(folders)} folders, {len(files)} files)")
        
        # Show first few folders
        for folder in folders[:5]:
            explore_folder_structure(folder, max_depth, current_depth + 1)
        
        if len(folders) > 5:
            print(f"{indent}  ... and {len(folders) - 5} more folders")
        
        # Show first few files
        for file in files[:3]:
            print(f"{indent}  📄 {file.name}")
        
        if len(files) > 3:
            print(f"{indent}  ... and {len(files) - 3} more files")
            
    except PermissionError:
        print(f"{indent}❌ Permission denied: {path}")

def count_images(images_path):
    """Count total images in dataset."""
    image_extensions = {'.jpg', '.jpeg', '.png', '.bmp'}
    total_images = 0
    
    for root, dirs, files in os.walk(images_path):
        for file in files:
            if Path(file).suffix.lower() in image_extensions:
                total_images += 1
    
    return total_images

def explore_metadata(data_path):
    """Explore metadata files."""
    print(f"\n📊 Exploring metadata in {data_path}")
    
    if not data_path.exists():
        print("❌ Data path doesn't exist")
        return
    
    for file in data_path.iterdir():
        if file.is_file():
            print(f"📄 {file.name} ({file.stat().st_size / 1024:.1f} KB)")
            
            # Try to load CSV files
            if file.suffix == '.csv':
                try:
                    df = pd.read_csv(file)
                    print(f"   → CSV: {len(df)} rows, {len(df.columns)} columns")
                    print(f"   → Columns: {list(df.columns)[:5]}...")
                except Exception as e:
                    print(f"   → Error reading CSV: {e}")

if __name__ == "__main__":
    print("🔍 Exploring UT Zappos50K Dataset Structure")
    print("=" * 50)
    
    # Check main paths
    print(f"📁 Dataset root: {DATASET_ROOT}")
    print(f"   Exists: {DATASET_ROOT.exists()}")
    
    print(f"\n📁 Images path: {IMAGES_PATH}")
    print(f"   Exists: {IMAGES_PATH.exists()}")
    
    print(f"\n📁 Data path: {DATA_PATH}")
    print(f"   Exists: {DATA_PATH.exists()}")
    
    # Explore images structure
    if IMAGES_PATH.exists():
        print(f"\n🖼️ Image folder structure:")
        explore_folder_structure(IMAGES_PATH, max_depth=4)
        
        print(f"\n📊 Counting images...")
        total_images = count_images(IMAGES_PATH)
        print(f"   Total images found: {total_images}")
    
    # Explore metadata
    if DATA_PATH.exists():
        explore_metadata(DATA_PATH)
    
    print(f"\n✅ Exploration complete!")