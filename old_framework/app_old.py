"""Main Streamlit application for Zappos Semantic Explorer."""

import streamlit as st
import numpy as np
import pandas as pd
from PIL import Image
import time
import pickle
from pathlib import Path
from typing import List, Dict, Optional
from sklearn.neighbors import NearestNeighbors

# Import our modules
from config import *
from data.loader import ZapposDataLoader, create_sample_dataset
from models.embeddings import CLIPEmbedder
from models.semantic_axes import SemanticAxisBuilder, create_default_axes
from models.generator import SemanticGenerator
from visualization.interactive_plot import InteractivePlotter, create_umap_projection
import umap

class EmbeddingInterpolator:
    def __init__(self, embeddings: np.ndarray, images: List):
        self.embeddings = embeddings
        self.images = images
        self.nn_model = NearestNeighbors(n_neighbors=5, metric='cosine')
        self.nn_model.fit(embeddings)
    
    def spherical_interpolate(self, emb_a: np.ndarray, emb_b: np.ndarray, n_steps: int = 7) -> np.ndarray:
        """Spherical interpolation between two embeddings."""
        emb_a = emb_a / np.linalg.norm(emb_a)
        emb_b = emb_b / np.linalg.norm(emb_b)
        
        dot_product = np.clip(np.dot(emb_a, emb_b), -1.0, 1.0)
        omega = np.arccos(dot_product)
        
        if omega < 1e-6:
            alphas = np.linspace(0, 1, n_steps)
            return np.array([(1 - alpha) * emb_a + alpha * emb_b for alpha in alphas])
        
        sin_omega = np.sin(omega)
        alphas = np.linspace(0, 1, n_steps)
        
        interpolated = np.array([
            (np.sin((1 - alpha) * omega) / sin_omega) * emb_a +
            (np.sin(alpha * omega) / sin_omega) * emb_b
            for alpha in alphas
        ])
        
        return interpolated
    
    def find_nearest_images(self, embedding: np.ndarray, k: int = 1):
        distances, indices = self.nn_model.kneighbors([embedding], n_neighbors=k)
        return indices[0].tolist(), distances[0].tolist()
    
    def interpolate_between_images(self, idx_a: int, idx_b: int, n_steps: int = 7):
        emb_a = self.embeddings[idx_a]
        emb_b = self.embeddings[idx_b]
        
        interpolated = self.spherical_interpolate(emb_a, emb_b, n_steps)
        
        nearest_indices = []
        for interp_emb in interpolated:
            indices, _ = self.find_nearest_images(interp_emb, k=1)
            nearest_indices.append(indices[0])
        
        return {
            'interpolated_embeddings': interpolated,
            'nearest_image_indices': nearest_indices,
            'start_idx': idx_a,
            'end_idx': idx_b
        }

class LayoutReorganizer:
    def __init__(self, umap_coords: np.ndarray, embeddings: np.ndarray):
        """
        Args:
            umap_coords: (N, 2) original UMAP coordinates
            embeddings: (N, 512) CLIP embeddings
        """
        self.umap_coords = umap_coords
        self.embeddings = embeddings
        self.original_coords = umap_coords.copy()
    
    def replace_x_with_semantic(self, semantic_axis: np.ndarray) -> np.ndarray:
        """Replace X-axis with semantic projection, keep UMAP Y."""
        semantic_axis = semantic_axis / np.linalg.norm(semantic_axis)
        semantic_projections = np.dot(self.embeddings, semantic_axis)
        
        # Scale to match UMAP range for visual consistency
        x_min, x_max = self.original_coords[:, 0].min(), self.original_coords[:, 0].max()
        semantic_scaled = (semantic_projections - semantic_projections.min()) / \
                         (semantic_projections.max() - semantic_projections.min())
        semantic_scaled = semantic_scaled * (x_max - x_min) + x_min
        
        # Keep original Y, replace X
        new_coords = np.column_stack([semantic_scaled, self.original_coords[:, 1]])
        return new_coords
    
    def replace_y_with_semantic(self, semantic_axis: np.ndarray) -> np.ndarray:
        """Replace Y-axis with semantic projection, keep UMAP X."""
        semantic_axis = semantic_axis / np.linalg.norm(semantic_axis)
        semantic_projections = np.dot(self.embeddings, semantic_axis)
        
        y_min, y_max = self.original_coords[:, 1].min(), self.original_coords[:, 1].max()
        semantic_scaled = (semantic_projections - semantic_projections.min()) / \
                         (semantic_projections.max() - semantic_projections.min())
        semantic_scaled = semantic_scaled * (y_max - y_min) + y_min
        
        new_coords = np.column_stack([self.original_coords[:, 0], semantic_scaled])
        return new_coords
    
    def dual_semantic_axes(self, axis_x: np.ndarray, axis_y: np.ndarray) -> np.ndarray:
        """Replace both axes with semantic projections."""
        axis_x = axis_x / np.linalg.norm(axis_x)
        axis_y = axis_y / np.linalg.norm(axis_y)
        
        proj_x = np.dot(self.embeddings, axis_x)
        proj_y = np.dot(self.embeddings, axis_y)
        
        # Scale to reasonable range
        proj_x = (proj_x - proj_x.min()) / (proj_x.max() - proj_x.min()) * 10
        proj_y = (proj_y - proj_y.min()) / (proj_y.max() - proj_y.min()) * 10
        
        return np.column_stack([proj_x, proj_y])
    
    def hybrid_blend(self, semantic_axis: np.ndarray, axis_to_replace: str = 'x', alpha: float = 0.5) -> np.ndarray:
        """Blend UMAP and semantic coordinates."""
        if axis_to_replace == 'x':
            semantic_coords = self.replace_x_with_semantic(semantic_axis)
        else:
            semantic_coords = self.replace_y_with_semantic(semantic_axis)
        
        # Linear blend
        blended_coords = (1 - alpha) * self.original_coords + alpha * semantic_coords
        return blended_coords

# Configure Streamlit page
st.set_page_config(**STREAMLIT_PAGE_CONFIG)

# Initialize session state
def init_session_state():
    """Initialize Streamlit session state variables."""
    if 'dataset_loaded' not in st.session_state:
        st.session_state.dataset_loaded = False
    
    if 'embeddings_computed' not in st.session_state:
        st.session_state.embeddings_computed = False
    
    if 'umap_computed' not in st.session_state:
        st.session_state.umap_computed = False
    
    # Data storage
    if 'dataset_df' not in st.session_state:
        st.session_state.dataset_df = None
    
    if 'images' not in st.session_state:
        st.session_state.images = []
    
    if 'embeddings' not in st.session_state:
        st.session_state.embeddings = None
    
    if 'coordinates' not in st.session_state:
        st.session_state.coordinates = None
    
    if 'umap_reducer' not in st.session_state:
        st.session_state.umap_reducer = None
    
    # Semantic axes
    if 'axes' not in st.session_state:
        st.session_state.axes = {}
    
    if 'axis_projections' not in st.session_state:
        st.session_state.axis_projections = {}
    
    if 'current_selected_axis' not in st.session_state:
        st.session_state.current_selected_axis = "None"
    
    # Reorganization settings
    if 'use_reorganization' not in st.session_state:
        st.session_state.use_reorganization = False
    if 'custom_x_axis' not in st.session_state:
        st.session_state.custom_x_axis = ('sporty sneaker', 'formal shoe')
    if 'custom_y_axis' not in st.session_state:
        st.session_state.custom_y_axis = ('bright colorful', 'dark plain')
    
    # Visualization settings
    if 'remove_background' not in st.session_state:
        st.session_state.remove_background = True
    if 'bg_removal_method' not in st.session_state:
        st.session_state.bg_removal_method = 'simple'
    if 'overlay_opacity' not in st.session_state:
        st.session_state.overlay_opacity = 0.9
    if 'overlay_scale' not in st.session_state:
        st.session_state.overlay_scale = 1.0
    if 'dot_size' not in st.session_state:
        st.session_state.dot_size = 25
    if 'image_size' not in st.session_state:
        st.session_state.image_size = 120
    
    # Click-based interpolation settings
    if 'selected_image_indices' not in st.session_state:
        st.session_state.selected_image_indices = []
    if 'interpolation_data' not in st.session_state:
        st.session_state.interpolation_data = None
    if 'show_interpolation' not in st.session_state:
        st.session_state.show_interpolation = False
    
    # Generation settings
    if 'generator' not in st.session_state:
        st.session_state.generator = None
    if 'generation_history' not in st.session_state:
        st.session_state.generation_history = []

@st.cache_resource
def load_clip_model():
    """Load and cache CLIP model."""
    return CLIPEmbedder()

@st.cache_resource
def load_generator():
    """Load and cache SD generator."""
    return SemanticGenerator(device='cuda')

@st.cache_data
def load_dataset(n_images: int):
    """Load and cache dataset."""
    return create_sample_dataset(n_images)

@st.cache_data
def load_sample_images(image_paths: List[str], _max_images: int = None):
    """Load and cache sample images."""
    loader = ZapposDataLoader()
    if _max_images is None:
        return loader.load_sample_images(image_paths)
    else:
        return loader.load_sample_images(image_paths[:_max_images])

def get_reorganized_coordinates():
    """Get coordinates based on custom semantic reorganization."""
    if not st.session_state.umap_computed:
        return st.session_state.coordinates
    
    # Check if reorganization is enabled
    if not st.session_state.get('use_reorganization', False):
        return st.session_state.coordinates
    
    # Check if we have custom axis inputs
    if 'custom_x_axis' not in st.session_state or 'custom_y_axis' not in st.session_state:
        return st.session_state.coordinates
    
    # Initialize reorganizer if not exists
    if 'reorganizer' not in st.session_state:
        st.session_state.reorganizer = LayoutReorganizer(
            st.session_state.coordinates,
            st.session_state.embeddings
        )
    
    reorganizer = st.session_state.reorganizer
    
    try:
        # Get custom axis definitions
        x_pos, x_neg = st.session_state.custom_x_axis
        y_pos, y_neg = st.session_state.custom_y_axis
        
        # Create semantic axes from text inputs using CLIP
        # Use the same embedder that was used for image embeddings
        embedder = load_clip_model()
        
        # Create X-axis semantic direction
        x_embeddings = embedder.extract_text_embeddings([x_pos, x_neg])
        x_pos_emb = x_embeddings[0]
        x_neg_emb = x_embeddings[1]
        x_axis_direction = x_pos_emb - x_neg_emb
        x_axis_direction = x_axis_direction / np.linalg.norm(x_axis_direction)
        
        # Create Y-axis semantic direction
        y_embeddings = embedder.extract_text_embeddings([y_pos, y_neg])
        y_pos_emb = y_embeddings[0]
        y_neg_emb = y_embeddings[1]
        y_axis_direction = y_pos_emb - y_neg_emb
        y_axis_direction = y_axis_direction / np.linalg.norm(y_axis_direction)
        
        # Create dual semantic coordinate system
        return reorganizer.dual_semantic_axes(x_axis_direction, y_axis_direction)
    
    except Exception as e:
        st.error(f"Error creating semantic layout: {e}")
        return reorganizer.original_coords

def add_interpolation_to_plot(fig, coordinates, interpolation_data):
    """Add interpolation visualization to the existing plot."""
    try:
        start_idx = interpolation_data['start_idx']
        end_idx = interpolation_data['end_idx']
        interp_indices = interpolation_data['nearest_image_indices']
        
        # Get coordinates for interpolated points
        interp_coords = []
        for idx in interp_indices:
            if idx < len(coordinates):
                interp_coords.append(coordinates[idx])
        
        if len(interp_coords) < 2:
            return fig
        
        # Extract x and y coordinates
        x_coords = [coord[0] for coord in interp_coords]
        y_coords = [coord[1] for coord in interp_coords]
        
        # Add dashed line connecting the interpolation path
        fig.add_trace(
            dict(
                type='scatter',
                x=x_coords,
                y=y_coords,
                mode='lines+markers',
                line=dict(
                    color='rgba(255, 255, 0, 0.8)',
                    width=3,
                    dash='dash'
                ),
                marker=dict(
                    color='yellow',
                    size=8,
                    symbol='star'
                ),
                name='Interpolation Path',
                hovertemplate='<b>Interpolation Step %{pointNumber}</b><extra></extra>',
                showlegend=True
            )
        )
        
        # Highlight start and end points
        start_coord = coordinates[start_idx] if start_idx < len(coordinates) else None
        end_coord = coordinates[end_idx] if end_idx < len(coordinates) else None
        
        if start_coord is not None:
            fig.add_trace(
                dict(
                    type='scatter',
                    x=[start_coord[0]],
                    y=[start_coord[1]],
                    mode='markers',
                    marker=dict(
                        color='lime',
                        size=15,
                        symbol='circle',
                        line=dict(color='white', width=2)
                    ),
                    name=f'Start (Image {start_idx})',
                    hovertemplate=f'<b>Start: Image {start_idx}</b><extra></extra>',
                    showlegend=True
                )
            )
        
        if end_coord is not None:
            fig.add_trace(
                dict(
                    type='scatter',
                    x=[end_coord[0]],
                    y=[end_coord[1]],
                    mode='markers',
                    marker=dict(
                        color='red',
                        size=15,
                        symbol='circle',
                        line=dict(color='white', width=2)
                    ),
                    name=f'End (Image {end_idx})',
                    hovertemplate=f'<b>End: Image {end_idx}</b><extra></extra>',
                    showlegend=True
                )
            )
        
        return fig
    
    except Exception as e:
        st.error(f"Error adding interpolation to plot: {e}")
        return fig

def show_generation_controls():
    """Generation workflow controls."""
    
    st.sidebar.subheader("🎨 Generation Workflow")
    st.sidebar.caption("Generate AI images and see them in semantic space")
    
    # Load generator
    if st.session_state.generator is None:
        if st.sidebar.button("Initialize Generator", type="primary"):
            with st.spinner("Loading Stable Diffusion (~30 seconds)..."):
                st.session_state.generator = load_generator()
            st.sidebar.success("Generator ready!")
            st.rerun()
    
    if st.session_state.generator is None:
        st.sidebar.info("⬆️ Initialize to start generating (can start without loading dataset!)")
        return
    
    st.sidebar.success("✅ Generator loaded")
    
    # Show current space info
    if st.session_state.images:
        st.sidebar.info(f"📊 Current space: {len(st.session_state.images)} images")
        st.sidebar.caption("All generated images stay in the latent space!")
    
    gen_mode = st.sidebar.selectbox(
        "Generation mode:",
        ["Initial batch", "From reference + text", "Interpolate between two"]
    )
    
    if gen_mode == "Initial batch":
        prompt = st.sidebar.text_input("Prompt:", "sporty premium sneaker design")
        n_images = st.sidebar.slider("Number of images:", 3, 20, 8)
        
        if st.sidebar.button("Generate Batch"):
            with st.spinner(f"Generating {n_images} images..."):
                # Progress bar
                progress_bar = st.progress(0)
                
                # Generate images one by one with progress
                images = []
                for i in range(n_images):
                    img = st.session_state.generator.generate_from_text(prompt)
                    images.append(img)
                    progress_bar.progress((i + 1) / n_images)
                
                progress_bar.empty()
                
                # Extract CLIP embeddings
                embedder = load_clip_model()
                embeddings = embedder.extract_image_embeddings_from_pil(images)
                
                # Create or update UMAP
                if st.session_state.embeddings is None or len(st.session_state.images) == 0:
                    # First generation - create new UMAP space
                    st.session_state.embeddings = embeddings
                    st.session_state.images = images
                    
                    reducer = umap.UMAP(n_components=2, random_state=42)
                    coords = reducer.fit_transform(embeddings)
                    st.session_state.coordinates = coords
                    st.session_state.umap_reducer = reducer
                    st.session_state.embeddings_computed = True
                    st.session_state.umap_computed = True
                else:
                    # Add to existing space - keep ALL previous data
                    st.session_state.images.extend(images)
                    st.session_state.embeddings = np.vstack([st.session_state.embeddings, embeddings])
                    
                    # Transform new images into existing space
                    new_coords = st.session_state.umap_reducer.transform(embeddings)
                    st.session_state.coordinates = np.vstack([st.session_state.coordinates, new_coords])
                
                # Log generation
                st.session_state.generation_history.append({
                    'iteration': len(st.session_state.generation_history),
                    'method': 'batch_generation',
                    'prompt': prompt,
                    'n_images': n_images,
                    'timestamp': time.time()
                })
                
                st.sidebar.success(f"Generated {n_images} images!")
                st.sidebar.info(f"📊 Total images in space: {len(st.session_state.images)}")
                st.rerun()
    
    elif gen_mode == "From reference + text":
        if not st.session_state.images:
            st.sidebar.warning("Generate initial batch first")
            return
        
        ref_idx = st.sidebar.number_input("Reference image index:", 0, len(st.session_state.images)-1, 0)
        additional_prompt = st.sidebar.text_input("Additional description:", "more premium looking")
        
        col1, col2 = st.sidebar.columns(2)
        with col1:
            st.image(st.session_state.images[ref_idx], caption="Reference", width=100)
        
        if st.sidebar.button("Generate from Reference"):
            with st.spinner("🎨 Generating... (3-5 seconds)"):
                # Generate
                new_img = st.session_state.generator.generate_from_reference(
                    st.session_state.images[ref_idx],
                    additional_prompt
                )
                
                # Extract embedding
                embedder = load_clip_model()
                new_embedding = embedder.extract_image_embeddings_from_pil([new_img])
                
                # Add to space
                st.session_state.images.append(new_img)
                st.session_state.embeddings = np.vstack([st.session_state.embeddings, new_embedding])
                
                new_coord = st.session_state.umap_reducer.transform(new_embedding)
                st.session_state.coordinates = np.vstack([st.session_state.coordinates, new_coord])
                
                # Log
                st.session_state.generation_history.append({
                    'iteration': len(st.session_state.generation_history),
                    'method': 'reference_generation',
                    'ref_idx': ref_idx,
                    'prompt': additional_prompt,
                    'timestamp': time.time()
                })
                
                st.sidebar.success("Generated!")
                st.sidebar.info(f"📊 Total images in space: {len(st.session_state.images)}")
                st.rerun()
    
    elif gen_mode == "Interpolate between two":
        if not st.session_state.images or len(st.session_state.images) < 2:
            st.sidebar.warning("Need at least 2 images")
            return
        
        idx_a = st.sidebar.number_input("First image:", 0, len(st.session_state.images)-1, 0)
        idx_b = st.sidebar.number_input("Second image:", 0, len(st.session_state.images)-1, min(1, len(st.session_state.images)-1))
        
        col1, col2 = st.sidebar.columns(2)
        with col1:
            st.image(st.session_state.images[idx_a], width=80)
        with col2:
            st.image(st.session_state.images[idx_b], width=80)
        
        if st.sidebar.button("Generate Interpolated"):
            with st.spinner("🎨 Generating interpolated design..."):
                # Generate
                new_img = st.session_state.generator.generate_interpolated(
                    st.session_state.images[idx_a],
                    st.session_state.images[idx_b],
                    alpha=0.5
                )
                
                # Extract embedding and add to space
                embedder = load_clip_model()
                new_embedding = embedder.extract_image_embeddings_from_pil([new_img])
                
                st.session_state.images.append(new_img)
                st.session_state.embeddings = np.vstack([st.session_state.embeddings, new_embedding])
                
                new_coord = st.session_state.umap_reducer.transform(new_embedding)
                st.session_state.coordinates = np.vstack([st.session_state.coordinates, new_coord])
                
                # Log
                st.session_state.generation_history.append({
                    'iteration': len(st.session_state.generation_history),
                    'method': 'interpolation',
                    'source_indices': [idx_a, idx_b],
                    'timestamp': time.time()
                })
                
                st.sidebar.success("Generated!")
                st.sidebar.info(f"📊 Total images in space: {len(st.session_state.images)}")
                st.rerun()

def show_generation_history():
    """Display generation history and stats."""
    
    if not st.session_state.generation_history:
        return
    
    st.subheader("📊 Generation History")
    
    # Show workflow info
    has_dataset = st.session_state.dataset_loaded
    has_generated = len(st.session_state.generation_history) > 0
    
    if has_dataset and has_generated:
        st.success("🎯 **Hybrid workflow:** Combining Zappos dataset + AI generations")
    elif has_generated:
        st.info("🎨 **Generation-only workflow:** Exploring AI-generated designs")
        st.caption("💡 Tip: You can load Zappos dataset later to compare with real shoes!")
    
    col1, col2 = st.columns([2, 1])
    
    with col1:
        # Create history dataframe
        history_data = []
        for entry in st.session_state.generation_history:
            prompt_text = entry.get('prompt', 'N/A')
            if prompt_text == 'N/A':
                if entry['method'] == 'reference_generation':
                    prompt_text = f"Ref {entry.get('ref_idx', '?')}: {entry.get('prompt', 'N/A')}"
                elif entry['method'] == 'interpolation':
                    indices = entry.get('source_indices', [])
                    prompt_text = f"Between {indices[0]} & {indices[1]}" if len(indices) >= 2 else "Interpolation"
            
            history_data.append({
                'Iteration': entry['iteration'],
                'Method': entry['method'].replace('_', ' ').title(),
                'Prompt': prompt_text[:50],
                'Images': entry.get('n_images', 1)
            })
        
        df_history = pd.DataFrame(history_data)
        st.dataframe(df_history, use_container_width=True)
    
    with col2:
        st.metric("Total iterations", len(st.session_state.generation_history))
        st.metric("Total images generated", 
                 sum([h.get('n_images', 1) for h in st.session_state.generation_history]))
        
        # Method breakdown
        methods = [h['method'] for h in st.session_state.generation_history]
        st.write("**Methods used:**")
        for method in set(methods):
            st.write(f"- {method.replace('_', ' ').title()}: {methods.count(method)}x")

def main():
    """Main application."""
    init_session_state()
    
    st.title("👟 Zappos Semantic Explorer")
    st.markdown("*Explore semantic latent spaces of footwear images*")
    
    # Sidebar controls
    with st.sidebar:
        st.header("🔧 Controls")
        
        st.info("💡 **Two workflows:** Start with Zappos dataset OR start with AI generation!")
        
        # Dataset loading
        st.subheader("1. Load Dataset (Optional)")
        n_images = st.slider("Number of images:", 50, 1000, 200, 50)
        
        # Performance warning for large datasets
        if n_images > 300:
            st.warning("⚠️ Large datasets may take longer to process and render.")
        elif n_images > 500:
            st.error("🚨 Very large datasets (>500 images) may cause performance issues.")
        
        if st.button("🔄 Load Dataset", type="primary"):
            with st.spinner("Loading dataset..."):
                df = load_dataset(n_images)
                st.session_state.dataset_df = df
                st.session_state.dataset_loaded = True
                
                # Reset downstream computations
                st.session_state.embeddings_computed = False
                st.session_state.umap_computed = False
            
            st.success(f"✅ Loaded {len(df)} images")
        
        # Show dataset info
        if st.session_state.dataset_loaded:
            df = st.session_state.dataset_df
            st.write(f"**Dataset:** {len(df)} images")
            st.write("**Categories:**")
            for cat, count in df['category'].value_counts().head(5).items():
                st.write(f"- {cat}: {count}")
        
        st.divider()
        
        # Generation workflow
        show_generation_controls()
        
        st.divider()
        
        # Embedding computation
        st.subheader("2. Compute Embeddings")
        
        if st.session_state.dataset_loaded:
            if st.button("🧠 Extract CLIP Embeddings"):
                df = st.session_state.dataset_df
                
                with st.spinner("Loading CLIP model..."):
                    embedder = load_clip_model()
                
                with st.spinner("Loading sample images..."):
                    sample_paths = df['full_path'].tolist()  # Use all loaded images
                    st.write(f"Loading {len(sample_paths)} images from paths...")
                    
                    # Clear cache to ensure fresh loading
                    load_sample_images.clear()
                    images = load_sample_images(sample_paths)
                    st.write(f"Successfully loaded {len(images)} images")
                    st.session_state.images = images
                
                with st.spinner("Extracting embeddings..."):
                    embeddings = embedder.extract_image_embeddings(sample_paths)
                    st.session_state.embeddings = embeddings
                    st.session_state.embeddings_computed = True
                
                st.success(f"✅ Extracted embeddings: {embeddings.shape}")
        else:
            st.info("Load dataset first")
        
        st.divider()
        
        # UMAP projection
        st.subheader("3. Create UMAP Projection")
        
        if st.session_state.embeddings_computed:
            umap_neighbors = st.slider("UMAP neighbors:", 5, 30, 15)
            umap_min_dist = st.slider("UMAP min distance:", 0.01, 0.5, 0.1, 0.01)
            
            if st.button("🗺️ Create UMAP"):
                embeddings = st.session_state.embeddings
                
                with st.spinner("Creating UMAP projection..."):
                    coordinates, reducer = create_umap_projection(
                        embeddings,
                        n_neighbors=umap_neighbors,
                        min_dist=umap_min_dist
                    )
                    
                    st.session_state.coordinates = coordinates
                    st.session_state.umap_reducer = reducer
                    st.session_state.umap_computed = True
                
                st.success("✅ UMAP projection created")
        else:
            st.info("Extract embeddings first")
        
        st.divider()
        
        # Semantic axes
        st.subheader("4. Semantic Axes")
        
        if st.session_state.embeddings_computed:
            
            # Predefined axes
            if st.button("🎯 Create Default Axes"):
                embeddings = st.session_state.embeddings
                
                with st.spinner("Creating semantic axes..."):
                    axes = create_default_axes(embeddings)
                    st.session_state.axes = axes
                    
                    # Compute projections for ALL embeddings
                    projections = {}
                    for name, axis in axes.items():
                        projections[name] = axis.project(embeddings)
                    
                    st.session_state.axis_projections = projections
                
                st.success(f"✅ Created {len(axes)} semantic axes for {len(embeddings)} embeddings")
            
            # Custom axis creation
            st.write("**Create Custom Axis:**")
            pos_concept = st.text_input("Positive concept:", "sporty sneaker")
            neg_concept = st.text_input("Negative concept:", "formal shoe")
            
            if st.button("➕ Add Custom Axis") and pos_concept and neg_concept:
                embedder = load_clip_model()
                builder = SemanticAxisBuilder(embedder)
                
                axis_name = f"{pos_concept}_vs_{neg_concept}"
                axis = builder.create_clip_text_axis(pos_concept, neg_concept, axis_name)
                
                # Add to session state
                st.session_state.axes[axis_name] = axis
                
                # Compute projection
                projection = axis.project(st.session_state.embeddings)
                st.session_state.axis_projections[axis_name] = projection
                
                st.success(f"✅ Added axis: {axis_name}")
        
        # Show available axes
        if st.session_state.axes:
            st.write("**Available Axes:**")
            for name in st.session_state.axes.keys():
                st.write(f"- {name}")
            
            # Add button to recompute axes if there's a mismatch
            if st.session_state.axis_projections:
                first_axis_name = list(st.session_state.axis_projections.keys())[0]
                first_proj_len = len(st.session_state.axis_projections[first_axis_name])
                embeddings_len = len(st.session_state.embeddings)
                
                if first_proj_len != embeddings_len:
                    st.warning(f"⚠️ **Axis Mismatch:** Axes were computed for {first_proj_len} embeddings, but current embeddings have {embeddings_len} items.")
                    if st.button("🔄 Recompute Axes for Current Data"):
                        with st.spinner("Recomputing axes..."):
                            embeddings = st.session_state.embeddings
                            
                            # Recompute all axes
                            new_projections = {}
                            for name, axis in st.session_state.axes.items():
                                new_projections[name] = axis.project(embeddings)
                            
                            st.session_state.axis_projections = new_projections
                            st.success("✅ Axes recomputed for current data!")
                            st.rerun()
        
        st.divider()
        
        # Semantic axis reorganization
        if st.session_state.umap_computed:
            st.subheader("5. Semantic Reorganization")
            
            # Enable/disable reorganization
            use_reorganization = st.checkbox("Enable semantic reorganization", value=False)
            st.session_state.use_reorganization = use_reorganization
            
            if use_reorganization:
                # X-axis semantic control
                st.write("**X-axis (Horizontal):**")
                x_positive = st.text_input("Positive concept (right side):", "sporty sneaker", key="x_pos")
                x_negative = st.text_input("Negative concept (left side):", "formal shoe", key="x_neg")
                
                # Y-axis semantic control
                st.write("**Y-axis (Vertical):**")
                y_positive = st.text_input("Positive concept (top):", "bright colorful", key="y_pos")
                y_negative = st.text_input("Negative concept (bottom):", "dark plain", key="y_neg")
                
                # Store custom axis inputs
                st.session_state.custom_x_axis = (x_positive, x_negative)
                st.session_state.custom_y_axis = (y_positive, y_negative)
                
                if st.button("🔄 Reorganize Layout", type="primary"):
                    with st.spinner("Creating custom semantic layout..."):
                        # Force update of reorganization
                        if 'reorganizer' in st.session_state:
                            del st.session_state.reorganizer
                        st.rerun()
            
            # Visualization settings
            st.subheader("6. Visualization Settings")
            
            # Image overlay settings
            if st.session_state.umap_computed:
                st.write("**Image Settings:**")
                
                # Size controls
                col1, col2, col3 = st.columns(3)
                with col1:
                    if st.button("Small", help="60px"):
                        st.session_state.image_size = 60
                with col2:
                    if st.button("Medium", help="120px"):
                        st.session_state.image_size = 120
                with col3:
                    if st.button("Large", help="200px"):
                        st.session_state.image_size = 200
                
                image_size = st.slider("Image size:", 30, 300, 120, 10)
                st.session_state.image_size = image_size
                
                # Background removal
                remove_bg = st.checkbox("Remove background", value=True)
                st.session_state.remove_background = remove_bg
                
                if remove_bg:
                    bg_method = st.selectbox("Method:", ["simple", "threshold", "grabcut"], index=0)
                    st.session_state.bg_removal_method = bg_method
                
                # Opacity and scaling
                overlay_opacity = st.slider("Image opacity:", 0.5, 1.0, 0.9, 0.1)
                st.session_state.overlay_opacity = overlay_opacity
                
                overlay_scale = st.slider("Image scale:", 0.5, 3.0, 1.0, 0.1)
                st.session_state.overlay_scale = overlay_scale
                
                # Marker settings
                st.write("**Marker Settings:**")
                marker_size = st.slider("Marker size:", 5, 50, 20, 5)
                st.session_state.marker_size = marker_size
                
                dot_size = st.slider("Hover area size:", 5, 100, 25, 5)
                st.session_state.dot_size = dot_size
            
            # Interpolation controls
            st.write("**Interpolation:**")
            
            # Direct index selection
            col1, col2 = st.columns(2)
            with col1:
                idx_a = st.number_input("Image A:", 0, len(st.session_state.images)-1, 0, key="idx_a")
            with col2:
                idx_b = st.number_input("Image B:", 0, len(st.session_state.images)-1, 
                                       min(5, len(st.session_state.images)-1), key="idx_b")
            
            n_interp_steps = st.slider("Interpolation steps:", 3, 10, 5, key="interp_steps")
            
            col1, col2 = st.columns(2)
            with col1:
                if st.button("🔀 Interpolate", type="primary"):
                    # Generate interpolation
                    interpolator = EmbeddingInterpolator(
                        st.session_state.embeddings,
                        st.session_state.images
                    )
                    result = interpolator.interpolate_between_images(
                        idx_a, idx_b, n_interp_steps
                    )
                    st.session_state.interpolation_data = result
                    st.session_state.show_interpolation = True
                    st.session_state.selected_image_indices = [idx_a, idx_b]
                    st.rerun()
            
            with col2:
                if st.button("Clear"):
                    st.session_state.selected_image_indices = []
                    st.session_state.interpolation_data = None
                    st.session_state.show_interpolation = False
                    st.rerun()
            
            # Show current interpolation status
            if st.session_state.show_interpolation and st.session_state.interpolation_data:
                result = st.session_state.interpolation_data
                st.success(f"✅ Interpolation: Image {result['start_idx']} → Image {result['end_idx']}")
                st.info("Yellow dashed line shows interpolation path on the plot")
    
    # Main content area
    if not st.session_state.embeddings_computed:
        # No data yet - show getting started
        st.info("👈 Choose your starting point: Load Zappos dataset OR generate images with AI")
        
        # Show overview
        col1, col2 = st.columns(2)
        
        with col1:
            st.markdown("""
            ### 🎯 Option 1: Start with Zappos Dataset
            1. **Load** UT Zappos50K shoe images (sidebar section 1)
            2. **Extract** CLIP embeddings
            3. **Create** UMAP projection
            4. **Optional:** Generate AI variations on top
            
            **Use this if:** You want to explore real shoe data and optionally add AI generations
            """)
        
        with col2:
            st.markdown("""
            ### 🚀 Option 2: Start with AI Generation
            1. **Initialize Generator** (sidebar "🎨 Generation Workflow")
            2. **Generate Batch** (e.g., 12 images)
            3. Images automatically embedded and projected
            4. **Optional:** Load Zappos data to compare
            
            **Use this if:** You want to explore AI-generated designs from scratch
            """)
    
    elif not st.session_state.umap_computed:
        st.info("👈 Create UMAP projection to visualize")
    
    else:
        # Main visualization
        st.markdown("""
        ### 🎨 Visualization Modes & Controls
        
        - **Image Overlay**: Shows actual shoe thumbnails positioned in the semantic space
          - **NEW**: Images up to 200px with 4x scale factor for massive shoes!
          - **FIXED**: Separate hover dot size control (independent of image size)
          - **FIXED**: Now shows ALL loaded images (up to 1000!)
          - Quick presets: Small/Medium/Large/Huge buttons
          - Remove backgrounds for cleaner visualization
          - Adjust opacity and scale for perfect visibility
        - **Dark Theme Scatter**: Enhanced scatter plot with dark theme and larger markers  
          - Adjust marker size in the sidebar
        - **Standard Scatter**: Traditional scatter plot with hover information
          - Adjust marker size in the sidebar
        
        Use the radio buttons above to switch between modes!
        Use the sidebar controls to fine-tune the visualization appearance.
        """)
        show_main_visualization()

def show_main_visualization():
    """Show the main visualization interface."""
    
    st.subheader("🗺️ Semantic Latent Space")
    
    # Get reorganized coordinates based on layout mode
    coordinates = get_reorganized_coordinates()
    images = st.session_state.images
    embeddings = st.session_state.embeddings
    df = st.session_state.dataset_df
    axes = st.session_state.axes
    axis_projections = st.session_state.axis_projections
    
    # Create metadata dataframe for the loaded images
    n_loaded_images = len(images)
    
    # Handle case where we have more images than metadata rows (generated images)
    if df is not None and len(df) < n_loaded_images:
        # Extend metadata with dummy rows for generated images
        n_generated = n_loaded_images - len(df)
        generated_rows = []
        for i in range(n_generated):
            generated_rows.append({
                'category': 'Generated',
                'filename': f'generated_{i+1}',
                'subcategory': 'AI Generated',
                'full_path': ''
            })
        metadata = pd.concat([df, pd.DataFrame(generated_rows)], ignore_index=True)
    elif df is not None:
        metadata = df.head(n_loaded_images).copy()
    else:
        # All generated, create dummy metadata
        generated_rows = []
        for i in range(n_loaded_images):
            generated_rows.append({
                'category': 'Generated',
                'filename': f'generated_{i+1}',
                'subcategory': 'AI Generated',
                'full_path': ''
            })
        metadata = pd.DataFrame(generated_rows)
    
    # Check for image/embedding mismatch
    embeddings_len = len(st.session_state.embeddings)
    if n_loaded_images != embeddings_len:
        st.error(f"🚨 **Data Mismatch:** Loaded {n_loaded_images} images but have {embeddings_len} embeddings!")
        if st.button("🔄 Reload Images"):
            with st.spinner("Reloading images..."):
                df = st.session_state.dataset_df
                sample_paths = df['full_path'].tolist()
                load_sample_images.clear()
                images = load_sample_images(sample_paths)
                st.session_state.images = images
                st.success(f"✅ Reloaded {len(images)} images!")
                st.rerun()
    
    # Create plotter
    plotter = InteractivePlotter()
    
    # Axis selection for coloring
    col1, col2 = st.columns([3, 1])
    
    with col2:
        st.subheader("🎛️ Visualization Controls")
        
        # Color by semantic axis
        if axes:
            axis_options = ["None"] + list(axes.keys())
            selected_axis = st.selectbox("Color by semantic axis:", axis_options, 
                                       index=axis_options.index(st.session_state.current_selected_axis) if st.session_state.current_selected_axis in axis_options else 0)
            
            # Update the current selected axis
            st.session_state.current_selected_axis = selected_axis
            
            if selected_axis != "None":
                color_values = axis_projections[selected_axis]
                color_name = selected_axis
                
                # Check for length mismatch
                if len(color_values) != n_loaded_images:
                    if len(color_values) > n_loaded_images:
                        st.warning(f"⚠️ **Length Mismatch:** Axis projection has {len(color_values)} values but only {n_loaded_images} images are loaded. The visualization will show the first {min(len(color_values), n_loaded_images)} items.")
                    else:
                        st.warning(f"⚠️ **Length Mismatch:** Axis projection has {len(color_values)} values but {n_loaded_images} images are loaded. Some images won't have color values.")
            else:
                color_values = None
                color_name = "Category"
        else:
            selected_axis = "None"
            color_values = None
            color_name = "Category"
            st.info("Create semantic axes to enable axis-based coloring")
    
    with col1:
        # Simplified visualization mode selection
        viz_mode = st.radio(
            "Visualization Mode:",
            ["Image Overlay", "Standard Scatter"],
            horizontal=True
        )
        
        # Main scatter plot with full controls
        if st.session_state.get('use_reorganization', False):
            x_pos, x_neg = st.session_state.get('custom_x_axis', ('sporty sneaker', 'formal shoe'))
            y_pos, y_neg = st.session_state.get('custom_y_axis', ('bright colorful', 'dark plain'))
            title = f"Semantic Space: {x_neg} ↔ {x_pos} (X) | {y_neg} ↔ {y_pos} (Y)"
            x_axis_title = f"{x_neg} ← → {x_pos}"
            y_axis_title = f"{y_neg} ← → {y_pos}"
        else:
            title = "Semantic Latent Space (UMAP)"
            x_axis_title = "UMAP Dimension 1"
            y_axis_title = "UMAP Dimension 2"
        
        # Get all visualization settings
        image_size = st.session_state.get('image_size', 120)
        marker_size = st.session_state.get('marker_size', 20)
        dot_size = st.session_state.get('dot_size', 25)
        overlay_opacity = st.session_state.get('overlay_opacity', 0.9)
        overlay_scale = st.session_state.get('overlay_scale', 1.0)
        remove_background = st.session_state.get('remove_background', True)
        bg_removal_method = st.session_state.get('bg_removal_method', 'simple')
        
        if viz_mode == "Image Overlay":
            fig = plotter.create_embedding_scatter_with_images(
                coordinates=coordinates,
                images=images,
                metadata=metadata,
                color_values=color_values,
                color_name=color_name,
                title=title,
                image_size=image_size,
                dot_size=dot_size,
                overlay_opacity=overlay_opacity,
                overlay_scale=overlay_scale,
                remove_background=remove_background,
                bg_removal_method=bg_removal_method
            )
        else:  # Standard Scatter
            fig = plotter.create_embedding_scatter(
                coordinates=coordinates,
                images=images,
                metadata=metadata,
                color_values=color_values,
                color_name=color_name,
                title=title,
                marker_size=marker_size
            )
        
        # Update axis labels for semantic reorganization
        if st.session_state.get('use_reorganization', False):
            fig.update_layout(
                xaxis=dict(
                    title=dict(
                        text=x_axis_title,
                        font=dict(size=14, color='white'),
                        standoff=20
                    ),
                    tickfont=dict(color='white')
                ),
                yaxis=dict(
                    title=dict(
                        text=y_axis_title,
                        font=dict(size=14, color='white'),
                        standoff=20
                    ),
                    tickfont=dict(color='white')
                )
            )
        else:
            # Standard UMAP labels
            fig.update_layout(
                xaxis=dict(
                    title=dict(
                        text=x_axis_title,
                        font=dict(size=12, color='white')
                    )
                ),
                yaxis=dict(
                    title=dict(
                        text=y_axis_title,
                        font=dict(size=12, color='white')
                    )
                )
            )
        
        # Add click event handling and display
        fig.update_layout(clickmode='event')
        
        # Handle interpolation overlay
        if st.session_state.show_interpolation and st.session_state.interpolation_data:
            fig = add_interpolation_to_plot(fig, coordinates, st.session_state.interpolation_data)
        
        # Display the plot
        event = st.plotly_chart(fig, use_container_width=True, on_select="rerun", key="main_plot")
        
        # Handle click events (this would need plotly events which aren't fully supported yet)
        # For now, we'll use the sidebar controls
    
    # Show semantic axis analysis
    if axes and axis_projections:
        st.subheader("📊 Semantic Axis Analysis")
        
        # Axis selection for detailed analysis
        analysis_axis = st.selectbox("Select axis for analysis:", list(axes.keys()))
        
        if analysis_axis:
            axis = axes[analysis_axis]
            projections = axis_projections[analysis_axis]
            
            col1, col2 = st.columns(2)
            
            with col1:
                st.write(f"**Axis:** {axis.name}")
                st.write(f"**Positive concept:** {axis.positive_concept}")
                st.write(f"**Negative concept:** {axis.negative_concept}")
                st.write(f"**Method:** {axis.method}")
                
                # Show distribution
                import plotly.express as px
                fig_hist = px.histogram(
                    x=projections,
                    nbins=20,
                    title=f"Distribution of {analysis_axis} projections"
                )
                st.plotly_chart(fig_hist, use_container_width=True)
            
            with col2:
                # Show extreme examples
                n_examples = st.slider("Number of examples:", 3, 8, 5)
                
                pos_images, neg_images, pos_filenames, neg_filenames = plotter.show_extreme_examples(
                    images=images,
                    metadata=metadata,
                    axis=axis,
                    embeddings=embeddings,
                    n_examples=n_examples
                )
                
                st.write(f"**Most {axis.positive_concept}:**")
                cols = st.columns(min(len(pos_images), 5))
                for i, (img, filename) in enumerate(zip(pos_images, pos_filenames)):
                    if i < len(cols):
                        with cols[i]:
                            st.image(img, caption=filename, width=80)
                
                st.write(f"**Most {axis.negative_concept}:**")
                cols = st.columns(min(len(neg_images), 5))
                for i, (img, filename) in enumerate(zip(neg_images, neg_filenames)):
                    if i < len(cols):
                        with cols[i]:
                            st.image(img, caption=filename, width=80)
    
    # Show generation history
    show_generation_history()
    
    # Show all images in a grid
    with st.expander("🖼️ All Loaded Images", expanded=False):
        cols = st.columns(5)
        for i, (img, row) in enumerate(zip(images, metadata.itertuples())):
            col_idx = i % 5
            with cols[col_idx]:
                st.image(img, caption=f"{row.category} - {row.filename}", width=100)

# Old interpolation interface removed - now integrated into main plot

if __name__ == "__main__":
    main()