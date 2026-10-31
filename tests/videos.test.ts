import { describe, expect, it } from 'vitest';
import {
  createVideoClip,
  reorderVideos,
  clampVideoRect,
  sequenceQueueIds,
  videoSrcFromFileName,
} from '../src/core/videos';
import { createEmptyProject, parseProjectDocument } from '../src/core/validation';
import {
  beginSequenceGap,
  finishSequenceGap,
  withHeldClip,
  withoutHeldClip,
} from '../src/render/video-playback';

describe('video clips', () => {
  it('builds a media src under /media/videos/', () => {
    expect(videoSrcFromFileName('ghost loop.mp4')).toContain('/media/videos/');
    expect(videoSrcFromFileName('ghost loop.mp4')).toContain('ghost');
  });

  it('creates a centered default rect', () => {
    const clip = createVideoClip('bat.mp4', undefined, 1920, 1080);
    expect(clip.name).toBe('bat');
    expect(clip.width).toBeGreaterThan(100);
    expect(clip.x).toBeGreaterThan(0);
    expect(clip.muted).toBe(false);
    expect(clip.inSequence).toBe(true);
    expect(clip.audioOutputId).toBe('');
    expect(clip.holdLastFrame).toBe(false);
  });

  it('builds sequence queue from checked clips only', () => {
    const doc = createEmptyProject();
    const a = createVideoClip('a.mp4', 'A');
    const b = createVideoClip('b.mp4', 'B');
    b.inSequence = false;
    const c = createVideoClip('c.mp4', 'C');
    doc.videos = [a, b, c];
    expect(sequenceQueueIds(doc)).toEqual([a.id, c.id]);
  });

  it('reorders playlist by dragging before a target', () => {
    const a = createVideoClip('a.mp4', 'A');
    const b = createVideoClip('b.mp4', 'B');
    const c = createVideoClip('c.mp4', 'C');
    const next = reorderVideos([a, b, c], c.id, a.id);
    expect(next.map((v) => v.name)).toEqual(['C', 'A', 'B']);
  });

  it('moves a clip down by inserting before the following id (or end)', () => {
    const a = createVideoClip('a.mp4', 'A');
    const b = createVideoClip('b.mp4', 'B');
    const c = createVideoClip('c.mp4', 'C');
    // Drop after B => insert before C
    expect(reorderVideos([a, b, c], a.id, c.id).map((v) => v.name)).toEqual([
      'B',
      'A',
      'C',
    ]);
    // Drop after C => insert at end
    expect(reorderVideos([a, b, c], a.id, null).map((v) => v.name)).toEqual([
      'B',
      'C',
      'A',
    ]);
  });

  it('clamps rect inside the logical frame', () => {
    const clip = createVideoClip('x.mp4');
    clip.x = 5000;
    clip.y = -20;
    clip.width = 9000;
    const c = clampVideoRect(clip, 1920, 1080);
    expect(c.x + c.width).toBeLessThanOrEqual(1920);
    expect(c.y).toBeGreaterThanOrEqual(0);
  });

  it('parses projects without videos as empty playlist', () => {
    const doc = createEmptyProject();
    const raw = JSON.parse(JSON.stringify(doc)) as { videos?: unknown };
    delete raw.videos;
    const result = parseProjectDocument(raw);
    expect(result.ok).toBe(true);
    expect(result.value?.videos).toEqual([]);
  });

  it('accepts a video clip in JSON', () => {
    const doc = createEmptyProject();
    doc.videos = [createVideoClip('spooky.mp4', 'Spooky')];
    const result = parseProjectDocument(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    expect(result.value?.videos).toHaveLength(1);
    expect(result.value?.videos[0]?.name).toBe('Spooky');
  });

  it('inserts a gap then advances the queue', () => {
    const active = { queue: ['a', 'b'], index: 0, startedAtMs: 1 };
    const gap = beginSequenceGap(active, 1000, 3000);
    expect(gap.gapUntilMs).toBe(4000);
    const mid = finishSequenceGap(gap);
    expect(mid?.index).toBe(1);
    expect(mid?.gapUntilMs == null).toBe(true);
    expect(finishSequenceGap(mid!)).toBeNull();
  });

  it('defaults missing sequence fields when parsing older JSON', () => {
    const doc = createEmptyProject();
    const clip = createVideoClip('old.mp4', 'Old');
    const raw = JSON.parse(JSON.stringify(doc)) as {
      videos: Array<Record<string, unknown>>;
    };
    raw.videos = [
      {
        id: clip.id,
        name: clip.name,
        src: clip.src,
        x: clip.x,
        y: clip.y,
        width: clip.width,
        height: clip.height,
        muted: false,
      },
    ];
    const result = parseProjectDocument(raw);
    expect(result.ok).toBe(true);
    expect(result.value?.videos[0]?.inSequence).toBe(true);
    expect(result.value?.videos[0]?.audioOutputId).toBe('');
    expect(result.value?.videos[0]?.holdLastFrame).toBe(false);
  });

  it('parses holdLastFrame when set', () => {
    const doc = createEmptyProject();
    const clip = createVideoClip('hold.mp4', 'Hold');
    clip.holdLastFrame = true;
    doc.videos = [clip];
    const result = parseProjectDocument(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    expect(result.value?.videos[0]?.holdLastFrame).toBe(true);
  });

  it('tracks held clip ids without duplicates', () => {
    expect(withHeldClip(['a'], 'b')).toEqual(['a', 'b']);
    expect(withHeldClip(['a', 'b'], 'a')).toEqual(['a', 'b']);
    expect(withoutHeldClip(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });
});
