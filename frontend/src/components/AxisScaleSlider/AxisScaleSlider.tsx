/**
 * Slider to stretch/compress an axis from center, or adjust image size.
 * Default: logarithmic 0.2–10× scale for axes.
 * With isLinear=true + custom minVal/maxVal: linear scale for image size etc.
 */

import React, { useCallback } from "react";
import "./AxisScaleSlider.css";

interface AxisScaleSliderProps {
  axis: "x" | "y" | "size" | "opacity";
  value: number;
  onChange: (value: number) => void;
  compact?: boolean;
  minVal?: number;
  maxVal?: number;
  isLinear?: boolean;
  unit?: string;
}

export const AxisScaleSlider: React.FC<AxisScaleSliderProps> = ({
  axis,
  value,
  onChange,
  compact = false,
  minVal = 0.2,
  maxVal = 10,
  isLinear = false,
  unit = "×",
}) => {
  const colorClass = axis === "x" ? "axis-x" : axis === "y" ? "axis-y" : axis === "opacity" ? "axis-size" : "axis-size";

  const valueToSlider = useCallback((v: number): number => {
    const clamped = Math.max(minVal, Math.min(maxVal, v));
    if (isLinear) {
      return ((clamped - minVal) / (maxVal - minVal)) * 100;
    }
    const logMin = Math.log(minVal);
    const logMax = Math.log(maxVal);
    return ((Math.log(clamped) - logMin) / (logMax - logMin)) * 100;
  }, [minVal, maxVal, isLinear]);

  const sliderToValue = useCallback((s: number): number => {
    const clamped = Math.max(0, Math.min(100, s));
    if (isLinear) {
      return minVal + (clamped / 100) * (maxVal - minVal);
    }
    const logMin = Math.log(minVal);
    const logMax = Math.log(maxVal);
    return Math.exp(logMin + (clamped / 100) * (logMax - logMin));
  }, [minVal, maxVal, isLinear]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(sliderToValue(parseFloat(e.target.value)));
  };

  const displayValue = isLinear
    ? `${Math.round(value)}${unit}`
    : `${value.toFixed(2)}${unit}`;

  return (
    <div className={`axis-scale-slider ${colorClass}${compact ? " compact" : ""}`}>
      {!compact && <span className="axis-scale-min">{isLinear ? `${minVal}${unit}` : `${minVal}×`}</span>}
      <input
        type="range"
        min="0"
        max="100"
        step="0.5"
        value={valueToSlider(value)}
        onChange={handleChange}
        className="axis-scale-input"
      />
      {!compact && <span className="axis-scale-max">{isLinear ? `${maxVal}${unit}` : `${maxVal}×`}</span>}
      <span className="axis-scale-value">{displayValue}</span>
    </div>
  );
};
