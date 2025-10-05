# Quick Start Guide

## 🚀 Installation (One-Time Setup)

### Simple Method (Recommended)
```bash
# Just run this:
install.bat
```

### Manual Method
```bash
# Backend
cd backend
pip install fastapi uvicorn[standard] python-multipart websockets

# Frontend (need Node.js from https://nodejs.org/)
cd frontend
npm install
```

---

## ▶️ Running the App

### Method 1: One Command (Easiest!)

**Just double-click or run:**
```bash
start_app.bat
```
OR
```bash
.\start_app.ps1
```

This opens **both** backend and frontend in separate windows automatically!

Then open: **http://localhost:3000**

---

### Method 2: Manual (Two Terminals)

**Terminal 1:**
```bash
start_backend.bat
```
Wait for: `"Application startup complete"`

**Terminal 2:**
```bash
start_frontend.bat
```
Wait for: `"Local: http://localhost:3000"`

**Browser:**
Open: **http://localhost:3000**

---

## 🎮 Basic Usage

### 1. Generate Images
- Click **"🎨 Generate Images"**
- Enter prompt: `"sporty premium sneaker design"`
- Enter count: `8`
- Wait for generation (~30 seconds)

### 2. Interact with Canvas
- **Hover** over image → See genealogy (green/orange arrows)
- **Click** image → Select (orange border)
- **Ctrl+Click** → Multi-select
- **Scroll wheel** → Zoom
- **Click+Drag** → Pan

### 3. Advanced Generation
- **Select 1 image** → "Generate from Reference" appears
- **Select 2 images** → "Interpolate Between" appears

---

## 📦 What You Need

### Already Have ✅
- Python 3.8+
- PyTorch
- CLIP (transformers)
- Stable Diffusion (diffusers)

### Need to Install 📥

**Backend (Python):**
```bash
pip install fastapi uvicorn websockets
```

**Frontend (Node.js):**
1. Install Node.js: https://nodejs.org/
2. Run in `/frontend`: `npm install`

---

## ❓ Troubleshooting

| Problem | Solution |
|---------|----------|
| "Module not found: fastapi" | `pip install fastapi uvicorn` |
| "Node.js is not recognized" | Install from https://nodejs.org/ |
| Backend won't start | Check Python environment is activated |
| Frontend won't start | Run `npm install` in `/frontend` folder |
| Port 8000 in use | Kill other Python processes or change port |
| Generation is slow | Normal on CPU, use GPU for speed |

---

## 📚 Documentation

- **INSTALLATION.md** - Detailed installation guide
- **REACT_README.md** - Complete usage guide
- **REACT_STATUS.md** - Implementation status & features

---

## 🎯 File Structure

```
Zappos50K_semantic_explorer/
├── install.bat              ← Run this first
├── start_backend.bat        ← Then run this
├── start_frontend.bat       ← Then run this
├── backend/
│   └── api.py              (FastAPI server)
└── frontend/
    └── src/
        └── App.tsx         (React app)
```

---

## ✨ Key Features

✅ **Interactive Canvas** with D3.js visualization
✅ **Real-time updates** via WebSocket
✅ **Genealogy tracking** (parent/child relationships)
✅ **Smart generation** (batch, reference, interpolation)
✅ **Semantic axes** (editable positioning)
✅ **Visual settings** (size, opacity adjustments)

---

## 🔥 Quick Commands

```bash
# Install everything
install.bat

# Start backend (Terminal 1)
start_backend.bat

# Start frontend (Terminal 2)
start_frontend.bat

# Open app
# → http://localhost:3000
```

---

**That's it! You're ready to explore the semantic latent space.** 👟✨
