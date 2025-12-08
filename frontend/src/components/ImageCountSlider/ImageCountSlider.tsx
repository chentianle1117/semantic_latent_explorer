import React from 'react';
import './ImageCountSlider.css';

interface ImageCountSliderProps {
  value: number;
  onChange: (count: number) => void;
  min?: number;
  max?: number;
  label?: string;
}

export const ImageCountSlider: React.FC<ImageCountSliderProps> = ({
  value,
  onChange,
  min = 1,
  max = 8,
  label = 'Images to Generate'
}) => {
  return (
    <div className="image-count-slider">
      <div className="slider-header">
        <label className="slider-label">{label}</label>
        <span className="slider-value">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="slider-input"
        step="1"
      />
      <div className="slider-ticks">
        {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((tick) => (
          <span key={tick} className="tick-mark">
            {tick}
          </span>
        ))}
      </div>
    </div>
  );
};
