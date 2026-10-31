import type { Point } from '../core/types';
import { WITCH_SCENE_DURATION_MS } from '../core/types';
import { pointAlongPath, polylineLength } from './path';

export interface WitchPose {
  position: Point;
  scale: number;
  alpha: number;
  angle: number;
  flap: number;
  waving: boolean;
}

function pathAngle(path: Point[], t: number): number {
  if (path.length < 2) return 0;
  const total = polylineLength(path) || 1;
  const dist = Math.min(0.99, Math.max(0, t)) * total;
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    const seg = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    if (walked + seg >= dist || i === path.length - 1) {
      return Math.atan2(path[i].y - path[i - 1].y, path[i].x - path[i - 1].x);
    }
    walked += seg;
  }
  return 0;
}

/** Witch flies along the path on a broom; slight bob and cape flap. */
export function sampleWitchPose(
  path: Point[],
  elapsedMs: number,
  durationMs = WITCH_SCENE_DURATION_MS,
): WitchPose | null {
  if (durationMs <= 0 || elapsedMs < 0 || elapsedMs > durationMs) return null;
  if (path.length === 0) return null;

  const t = elapsedMs / durationMs;
  let alpha = 1;
  let scale = 1;
  let pathT = 0;
  let waving = false;

  if (t < 0.1) {
    const u = t / 0.1;
    alpha = u;
    scale = 0.7 + 0.3 * u;
    pathT = 0;
  } else if (t < 0.7) {
    pathT = (t - 0.1) / 0.6;
  } else if (t < 0.82) {
    pathT = 1;
    waving = true;
    scale = 1.05;
  } else {
    pathT = 1;
    const u = (t - 0.82) / 0.18;
    alpha = 1 - u;
    scale = 1.05 - 0.25 * u;
  }

  const base = pointAlongPath(path, pathT);
  const bob = Math.sin(elapsedMs / 160) * 10;
  const angle = pathAngle(path, pathT) * 0.85 + Math.sin(elapsedMs / 220) * 0.05;
  return {
    position: { x: base.x, y: base.y + bob },
    scale,
    alpha,
    angle,
    flap: Math.sin(elapsedMs / 90),
    waving,
  };
}

export function witchAccentAt(durationMs: number): number {
  return durationMs * 0.7;
}

export function drawWitch(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  pose: WitchPose,
): void {
  const { position: p, scale, alpha, angle, flap, waving } = pose;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;

  // Broom stick
  ctx.strokeStyle = '#8b5a2b';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-48, 8);
  ctx.lineTo(36, 4);
  ctx.stroke();

  // Bristles
  ctx.strokeStyle = '#c4a35a';
  ctx.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    const y = 2 + (i - 3) * 3 + flap * (i % 2 === 0 ? 2 : -2);
    ctx.beginPath();
    ctx.moveTo(28, 4);
    ctx.lineTo(48 + Math.abs(flap) * 2, y);
    ctx.stroke();
  }

  // Cape
  ctx.fillStyle = 'rgba(55, 30, 90, 0.85)';
  ctx.beginPath();
  ctx.moveTo(-4, -4);
  ctx.quadraticCurveTo(-18 - flap * 6, 10, -22 - flap * 8, 28);
  ctx.quadraticCurveTo(-8, 18, 2, 8);
  ctx.closePath();
  ctx.fill();

  // Body / dress
  ctx.fillStyle = '#2c1848';
  ctx.beginPath();
  ctx.moveTo(-6, -8);
  ctx.lineTo(10, -6);
  ctx.lineTo(8, 18);
  ctx.lineTo(-10, 20);
  ctx.closePath();
  ctx.fill();

  // Head
  ctx.fillStyle = '#e8c4a8';
  ctx.beginPath();
  ctx.arc(2, -16, 9, 0, Math.PI * 2);
  ctx.fill();

  // Hat
  ctx.fillStyle = '#1a1028';
  ctx.beginPath();
  ctx.moveTo(-12, -18);
  ctx.lineTo(16, -16);
  ctx.lineTo(14, -20);
  ctx.lineTo(4, -38);
  ctx.lineTo(-2, -20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#6b3fa0';
  ctx.fillRect(-10, -20, 22, 4);

  // Eyes / smile
  ctx.fillStyle = '#1a1028';
  ctx.beginPath();
  ctx.arc(-1, -17, 1.4, 0, Math.PI * 2);
  ctx.arc(5, -16, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1a1028';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(2, -13, 3, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  // Wave
  if (waving) {
    ctx.strokeStyle = '#e8c4a8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(10, -2);
    ctx.quadraticCurveTo(22, -10 + flap * 4, 28, -4 + flap * 6);
    ctx.stroke();
  }

  // Soft trail sparkles
  ctx.globalAlpha = alpha * 0.4;
  ctx.fillStyle = '#d4b4ff';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(-30 - i * 10, 6 + flap * i * 2, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
