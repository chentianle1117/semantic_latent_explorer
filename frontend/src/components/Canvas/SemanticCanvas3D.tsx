/**
 * Semantic Canvas 3D Component - Three.js based interactive visualization
 * Uses billboarded sprites to keep images facing the camera
 */

import React, { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Html } from "@react-three/drei";
import * as THREE from "three";
import { useAppStore } from "../../store/appStore";
import { AxisEditor } from "../AxisEditor/AxisEditor";
import { apiClient } from "../../api/client";
import type { ImageData } from "../../types";

interface SemanticCanvas3DProps {
  onSelectionChange: (x: number, y: number, count: number) => void;
}

// Individual image sprite component
interface ImageSpriteProps {
  image: ImageData;
  scale: number;
  opacity: number;
  isSelected: boolean;
  isHovered: boolean;
  onClick: (id: number, event: any) => void;
  onPointerEnter: (id: number) => void;
  onPointerLeave: () => void;
}

const ImageSprite: React.FC<ImageSpriteProps> = ({
  image,
  scale,
  opacity,
  isSelected,
  isHovered,
  onClick,
  onPointerEnter,
  onPointerLeave,
}) => {
  const meshRef = useRef<THREE.Sprite>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  // Load texture from base64 image
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    const img = `data:image/png;base64,${image.base64_image}`;
    loader.load(img, (tex) => {
      setTexture(tex);
    });
  }, [image.base64_image]);

  // Get 3D coordinates (already normalized by parent Scene component)
  const [x, y, z] = image.coordinates.length === 3
    ? image.coordinates
    : [...image.coordinates, 0];

  // Create sprite material
  const material = useMemo(() => {
    if (!texture) return null;

    return new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: opacity,
      sizeAttenuation: true,
    });
  }, [texture, opacity]);

  // Update material on selection/hover
  useEffect(() => {
    if (meshRef.current && material) {
      if (isSelected) {
        material.color.setRGB(0.3, 0.7, 1); // Blue tint for selected
      } else if (isHovered) {
        material.color.setRGB(1, 0.9, 0.5); // Yellow tint for hover
      } else {
        material.color.setRGB(1, 1, 1); // Normal
      }
    }
  }, [isSelected, isHovered, material]);

  if (!material) return null;

  return (
    <sprite
      ref={meshRef}
      position={[x, y, z]}
      scale={[scale, scale, 1]}
      material={material}
      onClick={(e) => {
        e.stopPropagation();
        onClick(image.id, e);
      }}
      onPointerEnter={() => onPointerEnter(image.id)}
      onPointerLeave={onPointerLeave}
    />
  );
};

// Axis Labels Component
const AxisLabels: React.FC = () => {
  return (
    <>
      {/* X-axis label (Red) */}
      <Text
        position={[7, 0, 0]}
        fontSize={0.8}
        color="#ff0000"
        anchorX="center"
        anchorY="middle"
      >
        X
      </Text>

      {/* Y-axis label (Green) */}
      <Text
        position={[0, 7, 0]}
        fontSize={0.8}
        color="#00ff00"
        anchorX="center"
        anchorY="middle"
      >
        Y
      </Text>

      {/* Z-axis label (Blue) */}
      <Text
        position={[0, 0, 7]}
        fontSize={0.8}
        color="#0000ff"
        anchorX="center"
        anchorY="middle"
      >
        Z
      </Text>
    </>
  );
};

// Camera Controller Component with smooth animation
const CameraController: React.FC<{
  targetPosition: THREE.Vector3 | null;
  useOrthographic: boolean;
}> = ({ targetPosition, useOrthographic }) => {
  const { camera } = useThree();
  const animationIdRef = useRef<number | null>(null);
  const lastTargetRef = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    // Only animate if target position has changed
    if (targetPosition && (!lastTargetRef.current || !targetPosition.equals(lastTargetRef.current))) {
      lastTargetRef.current = targetPosition.clone();

      // Cancel any existing animation
      if (animationIdRef.current !== null) {
        cancelAnimationFrame(animationIdRef.current);
      }

      const startPosition = camera.position.clone();
      const startTime = Date.now();
      const duration = 1000; // 1 second animation

      // For orthographic effect, use very small FOV
      if (camera instanceof THREE.PerspectiveCamera) {
        const targetFov = useOrthographic ? 5 : 50;
        const startFov = camera.fov;

        // Smooth animation using requestAnimationFrame
        const animate = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);

          // Ease in-out cubic
          const eased = progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

          // Animate camera position
          camera.position.lerpVectors(startPosition, targetPosition, eased);
          camera.lookAt(0, 0, 0);

          // Animate FOV for orthographic effect
          camera.fov = startFov + (targetFov - startFov) * eased;
          camera.updateProjectionMatrix();

          if (progress < 1) {
            animationIdRef.current = requestAnimationFrame(animate);
          } else {
            animationIdRef.current = null;
          }
        };

        animate();
      }
    }

    // Cleanup on unmount
    return () => {
      if (animationIdRef.current !== null) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, [targetPosition, camera, useOrthographic]);

  return null;
};

// Main scene component
const Scene: React.FC<{
  images: ImageData[];
  imageSize: number;
  imageOpacity: number;
  selectedImageIds: number[];
  onImageClick: (id: number, event: any) => void;
  cameraTarget: THREE.Vector3 | null;
  useOrthographic: boolean;
}> = ({ images, imageSize, imageOpacity, selectedImageIds, onImageClick, cameraTarget, useOrthographic }) => {
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  // Calculate data extent and normalization parameters
  const { xScale, yScale, zScale } = useMemo(() => {
    if (images.length === 0) {
      return { xScale: 1, yScale: 1, zScale: 1 };
    }

    // Get min/max for each axis
    const xCoords = images.map(img => img.coordinates[0]);
    const yCoords = images.map(img => img.coordinates[1]);
    const zCoords = images.map(img => img.coordinates.length === 3 ? img.coordinates[2] : 0);

    const xMin = Math.min(...xCoords);
    const xMax = Math.max(...xCoords);
    const yMin = Math.min(...yCoords);
    const yMax = Math.max(...yCoords);
    const zMin = Math.min(...zCoords);
    const zMax = Math.max(...zCoords);

    // Calculate ranges
    const xRange = xMax - xMin;
    const yRange = yMax - yMin;
    const zRange = zMax - zMin;

    // Target display range (similar to 2D canvas scale)
    const TARGET_RANGE = 10; // Display coordinates will span -5 to +5

    // Calculate scale factors to normalize to target range
    // Add small epsilon to avoid division by zero
    const xScale = xRange > 0.001 ? TARGET_RANGE / xRange : 1;
    const yScale = yRange > 0.001 ? TARGET_RANGE / yRange : 1;
    const zScale = zRange > 0.001 ? TARGET_RANGE / zRange : 1;

    console.log("📊 3D Coordinate Stats:", {
      x: { min: xMin.toFixed(3), max: xMax.toFixed(3), range: xRange.toFixed(3), scale: xScale.toFixed(1) },
      y: { min: yMin.toFixed(3), max: yMax.toFixed(3), range: yRange.toFixed(3), scale: yScale.toFixed(1) },
      z: { min: zMin.toFixed(3), max: zMax.toFixed(3), range: zRange.toFixed(3), scale: zScale.toFixed(1) }
    });

    return { xScale, yScale, zScale };
  }, [images]);

  // Calculate scale from pixel size
  const scale = imageSize / 100;

  return (
    <>
      {/* Ambient lighting */}
      <ambientLight intensity={1} />

      {/* Grid helper for depth perception */}
      <gridHelper args={[20, 20]} position={[0, -5, 0]} />

      {/* Axis helpers - larger to match coordinate scale */}
      <axesHelper args={[6]} />

      {/* Axis labels */}
      <AxisLabels />

      {/* Camera controller */}
      <CameraController targetPosition={cameraTarget} useOrthographic={useOrthographic} />

      {/* Render all image sprites with normalized coordinates */}
      {images.map((image) => {
        // Apply scaling to normalize coordinates
        const normalizedImage = {
          ...image,
          coordinates: [
            image.coordinates[0] * xScale,
            image.coordinates[1] * yScale,
            (image.coordinates.length === 3 ? image.coordinates[2] : 0) * zScale
          ] as [number, number, number]
        };

        return (
          <ImageSprite
            key={image.id}
            image={normalizedImage}
            scale={scale}
            opacity={imageOpacity}
            isSelected={selectedImageIds.includes(image.id)}
            isHovered={hoveredId === image.id}
            onClick={onImageClick}
            onPointerEnter={setHoveredId}
            onPointerLeave={() => setHoveredId(null)}
          />
        );
      })}

      {/* Orbit controls for camera movement */}
      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={5}
        maxDistance={50}
        enableRotate={true}
        enablePan={true}
        enableZoom={true}
        rotateSpeed={1.0}
        panSpeed={1.0}
        zoomSpeed={1.0}
      />
    </>
  );
};

// Main 3D canvas component
export const SemanticCanvas3D: React.FC<SemanticCanvas3DProps> = ({
  onSelectionChange,
}) => {
  const allImages = useAppStore((state) => state.images);
  const visualSettings = useAppStore((state) => state.visualSettings);
  const selectedImageIds = useAppStore((state) => state.selectedImageIds);
  const axisLabels = useAppStore((state) => state.axisLabels);

  const [cameraTarget, setCameraTarget] = useState<THREE.Vector3 | null>(null);
  const [useOrthographic, setUseOrthographic] = useState(false);

  const images = useMemo(
    () => allImages.filter((img) => img.visible),
    [allImages]
  );

  const toggleImageSelection = React.useCallback(
    (id: number, ctrlKey: boolean) => {
      useAppStore.getState().toggleImageSelection(id, ctrlKey);
    },
    []
  );

  const handleImageClick = (id: number, event: any) => {
    console.log("🖱️ 3D Canvas - Image clicked:", id);
    toggleImageSelection(id, event.nativeEvent?.ctrlKey || false);
  };

  // Update selection change callback when selection changes
  useEffect(() => {
    if (selectedImageIds.length > 0) {
      // For 3D, we'll position the floating panel at a fixed location
      onSelectionChange(window.innerWidth / 2, window.innerHeight / 2, selectedImageIds.length);
    } else {
      onSelectionChange(-1, -1, 0);
    }
  }, [selectedImageIds, onSelectionChange]);

  const handleAxisUpdate = async (
    axis: "x" | "y" | "z",
    negative: string,
    positive: string
  ) => {
    const currentLabels = useAppStore.getState().axisLabels;

    await apiClient.updateAxes({
      x_negative: axis === "x" ? negative : currentLabels.x[0],
      x_positive: axis === "x" ? positive : currentLabels.x[1],
      y_negative: axis === "y" ? negative : currentLabels.y[0],
      y_positive: axis === "y" ? positive : currentLabels.y[1],
      z_negative: axis === "z" ? negative : currentLabels.z?.[0],
      z_positive: axis === "z" ? positive : currentLabels.z?.[1],
    });

    console.log(`✓ ${axis.toUpperCase()}-axis updated to: ${negative} ↔ ${positive}`);
  };

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* Three.js Canvas */}
      <Canvas
        camera={{ position: [15, 15, 15], fov: useOrthographic ? 10 : 50 }}
        style={{ background: "#0d1117" }}
      >
        <Scene
          images={images}
          imageSize={visualSettings.imageSize}
          imageOpacity={visualSettings.imageOpacity}
          selectedImageIds={selectedImageIds}
          onImageClick={handleImageClick}
          cameraTarget={cameraTarget}
          useOrthographic={useOrthographic}
        />
      </Canvas>

      {/* Camera view buttons */}
      <div
        style={{
          position: "absolute",
          top: "20px",
          left: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          zIndex: 10,
          pointerEvents: "all",
        }}
      >
        <button
          onClick={() => {
            setUseOrthographic(true);
            setCameraTarget(new THREE.Vector3(0, 0, 25));
          }}
          style={{
            padding: "8px 12px",
            background: "rgba(33, 38, 45, 0.9)",
            border: "1px solid rgba(88, 166, 255, 0.5)",
            borderRadius: "6px",
            color: "#58a6ff",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: "600",
          }}
          title="View X-Y plane (top view) - Orthographic projection"
        >
          📊 XY Plane
        </button>
        <button
          onClick={() => {
            setUseOrthographic(true);
            setCameraTarget(new THREE.Vector3(0, 25, 0));
          }}
          style={{
            padding: "8px 12px",
            background: "rgba(33, 38, 45, 0.9)",
            border: "1px solid rgba(188, 140, 255, 0.5)",
            borderRadius: "6px",
            color: "#bc8cff",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: "600",
          }}
          title="View X-Z plane (front view) - Orthographic projection"
        >
          📊 XZ Plane
        </button>
        <button
          onClick={() => {
            setUseOrthographic(true);
            setCameraTarget(new THREE.Vector3(25, 0, 0));
          }}
          style={{
            padding: "8px 12px",
            background: "rgba(33, 38, 45, 0.9)",
            border: "1px solid rgba(210, 153, 34, 0.5)",
            borderRadius: "6px",
            color: "#d29922",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: "600",
          }}
          title="View Y-Z plane (side view) - Orthographic projection"
        >
          📊 YZ Plane
        </button>
        <button
          onClick={() => {
            setUseOrthographic(false);
            setCameraTarget(new THREE.Vector3(15, 15, 15));
          }}
          style={{
            padding: "8px 12px",
            background: "rgba(33, 38, 45, 0.9)",
            border: "1px solid rgba(48, 54, 61, 0.8)",
            borderRadius: "6px",
            color: "#c9d1d9",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: "600",
          }}
          title="Reset to isometric view with perspective"
        >
          🔄 Reset View
        </button>
      </div>

      {/* Axis editors overlay with color coding */}
      <div
        style={{
          position: "absolute",
          bottom: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          zIndex: 10,
          pointerEvents: "all",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "12px",
              height: "12px",
              background: "#ff0000",
              borderRadius: "50%",
              flexShrink: 0,
            }}
            title="X-axis (Red)"
          />
          <AxisEditor
            axis="x"
            negativeLabel={axisLabels.x[0]}
            positiveLabel={axisLabels.x[1]}
            onUpdate={(neg, pos) => handleAxisUpdate("x", neg, pos)}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "12px",
              height: "12px",
              background: "#00ff00",
              borderRadius: "50%",
              flexShrink: 0,
            }}
            title="Y-axis (Green)"
          />
          <AxisEditor
            axis="y"
            negativeLabel={axisLabels.y[0]}
            positiveLabel={axisLabels.y[1]}
            onUpdate={(neg, pos) => handleAxisUpdate("y", neg, pos)}
          />
        </div>

        {axisLabels.z && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "12px",
                height: "12px",
                background: "#0000ff",
                borderRadius: "50%",
                flexShrink: 0,
              }}
              title="Z-axis (Blue)"
            />
            <AxisEditor
              axis="z"
              negativeLabel={axisLabels.z[0]}
              positiveLabel={axisLabels.z[1]}
              onUpdate={(neg, pos) => handleAxisUpdate("z", neg, pos)}
            />
          </div>
        )}
      </div>

      {/* Help overlay */}
      <div
        style={{
          position: "absolute",
          top: "20px",
          right: "20px",
          background: "rgba(13, 17, 23, 0.9)",
          padding: "12px",
          borderRadius: "8px",
          fontSize: "12px",
          color: "#c9d1d9",
          pointerEvents: "none",
          border: "1px solid rgba(48, 54, 61, 0.5)",
        }}
      >
        <div style={{ fontWeight: "bold", marginBottom: "6px", color: "#58a6ff" }}>3D Controls</div>
        <div>🖱️ <strong>Left drag:</strong> Rotate view</div>
        <div>🖱️ <strong>Right drag:</strong> Pan camera</div>
        <div>🖱️ <strong>Scroll:</strong> Zoom in/out</div>
        <div>🖱️ <strong>Click:</strong> Select image</div>
        <div style={{ marginTop: "8px", fontSize: "11px", color: "#8b949e" }}>
          Use view buttons to snap to planes
        </div>
      </div>
    </div>
  );
};
