"""Canvas-centric Streamlit application for Zappos Semantic Explorer with Genealogy Tracking."""

import streamlit as st
import numpy as np
import pandas as pd
from PIL import Image
import time
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional
import umap

# Import our modules
from config import *
from data.loader import ZapposDataLoader, create_sample_dataset
from models import CLIPEmbedder, SemanticAxisBuilder, SemanticGenerator, ImageMetadata, HistoryGroup
from visualization import create_interactive_canvas, get_canvas_stats, create_umap_projection
from visualization.theme import THEME_COLORS, ANIMATION_CSS
from components import show_history_timeline, show_visual_settings, show_context_menu, show_image_details, show_axis_editor


# Configure Streamlit page
st.set_page_config(**STREAMLIT_PAGE_CONFIG)


def inject_custom_css():
    """Inject custom CSS for dark theme matching specification - EXACT STYLING FROM ARTIFACT."""
    # First inject the animation CSS from theme
    st.markdown(ANIMATION_CSS, unsafe_allow_html=True)

    # Then add app-specific CSS using theme colors
    st.markdown(f"""
    <style>
    /* Main theme */
    .main {{
        background-color: {THEME_COLORS['bg_primary']};
        color: {THEME_COLORS['text_primary']};
    }}

    /* Headers */
    h1, h2, h3 {{
        color: {THEME_COLORS['primary_blue']};
    }}

    /* Buttons - exact from artifact */
    .stButton button {{
        background-color: {THEME_COLORS['btn_primary']};
        color: white;
        border: none;
        border-radius: 6px;
        padding: 8px 16px;
        font-weight: 500;
        transition: background 0.2s;
    }}

    .stButton button:hover {{
        background-color: {THEME_COLORS['btn_primary_hover']};
    }}

    /* Secondary buttons */
    .stButton button[kind="secondary"] {{
        background-color: {THEME_COLORS['btn_secondary']};
        color: {THEME_COLORS['text_primary']};
        border: 1px solid {THEME_COLORS['border']};
    }}

    .stButton button[kind="secondary"]:hover {{
        background-color: {THEME_COLORS['btn_secondary_hover']};
        border-color: {THEME_COLORS['border_hover']};
    }}

    /* Input fields */
    .stTextInput input {{
        background-color: {THEME_COLORS['bg_primary']};
        border: 1px solid {THEME_COLORS['border']};
        color: {THEME_COLORS['text_primary']};
        border-radius: 6px;
    }}

    /* Dividers */
    hr {{
        border-color: {THEME_COLORS['border']};
    }}

    /* Stats badge */
    .stats-badge {{
        background-color: rgba(22, 27, 34, 0.9);
        border: 1px solid {THEME_COLORS['border']};
        border-radius: 8px;
        padding: 12px;
        color: {THEME_COLORS['text_primary']};
        font-size: 14px;
        margin-bottom: 16px;
    }}

    /* Control panel sections */
    .control-section {{
        background-color: {THEME_COLORS['bg_secondary']};
        border: 1px solid {THEME_COLORS['border']};
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 16px;
    }}

    .section-header {{
        color: {THEME_COLORS['text_secondary']};
        font-size: 13px;
        text-transform: uppercase;
        font-weight: 600;
        letter-spacing: 0.5px;
        margin-bottom: 12px;
    }}
    </style>
    """, unsafe_allow_html=True)


def init_session_state():
    """Initialize Streamlit session state with new data structures."""

    # Images metadata (new structure)
    if 'images_metadata' not in st.session_state:
        st.session_state.images_metadata = []

    # History groups
    if 'history_groups' not in st.session_state:
        st.session_state.history_groups = []

    # Selection and interaction state
    if 'selected_image_ids' not in st.session_state:
        st.session_state.selected_image_ids = []

    if 'hovered_group_id' not in st.session_state:
        st.session_state.hovered_group_id = None

    # UMAP reducer
    if 'umap_reducer' not in st.session_state:
        st.session_state.umap_reducer = None

    # CLIP embedder
    if 'embedder' not in st.session_state:
        st.session_state.embedder = None

    # Generator
    if 'generator' not in st.session_state:
        st.session_state.generator = None

    # Axis labels
    if 'axis_labels' not in st.session_state:
        st.session_state.axis_labels = {
            'x': ('formal', 'sporty'),
            'y': ('dark', 'colorful')
        }

    # UMAP recalculation flag
    if 'umap_needs_recalc' not in st.session_state:
        st.session_state.umap_needs_recalc = False

    # Semantic axis builder
    if 'axis_builder' not in st.session_state:
        st.session_state.axis_builder = None

    # Dataset loaded flag
    if 'dataset_loaded' not in st.session_state:
        st.session_state.dataset_loaded = False

    if 'dataset_df' not in st.session_state:
        st.session_state.dataset_df = None


@st.cache_resource
def load_clip_model():
    """Load and cache CLIP model."""
    return CLIPEmbedder()


@st.cache_resource
def load_generator():
    """Load and cache SD generator."""
    return SemanticGenerator(device='cuda')


def handle_bokeh_selection():
    """Handle Bokeh selection events from canvas.

    Bokeh selections are handled via TapTool and stored in ColumnDataSource.
    This function processes user interactions via Streamlit's session state.
    """
    # Bokeh selection handling is done through the TapTool in the bokeh_canvas
    # Selection state is managed through CSS and visual feedback
    # Actual selection tracking is done via st.session_state.selected_image_ids
    pass


def show_quick_actions():
    """Display quick action panel for generation."""
    st.markdown('<p class="section-header">QUICK ACTIONS</p>', unsafe_allow_html=True)

    # Initialize generator button
    if st.session_state.generator is None:
        if st.button("🎨 Initialize Generator", type="primary", use_container_width=True):
            with st.spinner("Loading Stable Diffusion..."):
                st.session_state.generator = load_generator()
            st.success("Generator ready!")
            st.rerun()
        st.info("Initialize generator to start creating images")
        return

    # Generation controls
    st.success("✅ Generator loaded")

    # Prompt input and generate
    prompt = st.text_input(
        "Prompt",
        value="premium sporty sneaker design",
        placeholder="Describe the shoe design...",
        label_visibility="collapsed"
    )

    col1, col2 = st.columns([2, 1])
    with col1:
        n_images = st.number_input("Count", min_value=1, max_value=20, value=8, label_visibility="collapsed")
    with col2:
        if st.button("Generate", type="primary", use_container_width=True):
            generate_from_prompt(prompt, n_images)

    st.divider()

    # Secondary actions
    col1, col2 = st.columns(2)
    with col1:
        if st.button("📁 Load Dataset", use_container_width=True):
            load_zappos_dataset()

    with col2:
        if st.button("🔄 Clear Canvas", use_container_width=True):
            if st.session_state.images_metadata:
                st.session_state.images_metadata = []
                st.session_state.history_groups = []
                st.session_state.selected_image_ids = []
                st.session_state.umap_reducer = None
                st.rerun()


def recalculate_umap_with_semantic_axes():
    """Recalculate UMAP projection using semantic axes from current axis labels."""
    if not st.session_state.images_metadata:
        st.warning("No images to recalculate UMAP for")
        return

    with st.spinner("Recalculating UMAP with semantic axes..."):
        # Load embedder if needed
        if st.session_state.embedder is None:
            st.session_state.embedder = load_clip_model()

        embedder = st.session_state.embedder

        # Initialize semantic axis builder if needed
        if st.session_state.axis_builder is None:
            st.session_state.axis_builder = SemanticAxisBuilder(embedder)

        axis_builder = st.session_state.axis_builder

        # Get current axis labels
        x_axis = st.session_state.axis_labels['x']  # (negative, positive)
        y_axis = st.session_state.axis_labels['y']

        # Build semantic axes
        x_positive_text = f"shoe that is {x_axis[1]}"
        x_negative_text = f"shoe that is {x_axis[0]}"
        y_positive_text = f"shoe that is {y_axis[1]}"
        y_negative_text = f"shoe that is {y_axis[0]}"

        x_axis = axis_builder.create_clip_text_axis(x_positive_text, x_negative_text)
        y_axis = axis_builder.create_clip_text_axis(y_positive_text, y_negative_text)
        x_axis_vector = x_axis.direction
        y_axis_vector = y_axis.direction

        # Get all embeddings
        all_embeddings = np.array([img.embedding for img in st.session_state.images_metadata])

        # Project onto semantic axes
        x_coords = all_embeddings @ x_axis_vector
        y_coords = all_embeddings @ y_axis_vector

        # Update coordinates for all images
        for i, img_meta in enumerate(st.session_state.images_metadata):
            img_meta.coordinates = (float(x_coords[i]), float(y_coords[i]))

        # Clear UMAP reducer to use semantic projection
        st.session_state.umap_reducer = None
        st.session_state.umap_needs_recalc = False

        st.success(f"✓ Recalculated positions using axes: {x_axis[0]}↔{x_axis[1]} × {y_axis[0]}↔{y_axis[1]}")


def generate_from_prompt(prompt: str, n_images: int):
    """Generate batch of images from text prompt.

    Args:
        prompt: Text description
        n_images: Number of images to generate
    """
    with st.spinner(f"Generating {n_images} images..."):
        # Load embedder if needed
        if st.session_state.embedder is None:
            st.session_state.embedder = load_clip_model()

        embedder = st.session_state.embedder
        generator = st.session_state.generator

        # Generate images
        progress_bar = st.progress(0)
        images = []
        for i in range(n_images):
            img = generator.generate_from_text(prompt)
            images.append(img)
            progress_bar.progress((i + 1) / n_images)
        progress_bar.empty()

        # Extract embeddings
        embeddings = embedder.extract_image_embeddings_from_pil(images)

        # Create or update UMAP space
        if st.session_state.umap_reducer is None:
            # First generation - create new space
            # Use 'random' init for small datasets to avoid spectral initialization issues
            init_method = 'random' if len(embeddings) < 10 else 'spectral'
            reducer = umap.UMAP(n_components=2, random_state=42, init=init_method)
            coords = reducer.fit_transform(embeddings)
            st.session_state.umap_reducer = reducer
        else:
            # Add to existing space
            coords = st.session_state.umap_reducer.transform(embeddings)

        # Create ImageMetadata objects
        group_id = f"batch_{len(st.session_state.history_groups)}"
        start_id = len(st.session_state.images_metadata)

        new_metadata = []
        for i, (img, emb, coord) in enumerate(zip(images, embeddings, coords)):
            img_meta = ImageMetadata(
                id=start_id + i,
                group_id=group_id,
                pil_image=img,
                embedding=emb,
                coordinates=(coord[0], coord[1]),
                parents=[],  # No parents for batch generation
                children=[],
                generation_method='batch',
                prompt=prompt,
                reference_ids=[],
                timestamp=datetime.now(),
                visible=True
            )
            new_metadata.append(img_meta)

        # Add to session state
        st.session_state.images_metadata.extend(new_metadata)

        # Create history group
        image_ids = [m.id for m in new_metadata]
        history_group = HistoryGroup(
            id=group_id,
            type='batch',
            image_ids=image_ids,
            prompt=prompt,
            visible=True,
            thumbnail_id=image_ids[0] if image_ids else None,
            timestamp=datetime.now()
        )
        st.session_state.history_groups.append(history_group)

        st.success(f"Generated {n_images} images!")
        st.rerun()


def generate_from_reference(reference_id: int, prompt: str):
    """Generate new image from reference with genealogy tracking.

    Args:
        reference_id: ID of reference image
        prompt: Additional text description
    """
    with st.spinner("Generating from reference..."):
        embedder = st.session_state.embedder
        generator = st.session_state.generator

        # Get reference image
        ref_img_meta = next((img for img in st.session_state.images_metadata if img.id == reference_id), None)
        if not ref_img_meta:
            st.error("Reference image not found")
            return

        # Generate new image
        new_img = generator.generate_from_reference(ref_img_meta.pil_image, prompt)

        # Extract embedding
        new_embedding = embedder.extract_image_embeddings_from_pil([new_img])

        # Project to UMAP space
        new_coord = st.session_state.umap_reducer.transform(new_embedding)

        # Create ImageMetadata with genealogy
        new_id = len(st.session_state.images_metadata)
        group_id = f"reference_{len(st.session_state.history_groups)}"

        new_img_meta = ImageMetadata(
            id=new_id,
            group_id=group_id,
            pil_image=new_img,
            embedding=new_embedding[0],
            coordinates=(new_coord[0][0], new_coord[0][1]),
            parents=[reference_id],  # Track parent
            children=[],
            generation_method='reference',
            prompt=prompt,
            reference_ids=[reference_id],
            timestamp=datetime.now(),
            visible=True
        )

        # Update parent's children list
        ref_img_meta.children.append(new_id)

        # Add to session state
        st.session_state.images_metadata.append(new_img_meta)

        # Create history group
        history_group = HistoryGroup(
            id=group_id,
            type='reference',
            image_ids=[new_id],
            prompt=prompt,
            visible=True,
            thumbnail_id=new_id,
            timestamp=datetime.now()
        )
        st.session_state.history_groups.append(history_group)

        st.success("Generated from reference!")
        st.rerun()


def interpolate_images(id_a: int, id_b: int):
    """Generate interpolated image with dual-parent genealogy tracking.

    Args:
        id_a: First image ID
        id_b: Second image ID
    """
    with st.spinner("Generating interpolation..."):
        embedder = st.session_state.embedder
        generator = st.session_state.generator

        # Get both images
        img_a_meta = next((img for img in st.session_state.images_metadata if img.id == id_a), None)
        img_b_meta = next((img for img in st.session_state.images_metadata if img.id == id_b), None)

        if not img_a_meta or not img_b_meta:
            st.error("One or both images not found")
            return

        # Generate interpolated image
        new_img = generator.generate_interpolated(
            img_a_meta.pil_image,
            img_b_meta.pil_image,
            alpha=0.5
        )

        # Extract embedding
        new_embedding = embedder.extract_image_embeddings_from_pil([new_img])

        # Project to UMAP space
        new_coord = st.session_state.umap_reducer.transform(new_embedding)

        # Create ImageMetadata with dual parents
        new_id = len(st.session_state.images_metadata)
        group_id = f"interpolation_{len(st.session_state.history_groups)}"

        new_img_meta = ImageMetadata(
            id=new_id,
            group_id=group_id,
            pil_image=new_img,
            embedding=new_embedding[0],
            coordinates=(new_coord[0][0], new_coord[0][1]),
            parents=[id_a, id_b],  # Track both parents
            children=[],
            generation_method='interpolation',
            prompt=f"Interpolation between {id_a} and {id_b}",
            reference_ids=[id_a, id_b],
            timestamp=datetime.now(),
            visible=True
        )

        # Update both parents' children lists
        img_a_meta.children.append(new_id)
        img_b_meta.children.append(new_id)

        # Add to session state
        st.session_state.images_metadata.append(new_img_meta)

        # Create history group
        history_group = HistoryGroup(
            id=group_id,
            type='interpolation',
            image_ids=[new_id],
            prompt=f"Between #{id_a} & #{id_b}",
            visible=True,
            thumbnail_id=new_id,
            timestamp=datetime.now()
        )
        st.session_state.history_groups.append(history_group)

        st.success("Generated interpolation!")
        st.rerun()


def load_zappos_dataset():
    """Load Zappos dataset images into the canvas."""
    with st.spinner("Loading Zappos dataset..."):
        # This is a placeholder - implement actual dataset loading
        st.info("Dataset loading will be implemented in future phase")


def show_canvas_stats():
    """Display canvas statistics badge."""
    stats = get_canvas_stats(st.session_state.images_metadata)

    st.markdown(f"""
    <div class="stats-badge">
        <strong>{stats['n_images']}</strong> images •
        <strong>{stats['n_groups']}</strong> groups •
        <strong>CLIP ViT-B/32</strong> •
        Genealogy: <strong>{stats['n_connections']}</strong> connections
    </div>
    """, unsafe_allow_html=True)


def main():
    """Main application."""
    inject_custom_css()
    init_session_state()

    # Add custom layout CSS - exact artifact styling
    st.markdown("""
    <style>
    /* Main theme - exact from artifact */
    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }

    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #1a1a1a;
        color: #e0e0e0;
    }

    /* Ultra-compact padding - everything on one screen */
    .block-container {
        padding-top: 0.5rem !important;
        padding-bottom: 0.5rem !important;
        padding-left: 1rem !important;
        padding-right: 1rem !important;
        max-width: 100% !important;
    }

    /* Canvas section - 55% of viewport height to fit everything */
    .canvas-container {
        flex: 0 0 55vh;
        display: flex;
        gap: 0.75rem;
        margin-bottom: 0.5rem;
        background: #0d1117;
        border-bottom: 2px solid #30363d;
        position: relative;
        overflow: hidden;
    }

    /* Settings sidebar - compact with artifact styling */
    .settings-sidebar {
        flex: 0 0 280px;
        max-height: 52vh;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 12px;
        background: rgba(22, 27, 34, 0.95);
        border: 1px solid #30363d;
        border-radius: 8px;
    }

    /* Control panel section - reduced height */
    .control-panel {
        height: 35vh;
        max-height: 35vh;
        background: #161b22;
        border-top: 1px solid #30363d;
        display: flex;
        padding: 0.5rem 0;
        overflow-y: auto;
    }

    /* Quick Actions Panel - from artifact */
    .quick-actions {
        flex: 0 0 400px;
        padding: 20px;
        border-right: 1px solid #30363d;
    }

    /* History Timeline - from artifact */
    .history-timeline {
        flex: 1;
        padding: 20px;
        overflow-x: auto;
    }

    /* Action buttons - exact from artifact */
    .stButton button {
        background: #238636;
        color: white;
        border: none;
        padding: 8px 16px !important;
        border-radius: 6px;
        font-size: 14px !important;
        font-weight: 500;
        transition: background 0.2s;
    }

    .stButton button:hover {
        background: #2ea043;
    }

    /* Secondary buttons - from artifact */
    .stButton button[kind="secondary"] {
        background: #21262d;
        color: #c9d1d9;
        border: 1px solid #30363d;
    }

    .stButton button[kind="secondary"]:hover {
        background: #30363d;
    }

    /* Text inputs - from artifact */
    .stTextInput input {
        background: #0d1117;
        border: 1px solid #30363d;
        color: #e0e0e0;
        padding: 8px 12px !important;
        border-radius: 6px;
        font-size: 14px !important;
    }

    .stTextInput input:focus {
        outline: none;
        border-color: #58a6ff;
    }

    /* Sliders - more compact */
    .stSlider {
        padding-top: 0 !important;
        padding-bottom: 0.5rem !important;
    }

    /* Stats badge - from artifact */
    .stats-badge {
        background: rgba(22, 27, 34, 0.9);
        border: 1px solid #30363d;
        border-radius: 6px;
        padding: 8px 12px !important;
        font-size: 12px !important;
        margin-bottom: 8px !important;
    }

    /* Section headers - from artifact */
    .section-header {
        font-size: 13px !important;
        font-weight: 600;
        color: #8b949e;
        margin-bottom: 12px !important;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    /* Expander styling */
    .streamlit-expanderHeader {
        background: #161b22 !important;
        border: 1px solid #30363d !important;
        border-radius: 6px !important;
        padding: 8px 12px !important;
        font-size: 13px !important;
        color: #58a6ff !important;
    }

    /* Minimal column spacing */
    [data-testid="column"] {
        padding: 0 0.25rem !important;
    }

    /* Hide Streamlit default elements for more space */
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    header {visibility: hidden;}

    /* Compact titles */
    h1 {
        font-size: 20px !important;
        font-weight: 600;
        color: #58a6ff !important;
        margin: 0 0 0.5rem 0 !important;
        padding: 0 !important;
        line-height: 1.2 !important;
    }

    h2, h3 {
        font-size: 13px !important;
        font-weight: 600;
        color: #8b949e !important;
        margin: 6px 0 !important;
    }

    /* Dividers */
    hr {
        border-color: #30363d !important;
        margin: 4px 0 !important;
    }

    /* Compact alert boxes */
    .stInfo, .stSuccess, .stWarning, .stError {
        padding: 6px 10px !important;
        font-size: 11px !important;
        border-radius: 4px !important;
        margin: 4px 0 !important;
    }

    /* Compact expanders */
    .streamlit-expanderHeader {
        padding: 6px 10px !important;
        font-size: 12px !important;
        min-height: 32px !important;
    }

    /* Compact number inputs and text inputs */
    .stNumberInput, .stTextInput {
        margin-bottom: 0.25rem !important;
    }

    /* Reduce spacing in columns */
    .stColumn {
        padding: 0 0.25rem !important;
    }
    </style>
    """, unsafe_allow_html=True)

    # Ultra-compact header - single line
    col1, col2 = st.columns([4, 1])
    with col1:
        st.markdown("<h1 style='margin:0;padding:0;'>👟 Zappos Semantic Explorer</h1>", unsafe_allow_html=True)
    with col2:
        st.markdown("<div style='text-align: right; padding-top: 0.5rem; color: #8b949e; font-size: 10px;'>Semantic Space</div>", unsafe_allow_html=True)

    # MAIN CANVAS AREA - 62% viewport height, ultra-compact
    st.markdown('<div class="canvas-container">', unsafe_allow_html=True)
    
    canvas_col, settings_col = st.columns([6, 1])

    with canvas_col:
        # Show stats
        if st.session_state.images_metadata:
            show_canvas_stats()

        # Create and display Bokeh canvas
        if st.session_state.images_metadata:
            settings = {
                'image_size': st.session_state.get('image_size', 80),
                'opacity': st.session_state.get('image_opacity', 0.9),
                'remove_background': st.session_state.get('remove_background', True)
            }

            plot = create_interactive_canvas(
                images_metadata=st.session_state.images_metadata,
                selected_ids=st.session_state.selected_image_ids,
                axis_labels=st.session_state.axis_labels,
                settings=settings
            )

            # Use Bokeh chart with interactive tools
            st.bokeh_chart(plot, use_container_width=True)

            # Compact selection interface
            if len(st.session_state.images_metadata) > 0:
                with st.expander("🖱️ Select Images", expanded=False):
                    # Multiselect for image IDs
                    visible_ids = [img.id for img in st.session_state.images_metadata if img.visible]
                    selected = st.multiselect(
                        "Select image IDs:",
                        options=visible_ids,
                        default=st.session_state.selected_image_ids,
                        key="image_selector"
                    )
                    if selected != st.session_state.selected_image_ids:
                        st.session_state.selected_image_ids = selected
                        st.rerun()
        else:
            st.info("👇 No images yet. Initialize the generator in the control panel below and create your first batch!")

    with settings_col:
        st.markdown('<div class="settings-sidebar">', unsafe_allow_html=True)

        # Axis editor panel
        show_axis_editor()

        st.divider()

        # Visual settings panel
        settings = show_visual_settings()

        st.markdown('</div>', unsafe_allow_html=True)

    st.markdown('</div>', unsafe_allow_html=True)  # Close canvas-container

    # CONTROL PANEL (25vh) - Changed ratio to 2:3 per spec
    st.markdown('<div class="control-panel">', unsafe_allow_html=True)

    # Check if UMAP needs recalculation
    if st.session_state.umap_needs_recalc:
        recalculate_umap_with_semantic_axes()
        st.rerun()

    # Show context menu if images are selected
    if st.session_state.selected_image_ids:
        with st.expander("🎯 Selected Actions", expanded=True):
            action, params = show_context_menu(
                selected_ids=st.session_state.selected_image_ids,
                images_metadata=st.session_state.images_metadata
            )

            # Execute action
            if action == "generate_from_reference":
                ref_id = params.get("reference_id")
                st.markdown("**Generate from Reference**")
                # Show prompt input
                ref_prompt = st.text_input("Additional description:", "more premium looking", key="ref_prompt_input")
                if st.button("🎨 Generate Now", type="primary", key="gen_ref_btn"):
                    if st.session_state.generator is None:
                        st.error("Please initialize the generator first!")
                    else:
                        generate_from_reference(ref_id, ref_prompt)

            elif action == "interpolate":
                st.markdown("**Interpolate Between Images**")
                id_a, id_b = params.get("id_a"), params.get("id_b")
                st.info(f"Creating blend between Image #{id_a} and Image #{id_b}")
                if st.button("🔀 Generate Interpolation", type="primary", key="interp_btn"):
                    if st.session_state.generator is None:
                        st.error("Please initialize the generator first!")
                    else:
                        interpolate_images(id_a, id_b)

            elif action == "view_details":
                img_id = params.get("image_id")
                img_meta = next((img for img in st.session_state.images_metadata if img.id == img_id), None)
                if img_meta:
                    show_image_details(img_meta)

            elif action == "remove_images":
                # Remove images from canvas
                image_ids = params.get("image_ids", [])
                for img_id in image_ids:
                    for img in st.session_state.images_metadata:
                        if img.id == img_id:
                            img.visible = False
                st.session_state.selected_image_ids = []
                st.success(f"Removed {len(image_ids)} image(s)")
                st.rerun()

    # Control panel with 2:3 ratio per spec
    actions_col, history_col = st.columns([2, 3])

    with actions_col:
        show_quick_actions()

    with history_col:
        selected_group, visibility_changes = show_history_timeline(
            history_groups=st.session_state.history_groups,
            images_metadata=st.session_state.images_metadata,
            hovered_group_id=st.session_state.hovered_group_id
        )

        # Apply visibility changes
        if visibility_changes:
            for group_id, visible in visibility_changes.items():
                # Update visibility for all images in this group
                for img_meta in st.session_state.images_metadata:
                    if img_meta.group_id == group_id:
                        img_meta.visible = visible
                # Update group visibility
                for group in st.session_state.history_groups:
                    if group.id == group_id:
                        group.visible = visible
            st.rerun()

    st.markdown('</div>', unsafe_allow_html=True)  # Close control-panel


if __name__ == "__main__":
    main()
