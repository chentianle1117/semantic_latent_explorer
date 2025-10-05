"""Context menu component based on selection."""

import streamlit as st
from typing import List, Dict, Optional, Tuple
from models.data_structures import ImageMetadata
from visualization.theme import THEME_COLORS


def show_context_menu(
    selected_ids: List[int],
    images_metadata: List[ImageMetadata]
) -> Tuple[Optional[str], Dict]:
    """Show context-sensitive menu based on number of selected images.

    Args:
        selected_ids: List of selected image IDs
        images_metadata: List of all ImageMetadata objects

    Returns:
        Tuple of (action_name, parameters_dict)
    """
    if not selected_ids:
        return None, {}

    n_selected = len(selected_ids)

    st.markdown(f"""
    <style>
    .context-menu {{
        background-color: {THEME_COLORS['bg_secondary']};
        border: 1px solid {THEME_COLORS['border']};
        border-radius: 8px;
        padding: 12px;
        margin-top: 12px;
    }}
    .context-menu-header {{
        color: {THEME_COLORS['primary_blue']};
        font-size: 13px;
        font-weight: bold;
        margin-bottom: 8px;
    }}
    </style>
    """, unsafe_allow_html=True)

    st.markdown(f"""
    <div class="context-menu-header">
        {n_selected} image{'s' if n_selected > 1 else ''} selected
    </div>
    """, unsafe_allow_html=True)

    action = None
    params = {}

    if n_selected == 1:
        # Single image selected
        st.markdown("**Single Image Actions:**")

        col1, col2 = st.columns(2)
        with col1:
            if st.button("🎨 Generate with Prompt", use_container_width=True, key="ctx_gen_prompt"):
                action = "generate_from_reference"
                params = {"reference_id": selected_ids[0]}

        with col2:
            if st.button("🔍 View Details", use_container_width=True, key="ctx_view"):
                action = "view_details"
                params = {"image_id": selected_ids[0]}

        if st.button("🗑️ Remove from Canvas", use_container_width=True, key="ctx_remove"):
            action = "remove_images"
            params = {"image_ids": selected_ids}

    elif n_selected == 2:
        # Two images selected
        st.markdown("**Two Images Actions:**")

        col1, col2 = st.columns(2)
        with col1:
            if st.button("🔀 Interpolate Between", use_container_width=True, key="ctx_interpolate"):
                action = "interpolate"
                params = {"id_a": selected_ids[0], "id_b": selected_ids[1]}

        with col2:
            if st.button("🎭 Generate Using Both", use_container_width=True, key="ctx_gen_both"):
                action = "generate_from_both"
                params = {"reference_ids": selected_ids}

    else:
        # Multiple images selected (3+)
        st.markdown("**Multiple Images Actions:**")

        col1, col2 = st.columns(2)
        with col1:
            if st.button("🎨 Generate from Cluster", use_container_width=True, key="ctx_cluster"):
                action = "generate_from_cluster"
                params = {"image_ids": selected_ids}

        with col2:
            if st.button("📊 Analyze Selection", use_container_width=True, key="ctx_analyze"):
                action = "analyze_selection"
                params = {"image_ids": selected_ids}

        if st.button("🗑️ Remove All Selected", use_container_width=True, key="ctx_remove_all"):
            action = "remove_images"
            params = {"image_ids": selected_ids}

    return action, params


def execute_context_action(action: str, params: Dict, images_metadata: List[ImageMetadata]):
    """Execute a context menu action.

    Args:
        action: Action name
        params: Action parameters
        images_metadata: List of ImageMetadata objects
    """
    if action == "generate_from_reference":
        st.info("Reference-based generation will be implemented")
        # Call generate_from_reference function

    elif action == "interpolate":
        st.info("Interpolation will be implemented")
        # Call interpolate_images function

    elif action == "view_details":
        # Show image details
        image_id = params.get("image_id")
        img_meta = next((img for img in images_metadata if img.id == image_id), None)
        if img_meta:
            show_image_details(img_meta)

    elif action == "remove_images":
        # Remove images from canvas
        image_ids = params.get("image_ids", [])
        for img_id in image_ids:
            for img in images_metadata:
                if img.id == img_id:
                    img.visible = False
        st.success(f"Removed {len(image_ids)} image(s)")
        st.rerun()

    elif action == "analyze_selection":
        st.info("Analysis will show semantic clustering statistics")


def show_image_details(img_meta: ImageMetadata):
    """Show detailed information about an image.

    Args:
        img_meta: ImageMetadata object
    """
    st.markdown("### Image Details")

    col1, col2 = st.columns([1, 2])

    with col1:
        st.image(img_meta.pil_image, caption=f"Image {img_meta.id}", use_container_width=True)

    with col2:
        st.markdown(f"""
        **ID:** {img_meta.id}

        **Group:** {img_meta.group_id}

        **Method:** {img_meta.generation_method}

        **Prompt:** {img_meta.prompt if img_meta.prompt else 'N/A'}

        **Parents:** {len(img_meta.parents)} ({', '.join(map(str, img_meta.parents)) if img_meta.parents else 'None'})

        **Children:** {len(img_meta.children)} ({', '.join(map(str, img_meta.children)) if img_meta.children else 'None'})

        **Coordinates:** ({img_meta.coordinates[0]:.2f}, {img_meta.coordinates[1]:.2f})

        **Timestamp:** {img_meta.timestamp.strftime('%Y-%m-%d %H:%M:%S')}
        """)
