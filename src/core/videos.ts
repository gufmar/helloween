import { newId } from './id';
import {
  DEFAULT_LOGICAL_HEIGHT,
  DEFAULT_LOGICAL_WIDTH,
  type Point,
  type ProjectDocument,
  type VideoClip,
} from './types';

/** Media URL under the Vite `/media/` root. */
export function videoSrcFromFileName(fileName: string): string {
  const safe = fileName.replace(/^\/+/, '');
  return `/media/videos/${encodeURIComponent(safe).replace(/%2F/gi, '/')}`;
}

export function fileNameFromVideoSrc(src: string): string {
  const marker = '/media/videos/';
  const i = src.indexOf(marker);
  const raw = i >= 0 ? src.slice(i + marker.length) : src;
  try {
    return decodeURIComponent(raw.split('?')[0] ?? raw);
  } catch {
    return raw;
  }
}

export function defaultVideoRect(
  width = DEFAULT_LOGICAL_WIDTH,
  height = DEFAULT_LOGICAL_HEIGHT,
): { x: number; y: number; width: number; height: number } {
  const w = Math.round(width * 0.36);
  const h = Math.round(w * (9 / 16));
  return {
    x: Math.round((width - w) / 2),
    y: Math.round((height - h) / 2),
    width: w,
    height: h,
  };
}

export function createVideoClip(
  fileName: string,
  name?: string,
  logicalWidth = DEFAULT_LOGICAL_WIDTH,
  logicalHeight = DEFAULT_LOGICAL_HEIGHT,
): VideoClip {
  const rect = defaultVideoRect(logicalWidth, logicalHeight);
  const base = fileName.replace(/\.[^.]+$/, '') || 'Video';
  return {
    id: newId('vid'),
    name: name?.trim() || base,
    src: videoSrcFromFileName(fileName),
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    muted: false,
    inSequence: true,
    audioOutputId: '',
    holdLastFrame: false,
  };
}

/** Clips checked for sequence, in list order. */
export function sequenceQueueIds(doc: ProjectDocument): string[] {
  return doc.videos.filter((v) => v.inSequence).map((v) => v.id);
}

export function findVideoClip(doc: ProjectDocument, id: string | null | undefined): VideoClip | null {
  if (!id) return null;
  return doc.videos.find((v) => v.id === id) ?? null;
}

export function clampVideoRect(
  clip: VideoClip,
  logicalWidth: number,
  logicalHeight: number,
): VideoClip {
  const minW = 80;
  const minH = 45;
  let width = Math.max(minW, Math.min(clip.width, logicalWidth));
  let height = Math.max(minH, Math.min(clip.height, logicalHeight));
  let x = Math.max(0, Math.min(clip.x, logicalWidth - width));
  let y = Math.max(0, Math.min(clip.y, logicalHeight - height));
  return { ...clip, x, y, width, height };
}

export function videoCorners(clip: VideoClip): Point[] {
  const { x, y, width, height } = clip;
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

export function pointInVideoRect(clip: VideoClip, p: Point): boolean {
  return p.x >= clip.x && p.x <= clip.x + clip.width && p.y >= clip.y && p.y <= clip.y + clip.height;
}

/** Reorder by moving `fromId` before `toId` (or to end if toId is null). */
export function reorderVideos(
  videos: VideoClip[],
  fromId: string,
  toId: string | null,
): VideoClip[] {
  const from = videos.findIndex((v) => v.id === fromId);
  if (from < 0) return videos;
  const next = videos.slice();
  const [item] = next.splice(from, 1);
  if (!toId) {
    next.push(item);
    return next;
  }
  let to = next.findIndex((v) => v.id === toId);
  if (to < 0) {
    next.push(item);
    return next;
  }
  next.splice(to, 0, item);
  return next;
}

export async function fetchAvailableVideoFiles(): Promise<string[]> {
  try {
    const res = await fetch('/media/videos/?list=1');
    if (!res.ok) return [];
    const data = (await res.json()) as { files?: unknown };
    if (!Array.isArray(data.files)) return [];
    return data.files.filter((f): f is string => typeof f === 'string');
  } catch {
    return [];
  }
}
