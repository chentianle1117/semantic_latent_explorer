# UI Updates Plan - Canvas Algorithm, Dial, Layout

## Summary of Requested Changes

1. **Selection/Hover border scaling** – Stroke becomes disproportionately thick when images are small
2. **Canvas layout algorithm** – Auto-adjust spacing, image size, padding; fix broken sliders
3. **Alternative selection indicator** – Less distracting than current square
4. **Minimum spacing constraint** – Ensure shoes don't overlap; optimize for screen fit
5. **Grasshopper-style radial dial** – Add new dial for global actions (Space/middle-click, centered on mouse); keep FloatingActionPanel for object actions
7. **Left panel** – `width: fit-content` if applicable

---

## Phase 1: Canvas Layout Algorithm & Stroke Scaling

### 1.1 Problem

- **Fixed stroke-width** (3px hover, 5px selection) looks huge when `imageSize` is 30–60px and tiny when 200px+
- **Fixed imageSize** (120px default) causes overlap when zoomed in or when many images cluster
- **Visual Settings sliders** (padding, scale, opacity, labels, grid, clusters) – some don't work or feel broken
- **Bounds** are computed from raw semantic coordinates; no minimum pixel spacing

### 1.2 Solution: Adaptive Sizing

**Stroke scaling** (in `SemanticCanvas.tsx`):

```ts
// Compute stroke as fraction of image size, clamped
const strokeHover = Math.max(1, Math.min(4, Math.round(imageSize * 0.04)));
const strokeSelection = Math.max(2, Math.min(6, Math.round(imageSize * 0.05)));
```

Use these when setting `.attr("stroke-width", ...)` for hover-border, selection-border, image-border.

**Image size** – Keep user-controlled `imageSize` in Visual Settings but:
- Add a computed `effectiveImageSize` that accounts for zoom: `imageSize * zoomTransform.k`
- Or: derive `imageSize` from canvas density (images per viewport pixel) so it auto-scales

**Minimum spacing** – Post-process coordinates before rendering:

1. In `SemanticCanvas.tsx`, after getting `xScale`/`yScale`, compute pixel positions for all images
2. If any pair has distance < `minPixelGap` (e.g. 8px), apply a simple repulsion:
   - Option A: Force-directed nudge (1–2 iterations) in pixel space, then inverse-map back to approximate semantic coords (lossy)
   - Option B: Scale `coordinateScale` up until min gap is satisfied (preserves relative positions)
   - Option C: Add a "spread" step that nudge-overlaps until no overlap (iterative)

**Recommendation**: Start with Option B – increase `coordinateScale` until `min(distance between any two in pixels) >= minPixelGap`. If that over-spreads, fall back to a fixed scale and accept some overlap.

### 1.3 Fix Broken Sliders

- **Layout padding, Coordinate scale, Image opacity** – Already wired in SemanticCanvas via `visualSettings`
- **Labels, Grid, Clusters** – **NOT WIRED**: These live in App.tsx state and are passed only to RightInspector. SemanticCanvas does NOT receive `showLabels`, `showGrid`, `showClusters`. Need to:
  1. Pass these props from App → SemanticCanvas (or move to appStore)
  2. Implement in SemanticCanvas: grid lines when `showGrid`, axis labels when `showLabels`, cluster backgrounds when `showClusters`

### 1.4 Files to Modify

- `frontend/src/components/Canvas/SemanticCanvas.tsx` – Stroke scaling, optional min-spacing logic
- `frontend/src/store/appStore.ts` – No change if we keep `imageSize` user-controlled
- `frontend/src/components/RightInspector/RightInspector.tsx` – Ensure sliders call store and canvas reacts

---

## Phase 2: Grasshopper-Style Radial Dial (Global Actions)

### 2.1 Keep FloatingActionPanel – Add Radial Dial

**Two separate mechanisms** (like Grasshopper: module click vs. empty-space dial):

| Mechanism | Trigger | Position | Purpose |
|-----------|---------|----------|---------|
| **FloatingActionPanel** | Click on shoe(s) | Right of selection | Object-related: Generate from reference, Remove, Clear selection |
| **Radial Dial** | Space or middle-click anywhere | **Centered on mouse** | Global/agentic: Analyze Canvas, Suggest Axes, Export, Settings, Recenter, Rescale |

### 2.2 Dial Design

- **Trigger**: `Space` key (keydown) or middle mouse button (mousedown with button === 1) **anywhere on canvas**
- **Position**: **Centered on mouse cursor** at the moment of trigger
- **Layout**: 4–6 sectors in a circle/arc (like Grasshopper or MX Master ring)
- **Actions** (global, not object-related):
  1. Analyze Canvas
  2. Suggest Axes
  3. Export ZIP
  4. Recenter view
  5. Rescale view
  6. Settings (opens modal)

- **Dismiss**: Click outside, Space key up, or Escape
- **Tooltip**: Short label on hover (e.g. "Analyze", "Export", "Recenter")

### 2.3 Implementation

- Create `RadialDial.tsx` – SVG or HTML overlay with sectors, **centered on mouse**
- Each sector: path + label, onClick handler
- App.tsx: Add `<RadialDial>` alongside existing `<FloatingActionPanel>` (both can exist; different triggers)
- Trigger logic:
  - **Space**: `keydown` on document → show dial at last known mouse position; `keyup` → dismiss
  - **Middle-click**: `mousedown` on canvas (button === 1) → show dial at event.clientX/clientY
- Position: Use `position: fixed` with `left: mouseX`, `top: mouseY`; center the dial's center on that point

### 2.4 Files to Create/Modify

- **New**: `frontend/src/components/RadialDial/RadialDial.tsx`
- **New**: `frontend/src/components/RadialDial/RadialDial.css`
- **Modify**: `frontend/src/App.tsx` – Add RadialDial; add Space/middle-click handlers; track last mouse position for Space-triggered dial

---

## Phase 3: Selection Centroid & Position Fix

### 3.1 Problem

When selecting a 2nd image, the action panel doesn't move because we send `(-1, -1)` to "keep position". User wants it to reposition to the right of the selection centroid.

### 3.2 Solution

- **Always** compute centroid of all selected images in pixel space
- In SemanticCanvas click handler, when `newCount > 0`:
  - Collect all selected image IDs
  - Get their pixel positions (using xScale, yScale, and current zoom transform)
  - Centroid = `(avg(x), avg(y))`
  - Pass `(centroid.x + offset, centroid.y)` to `onSelectionChange`
- Remove the `shouldUpdatePosition` logic that sends `(-1,-1)`

### 3.3 Code Location

`SemanticCanvas.tsx` – click handler in the `imageNodes.append("rect")` block, ~lines 404–477.

---

## Phase 4: Alternative Selection Indicator (Optional)

### 4.1 Options

1. **Keep square but scale stroke** – Phase 1 already addresses thickness
2. **Subtle glow** – Add `filter: drop-shadow` or SVG filter instead of stroke
3. **Corner markers** – Small triangles at corners instead of full border
4. **Border + scale** – Current rect but with stroke-width from Phase 1

**Recommendation**: Implement Phase 1 stroke scaling first. If still distracting, add a "selection style" setting: Square | Glow | Corners.

---

## Phase 5: Left Panel Fit-Content

### 5.1 Current State

- `app-layout` uses `grid-template-columns: var(--toolbar-width) 1fr auto`
- Left column is `LeftToolbar` (icon strip), not a wide panel
- `.left-panel` is `display: none`

### 5.2 User's Edit

User specified: `width: 300px → fit-content` for `left-panel`. If there is a visible left panel in the running app (e.g. from a different branch or uncommitted changes), apply:

```css
.left-panel {
  width: fit-content;
  min-width: 200px; /* or whatever makes sense */
}
```

If the current layout has no left-panel, this change is a no-op until a left panel is reintroduced.

---

## Implementation Order

| Phase | Description | Effort |
|-------|-------------|--------|
| 1 | Stroke scaling + fix sliders | Small |
| 2 | Radial dial (replace FloatingActionPanel) | Medium |
| 3 | Centroid repositioning | Small |
| 4 | Alternative selection (optional) | Small |
| 5 | Left panel fit-content (if applicable) | Trivial |

**Suggested order**: 1 → 3 → 2 → 4 → 5

---

## Code References

| File | Relevant Sections |
|------|-------------------|
| `SemanticCanvas.tsx` | Lines 375–390 (imageSize), 529–573 (borders), 404–477 (click/position) |
| `appStore.ts` | `visualSettings.imageSize`, `layoutPadding`, `coordinateScale` |
| `RightInspector.tsx` | Slider bindings, `updateVisualSettings` |
| `FloatingActionPanel.tsx` | Keep – object actions; remove View details |
| `App.tsx` | ~1433–1470 (FloatingActionPanel usage), `floatingPanelPos` state |

## Current vs. Target

| Component | Current | Target |
|-----------|---------|--------|
| **FloatingActionPanel** | Horizontal bar (Generate, View details, Remove, Clear) | **Keep** – appears on shoe click; remove View details |
| **Radial Dial** | None | **Add** – Space/middle-click anywhere; centered on mouse; global actions (Analyze, Suggest Axes, Export, Recenter, Rescale, Settings) |
| **Stroke/border** | Fixed 3px / 5px | Scale with `imageSize` (e.g. `imageSize * 0.04`) |
| **Labels/Grid/Clusters** | Toggles in RightInspector, not wired to canvas | Pass to SemanticCanvas, implement grid/labels/cluster overlays |
| **Selection position** | `-1,-1` keeps position on 2nd selection | Always compute centroid, reposition FloatingActionPanel |
| **Minimum spacing** | None | Post-process or tweak `coordinateScale` to avoid overlap |

---

## Algorithm: Minimum Spacing (Detail)

```ts
// Pseudocode for Phase 1 – min spacing
function ensureMinSpacing(images, coordScale, coordOffset, xScale, yScale, minPixelGap = 8) {
  const positions = images.map(d => ({
    id: d.id,
    x: xScale((d.coordinates[0] + coordOffset[0]) * coordScale),
    y: yScale((d.coordinates[1] + coordOffset[1]) * coordScale),
  }));

  let minDist = Infinity;
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const d = Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y);
      minDist = Math.min(minDist, d);
    }
  }

  if (minDist < minPixelGap && minDist > 0) {
    // Scale up coordinateScale to spread points
    const factor = minPixelGap / minDist;
    const newScale = visualSettings.coordinateScale * factor;
    updateVisualSettings({ coordinateScale: newScale });
    resetCanvasBounds();
  }
}
```

This runs after bounds are set and before or during render. Can be triggered on "Rescale" button or automatically when overlap is detected.
