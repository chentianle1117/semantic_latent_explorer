# Step-by-Step Installation Instructions

## ⚡ Easiest Method (Automated)

Just double-click this file:
```
install_with_conda.bat
```

This automatically:
- ✅ Activates your `semantic_explorer` conda environment
- ✅ Installs backend packages (FastAPI, uvicorn, websockets)
- ✅ Installs frontend packages (React, D3.js, etc.)

Then you're ready to run the app!

---

## 📝 Manual Method (If Script Fails)

### Step 1: Install Node.js (Frontend Requirement)

**Check if already installed:**
```bash
node --version
```

**If not installed:**
1. Go to: https://nodejs.org/
2. Download **LTS version** (18.x or newer)
3. Run installer with default settings
4. Restart your terminal
5. Verify: `node --version`

---

### Step 2: Install Backend Packages

**Open Terminal/Command Prompt:**

```bash
# Activate your conda environment
conda activate semantic_explorer

# Navigate to project
cd "W:\CMU_Academics\2025 Fall\Thesis Demo\Zappos50K_semantic_explorer"

# Install backend dependencies
pip install fastapi uvicorn[standard] python-multipart websockets
```

**Expected output:**
```
Successfully installed fastapi-0.109.0 uvicorn-0.27.0 ...
```

---

### Step 3: Install Frontend Packages

**In the same terminal:**

```bash
# Navigate to frontend folder
cd frontend

# Install Node.js packages
npm install
```

**Expected output:**
```
added 200 packages in 45s
```

This installs:
- React (UI framework)
- D3.js (canvas visualization)
- Zustand (state management)
- TypeScript
- Vite (build tool)

**Note:** First install takes 2-3 minutes. Be patient!

---

## ✅ Verify Installation

### Backend Check:
```bash
conda activate semantic_explorer
python -c "import fastapi; print('✅ FastAPI ready')"
python -c "import uvicorn; print('✅ Uvicorn ready')"
```

### Frontend Check:
```bash
cd frontend
npm list --depth=0
```

Should show packages like:
```
├── react@18.2.0
├── d3@7.8.5
├── zustand@4.4.7
```

---

## 🚀 Running After Installation

### Terminal 1 - Backend:
```bash
# Double-click or run:
start_backend.bat
```

**Look for:**
```
Application startup complete.
Uvicorn running on http://0.0.0.0:8000
```

### Terminal 2 - Frontend:
```bash
# Double-click or run:
start_frontend.bat
```

**Look for:**
```
VITE v5.0.8  ready in 500 ms

  ➜  Local:   http://localhost:3000/
```

### Browser:
```
Open: http://localhost:3000
```

---

## 🐛 Troubleshooting

### "conda: command not found"

**Option 1:** Use Anaconda Prompt instead of regular Command Prompt

**Option 2:** Add conda to PATH:
1. Find Anaconda install location (usually `C:\Users\<You>\Anaconda3`)
2. Add to PATH: `C:\Users\<You>\Anaconda3\Scripts`
3. Restart terminal

---

### "pip install" fails with SSL error

```bash
# Use conda instead:
conda activate semantic_explorer
conda install -c conda-forge fastapi uvicorn websockets
```

---

### "npm install" fails

**Solution 1 - Clear cache:**
```bash
cd frontend
npm cache clean --force
npm install
```

**Solution 2 - Delete and retry:**
```bash
cd frontend
rmdir /s node_modules
del package-lock.json
npm install
```

**Solution 3 - Use different registry:**
```bash
npm install --registry=https://registry.npmjs.org/
```

---

### Backend starts but crashes

**Check your existing packages:**
```bash
conda activate semantic_explorer
python -c "import torch; print(torch.__version__)"
python -c "import transformers; print('CLIP OK')"
python -c "import diffusers; print('SD OK')"
```

If any fail, reinstall:
```bash
pip install torch transformers diffusers accelerate
```

---

### Port 8000 already in use

**Find and kill process:**
```bash
# Windows
netstat -ano | findstr :8000
taskkill /PID <number> /F

# Or just change the port in backend/api.py:
# Last line: uvicorn.run(app, host="0.0.0.0", port=8001)
```

---

## 📦 What Gets Installed

### Backend (~50MB)
- `fastapi` - Web framework
- `uvicorn` - Server
- `websockets` - Real-time communication
- `python-multipart` - File handling

### Frontend (~200MB)
- `react` + `react-dom` - UI framework
- `d3` - Visualization library
- `zustand` - State management
- `axios` - HTTP client
- `vite` - Build tool
- `typescript` - Type safety
- `@types/*` - Type definitions

---

## 🎯 After Successful Installation

Follow these guides:
1. **QUICK_START.md** - How to use the app
2. **REACT_README.md** - Complete features guide
3. **REACT_STATUS.md** - What's implemented

---

## 💡 Tips

1. **Use Anaconda Prompt** for all Python commands
2. **Restart terminal** after installing Node.js
3. **Be patient** with first npm install (2-3 minutes)
4. **Keep both terminals open** while using the app
5. **Check firewall** if connection fails

---

## 📞 Still Having Issues?

Check these files for more help:
- `backend/requirements.txt` - See what backend needs
- `frontend/package.json` - See what frontend needs
- `INSTALLATION.md` - Detailed troubleshooting

Or check the logs in the terminal for specific error messages.

---

**Once installed, you'll never need to do this again!** 🎉
