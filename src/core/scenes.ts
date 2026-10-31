import { newId } from './id';
import {
  DEFAULT_LOGICAL_HEIGHT,
  DEFAULT_LOGICAL_WIDTH,
  DEFAULT_SCENE_DURATION_MS,
  PUMPKIN_SCENE_DURATION_MS,
  SPIDER_SCENE_DURATION_MS,
  WITCH_SCENE_DURATION_MS,
  type FigureKind,
  type Point,
  type ProjectDocument,
  type SceneDef,
} from './types';

export function durationForFigure(figure: FigureKind): number {
  switch (figure) {
    case 'spider':
      return SPIDER_SCENE_DURATION_MS;
    case 'witch':
      return WITCH_SCENE_DURATION_MS;
    case 'pumpkin':
      return PUMPKIN_SCENE_DURATION_MS;
    default:
      return DEFAULT_SCENE_DURATION_MS;
  }
}

export function defaultGhostPath(
  width = DEFAULT_LOGICAL_WIDTH,
  height = DEFAULT_LOGICAL_HEIGHT,
): Point[] {
  return [
    { x: width * 0.2, y: height * 0.55 },
    { x: width * 0.35, y: height * 0.4 },
    { x: width * 0.55, y: height * 0.45 },
    { x: width * 0.72, y: height * 0.35 },
    { x: width * 0.85, y: height * 0.5 },
  ];
}

export function defaultSpookyGhostPath(
  width = DEFAULT_LOGICAL_WIDTH,
  height = DEFAULT_LOGICAL_HEIGHT,
): Point[] {
  return [
    { x: width * 0.75, y: height * 0.3 },
    { x: width * 0.6, y: height * 0.38 },
    { x: width * 0.45, y: height * 0.32 },
    { x: width * 0.3, y: height * 0.42 },
    { x: width * 0.18, y: height * 0.36 },
  ];
}

/** Vertical-ish drop between floors – user will align to facade. */
export function defaultSpiderPath(
  width = DEFAULT_LOGICAL_WIDTH,
  height = DEFAULT_LOGICAL_HEIGHT,
): Point[] {
  return [
    { x: width * 0.48, y: height * 0.18 },
    { x: width * 0.5, y: height * 0.35 },
    { x: width * 0.5, y: height * 0.52 },
  ];
}

/** Horizontal hop along a storey band. */
export function defaultPumpkinPath(
  width = DEFAULT_LOGICAL_WIDTH,
  height = DEFAULT_LOGICAL_HEIGHT,
): Point[] {
  return [
    { x: width * 0.15, y: height * 0.62 },
    { x: width * 0.32, y: height * 0.6 },
    { x: width * 0.5, y: height * 0.62 },
    { x: width * 0.68, y: height * 0.6 },
    { x: width * 0.85, y: height * 0.62 },
  ];
}

/** Diagonal flight across the facade. */
export function defaultWitchPath(
  width = DEFAULT_LOGICAL_WIDTH,
  height = DEFAULT_LOGICAL_HEIGHT,
): Point[] {
  return [
    { x: width * 0.08, y: height * 0.55 },
    { x: width * 0.28, y: height * 0.4 },
    { x: width * 0.5, y: height * 0.32 },
    { x: width * 0.72, y: height * 0.28 },
    { x: width * 0.92, y: height * 0.38 },
  ];
}

/** Slow drift across mid facade for the SimReady mask sprite. */
export function defaultPhantomMaskPath(
  width = DEFAULT_LOGICAL_WIDTH,
  height = DEFAULT_LOGICAL_HEIGHT,
): Point[] {
  return [
    { x: width * 0.18, y: height * 0.42 },
    { x: width * 0.35, y: height * 0.36 },
    { x: width * 0.52, y: height * 0.4 },
    { x: width * 0.7, y: height * 0.34 },
    { x: width * 0.86, y: height * 0.44 },
  ];
}

export function defaultPathFor(
  figure: FigureKind,
  width = DEFAULT_LOGICAL_WIDTH,
  height = DEFAULT_LOGICAL_HEIGHT,
): Point[] {
  switch (figure) {
    case 'spider':
      return defaultSpiderPath(width, height);
    case 'pumpkin':
      return defaultPumpkinPath(width, height);
    case 'witch':
      return defaultWitchPath(width, height);
    case 'ghostSpooky':
      return defaultSpookyGhostPath(width, height);
    case 'phantomMask':
      return defaultPhantomMaskPath(width, height);
    default:
      return defaultGhostPath(width, height);
  }
}

export function createDefaultScenes(
  width = DEFAULT_LOGICAL_WIDTH,
  height = DEFAULT_LOGICAL_HEIGHT,
): SceneDef[] {
  return [
    {
      id: newId('scene'),
      name: 'Ghost boo',
      figure: 'ghost',
      path: defaultGhostPath(width, height),
      durationMs: durationForFigure('ghost'),
      anchors: [],
    },
    {
      id: newId('scene'),
      name: 'Spooky ghost',
      figure: 'ghostSpooky',
      path: defaultSpookyGhostPath(width, height),
      durationMs: durationForFigure('ghostSpooky'),
      anchors: [],
    },
    {
      id: newId('scene'),
      name: 'Spider drop',
      figure: 'spider',
      path: defaultSpiderPath(width, height),
      durationMs: durationForFigure('spider'),
      anchors: [],
    },
    {
      id: newId('scene'),
      name: 'Pumpkin hop',
      figure: 'pumpkin',
      path: defaultPumpkinPath(width, height),
      durationMs: durationForFigure('pumpkin'),
      anchors: [],
    },
    {
      id: newId('scene'),
      name: 'Witch flight',
      figure: 'witch',
      path: defaultWitchPath(width, height),
      durationMs: durationForFigure('witch'),
      anchors: [],
    },
    {
      id: newId('scene'),
      name: 'Phantom mask',
      figure: 'phantomMask',
      path: defaultPhantomMaskPath(width, height),
      durationMs: durationForFigure('phantomMask'),
      anchors: [],
    },
  ];
}

export function createScene(
  figure: FigureKind,
  name: string,
  width = DEFAULT_LOGICAL_WIDTH,
  height = DEFAULT_LOGICAL_HEIGHT,
): SceneDef {
  return {
    id: newId('scene'),
    name,
    figure,
    path: defaultPathFor(figure, width, height),
    durationMs: durationForFigure(figure),
    anchors: [],
  };
}

/** Bump legacy spider scenes that still use the short default duration. */
export function normalizeSceneDurations(doc: ProjectDocument): ProjectDocument {
  let changed = false;
  const scenes = doc.scenes.map((s) => {
    if (s.figure === 'spider' && s.durationMs <= DEFAULT_SCENE_DURATION_MS) {
      changed = true;
      return { ...s, durationMs: SPIDER_SCENE_DURATION_MS };
    }
    return s;
  });
  if (!changed) return doc;
  return {
    ...doc,
    scenes,
    meta: { ...doc.meta, updatedAt: new Date().toISOString() },
  };
}

/** Append missing catalog figures so existing projects get new types without reset. */
export function ensureCatalogScenes(doc: ProjectDocument): ProjectDocument {
  const have = new Set(doc.scenes.map((s) => s.figure));
  const w = doc.meta.logicalWidth;
  const h = doc.meta.logicalHeight;
  const extras: SceneDef[] = [];
  const add: Array<{ figure: FigureKind; name: string }> = [
    { figure: 'ghostSpooky', name: 'Spooky ghost' },
    { figure: 'pumpkin', name: 'Pumpkin hop' },
    { figure: 'witch', name: 'Witch flight' },
    { figure: 'phantomMask', name: 'Phantom mask' },
  ];
  for (const item of add) {
    if (!have.has(item.figure)) {
      extras.push(createScene(item.figure, item.name, w, h));
    }
  }
  if (extras.length === 0) return doc;
  return {
    ...doc,
    scenes: [...doc.scenes, ...extras],
    meta: { ...doc.meta, updatedAt: new Date().toISOString() },
  };
}

const FIGURE_PREFIX: Record<FigureKind, string> = {
  ghost: 'Ghost',
  ghostSpooky: 'Spooky ghost',
  spider: 'Spider',
  pumpkin: 'Pumpkin',
  witch: 'Witch',
  phantomMask: 'Phantom mask',
};

export function nextSceneName(doc: ProjectDocument, figure: FigureKind): string {
  const prefix = FIGURE_PREFIX[figure];
  let max = 0;
  for (const s of doc.scenes) {
    if (s.figure !== figure) continue;
    const m = s.name.match(new RegExp(`^${prefix}\\s+(\\d+)$`, 'i'));
    if (m) max = Math.max(max, Number(m[1]));
    else if (s.name.startsWith(prefix)) max = Math.max(max, 1);
  }
  return `${prefix} ${max + 1}`;
}

export function figureLabel(figure: FigureKind): string {
  return FIGURE_PREFIX[figure];
}
