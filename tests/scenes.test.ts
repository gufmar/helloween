import { describe, expect, it } from 'vitest';
import { createDefaultScenes, ensureCatalogScenes, figureLabel } from '../src/core/scenes';
import { createEmptyProject } from '../src/core/validation';
import { sampleGhostPose } from '../src/render/ghost';
import { samplePhantomMaskPose } from '../src/render/phantom-mask';
import { samplePumpkinPose } from '../src/render/pumpkin';
import { sampleSpiderPose } from '../src/render/spider';
import { sampleWitchPose } from '../src/render/witch';
import { shouldTriggerAccent } from '../src/render/scene-playback';
import { pointAlongPath } from '../src/render/path';

describe('pointAlongPath', () => {
  it('returns endpoints at 0 and 1', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(pointAlongPath(path, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAlongPath(path, 1).x).toBeCloseTo(100);
  });
});

describe('figures', () => {
  const scenes = createDefaultScenes();
  const ghost = scenes.find((s) => s.figure === 'ghost')!;
  const spooky = scenes.find((s) => s.figure === 'ghostSpooky')!;
  const spider = scenes.find((s) => s.figure === 'spider')!;
  const pumpkin = scenes.find((s) => s.figure === 'pumpkin')!;
  const witch = scenes.find((s) => s.figure === 'witch')!;
  const mask = scenes.find((s) => s.figure === 'phantomMask')!;

  it('ships six default scenes', () => {
    expect(scenes).toHaveLength(6);
    expect(figureLabel('pumpkin')).toBe('Pumpkin');
    expect(figureLabel('phantomMask')).toBe('Phantom mask');
  });

  it('ghost appears then vanishes within duration', () => {
    expect(sampleGhostPose(ghost.path, -1, ghost.durationMs)).toBeNull();
    expect(sampleGhostPose(ghost.path, 100, ghost.durationMs)?.alpha).toBeGreaterThan(0);
    expect(sampleGhostPose(ghost.path, ghost.durationMs + 1, ghost.durationMs)).toBeNull();
  });

  it('spooky ghost stays semi-transparent', () => {
    const mid = sampleGhostPose(spooky.path, spooky.durationMs * 0.4, spooky.durationMs, 'spooky');
    expect(mid?.style).toBe('spooky');
    expect(mid!.alpha).toBeLessThan(0.7);
  });

  it('spider descends and waves', () => {
    const mid = sampleSpiderPose(spider.path, spider.durationMs * 0.55, spider.durationMs);
    expect(mid?.waving).toBe(true);
  });

  it('pumpkin hops and winks near the end', () => {
    const hop = samplePumpkinPose(pumpkin.path, pumpkin.durationMs * 0.4, pumpkin.durationMs);
    expect(hop?.bounce).toBeGreaterThan(0);
    const wink = samplePumpkinPose(pumpkin.path, pumpkin.durationMs * 0.8, pumpkin.durationMs);
    expect(wink?.wink).toBe(true);
  });

  it('witch flies with angle', () => {
    const mid = sampleWitchPose(witch.path, witch.durationMs * 0.4, witch.durationMs);
    expect(mid).not.toBeNull();
    expect(Number.isFinite(mid!.angle)).toBe(true);
  });

  it('phantom mask drifts then scales up near accent', () => {
    const mid = samplePhantomMaskPose(mask.path, mask.durationMs * 0.4, mask.durationMs);
    expect(mid?.alpha).toBe(1);
    const accent = samplePhantomMaskPose(mask.path, mask.durationMs * 0.82, mask.durationMs);
    expect(accent!.scale).toBeGreaterThan(1);
  });

  it('ghost alternates face while moving', () => {
    const smile = sampleGhostPose(ghost.path, 500, ghost.durationMs);
    const scare = sampleGhostPose(ghost.path, 1200, ghost.durationMs);
    expect(smile?.startled).toBe(false);
    expect(scare?.startled).toBe(true);
  });

  it('accent triggers once around cue time', () => {
    expect(shouldTriggerAccent(ghost, 0, ghost.durationMs * 0.72)).toBe(true);
    expect(shouldTriggerAccent(ghost, ghost.durationMs * 0.72, ghost.durationMs * 0.8)).toBe(
      false,
    );
    expect(shouldTriggerAccent(spider, 0, spider.durationMs * 0.48)).toBe(true);
  });
});

describe('ensureCatalogScenes', () => {
  it('appends missing new figures to an old two-scene project', () => {
    const doc = createEmptyProject();
    doc.scenes = doc.scenes.filter((s) => s.figure === 'ghost' || s.figure === 'spider');
    expect(doc.scenes).toHaveLength(2);
    const next = ensureCatalogScenes(doc);
    expect(next.scenes.some((s) => s.figure === 'pumpkin')).toBe(true);
    expect(next.scenes.some((s) => s.figure === 'witch')).toBe(true);
    expect(next.scenes.some((s) => s.figure === 'ghostSpooky')).toBe(true);
    expect(next.scenes.some((s) => s.figure === 'phantomMask')).toBe(true);
  });
});
