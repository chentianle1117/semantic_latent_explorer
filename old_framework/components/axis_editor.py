"""Interactive axis label editor component."""

import streamlit as st
from typing import Dict, Tuple, Optional
from visualization.theme import THEME_COLORS


def show_axis_editor() -> Optional[Dict[str, Tuple[str, str]]]:
    """Display interactive axis label editor.

    Returns:
        Dict with updated axis labels if changed, None otherwise
        Format: {'x': (positive_label, negative_label), 'y': (positive_label, negative_label)}
    """
    st.markdown(f"""
    <style>
    .axis-editor {{
        background: {THEME_COLORS['bg_secondary']};
        border: 1px solid {THEME_COLORS['border']};
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 16px;
    }}
    .axis-editor-header {{
        color: {THEME_COLORS['text_secondary']};
        font-size: 13px;
        text-transform: uppercase;
        font-weight: 600;
        letter-spacing: 0.5px;
        margin-bottom: 12px;
    }}
    .axis-label-input {{
        background: {THEME_COLORS['bg_primary']};
        border: 1px solid {THEME_COLORS['border']};
        color: {THEME_COLORS['text_primary']};
        border-radius: 6px;
        padding: 8px;
        width: 100%;
    }}
    </style>
    """, unsafe_allow_html=True)

    st.markdown('<p class="axis-editor-header">🎯 SEMANTIC AXES</p>', unsafe_allow_html=True)

    # Initialize session state for axis labels if not exists
    if 'axis_labels' not in st.session_state:
        st.session_state.axis_labels = {
            'x': ('formal', 'sporty'),
            'y': ('dark', 'colorful')
        }

    # Track if labels changed
    labels_changed = False
    new_labels = {}

    # X-axis editor
    st.markdown("**X-Axis (Horizontal)**")
    col1, col2 = st.columns(2)

    with col1:
        x_negative = st.text_input(
            "← Left pole",
            value=st.session_state.axis_labels['x'][0],
            key="x_negative",
            help="Concept on the left side of X-axis"
        )

    with col2:
        x_positive = st.text_input(
            "Right pole →",
            value=st.session_state.axis_labels['x'][1],
            key="x_positive",
            help="Concept on the right side of X-axis"
        )

    # Check if X-axis changed
    if (x_negative, x_positive) != st.session_state.axis_labels['x']:
        labels_changed = True
        new_labels['x'] = (x_negative, x_positive)
    else:
        new_labels['x'] = st.session_state.axis_labels['x']

    st.divider()

    # Y-axis editor
    st.markdown("**Y-Axis (Vertical)**")
    col3, col4 = st.columns(2)

    with col3:
        y_negative = st.text_input(
            "← Bottom pole",
            value=st.session_state.axis_labels['y'][0],
            key="y_negative",
            help="Concept on the bottom of Y-axis"
        )

    with col4:
        y_positive = st.text_input(
            "Top pole →",
            value=st.session_state.axis_labels['y'][1],
            key="y_positive",
            help="Concept on the top of Y-axis"
        )

    # Check if Y-axis changed
    if (y_negative, y_positive) != st.session_state.axis_labels['y']:
        labels_changed = True
        new_labels['y'] = (y_negative, y_positive)
    else:
        new_labels['y'] = st.session_state.axis_labels['y']

    st.divider()

    # Apply button with visual feedback
    if labels_changed:
        st.markdown(f"""
        <div style="background: {THEME_COLORS['warning_orange']}; color: white; padding: 8px; border-radius: 6px; text-align: center; margin-bottom: 12px;">
            ⚠️ Axis labels changed - click Apply to recalculate UMAP
        </div>
        """, unsafe_allow_html=True)

        if st.button("🔄 Apply & Recalculate UMAP", type="primary", use_container_width=True):
            # Update session state
            st.session_state.axis_labels = new_labels
            st.session_state.umap_needs_recalc = True
            return new_labels
    else:
        st.markdown(f"""
        <div style="background: {THEME_COLORS['btn_primary']}; color: white; padding: 8px; border-radius: 6px; text-align: center; margin-bottom: 12px;">
            ✓ Axes configured
        </div>
        """, unsafe_allow_html=True)

    # Quick presets
    st.markdown("**Quick Presets**")
    preset_col1, preset_col2 = st.columns(2)

    with preset_col1:
        if st.button("🎨 Style Axis", use_container_width=True):
            st.session_state.axis_labels = {
                'x': ('casual', 'formal'),
                'y': ('minimalist', 'decorative')
            }
            st.session_state.umap_needs_recalc = True
            st.rerun()

    with preset_col2:
        if st.button("🌈 Color Axis", use_container_width=True):
            st.session_state.axis_labels = {
                'x': ('monochrome', 'colorful'),
                'y': ('dark', 'light')
            }
            st.session_state.umap_needs_recalc = True
            st.rerun()

    return None
