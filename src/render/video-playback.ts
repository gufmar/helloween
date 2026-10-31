import { applyMediaSinkId } from '../audio/outputs';
import type { ViewportTransform } from '../core/coords';
import {
  VIDEO_SEQUENCE_GAP_MS,
  type ActiveVideo,
  type ShowState,
  type VideoClip,
} from '../core/types';
import { findVideoClip } from '../core/videos';

const elements = new Map<string, HTMLVideoElement>();
/** Last sink id we successfully requested per src (may still be in flight). */
const lastSinkBySrc = new Map<string, string>();
let lastPlayKey = '';
let hostEl: HTMLElement | null = null;

export function setVideoHost(host: HTMLElement | null): void {
  hostEl = host;
  if (!host) return;
  for (const el of elements.values()) {
    if (el.parentElement !== host) host.appendChild(el);
  }
}

export function activeVideoClip(state: ShowState): VideoClip | null {
  if (!state.video) return null;
  const id = state.video.queue[state.video.index];
  return findVideoClip(state.project, id);
}

/** True while a clip should be visible (not during inter-clip gap). */
export function isVideoVisuallyActive(state: ShowState): boolean {
  return Boolean(
    state.video &&
      !state.video.gapUntilMs &&
      !state.blackout &&
      state.showArmed &&
      activeVideoClip(state),
  );
}

export function heldVideoClips(state: ShowState): VideoClip[] {
  if (state.blackout || !state.showArmed) return [];
  const activeId = isVideoVisuallyActive(state) ? activeVideoClip(state)?.id : null;
  const out: VideoClip[] = [];
  for (const id of state.heldVideoIds ?? []) {
    if (id === activeId) continue;
    const clip = findVideoClip(state.project, id);
    if (clip) out.push(clip);
  }
  return out;
}

/** Active playing clip (if any) plus held last-frame clips. */
export function visibleVideoClips(state: ShowState): VideoClip[] {
  const held = heldVideoClips(state);
  const active = isVideoVisuallyActive(state) ? activeVideoClip(state) : null;
  if (active) return [...held, active];
  return held;
}

export function withHeldClip(heldVideoIds: string[], clipId: string): string[] {
  if (heldVideoIds.includes(clipId)) return heldVideoIds;
  return [...heldVideoIds, clipId];
}

export function withoutHeldClip(heldVideoIds: string[], clipId: string): string[] {
  return heldVideoIds.filter((id) => id !== clipId);
}

function getOrCreateVideo(src: string): HTMLVideoElement | null {
  if (typeof document === 'undefined') return null;
  let el = elements.get(src);
  if (el) {
    if (hostEl && el.parentElement !== hostEl) hostEl.appendChild(el);
    return el;
  }
  el = document.createElement('video');
  el.className = 'helloween-dom-video';
  el.playsInline = true;
  el.preload = 'auto';
  el.loop = false;
  el.controls = false;
  el.setAttribute('playsinline', '');
  el.setAttribute('webkit-playsinline', '');
  el.disablePictureInPicture = true;
  el.src = src;
  if (hostEl) hostEl.appendChild(el);
  else document.body.appendChild(el);
  elements.set(src, el);
  return el;
}

function applyAudioParams(
  el: HTMLVideoElement,
  clip: VideoClip,
  volume: number,
  forceMuted: boolean,
  opts: { forceSink?: boolean } = {},
): void {
  // Always write muted/volume on this element. A global "last" cache was wrong:
  // held frames set el.muted=true, then the next play could skip unmuting.
  el.muted = forceMuted || clip.muted;
  el.volume = Math.max(0, Math.min(1, volume));
  const sink = clip.audioOutputId || '';
  if (opts.forceSink || lastSinkBySrc.get(clip.src) !== sink) {
    void applyMediaSinkId(el, sink).then((err) => {
      if (!err) lastSinkBySrc.set(clip.src, sink);
      else lastSinkBySrc.delete(clip.src);
    });
  }
}

/** Start playback with sink + unmute applied (Chromium can drop sink across pauses). */
async function startClipPlayback(
  el: HTMLVideoElement,
  clip: VideoClip,
  volume: number,
  forceMuted: boolean,
): Promise<void> {
  el.muted = forceMuted || clip.muted;
  el.volume = Math.max(0, Math.min(1, volume));
  try {
    el.pause();
    el.currentTime = 0;
  } catch {
    /* ignore */
  }
  const sink = clip.audioOutputId || '';
  const sinkErr = await applyMediaSinkId(el, sink);
  if (!sinkErr) lastSinkBySrc.set(clip.src, sink);
  else lastSinkBySrc.delete(clip.src);
  el.muted = forceMuted || clip.muted;
  el.volume = Math.max(0, Math.min(1, volume));
  try {
    await el.play();
  } catch {
    /* need user gesture on that window */
  }
  // Re-assert after play(); held frames may have left muted=true on this element.
  el.muted = forceMuted || clip.muted;
  el.volume = Math.max(0, Math.min(1, volume));
  const again = await applyMediaSinkId(el, sink);
  if (!again) lastSinkBySrc.set(clip.src, sink);
}

function positionVideo(el: HTMLVideoElement, clip: VideoClip, vp: ViewportTransform): void {
  el.style.left = `${vp.offsetX + clip.x * vp.scale}px`;
  el.style.top = `${vp.offsetY + clip.y * vp.scale}px`;
  el.style.width = `${clip.width * vp.scale}px`;
  el.style.height = `${clip.height * vp.scale}px`;
  // Stay under the canvas (z-index 1); stacking among videos uses DOM order.
  el.style.zIndex = '0';
}

/** Freeze near the end so `ended` does not blank the frame. */
function holdElementAtLastFrame(el: HTMLVideoElement): void {
  el.pause();
  if (Number.isFinite(el.duration) && el.duration > 0) {
    const target = Math.max(0, el.duration - 0.04);
    try {
      if (el.ended || el.currentTime < target - 0.02) {
        el.currentTime = target;
      }
    } catch {
      /* ignore */
    }
  }
}

function hideElement(el: HTMLVideoElement, resetTime: boolean): void {
  el.classList.remove('is-active', 'is-held');
  el.pause();
  if (resetTime) {
    try {
      if (el.currentTime > 0) el.currentTime = 0;
    } catch {
      /* ignore */
    }
  }
}

export interface LayoutDomVideoOptions {
  /** Mute this window's video audio (e.g. control while projection is connected). */
  forceMuted?: boolean;
}

/**
 * Place active + held clips as real DOM videos under the canvas (CSS px).
 * Held frames use higher z-index than the playing clip so later videos
 * cannot cover earlier stand-stills.
 */
export function layoutDomVideo(
  state: ShowState,
  vp: ViewportTransform | null,
  opts: LayoutDomVideoOptions = {},
): void {
  const held = heldVideoClips(state);
  const activeClip =
    isVideoVisuallyActive(state) && vp && vp.scale > 0 ? activeVideoClip(state) : null;
  const showHeld = held.length > 0 && !!vp && vp.scale > 0;
  const showActive = !!activeClip && !!vp && vp.scale > 0;

  if ((!showHeld && !showActive) || !vp) {
    // During blackout keep last-frame time so stand-stills return after arm.
    const preserveSrcs = new Set<string>();
    if (state.blackout || !state.showArmed) {
      for (const id of state.heldVideoIds ?? []) {
        const c = findVideoClip(state.project, id);
        if (c) preserveSrcs.add(c.src);
      }
    }
    for (const [src, el] of elements) {
      hideElement(el, !preserveSrcs.has(src));
    }
    if (!state.video || state.video.gapUntilMs) {
      lastPlayKey = state.video?.gapUntilMs
        ? `${activeVideoClip(state)?.id ?? ''}:gap`
        : '';
    }
    return;
  }

  const visibleSrcs = new Set<string>();
  for (const clip of held) visibleSrcs.add(clip.src);
  if (activeClip) visibleSrcs.add(activeClip.src);

  for (const [src, el] of elements) {
    if (!visibleSrcs.has(src)) {
      hideElement(el, true);
    }
  }

  // DOM order (bottom → top): playing clip, then later held, then earlier held.
  // Earlier stand-stills must not be covered by later videos.
  let activeEl: HTMLVideoElement | null = null;
  const forceMuted = opts.forceMuted === true;

  if (activeClip) {
    activeEl = getOrCreateVideo(activeClip.src);
    if (activeEl) {
      positionVideo(activeEl, activeClip, vp);
      activeEl.classList.add('is-active');
      activeEl.classList.remove('is-held');
      applyAudioParams(activeEl, activeClip, state.volume, forceMuted);

      const active = state.video!;
      const key = `${activeClip.id}:${active.startedAtMs}`;
      if (key !== lastPlayKey) {
        lastPlayKey = key;
        const start = () => {
          void startClipPlayback(activeEl!, activeClip, state.volume, forceMuted);
        };
        if (activeEl.readyState >= 1) start();
        else activeEl.addEventListener('loadedmetadata', start, { once: true });
      } else if (activeEl.paused && !activeEl.ended && activeEl.currentTime > 0) {
        applyAudioParams(activeEl, activeClip, state.volume, forceMuted);
        void activeEl.play().catch(() => {
          /* ignore */
        });
      }
    }
  } else {
    lastPlayKey = state.video?.gapUntilMs
      ? `${activeVideoClip(state)?.id ?? ''}:gap`
      : lastPlayKey;
  }

  const heldEls: HTMLVideoElement[] = [];
  for (const clip of held) {
    const el = getOrCreateVideo(clip.src);
    if (!el) continue;
    positionVideo(el, clip, vp);
    el.classList.add('is-active', 'is-held');
    // Stand-stills stay silent (active clip re-applies unmute on its own element).
    el.muted = true;
    holdElementAtLastFrame(el);
    heldEls.push(el);
  }

  if (hostEl) {
    // Keep canvas as last child (topmost); insert videos before it.
    const canvas = hostEl.querySelector('canvas');
    const before = canvas;
    if (activeEl) hostEl.insertBefore(activeEl, before);
    // Reverse: last held in list (newest) first, earliest held closest to canvas.
    for (let i = heldEls.length - 1; i >= 0; i--) {
      hostEl.insertBefore(heldEls[i]!, before);
    }
  }
}

export interface PunchVideoHolesOptions {
  /** When true (default), fill the frame black before cutting holes. */
  cover?: boolean;
}

/** Punch transparent holes so DOM videos show through the masked frame. */
export function punchVideoHoles(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  clips: VideoClip[],
  logicalWidth: number,
  logicalHeight: number,
  opts: PunchVideoHolesOptions = {},
): void {
  if (clips.length === 0) return;
  const cover = opts.cover !== false;
  ctx.save();
  if (cover) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);
  }
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#ffffff';
  for (const clip of clips) {
    ctx.fillRect(clip.x, clip.y, clip.width, clip.height);
  }
  ctx.restore();
}

/** Single-clip helper (covers the frame). */
export function punchVideoHole(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  clip: VideoClip,
  logicalWidth: number,
  logicalHeight: number,
): void {
  punchVideoHoles(ctx, [clip], logicalWidth, logicalHeight);
}

/** Ignore ended leftovers for a short time after restart. */
const REPLAY_GRACE_MS = 500;

export function isActiveVideoFinished(state: ShowState, nowMs: number): boolean {
  const active = state.video;
  if (!active || active.gapUntilMs) return false;
  const elapsedMs = nowMs - active.startedAtMs;
  // Previously ended <video> stays ended until seek/play settles.
  if (elapsedMs < REPLAY_GRACE_MS) return false;
  const clip = activeVideoClip(state);
  if (!clip) return true;
  const el = elements.get(clip.src);
  if (el && el.ended) return true;
  if (el && Number.isFinite(el.duration) && el.duration > 0) {
    if (el.currentTime > 0.2 && el.currentTime >= el.duration - 0.05) return true;
    const elapsed = elapsedMs / 1000;
    if (elapsed >= el.duration + 0.25) return true;
  }
  if (elapsedMs > 10 * 60 * 1000) return true;
  return false;
}

export function beginSequenceGap(
  active: ActiveVideo,
  nowMs: number,
  gapMs = VIDEO_SEQUENCE_GAP_MS,
): ActiveVideo {
  return { ...active, gapUntilMs: nowMs + gapMs };
}

export function finishSequenceGap(active: ActiveVideo): ActiveVideo | null {
  const next = active.index + 1;
  if (next >= active.queue.length) return null;
  return { queue: active.queue, index: next, startedAtMs: Date.now() };
}

export function advanceVideoQueue(active: ActiveVideo): ActiveVideo | null {
  return finishSequenceGap(active);
}

/** End the current play session without wiping held last-frame times. */
export function clearPlaySession(): void {
  lastPlayKey = '';
}

/** Hide every video and reset timelines (clears stand-stills). */
export function pauseAllVideos(): void {
  for (const el of elements.values()) {
    hideElement(el, true);
  }
  clearPlaySession();
}
