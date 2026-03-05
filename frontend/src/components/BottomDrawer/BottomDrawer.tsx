import React, { useEffect, useMemo } from "react";
import { useAppStore } from "../../store/appStore";
import "./BottomDrawer.css";

// ─── Main BottomDrawer ────────────────────────────────────────────────────────
export const BottomDrawer: React.FC = () => {
  const setIsExpanded = useAppStore(s => s.setIsHistoryExpanded);
  const allImages = useAppStore(s => s.images);
  const isolatedImageIds = useAppStore(s => s.isolatedImageIds);
  const images = allImages.filter(img => img.visible);
  // Visible image ID set — used to decide if a batch still has live images
  const visibleImageIds = useMemo(
    () => new Set(allImages.filter(img => img.visible).map(img => img.id)),
    [allImages],
  );
  // Deleted ID set — used for per-image dot indicators (separate from batch visibility)
  const deletedIds = useMemo(
    () => new Set(allImages.filter(img => !img.visible).map(img => img.id)),
    [allImages],
  );
  const allHistoryGroups = useAppStore(s => s.historyGroups);
  const hiddenBatchIds = useAppStore(s => s.hiddenBatchIds);
  const setSelectedImageIds = useAppStore(s => s.setSelectedImageIds);

  // When isolation is active, filter history groups to only those with isolated items
  const historyGroups = useMemo(() => {
    // Hide batches where NO images are currently visible.
    // Using visibleImageIds (not deletedIds) catches both soft-deleted images AND
    // images that were purged server-side and never added to the frontend state.
    let groups = allHistoryGroups.filter(g =>
      g.image_ids.some(id => visibleImageIds.has(id))
    );
    if (isolatedImageIds !== null) {
      const isoSet = new Set(isolatedImageIds);
      groups = groups.filter(g => g.image_ids.some(id => isoSet.has(id)));
    }
    return groups;
  }, [allHistoryGroups, isolatedImageIds, visibleImageIds]);

  // Filtered image count for stats
  const displayedImageCount = isolatedImageIds !== null
    ? images.filter(img => isolatedImageIds.includes(img.id)).length
    : images.length;

  // Exclusive tab: in store so clear canvas can collapse it
  const activeTab = useAppStore((s) => s.drawerActiveTab);
  const setActiveTab = useAppStore((s) => s.setDrawerActiveTab);
  const isExpanded = activeTab !== null;

  // Sync global store so LayersSidebar + ProgressModal adjust their height
  useEffect(() => {
    setIsExpanded(isExpanded);
  }, [isExpanded, setIsExpanded]);

  const switchTab = (tab: 'history') => {
    setActiveTab(activeTab === tab ? null : tab);
  };

  return (
    <div className={`bottom-drawer ${isExpanded ? 'expanded' : ''}`}>

      {/* ── Compact bar: always visible — click anywhere to expand/collapse ── */}
      <div
        className={`drawer-bar${isExpanded ? ' drawer-bar--expanded' : ''}`}
        data-tour="bottom-drawer-bar"
        onClick={() => { if (!isExpanded) setActiveTab('history'); }}
        style={{ cursor: isExpanded ? 'default' : 'pointer' }}
      >
        {/* Left: collapse toggle */}
        <button
          className="drawer-toggle"
          title={isExpanded ? "Collapse" : "Expand History"}
          onClick={e => {
            e.stopPropagation();
            if (isExpanded) setActiveTab(null);
            else setActiveTab('history');
          }}
        >
          {isExpanded ? '▼' : '▲'}
        </button>

        {isExpanded ? (
          /* Expanded bar: each tab button stops propagation so it switches tabs
             without collapsing; clicking empty bar space collapses via bar onClick */
          <>
            <div className="drawer-section-tabs" data-tour="drawer-tabs">
              <button
                className={`drawer-section-tab${activeTab === 'history' ? ' active' : ''}`}
                data-tour="tab-history"
                onClick={e => { e.stopPropagation(); switchTab('history'); }}
                title="History"
              >
                History
              </button>
            </div>
            <span className="drawer-stats drawer-stats--compact" onClick={e => e.stopPropagation()}>
              {historyGroups.length} batches · {displayedImageCount} images{isolatedImageIds !== null ? ' (isolated)' : ''}
            </span>
          </>
        ) : (
          /* Collapsed: stats + batch chip thumbnails — clicking anywhere on bar expands */
          <>
            <span className="drawer-stats">
              {historyGroups.length} batches · {displayedImageCount} images{isolatedImageIds !== null ? ' (isolated)' : ''}
            </span>
            <div className="drawer-thumbs">
              {historyGroups.slice(-8).map(group => {
                const thumbnailImage =
                  group.thumbnail_id !== null
                    ? allImages.find(img => img.id === group.thumbnail_id)
                    : null;
                const thumbDeleted = thumbnailImage ? !visibleImageIds.has(thumbnailImage.id) : false;
                const deletedCount = group.image_ids.filter(id => !visibleImageIds.has(id)).length;
                // When isolated, only select images that are in the isolation set
                const isoSet = isolatedImageIds !== null ? new Set(isolatedImageIds) : null;
                const selectableIds = group.image_ids.filter(id =>
                  visibleImageIds.has(id) && (isoSet === null || isoSet.has(id))
                );
                const isBatchHidden = hiddenBatchIds.has(group.id);
                return (
                  <div
                    key={group.id}
                    className={`drawer-batch-chip${isBatchHidden ? ' batch-hidden' : ''}`}
                    onClick={e => {
                      e.stopPropagation();
                      useAppStore.getState().toggleBatchVisibility(group.id);
                    }}
                    title={isBatchHidden ? 'Click to show batch' : 'Click to hide batch'}
                  >
                    {thumbnailImage && (
                      <div className="drawer-thumb-wrap">
                        <img
                          className={`drawer-thumb${thumbDeleted ? ' drawer-thumb--deleted' : ''}`}
                          src={`data:image/png;base64,${thumbnailImage.base64_image}`}
                          alt=""
                        />
                        {deletedCount > 0 && <span className="drawer-deleted-dot" />}
                      </div>
                    )}
                    <span className="batch-count-badge">
                      {group.image_ids.length}
                      {deletedCount > 0 ? ` (−${deletedCount})` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Single active panel: fills available space ── */}
      {isExpanded && (
        <div className="drawer-panels" data-tour="bottom-drawer-content" onClick={e => e.stopPropagation()}>

          {/* History section */}
          <div className={`drawer-panel${activeTab === 'history' ? ' open' : ''}`}>
            {activeTab === 'history' && (
              <div className="drawer-timeline">
                {historyGroups.length === 0 ? (
                  <span className="drawer-empty">No history yet</span>
                ) : (
                  historyGroups.map(group => {
                    const thumbnailImage =
                      group.thumbnail_id !== null
                        ? allImages.find(img => img.id === group.thumbnail_id)
                        : null;
                    // Batch is shown here only if it passed the "has visible images" filter above.
                    // someDeleted = some (but not all) images are no longer visible.
                    const someDeleted = group.image_ids.some(id => !visibleImageIds.has(id));
                    // When isolated, only select images that are in the isolation set
                    const isoSet = isolatedImageIds !== null ? new Set(isolatedImageIds) : null;
                    const selectableIds = group.image_ids.filter(id =>
                      visibleImageIds.has(id) && (isoSet === null || isoSet.has(id))
                    );
                    const isBatchHidden = hiddenBatchIds.has(group.id);
                    return (
                      <div
                        key={group.id}
                        className={`drawer-group${isBatchHidden ? ' batch-hidden' : ''}`}
                        onClick={() => useAppStore.getState().toggleBatchVisibility(group.id)}
                        title={isBatchHidden ? 'Click to show batch' : (group.prompt || 'Click to hide batch')}
                      >
                        {thumbnailImage && visibleImageIds.has(thumbnailImage.id) ? (
                          <img
                            className="group-thumb-bg"
                            src={`data:image/png;base64,${thumbnailImage.base64_image}`}
                            alt=""
                          />
                        ) : (
                          <div className="group-thumb-placeholder" />
                        )}
                        <div className="group-overlay">
                          <div className="group-overlay-top">
                            <span className="group-type-badge">
                              {group.type?.toUpperCase() ?? 'BATCH'}
                            </span>
                            <span className="group-count">
                              {selectableIds.length}
                              {someDeleted
                                ? ` (−${group.image_ids.filter(id => !visibleImageIds.has(id)).length})`
                                : ''}
                            </span>
                          </div>
                          <div className="group-overlay-bottom">
                            {group.prompt && (
                              <span className="group-prompt">{group.prompt}</span>
                            )}
                            <span className="group-time">
                              {new Date(group.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>
                        {someDeleted && (
                          <span
                            className="group-deleted-dot"
                            title="Some images deleted"
                          />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>


        </div>
      )}
    </div>
  );
};
