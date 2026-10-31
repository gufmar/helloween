import { describe, expect, it } from 'vitest';
import {
  aspectRatio,
  canvasToLogical,
  createViewportTransform,
  isInsideContent,
  logicalToCanvas,
} from '../src/core/coords';

describe('createViewportTransform', () => {
  it('letterboxes a wider canvas without stretching', () => {
    const vp = createViewportTransform(1920, 1080, 2000, 1080);
    expect(vp.scale).toBeCloseTo(1);
    expect(vp.contentWidth).toBeCloseTo(1920);
    expect(vp.contentHeight).toBeCloseTo(1080);
    expect(vp.offsetX).toBeCloseTo(40);
    expect(vp.offsetY).toBeCloseTo(0);
  });

  it('letterboxes a taller canvas', () => {
    const vp = createViewportTransform(1920, 1080, 1920, 1200);
    expect(vp.scale).toBeCloseTo(1);
    expect(vp.offsetX).toBeCloseTo(0);
    expect(vp.offsetY).toBeCloseTo(60);
  });

  it('scales down uniformly for a smaller canvas', () => {
    const vp = createViewportTransform(1920, 1080, 960, 540);
    expect(vp.scale).toBeCloseTo(0.5);
    expect(vp.offsetX).toBeCloseTo(0);
    expect(vp.offsetY).toBeCloseTo(0);
    expect(vp.contentWidth / vp.contentHeight).toBeCloseTo(1920 / 1080);
  });

  it('round-trips logical and canvas coordinates', () => {
    const vp = createViewportTransform(1920, 1080, 1600, 900);
    const logical = { x: 480, y: 270 };
    const c = logicalToCanvas(logical, vp);
    const back = canvasToLogical(c, vp);
    expect(back.x).toBeCloseTo(logical.x);
    expect(back.y).toBeCloseTo(logical.y);
  });

  it('detects letterbox margins as outside content', () => {
    const vp = createViewportTransform(1920, 1080, 2000, 1080);
    expect(isInsideContent({ x: 10, y: 10 }, vp)).toBe(false);
    expect(isInsideContent({ x: 100, y: 10 }, vp)).toBe(true);
  });
});

describe('aspectRatio', () => {
  it('computes width/height', () => {
    expect(aspectRatio(1920, 1080)).toBeCloseTo(16 / 9);
  });
});
