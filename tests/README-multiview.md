# Multi-View Pipeline Test

## How to Run

```bash
# 1. Start the backend (for background removal)
cd backend
python -m uvicorn api:app --port 8000

# 2. Serve from the project root (so template paths resolve)
cd ..
npx http-server -p 8080 --cors

# 3. Open in browser
http://localhost:8080/test-multiview-pipeline.html
```

## Notes

- The HTML fetches templates from `frontend/public/templates/` — must be served from the project root
- fal.ai API key is pre-filled in the page, edit if needed
- Backend URL defaults to `http://localhost:8000` — only needed for auto background removal (rembg)
- If your input images already have white backgrounds, the backend is optional
