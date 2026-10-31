import type { Point, Polygon, ProjectDocument } from './types';

/** Expand a closed polygon roughly outward by `padding` logical pixels. */
export function expandPolygon(points: Point[], padding: number): Point[] {
  if (points.length < 3 || padding === 0) {
    return points.map((p) => ({ x: p.x, y: p.y }));
  }

  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;

  return points.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: p.x + (dx / len) * padding,
      y: p.y + (dy / len) * padding,
    };
  });
}

export function pathFromPoints(ctx: CanvasRenderingContext2D, points: Point[]): void {
  if (points.length === 0) return;
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
}

/**
 * Build an alpha mask: white = show allowed, transparent = hide.
 * Excludes always win; padding expands excludes.
 */
export function buildMaskCanvas(
  doc: ProjectDocument,
  width: number,
  height: number,
  target?: HTMLCanvasElement | OffscreenCanvas,
): HTMLCanvasElement | OffscreenCanvas {
  const canvas =
    target ??
    (typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height }));

  if ('width' in canvas) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) return canvas;

  ctx.clearRect(0, 0, width, height);

  const walls = doc.polygons.filter((p) => p.kind === 'wall' && p.closed && p.points.length >= 3);
  if (walls.length === 0) {
    return canvas;
  }

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (const wall of walls) {
    pathFromPoints(ctx as CanvasRenderingContext2D, wall.points);
  }
  ctx.fill('nonzero');

  const excludes = doc.polygons.filter(
    (p) => p.kind === 'exclude' && p.closed && p.points.length >= 3,
  );
  if (excludes.length > 0) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#ffffff';
    for (const ex of excludes) {
      const pts = expandPolygon(ex.points, doc.meta.excludePadding);
      ctx.beginPath();
      pathFromPoints(ctx as CanvasRenderingContext2D, pts);
      ctx.fill('nonzero');
      // Extra stroke thickens the cutout for irregular shapes.
      if (doc.meta.excludePadding > 0) {
        (ctx as CanvasRenderingContext2D).lineWidth = doc.meta.excludePadding * 2;
        (ctx as CanvasRenderingContext2D).strokeStyle = '#ffffff';
        (ctx as CanvasRenderingContext2D).stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  return canvas;
}

/** Apply mask as final step onto a fully composed logical-size frame. */
export function applyMaskToFrame(
  frameCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  doc: ProjectDocument,
): void {
  const { logicalWidth: w, logicalHeight: h } = doc.meta;
  const walls = doc.polygons.filter((p) => p.kind === 'wall' && p.closed && p.points.length >= 3);
  if (walls.length === 0) {
    frameCtx.save();
    frameCtx.globalCompositeOperation = 'destination-in';
    frameCtx.clearRect(0, 0, w, h);
    frameCtx.restore();
    // Clear everything: no wall => fully black show output.
    frameCtx.clearRect(0, 0, w, h);
    return;
  }

  const mask = buildMaskCanvas(doc, w, h);
  frameCtx.save();
  frameCtx.globalCompositeOperation = 'destination-in';
  frameCtx.drawImage(mask as CanvasImageSource, 0, 0);
  frameCtx.restore();
}

export function polygonCentroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

export function findPolygonAt(
  polygons: Polygon[],
  point: Point,
  preferKind?: Polygon['kind'],
): Polygon | null {
  const ordered = preferKind
    ? [...polygons].sort((a, b) => Number(b.kind === preferKind) - Number(a.kind === preferKind))
    : polygons;
  for (let i = ordered.length - 1; i >= 0; i--) {
    const poly = ordered[i];
    if (poly.points.length >= 3 && pointInPolygon(point, poly.points)) {
      return poly;
    }
  }
  return null;
}

export function pointInPolygon(point: Point, vs: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x;
    const yi = vs[i].y;
    const xj = vs[j].x;
    const yj = vs[j].y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
