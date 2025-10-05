"""History timeline component for tracking generation groups."""

import streamlit as st
from typing import List, Dict, Optional, Tuple
from models.data_structures import HistoryGroup, ImageMetadata
from visualization.theme import THEME_COLORS


def show_history_timeline(
    history_groups: List[HistoryGroup],
    images_metadata: List[ImageMetadata],
    hovered_group_id: Optional[str] = None
) -> Tuple[Optional[str], Dict[str, bool]]:
    """Display horizontal scrollable history timeline.

    Args:
        history_groups: List of HistoryGroup objects
        images_metadata: List of all ImageMetadata objects (for thumbnail lookup)
        hovered_group_id: Currently hovered group ID (if any)

    Returns:
        Tuple of (selected_group_id, visibility_changes_dict)
    """
    if not history_groups:
        st.info("No generation history yet. Generate some images to see them here!")
        return None, {}

    # EXACT STYLING FROM ARTIFACT
    st.markdown(f"""
    <style>
    .history-card {{
        background: {THEME_COLORS['bg_primary']};
        border: 1px solid {THEME_COLORS['border']};
        border-radius: 8px;
        padding: 12px;
        margin: 8px;
        min-width: 180px;
        cursor: pointer;
        transition: all 0.2s;
    }}
    .history-card:hover {{
        border-color: {THEME_COLORS['border_hover']};
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(88, 166, 255, 0.2);
    }}
    .history-card.active {{
        border-color: {THEME_COLORS['border_active']};
        background: rgba(255, 166, 87, 0.05);
    }}
    .history-card-header {{
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
    }}
    .history-type-badge {{
        font-size: 12px;
        font-weight: 600;
        color: {THEME_COLORS['text_secondary']};
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }}
    .history-count-badge {{
        background: {THEME_COLORS['primary_blue']};
        color: {THEME_COLORS['bg_primary']};
        padding: 2px 6px;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 600;
    }}
    .history-prompt {{
        color: {THEME_COLORS['text_tertiary']};
        font-size: 13px;
        margin: 8px 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }}
    .history-thumbnail {{
        width: 100%;
        height: 60px;
        background: linear-gradient(135deg, {THEME_COLORS['primary_blue']} 0%, {THEME_COLORS['secondary_purple']} 100%);
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 11px;
        font-weight: 600;
    }}
    .visibility-toggle {{
        cursor: pointer;
        font-size: 20px;
        padding: 4px;
        border-radius: 4px;
        background-color: transparent;
        transition: background-color 0.2s;
    }}
    .visibility-toggle:hover {{
        background-color: {THEME_COLORS['bg_tertiary']};
    }}
    </style>
    """, unsafe_allow_html=True)

    st.markdown("**GENERATION HISTORY**")

    # Create columns for horizontal scrolling
    # Use container with custom CSS for horizontal scroll
    selected_group = None
    visibility_changes = {}

    # Use session state to track selected group
    if 'selected_history_group' not in st.session_state:
        st.session_state.selected_history_group = None

    # Create a scrollable container
    cols = st.columns(min(len(history_groups), 6))  # Show up to 6 at once

    for idx, group in enumerate(history_groups[-6:]):  # Show last 6 groups
        with cols[idx % 6]:
            # Determine if this group is active
            is_active = st.session_state.selected_history_group == group.id

            # Type badge color based on type - using theme colors
            type_colors = {
                'batch': THEME_COLORS['primary_blue'],
                'reference': THEME_COLORS['secondary_purple'],
                'interpolation': THEME_COLORS['success_green'],
                'dataset': THEME_COLORS['warning_orange']
            }
            type_color = type_colors.get(group.type, THEME_COLORS['primary_blue'])

            # Truncate prompt
            prompt_display = group.prompt[:40] + "..." if len(group.prompt) > 40 else group.prompt
            if not prompt_display:
                prompt_display = f"{group.type.title()} generation"

            # Create card
            card_class = "history-card active" if is_active else "history-card"

            # Visibility toggle
            visibility_key = f"visibility_{group.id}"
            if visibility_key not in st.session_state:
                st.session_state[visibility_key] = group.visible

            col1, col2 = st.columns([3, 1])
            with col1:
                st.markdown(f"""
                <div style="background-color: {type_color}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; text-align: center; margin-bottom: 4px;">
                    {group.type.upper()}
                </div>
                """, unsafe_allow_html=True)

            with col2:
                st.markdown(f"""
                <div style="background-color: {THEME_COLORS['primary_blue']}; color: {THEME_COLORS['bg_primary']}; padding: 2px 6px; border-radius: 10px; font-size: 11px; font-weight: 600; text-align: center;">
                    {len(group.image_ids)}
                </div>
                """, unsafe_allow_html=True)

            # Prompt - exact styling from artifact
            st.markdown(f"""
            <div style="color: {THEME_COLORS['text_tertiary']}; font-size: 13px; margin: 8px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                {prompt_display}
            </div>
            """, unsafe_allow_html=True)

            # Thumbnail - exact styling from artifact
            st.markdown(f"""
            <div style="width: 100%; height: 60px; background: linear-gradient(135deg, {type_color} 0%, {THEME_COLORS['secondary_purple']} 100%); border-radius: 4px; display: flex; align-items: center; justify-content: center; color: white; font-size: 11px; font-weight: 600;">
                {group.type.upper()}
            </div>
            """, unsafe_allow_html=True)

            # Buttons
            col_select, col_vis = st.columns(2)
            with col_select:
                if st.button("Select", key=f"select_{group.id}", use_container_width=True):
                    st.session_state.selected_history_group = group.id
                    selected_group = group.id
                    st.rerun()

            with col_vis:
                current_vis = st.session_state[visibility_key]
                vis_icon = "👁️" if current_vis else "🚫"
                if st.button(vis_icon, key=f"vis_{group.id}", use_container_width=True):
                    st.session_state[visibility_key] = not current_vis
                    visibility_changes[group.id] = not current_vis
                    st.rerun()

            st.divider()

    return st.session_state.selected_history_group, visibility_changes


def highlight_group_in_canvas(
    group_id: str,
    images_metadata: List[ImageMetadata]
) -> List[int]:
    """Get list of image IDs belonging to a specific group.

    Args:
        group_id: The group ID to highlight
        images_metadata: List of all ImageMetadata objects

    Returns:
        List of image IDs in this group
    """
    return [img.id for img in images_metadata if img.group_id == group_id]
