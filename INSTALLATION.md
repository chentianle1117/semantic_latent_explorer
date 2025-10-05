# Installation Guide

## Prerequisites

### 1. Python 3.8+
You already have this with your existing setup.

### 2. Node.js and npm
Download and install from: https://nodejs.org/
- **Recommended:** Node.js 18 LTS or newer
- npm comes bundled with Node.js

**Check if already installed:**
```bash
node --version
npm --version
```

## Installation Steps

### Backend Setup (Python)

**Option 1: Quick Install (Recommended)**

```bash
cd backend
pip install fastapi uvicorn[standard] python-multipart websockets
```

**Option 2: Install from requirements.txt**

```bash
cd backend
pip install -r requirements.txt
```

The other packages (PyTorch, CLIP, Stable Diffusion, etc.) should already be installed from your previous Streamlit setup.

### Frontend Setup (Node.js)

The `start_frontend.bat` script automatically installs packages on first run.

**Manual Installation:**
```bash
cd frontend
npm install
```

This installs:
- React 18
- D3.js 7
- Zustand (state management)
- Axios (HTTP client)
- Vite (build tool)
- TypeScript

## Verification

### 1. Backend Dependencies

```bash
cd backend
python -c "import fastapi, uvicorn; print('✅ FastAPI installed')"
python -c "import torch; print('✅ PyTorch installed')"
python -c "import transformers; print('✅ Transformers (CLIP) installed')"
python -c "import diffusers; print('✅ Diffusers (SD) installed')"
```

### 2. Frontend Dependencies

```bash
cd frontend
npm list --depth=0
```

Should show:
```
├── react@18.2.0
├── react-dom@18.2.0
├── d3@7.8.5
├── zustand@4.4.7
├── axios@1.6.2
└── vite@5.0.8
```

## Quick Start After Installation

### Terminal 1 - Backend:
```bash
start_backend.bat
```
Wait for: `"Application startup complete"` message

### Terminal 2 - Frontend:
```bash
start_frontend.bat
```
Wait for: `"Local: http://localhost:3000"` message

### Open Browser:
Navigate to: **http://localhost:3000**

## Troubleshooting

### "Module not found: fastapi"
```bash
pip install fastapi uvicorn
```

### "Node.js is not recognized"
- Install Node.js from https://nodejs.org/
- Restart your terminal/command prompt
- Verify: `node --version`

### "npm install" fails
```bash
cd frontend
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

### Backend port 8000 already in use
**Option 1:** Kill existing process:
```bash
# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:8000 | xargs kill -9
```

**Option 2:** Change port:
- Edit `backend/api.py` line (last line): `uvicorn.run(app, host="0.0.0.0", port=8001)`
- Edit `frontend/vite.config.ts`: Change proxy target to `http://localhost:8001`

### Frontend port 3000 already in use
The Vite dev server will automatically try port 3001, 3002, etc.

## GPU Support

The backend uses GPU by default if available. To force CPU:

Edit `backend/api.py`:
```python
# Change this line:
state.generator = SemanticGenerator(device='cuda')

# To:
state.generator = SemanticGenerator(device='cpu')
```

⚠️ **Note:** CPU generation will be significantly slower.

## What Gets Installed

### Backend (Python - ~50MB)
- **FastAPI**: Web framework
- **Uvicorn**: ASGI server
- **WebSockets**: Real-time communication
- (Your existing ML packages: PyTorch, CLIP, SD - already installed)

### Frontend (Node.js - ~200MB)
- **React**: UI framework
- **D3.js**: Canvas visualization
- **Zustand**: State management
- **Axios**: API client
- **Vite**: Build tool (dev server + bundler)
- **TypeScript**: Type checking

Total additional space needed: **~250MB**

## Development vs Production

### Development (what we're using now)
- Frontend runs on `http://localhost:3000` (Vite dev server)
- Backend runs on `http://localhost:8000`
- Hot reload enabled for both
- Source maps for debugging

### Production Build (optional)
```bash
cd frontend
npm run build
```
Creates optimized bundle in `frontend/dist/`

To serve production build:
```bash
# Install serve globally (once)
npm install -g serve

# Serve the build
cd frontend
serve -s dist -l 3000
```

## Next Steps

After installation:
1. ✅ Run `start_backend.bat`
2. ✅ Run `start_frontend.bat`
3. ✅ Open http://localhost:3000
4. ✅ Click "🎨 Generate Images"
5. ✅ Test hover interactions
6. ✅ Test selection and interpolation

See `REACT_README.md` for usage guide.
