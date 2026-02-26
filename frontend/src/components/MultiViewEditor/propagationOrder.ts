/**
 * View adjacency map for smart propagation.
 * For each view, lists neighboring views in order of visual angle similarity.
 */

import type { ShoeViewType } from '../../types';

export const ALL_VIEWS: ShoeViewType[] = ['side', '3/4-front', '3/4-back', 'top', 'outsole', 'medial', 'front', 'back'];

const VIEW_ADJACENCY: Record<ShoeViewType, ShoeViewType[]> = {
  'side':       ['3/4-front', '3/4-back', 'front', 'back', 'top', 'medial', 'outsole'],
  '3/4-front':  ['side', 'front', '3/4-back', 'top', 'medial', 'back', 'outsole'],
  '3/4-back':   ['side', 'back', '3/4-front', 'top', 'medial', 'front', 'outsole'],
  'front':      ['3/4-front', 'side', 'top', '3/4-back', 'medial', 'back', 'outsole'],
  'back':       ['3/4-back', 'side', 'top', '3/4-front', 'medial', 'front', 'outsole'],
  'top':        ['3/4-front', '3/4-back', 'front', 'side', 'back', 'medial', 'outsole'],
  'outsole':    ['top', 'front', 'back', 'medial', 'side', '3/4-front', '3/4-back'],
  'medial':     ['3/4-back', '3/4-front', 'side', 'front', 'back', 'top', 'outsole'],
};

/**
 * Returns the propagation order for updating other views after editing one.
 * Only includes views that are NOT the edited view.
 */
export function getPropagationOrder(editedView: ShoeViewType): ShoeViewType[] {
  return VIEW_ADJACENCY[editedView] || [];
}
