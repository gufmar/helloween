import type { Point } from '../core/types';
import { PUMPKIN_SCENE_DURATION_MS } from '../core/types';
import { pointAlongPath } from './path';

export interface PumpkinPose {
  position: Point;
  scale: number;
  alpha: number;
  bounce: number;
  squash: number;
  wink: boolean;
  tilt: number;
}

/** Friendly pumpkin hops along a ledge-style path. */
export function samplePumpkinPose(
  path: Point[],
  elapsedMs: number,
  durationMs = PUMPKIN_SCENE_DURATION_MS,
): PumpkinPose | null {
  if (durationMs <= 0 || elapsedMs < 0 || elapsedMs > durationMs) return null;
  if (path.length === 0) return null;

  const t = elapsedMs / durationMs;
  let alpha = 1;
  let scale = 1;
  let pathT = 0;
  let wink = false;
  let squash = 1;

  if (t < 0.1) {
    const u = t / 0.1;
    alpha = u;
    scale = 0.5 + 0.5 * u;
    pathT = 0;
  } else if (t < 0.75) {
    pathT = (t - 0.1) / 0.65;
    // Hop cycles along the path
    const hops = pathT * 6 * Math.PI;
    const hop = Math.abs(Math.sin(hops));
    squash = 1 - hop * 0.12;
    scale = 1 + hop * 0.06;
  } else if (t < 0.88) {
    pathT = 1;
    wink = true;
    scale = 1.08;
  } else {
    pathT = 1;
    wink = true;
    const u = (t - 0.88) / 0.12;
    alpha = 1 - u;
    scale = 1.08 - 0.2 * u;
  }

  const base = pointAlongPath(path, pathT);
  const hops = pathT * 6 * Math.PI;
  const bounce = t >= 0.1 && t < 0.75 ? Math.abs(Math.sin(hops)) * 28 : 0;
  const tilt = t >= 0.1 && t < 0.75 ? Math.sin(hops) * 0.12 : wink ? -0.08 : 0;

  return {
    position: { x: base.x, y: base.y - bounce },
    scale,
    alpha,
    bounce,
    squash,
    wink,
    tilt,
  };
}

export function pumpkinAccentAt(durationMs: number): number {
  return durationMs * 0.75;
}

export function drawPumpkin(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  pose: PumpkinPose,
): void {
  const { position: p, scale, alpha, squash, wink, tilt } = pose;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(tilt);
  ctx.scale(scale, scale * squash);
  ctx.globalAlpha = alpha;

  // Body lobes
  ctx.fillStyle = '#e8892a';
  ctx.beginPath();
  ctx.ellipse(0, 4, 34, 28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d4781f';
  for (const ox of [-18, -6, 6, 18]) {
    ctx.beginPath();
    ctx.ellipse(ox, 4, 10, 26, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255, 210, 140, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 4, 34, 28, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Stem
  ctx.fillStyle = '#3d6b2e';
  ctx.beginPath();
  ctx.moveTo(-4, -24);
  ctx.quadraticCurveTo(0, -36, 6, -28);
  ctx.lineTo(4, -22);
  ctx.quadraticCurveTo(0, -26, -4, -24);
  ctx.fill();

  // Face
  ctx.fillStyle = '#2a1808';
  // Eyes
  ctx.beginPath();
  ctx.moveTo(-14, -6);
  ctx.lineTo(-6, 2);
  ctx.lineTo(-18, 2);
  ctx.closePath();
  ctx.fill();
  if (wink) {
    ctx.strokeStyle = '#2a1808';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(8, -2);
    ctx.quadraticCurveTo(14, 2, 20, -4);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(14, -6);
    ctx.lineTo(6, 2);
    ctx.lineTo(18, 2);
    ctx.closePath();
    ctx.fill();
  }
  // Nose
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(-5, 10);
  ctx.lineTo(5, 10);
  ctx.closePath();
  ctx.fill();
  // Mouth
  ctx.beginPath();
  ctx.moveTo(-16, 14);
  ctx.quadraticCurveTo(0, 28, 16, 14);
  ctx.lineTo(10, 14);
  ctx.quadraticCurveTo(0, 22, -10, 14);
  ctx.closePath();
  ctx.fill();
  // Glow in mouth/eyes
  ctx.globalAlpha = alpha * 0.35;
  ctx.fillStyle = '#ffe08a';
  ctx.beginPath();
  ctx.ellipse(0, 16, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
