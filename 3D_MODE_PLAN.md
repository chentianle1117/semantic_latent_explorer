# 3D Semantic Axes - Implementation Plan

## Overview
Add a toggleable 3D visualization mode to the Zappos Semantic Explorer, allowing users to explore images across 3 semantic axes instead of 2.

**Key Requirement:** Images remain as 2D sprites that always face the camera (billboarding), positioned in 3D space.

---

## Architecture Changes

### Backend Changes (Python/FastAPI)

#### 1. API Models (backend/api.py)

```python
# Line 58-62: Extend AxisUpdateRequest
class AxisUpdateRequest(BaseModel):
    x_positive: str
    x_negative: str
    y_positive: str
    y_negative: str
    z_positive: Optional[str] = None  # New
    z_negative: Optional[str] = None  # New

# Add to AppState
class AppState:
    def __init__(self):
        # ... existing fields ...
        self.axis_labels = {
            'x': ('formal', 'sporty'),
            'y': ('dark', 'colorful'),
            'z': ('casual', 'elegant')  # New
        }
        self.use_3d_mode = False  # New
```

#### 2. Projection Function (backend/api.py:123-146)

```python
def project_embeddings_to_coordinates(
    embeddings: np.ndarray,
    use_3d: bool = False
) -> np.ndarray:
    """
    Project embeddings onto semantic axes.
    Returns array of shape (N, 2) or (N, 3) depending on use_3d.
    """
    if state.axis_builder is None or state.embedder is None:
        raise RuntimeError("Models not initialized")

    # Build x and y axes (as before)
    x_axis = state.axis_builder.create_clip_text_axis(
        f"shoe that is {state.axis_labels['x'][1]}",
        f"shoe that is {state.axis_labels['x'][0]}"
    )
    y_axis = state.axis_builder.create_clip_text_axis(
        f"shoe that is {state.axis_labels['y'][1]}",
        f"shoe that is {state.axis_labels['y'][0]}"
    )

    x_coords = embeddings @ x_axis.direction
    y_coords = embeddings @ y_axis.direction

    # If 3D mode, add z-axis
    if use_3d and 'z' in state.axis_labels:
        z_axis = state.axis_builder.create_clip_text_axis(
            f"shoe that is {state.axis_labels['z'][1]}",
            f"shoe that is {state.axis_labels['z'][0]}"
        )
        z_coords = embeddings @ z_axis.direction
        return np.column_stack([x_coords, y_coords, z_coords])

    return np.column_stack([x_coords, y_coords])
```

#### 3. Update Endpoints

```python
@app.post("/api/set-3d-mode")
async def set_3d_mode(use_3d: bool):
    """Toggle 3D visualization mode."""
    state.use_3d_mode = use_3d

    # Recalculate all coordinates
    if len(state.images_metadata) > 0:
        all_embeddings = np.array([img.embedding for img in state.images_metadata])
        new_coords = project_embeddings_to_coordinates(all_embeddings, use_3d=use_3d)

        for i, img_meta in enumerate(state.images_metadata):
            if use_3d:
                img_meta.coordinates = tuple(new_coords[i])  # (x, y, z)
            else:
                img_meta.coordinates = tuple(new_coords[i][:2])  # (x, y)

    await broadcast_state_update()
    return {"status": "success", "use_3d": use_3d}
```

---

### Frontend Changes (TypeScript/React)

#### 1. Type Definitions (frontend/src/types/index.ts)

```typescript
export interface ImageData {
  // ... existing fields ...
  coordinates: [number, number] | [number, number, number];  // 2D or 3D
}

export interface AxisLabels {
  x: [string, string];
  y: [string, string];
  z?: [string, string];  // Optional for 3D mode
}

export interface CanvasBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin?: number;  // Optional
  zMax?: number;  // Optional
}

export interface AppState {
  // ... existing fields ...
  is3DMode: boolean;  // New
}
```

#### 2. Store Updates (frontend/src/store/appStore.ts)

```typescript
interface AppStore extends AppState {
  // ... existing actions ...
  setIs3DMode: (is3D: boolean) => void;
  setAxisLabels: (labels: {
    x: [string, string];
    y: [string, string];
    z?: [string, string];  // Optional
  }) => void;
}

const initialState: AppState = {
  // ... existing state ...
  is3DMode: false,
  axisLabels: {
    x: ['formal', 'sporty'],
    y: ['dark', 'colorful'],
    z: ['casual', 'elegant'],  // Default z-axis
  },
};

export const useAppStore = create<AppStore>((set) => ({
  ...initialState,

  setIs3DMode: async (is3D) => {
    // Call backend to recalculate coordinates
    await apiClient.set3DMode(is3D);
    set({ is3DMode: is3D });
  },
}));
```

#### 3. Package Dependencies

```json
// frontend/package.json
{
  "dependencies": {
    // ... existing ...
    "three": "^0.160.0",
    "@react-three/fiber": "^8.15.0",
    "@react-three/drei": "^9.92.0"
  },
  "devDependencies": {
    // ... existing ...
    "@types/three": "^0.160.0"
  }
}
```

#### 4. 3D Canvas Component

```typescript
// frontend/src/components/Canvas/SemanticCanvas3D.tsx
import React, { useRef, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, useTexture, Plane } from '@react-three/drei';
import { useAppStore } from '../../store/appStore';
import * as THREE from 'three';

// Billboarded Image Sprite
const ImageSprite: React.FC<{
  image: ImageData;
  size: number;
  opacity: number;
  isSelected: boolean;
  isHovered: boolean;
  onClick: () => void;
  onHover: (hovering: boolean) => void;
}> = ({ image, size, opacity, isSelected, isHovered, onClick, onHover }) => {
  const [x, y, z = 0] = image.coordinates;

  // Create texture from base64 image
  const texture = useMemo(() => {
    const img = new Image();
    img.src = `data:image/png;base64,${image.base64_image}`;
    const tex = new THREE.Texture(img);
    img.onload = () => { tex.needsUpdate = true; };
    return tex;
  }, [image.base64_image]);

  return (
    <sprite
      position={[x, y, z]}
      scale={[size, size, 1]}
      onClick={onClick}
      onPointerOver={() => onHover(true)}
      onPointerOut={() => onHover(false)}
    >
      <spriteMaterial
        map={texture}
        transparent
        opacity={opacity}
        sizeAttenuation={true}
      />
      {/* Selection ring */}
      {(isSelected || isHovered) && (
        <mesh position={[0, 0, -0.01]}>
          <ringGeometry args={[0.55, 0.6, 32]} />
          <meshBasicMaterial
            color={isSelected ? '#4CAF50' : '#FFC107'}
            transparent
            opacity={0.8}
          />
        </mesh>
      )}
    </sprite>
  );
};

// Genealogy Line in 3D
const GenealogyLine3D: React.FC<{
  start: [number, number, number];
  end: [number, number, number];
  color: string;
}> = ({ start, end, color }) => {
  const points = useMemo(() => [
    new THREE.Vector3(...start),
    new THREE.Vector3(...end),
  ], [start, end]);

  const lineGeometry = useMemo(() =>
    new THREE.BufferGeometry().setFromPoints(points),
    [points]
  );

  return (
    <line geometry={lineGeometry}>
      <lineBasicMaterial color={color} linewidth={2} transparent opacity={0.3} />
    </line>
  );
};

// Main 3D Canvas
export const SemanticCanvas3D: React.FC = () => {
  const images = useAppStore((state) => state.images.filter(img => img.visible));
  const selectedImageIds = useAppStore((state) => state.selectedImageIds);
  const hoveredImageId = useAppStore((state) => state.hoveredImageId);
  const visualSettings = useAppStore((state) => state.visualSettings);
  const canvasBounds = useAppStore((state) => state.canvasBounds);

  const toggleImageSelection = useAppStore((state) => state.toggleImageSelection);
  const setHoveredImageId = useAppStore((state) => state.setHoveredImageId);

  // Calculate bounds if not set
  const bounds = useMemo(() => {
    if (canvasBounds) return canvasBounds;

    const coords = images.map(img => img.coordinates);
    const xs = coords.map(c => c[0]);
    const ys = coords.map(c => c[1]);
    const zs = coords.map(c => c[2] || 0);

    return {
      xMin: Math.min(...xs),
      xMax: Math.max(...xs),
      yMin: Math.min(...ys),
      yMax: Math.max(...ys),
      zMin: Math.min(...zs),
      zMax: Math.max(...zs),
    };
  }, [images, canvasBounds]);

  // Genealogy lines
  const genealogyLines = useMemo(() => {
    const lines: any[] = [];

    images.forEach(img => {
      const [x1, y1, z1 = 0] = img.coordinates;

      // Parent lines (blue)
      img.parents.forEach(parentId => {
        const parent = images.find(i => i.id === parentId);
        if (parent) {
          const [x2, y2, z2 = 0] = parent.coordinates;
          lines.push({
            key: `parent-${img.id}-${parentId}`,
            start: [x2, y2, z2],
            end: [x1, y1, z1],
            color: '#2196F3'
          });
        }
      });
    });

    return lines;
  }, [images]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Canvas
        camera={{
          position: [0, 0, 5],
          fov: 50,
          near: 0.1,
          far: 1000
        }}
        style={{ background: '#1a1a1a' }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.8} />
        <pointLight position={[10, 10, 10]} intensity={0.5} />

        {/* Camera Controls */}
        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          minDistance={2}
          maxDistance={20}
        />

        {/* Background Grid */}
        <Plane
          args={[
            (bounds.xMax - bounds.xMin) * 2,
            (bounds.yMax - bounds.yMin) * 2
          ]}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, bounds.yMin - 0.5, 0]}
        >
          <meshBasicMaterial
            color="#333333"
            wireframe
            transparent
            opacity={0.2}
          />
        </Plane>

        {/* Axis Lines (optional visual guides) */}
        <gridHelper
          args={[10, 10, '#555555', '#444444']}
          position={[0, bounds.yMin - 0.5, 0]}
        />

        {/* Fog for depth perception */}
        <fog attach="fog" args={['#1a1a1a', 5, 15]} />

        {/* Genealogy Lines */}
        {genealogyLines.map(line => (
          <GenealogyLine3D
            key={line.key}
            start={line.start}
            end={line.end}
            color={line.color}
          />
        ))}

        {/* Image Sprites */}
        {images.map(img => (
          <ImageSprite
            key={img.id}
            image={img}
            size={visualSettings.imageSize / 100}
            opacity={visualSettings.imageOpacity}
            isSelected={selectedImageIds.includes(img.id)}
            isHovered={hoveredImageId === img.id}
            onClick={() => toggleImageSelection(img.id, false)}
            onHover={(hovering) => setHoveredImageId(hovering ? img.id : null)}
          />
        ))}
      </Canvas>
    </div>
  );
};
```

#### 5. Canvas Wrapper with Toggle

```typescript
// frontend/src/components/Canvas/SemanticCanvasWrapper.tsx
import React from 'react';
import { useAppStore } from '../../store/appStore';
import { SemanticCanvas } from './SemanticCanvas';  // 2D version
import { SemanticCanvas3D } from './SemanticCanvas3D';  // 3D version

export const SemanticCanvasWrapper: React.FC = () => {
  const is3DMode = useAppStore((state) => state.is3DMode);

  return is3DMode ? <SemanticCanvas3D /> : <SemanticCanvas />;
};
```

#### 6. UI Toggle + Z-Axis Editor

```typescript
// Add to control panel
const Toggle3DButton: React.FC = () => {
  const is3DMode = useAppStore((state) => state.is3DMode);
  const setIs3DMode = useAppStore((state) => state.setIs3DMode);

  return (
    <button
      className="mode-toggle-btn"
      onClick={() => setIs3DMode(!is3DMode)}
    >
      {is3DMode ? '📐 2D Mode' : '📦 3D Mode'}
    </button>
  );
};

// Z-Axis Editor (only show in 3D mode)
{is3DMode && (
  <AxisEditor
    axis="z"
    negativeLabel={axisLabels.z?.[0] || 'casual'}
    positiveLabel={axisLabels.z?.[1] || 'elegant'}
    onUpdate={async (negative, positive) => {
      await apiClient.updateAxes({
        x_negative: axisLabels.x[0],
        x_positive: axisLabels.x[1],
        y_negative: axisLabels.y[0],
        y_positive: axisLabels.y[1],
        z_negative: negative,
        z_positive: positive,
      });
      // ... update state ...
    }}
    style={{ position: 'absolute', bottom: '20px', right: '50%' }}
  />
)}
```

---

## Implementation Phases

### Phase 1: Backend (2-3 hours)
- [ ] Extend `AxisUpdateRequest` for z-axis
- [ ] Add `use_3d_mode` to AppState
- [ ] Modify `project_embeddings_to_coordinates()` to support 3D
- [ ] Add `/api/set-3d-mode` endpoint
- [ ] Test 3D coordinate generation

### Phase 2: Frontend Types & Store (1-2 hours)
- [ ] Update TypeScript types for 3D coordinates
- [ ] Add `is3DMode` to Zustand store
- [ ] Install Three.js dependencies
- [ ] Create API client method for `set3DMode()`

### Phase 3: 3D Rendering (4-6 hours)
- [ ] Create `SemanticCanvas3D.tsx` component
- [ ] Implement billboarded sprites with textures
- [ ] Add OrbitControls for navigation
- [ ] Implement raycasting for selection/hover
- [ ] Render genealogy lines in 3D
- [ ] Add visual depth cues (grid, fog)

### Phase 4: UI Integration (2-3 hours)
- [ ] Create `SemanticCanvasWrapper` with conditional rendering
- [ ] Add 3D mode toggle button
- [ ] Add Z-axis editor (conditional on 3D mode)
- [ ] Style controls and overlays

### Phase 5: Testing & Polish (3-4 hours)
- [ ] Test mode switching
- [ ] Verify all features work in 3D (selection, genealogy, etc.)
- [ ] Add tutorial/help overlay for 3D navigation
- [ ] Performance testing with many images
- [ ] Bug fixes and edge cases

---

## Key Technical Decisions

### 1. Billboarding Implementation
Use Three.js `Sprite` objects which automatically face the camera:
- Simpler than manual rotation calculations
- Built-in support in Three.js
- Good performance for 100+ images

### 2. Camera & Controls
- **Perspective Camera**: Natural 3D depth perception
- **OrbitControls**: Industry-standard 3D navigation
- **Damping**: Smooth, professional feel

### 3. Depth Perception Aids
- **Exponential Fog**: Distance fades objects
- **Grid Plane**: Ground reference
- **Drop Shadows**: Optional, can add later

### 4. Backwards Compatibility
- Default to 2D mode
- 2D coordinates still work (z=0)
- No breaking changes to existing data

---

## Effort Estimate

| Task | Hours | Difficulty |
|------|-------|------------|
| Backend 3D projection | 2-3 | Easy |
| Frontend type updates | 1 | Easy |
| Three.js setup & dependencies | 1-2 | Easy |
| 3D Canvas component | 4-6 | Moderate |
| Billboarding & textures | 2-3 | Easy |
| Selection (raycasting) | 3-4 | Moderate |
| Genealogy lines 3D | 2 | Moderate |
| UI toggle & z-axis editor | 2-3 | Easy |
| Visual polish (fog, grid, lights) | 2-3 | Easy |
| Testing & bug fixes | 3-4 | Moderate |
| **TOTAL** | **22-31 hours** | **2.5-4 days** |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Performance with many images | Use Three.js instancing if >200 images |
| User confusion with 3D navigation | Add tutorial overlay, reset camera button |
| Mobile/touch support | Detect touch, OrbitControls supports touch |
| Depth perception issues | Multiple depth cues (fog + grid + shadows) |

---

## Success Criteria

- [ ] User can toggle between 2D and 3D modes seamlessly
- [ ] All images display correctly as camera-facing sprites in 3D
- [ ] Z-axis labels can be edited same as X/Y
- [ ] Selection, hover, and genealogy work identically in 3D
- [ ] Smooth orbit camera controls
- [ ] Clear visual depth cues
- [ ] No performance degradation with 50+ images

---

## Next Steps

1. **Get approval** on this plan
2. **Set up development branch**: `git checkout -b feature/3d-mode`
3. **Phase 1**: Start with backend 3D projection
4. **Phase 2**: Update types and install Three.js
5. **Phase 3**: Build 3D canvas component
6. **Iterate**: Test and refine based on UX feedback
