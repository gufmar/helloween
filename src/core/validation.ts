import { createDefaultScenes, defaultGhostPath } from './scenes';
import {
  DEFAULT_LOGICAL_HEIGHT,
  DEFAULT_LOGICAL_WIDTH,
  DEFAULT_SCENE_DURATION_MS,
  type FigureKind,
  type Point,
  type Polygon,
  type ProjectDocument,
  type ProjectMeta,
  type SceneAnchor,
  type SceneDef,
  type VideoClip,
} from './types';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  value?: ProjectDocument;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isPoint(v: unknown): v is Point {
  if (!v || typeof v !== 'object') return false;
  const p = v as Point;
  return isFiniteNumber(p.x) && isFiniteNumber(p.y);
}

function isPolygon(v: unknown): v is Polygon {
  if (!v || typeof v !== 'object') return false;
  const poly = v as Polygon;
  if (typeof poly.id !== 'string' || poly.id.length === 0) return false;
  if (typeof poly.name !== 'string') return false;
  if (poly.kind !== 'wall' && poly.kind !== 'exclude') return false;
  if (typeof poly.planeId !== 'string') return false;
  if (typeof poly.closed !== 'boolean') return false;
  if (!Array.isArray(poly.points) || !poly.points.every(isPoint)) return false;
  return true;
}

function isFigure(v: unknown): v is FigureKind {
  return (
    v === 'ghost' ||
    v === 'ghostSpooky' ||
    v === 'spider' ||
    v === 'pumpkin' ||
    v === 'witch' ||
    v === 'phantomMask'
  );
}

function isAnchor(v: unknown): v is SceneAnchor {
  if (!v || typeof v !== 'object') return false;
  const a = v as SceneAnchor;
  return (
    typeof a.id === 'string' &&
    typeof a.name === 'string' &&
    isPoint(a.point)
  );
}

function isScene(v: unknown): v is SceneDef {
  if (!v || typeof v !== 'object') return false;
  const s = v as SceneDef;
  if (typeof s.id !== 'string' || s.id.length === 0) return false;
  if (typeof s.name !== 'string') return false;
  if (!isFigure(s.figure)) return false;
  if (!Array.isArray(s.path) || !s.path.every(isPoint) || s.path.length < 2) return false;
  if (!isFiniteNumber(s.durationMs) || s.durationMs < 1000 || s.durationMs > 120_000) return false;
  if (!Array.isArray(s.anchors) || !s.anchors.every(isAnchor)) return false;
  return true;
}

function isVideoClip(v: unknown): v is VideoClip {
  if (!v || typeof v !== 'object') return false;
  const c = v as Partial<VideoClip>;
  if (typeof c.id !== 'string' || c.id.length === 0) return false;
  if (typeof c.name !== 'string') return false;
  if (typeof c.src !== 'string' || c.src.length === 0) return false;
  if (!isFiniteNumber(c.x) || !isFiniteNumber(c.y)) return false;
  if (!isFiniteNumber(c.width) || (c.width as number) < 1) return false;
  if (!isFiniteNumber(c.height) || (c.height as number) < 1) return false;
  if (typeof c.muted !== 'boolean') return false;
  if (c.inSequence != null && typeof c.inSequence !== 'boolean') return false;
  if (c.audioOutputId != null && typeof c.audioOutputId !== 'string') return false;
  if (c.holdLastFrame != null && typeof c.holdLastFrame !== 'boolean') return false;
  return true;
}

function validateMeta(raw: unknown, errors: string[]): { meta: ProjectMeta; legacy: boolean } | null {
  if (!raw || typeof raw !== 'object') {
    errors.push('meta missing or invalid');
    return null;
  }
  const m = raw as {
    version?: number;
    name?: string;
    logicalWidth?: number;
    logicalHeight?: number;
    excludePadding?: number;
    createdAt?: string;
    updatedAt?: string;
  };
  const legacy = m.version === 1;
  if (m.version !== 1 && m.version !== 2) {
    errors.push(`unsupported version: ${String(m.version)}`);
  }
  if (typeof m.name !== 'string' || m.name.trim() === '') {
    errors.push('meta.name missing');
  }
  if (!isFiniteNumber(m.logicalWidth) || m.logicalWidth <= 0) {
    errors.push('meta.logicalWidth invalid');
  }
  if (!isFiniteNumber(m.logicalHeight) || m.logicalHeight <= 0) {
    errors.push('meta.logicalHeight invalid');
  }
  if (!isFiniteNumber(m.excludePadding) || m.excludePadding < 0) {
    errors.push('meta.excludePadding invalid');
  }
  if (typeof m.createdAt !== 'string' || typeof m.updatedAt !== 'string') {
    errors.push('meta timestamps missing');
  }
  if (errors.length > 0) return null;

  return {
    legacy,
    meta: {
      version: 2,
      name: (m.name as string).trim(),
      logicalWidth: m.logicalWidth as number,
      logicalHeight: m.logicalHeight as number,
      excludePadding: m.excludePadding as number,
      createdAt: m.createdAt as string,
      updatedAt: m.updatedAt as string,
    },
  };
}

function migrateScenes(
  raw: Record<string, unknown>,
  width: number,
  height: number,
  errors: string[],
): SceneDef[] | null {
  if (Array.isArray(raw.scenes)) {
    raw.scenes.forEach((s, i) => {
      if (!isScene(s)) errors.push(`scenes[${i}] invalid`);
    });
    if (errors.some((e) => e.startsWith('scenes['))) return null;
    if (raw.scenes.length === 0) {
      errors.push('scenes must not be empty');
      return null;
    }
    return (raw.scenes as SceneDef[]).map((s) => ({
      id: s.id,
      name: s.name,
      figure: s.figure,
      path: s.path.map((p) => ({ x: p.x, y: p.y })),
      durationMs: s.durationMs,
      anchors: s.anchors.map((a) => ({
        id: a.id,
        name: a.name,
        point: { x: a.point.x, y: a.point.y },
      })),
    }));
  }

  // Legacy v1: demoPath → one ghost scene + default spider
  const demoPath = raw.demoPath;
  if (Array.isArray(demoPath) && demoPath.every(isPoint) && demoPath.length >= 2) {
    const scenes = createDefaultScenes(width, height);
    scenes[0] = {
      ...scenes[0],
      path: (demoPath as Point[]).map((p) => ({ x: p.x, y: p.y })),
      durationMs: DEFAULT_SCENE_DURATION_MS,
    };
    return scenes;
  }

  if (demoPath != null) {
    errors.push('demoPath invalid (legacy)');
    return null;
  }

  return createDefaultScenes(width, height);
}

/** Parse and validate a project JSON document. Never mutates existing state. */
export function parseProjectDocument(raw: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return { ok: false, errors: ['JSON is not parseable'] };
    }
  }

  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['document is not an object'] };
  }

  const doc = raw as Record<string, unknown>;
  const metaResult = validateMeta(doc.meta, errors);

  if (!Array.isArray(doc.polygons)) {
    errors.push('polygons missing');
  } else {
    doc.polygons.forEach((p, i) => {
      if (!isPolygon(p)) errors.push(`polygons[${i}] invalid`);
    });
  }

  if (doc.referencePhoto != null && typeof doc.referencePhoto !== 'string') {
    errors.push('referencePhoto invalid');
  }
  if (
    doc.referenceOpacity != null &&
    (!isFiniteNumber(doc.referenceOpacity) ||
      doc.referenceOpacity < 0 ||
      doc.referenceOpacity > 1)
  ) {
    errors.push('referenceOpacity invalid');
  }

  let scenes: SceneDef[] | null = null;
  if (metaResult) {
    scenes = migrateScenes(doc, metaResult.meta.logicalWidth, metaResult.meta.logicalHeight, errors);
  }

  let videos: VideoClip[] = [];
  if (doc.videos == null) {
    videos = [];
  } else if (!Array.isArray(doc.videos)) {
    errors.push('videos invalid');
  } else {
    doc.videos.forEach((v, i) => {
      if (!isVideoClip(v)) errors.push(`videos[${i}] invalid`);
    });
    if (!errors.some((e) => e.startsWith('videos['))) {
      videos = (doc.videos as VideoClip[]).map((c) => ({
        id: c.id,
        name: c.name,
        src: c.src,
        x: c.x,
        y: c.y,
        width: c.width,
        height: c.height,
        muted: c.muted,
        inSequence: c.inSequence !== false,
        audioOutputId: typeof c.audioOutputId === 'string' ? c.audioOutputId : '',
        holdLastFrame: c.holdLastFrame === true,
      }));
    }
  }

  if (errors.length > 0 || !metaResult || !scenes) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: [],
    value: {
      meta: metaResult.meta,
      polygons: doc.polygons as Polygon[],
      scenes,
      videos,
      referencePhoto: (doc.referencePhoto as string | null | undefined) ?? null,
      referenceOpacity: (doc.referenceOpacity as number | undefined) ?? 0.35,
    },
  };
}

/** @deprecated use defaultGhostPath from scenes.ts */
export function defaultDemoPath(
  width = DEFAULT_LOGICAL_WIDTH,
  height = DEFAULT_LOGICAL_HEIGHT,
): Point[] {
  return defaultGhostPath(width, height);
}

export function createEmptyProject(name = 'Fassade'): ProjectDocument {
  const now = new Date().toISOString();
  const width = DEFAULT_LOGICAL_WIDTH;
  const height = DEFAULT_LOGICAL_HEIGHT;
  return {
    meta: {
      version: 2,
      name,
      logicalWidth: width,
      logicalHeight: height,
      excludePadding: 12,
      createdAt: now,
      updatedAt: now,
    },
    polygons: [],
    scenes: createDefaultScenes(width, height),
    videos: [],
    referencePhoto: null,
    referenceOpacity: 0.35,
  };
}

export function cloneProject(doc: ProjectDocument): ProjectDocument {
  return structuredClone(doc);
}

/** True if logical size / aspect differs from the baseline that calibration assumed. */
export function calibrationInvalidatingChange(
  before: ProjectDocument,
  after: ProjectDocument,
): string[] {
  const reasons: string[] = [];
  if (before.meta.logicalWidth !== after.meta.logicalWidth) {
    reasons.push('logical width changed');
  }
  if (before.meta.logicalHeight !== after.meta.logicalHeight) {
    reasons.push('logical height changed');
  }
  const a = before.meta.logicalWidth / before.meta.logicalHeight;
  const b = after.meta.logicalWidth / after.meta.logicalHeight;
  if (Math.abs(a - b) > 1e-9) {
    reasons.push('aspect ratio changed');
  }
  return reasons;
}

export function hasClosedWall(doc: ProjectDocument): boolean {
  return doc.polygons.some((p) => p.kind === 'wall' && p.closed && p.points.length >= 3);
}

/** Drop leftover empty polygons from earlier UX bugs (0 points). */
export function pruneEmptyPolygons(doc: ProjectDocument): ProjectDocument {
  const polygons = doc.polygons.filter((p) => p.points.length > 0);
  if (polygons.length === doc.polygons.length) return doc;
  return {
    ...doc,
    polygons,
    meta: { ...doc.meta, updatedAt: new Date().toISOString() },
  };
}

/** Next unique label like "Wall 3" based on existing names of the same kind. */
export function nextPolygonName(doc: ProjectDocument, kind: Polygon['kind']): string {
  const prefix = kind === 'wall' ? 'Wall' : 'Exclude';
  let max = 0;
  for (const p of doc.polygons) {
    if (p.kind !== kind) continue;
    const m = p.name.match(new RegExp(`^${prefix}\\s+(\\d+)$`, 'i'));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix} ${max + 1}`;
}
