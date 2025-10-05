"""Test script to verify installation and basic functionality."""

def test_imports():
    """Test that all required packages can be imported."""
    print("Testing imports...")
    
    try:
        import numpy as np
        print("✅ NumPy imported successfully")
    except ImportError as e:
        print(f"❌ NumPy import failed: {e}")
        return False
    
    try:
        import pandas as pd
        print("✅ Pandas imported successfully")
    except ImportError as e:
        print(f"❌ Pandas import failed: {e}")
        return False
    
    try:
        import torch
        print(f"✅ PyTorch imported successfully (version: {torch.__version__})")
    except ImportError as e:
        print(f"❌ PyTorch import failed: {e}")
        return False
    
    try:
        import torchvision
        print(f"✅ TorchVision imported successfully (version: {torchvision.__version__})")
    except ImportError as e:
        print(f"❌ TorchVision import failed: {e}")
        return False
    
    try:
        from PIL import Image
        print("✅ PIL imported successfully")
    except ImportError as e:
        print(f"❌ PIL import failed: {e}")
        return False
    
    try:
        import open_clip
        print("✅ OpenCLIP imported successfully")
    except ImportError as e:
        print(f"❌ OpenCLIP import failed: {e}")
        return False
    
    try:
        import streamlit as st
        print("✅ Streamlit imported successfully")
    except ImportError as e:
        print(f"❌ Streamlit import failed: {e}")
        return False
    
    try:
        import plotly
        print("✅ Plotly imported successfully")
    except ImportError as e:
        print(f"❌ Plotly import failed: {e}")
        return False
    
    try:
        import umap
        print("✅ UMAP imported successfully")
    except ImportError as e:
        print(f"❌ UMAP import failed: {e}")
        return False
    
    return True

def test_basic_functionality():
    """Test basic functionality of our modules."""
    print("\nTesting basic functionality...")
    
    try:
        from config import MAX_IMAGES, IMAGE_SIZE, CLIP_MODEL
        print(f"✅ Config loaded: MAX_IMAGES={MAX_IMAGES}, IMAGE_SIZE={IMAGE_SIZE}, CLIP_MODEL={CLIP_MODEL}")
    except Exception as e:
        print(f"❌ Config loading failed: {e}")
        return False
    
    try:
        from data.loader import ZapposDataLoader
        loader = ZapposDataLoader()
        print("✅ ZapposDataLoader created successfully")
    except Exception as e:
        print(f"❌ ZapposDataLoader creation failed: {e}")
        return False
    
    try:
        from models.embeddings import CLIPEmbedder
        print("✅ CLIPEmbedder class imported successfully")
    except Exception as e:
        print(f"❌ CLIPEmbedder import failed: {e}")
        return False
    
    try:
        from models.semantic_axes import SemanticAxisBuilder
        print("✅ SemanticAxisBuilder imported successfully")
    except Exception as e:
        print(f"❌ SemanticAxisBuilder import failed: {e}")
        return False
    
    try:
        from visualization.interactive_plot import InteractivePlotter
        print("✅ InteractivePlotter imported successfully")
    except Exception as e:
        print(f"❌ InteractivePlotter import failed: {e}")
        return False
    
    return True

def test_device_availability():
    """Test device availability for PyTorch."""
    print("\nTesting device availability...")
    
    try:
        import torch
        if torch.cuda.is_available():
            print(f"✅ CUDA available: {torch.cuda.get_device_name(0)}")
            print(f"   CUDA version: {torch.version.cuda}")
        else:
            print("⚠️  CUDA not available, will use CPU")
        
        print(f"✅ PyTorch device: {'cuda' if torch.cuda.is_available() else 'cpu'}")
        return True
    except Exception as e:
        print(f"❌ Device test failed: {e}")
        return False

if __name__ == "__main__":
    print("🔍 Testing Zappos Semantic Explorer Installation\n")
    
    # Test imports
    imports_ok = test_imports()
    
    if imports_ok:
        # Test basic functionality
        functionality_ok = test_basic_functionality()
        
        # Test device availability
        device_ok = test_device_availability()
        
        print("\n" + "="*50)
        if imports_ok and functionality_ok and device_ok:
            print("🎉 All tests passed! Installation is working correctly.")
            print("\nYou can now run: streamlit run app.py")
        else:
            print("❌ Some tests failed. Please check the error messages above.")
    else:
        print("\n❌ Import tests failed. Please install missing dependencies.")
        print("Run: pip install -r requirements.txt")
