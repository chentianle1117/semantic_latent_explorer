/**
 * Template PNG loader for multi-view generation.
 * Loads wireframe template images from /templates/ and caches them as data URLs
 * for upload to fal.ai as positional reference images.
 */

let multiViewCache: string | null = null;
let quarterViewCache: string | null = null;

function loadAsDataUrl(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error(`Failed to load template: ${path}`));
    img.src = path;
  });
}

/** Load and cache the 5-view multi-view template as a data URL */
export async function getMultiViewTemplate(): Promise<string> {
  if (multiViewCache) return multiViewCache;
  multiViewCache = await loadAsDataUrl('/templates/multi-view_template.png');
  return multiViewCache;
}

/** Load and cache the 2-view 3/4-view template as a data URL */
export async function getQuarterViewTemplate(): Promise<string> {
  if (quarterViewCache) return quarterViewCache;
  quarterViewCache = await loadAsDataUrl('/templates/34_view_template.png');
  return quarterViewCache;
}
