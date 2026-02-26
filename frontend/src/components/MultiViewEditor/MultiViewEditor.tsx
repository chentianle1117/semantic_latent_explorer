/**
 * Multi-View Editor — focused editing UI for all views of a shoe concept.
 *
 * 3×3 grid layout matching wireframe:
 *   Row 1: medial    | top     | front
 *   Row 2: 3/4-front | side    | back
 *   Row 3: 3/4-back  | outsole | (info)
 *
 * Images are rendered at a consistent uniform scale inside each cell.
 * The cells act as containers — images are centered with object-fit: contain.
 */

import React from 'react';
import type { ImageData, ShoeViewType } from '../../types';
import { SHOE_VIEW_LABELS } from '../../api/falClient';
import { useMultiViewState, type ViewDimensions } from './useMultiViewState';
import { ALL_VIEWS } from './propagationOrder';
import { AIDesignAssistant } from './AIDesignAssistant';
import './MultiViewEditor.css';

interface MultiViewEditorProps {
  sideViewImage: ImageData;
  satelliteViews: ImageData[];
  onClose: () => void;
  onSave: (updatedViews: Record<ShoeViewType, ImageData | null>) => void;
}

/** Grid area name for each view type */
const VIEW_GRID_AREA: Record<ShoeViewType, string> = {
  'medial': 'medial',
  'top': 'top',
  'front': 'front',
  '3/4-front': 'qfront',
  'side': 'side',
  'back': 'back',
  '3/4-back': 'qback',
  'outsole': 'outsole',
};

const ViewSlot: React.FC<{
  viewType: ShoeViewType;
  image: ImageData | null;
  dims: ViewDimensions | undefined;
  scale: number;
  isUpdating: boolean;
}> = ({ viewType, image, dims, scale, isUpdating }) => {
  const label = SHOE_VIEW_LABELS[viewType] || viewType;
  const classes = [
    'mve-slot',
    isUpdating && 'mve-slot--updating',
    !image && 'mve-slot--empty',
  ].filter(Boolean).join(' ');

  // Image dimensions at uniform scale (the image itself, not the cell)
  const imgW = dims ? Math.round(dims.w * scale) : undefined;
  const imgH = dims ? Math.round(dims.h * scale) : undefined;

  return (
    <div
      className={classes}
      style={{ gridArea: VIEW_GRID_AREA[viewType] }}
    >
      <span className="mve-slot-label">{label}</span>
      {image ? (
        <>
          <img
            src={`data:image/png;base64,${image.base64_image}`}
            alt={label}
            className="mve-slot-img"
            style={imgW && imgH ? { width: imgW, height: imgH } : undefined}
            draggable={false}
          />
          {isUpdating && (
            <div className="mve-slot-updating-overlay">
              <div className="mve-spinner" />
            </div>
          )}
        </>
      ) : (
        <span className="mve-slot-empty-label">No view</span>
      )}
    </div>
  );
};

export const MultiViewEditor: React.FC<MultiViewEditorProps> = ({
  sideViewImage,
  satelliteViews,
  onClose,
  onSave,
}) => {
  const state = useMultiViewState(sideViewImage, satelliteViews);

  const {
    viewImages,
    viewDims,
    displayScale,
    editPrompt,
    setEditPrompt,
    isUpdating,
    history,
    revertToSnapshot,
    handleUpdate,
    isBusy,
    progressLabel,
  } = state;

  const filledCount = ALL_VIEWS.filter(v => viewImages[v] !== null).length;

  const handleSave = () => {
    onSave(viewImages);
  };

  return (
    <div className="mve-overlay">
      {/* Header */}
      <div className="mve-header">
        <span className="mve-title">Multi-View Editor</span>
        <span className="mve-shoe-id">#{sideViewImage.id}</span>
        <span className="mve-view-count">{filledCount} of {ALL_VIEWS.length} views</span>
        <div className="mve-header-spacer" />
        <button
          className="mve-btn-done"
          onClick={handleSave}
          disabled={isBusy}
        >
          Done
        </button>
        <button className="mve-btn-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>

      {/* Body: condensed grid (left) + AI panel (right) */}
      <div className="mve-body">
        <div className="mve-view-section">
          <div className="mve-view-grid" style={{ opacity: displayScale > 0 ? 1 : 0, transition: 'opacity 0.15s ease-in' }}>
            {ALL_VIEWS.map((view) => (
              <ViewSlot
                key={view}
                viewType={view}
                image={viewImages[view]}
                dims={viewDims[view]}
                scale={displayScale}
                isUpdating={!!isUpdating[view]}
              />
            ))}

            {/* Bottom-right info cell */}
            <div className="mve-info-cell">
              <span className="mve-info-cell-label">Views</span>
              <span className="mve-info-cell-count">{filledCount}</span>
              <span className="mve-info-cell-sub">of {ALL_VIEWS.length}</span>
            </div>
          </div>
        </div>

        {/* AI Design Assistant panel (right) */}
        <AIDesignAssistant
          viewImages={viewImages}
          editPrompt={editPrompt}
          setEditPrompt={setEditPrompt}
          onUpdate={handleUpdate}
          isBusy={isBusy}
          progressLabel={progressLabel}
          sideViewImage={sideViewImage}
          history={history}
          onRevert={revertToSnapshot}
        />
      </div>
    </div>
  );
};
