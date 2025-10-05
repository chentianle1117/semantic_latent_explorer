"""Bokeh-based interactive canvas with genealogy visualization."""

import numpy as np
import base64
from io import BytesIO
from typing import List, Dict, Tuple, Optional
from bokeh.plotting import figure
from bokeh.models import (
    ColumnDataSource, HoverTool, TapTool, CustomJS,
    MultiLine, Circle, Label, Arrow, NormalHead, ImageURL, Range1d
)
from PIL import Image
from bokeh.palettes import Category20
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
    """Convert PIL image to base64 data URL for Bokeh.

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
) -> figure:
    """Create Bokeh interactive canvas with genealogy visualization.

    Args:
        images_metadata: List of ImageMetadata objects
        selected_ids: List of currently selected image IDs
        axis_labels: Dict with 'x' and 'y' keys, values are (positive, negative) concept tuples
        settings: Visual settings dict with 'image_size', 'opacity', 'remove_background'

    Returns:
        Bokeh figure object
    """
    if settings is None:
        settings = {
            'image_size': 120,
            'opacity': 0.9,
            'remove_background': True
        }

    # Extract data from ImageMetadata objects
    if not images_metadata:
        # Return empty plot if no images
        p = figure(
            width=1200, height=600,
            title="Semantic Latent Space (No images loaded)",
            tools="pan,wheel_zoom,reset",
            background_fill_color="#0d1117",
            border_fill_color="#0d1117"
        )
        return p

    # Prepare data for ColumnDataSource
    data = {
        'x': [],
        'y': [],
        'id': [],
        'group_id': [],
        'parents': [],  # List of parent IDs for each point
        'children': [],  # List of child IDs for each point
        'prompt': [],
        'colors': [],
        'sizes': [],
        'method': [],
        'image_urls': [],  # Base64 image URLs
        'widths': [],      # Image display widths
        'heights': [],     # Image display heights
        'parent_alpha': [],  # Alpha values for parent border highlighting
        'child_alpha': []    # Alpha values for child border highlighting
    }

    # Calculate plot range for dynamic scaling
    all_x = [img.coordinates[0] for img in images_metadata if img.visible]
    all_y = [img.coordinates[1] for img in images_metadata if img.visible]

    if all_x and all_y:
        x_range_span = max(all_x) - min(all_x) if len(all_x) > 1 else 10
        y_range_span = max(all_y) - min(all_y) if len(all_y) > 1 else 10
        # Dynamic scaling: image size in pixels / figure width in pixels * data range
        # Assuming figure is ~1200px wide, convert px size to data units
        plot_scale = (x_range_span / 1200) * 1.2  # 1.2x for better visibility
    else:
        plot_scale = 0.02  # Smaller default

    for img_meta in images_metadata:
        if not img_meta.visible:
            continue

        data['x'].append(img_meta.coordinates[0])
        data['y'].append(img_meta.coordinates[1])
        data['id'].append(img_meta.id)
        data['group_id'].append(img_meta.group_id)
        data['parents'].append(img_meta.parents)
        data['children'].append(img_meta.children)
        data['prompt'].append(img_meta.prompt if img_meta.prompt else 'Dataset image')
        data['method'].append(img_meta.generation_method)

        # Color based on group type
        color = get_group_color(img_meta.group_id, img_meta.generation_method)
        data['colors'].append(color)

        # Size based on selection and settings
        base_size = settings['image_size']
        if img_meta.id in selected_ids:
            size = base_size * 1.15  # Selected: larger
        else:
            size = base_size

        data['sizes'].append(size)

        # Convert PIL image to base64 URL
        thumbnail_size = int(base_size * 2)  # Higher resolution for better quality
        img_url = pil_to_base64_url(img_meta.pil_image, size=(thumbnail_size, thumbnail_size))
        data['image_urls'].append(img_url)

        # Calculate display size in plot units (scale proportionally to slider value)
        display_size = size * plot_scale
        data['widths'].append(display_size)
        data['heights'].append(display_size)

        # Initialize alpha values for hover highlighting (0 = hidden)
        data['parent_alpha'].append(0)
        data['child_alpha'].append(0)

    # Create ColumnDataSource
    scatter_source = ColumnDataSource(data=data)

    # Create figure
    x_label = f"← {axis_labels.get('x', ('formal', 'sporty'))[0]} ... {axis_labels.get('x', ('formal', 'sporty'))[1]} →"
    y_label = f"← {axis_labels.get('y', ('dark', 'colorful'))[0]} ... {axis_labels.get('y', ('dark', 'colorful'))[1]} →"

    # Calculate or retrieve axis ranges for stable extent
    all_x = [img_meta.coordinates[0] for img_meta in images_metadata if img_meta.visible]
    all_y = [img_meta.coordinates[1] for img_meta in images_metadata if img_meta.visible]

    if all_x and all_y:
        x_padding = (max(all_x) - min(all_x)) * 0.1 or 1
        y_padding = (max(all_y) - min(all_y)) * 0.1 or 1
        x_range = Range1d(min(all_x) - x_padding, max(all_x) + x_padding)
        y_range = Range1d(min(all_y) - y_padding, max(all_y) + y_padding)
    else:
        x_range = Range1d(-10, 10)
        y_range = Range1d(-10, 10)

    p = figure(
        width=1200,
        height=600,
        title="👟 Semantic Latent Space",
        tools="pan,wheel_zoom,reset,tap",
        background_fill_color=THEME_COLORS['bg_primary'],
        border_fill_color=THEME_COLORS['bg_primary'],
        outline_line_color=THEME_COLORS['border'],
        x_axis_label=x_label,
        y_axis_label=y_label,
        x_range=x_range,
        y_range=y_range,
        active_scroll='wheel_zoom'
    )

    # Style the plot - exact styling from artifact
    p.title.text_color = THEME_COLORS['primary_blue']
    p.title.text_font_size = "24px"
    p.xaxis.axis_label_text_color = THEME_COLORS['text_primary']
    p.yaxis.axis_label_text_color = THEME_COLORS['text_primary']
    p.xaxis.major_label_text_color = THEME_COLORS['text_primary']
    p.yaxis.major_label_text_color = THEME_COLORS['text_primary']

    # Grid styling - exact from artifact
    p.xgrid.grid_line_color = 'rgba(128,128,128,0.3)'
    p.ygrid.grid_line_color = 'rgba(128,128,128,0.3)'
    p.xaxis.axis_line_color = 'rgba(128,128,128,0.5)'
    p.yaxis.axis_line_color = 'rgba(128,128,128,0.5)'

    # Create MultiLine source for genealogy arrows (initially empty)
    line_source = ColumnDataSource(data={'xs': [], 'ys': [], 'colors': []})

    # Add MultiLine glyph for genealogy arrows - exact styling from artifact
    # Parent arrows: stroke-width=3, stroke-dasharray=[8,4], color=#3fb950
    # Child arrows: stroke-width=2.5, stroke-dasharray=[8,4], color=#d29922
    # Note: Bokeh multi_line doesn't support per-line dash patterns or widths from source,
    # so we use uniform styling that matches the artifact
    lines = p.multi_line(
        xs='xs',
        ys='ys',
        line_color='colors',
        line_width=3,  # Parent line width (dominant visual)
        line_dash='dashed',  # Use string dash pattern for Bokeh compatibility
        line_alpha=0.8,
        source=line_source
    )

    # Add image glyphs - display actual images instead of circles
    # Images are centered at (x, y) coordinates
    images = p.image_url(
        url='image_urls',
        x='x',
        y='y',
        w='widths',
        h='heights',
        anchor='center',
        global_alpha=settings['opacity'],
        source=scatter_source
    )

    # Add invisible circles for better interaction (selection, hover)
    # These provide the selection/hover feedback while images are displayed
    circles = p.circle(
        x='x',
        y='y',
        size='sizes',
        fill_alpha=0,  # Invisible fill
        line_alpha=0,  # Invisible by default
        source=scatter_source,

        # Selection styling - exact from artifact
        selection_fill_alpha=0,
        selection_line_color=THEME_COLORS['selection_orange'],  # '#ffa657'
        selection_line_alpha=1.0,
        selection_line_width=3,

        # Non-selection (invisible)
        nonselection_fill_alpha=0,
        nonselection_line_alpha=0,

        # Hover styling - main hovered image gets blue border
        hover_fill_alpha=0,
        hover_line_color=THEME_COLORS['border_hover'],  # '#58a6ff'
        hover_line_alpha=1.0,
        hover_line_width=3
    )

    # Add additional circles for parent/child highlighting during hover
    # These will be updated via CustomJS callback
    parent_circles = p.circle(
        x='x',
        y='y',
        size='sizes',
        fill_alpha=0,
        line_alpha='parent_alpha',  # Controlled by CustomJS via data field
        line_color=THEME_COLORS['success_green'],  # '#3fb950' - Green for parents
        line_width=3,
        source=scatter_source
    )

    child_circles = p.circle(
        x='x',
        y='y',
        size='sizes',
        fill_alpha=0,
        line_alpha='child_alpha',  # Controlled by CustomJS via data field
        line_color=THEME_COLORS['warning_orange'],  # '#d29922' - Orange for children
        line_width=3,
        source=scatter_source
    )

    # Create hover tool with CustomJS for genealogy visualization AND border highlighting
    # EXACT IMPLEMENTATION FROM ARTIFACT
    hover_callback = CustomJS(
        args={'scatter_source': scatter_source, 'line_source': line_source},
        code="""
        // Get hovered point index
        const indices = cb_data.index.indices;

        if (indices.length === 0) {
            // No hover - clear lines and hide border highlights
            line_source.data = {'xs': [], 'ys': [], 'colors': []};
            line_source.change.emit();

            // Reset alpha values to hide all borders
            const n_points = scatter_source.data['x'].length;
            scatter_source.data['parent_alpha'] = new Array(n_points).fill(0);
            scatter_source.data['child_alpha'] = new Array(n_points).fill(0);
            scatter_source.change.emit();
            return;
        }

        const idx = indices[0];

        // Get parents and children arrays for this point
        const parents = scatter_source.data['parents'][idx];
        const children = scatter_source.data['children'][idx];

        // Get coordinates
        const curr_x = scatter_source.data['x'][idx];
        const curr_y = scatter_source.data['y'][idx];

        // Build line data
        const xs = [];
        const ys = [];
        const colors = [];

        // Track which indices are parents/children for border highlighting
        const parent_indices = [];
        const child_indices = [];

        // PARENT LINES (upstream - green, thicker)
        // Exact styling: stroke='#3fb950', stroke-width=3, stroke-dasharray=[8,4]
        if (parents && Array.isArray(parents)) {
            for (let i = 0; i < parents.length; i++) {
                const p_id = parents[i];
                // Find parent index in scatter data
                const p_idx = scatter_source.data['id'].indexOf(p_id);
                if (p_idx !== -1) {
                    const p_x = scatter_source.data['x'][p_idx];
                    const p_y = scatter_source.data['y'][p_idx];
                    xs.push([p_x, curr_x]);
                    ys.push([p_y, curr_y]);
                    colors.push('#3fb950');  // Green
                    parent_indices.push(p_idx);
                }
            }
        }

        // CHILD LINES (downstream - orange, slightly thinner)
        // Exact styling: stroke='#d29922', stroke-width=2.5, stroke-dasharray=[8,4]
        if (children && Array.isArray(children)) {
            for (let i = 0; i < children.length; i++) {
                const c_id = children[i];
                // Find child index in scatter data
                const c_idx = scatter_source.data['id'].indexOf(c_id);
                if (c_idx !== -1) {
                    const c_x = scatter_source.data['x'][c_idx];
                    const c_y = scatter_source.data['y'][c_idx];
                    xs.push([curr_x, c_x]);
                    ys.push([curr_y, c_y]);
                    colors.push('#d29922');  // Orange
                    child_indices.push(c_idx);
                }
            }
        }

        // Update line source
        line_source.data = {
            'xs': xs,
            'ys': ys,
            'colors': colors
        };
        line_source.change.emit();

        // Update parent/child border highlighting via alpha values
        // Create line_alpha arrays - 1.0 for highlighted indices, 0 for others
        const n_points = scatter_source.data['x'].length;
        const parent_alphas = new Array(n_points).fill(0);
        const child_alphas = new Array(n_points).fill(0);

        // Set alpha to 1.0 for parent indices (green borders)
        for (let i = 0; i < parent_indices.length; i++) {
            parent_alphas[parent_indices[i]] = 1.0;
        }

        // Set alpha to 1.0 for child indices (orange borders)
        for (let i = 0; i < child_indices.length; i++) {
            child_alphas[child_indices[i]] = 1.0;
        }

        // Update alpha fields in source data
        scatter_source.data['parent_alpha'] = parent_alphas;
        scatter_source.data['child_alpha'] = child_alphas;
        scatter_source.change.emit();
        """
    )

    # Prepare genealogy display strings for tooltip
    parents_display = []
    children_display = []
    for img_meta in images_metadata:
        if not img_meta.visible:
            parents_display.append("N/A")
            children_display.append("N/A")
            continue

        # Format parents
        if img_meta.parents:
            parents_str = f"Images {', '.join(map(str, img_meta.parents))}"
        else:
            parents_str = "None (original)"
        parents_display.append(parents_str)

        # Format children
        if img_meta.children:
            children_str = f"Images {', '.join(map(str, img_meta.children))}"
        else:
            children_str = "Not used as reference"
        children_display.append(children_str)

    scatter_source.data['parents_display'] = parents_display
    scatter_source.data['children_display'] = children_display

    # Add HoverTool with enhanced genealogy tooltip
    hover = HoverTool(
        tooltips="""
        <div style="background: #161b22; padding: 12px; border: 1px solid #30363d; border-radius: 6px; min-width: 200px;">
            <div style="color: #58a6ff; font-weight: 600; margin-bottom: 8px;">Image @id</div>
            <div style="color: #8b949e; font-size: 12px; margin-bottom: 4px;">Group: @group_id</div>
            <div style="color: #c9d1d9; font-size: 12px; margin-bottom: 8px;">@prompt</div>
            <div style="border-top: 1px solid #30363d; padding-top: 8px; margin-top: 8px;">
                <div style="color: #3fb950; font-size: 11px; margin-bottom: 4px;">
                    ⬆️ Parents: @parents_display
                </div>
                <div style="color: #d29922; font-size: 11px;">
                    ⬇️ Children: @children_display
                </div>
            </div>
        </div>
        """,
        callback=hover_callback,
        renderers=[circles]
    )
    p.add_tools(hover)

    # Add TapTool for selection
    tap = TapTool(renderers=[circles])
    p.add_tools(tap)

    return p


def update_canvas_selection(
    fig: figure,
    images_metadata: List[ImageMetadata],
    selected_ids: List[int],
    settings: Dict
) -> figure:
    """Update canvas to reflect new selection state.

    This is a helper to update the scatter source when selection changes.
    In practice, you may recreate the entire canvas or use Streamlit rerun.
    """
    # This function would be used if we need to update selection without full rerun
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
