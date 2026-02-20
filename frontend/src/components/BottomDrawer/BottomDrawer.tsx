import React from "react";
import { useAppStore } from "../../store/appStore";
import "./BottomDrawer.css";

export const BottomDrawer: React.FC = () => {
  const isExpanded = useAppStore((s) => s.isDrawerExpanded);
  const setIsExpanded = useAppStore((s) => s.setIsDrawerExpanded);
  // Include invisible images so deleted items show in history with strikethrough
  const allImages = useAppStore((s) => s.images);
  const images = allImages.filter((img) => img.visible);
  const deletedIds = React.useMemo(
    () => new Set(allImages.filter((img) => !img.visible).map((img) => img.id)),
    [allImages]
  );
  const historyGroups = useAppStore((s) => s.historyGroups);
  const setSelectedImageIds = useAppStore((s) => s.setSelectedImageIds);
  const setHoveredGroupId = useAppStore((s) => s.setHoveredGroupId);
  const hoveredGroupId = useAppStore((s) => s.hoveredGroupId);

  return (
    <div className={`bottom-drawer ${isExpanded ? "expanded" : ""}`}>
      <div className="drawer-bar" onClick={() => setIsExpanded(!isExpanded)}>
        <button className="drawer-toggle">
          {isExpanded ? "▼" : "▲"}
        </button>
        <span className="drawer-stats">
          {historyGroups.length} batches &middot; {images.length} images
        </span>
        <div className="drawer-thumbs">
          {historyGroups.slice(-8).map((group) => {
            // Use allImages so deleted thumbnail still shows (dimmed)
            const thumbnailImage =
              group.thumbnail_id !== null
                ? allImages.find((img) => img.id === group.thumbnail_id)
                : null;
            const thumbDeleted = thumbnailImage ? deletedIds.has(thumbnailImage.id) : false;
            const deletedCount = group.image_ids.filter((id) => deletedIds.has(id)).length;
            return (
              <div
                key={group.id}
                className="drawer-batch-chip"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedImageIds(group.image_ids.filter((id) => !deletedIds.has(id)));
                }}
              >
                {thumbnailImage && (
                  <div className="drawer-thumb-wrap">
                    <img
                      className={`drawer-thumb${thumbDeleted ? " drawer-thumb--deleted" : ""}`}
                      src={`data:image/png;base64,${thumbnailImage.base64_image}`}
                      alt=""
                    />
                    {thumbDeleted && <div className="drawer-thumb-cross" />}
                  </div>
                )}
                <span className="batch-count-badge">
                  {group.image_ids.length}
                  {deletedCount > 0 ? ` (−${deletedCount})` : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {isExpanded && (
        <div className="drawer-content">
          <div className="drawer-timeline">
            {historyGroups.map((group) => {
              const thumbnailImage =
                group.thumbnail_id !== null
                  ? allImages.find((img) => img.id === group.thumbnail_id)
                  : null;
              const allDeleted = group.image_ids.every((id) => deletedIds.has(id));
              const someDeleted = group.image_ids.some((id) => deletedIds.has(id));
              const timestamp = new Date(group.timestamp).toLocaleTimeString(
                [],
                { hour: "2-digit", minute: "2-digit" }
              );
              const typeIcon = group.type === "reference" ? "🔄" : group.type === "batch" ? "🎲" : "📁";

              return (
                <div
                  key={group.id}
                  className={`drawer-group ${hoveredGroupId === group.id ? "highlighting" : ""}`}
                  onClick={() => setSelectedImageIds(group.image_ids)}
                  onMouseEnter={() => setHoveredGroupId(group.id)}
                  onMouseLeave={() => setHoveredGroupId(null)}
                >
                  {/* Background image fills the entire card */}
                  {thumbnailImage ? (
                    <img
                      className={`group-thumb-bg${allDeleted ? " group-thumb-bg--deleted" : ""}`}
                      src={`data:image/png;base64,${thumbnailImage.base64_image}`}
                      alt={group.type}
                    />
                  ) : (
                    <div className="group-thumb-placeholder" />
                  )}

                  {/* Red deleted overlay */}
                  {someDeleted && <div className={`group-deleted-overlay${allDeleted ? " group-deleted-overlay--all" : ""}`} />}

                  {/* Overlay: text floats on top */}
                  <div className="group-overlay">
                    <div className="group-overlay-top">
                      <span className="group-type-badge">{typeIcon} {group.type.toUpperCase()}</span>
                      <span className="group-count">{group.image_ids.length}</span>
                    </div>
                    <div className="group-overlay-bottom">
                      <div className="group-prompt" title={group.prompt}>
                        {group.prompt.substring(0, 50)}{group.prompt.length > 50 ? "…" : ""}
                      </div>
                      <div className="group-time">{timestamp}</div>
                    </div>
                  </div>
                </div>
              );
            })}
            {historyGroups.length === 0 && (
              <div className="drawer-empty">No history yet</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
