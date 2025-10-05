"""Test script to verify all key functions work correctly."""

import sys
import traceback

def test_imports():
    """Test all module imports."""
    print("Testing imports...")
    try:
        from visualization.bokeh_canvas import create_interactive_canvas, pil_to_base64_url
        from visualization.theme import THEME_COLORS, ANIMATION_CSS
        from components import show_axis_editor, show_visual_settings, show_history_timeline
        from models import ImageMetadata, HistoryGroup
        print("[PASS] All imports successful")
        return True
    except Exception as e:
        print(f"[FAIL] Import error: {e}")
        traceback.print_exc()
        return False

def test_theme_colors():
    """Test theme colors configuration."""
    print("\nTesting theme colors...")
    try:
        from visualization.theme import THEME_COLORS

        required_colors = [
            'bg_primary', 'bg_secondary', 'border', 'border_hover', 'border_active',
            'primary_blue', 'success_green', 'warning_orange', 'selection_orange',
            'text_primary', 'btn_primary'
        ]

        for color_key in required_colors:
            if color_key not in THEME_COLORS:
                print(f"[FAIL] Missing color: {color_key}")
                return False
            if not THEME_COLORS[color_key].startswith('#'):
                print(f"[FAIL] Invalid color format for {color_key}: {THEME_COLORS[color_key]}")
                return False

        print(f"[PASS] All {len(required_colors)} theme colors configured correctly")
        return True
    except Exception as e:
        print(f"[FAIL] Theme error: {e}")
        traceback.print_exc()
        return False

def test_image_metadata_structure():
    """Test ImageMetadata data structure."""
    print("\nTesting ImageMetadata structure...")
    try:
        from models import ImageMetadata
        from PIL import Image
        import numpy as np
        from datetime import datetime

        # Create dummy image
        dummy_img = Image.new('RGB', (64, 64), color='red')
        dummy_embedding = np.random.rand(512)

        # Create metadata
        metadata = ImageMetadata(
            id=0,
            group_id='test_group',
            pil_image=dummy_img,
            embedding=dummy_embedding,
            coordinates=(0.5, 0.5),
            parents=[],
            children=[],
            generation_method='test',
            prompt='test prompt',
            reference_ids=[],
            timestamp=datetime.now(),
            visible=True
        )

        # Verify attributes
        assert metadata.id == 0
        assert metadata.coordinates == (0.5, 0.5)
        assert metadata.visible == True
        assert len(metadata.parents) == 0
        assert len(metadata.children) == 0

        print("[PASS] ImageMetadata structure working correctly")
        return True
    except Exception as e:
        print(f"[FAIL] ImageMetadata error: {e}")
        traceback.print_exc()
        return False

def test_bokeh_canvas_creation():
    """Test Bokeh canvas creation."""
    print("\nTesting Bokeh canvas creation...")
    try:
        from visualization.bokeh_canvas import create_interactive_canvas
        from models import ImageMetadata
        from PIL import Image
        import numpy as np
        from datetime import datetime

        # Create test images
        test_metadata = []
        for i in range(3):
            img = Image.new('RGB', (64, 64), color=['red', 'green', 'blue'][i])
            metadata = ImageMetadata(
                id=i,
                group_id='test_batch',
                pil_image=img,
                embedding=np.random.rand(512),
                coordinates=(float(i), float(i)),
                parents=[],
                children=[],
                generation_method='batch',
                prompt=f'test image {i}',
                reference_ids=[],
                timestamp=datetime.now(),
                visible=True
            )
            test_metadata.append(metadata)

        # Create canvas
        axis_labels = {'x': ('left', 'right'), 'y': ('bottom', 'top')}
        settings = {'image_size': 120, 'opacity': 0.9, 'remove_background': True}

        plot = create_interactive_canvas(
            images_metadata=test_metadata,
            selected_ids=[0],
            axis_labels=axis_labels,
            settings=settings
        )

        assert plot is not None
        assert hasattr(plot, 'renderers')

        print("[PASS] Bokeh canvas creation successful")
        return True
    except Exception as e:
        print(f"[FAIL] Bokeh canvas error: {e}")
        traceback.print_exc()
        return False

def test_pil_to_base64():
    """Test PIL image to base64 conversion."""
    print("\nTesting PIL to base64 conversion...")
    try:
        from visualization.bokeh_canvas import pil_to_base64_url
        from PIL import Image

        # Create test image
        img = Image.new('RGB', (64, 64), color='red')

        # Convert to base64
        base64_url = pil_to_base64_url(img, size=(32, 32))

        assert base64_url.startswith('data:image/png;base64,')
        assert len(base64_url) > 50  # Should have substantial data

        print("[PASS] PIL to base64 conversion working")
        return True
    except Exception as e:
        print(f"[FAIL] Base64 conversion error: {e}")
        traceback.print_exc()
        return False

def main():
    """Run all tests."""
    print("="*60)
    print("COMPREHENSIVE FUNCTION TESTS")
    print("="*60)

    results = []

    results.append(("Imports", test_imports()))
    results.append(("Theme Colors", test_theme_colors()))
    results.append(("ImageMetadata", test_image_metadata_structure()))
    results.append(("Bokeh Canvas", test_bokeh_canvas_creation()))
    results.append(("PIL to Base64", test_pil_to_base64()))

    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)

    for test_name, passed in results:
        status = "[PASS]" if passed else "[FAIL]"
        print(f"{test_name:.<40} {status}")

    total_passed = sum(1 for _, passed in results if passed)
    total_tests = len(results)

    print(f"\nTotal: {total_passed}/{total_tests} tests passed")

    if total_passed == total_tests:
        print("\n[SUCCESS] ALL TESTS PASSED!")
        return 0
    else:
        print(f"\n[WARNING] {total_tests - total_passed} test(s) failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())
