/**
 * Inline Axis Editor Component
 * Shows two prominent words at opposite ends of the axis.
 * Click a word to edit it inline, with an Apply button.
 */

import React, { useState, useEffect, useRef } from "react";
import { useAppStore } from "../../store/appStore";
import "./AxisEditor.css";

interface AxisEditorProps {
  axis: "x" | "y" | "z";
  negativeLabel: string;
  positiveLabel: string;
  onUpdate: (negative: string, positive: string) => void;
  expandedNegative?: string[];
  expandedPositive?: string[];
  style?: React.CSSProperties;
}

export const AxisEditor: React.FC<AxisEditorProps> = ({
  axis,
  negativeLabel,
  positiveLabel,
  onUpdate,
  expandedNegative = [],
  expandedPositive = [],
  style,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [negative, setNegative] = useState(negativeLabel);
  const [positive, setPositive] = useState(positiveLabel);
  const negativeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNegative(negativeLabel);
    setPositive(positiveLabel);
  }, [negativeLabel, positiveLabel]);

  useEffect(() => {
    if (isEditing && negativeInputRef.current) {
      negativeInputRef.current.focus();
      negativeInputRef.current.select();
    }
  }, [isEditing]);

  const handleApply = () => {
    if (negative.trim() && positive.trim()) {
      onUpdate(negative.trim(), positive.trim());
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setNegative(negativeLabel);
    setPositive(positiveLabel);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleApply();
    if (e.key === "Escape") handleCancel();
  };

  const colorClass = axis === "x" ? "axis-x" : axis === "y" ? "axis-y" : "axis-z";

  return (
    <div className={`axis-inline ${colorClass}`} style={style}>
      {isEditing ? (
        <span className="axis-edit-group axis-edit-both">
          <input
            ref={negativeInputRef}
            className={`axis-word-input ${colorClass}`}
            value={negative}
            onChange={(e) => setNegative(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="negative"
          />
          <span className={`axis-arrow ${colorClass}`}>{axis === "x" ? "◄────►" : "◄─►"}</span>
          <input
            className={`axis-word-input ${colorClass}`}
            value={positive}
            onChange={(e) => setPositive(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="positive"
          />
          <button className="axis-apply-btn" onClick={handleApply}>Apply</button>
          <button className="axis-cancel-btn" onClick={handleCancel}>×</button>
        </span>
      ) : (
        <>
          <span className="axis-label-block">
            <span
              className={`axis-word ${colorClass}`}
              onClick={() => setIsEditing(true)}
              title="Click to edit both axis labels"
            >
              {negativeLabel}
            </span>
            {expandedNegative.length > 0 && (
              <span className="axis-expanded" title={expandedNegative.join(", ")}>
                {expandedNegative.slice(0, 2).join(", ")}
                {expandedNegative.length > 2 ? "…" : ""}
              </span>
            )}
          </span>
          <span className={`axis-arrow ${colorClass}`}>
            {axis === "x" ? "◄──────────────────►" : "◄────────►"}
          </span>
          {(axis === "x" || axis === "y") && (
            <button
              className="axis-tune-btn"
              data-tour="axis-tune-btn"
              onClick={(e) => {
                e.stopPropagation();
                const store = useAppStore.getState();
                store.setAxisTuningMode(true);
                store.setAxisTuningAxis(axis);
              }}
              title="Open axis tuning mode"
            >
              Tune
            </button>
          )}
          <span className="axis-label-block">
            <span
              className={`axis-word ${colorClass}`}
              onClick={() => setIsEditing(true)}
              title="Click to edit both axis labels"
            >
              {positiveLabel}
            </span>
            {expandedPositive.length > 0 && (
              <span className="axis-expanded" title={expandedPositive.join(", ")}>
                {expandedPositive.slice(0, 2).join(", ")}
                {expandedPositive.length > 2 ? "…" : ""}
              </span>
            )}
          </span>
        </>
      )}
    </div>
  );
};
