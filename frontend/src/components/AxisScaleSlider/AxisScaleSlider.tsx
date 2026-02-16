/**
 * Slider to stretch/compress an axis from center (like video editing software).
 * 1.0 = no change, >1 = expand, <1 = compress.
 * Range: 0.2 to 10.0x
 */

import React, { useState, useCallback } from "react";
import "./AxisScaleSlider.css";

interface AxisScaleSliderProps {
  axis: "x" | "y";
  value: number;
  onChange: (value: number) => void;
}

export const AxisScaleSlider: React.FC<AxisScaleSliderProps> = ({
  axis,
  value,
  onChange,
}) => {
  const colorClass = axis === "x" ? "axis-x" : "axis-y";
  const [isDragging, setIsDragging] = useState(false);
  const isVertical = axis === "y";

  // Logarithmic scaling for better feel across 0.2-10 range
  // Maps [0, 100] slider to log space to get exponential feel
  const valueToSlider = useCallback((v: number) => {
    const clamped = Math.max(0.2, Math.min(10, v));
    const logMin = Math.log(0.2);
    const logMax = Math.log(10);
    const logV = Math.log(clamped);
    return ((logV - logMin) / (logMax - logMin)) * 100;
  }, []);

  const sliderToValue = useCallback((sliderVal: number) => {
    const clamped = Math.max(0, Math.min(100, sliderVal));
    const logMin = Math.log(0.2);
    const logMax = Math.log(10);
    const logV = logMin + (clamped / 100) * (logMax - logMin);
    return Math.exp(logV);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sliderPosition = parseFloat(e.target.value);
    const newValue = sliderToValue(sliderPosition);
    console.log(`[AxisScaleSlider ${axis}] Slider: ${sliderPosition.toFixed(1)} → Value: ${newValue.toFixed(3)}`);
    onChange(newValue);
  };

  const currentSliderPos = valueToSlider(value);

  return (
    <div
      className={`axis-scale-slider ${colorClass} ${isDragging ? "dragging" : ""} ${isVertical ? "vertical" : ""}`}
      title={`Stretch ${axis.toUpperCase()}-axis (${value.toFixed(2)}x)`}
    >
      {isVertical && <span className="axis-scale-min">10×</span>}
      {!isVertical && <span className="axis-scale-min">0.2×</span>}
      <input
        type="range"
        min="0"
        max="100"
        step="0.5"
        value={currentSliderPos}
        onChange={handleChange}
        onMouseDown={() => setIsDragging(true)}
        onMouseUp={() => setIsDragging(false)}
        onTouchStart={() => setIsDragging(true)}
        onTouchEnd={() => setIsDragging(false)}
        className="axis-scale-input"
      />
      {isVertical && <span className="axis-scale-max">0.2×</span>}
      {!isVertical && <span className="axis-scale-max">10×</span>}
      <span className="axis-scale-value">{value.toFixed(2)}×</span>
    </div>
  );
};
