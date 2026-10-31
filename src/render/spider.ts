import type { Point } from '../core/types';
import { SPIDER_SCENE_DURATION_MS } from '../core/types';
import { pointAlongPath } from './path';

export interface SpiderPose {
  position: Point;
  /** Anchor at top of thread (path start / web center). */
  threadFrom: Point;
  scale: number;
  alpha: number;
  wave: number;
  waving: boolean;
  /** 0..1 how visible the nest web is. */
  webAlpha: number;
  /** Phase for walking leg animation. */
  legPhase: number;
}

/**
 * Friendly spider: emerge from a small web, descend, wave, climb back.
 * Prefer a nearly vertical path so the thread looks right.
 */
export function sampleSpiderPose(
  path: Point[],
  elapsedMs: number,
  durationMs = SPIDER_SCENE_DURATION_MS,
): SpiderPose | null {
  if (durationMs <= 0 || elapsedMs < 0 || elapsedMs > durationMs) return null;
  if (path.length === 0) return null;

  const t = elapsedMs / durationMs;
  const threadFrom = { ...path[0] };
  let alpha = 1;
  let scale = 1;
  let pathT = 0;
  let waving = false;
  let webAlpha = 1;

  // Slower timing: appear in web, long descend, wave, long climb, fade
  if (t < 0.08) {
    const u = t / 0.08;
    alpha = u;
    scale = 0.5 + 0.5 * u;
    pathT = 0;
    webAlpha = 0.35 + 0.65 * u;
  } else if (t < 0.48) {
    pathT = (t - 0.08) / 0.4;
    alpha = 1;
    webAlpha = 1;
  } else if (t < 0.62) {
    pathT = 1;
    waving = true;
    scale = 1 + Math.sin(((t - 0.48) / 0.14) * Math.PI * 4) * 0.08;
    webAlpha = 1;
  } else if (t < 0.92) {
    pathT = 1 - (t - 0.62) / 0.3;
    alpha = 1;
    webAlpha = 0.85;
  } else {
    pathT = 0;
    const u = (t - 0.92) / 0.08;
    alpha = 1 - u;
    scale = 1 - 0.25 * u;
    webAlpha = 1 - u;
  }

  const base = pointAlongPath(path, pathT);
  const bob = waving ? Math.sin(elapsedMs / 90) * 4 : Math.sin(elapsedMs / 220) * 2;
  return {
    position: { x: base.x + bob * 0.25, y: base.y },
    threadFrom,
    scale,
    alpha,
    wave: bob,
    waving,
    webAlpha,
    legPhase: elapsedMs / 140,
  };
}

export function spiderAccentAt(durationMs: number): number {
  return durationMs * 0.48;
}

function drawWeb(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  cx: number,
  cy: number,
  alpha: number,
): void {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha = alpha * 0.85;
  ctx.strokeStyle = 'rgba(230, 220, 200, 0.75)';
  ctx.lineWidth = 1.2;

  const rays = 8;
  const r = 28;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.stroke();
  }
  for (const ring of [10, 18, 26]) {
    ctx.beginPath();
    for (let i = 0; i <= rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const x = Math.cos(a) * ring;
      const y = Math.sin(a) * ring;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function drawSpider(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  pose: SpiderPose,
): void {
  const { position: p, threadFrom, scale, alpha, wave, waving, webAlpha, legPhase } = pose;
  ctx.save();

  drawWeb(ctx, threadFrom.x, threadFrom.y, webAlpha * alpha);

  // Thread
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(threadFrom.x, threadFrom.y);
  ctx.lineTo(p.x, p.y - 8 * scale);
  ctx.strokeStyle = 'rgba(235, 225, 200, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.translate(p.x, p.y);
  ctx.scale(scale, scale);

  // Legs: light outline then warm brown for contrast on dark facade
  const legSpread = waving ? 1.12 : 1;
  const walk = waving ? 0 : Math.sin(legPhase) * 5;
  for (const pass of ['outline', 'fill'] as const) {
    ctx.strokeStyle = pass === 'outline' ? 'rgba(255, 230, 190, 0.55)' : '#c49a6c';
    ctx.lineWidth = pass === 'outline' ? 4.5 : 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const a = (i - 1.5) * 0.38;
        const len = 24 + i * 2;
        const stride = Math.sin(legPhase + i * 0.9 + (side > 0 ? 0 : Math.PI)) * (waving ? 3 : 6);
        const wobble = waving ? Math.sin(wave * 0.4 + i) * 5 : walk * (i % 2 === 0 ? 1 : -0.6);
        ctx.beginPath();
        ctx.moveTo(side * 7, -2);
        ctx.quadraticCurveTo(
          side * (15 + wobble + stride * 0.3) * legSpread,
          a * 18 + wobble,
          side * (len + stride * 0.2) * legSpread,
          a * 30 + 4 + stride * 0.15,
        );
        ctx.stroke();
      }
    }
  }

  // Body – slightly lighter brown than old near-black
  ctx.fillStyle = '#8a623f';
  ctx.beginPath();
  ctx.ellipse(0, 0, 11, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a57848';
  ctx.beginPath();
  ctx.ellipse(0, 13, 13, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 230, 190, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Eyes
  ctx.fillStyle = '#f5e6a8';
  ctx.beginPath();
  ctx.arc(-4, -2, 2.4, 0, Math.PI * 2);
  ctx.arc(4, -2, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a1810';
  ctx.beginPath();
  ctx.arc(-4, -2, 1.1, 0, Math.PI * 2);
  ctx.arc(4, -2, 1.1, 0, Math.PI * 2);
  ctx.fill();

  if (waving) {
    ctx.strokeStyle = 'rgba(245, 230, 168, 0.85)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(20, -10 + wave * 0.3, 7, -0.2 * Math.PI, 0.65 * Math.PI);
    ctx.stroke();
  }

  ctx.restore();
}
