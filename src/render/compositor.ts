import { createViewportTransform, type ViewportTransform } from '../core/coords';
import { applyMaskToFrame } from '../core/mask';
import { hasClosedWall } from '../core/validation';
import type { ShowState } from '../core/types';
import { drawCalibrationOverlay, drawLogicalFrameBorder } from './calibration';
import { activeSceneDef, drawActiveScene } from './scene-playback';
import {
  layoutDomVideo,
  punchVideoHoles,
  visibleVideoClips,
} from './video-playback';

export interface CompositorOptions {
  /** Draw reference photo under calibration (control preview only). */
  referenceImage?: HTMLImageElement | null;
  showReference?: boolean;
  role: 'control' | 'projection';
  /** Mute DOM video audio on this window (avoid double sound with projection). */
  muteVideoAudio?: boolean;
}

/**
 * Shared render path for control preview and projection window.
 * Letterboxes logical 1920x1080 into the canvas; never stretches.
 * Videos are HTML elements under the canvas (hole punched in the frame).
 */
export class Compositor {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly frame: HTMLCanvasElement;
  private readonly frameCtx: CanvasRenderingContext2D;
  private vp: ViewportTransform | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // Alpha required so the DOM video can show through a punched hole.
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;
    this.frame = document.createElement('canvas');
    const fctx = this.frame.getContext('2d', { alpha: true });
    if (!fctx) throw new Error('frame context unavailable');
    this.frameCtx = fctx;
  }

  get viewport(): ViewportTransform | null {
    return this.vp;
  }

  private lastCssW = 0;
  private lastCssH = 0;
  private lastDpr = 0;

  /** Resize backing store only when CSS size or DPR actually changes. */
  resizeToClient(): void {
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth ?? window.innerWidth;
    const h = parent?.clientHeight ?? window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === this.lastCssW && h === this.lastCssH && dpr === this.lastDpr) return;
    this.lastCssW = w;
    this.lastCssH = h;
    this.lastDpr = dpr;
    this.canvas.width = Math.max(1, Math.floor(w * dpr));
    this.canvas.height = Math.max(1, Math.floor(h * dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  render(state: ShowState, nowMs: number, opts: CompositorOptions): void {
    const parent = this.canvas.parentElement;
    const cssW = parent?.clientWidth ?? window.innerWidth;
    const cssH = parent?.clientHeight ?? window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { logicalWidth: lw, logicalHeight: lh } = state.project.meta;

    this.vp = createViewportTransform(lw, lh, cssW, cssH);

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Keep canvas pixels transparent where the frame has holes so the DOM
    // <video> underneath is visible. Letterbox/outside-wall reads as the
    // black stage background.
    this.ctx.clearRect(0, 0, cssW, cssH);

    if (state.blackout) {
      layoutDomVideo(state, null);
      this.ctx.fillStyle = '#000000';
      this.ctx.fillRect(0, 0, cssW, cssH);
      return;
    }

    this.frame.width = lw;
    this.frame.height = lh;
    this.frameCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.frameCtx.clearRect(0, 0, lw, lh);

    if (
      opts.role === 'control' &&
      opts.showReference &&
      opts.referenceImage &&
      opts.referenceImage.complete &&
      opts.referenceImage.naturalWidth > 0
    ) {
      this.frameCtx.save();
      this.frameCtx.globalAlpha = state.project.referenceOpacity ?? 0.35;
      this.frameCtx.drawImage(opts.referenceImage, 0, 0, lw, lh);
      this.frameCtx.restore();
    }

    const wallOk = hasClosedWall(state.project);
    const videoClips = wallOk ? visibleVideoClips(state) : [];
    const sceneDef =
      wallOk && state.showArmed && state.scene ? activeSceneDef(state) : null;

    if (wallOk && state.showArmed) {
      if (videoClips.length > 0) {
        // Black cover (+ optional scene), then holes so DOM videos win
        // over later scene pixels in those rects.
        this.frameCtx.save();
        this.frameCtx.fillStyle = '#000000';
        this.frameCtx.fillRect(0, 0, lw, lh);
        this.frameCtx.restore();
        if (sceneDef) {
          const elapsed = nowMs - state.scene!.startedAtMs;
          drawActiveScene(this.frameCtx, sceneDef, elapsed);
        }
        punchVideoHoles(this.frameCtx, videoClips, lw, lh, { cover: false });
      } else if (sceneDef) {
        const elapsed = nowMs - state.scene!.startedAtMs;
        drawActiveScene(this.frameCtx, sceneDef, elapsed);
      }
    }

    // Show content is masked. Calibration helpers are drawn unmasked on top
    // so window polygons can be aligned against the real facade.
    applyMaskToFrame(this.frameCtx, state.project);

    const showCalibOverlay =
      state.calibrationMode &&
      (opts.role === 'control' || state.projectionShowCalibration);
    if (showCalibOverlay) {
      drawLogicalFrameBorder(this.frameCtx, state.project);
      drawCalibrationOverlay(this.frameCtx, state);
      if (!wallOk && opts.role === 'control') {
        this.frameCtx.save();
        this.frameCtx.fillStyle = 'rgba(255, 200, 80, 0.95)';
        this.frameCtx.font = '28px Segoe UI, sans-serif';
        this.frameCtx.fillText(
          'No closed wall area defined – show stays black',
          48,
          64,
        );
        this.frameCtx.restore();
      }
    }

    // Letterbox stays black; transparent hole in the frame reveals the DOM video.
    this.ctx.drawImage(
      this.frame,
      this.vp.offsetX,
      this.vp.offsetY,
      this.vp.contentWidth,
      this.vp.contentHeight,
    );

    layoutDomVideo(state, videoClips.length > 0 ? this.vp : null, {
      forceMuted: opts.muteVideoAudio === true,
    });
  }
}
