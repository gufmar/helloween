import type { Point } from './types';

/** Letterboxed mapping from logical projection space to a canvas/window. */
export interface ViewportTransform {
  logicalWidth: number;
  logicalHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  contentWidth: number;
  contentHeight: number;
}

export function createViewportTransform(
  logicalWidth: number,
  logicalHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): ViewportTransform {
  if (logicalWidth <= 0 || logicalHeight <= 0 || canvasWidth <= 0 || canvasHeight <= 0) {
    return {
      logicalWidth,
      logicalHeight,
      canvasWidth,
      canvasHeight,
      scale: 0,
      offsetX: 0,
      offsetY: 0,
      contentWidth: 0,
      contentHeight: 0,
    };
  }

  const scale = Math.min(canvasWidth / logicalWidth, canvasHeight / logicalHeight);
  const contentWidth = logicalWidth * scale;
  const contentHeight = logicalHeight * scale;
  const offsetX = (canvasWidth - contentWidth) / 2;
  const offsetY = (canvasHeight - contentHeight) / 2;

  return {
    logicalWidth,
    logicalHeight,
    canvasWidth,
    canvasHeight,
    scale,
    offsetX,
    offsetY,
    contentWidth,
    contentHeight,
  };
}

export function logicalToCanvas(p: Point, vp: ViewportTransform): Point {
  return {
    x: vp.offsetX + p.x * vp.scale,
    y: vp.offsetY + p.y * vp.scale,
  };
}

export function canvasToLogical(p: Point, vp: ViewportTransform): Point {
  if (vp.scale === 0) return { x: 0, y: 0 };
  return {
    x: (p.x - vp.offsetX) / vp.scale,
    y: (p.y - vp.offsetY) / vp.scale,
  };
}

/** True if the canvas point lies inside the letterboxed content area. */
export function isInsideContent(p: Point, vp: ViewportTransform): boolean {
  return (
    p.x >= vp.offsetX &&
    p.x <= vp.offsetX + vp.contentWidth &&
    p.y >= vp.offsetY &&
    p.y <= vp.offsetY + vp.contentHeight
  );
}

export function clampLogical(p: Point, width: number, height: number): Point {
  return {
    x: Math.min(width, Math.max(0, p.x)),
    y: Math.min(height, Math.max(0, p.y)),
  };
}

export function aspectRatio(width: number, height: number): number {
  return height === 0 ? 0 : width / height;
}

/** Distance from point to segment AB. */
export function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.min(1, Math.max(0, t));
  const qx = a.x + t * dx;
  const qy = a.y + t * dy;
  return Math.hypot(p.x - qx, p.y - qy);
}
