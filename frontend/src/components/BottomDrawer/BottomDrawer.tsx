import React from "react";
import { useAppStore } from "../../store/appStore";
import "./BottomDrawer.css";

export const BottomDrawer: React.FC = () => {
  const isExpanded = useAppStore((s) => s.isDrawerExpanded);
  const setIsExpanded = useAppStore((s) => s.setIsDrawerExpanded);
  const images = useAppStore((s) => s.images.filter((img) => img.visible));
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
          {images.slice(-8).map((img) => (
            <img
              key={img.id}
              className="drawer-thumb"
              src={`data:image/png;base64,${img.base64_image}`}
              alt=""
              onClick={(e) => {
                e.stopPropagation();
                setSelectedImageIds([img.id]);
              }}
            />
          ))}
        </div>
      </div>

      {isExpanded && (
        <div className="drawer-content">
          <div className="drawer-timeline">
            {historyGroups.map((group) => {
              const thumbnailImage =
                group.thumbnail_id !== null
                  ? images.find((img) => img.id === group.thumbnail_id)
                  : null;
              const timestamp = new Date(group.timestamp).toLocaleTimeString(
                [],
                { hour: "2-digit", minute: "2-digit" }
              );

              return (
                <div
                  key={group.id}
                  className={`drawer-group ${hoveredGroupId === group.id ? "highlighting" : ""}`}
                  onClick={() => setSelectedImageIds(group.image_ids)}
                  onMouseEnter={() => setHoveredGroupId(group.id)}
                  onMouseLeave={() => setHoveredGroupId(null)}
                >
                  <div className="group-header">
                    <span className="group-type-badge">
                      {group.type === "reference" ? "🔄" : group.type === "batch" ? "🎲" : "📁"}
                      {" "}{group.type.toUpperCase()}
                    </span>
                    <span className="group-count">{group.image_ids.length}</span>
                  </div>
                  <div className="group-prompt" title={group.prompt}>
                    {group.prompt.substring(0, 40)}
                    {group.prompt.length > 40 ? "..." : ""}
                  </div>
                  <div className="group-time">{timestamp}</div>
                  {thumbnailImage && (
                    <img
                      className="group-thumb"
                      src={`data:image/png;base64,${thumbnailImage.base64_image}`}
                      alt={group.type}
                    />
                  )}
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
