"""Test script for background removal functionality."""

import numpy as np
from PIL import Image
import cv2
from visualization.interactive_plot import InteractivePlotter

def create_test_image():
    """Create a test image with a white background and colored object."""
    # Create a white background
    img = np.ones((200, 200, 3), dtype=np.uint8) * 255
    
    # Draw a colored circle (representing a shoe)
    cv2.circle(img, (100, 100), 50, (100, 50, 200), -1)  # Purple circle
    cv2.circle(img, (100, 100), 40, (200, 100, 50), -1)  # Orange inner circle
    
    # Add some noise to make it more realistic
    noise = np.random.randint(-20, 20, img.shape, dtype=np.int16)
    img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    
    return Image.fromarray(img)

def test_background_removal():
    """Test the background removal functionality."""
    print("Testing background removal functionality...")
    
    # Create test image
    test_img = create_test_image()
    print(f"Created test image: {test_img.size}")
    
    # Initialize plotter
    plotter = InteractivePlotter()
    
    # Test different methods
    methods = ["simple", "threshold", "grabcut"]
    
    for method in methods:
        print(f"\nTesting {method} method...")
        try:
            result = plotter.remove_background_fast(test_img, method=method)
            print(f"✅ {method} method successful: {result.mode}")
            
            # Save result for visual inspection
            result.save(f"test_bg_removal_{method}.png")
            print(f"Saved result as test_bg_removal_{method}.png")
            
        except Exception as e:
            print(f"❌ {method} method failed: {e}")
    
    # Test batch processing
    print("\nTesting batch processing...")
    test_images = [create_test_image() for _ in range(3)]
    
    try:
        base64_images = plotter.images_to_base64(
            test_images, 
            size=(64, 64),
            remove_bg=True,
            bg_method="simple"
        )
        print(f"✅ Batch processing successful: {len(base64_images)} images processed")
        
    except Exception as e:
        print(f"❌ Batch processing failed: {e}")

if __name__ == "__main__":
    test_background_removal()
