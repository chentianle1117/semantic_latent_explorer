"""Plotly-based interactive canvas with genealogy visualization."""

import numpy as np
import base64
from io import BytesIO
from typing import List, Dict, Tuple, Optional
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from PIL import Image
from models.data_structures import ImageMetadata
from visualization.theme import THEME_COLORS


# Color scheme matching specification - exact colors from artifact
GROUP_COLORS = {
    'batch': THEME_COLORS['primary_blue'],        # '#58a6ff'
    'reference': THEME_COLORS['secondary_purple'], # '#bc8cff'
    'interpolation': THEME_COLORS['success_green'], # '#3fb950'
    'dataset': THEME_COLORS['warning_orange']      # '#d29922'
}

PARENT_ARROW_COLOR = THEME_COLORS['success_green']  # '#3fb950' - Green for parent→current
CHILD_ARROW_COLOR = THEME_COLORS['warning_orange']   # '#d29922' - Orange for current→child


def pil_to_base64_url(pil_image, size=None):
    """Convert PIL image to base64 data URL for Plotly.

    Args:
        pil_image: PIL Image object
        size: Optional tuple (width, height) to resize image

    Returns:
        Base64 data URL string
    """
    if size:
        pil_image = pil_image.resize(size, Image.LANCZOS)

    buffered = BytesIO()
    pil_image.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()
    return f"data:image/png;base64,{img_str}"


def get_group_color(group_id: str, group_type: str = 'batch') -> str:
    """Get color for a group based on its type.

    Args:
        group_id: Unique group identifier
        group_type: Type of group ('batch', 'reference', 'interpolation', 'dataset')

    Returns:
        Hex color string
    """
    return GROUP_COLORS.get(group_type, GROUP_COLORS['batch'])


def create_interactive_canvas(
    images_metadata: List[ImageMetadata],
    selected_ids: List[int],
    axis_labels: Dict[str, Tuple[str, str]],
    settings: Optional[Dict] = None
) -> go.Figure:
    """Create Plotly interactive canvas with genealogy visualization.

    Args:
        images_metadata: List of ImageMetadata objects
        selected_ids: List of currently selected image IDs
        axis_labels: Dict with 'x' and 'y' keys, values are (positive, negative) concept tuples
        settings: Visual settings dict with 'image_size', 'opacity', 'remove_background'

    Returns:
        Plotly figure object
    """
    if settings is None:
        settings = {
            'image_size': 120,
            'opacity': 0.9,
            'remove_background': True
        }

    # Create figure with dark theme
    fig = go.Figure()

    # Filter visible images
    visible_images = [img for img in images_metadata if img.visible]

    if not visible_images:
        # Return empty plot if no images
        fig.add_annotation(
            text="No images loaded",
            xref="paper", yref="paper",
            x=0.5, y=0.5,
            showarrow=False,
            font=dict(size=20, color=THEME_COLORS['text_secondary'])
        )
        fig.update_layout(
            template="plotly_dark",
            paper_bgcolor=THEME_COLORS['bg_primary'],
            plot_bgcolor=THEME_COLORS['bg_primary'],
            height=650,
            margin=dict(l=50, r=50, t=80, b=50)
        )
        return fig

    # Prepare data structures for genealogy tracking
    id_to_coords = {}
    id_to_idx = {}
    
    for idx, img_meta in enumerate(visible_images):
        id_to_coords[img_meta.id] = img_meta.coordinates
        id_to_idx[img_meta.id] = idx

    # Add genealogy lines (must be added first to appear behind images)
    # We'll add all possible lines, but they'll only show on hover via JavaScript
    # For Plotly, we'll use a different approach: add traces for parent/child relationships
    
    # Create main scatter trace with images
    x_coords = []
    y_coords = []
    colors = []
    sizes = []
    hover_texts = []
    customdata = []  # Store metadata for hover events
    image_urls = []
    
    for img_meta in visible_images:
        x_coords.append(img_meta.coordinates[0])
        y_coords.append(img_meta.coordinates[1])
        
        # Color based on group type
        color = get_group_color(img_meta.group_id, img_meta.generation_method)
        colors.append(color)
        
        # Size based on selection
        if img_meta.id in selected_ids:
            size = settings['image_size'] * 1.2  # Selected: larger
        else:
            size = settings['image_size']
        sizes.append(size)
        
        # Prepare hover text
        parents_str = f"Images {', '.join(map(str, img_meta.parents))}" if img_meta.parents else "None (original)"
        children_str = f"Images {', '.join(map(str, img_meta.children))}" if img_meta.children else "Not used as reference"
        
        hover_text = f"""<b>Image {img_meta.id}</b><br>
Group: {img_meta.group_id}<br>
{img_meta.prompt if img_meta.prompt else 'Dataset image'}<br>
<br>
⬆️ Parents: {parents_str}<br>
⬇️ Children: {children_str}"""
        hover_texts.append(hover_text)
        
        # Store custom data for interactivity
        customdata.append([
            img_meta.id,
            img_meta.group_id,
            ','.join(map(str, img_meta.parents)) if img_meta.parents else '',
            ','.join(map(str, img_meta.children)) if img_meta.children else ''
        ])
        
        # Convert image to base64
        thumbnail_size = int(size * 1.5)  # Higher resolution for better quality
        img_url = pil_to_base64_url(img_meta.pil_image, size=(thumbnail_size, thumbnail_size))
        image_urls.append(img_url)

    # Add images as layout images (for better performance and positioning)
    layout_images = []
    for i, img_meta in enumerate(visible_images):
        # Calculate image dimensions in plot coordinates
        all_x = [img.coordinates[0] for img in visible_images]
        all_y = [img.coordinates[1] for img in visible_images]
        x_range = max(all_x) - min(all_x) if len(all_x) > 1 else 2
        y_range = max(all_y) - min(all_y) if len(all_y) > 1 else 2
        
        # Size in data coordinates (proportional to plot range)
        img_size = sizes[i] / 800  # Normalize size
        sizex = x_range * img_size
        sizey = y_range * img_size
        
        layout_images.append(dict(
            source=image_urls[i],
            xref="x",
            yref="y",
            x=x_coords[i],
            y=y_coords[i],
            sizex=sizex,
            sizey=sizey,
            xanchor="center",
            yanchor="middle",
            opacity=settings['opacity'],
            layer="above"
        ))

    # Add scatter plot for interactivity (invisible markers)
    fig.add_trace(go.Scatter(
        x=x_coords,
        y=y_coords,
        mode='markers',
        marker=dict(
            size=sizes,
            color=colors,
            opacity=0,  # Invisible - images will be shown via layout images
            line=dict(width=0)
        ),
        customdata=customdata,
        hovertemplate='%{hovertext}<extra></extra>',
        hovertext=hover_texts,
        hoverlabel=dict(
            bgcolor=THEME_COLORS['bg_secondary'],
            bordercolor=THEME_COLORS['border'],
            font=dict(color=THEME_COLORS['text_primary'], size=12)
        ),
        name='',
        showlegend=False
    ))

    # Add selection overlay circles (shown for selected items)
    selected_x = []
    selected_y = []
    selected_sizes = []
    for i, img_meta in enumerate(visible_images):
        if img_meta.id in selected_ids:
            selected_x.append(x_coords[i])
            selected_y.append(y_coords[i])
            selected_sizes.append(sizes[i] * 1.1)
    
    if selected_x:
        fig.add_trace(go.Scatter(
            x=selected_x,
            y=selected_y,
            mode='markers',
            marker=dict(
                size=selected_sizes,
                color='rgba(0,0,0,0)',
                line=dict(
                    color=THEME_COLORS['selection_orange'],
                    width=3
                )
            ),
            hoverinfo='skip',
            showlegend=False
        ))

    # Set axis labels
    x_label = f"← {axis_labels.get('x', ('formal', 'sporty'))[0]} ... {axis_labels.get('x', ('formal', 'sporty'))[1]} →"
    y_label = f"← {axis_labels.get('y', ('dark', 'colorful'))[0]} ... {axis_labels.get('y', ('dark', 'colorful'))[1]} →"

    # Calculate axis ranges
    all_x = [img.coordinates[0] for img in visible_images]
    all_y = [img.coordinates[1] for img in visible_images]
    
    x_padding = (max(all_x) - min(all_x)) * 0.15 if len(all_x) > 1 else 1
    y_padding = (max(all_y) - min(all_y)) * 0.15 if len(all_y) > 1 else 1
    
    x_range = [min(all_x) - x_padding, max(all_x) + x_padding]
    y_range = [min(all_y) - y_padding, max(all_y) + y_padding]

    # Update layout with styling
    fig.update_layout(
        title=dict(
            text="👟 Semantic Latent Space",
            font=dict(size=20, color=THEME_COLORS['primary_blue']),
            x=0.5,
            xanchor='center'
        ),
        xaxis=dict(
            title=dict(
                text=x_label,
                font=dict(color=THEME_COLORS['text_primary'], size=12)
            ),
            tickfont=dict(color=THEME_COLORS['text_primary'], size=10),
            gridcolor='rgba(128,128,128,0.2)',
            zerolinecolor='rgba(128,128,128,0.3)',
            range=x_range
        ),
        yaxis=dict(
            title=dict(
                text=y_label,
                font=dict(color=THEME_COLORS['text_primary'], size=12)
            ),
            tickfont=dict(color=THEME_COLORS['text_primary'], size=10),
            gridcolor='rgba(128,128,128,0.2)',
            zerolinecolor='rgba(128,128,128,0.3)',
            range=y_range,
            scaleanchor="x",
            scaleratio=1
        ),
        paper_bgcolor=THEME_COLORS['bg_primary'],
        plot_bgcolor=THEME_COLORS['bg_primary'],
        height=550,  # Reduced from 650 for more compact layout
        hovermode='closest',
        dragmode='pan',
        margin=dict(l=50, r=30, t=50, b=50),  # Tighter margins
        images=layout_images
    )

    # Configure modebar
    config = {
        'displayModeBar': True,
        'displaylogo': False,
        'modeBarButtonsToRemove': ['select2d', 'lasso2d'],
        'toImageButtonOptions': {
            'format': 'png',
            'filename': 'semantic_space',
            'height': 1200,
            'width': 1600,
            'scale': 2
        }
    }

    return fig


def update_canvas_selection(
    fig: go.Figure,
    images_metadata: List[ImageMetadata],
    selected_ids: List[int],
    settings: Dict
) -> go.Figure:
    """Update canvas to reflect new selection state.

    This is a helper to update selection when it changes.
    In practice with Streamlit, we typically just recreate the figure.
    """
    # For Streamlit, we typically just rerun and recreate the figure
    return create_interactive_canvas(images_metadata, selected_ids, {}, settings)


def get_canvas_stats(images_metadata: List[ImageMetadata]) -> Dict:
    """Calculate statistics for the canvas stats badge.

    Args:
        images_metadata: List of ImageMetadata objects

    Returns:
        Dict with stats: n_images, n_groups, n_connections
    """
    n_images = len([img for img in images_metadata if img.visible])

    # Count unique groups
    groups = set(img.group_id for img in images_metadata if img.visible)
    n_groups = len(groups)

    # Count genealogy connections
    n_connections = 0
    for img in images_metadata:
        if img.visible:
            n_connections += len(img.children)  # Count parent→child connections

    return {
        'n_images': n_images,
        'n_groups': n_groups,
        'n_connections': n_connections
    }

