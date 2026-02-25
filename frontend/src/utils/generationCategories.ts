/**
 * Shared generation category utility.
 * Maps raw generation_method values → 4 display categories for lineage tree, minimap, and DI blobs.
 */

export type DisplayCategory = 'ref_image' | 'ref_shoe' | 'user' | 'agent';

export function getDisplayCategory(method: string): DisplayCategory {
  switch (method) {
    case 'external':        return 'ref_image';
    case 'dataset':         return 'ref_shoe';
    case 'batch':
    case 'reference':
    case 'interpolation':   return 'user';
    case 'agent':
    case 'auto-variation':  return 'agent';
    default:                return 'user';
  }
}

export const CATEGORY_COLORS: Record<DisplayCategory, string> = {
  ref_image: '#f97316',   // orange
  ref_shoe:  '#e8a020',   // amber
  user:      '#22c55e',   // green
  agent:     '#a855f7',   // purple
};

export const CATEGORY_LABELS: Record<DisplayCategory, string> = {
  ref_image: 'Ref Image',
  ref_shoe:  'Ref Shoe',
  user:      'User Generated',
  agent:     'Agent Generated',
};

/**
 * Realm-aware display label for lineage tree and inspector.
 * Combines generation_method + realm for richer context:
 *   shoe + user → "User Shoe", mood-board + agent → "Agent Board", etc.
 */
export function getRealmAwareLabel(method: string, realm?: string): string {
  const cat = getDisplayCategory(method);
  if (cat === 'ref_image') return 'Ref Image';
  if (cat === 'ref_shoe') return 'Ref Shoe';
  const isMoodBoard = realm === 'mood-board';
  if (cat === 'user') return isMoodBoard ? 'User Board' : 'User Shoe';
  if (cat === 'agent') return isMoodBoard ? 'Agent Board' : 'Agent Shoe';
  return isMoodBoard ? 'Board' : 'Shoe';
}

export function getCategoryColor(method: string): string {
  return CATEGORY_COLORS[getDisplayCategory(method)];
}
