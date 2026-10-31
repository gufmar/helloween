import { describe, expect, it } from 'vitest';
import {
  calibrationInvalidatingChange,
  createEmptyProject,
  nextPolygonName,
  parseProjectDocument,
  pruneEmptyPolygons,
} from '../src/core/validation';

describe('parseProjectDocument', () => {
  it('accepts a valid empty project (v2 scenes)', () => {
    const doc = createEmptyProject('Test');
    const result = parseProjectDocument(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    expect(result.value?.meta.name).toBe('Test');
    expect(result.value?.meta.version).toBe(2);
    expect(result.value?.scenes.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects unparseable JSON without throwing', () => {
    const result = parseProjectDocument('{nope');
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects wrong version', () => {
    const doc = createEmptyProject();
    const raw = JSON.parse(JSON.stringify(doc)) as { meta: { version: number } };
    raw.meta.version = 99;
    const result = parseProjectDocument(raw);
    expect(result.ok).toBe(false);
  });

  it('rejects invalid polygons', () => {
    const doc = createEmptyProject();
    const raw = JSON.parse(JSON.stringify(doc)) as {
      polygons: Array<Record<string, unknown>>;
    };
    raw.polygons = [{ id: 'x', name: 'bad', kind: 'hole', points: [] }];
    const result = parseProjectDocument(raw);
    expect(result.ok).toBe(false);
  });

  it('rejects invalid scenes', () => {
    const doc = createEmptyProject();
    const raw = JSON.parse(JSON.stringify(doc)) as { scenes: unknown };
    raw.scenes = [{ id: 's', name: 'x', figure: 'ghost', path: [{ x: 1, y: 1 }], durationMs: 10, anchors: [] }];
    const result = parseProjectDocument(raw);
    expect(result.ok).toBe(false);
  });

  it('migrates legacy v1 demoPath to scenes', () => {
    const legacy = {
      meta: {
        version: 1,
        name: 'Alt',
        logicalWidth: 1920,
        logicalHeight: 1080,
        excludePadding: 12,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      polygons: [],
      demoPath: [
        { x: 100, y: 100 },
        { x: 200, y: 200 },
        { x: 300, y: 150 },
      ],
    };
    const result = parseProjectDocument(legacy);
    expect(result.ok).toBe(true);
    expect(result.value?.meta.version).toBe(2);
    expect(result.value?.scenes[0]?.path[0]).toEqual({ x: 100, y: 100 });
    expect(result.value?.scenes.some((s) => s.figure === 'spider')).toBe(true);
  });
});

describe('calibrationInvalidatingChange', () => {
  it('flags logical size changes', () => {
    const a = createEmptyProject();
    const b = createEmptyProject();
    b.meta.logicalWidth = 1280;
    b.meta.logicalHeight = 720;
    const reasons = calibrationInvalidatingChange(a, b);
    expect(reasons.length).toBeGreaterThan(0);
  });

  it('is empty when size unchanged', () => {
    const a = createEmptyProject();
    const b = createEmptyProject();
    expect(calibrationInvalidatingChange(a, b)).toEqual([]);
  });
});

describe('pruneEmptyPolygons', () => {
  it('removes zero-point polygons', () => {
    const doc = createEmptyProject();
    doc.polygons.push({
      id: 'empty',
      name: 'Wall 1',
      kind: 'wall',
      planeId: 'facade-a',
      closed: false,
      points: [],
    });
    doc.polygons.push({
      id: 'ok',
      name: 'Wall 2',
      kind: 'wall',
      planeId: 'facade-a',
      closed: true,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
    });
    const cleaned = pruneEmptyPolygons(doc);
    expect(cleaned.polygons).toHaveLength(1);
    expect(cleaned.polygons[0].id).toBe('ok');
  });
});

describe('nextPolygonName', () => {
  it('increments from highest existing number', () => {
    const doc = createEmptyProject();
    doc.polygons.push({
      id: 'a',
      name: 'Wall 11',
      kind: 'wall',
      planeId: 'facade-a',
      closed: false,
      points: [{ x: 0, y: 0 }],
    });
    expect(nextPolygonName(doc, 'wall')).toBe('Wall 12');
    expect(nextPolygonName(doc, 'exclude')).toBe('Exclude 1');
  });
});
