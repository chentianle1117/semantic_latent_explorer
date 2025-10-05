"""
Integration test simulating complete user workflow.
Tests: batch generation -> UMAP -> selection -> interpolation -> axis reorganization
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
from PIL import Image
from datetime import datetime
import umap

print("="*70)
print("INTEGRATION TEST: Complete User Workflow")
print("="*70)

def create_mock_session_state():
    """Create mock session state."""
    class MockState:
        def __init__(self):
            self.images_metadata = []
            self.history_groups = []
            self.selected_image_ids = []
            self.umap_reducer = None
            self.embedder = None
            self.axis_labels = {
                'x': ('formal', 'sporty'),
                'y': ('dark', 'colorful')
            }
            self.axis_builder = None

        def get(self, key, default=None):
            return getattr(self, key, default)

    return MockState()

# Test 1: Initialize and generate batch
print("\n[TEST 1] Batch Image Generation + UMAP Encoding")
print("-" * 70)

try:
    from models import ImageMetadata, HistoryGroup

    # Create mock images (simulating SD generation)
    mock_images = []
    for i in range(5):
        img = Image.new('RGB', (512, 512), color=['red', 'green', 'blue', 'yellow', 'purple'][i])
        mock_images.append(img)

    # Create mock embeddings (simulating CLIP encoding)
    mock_embeddings = np.random.randn(5, 512).astype(np.float32)
    # Normalize embeddings
    mock_embeddings = mock_embeddings / np.linalg.norm(mock_embeddings, axis=1, keepdims=True)

    print(f"  Generated {len(mock_images)} mock images")
    print(f"  Created {len(mock_embeddings)} CLIP embeddings (512-dim)")

    # CRITICAL: Create UMAP space (fit_transform on initial batch)
    reducer = umap.UMAP(
        n_components=2,
        random_state=42,
        init='random',  # For small batch
        n_neighbors=min(15, len(mock_embeddings) - 1)
    )
    coords = reducer.fit_transform(mock_embeddings)

    print(f"  UMAP reducer created and fitted")
    print(f"  Coordinates shape: {coords.shape}")
    print(f"  Coordinate ranges: X=[{coords[:,0].min():.2f}, {coords[:,0].max():.2f}], Y=[{coords[:,1].min():.2f}, {coords[:,1].max():.2f}]")

    # Create metadata
    images_metadata = []
    for i in range(len(mock_images)):
        meta = ImageMetadata(
            id=i,
            group_id='batch_0',
            pil_image=mock_images[i],
            embedding=mock_embeddings[i],
            coordinates=(float(coords[i, 0]), float(coords[i, 1])),
            parents=[],
            children=[],
            generation_method='batch',
            prompt='test shoe',
            reference_ids=[],
            timestamp=datetime.now(),
            visible=True
        )
        images_metadata.append(meta)

    print(f"  Created {len(images_metadata)} ImageMetadata objects")
    print("  [PASS] Batch generation + UMAP encoding successful")

except Exception as e:
    print(f"  [FAIL] Batch generation failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 2: Select image for reference generation
print("\n[TEST 2] Image Selection")
print("-" * 70)

try:
    selected_id = 2
    selected_img = images_metadata[selected_id]

    print(f"  Selected image ID: {selected_id}")
    print(f"  Selected image coordinates: {selected_img.coordinates}")
    print(f"  Selected image has {len(selected_img.parents)} parents, {len(selected_img.children)} children")
    print("  [PASS] Image selection successful")

except Exception as e:
    print(f"  [FAIL] Image selection failed: {e}")
    sys.exit(1)

# Test 3: Generate from reference (CRITICAL: must use transform, not fit_transform)
print("\n[TEST 3] Reference Generation + UMAP Transform")
print("-" * 70)

try:
    # Simulate generating new image from reference
    new_img = Image.new('RGB', (512, 512), color='orange')

    # Simulate new CLIP embedding (slightly perturbed from reference)
    ref_embedding = images_metadata[selected_id].embedding
    new_embedding = ref_embedding + np.random.randn(512).astype(np.float32) * 0.1
    new_embedding = new_embedding / np.linalg.norm(new_embedding)

    # CRITICAL: Use transform (not fit_transform) to add to existing UMAP space
    new_coord = reducer.transform([new_embedding])[0]

    print(f"  Generated new image from reference ID {selected_id}")
    print(f"  New embedding created (slightly perturbed)")
    print(f"  UMAP transform applied (not fit_transform!)")
    print(f"  New coordinates: ({new_coord[0]:.2f}, {new_coord[1]:.2f})")

    # Create metadata with genealogy
    new_id = len(images_metadata)
    new_meta = ImageMetadata(
        id=new_id,
        group_id='reference_1',
        pil_image=new_img,
        embedding=new_embedding,
        coordinates=(float(new_coord[0]), float(new_coord[1])),
        parents=[selected_id],  # Track parent
        children=[],
        generation_method='reference',
        prompt='variant of test shoe',
        reference_ids=[selected_id],
        timestamp=datetime.now(),
        visible=True
    )

    # Update parent's children list (bidirectional)
    images_metadata[selected_id].children.append(new_id)

    # ACCUMULATE (extend, not replace)
    images_metadata.append(new_meta)

    print(f"  New image ID: {new_id}")
    print(f"  Parent image ID: {selected_id}")
    print(f"  Parent's children list: {images_metadata[selected_id].children}")
    print(f"  New image's parents list: {new_meta.parents}")
    print(f"  Total images now: {len(images_metadata)}")
    print("  [PASS] Reference generation + accumulation successful")

except Exception as e:
    print(f"  [FAIL] Reference generation failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 4: Interpolation between two images
print("\n[TEST 4] Interpolation Between Two Images")
print("-" * 70)

try:
    img_a_id = 0
    img_b_id = 4

    # Simulate interpolated image
    interp_img = Image.new('RGB', (512, 512), color='cyan')

    # Interpolate embeddings (alpha = 0.5)
    emb_a = images_metadata[img_a_id].embedding
    emb_b = images_metadata[img_b_id].embedding
    interp_embedding = (emb_a + emb_b) / 2
    interp_embedding = interp_embedding / np.linalg.norm(interp_embedding)

    # CRITICAL: Transform into existing UMAP space
    interp_coord = reducer.transform([interp_embedding])[0]

    print(f"  Interpolating between image {img_a_id} and {img_b_id}")
    print(f"  Interpolated embedding created (alpha=0.5)")
    print(f"  UMAP transform applied")
    print(f"  Interpolated coordinates: ({interp_coord[0]:.2f}, {interp_coord[1]:.2f})")

    # Create metadata with BOTH parents
    interp_id = len(images_metadata)
    interp_meta = ImageMetadata(
        id=interp_id,
        group_id='interpolation_1',
        pil_image=interp_img,
        embedding=interp_embedding,
        coordinates=(float(interp_coord[0]), float(interp_coord[1])),
        parents=[img_a_id, img_b_id],  # Both parents
        children=[],
        generation_method='interpolation',
        prompt=f'interpolation between {img_a_id} and {img_b_id}',
        reference_ids=[img_a_id, img_b_id],
        timestamp=datetime.now(),
        visible=True
    )

    # Update both parents' children lists
    images_metadata[img_a_id].children.append(interp_id)
    images_metadata[img_b_id].children.append(interp_id)

    # ACCUMULATE
    images_metadata.append(interp_meta)

    print(f"  Interpolated image ID: {interp_id}")
    print(f"  Parent A children: {images_metadata[img_a_id].children}")
    print(f"  Parent B children: {images_metadata[img_b_id].children}")
    print(f"  Interpolated image parents: {interp_meta.parents}")
    print(f"  Total images now: {len(images_metadata)}")
    print("  [PASS] Interpolation successful")

except Exception as e:
    print(f"  [FAIL] Interpolation failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 5: Axis reorganization (semantic projection)
print("\n[TEST 5] Axis Reorganization (Semantic Projection)")
print("-" * 70)

try:
    from models import SemanticAxisBuilder

    # Mock embedder for semantic axis building
    class MockEmbedder:
        def extract_text_embeddings(self, texts):
            # Return random normalized embeddings
            embs = np.random.randn(len(texts), 512).astype(np.float32)
            return embs / np.linalg.norm(embs, axis=1, keepdims=True)

    mock_embedder = MockEmbedder()
    axis_builder = SemanticAxisBuilder(mock_embedder)

    # New axis labels
    new_x_axis = ('casual', 'formal')
    new_y_axis = ('plain', 'decorative')

    print(f"  New X-axis: {new_x_axis[0]} <-> {new_x_axis[1]}")
    print(f"  New Y-axis: {new_y_axis[0]} <-> {new_y_axis[1]}")

    # Build semantic axes
    x_pos_text = f"shoe that is {new_x_axis[1]}"
    x_neg_text = f"shoe that is {new_x_axis[0]}"
    y_pos_text = f"shoe that is {new_y_axis[1]}"
    y_neg_text = f"shoe that is {new_y_axis[0]}"

    x_axis = axis_builder.create_clip_text_axis(x_pos_text, x_neg_text)
    y_axis = axis_builder.create_clip_text_axis(y_pos_text, y_neg_text)

    x_axis_vector = x_axis.direction
    y_axis_vector = y_axis.direction

    print(f"  X-axis vector shape: {x_axis_vector.shape}")
    print(f"  Y-axis vector shape: {y_axis_vector.shape}")

    # Project all embeddings onto new axes
    all_embeddings = np.array([img.embedding for img in images_metadata])
    x_coords = all_embeddings @ x_axis_vector
    y_coords = all_embeddings @ y_axis_vector

    print(f"  Projected {len(images_metadata)} images onto new axes")
    print(f"  New X range: [{x_coords.min():.2f}, {x_coords.max():.2f}]")
    print(f"  New Y range: [{y_coords.min():.2f}, {y_coords.max():.2f}]")

    # Update coordinates
    old_coords = []
    new_coords = []
    for i, img in enumerate(images_metadata):
        old_coords.append(img.coordinates)
        img.coordinates = (float(x_coords[i]), float(y_coords[i]))
        new_coords.append(img.coordinates)

    print(f"  Updated coordinates for all {len(images_metadata)} images")
    print(f"  Example old coord: {old_coords[0]}")
    print(f"  Example new coord: {new_coords[0]}")
    print("  [PASS] Axis reorganization successful")

except Exception as e:
    print(f"  [FAIL] Axis reorganization failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 6: Verify genealogy integrity
print("\n[TEST 6] Genealogy Integrity Verification")
print("-" * 70)

try:
    # Check all parent-child relationships are bidirectional
    errors = []

    for img in images_metadata:
        # Check each parent has this image in their children list
        for parent_id in img.parents:
            parent = images_metadata[parent_id]
            if img.id not in parent.children:
                errors.append(f"Image {img.id} lists {parent_id} as parent, but parent doesn't list it as child")

        # Check each child has this image in their parents list
        for child_id in img.children:
            child = images_metadata[child_id]
            if img.id not in child.parents:
                errors.append(f"Image {img.id} lists {child_id} as child, but child doesn't list it as parent")

    if errors:
        print(f"  [FAIL] Found {len(errors)} genealogy errors:")
        for err in errors:
            print(f"    - {err}")
        sys.exit(1)
    else:
        print(f"  Checked {len(images_metadata)} images")
        print(f"  All parent-child relationships are bidirectional")
        print("  [PASS] Genealogy integrity verified")

except Exception as e:
    print(f"  [FAIL] Genealogy verification failed: {e}")
    sys.exit(1)

# Test 7: Canvas rendering simulation
print("\n[TEST 7] Canvas Rendering Simulation")
print("-" * 70)

try:
    from visualization.bokeh_canvas import create_interactive_canvas

    axis_labels = {
        'x': ('casual', 'formal'),
        'y': ('plain', 'decorative')
    }

    settings = {
        'image_size': 120,
        'opacity': 0.9,
        'remove_background': True
    }

    selected_ids = [2, 5]  # Select the reference image and its child

    plot = create_interactive_canvas(
        images_metadata=images_metadata,
        selected_ids=selected_ids,
        axis_labels=axis_labels,
        settings=settings
    )

    print(f"  Created Bokeh plot for {len(images_metadata)} images")
    print(f"  Selected images: {selected_ids}")
    print(f"  Axis labels: {axis_labels}")
    print(f"  Plot has {len(plot.renderers)} renderers")
    print("  [PASS] Canvas rendering successful")

except Exception as e:
    print(f"  [FAIL] Canvas rendering failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Final Summary
print("\n" + "="*70)
print("INTEGRATION TEST SUMMARY")
print("="*70)

print("\n[PASS] All workflow steps completed successfully:")
print("  1. Batch generation (5 images) + UMAP fit_transform")
print("  2. Image selection")
print("  3. Reference generation (1 image) + UMAP transform")
print("  4. Interpolation (1 image) + UMAP transform")
print("  5. Semantic axis reorganization (projection)")
print("  6. Genealogy integrity verification")
print("  7. Canvas rendering with genealogy")

print(f"\nFinal state:")
print(f"  Total images: {len(images_metadata)}")
print(f"  Images with parents: {sum(1 for img in images_metadata if img.parents)}")
print(f"  Images with children: {sum(1 for img in images_metadata if img.children)}")
print(f"  Total parent-child connections: {sum(len(img.children) for img in images_metadata)}")

print("\n[SUCCESS] Complete user workflow test passed!")
print("="*70)

sys.exit(0)
