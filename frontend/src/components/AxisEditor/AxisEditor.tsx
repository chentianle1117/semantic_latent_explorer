/**
 * Inline Axis Editor Component
 */

import React, { useState, useEffect } from "react";
import "./AxisEditor.css";

interface AxisEditorProps {
  axis: "x" | "y";
  negativeLabel: string;
  positiveLabel: string;
  onUpdate: (negative: string, positive: string) => void;
  style?: React.CSSProperties;
}

export const AxisEditor: React.FC<AxisEditorProps> = ({
  axis: _axis,
  negativeLabel,
  positiveLabel,
  onUpdate,
  style,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [negative, setNegative] = useState(negativeLabel);
  const [positive, setPositive] = useState(positiveLabel);

  // Sync local state with props whenever they change
  useEffect(() => {
    setNegative(negativeLabel);
    setPositive(positiveLabel);
  }, [negativeLabel, positiveLabel]);

  const handleUpdate = () => {
    if (negative.trim() && positive.trim()) {
      onUpdate(negative.trim(), positive.trim());
      setIsEditing(false);
    } else {
      alert("Both labels are required");
    }
  };

  const handleCancel = () => {
    setNegative(negativeLabel);
    setPositive(positiveLabel);
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <div className="axis-label" style={style} onClick={() => setIsEditing(true)}>
        ← {negativeLabel} ... {positiveLabel} →
      </div>
    );
  }

  return (
    <div className="axis-editor" style={style}>
      <div className="axis-editor-inputs">
        <input
          type="text"
          className="axis-input"
          value={negative}
          onChange={(e) => setNegative(e.target.value)}
          placeholder="Negative"
          autoFocus
        />
        <span className="axis-separator">...</span>
        <input
          type="text"
          className="axis-input"
          value={positive}
          onChange={(e) => setPositive(e.target.value)}
          placeholder="Positive"
        />
      </div>
      <div className="axis-editor-buttons">
        <button className="axis-btn axis-btn-update" onClick={handleUpdate}>
          Update
        </button>
        <button className="axis-btn axis-btn-cancel" onClick={handleCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
};
