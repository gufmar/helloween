import type { Point } from '../core/types';
import { DEFAULT_SCENE_DURATION_MS } from '../core/types';
import { pointAlongPath } from './path';

/** Transparent SimReady preview sprite (CC BY 4.0, NVIDIA). */
export const PHANTOM_MASK_SRC = '/media/figures/phantom-mask.png';

export interface PhantomMaskPose {
  position: Point;
  scale: number;
  alpha: number;
  wobble: number;
  /** Radians; slight turn while floating. */
  angle: number;
}

const sprite = typeof Image !== 'undefined' ? new Image() : null;
let loadFailed = false;

function beginSpriteLoad(): void {
  if (!sprite) return;
  loadFailed = false;
  sprite.decoding = 'async';
  // Bust stale 404 cache from the earlier wrong public/ path.
  sprite.src = `${PHANTOM_MASK_SRC}?v=2`;
}

if (sprite) {
  sprite.addEventListener('error', () => {
    loadFailed = true;
  });
  beginSpriteLoad();
}

export function phantomMaskImageReady(): boolean {
  return Boolean(sprite && !loadFailed && sprite.complete && sprite.naturalWidth > 0);
}

/** Call from the render loop so a late-ready sprite still paints next frames. */
export function ensurePhantomMaskLoaded(): void {
  if (!sprite) return;
  if (phantomMaskImageReady()) return;
  if (!sprite.src || loadFailed) beginSpriteLoad();
}

/**
 * Venetian-style phantom mask drifts along a path (sprite billboard).
 * Uses the SimReady transparent thumb until we bake a lighter GLB path.
 */
export function samplePhantomMaskPose(
  path: Point[],
  elapsedMs: number,
  durationMs = DEFAULT_SCENE_DURATION_MS,
): PhantomMaskPose | null {
  if (durationMs <= 0 || elapsedMs < 0 || elapsedMs > durationMs) return null;
  if (path.length === 0) return null;

  const t = elapsedMs / durationMs;
  let alpha = 1;
  let scale = 1;
  let pathT = 0;

  if (t < 0.12) {
    const u = t / 0.12;
    alpha = u;
    scale = 0.55 + 0.45 * u;
    pathT = 0;
  } else if (t < 0.78) {
    pathT = (t - 0.12) / 0.66;
    alpha = 1;
    scale = 1;
  } else if (t < 0.88) {
    pathT = 1;
    alpha = 1;
    scale = 1.12;
  } else {
    pathT = 1;
    const u = (t - 0.88) / 0.12;
    alpha = 1 - u;
    scale = 1.12 - 0.35 * u;
  }

  const base = pointAlongPath(path, pathT);
  const wobble = Math.sin(elapsedMs / 200) * 8;
  const angle = Math.sin(elapsedMs / 900) * 0.18;
  return {
    position: { x: base.x + wobble * 0.2, y: base.y + wobble * 0.35 },
    scale,
    alpha,
    wobble,
    angle,
  };
}

export function phantomMaskAccentAt(durationMs: number): number {
  return durationMs * 0.78;
}

export function drawPhantomMask(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  pose: PhantomMaskPose,
): void {
  ensurePhantomMaskLoaded();
  if (!sprite || !phantomMaskImageReady()) return;

  const { position: p, scale, alpha, angle } = pose;
  // Logical size on 1920×1080 facade; mask reads clearly from the street.
  const drawH = 220 * scale;
  const aspect = sprite.naturalWidth / sprite.naturalHeight;
  const drawW = drawH * aspect;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  ctx.drawImage(sprite, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}
