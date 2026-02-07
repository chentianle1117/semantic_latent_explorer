# Layout & Overlap Fix Plan

## Problem
- Shoes overlap on the canvas
- Grid clutters the view
- No unified unit system linking coordinate space to display size

## Root Cause
`apply_layout_spread()` uses `min_spacing_ratio` (e.g. 0.42) = fraction of data extent. For dense clusters, extent can be tiny (e.g. 0.1), so `target_min = 0.042` — which may map to < 120px on screen depending on canvas size.

## Solution: Unified Unit System

### 1. Fixed minimum distance (backend)
Use **both** ratio and absolute minimum:
```
target_min = max(extent * 0.4, 0.15)
```
- `0.15` = minimum coord distance (unified unit)
- Assumes ~600px mapping range → 0.15 ≈ 90px; 0.2 ≈ 120px
- Dense clusters get spread to at least 0.15 apart

### 2. Remove grid
- Remove grid drawing from SemanticCanvas
- Keeps canvas clean

### 3. Optional: pixel-aware API
Backend could accept `image_size_px` in add-external-images:
- `min_coord_gap = (image_size_px + 24) / 600` → min_spacing_ratio
- Ensures spacing scales with user's image size setting

### 4. Optional: frontend auto-rescale
On bounds calculation, if any pair is < imageSize pixels apart:
- Bump `coordinateScale` and `resetCanvasBounds()`
- Or show "Rescale" prompt

## Implementation Order
1. Remove grid ✓
2. Backend: use fixed minimum in apply_layout_spread ✓
3. (Future) Pass imageSize to backend for dynamic ratio
