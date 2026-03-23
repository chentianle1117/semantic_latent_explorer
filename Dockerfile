# ── Stage 1: Build frontend (discarded after) ──────────────
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Production image ──────────────────────────────
FROM python:3.11-slim
WORKDIR /app

# System deps for Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

# Python deps (cached layer — only rebuilds when requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Backend code + models + config
COPY backend/ ./backend/
COPY models/ ./models/
COPY config.py ./config.py

# Built frontend from Stage 1
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Run from backend/ so relative imports (from models import ...) work
WORKDIR /app/backend

CMD sh -c "uvicorn api:app --host 0.0.0.0 --port ${PORT:-8080}"
