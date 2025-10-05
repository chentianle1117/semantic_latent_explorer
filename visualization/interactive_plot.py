"""Interactive visualization for semantic latent space exploration."""

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import streamlit as st
from PIL import Image
import io
import base64
from typing import List, Dict, Optional, Tuple, Any
import umap
import cv2

from config import *
from models.semantic_axes import SemanticAxis

class InteractivePlotter:
    """Handles interactive plotting for semantic space exploration."""
    
    def __init__(self):
        self.current_plot = None
        self.selected_points = []
    
    def remove_background_fast(self, image: Image.Image, method: str = "grabcut") -> Image.Image:
        """
        Fast background removal using OpenCV.
        
        Args:
            image: PIL Image
            method: "grabcut", "threshold", or "simple"
            
        Returns:
            PIL Image with transparent background
        """
        # Convert PIL to OpenCV format
        img_cv = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        
        if method == "simple":
            return self._simple_background_removal(img_cv)
        elif method == "threshold":
            return self._threshold_background_removal(img_cv)
        elif method == "grabcut":
            return self._grabcut_background_removal(img_cv)
        else:
            return self._simple_background_removal(img_cv)
    
    def _simple_background_removal(self, img_cv: np.ndarray) -> Image.Image:
        """Simple background removal based on color similarity."""
        # Convert to HSV for better color separation
        hsv = cv2.cvtColor(img_cv, cv2.COLOR_BGR2HSV)
        
        # Assume background is white/light colored
        # Create mask for white/light colors
        lower_white = np.array([0, 0, 200])
        upper_white = np.array([180, 30, 255])
        mask = cv2.inRange(hsv, lower_white, upper_white)
        
        # Invert mask (we want to keep non-white areas)
        mask = cv2.bitwise_not(mask)
        
        # Apply morphological operations to clean up the mask
        kernel = np.ones((3,3), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        
        # Create 4-channel image (RGBA)
        result = img_cv.copy()
        alpha_channel = mask
        result = cv2.cvtColor(result, cv2.COLOR_BGR2RGB)
        
        # Stack RGB with alpha channel
        result = np.dstack((result, alpha_channel))
        
        return Image.fromarray(result, 'RGBA')
    
    def _threshold_background_removal(self, img_cv: np.ndarray) -> Image.Image:
        """Background removal using adaptive thresholding."""
        # Convert to grayscale
        gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
        
        # Apply Gaussian blur to reduce noise
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        
        # Use Otsu's thresholding to find optimal threshold
        _, mask = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # Clean up the mask
        kernel = np.ones((3,3), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        
        # Create result with alpha channel
        result = img_cv.copy()
        result = cv2.cvtColor(result, cv2.COLOR_BGR2RGB)
        result = np.dstack((result, mask))
        
        return Image.fromarray(result, 'RGBA')
    
    def _grabcut_background_removal(self, img_cv: np.ndarray) -> Image.Image:
        """Background removal using GrabCut algorithm."""
        height, width = img_cv.shape[:2]
        
        # Create rectangle for initial segmentation (center 70% of image)
        margin = 0.15
        rect = (int(width * margin), int(height * margin), 
                int(width * (1 - 2*margin)), int(height * (1 - 2*margin)))
        
        # Initialize mask
        mask = np.zeros((height, width), np.uint8)
        
        # Initialize background and foreground models
        bgd_model = np.zeros((1, 65), np.float64)
        fgd_model = np.zeros((1, 65), np.float64)
        
        try:
            # Apply GrabCut
            cv2.grabCut(img_cv, mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)
            
            # Create final mask (foreground = 1 or 3)
            mask2 = np.where((mask == 2) | (mask == 0), 0, 1).astype('uint8')
            
            # Clean up the mask
            kernel = np.ones((3,3), np.uint8)
            mask2 = cv2.morphologyEx(mask2 * 255, cv2.MORPH_CLOSE, kernel)
            
        except Exception as e:
            print(f"GrabCut failed, falling back to simple method: {e}")
            return self._simple_background_removal(img_cv)
        
        # Create result with alpha channel
        result = img_cv.copy()
        result = cv2.cvtColor(result, cv2.COLOR_BGR2RGB)
        result = np.dstack((result, mask2))
        
        return Image.fromarray(result, 'RGBA')
        
    def images_to_base64(self, images: List[Image.Image], size: Tuple[int, int] = THUMBNAIL_SIZE, 
                        remove_bg: bool = False, bg_method: str = "simple") -> List[str]:
        """Convert PIL images to base64 strings for plotly."""
        base64_images = []
        
        # Create progress bar if background removal is enabled
        if remove_bg and len(images) > 5:
            progress_bar = st.progress(0)
            status_text = st.empty()
        
        for i, img in enumerate(images):
            # Remove background if requested
            if remove_bg:
                try:
                    img = self.remove_background_fast(img, method=bg_method)
                except Exception as e:
                    print(f"Background removal failed: {e}")
                    # Continue with original image if background removal fails
            
            # Update progress if background removal is enabled
            if remove_bg and len(images) > 5:
                progress = (i + 1) / len(images)
                progress_bar.progress(progress)
                status_text.text(f"Processing images: {i+1}/{len(images)}")
            
            # Resize image
            img_resized = img.resize(size, Image.Resampling.LANCZOS)
            
            # Convert to base64
            buffered = io.BytesIO()
            img_resized.save(buffered, format="PNG")
            img_str = base64.b64encode(buffered.getvalue()).decode()
            base64_images.append(f"data:image/png;base64,{img_str}")
        
        # Clear progress indicators
        if remove_bg and len(images) > 5:
            progress_bar.empty()
            status_text.empty()
        
        return base64_images
    
    def create_embedding_scatter_with_images(
        self,
        coordinates: np.ndarray,
        images: List[Image.Image],
        metadata: pd.DataFrame,
        color_values: Optional[np.ndarray] = None,
        color_name: str = "Value",
        title: str = "Semantic Latent Space",
        width: int = 800,
        height: int = 600,
        image_size: int = 40,
        dot_size: int = 20,
        overlay_opacity: float = 0.9,
        overlay_scale: float = 1.0,
        remove_background: bool = False,
        bg_removal_method: str = "simple"
    ) -> go.Figure:
        """Create an interactive scatter plot with actual images instead of points."""
        
        # Convert images to base64 for embedding
        base64_images = self.images_to_base64(
            images, 
            size=(image_size, image_size),
            remove_bg=remove_background,
            bg_method=bg_removal_method
        )
        
        # Create the figure with dark theme
        fig = go.Figure()
        
        # Ensure all arrays have the same length
        min_length = min(len(coordinates), len(base64_images), len(metadata))
        coordinates = coordinates[:min_length]
        base64_images = base64_images[:min_length]
        metadata = metadata.iloc[:min_length]
        
        # Set up color mapping
        if color_values is not None:
            # Ensure color_values matches the data length
            if len(color_values) != min_length:
                print(f"Warning: color_values length ({len(color_values)}) doesn't match data length ({min_length}). Truncating color_values.")
                color_values = color_values[:min_length]
            
            # Normalize color values for better visualization
            color_vals_norm = (color_values - color_values.min()) / (color_values.max() - color_values.min())
            colors = [f'rgba({int(255*r)}, {int(255*(1-r))}, {int(128*abs(0.5-r)*2)}, 0.8)' 
                     for r in color_vals_norm]
        else:
            # Use category-based colors
            unique_categories = metadata['category'].unique() if 'category' in metadata.columns else ['default']
            color_map = {cat: f'hsl({i*360/len(unique_categories)}, 70%, 60%)' 
                        for i, cat in enumerate(unique_categories)}
            colors = [color_map.get(metadata.iloc[i].get('category', 'default'), 'white') 
                     for i in range(len(coordinates))]
        
        # Add images to the plot
        for i, (coord, img_b64, color) in enumerate(zip(coordinates, base64_images, colors)):
            # Add invisible scatter point for hover info
            fig.add_trace(go.Scatter(
                x=[coord[0]],
                y=[coord[1]],
                mode='markers',
                marker=dict(
                    size=dot_size,  # Separate from image size
                    color=color,
                    opacity=0.1,  # Nearly invisible
                    line=dict(width=2, color='white')
                ),
                text=f"Image {i+1}",
                hovertemplate=f"<b>Image {i+1}</b><br>" +
                             f"Category: {metadata.iloc[i].get('category', 'Unknown')}<br>" +
                             f"Brand: {metadata.iloc[i].get('brand', 'Unknown')}<br>" +
                             f"Coords: ({coord[0]:.2f}, {coord[1]:.2f})<br>" +
                             (f"{color_name}: {color_values[i]:.3f}<br>" if color_values is not None else "") +
                             "<extra></extra>",
                showlegend=False,
                name=f"point_{i}"
            ))
            
            # Add the actual image
            fig.add_layout_image(
                dict(
                    source=img_b64,
                    xref="x",
                    yref="y",
                    x=coord[0],
                    y=coord[1],
                    sizex=0.15 * overlay_scale,  # Adjust size based on scale factor
                    sizey=0.15 * overlay_scale,
                    sizing="contain",
                    opacity=overlay_opacity,  # Use configurable opacity
                    xanchor="center",
                    yanchor="middle",
                    layer="above"
                )
            )
        
        # Update layout with dark theme
        fig.update_layout(
            title=dict(
                text=title,
                font=dict(size=20, color='white'),
                x=0.5
            ),
            xaxis=dict(
                title=dict(text="UMAP Dimension 1", font=dict(color='white')),
                tickfont=dict(color='white'),
                gridcolor='rgba(128,128,128,0.3)',
                zerolinecolor='rgba(128,128,128,0.5)',
                showgrid=True
            ),
            yaxis=dict(
                title=dict(text="UMAP Dimension 2", font=dict(color='white')), 
                tickfont=dict(color='white'),
                gridcolor='rgba(128,128,128,0.3)',
                zerolinecolor='rgba(128,128,128,0.5)',
                showgrid=True
            ),
            plot_bgcolor='rgba(20,20,20,1)',  # Dark background
            paper_bgcolor='rgba(30,30,30,1)', # Dark paper background
            width=width,
            height=height,
            font=dict(color='white'),
            margin=dict(l=50, r=50, t=80, b=50),
            hovermode='closest'
        )
        
        # Add colorbar if using color values
        if color_values is not None:
            # Add an invisible scatter trace just for the colorbar
            fig.add_trace(go.Scatter(
                x=[None], y=[None],
                mode='markers',
                marker=dict(
                    colorscale='RdYlBu_r',
                    cmin=color_values.min(),
                    cmax=color_values.max(),
                    colorbar=dict(
                        title=dict(text=color_name, font=dict(color='white')),
                        tickfont=dict(color='white'),
                        bgcolor='rgba(30,30,30,0.8)',
                        bordercolor='white',
                        borderwidth=1
                    ),
                    showscale=True
                ),
                showlegend=False
            ))
        
        return fig

    def create_embedding_scatter_dark_theme(
        self,
        coordinates: np.ndarray,
        images: List[Image.Image],
        metadata: pd.DataFrame,
        color_values: Optional[np.ndarray] = None,
        color_name: str = "Value",
        title: str = "Semantic Latent Space",
        width: int = 800,
        height: int = 600,
        marker_size: int = 20
    ) -> go.Figure:
        """Create scatter plot with dark theme and larger markers to show image thumbnails."""
        
        # Prepare data for plotting
        df_plot = pd.DataFrame({
            'x': coordinates[:, 0],
            'y': coordinates[:, 1],
            'category': metadata.get('category', ['Unknown'] * len(coordinates)),
            'subcategory': metadata.get('subcategory', ['Unknown'] * len(coordinates)),
            'brand': metadata.get('brand', ['Unknown'] * len(coordinates)),
            'filename': metadata.get('filename', [f'img_{i}' for i in range(len(coordinates))]),
        })
        
        # Add color values if provided
        if color_values is not None:
            df_plot['color_value'] = color_values[:len(coordinates)]
            color_col = 'color_value'
            color_scale = 'RdYlBu_r'
        else:
            color_col = 'category'
            color_scale = None
        
        # Create the scatter plot
        fig = px.scatter(
            df_plot,
            x='x', y='y',
            color=color_col,
            color_continuous_scale=color_scale if color_values is not None else None,
            color_discrete_sequence=px.colors.qualitative.Set3 if color_values is None else None,
            hover_data=['category', 'subcategory', 'brand', 'filename'],
            title=title,
            labels={'x': 'UMAP Dimension 1', 'y': 'UMAP Dimension 2', 'color_value': color_name},
            width=width,
            height=height,
            template='plotly_dark'  # Use dark theme
        )
        
        # Update traces for better visualization
        fig.update_traces(
            marker=dict(
                size=marker_size,  # Configurable marker size
                line=dict(width=2, color='white'),
                opacity=0.8
            ),
            hovertemplate=
            '<b>%{customdata[3]}</b><br>' +
            'Category: %{customdata[0]}<br>' +
            'Subcategory: %{customdata[1]}<br>' +
            'Brand: %{customdata[2]}<br>' +
            'UMAP: (%{x:.2f}, %{y:.2f})<br>' +
            (f'{color_name}: %{{marker.color:.3f}}<br>' if color_values is not None else '') +
            '<extra></extra>'
        )
        
        # Enhance dark theme
        fig.update_layout(
            plot_bgcolor='rgba(20,20,20,1)',
            paper_bgcolor='rgba(30,30,30,1)',
            font=dict(color='white', size=12),
            title=dict(font=dict(size=18, color='white')),
            xaxis=dict(
                title=dict(font=dict(color='white')),
                tickfont=dict(color='white'),
                gridcolor='rgba(128,128,128,0.3)',
                zerolinecolor='rgba(128,128,128,0.5)'
            ),
            yaxis=dict(
                title=dict(font=dict(color='white')),
                tickfont=dict(color='white'),
                gridcolor='rgba(128,128,128,0.3)', 
                zerolinecolor='rgba(128,128,128,0.5)'
            ),
            coloraxis_colorbar=dict(
                title=dict(font=dict(color='white')),
                tickfont=dict(color='white'),
                bgcolor='rgba(30,30,30,0.8)',
                bordercolor='white',
                borderwidth=1
            ) if color_values is not None else None
        )
        
        return fig

    def create_embedding_scatter(
        self,
        coordinates: np.ndarray,
        images: List[Image.Image],
        metadata: pd.DataFrame,
        color_values: Optional[np.ndarray] = None,
        color_name: str = "Value",
        title: str = "Semantic Latent Space",
        width: int = 800,
        height: int = 600,
        marker_size: int = 20
    ) -> go.Figure:
        """Create an interactive scatter plot of embeddings."""
        
        # Convert images to base64 for hover display
        base64_images = self.images_to_base64(images)
        
        # Prepare data for plotting
        df_plot = pd.DataFrame({
            'x': coordinates[:, 0],
            'y': coordinates[:, 1],
            'category': metadata.get('category', ['Unknown'] * len(coordinates)),
            'subcategory': metadata.get('subcategory', ['Unknown'] * len(coordinates)),
            'brand': metadata.get('brand', ['Unknown'] * len(coordinates)),
            'filename': metadata.get('filename', [f'img_{i}' for i in range(len(coordinates))]),
            'image_b64': base64_images[:len(coordinates)]  # Ensure same length
        })
        
        # Add color values if provided
        if color_values is not None:
            df_plot['color_value'] = color_values[:len(coordinates)]
            color_col = 'color_value'
            color_scale = 'RdYlBu_r'
        else:
            # Color by category
            color_col = 'category'
            color_scale = 'Set3'
        
        # Create the scatter plot
        fig = px.scatter(
            df_plot,
            x='x', y='y',
            color=color_col,
            color_continuous_scale=color_scale if color_values is not None else None,
            color_discrete_sequence=px.colors.qualitative.Set3 if color_values is None else None,
            hover_data=['category', 'subcategory', 'brand', 'filename'],
            title=title,
            labels={'x': 'UMAP 1', 'y': 'UMAP 2', 'color_value': color_name},
            width=width,
            height=height
        )
        
        # Update traces for better visualization
        fig.update_traces(
            marker=dict(
                size=marker_size,
                line=dict(width=1, color='white'),
                opacity=0.8
            ),
            hovertemplate=
            '<b>%{customdata[3]}</b><br>' +
            'Category: %{customdata[0]}<br>' +
            'Subcategory: %{customdata[1]}<br>' +
            'Brand: %{customdata[2]}<br>' +
            'UMAP: (%{x:.2f}, %{y:.2f})<br>' +
            (f'{color_name}: %{{marker.color:.3f}}<br>' if color_values is not None else '') +
            '<extra></extra>'
        )
        
        # Update layout
        fig.update_layout(
            plot_bgcolor='white',
            paper_bgcolor='white',
            font=dict(size=12),
            showlegend=True if color_values is None else False,
            margin=dict(l=50, r=50, t=80, b=50)
        )
        
        return fig
    
    def create_axis_comparison_plot(
        self,
        coordinates: np.ndarray,
        axis_projections: Dict[str, np.ndarray],
        metadata: pd.DataFrame,
        selected_axes: List[str] = None
    ) -> go.Figure:
        """Create subplots comparing different semantic axes."""
        
        if selected_axes is None:
            selected_axes = list(axis_projections.keys())[:4]  # Show first 4 axes
        
        n_axes = len(selected_axes)
        cols = min(2, n_axes)
        rows = (n_axes + 1) // 2
        
        # Create subplots
        fig = make_subplots(
            rows=rows, cols=cols,
            subplot_titles=selected_axes,
            horizontal_spacing=0.15,
            vertical_spacing=0.15
        )
        
        for i, axis_name in enumerate(selected_axes):
            row = i // cols + 1
            col = i % cols + 1
            
            projections = axis_projections[axis_name]
            
            # Create scatter for this axis
            scatter = go.Scatter(
                x=coordinates[:, 0],
                y=coordinates[:, 1],
                mode='markers',
                marker=dict(
                    color=projections,
                    colorscale='RdYlBu_r',
                    size=6,
                    showscale=True if i == 0 else False,
                    colorbar=dict(title=axis_name) if i == 0 else None
                ),
                text=metadata.get('filename', [f'img_{j}' for j in range(len(coordinates))]),
                hovertemplate=f'<b>{axis_name}</b><br>' +
                              'Value: %{marker.color:.3f}<br>' +
                              'File: %{text}<br>' +
                              '<extra></extra>',
                showlegend=False
            )
            
            fig.add_trace(scatter, row=row, col=col)
        
        # Update layout
        fig.update_layout(
            title="Semantic Axes Comparison",
            height=300 * rows,
            font=dict(size=10)
        )
        
        return fig
    
    def create_axis_distribution_plot(
        self,
        axis_projections: Dict[str, np.ndarray],
        axis_names: Optional[List[str]] = None
    ) -> go.Figure:
        """Create distribution plots for semantic axis projections."""
        
        if axis_names is None:
            axis_names = list(axis_projections.keys())
        
        fig = go.Figure()
        
        for axis_name in axis_names:
            projections = axis_projections[axis_name]
            
            fig.add_trace(go.Histogram(
                x=projections,
                name=axis_name,
                opacity=0.7,
                nbinsx=30
            ))
        
        fig.update_layout(
            title="Distribution of Semantic Axis Projections",
            xaxis_title="Projection Value",
            yaxis_title="Count",
            barmode='overlay',
            height=400
        )
        
        return fig
    
    def show_extreme_examples(
        self,
        images: List[Image.Image],
        metadata: pd.DataFrame,
        axis: SemanticAxis,
        embeddings: np.ndarray,
        n_examples: int = 5
    ) -> Tuple[List[Image.Image], List[Image.Image], List[str], List[str]]:
        """Show extreme examples along a semantic axis."""
        
        # Get extreme indices
        pos_indices, neg_indices = axis.get_extreme_indices(embeddings, n_examples)
        
        # Extract images and metadata
        pos_images = [images[i] for i in pos_indices if i < len(images)]
        neg_images = [images[i] for i in neg_indices if i < len(images)]
        
        pos_filenames = [metadata.iloc[i].get('filename', f'img_{i}') for i in pos_indices if i < len(metadata)]
        neg_filenames = [metadata.iloc[i].get('filename', f'img_{i}') for i in neg_indices if i < len(metadata)]
        
        return pos_images, neg_images, pos_filenames, neg_filenames
    
    def create_similarity_heatmap(
        self,
        similarity_matrix: np.ndarray,
        labels: List[str],
        title: str = "Similarity Matrix"
    ) -> go.Figure:
        """Create a heatmap of similarity values."""
        
        fig = go.Figure(data=go.Heatmap(
            z=similarity_matrix,
            x=labels,
            y=labels,
            colorscale='RdYlBu_r',
            hovertemplate='%{x} vs %{y}<br>Similarity: %{z:.3f}<extra></extra>'
        ))
        
        fig.update_layout(
            title=title,
            xaxis_title="Items",
            yaxis_title="Items",
            height=500
        )
        
        return fig

def create_umap_projection(
    embeddings: np.ndarray,
    n_neighbors: int = UMAP_N_NEIGHBORS,
    min_dist: float = UMAP_MIN_DIST,
    random_state: int = UMAP_RANDOM_STATE,
    use_cache: bool = True
) -> Tuple[np.ndarray, umap.UMAP]:
    """Create UMAP projection of embeddings."""
    
    print(f"Creating UMAP projection for {embeddings.shape[0]} embeddings...")
    
    # Create UMAP reducer
    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=n_neighbors,
        min_dist=min_dist,
        random_state=random_state,
        metric='cosine'  # Good for normalized embeddings
    )
    
    # Fit and transform
    coordinates = reducer.fit_transform(embeddings)
    
    print(f"UMAP projection complete. Shape: {coordinates.shape}")
    
    return coordinates, reducer

def update_umap_with_new_points(
    reducer: umap.UMAP,
    new_embeddings: np.ndarray
) -> np.ndarray:
    """Add new points to existing UMAP projection."""
    
    print(f"Adding {new_embeddings.shape[0]} new points to UMAP...")
    
    # Transform new points using existing reducer
    new_coordinates = reducer.transform(new_embeddings)
    
    return new_coordinates

if __name__ == "__main__":
    # Test the interactive plotter
    print("Testing Interactive Plotter...")
    
    # Create dummy data for testing
    np.random.seed(42)
    
    # Dummy embeddings and coordinates
    embeddings = np.random.randn(50, 512)
    embeddings = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)
    
    coordinates, reducer = create_umap_projection(embeddings)
    
    # Dummy metadata
    metadata = pd.DataFrame({
        'filename': [f'test_img_{i}.jpg' for i in range(50)],
        'category': np.random.choice(['Shoes', 'Boots', 'Sandals'], 50),
        'subcategory': np.random.choice(['Athletic', 'Formal', 'Casual'], 50),
        'brand': np.random.choice(['Nike', 'Adidas', 'Puma'], 50)
    })
    
    # Create dummy images (just colored squares)
    images = []
    for i in range(50):
        color = tuple(np.random.randint(0, 255, 3))
        img = Image.new('RGB', (64, 64), color)
        images.append(img)
    
    # Test plotter
    plotter = InteractivePlotter()
    
    # Test basic scatter plot
    fig = plotter.create_embedding_scatter(
        coordinates=coordinates,
        images=images,
        metadata=metadata,
        title="Test Scatter Plot"
    )
    
    print("Created test scatter plot successfully!")
    print(f"Plot has {len(fig.data)} traces")