import React, { useState, useRef } from "react";
import "../PromptDialog/PromptDialog.css";
import "./ExternalImageLoader.css";

interface ExternalImageLoaderProps {
  onClose: () => void;
  onLoad: (shoes: string[], references: string[]) => void;
}

interface FileEntry {
  file: File;
  previewUrl: string;
}

export const ExternalImageLoader: React.FC<ExternalImageLoaderProps> = ({
  onClose,
  onLoad,
}) => {
  const [shoeFiles, setShoeFiles] = useState<FileEntry[]>([]);
  const [refFiles, setRefFiles] = useState<FileEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const shoeInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  const readAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const addFiles = (
    files: FileList | null,
    setter: React.Dispatch<React.SetStateAction<FileEntry[]>>
  ) => {
    if (!files) return;
    const imageFiles = Array.from(files).filter((f) =>
      f.type.startsWith("image/")
    );
    if (imageFiles.length === 0) {
      setError("No valid image files selected");
      return;
    }
    setError(null);
    const entries: FileEntry[] = imageFiles.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setter((prev) => [...prev, ...entries]);
  };

  const removeFile = (
    index: number,
    setter: React.Dispatch<React.SetStateAction<FileEntry[]>>
  ) => {
    setter((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleLoad = async () => {
    if (shoeFiles.length === 0 && refFiles.length === 0) {
      setError("Please add at least one image");
      return;
    }
    setIsLoading(true);
    try {
      const [shoeUrls, refUrls] = await Promise.all([
        Promise.all(shoeFiles.map((e) => readAsDataUrl(e.file))),
        Promise.all(refFiles.map((e) => readAsDataUrl(e.file))),
      ]);
      onLoad(shoeUrls, refUrls);
    } catch (err) {
      setError(
        `Failed to read files: ${err instanceof Error ? err.message : "Unknown error"}`
      );
      setIsLoading(false);
    }
  };

  const totalCount = shoeFiles.length + refFiles.length;

  return (
    <div className="dialog-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog el-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="el-header">
          <h2>Load Images</h2>
          <button className="el-close" onClick={onClose}>
            ×
          </button>
        </div>

        {/* Shoes section */}
        <div className="el-section">
          <div className="el-section-header">
            <span className="el-section-icon" style={{ color: "#58a6ff" }}>
              👟
            </span>
            <span className="el-section-title">
              Shoes
              <span className="el-section-hint">
                {" "}
                · background auto-removed · added to Shoes layer
              </span>
            </span>
            <button
              className="el-add-btn el-add-shoe"
              onClick={() => shoeInputRef.current?.click()}
            >
              + Add
            </button>
          </div>
          <input
            ref={shoeInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => addFiles(e.target.files, setShoeFiles)}
          />
          {shoeFiles.length > 0 && (
            <div className="el-thumbs">
              {shoeFiles.map((entry, i) => (
                <div key={i} className="el-thumb el-thumb-shoe">
                  <img src={entry.previewUrl} alt={entry.file.name} />
                  <button
                    className="el-thumb-remove"
                    onClick={() => removeFile(i, setShoeFiles)}
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {shoeFiles.length === 0 && (
            <p className="el-section-empty">No shoe images added yet</p>
          )}
        </div>

        {/* References section */}
        <div className="el-section">
          <div className="el-section-header">
            <span className="el-section-icon" style={{ color: "#ff7b72" }}>
              🖼
            </span>
            <span className="el-section-title">
              References
              <span className="el-section-hint">
                {" "}
                · background preserved · added to References layer
              </span>
            </span>
            <button
              className="el-add-btn el-add-ref"
              onClick={() => refInputRef.current?.click()}
            >
              + Add
            </button>
          </div>
          <input
            ref={refInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => addFiles(e.target.files, setRefFiles)}
          />
          {refFiles.length > 0 && (
            <div className="el-thumbs">
              {refFiles.map((entry, i) => (
                <div key={i} className="el-thumb el-thumb-ref">
                  <img src={entry.previewUrl} alt={entry.file.name} />
                  <button
                    className="el-thumb-remove"
                    onClick={() => removeFile(i, setRefFiles)}
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {refFiles.length === 0 && (
            <p className="el-section-empty">No reference images added yet</p>
          )}
        </div>

        {error && <div className="el-error">⚠️ {error}</div>}

        <div className="el-actions">
          <button className="action-button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="action-button-primary"
            onClick={handleLoad}
            disabled={totalCount === 0 || isLoading}
          >
            {isLoading
              ? "⏳ Loading…"
              : totalCount > 0
              ? `Load ${totalCount} image${totalCount !== 1 ? "s" : ""} to Canvas`
              : "Load to Canvas"}
          </button>
        </div>
      </div>
    </div>
  );
};
