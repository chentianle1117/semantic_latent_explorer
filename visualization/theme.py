"""
Theme colors and styling constants for the semantic explorer.
Exact color palette from the artifact mockup.
"""

THEME_COLORS = {
    # Backgrounds
    'bg_primary': '#0d1117',      # Main canvas background
    'bg_secondary': '#161b22',    # Panel backgrounds
    'bg_tertiary': '#21262d',     # Hover states

    # Borders & Lines
    'border': '#30363d',
    'border_hover': '#58a6ff',
    'border_active': '#ffa657',

    # Interactive Elements
    'primary_blue': '#58a6ff',
    'secondary_purple': '#bc8cff',
    'success_green': '#3fb950',    # Parent arrows
    'warning_orange': '#d29922',   # Child arrows
    'selection_orange': '#ffa657',

    # Text
    'text_primary': '#e0e0e0',
    'text_secondary': '#8b949e',
    'text_tertiary': '#c9d1d9',

    # Buttons
    'btn_primary': '#238636',
    'btn_primary_hover': '#2ea043',
    'btn_secondary': '#21262d',
    'btn_secondary_hover': '#30363d',
    'btn_danger': '#da3633'        # Red button for delete/remove actions
}

# CSS for animations and effects
ANIMATION_CSS = """
<style>
@keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.15); }
}

@keyframes dash-flow {
    0% { stroke-dashoffset: 0; }
    100% { stroke-dashoffset: -12; }
}

.group-highlight {
    border: 3px solid #ffa657 !important;
    box-shadow: 0 0 24px rgba(255, 166, 87, 0.8) !important;
    animation: pulse 1.5s infinite;
}

.parent-highlight {
    border: 3px solid #3fb950 !important;
    box-shadow: 0 0 20px rgba(63, 185, 80, 0.7) !important;
}

.child-highlight {
    border: 3px solid #d29922 !important;
    box-shadow: 0 0 20px rgba(210, 153, 34, 0.7) !important;
}

.settings-panel {
    background: rgba(22, 27, 34, 0.95);
    border: 1px solid #30363d;
    padding: 16px;
    border-radius: 8px;
}

.settings-header {
    font-size: 13px;
    font-weight: 600;
    color: #8b949e;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.toggle-switch {
    position: relative;
    width: 40px;
    height: 20px;
    background: #30363d;
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.2s;
}

.toggle-switch.active {
    background: #238636;
}

.history-card {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 12px;
    min-width: 180px;
    transition: all 0.2s;
    cursor: pointer;
}

.history-card:hover {
    border-color: #58a6ff;
    transform: translateY(-2px);
}

.history-card.active {
    border-color: #ffa657;
    background: rgba(255, 166, 87, 0.05);
}

.btn-primary {
    background: #238636;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 8px 16px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
}

.btn-primary:hover {
    background: #2ea043;
}

.btn-secondary {
    background: #21262d;
    color: #e0e0e0;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 8px 16px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
}

.btn-secondary:hover {
    background: #30363d;
    border-color: #58a6ff;
}
</style>
"""
