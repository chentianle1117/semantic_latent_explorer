# 👟 Zappos Semantic Explorer

An interactive tool for exploring semantic latent spaces of footwear images using CLIP embeddings, UMAP visualization, and semantic axes. Now featuring **Plotly-based interactive canvas** with optimized UI/UX!

> **Latest Update**: Migrated from Bokeh to Plotly for improved performance and a more compact, focused interface. See [PLOTLY_MIGRATION_SUMMARY.md](PLOTLY_MIGRATION_SUMMARY.md) for details.

## 🎯 What it does

- **Load** UT Zappos50K shoe images with metadata
- **Extract** CLIP embeddings for semantic understanding
- **Project** high-dimensional embeddings to 2D using UMAP
- **Create** semantic axes (sporty↔formal, pointy↔rounded, etc.)
- **Explore** the latent space interactively
- **Analyze** extreme examples along semantic dimensions
- **🆕 Generate** new shoe designs using Stable Diffusion
  - Generate from text prompts
  - Generate from reference images + text
  - Interpolate between two designs
  - See generated images in semantic space automatically
  - Track generation history and iterations

## 🚀 Quick Start

### 1. Setup Environment

```bash
# Clone or create project directory
mkdir zappos_explorer
cd zappos_explorer

# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Activate (Mac/Linux)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Update Dataset Path

Edit `config.py` and update the dataset path:

```python
DATASET_ROOT = Path("W:/CMU_Academics/2025 Fall/Thesis Demo")  # Update this!
```

### 3. Run the Application

```bash
streamlit run app.py
```

The app will open in your browser at `http://localhost:8501`

### 4. (Optional) Enable Generation Workflow

To use the Stable Diffusion generation features:

```bash
# Install additional dependencies
pip install diffusers accelerate transformers xformers

# The models will auto-download on first use (~4GB)
```

See [GENERATION_WORKFLOW_GUIDE.md](GENERATION_WORKFLOW_GUIDE.md) for detailed usage instructions.

## 📁 Project Structure

```
zappos_explorer/
├── data/
│   ├── __init__.py
│   └── loader.py          # UT Zappos50K dataset loading
├── models/
│   ├── __init__.py
│   ├── embeddings.py      # CLIP embedding extraction
│   └── semantic_axes.py   # Semantic axis construction
├── visualization/
│   ├── __init__.py
│   ├── plotly_canvas.py    # Main Plotly-based interactive canvas
│   ├── interactive_plot.py # Additional Plotly utilities
│   └── theme.py            # UI theme and colors
├── cache/                 # Auto-created for caching embeddings
├── app.py                 # Main Streamlit application
├── config.py              # Configuration settings
├── requirements.txt       # Python dependencies
└── README.md
```

## 🎮 How to Use

### Step 1: Load Dataset

1. Set number of images (start with 200 for faster prototyping)
2. Click "Load Dataset"
3. View sample metadata and categories

### Step 2: Extract Embeddings

1. Click "Extract CLIP Embeddings"
2. Wait for CLIP model to load and process images
3. Embeddings are cached automatically for reuse

### Step 3: Create Visualization

1. Adjust UMAP parameters (neighbors, min distance)
2. Click "Create UMAP" to project to 2D
3. View the scatter plot of images in latent space

### Step 4: Explore Semantic Axes

1. Click "Create Default Axes" for predefined concepts
2. Or create custom axes with your own text concepts
3. Color the visualization by different semantic dimensions
4. Analyze extreme examples along each axis

## 🔧 Configuration

Key settings in `config.py`:

- `MAX_IMAGES`: Maximum images to load (start with 200-500)
- `CLIP_MODEL`: CLIP model variant ("ViT-B-32" recommended)
- `UMAP_N_NEIGHBORS`: UMAP clustering parameter (15 default)
- `UMAP_MIN_DIST`: UMAP spread parameter (0.1 default)

## 💾 Caching

The system automatically caches:

- **CLIP embeddings** - expensive to compute, saved per image set
- **UMAP projections** - saved with parameter combinations
- **Processed datasets** - metadata extraction results

Cache files are stored in `cache/` directory and can be deleted to force recomputation.

## 🛠️ Technical Details

### Models & Libraries Used

- **CLIP ViT-B/32**: For image and text embeddings
- **Stable Diffusion**: For image generation (optional)
- **UMAP**: For dimensionality reduction and visualization
- **Plotly**: Interactive visualization with genealogy tracking
- **Streamlit**: Web application framework

### Semantic Axes

- **CLIP Text Axes**: Created by subtracting negative from positive text embeddings
- **Supervised Axes**: Trained on human labels (when available)
- **PCA Axes**: Principal components of embedding space

### Performance Notes

- **RTX 4060**: Should handle 200-500 images comfortably
- **CPU fallback**: Works but slower, reduce batch sizes
- **Memory usage**: ~2GB for 500 images with embeddings

## 🔬 Extending the System

### Adding New Semantic Axes

```python
# In the sidebar custom axis section
pos_concept = "comfortable walking shoe"
neg_concept = "stiff formal shoe"
# Creates CLIP text-based semantic axis
```

### Adding New Datasets

1. Implement new loader in `data/loader.py`
2. Update `config.py` with dataset paths
3. Ensure images are accessible as file paths

### Integrating Image Generation

- Add Stable Diffusion pipeline to `models/`
- Generate images → extract embeddings → add to UMAP
- Enable real-time exploration of generated content

## 🐛 Troubleshooting

### "Dataset not found"

- Check `DATASET_ROOT` path in `config.py`
- Ensure UT Zappos50K images are extracted properly
- Try absolute paths if relative paths fail

### "CUDA out of memory"

- Reduce `MAX_IMAGES` in config
- Reduce batch size in embedding extraction
- Use CPU fallback: set `CUDA_VISIBLE_DEVICES=""`

### "UMAP takes too long"

- Reduce number of images
- Increase `UMAP_N_NEIGHBORS` (makes it faster)
- Use cached embeddings instead of recomputing

### "Images not loading"

- Check image file paths in dataset
- Ensure images are valid format (jpg, png)
- Look for permission issues on dataset directory

## 📚 Documentation

- **[USAGE_GUIDE.md](USAGE_GUIDE.md)** - Comprehensive usage guide
- **[PLOTLY_MIGRATION_SUMMARY.md](PLOTLY_MIGRATION_SUMMARY.md)** - Migration details and benefits
- **[UI_OPTIMIZATION_DETAILS.md](UI_OPTIMIZATION_DETAILS.md)** - Layout and design decisions
- **[MIGRATION_CHECKLIST.md](MIGRATION_CHECKLIST.md)** - Complete migration checklist

## 🎯 Next Steps

This prototype provides the foundation for:

1. **✅ Real-time generation** - Stable Diffusion integration (COMPLETE)
2. **✅ Interactive visualization** - Plotly-based canvas (COMPLETE)
3. **Multi-axis exploration** - Combine multiple semantic directions
4. **✅ Interpolation** - Generate images between semantic points (COMPLETE)
5. **Advanced metrics** - Time-to-satisfactory, user studies

## 📊 Performance Expectations

With RTX 4060 mobile:

- **Dataset loading**: 5-10 seconds (200 images)
- **CLIP embedding**: 30-60 seconds (200 images)
- **UMAP projection**: 10-20 seconds
- **Semantic axis creation**: 2-5 seconds each
- **Total setup time**: ~2-3 minutes for 200 images

## 🤝 Contributing

This is a research prototype. Key areas for improvement:

- Better caching strategies
- More semantic axis types
- Performance optimizations
- UI/UX enhancements
- Integration with generation models

## 📄 License

MIT License - see LICENSE file for details.
