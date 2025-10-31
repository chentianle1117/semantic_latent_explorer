import React, { useState, useRef } from "react";
import "./ExternalImageLoader.css";

interface ExternalImageLoaderProps {
  onClose: () => void;
  onLoad: (urls: string[], prompt: string) => void;
}

export const ExternalImageLoader: React.FC<ExternalImageLoaderProps> = ({
  onClose,
  onLoad,
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const imageFiles = Array.from(files).filter(file =>
      file.type.startsWith('image/')
    );

    if (imageFiles.length === 0) {
      setError("No valid image files selected");
      return;
    }

    if (imageFiles.length !== files.length) {
      setError(`Selected ${files.length} files but only ${imageFiles.length} are images`);
    } else {
      setError(null);
    }

    setSelectedFiles(imageFiles);
  };

  const handleLoad = async () => {
    setError(null);

    if (selectedFiles.length === 0) {
      setError("Please select at least one image file");
      return;
    }

    setIsLoading(true);

    try {
      // Convert files to data URLs
      const dataUrls = await Promise.all(
        selectedFiles.map(file => {
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        })
      );

      // Success - pass data URLs to parent (use prompt or default)
      onLoad(dataUrls, prompt.trim() || "Loaded from computer");
    } catch (err) {
      setError(`Failed to read files: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsLoading(false);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="external-loader-overlay" onClick={onClose}>
      <div className="external-loader-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>🖼️ Load Images from Computer</h2>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="dialog-content">
          <p className="dialog-description">
            Select one or more image files from your computer to add to the canvas.
            All selected images will be processed with CLIP embeddings and positioned in the semantic space.
          </p>

          <div className="input-section">
            <label className="input-label">
              <strong>Select Images</strong>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <button
              className="file-select-button"
              onClick={() => fileInputRef.current?.click()}
            >
              📁 Choose Image Files...
            </button>
            <p className="input-hint">
              Supports JPG, PNG, WebP and other image formats. You can select multiple files at once.
            </p>
          </div>

          {selectedFiles.length > 0 && (
            <div className="selected-files">
              <div className="files-header">
                <strong>Selected Files ({selectedFiles.length})</strong>
              </div>
              <div className="files-list">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="file-item">
                    <span className="file-name">
                      📷 {file.name}
                    </span>
                    <span className="file-size">
                      {(file.size / 1024).toFixed(1)} KB
                    </span>
                    <button
                      className="remove-file-button"
                      onClick={() => handleRemoveFile(index)}
                      title="Remove file"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="input-section">
            <label className="input-label">
              <strong>Prompt/Description</strong> <span style={{ color: '#8b949e', fontWeight: 'normal' }}>(optional)</span>
            </label>
            <input
              type="text"
              className="prompt-input"
              placeholder="e.g., Sneakers from previous session (leave empty for default)"
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setError(null);
              }}
            />
            <p className="input-hint">
              Optional: Add a description that will be stored as metadata. If left empty, defaults to "Loaded from computer"
            </p>
          </div>

          {error && (
            <div className="error-message">
              ⚠️ {error}
            </div>
          )}

          <div className="dialog-stats">
            {selectedFiles.length > 0 && (
              <span>✓ {selectedFiles.length} image{selectedFiles.length !== 1 ? "s" : ""} ready to load</span>
            )}
          </div>
        </div>

        <div className="dialog-actions">
          <button className="action-button secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="action-button primary"
            onClick={handleLoad}
            disabled={selectedFiles.length === 0 || isLoading}
          >
            {isLoading ? "⏳ Loading..." : "📥 Load Images to Canvas"}
          </button>
        </div>
      </div>
    </div>
  );
};
