/**
 * Inline Axis Editor Component
 * Shows two prominent words at opposite ends of the axis.
 * Click a word to edit it inline, with an Apply button.
 */

import React, { useState, useEffect, useRef } from "react";
import "./AxisEditor.css";

interface AxisEditorProps {
  axis: "x" | "y" | "z";
  negativeLabel: string;
  positiveLabel: string;
  onUpdate: (negative: string, positive: string) => void;
  style?: React.CSSProperties;
}

export const AxisEditor: React.FC<AxisEditorProps> = ({
  axis,
  negativeLabel,
  positiveLabel,
  onUpdate,
  style,
}) => {
  const [editingEnd, setEditingEnd] = useState<"negative" | "positive" | null>(null);
  const [negative, setNegative] = useState(negativeLabel);
  const [positive, setPositive] = useState(positiveLabel);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNegative(negativeLabel);
    setPositive(positiveLabel);
  }, [negativeLabel, positiveLabel]);

  useEffect(() => {
    if (editingEnd && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingEnd]);

  const handleApply = () => {
    if (negative.trim() && positive.trim()) {
      onUpdate(negative.trim(), positive.trim());
      setEditingEnd(null);
    }
  };

  const handleCancel = () => {
    setNegative(negativeLabel);
    setPositive(positiveLabel);
    setEditingEnd(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleApply();
    if (e.key === "Escape") handleCancel();
  };

  const isX = axis === "x";
  const colorClass = isX ? "axis-x" : "axis-y";

  return (
    <div className={`axis-inline ${colorClass}`} style={style}>
      {/* Negative end */}
      {editingEnd === "negative" ? (
        <span className="axis-edit-group">
          <input
            ref={inputRef}
            className={`axis-word-input ${colorClass}`}
            value={negative}
            onChange={(e) => setNegative(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="axis-apply-btn" onClick={handleApply}>Apply</button>
          <button className="axis-cancel-btn" onClick={handleCancel}>×</button>
        </span>
      ) : (
        <span
          className={`axis-word ${colorClass}`}
          onClick={() => setEditingEnd("negative")}
          title="Click to edit"
        >
          {negativeLabel}
        </span>
      )}

      {/* Arrow line */}
      <span className={`axis-arrow ${colorClass}`}>
        {isX ? "◄──────────────────►" : "◄────────►"}
      </span>

      {/* Positive end */}
      {editingEnd === "positive" ? (
        <span className="axis-edit-group">
          <input
            ref={editingEnd === "positive" ? inputRef : undefined}
            className={`axis-word-input ${colorClass}`}
            value={positive}
            onChange={(e) => setPositive(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="axis-apply-btn" onClick={handleApply}>Apply</button>
          <button className="axis-cancel-btn" onClick={handleCancel}>×</button>
        </span>
      ) : (
        <span
          className={`axis-word ${colorClass}`}
          onClick={() => setEditingEnd("positive")}
          title="Click to edit"
        >
          {positiveLabel}
        </span>
      )}
    </div>
  );
};
