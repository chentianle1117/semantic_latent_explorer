"""Visual settings panel component."""

import streamlit as st
from typing import Dict
from visualization.theme import THEME_COLORS


def show_visual_settings() -> Dict:
    """Display visual settings panel for canvas customization.

    Returns:
        Dict with settings: 'remove_background', 'image_size', 'opacity'
    """
    # Custom CSS for the settings panel - EXACT STYLING FROM ARTIFACT
    st.markdown(f"""
    <style>
    .settings-header {{
        color: {THEME_COLORS['text_secondary']};
        font-size: 13px;
        text-transform: uppercase;
        font-weight: 600;
        letter-spacing: 0.5px;
        margin-bottom: 12px;
    }}
    .settings-panel {{
        background: rgba(22, 27, 34, 0.95);
        border: 1px solid {THEME_COLORS['border']};
        border-radius: 8px;
        padding: 16px;
    }}
    </style>
    """, unsafe_allow_html=True)

    st.markdown('<p class="settings-header">VISUAL SETTINGS</p>', unsafe_allow_html=True)

    # Initialize session state for settings if not exists
    if 'remove_background' not in st.session_state:
        st.session_state.remove_background = True
    if 'image_size' not in st.session_state:
        st.session_state.image_size = 80  # Optimized for Bokeh canvas
    if 'image_opacity' not in st.session_state:
        st.session_state.image_opacity = 0.9

    # Remove Background Toggle
    remove_bg = st.toggle(
        "Remove Background",
        value=st.session_state.remove_background,
        help="Remove white backgrounds from shoe images",
        key="toggle_remove_bg"
    )
    st.session_state.remove_background = remove_bg

    # Visual indicator for toggle state - exact styling from artifact
    if remove_bg:
        st.markdown(f"""
        <div style="background-color: {THEME_COLORS['btn_primary']}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; text-align: center; margin-bottom: 12px;">
            ✓ Background Removal Active
        </div>
        """, unsafe_allow_html=True)

    st.divider()

    # Image Size Slider
    st.markdown("**Image Size**")
    image_size = st.slider(
        "Size (px)",
        min_value=30,
        max_value=200,
        value=st.session_state.image_size,
        step=10,
        help="Adjust the size of image points on canvas",
        label_visibility="collapsed"
    )
    st.session_state.image_size = image_size
    st.markdown(f"<p style='color: {THEME_COLORS['text_secondary']}; font-size: 12px;'>Current: {image_size}px</p>", unsafe_allow_html=True)

    st.divider()

    # Image Opacity Slider
    st.markdown("**Image Opacity**")
    opacity = st.slider(
        "Opacity",
        min_value=0.3,
        max_value=1.0,
        value=st.session_state.image_opacity,
        step=0.1,
        help="Adjust transparency of image points",
        label_visibility="collapsed"
    )
    st.session_state.image_opacity = opacity
    st.markdown(f"<p style='color: {THEME_COLORS['text_secondary']}; font-size: 12px;'>Current: {opacity:.1f}</p>", unsafe_allow_html=True)

    st.divider()

    # Quick preset buttons - optimized for Bokeh
    st.markdown("**Quick Presets**")
    col1, col2, col3 = st.columns(3)

    with col1:
        if st.button("S", use_container_width=True, help="50px images", key="preset_small"):
            st.session_state.image_size = 50
            st.rerun()

    with col2:
        if st.button("M", use_container_width=True, help="80px images", key="preset_medium"):
            st.session_state.image_size = 80
            st.rerun()

    with col3:
        if st.button("L", use_container_width=True, help="120px images", key="preset_large"):
            st.session_state.image_size = 120
            st.rerun()

    # Return settings dict
    return {
        'remove_background': remove_bg,
        'image_size': image_size,
        'opacity': opacity
    }
