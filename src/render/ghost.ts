import type { Point } from '../core/types';
import { DEFAULT_SCENE_DURATION_MS } from '../core/types';
import { pointAlongPath } from './path';

export type GhostStyle = 'friendly' | 'spooky';

export interface GhostPose {
  position: Point;
  scale: number;
  alpha: number;
  wiggle: number;
  /** Smile vs startled “O” mouth. */
  startled: boolean;
  style: GhostStyle;
}

/** Time-based ghost pose. Duration defaults to 10s. */
export function sampleGhostPose(
  path: Point[],
  elapsedMs: number,
  durationMs = DEFAULT_SCENE_DURATION_MS,
  style: GhostStyle = 'friendly',
): GhostPose | null {
  if (durationMs <= 0 || elapsedMs < 0 || elapsedMs > durationMs) return null;

  const t = elapsedMs / durationMs;
  // 0-0.12 appear, 0.12-0.72 move (alternating face), 0.72-0.82 boo, 0.82-1.0 fade
  let alpha = 1;
  let scale = 1;
  let startled = false;
  let pathT = 0;
  const maxAlpha = style === 'spooky' ? 0.58 : 1;

  if (t < 0.12) {
    const u = t / 0.12;
    alpha = u * maxAlpha;
    scale = 0.6 + 0.4 * u;
    pathT = 0;
    startled = style === 'spooky';
  } else if (t < 0.72) {
    pathT = (t - 0.12) / 0.6;
    alpha = maxAlpha;
    scale = 1;
    if (style === 'spooky') {
      // Mostly eerie; brief friendlier blink rarely
      startled = Math.floor(elapsedMs / 900) % 3 !== 1;
    } else {
      startled = Math.floor(elapsedMs / 1100) % 2 === 1;
    }
  } else if (t < 0.82) {
    pathT = 1;
    startled = true;
    alpha = maxAlpha;
    scale = style === 'spooky' ? 1.25 : 1.15;
  } else {
    pathT = 1;
    startled = true;
    const u = (t - 0.82) / 0.18;
    alpha = maxAlpha * (1 - u);
    scale = (style === 'spooky' ? 1.25 : 1.15) - 0.4 * u;
  }

  const base = pointAlongPath(path, pathT);
  const wiggleAmp = style === 'spooky' ? 10 : 6;
  const wiggle = Math.sin(elapsedMs / (style === 'spooky' ? 140 : 180)) * wiggleAmp;
  return {
    position: { x: base.x, y: base.y + wiggle * 0.35 },
    scale,
    alpha,
    wiggle,
    startled,
    style,
  };
}

export function ghostAccentAt(durationMs: number): number {
  return durationMs * 0.72;
}

export function drawGhost(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  pose: GhostPose,
): void {
  const { position: p, scale, alpha, wiggle, startled, style } = pose;
  const spooky = style === 'spooky';
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;

  const bodyW = spooky ? 60 : 56;
  const bodyH = spooky ? 78 : 72;

  ctx.beginPath();
  ctx.moveTo(-bodyW / 2, 10);
  ctx.bezierCurveTo(-bodyW / 2, -bodyH / 2, bodyW / 2, -bodyH / 2, bodyW / 2, 10);
  const waves = spooky ? 5 : 4;
  for (let i = waves; i >= 0; i--) {
    const x = -bodyW / 2 + (bodyW * i) / waves;
    const y =
      10 +
      Math.sin(i + wiggle * 0.15) * (spooky ? 11 : 8) +
      (i % 2 === 0 ? 12 : 0);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = spooky ? 'rgba(160, 220, 170, 0.85)' : 'rgba(245, 248, 255, 0.92)';
  ctx.fill();
  ctx.strokeStyle = spooky ? 'rgba(80, 140, 100, 0.7)' : 'rgba(180, 200, 230, 0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Eyes
  const eyeY = spooky ? -20 : -18;
  const eyeSpread = startled ? 14 : 12;
  const eyeR = startled ? (spooky ? 8 : 7) : spooky ? 6 : 5;
  if (spooky) {
    ctx.fillStyle = 'rgba(20, 40, 28, 0.95)';
    ctx.beginPath();
    ctx.ellipse(-eyeSpread, eyeY, eyeR, eyeR * 1.35, 0, 0, Math.PI * 2);
    ctx.ellipse(eyeSpread, eyeY, eyeR, eyeR * 1.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7dff9a';
    ctx.beginPath();
    ctx.arc(-eyeSpread, eyeY + 1, 2, 0, Math.PI * 2);
    ctx.arc(eyeSpread, eyeY + 1, 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#1a2433';
    ctx.beginPath();
    ctx.arc(-eyeSpread, eyeY, eyeR, 0, Math.PI * 2);
    ctx.arc(eyeSpread, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.beginPath();
  if (startled) {
    ctx.fillStyle = spooky ? 'rgba(20, 40, 28, 0.95)' : '#1a2433';
    ctx.arc(0, spooky ? 4 : 2, spooky ? 12 : 10, 0, Math.PI * 2);
    ctx.fill();
    if (spooky) {
      ctx.strokeStyle = '#7dff9a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = spooky ? 'rgba(20, 40, 28, 0.95)' : '#1a2433';
    ctx.lineWidth = 2;
    ctx.arc(0, 4, 8, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  ctx.restore();
}
