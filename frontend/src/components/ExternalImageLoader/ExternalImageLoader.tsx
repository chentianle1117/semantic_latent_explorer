import React, { useState, useRef } from "react";
import "../PromptDialog/PromptDialog.css";
import "./ExternalImageLoader.css";

interface ExternalImageLoaderProps {
  onClose: () => void;
  onLoad: (urls: string[]) => void;
}

export const ExternalImageLoader: React.FC<ExternalImageLoaderProps> = ({
  onClose,
  onLoad,
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) { setError("No valid image files selected"); return; }
    setError(null);
    setSelectedFiles(imageFiles);
  };

  const handleLoad = async () => {
    if (selectedFiles.length === 0) { setError("Please select at least one image file"); return; }
    setIsLoading(true);
    try {
      const dataUrls = await Promise.all(
        selectedFiles.map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            })
        )
      );
      onLoad(dataUrls);
    } catch (err) {
      setError(`Failed to read files: ${err instanceof Error ? err.message : "Unknown error"}`);
      setIsLoading(false);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog el-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="el-header">
          <h2>Load Reference Images</h2>
          <button className="el-close" onClick={onClose}>×</button>
        </div>

        <p className="el-hint">
          Images load into the <span className="el-layer-chip">● References</span> layer. Background is preserved.
        </p>

        <div className="el-drop-zone" onClick={() => fileInputRef.current?.click()}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
          {selectedFiles.length === 0 ? (
            <span className="el-drop-label">Click to choose images  ·  JPG · PNG · WebP</span>
          ) : (
            <span className="el-drop-label el-drop-ready">✓ {selectedFiles.length} file{selectedFiles.length !== 1 ? "s" : ""} selected — click to change</span>
          )}
        </div>

        {selectedFiles.length > 0 && (
          <div className="el-files-list">
            {selectedFiles.map((file, i) => (
              <div key={i} className="el-file-row">
                <span className="el-file-name">📷 {file.name}</span>
                <span className="el-file-size">{(file.size / 1024).toFixed(0)} KB</span>
                <button className="el-remove-btn" onClick={() => handleRemoveFile(i)} title="Remove">×</button>
              </div>
            ))}
          </div>
        )}

        {error && <div className="el-error">⚠️ {error}</div>}

        <div className="el-actions">
          <button className="action-button-secondary" onClick={onClose}>Cancel</button>
          <button
            className="action-button-primary"
            onClick={handleLoad}
            disabled={selectedFiles.length === 0 || isLoading}
          >
            {isLoading ? "⏳ Loading…" : "Load to Canvas"}
          </button>
        </div>
      </div>
    </div>
  );
};
