# Canvas-Centric Zappos Semantic Explorer

**Version 2.0** - Canvas-centric interface with genealogy visualization

## 🎯 Overview

This is a complete restructure of the Zappos Semantic Explorer from a sidebar-driven Plotly interface to a **canvas-centric Bokeh interface** with **genealogy tracking**.

### Key Features

✅ **Canvas-First Design**: 75% canvas area / 25% control panel layout
✅ **Genealogy Visualization**: Interactive arrows showing parent-child relationships
✅ **Hover-Activated Lineage**: Green arrows (parent→current), Orange arrows (current→child)
✅ **History Timeline**: Horizontal scrollable timeline with group cards
✅ **Persistent Accumulation**: All images stay in canvas, UMAP extent remains stable
✅ **Context Menus**: Dynamic actions based on selection count

## 🏗️ Architecture

### New Data Structures

**ImageMetadata**
- Tracks: id, group_id, PIL image, embedding, coordinates
- **Genealogy**: parents list, children list
- Metadata: generation_method, prompt, timestamp, visible flag

**HistoryGroup**
- Tracks: id, type (batch/reference/interpolation/dataset)
- Images: image_ids list, thumbnail_id
- Metadata: prompt, timestamp, visible flag

### Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│ CANVAS AREA (75%)                                           │
│ ┌────────────────────────────┬──────────────────────────┐  │
│ │ Bokeh Plot                 │ Visual Settings          │  │
│ │ - Genealogy arrows         │ - Remove Background      │  │
│ │ - Image scatter            │ - Image Size (30-200px)  │  │
│ │ - Clickable axes           │ - Opacity (0.3-1.0)      │  │
│ └────────────────────────────┴──────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ CONTROL PANEL (25%)                                         │
│ ┌──────────────────┬────────────────────────────────────┐  │
│ │ Quick Actions    │ History Timeline                   │  │
│ │ - Prompt input   │ - Group cards (horizontal scroll)  │  │
│ │ - Generate       │ - Visibility toggles               │  │
│ │ - Load dataset   │ - Click to select/highlight        │  │
│ └──────────────────┴────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 🎨 Color Scheme

### Dark Theme
- Background: `#0d1117`
- Panels: `#161b22`
- Borders: `#30363d`
- Primary Blue: `#58a6ff`
- Purple: `#bc8cff`
- Green (parent arrows): `#3fb950`
- Orange (child arrows/selection): `#d29922`

### Group Colors
- Batch generation: `#58a6ff` (blue)
- Reference generation: `#bc8cff` (purple)
- Interpolation: `#3fb950` (green)
- Dataset images: `#d29922` (orange)

## 🚀 Usage

### Running the App

```bash
conda activate semantic_explorer
streamlit run app.py
```

### Workflow

1. **Initialize Generator**: Click "🎨 Initialize Generator"
2. **Generate Images**: Enter prompt and click "Generate"
3. **Explore Canvas**: Hover over images to see genealogy
4. **Select Images**: Click images to select
5. **Context Actions**:
   - 1 selected: Generate with prompt, View details, Remove
   - 2 selected: Interpolate between, Generate using both
   - 3+ selected: Generate from cluster, Analyze
6. **History Timeline**: Click group cards to highlight, toggle visibility

### Genealogy Visualization

**Hover over any image** to see:
- **Green dashed arrows**: From parent images to current
- **Orange dashed arrows**: From current to child images
- Parent/child images get colored borders
- Corresponding history group highlighted

## 📁 Project Structure

```
Zappos50K_semantic_explorer/
├── app.py                          # NEW: Canvas-centric main app
├── app_old.py                      # OLD: Backup of sidebar version
├── models/
│   ├── data_structures.py          # NEW: ImageMetadata, HistoryGroup
│   ├── embeddings.py               # CLIP embedder
│   ├── generator.py                # Stable Diffusion generator
│   └── semantic_axes.py            # Semantic axis builder
├── visualization/
│   ├── bokeh_canvas.py             # NEW: Bokeh canvas with genealogy
│   └── interactive_plot.py         # OLD: Plotly visualizations
├── components/                     # NEW: UI components
│   ├── history_timeline.py         # History group cards
│   ├── settings_panel.py           # Visual settings
│   └── context_menu.py             # Context-sensitive menus
├── data/
│   └── loader.py                   # Dataset loading
└── config.py                       # Configuration
```

## 🔧 Implementation Details

### Bokeh Canvas (visualization/bokeh_canvas.py)

**create_interactive_canvas()**
- Bokeh figure with tools: pan, wheel_zoom, reset, tap, hover
- ColumnDataSource with genealogy data (parents, children arrays)
- Circle glyph for scatter plot
- MultiLine glyph for genealogy arrows
- CustomJS callback for hover → arrow rendering

**CustomJS Logic**:
```javascript
// On hover:
1. Get hovered point index
2. Extract parents/children arrays
3. Build line coordinates:
   - Parents: [parent_x, parent_y] → [current_x, current_y] (green)
   - Children: [current_x, current_y] → [child_x, child_y] (orange)
4. Update MultiLine source dynamically
5. Clear on hover-out
```

### Genealogy Tracking

**Batch Generation** (`generate_from_prompt()`)
- Parents: [] (no parents)
- Creates new HistoryGroup of type 'batch'

**Reference Generation** (`generate_from_reference()`)
- Parents: [reference_id]
- Updates parent's children list
- Creates 'reference' type group

**Interpolation** (`interpolate_images()`)
- Parents: [id_a, id_b] (dual parents)
- Updates BOTH parents' children lists
- Creates 'interpolation' type group

### UMAP Stability

- **First generation**: `reducer.fit_transform()` to create space
- **Subsequent**: `reducer.transform()` to add to existing space
- Never refit → extent stays stable

## 🧪 Testing Checklist

- [ ] Layout: 75/25 split renders correctly
- [ ] Dark theme: All colors match specification
- [ ] Genealogy arrows: Appear on hover (green/orange)
- [ ] History timeline: Horizontal scroll, group cards
- [ ] History hover: Highlights canvas images
- [ ] Canvas hover: Highlights history group
- [ ] Settings sliders: Update visualization
- [ ] Buttons: #238636 green styling
- [ ] Visibility toggle: Eye icon ↔ cross icon
- [ ] Selection: Shows correct context menu
- [ ] Generate batch: Creates images, adds to history
- [ ] Generate reference: Tracks parent relationship
- [ ] Interpolate: Tracks both parents
- [ ] Clear canvas: Removes all images
- [ ] UMAP stability: New images added to existing space

## 📊 Stats Badge

Displays in canvas area:
- **N images** • **N groups** • **CLIP ViT-B/32** • Genealogy: **N connections**

## 🎯 Context Menus

### 1 Image Selected
- 🎨 Generate with Prompt
- 🔍 View Details
- 🗑️ Remove from Canvas

### 2 Images Selected
- 🔀 Interpolate Between
- 🎭 Generate Using Both

### 3+ Images Selected
- 🎨 Generate from Cluster
- 📊 Analyze Selection
- 🗑️ Remove All Selected

## 🔮 Future Enhancements

- [ ] Clickable axis labels for semantic editing
- [ ] Export genealogy graph
- [ ] Undo/redo for generations
- [ ] Save/load canvas state
- [ ] Dataset integration (Zappos loading)
- [ ] Advanced filtering by generation method
- [ ] Genealogy tree view (separate panel)

## 📝 Migration Notes

### From Old Version

The old sidebar-driven version is backed up as `app_old.py`.

**Key Changes**:
- Session state: `st.session_state.images` → `st.session_state.images_metadata`
- Structure: Sidebar controls → Bottom panel + settings sidebar
- Visualization: Plotly → Bokeh
- New feature: Genealogy tracking and visualization

### Backward Compatibility

Not maintained. This is a complete rewrite. To use old version:
```bash
streamlit run app_old.py
```

## 🛠️ Dependencies

```
bokeh>=3.3.0          # NEW: Interactive canvas
streamlit>=1.28.0
plotly>=5.11.0        # Still used for old version
open-clip-torch>=2.20.0
torch>=1.12.0
umap-learn>=0.5.3
numpy>=1.21.0
pandas>=1.5.0
Pillow>=9.0.0
```

## 📚 References

- [Bokeh Documentation](https://docs.bokeh.org/)
- [Streamlit Bokeh Charts](https://docs.streamlit.io/library/api-reference/charts/st.bokeh_chart)
- [UMAP Documentation](https://umap-learn.readthedocs.io/)
- [OpenCLIP](https://github.com/mlfoundations/open_clip)

## 🙏 Credits

**Original Architecture**: Sidebar-driven Plotly interface
**Restructure**: Canvas-centric Bokeh interface with genealogy

---

**Last Updated**: 2025-10-04
**Version**: 2.0.0
