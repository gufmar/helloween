import { describe, expect, it } from 'vitest';
import { expandPolygon, pointInPolygon } from '../src/core/mask';
import { hasClosedWall } from '../src/core/validation';
import type { ProjectDocument } from '../src/core/types';
import { createEmptyProject } from '../src/core/validation';

describe('expandPolygon', () => {
  it('moves vertices away from centroid', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const expanded = expandPolygon(pts, 2);
    expect(pointInPolygon({ x: 5, y: 5 }, expanded)).toBe(true);
    // Corner should move outward
    expect(expanded[0].x).toBeLessThan(0);
    expect(expanded[0].y).toBeLessThan(0);
  });
});

describe('hasClosedWall', () => {
  it('is false for empty project', () => {
    expect(hasClosedWall(createEmptyProject())).toBe(false);
  });

  it('is true for a closed wall polygon', () => {
    const doc: ProjectDocument = createEmptyProject();
    doc.polygons.push({
      id: 'w1',
      name: 'Wall',
      kind: 'wall',
      planeId: 'facade-a',
      closed: true,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
    });
    expect(hasClosedWall(doc)).toBe(true);
  });
});
