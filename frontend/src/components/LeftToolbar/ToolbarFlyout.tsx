import React, { useEffect, useRef } from "react";

interface ToolbarFlyoutProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export const ToolbarFlyout: React.FC<ToolbarFlyoutProps> = ({
  title,
  onClose,
  children,
}) => {
  const flyoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        flyoutRef.current &&
        !flyoutRef.current.contains(e.target as Node) &&
        // Don't close if clicking on the toolbar icons themselves
        !(e.target as HTMLElement).closest(".left-toolbar")
      ) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div className="toolbar-flyout" ref={flyoutRef}>
      <div className="flyout-header">
        <span className="flyout-title">{title}</span>
        <button className="flyout-close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="flyout-body">{children}</div>
    </div>
  );
};
