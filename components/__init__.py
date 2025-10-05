"""UI components for canvas-centric interface."""

from .history_timeline import show_history_timeline, highlight_group_in_canvas
from .settings_panel import show_visual_settings
from .context_menu import show_context_menu, show_image_details
from .axis_editor import show_axis_editor

__all__ = [
    'show_history_timeline',
    'highlight_group_in_canvas',
    'show_visual_settings',
    'show_context_menu',
    'show_image_details',
    'show_axis_editor'
]
