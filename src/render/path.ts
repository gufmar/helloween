import type { Point } from '../core/types';

export function polylineLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

/** t in [0,1] along the polyline. */
export function pointAlongPath(points: Point[], t: number): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { ...points[0] };
  const total = polylineLength(points);
  if (total === 0) return { ...points[0] };
  let dist = Math.min(1, Math.max(0, t)) * total;
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (dist <= seg || i === points.length - 1) {
      const u = seg === 0 ? 0 : dist / seg;
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * u,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * u,
      };
    }
    dist -= seg;
  }
  return { ...points[points.length - 1] };
}
