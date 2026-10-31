/** Logical projection point in project coordinates. */
export interface Point {
  x: number;
  y: number;
}

/** Allowed wall area or excluded region (windows, etc.). */
export interface Polygon {
  id: string;
  name: string;
  kind: 'wall' | 'exclude';
  /** Reserved for later dual-facade transforms. */
  planeId: string;
  closed: boolean;
  points: Point[];
}

export type FigureKind =
  | 'ghost'
  | 'ghostSpooky'
  | 'spider'
  | 'pumpkin'
  | 'witch'
  | 'phantomMask';

/** Named architecture reference for later path authoring. */
export interface SceneAnchor {
  id: string;
  name: string;
  point: Point;
}

/** One triggerable show beat: figure + motion path + timing. */
export interface SceneDef {
  id: string;
  name: string;
  figure: FigureKind;
  path: Point[];
  durationMs: number;
  anchors: SceneAnchor[];
}

/**
 * Positioned MP4/WebM clip on the logical facade.
 * Order in `ProjectDocument.videos` is the playlist order.
 */
export interface VideoClip {
  id: string;
  name: string;
  /** Served path, e.g. `/media/videos/ghost-loop.mp4`. */
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** When true, video plays silent (figure audio still separate). */
  muted: boolean;
  /** Include in the checkbox-selected sequence playlist. */
  inSequence: boolean;
  /**
   * `HTMLMediaElement.setSinkId` device id for this clip's audio.
   * Empty string = system default output.
   */
  audioOutputId: string;
  /**
   * When true, keep the last decoded frame visible after playback ends
   * (and while later scenes/clips run). Later clips must not cover it.
   */
  holdLastFrame: boolean;
}

/** Pause between sequence clips (wall clock). */
export const VIDEO_SEQUENCE_GAP_MS = 3_000;

export interface ProjectMeta {
  version: 2;
  name: string;
  logicalWidth: number;
  logicalHeight: number;
  /** Safety margin around exclude polygons, in logical pixels. */
  excludePadding: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDocument {
  meta: ProjectMeta;
  polygons: Polygon[];
  scenes: SceneDef[];
  /** Playlist-ordered video clips (may be empty). */
  videos: VideoClip[];
  /** Optional reference photo path relative to public/, control view only. */
  referencePhoto?: string | null;
  referenceOpacity?: number;
}

export interface ActiveScene {
  sceneId: string;
  /** Wall-clock start; both windows use Date.now()-based elapsed time. */
  startedAtMs: number;
}

/** One clip or a sequence from the project playlist. */
export interface ActiveVideo {
  queue: string[];
  index: number;
  startedAtMs: number;
  /** When set, black pause until this timestamp, then play queue[index+1]. */
  gapUntilMs?: number | null;
}

/** Shared runtime state mirrored to the projection window. */
export interface ShowState {
  project: ProjectDocument;
  calibrationMode: boolean;
  /**
   * When true (and calibrationMode is on), draw calib overlays on the
   * projection window too. Control preview always shows them in calib mode.
   */
  projectionShowCalibration: boolean;
  /** Hard blackout wins over calibration overlays. */
  blackout: boolean;
  /** After blackout, scenes must not auto-restart until released. */
  showArmed: boolean;
  volume: number;
  scene: ActiveScene | null;
  video: ActiveVideo | null;
  /**
   * Clip ids whose last frame should stay on the facade (holdLastFrame).
   * Earlier entries stay above later videos (must not be covered).
   */
  heldVideoIds: string[];
  selectedSceneId: string | null;
  selectedVideoId: string | null;
  /** Editor selection mirrored so projection highlights match. */
  selectedPolygonId: string | null;
  selectedPointIndex: number | null;
  selectedPathPointIndex: number | null;
  /** Corner index 0..3 when resizing a video rect. */
  selectedVideoHandle: number | null;
  editMode: 'polygons' | 'scenePath' | 'videoRect';
  gridVisible: boolean;
}

export const CHANNEL_NAME = 'helloween-show-v1';
export const STORAGE_KEY = 'helloween-project-v1';
export const DEFAULT_LOGICAL_WIDTH = 1920;
export const DEFAULT_LOGICAL_HEIGHT = 1080;
export const CONTROL_HEARTBEAT_MS = 500;
export const PROJECTION_TIMEOUT_MS = 2000;
export const DEFAULT_SCENE_DURATION_MS = 10_000;
export const SPIDER_SCENE_DURATION_MS = 16_000;
export const WITCH_SCENE_DURATION_MS = 12_000;
export const PUMPKIN_SCENE_DURATION_MS = 11_000;

export const ALL_FIGURE_KINDS: FigureKind[] = [
  'ghost',
  'ghostSpooky',
  'spider',
  'pumpkin',
  'witch',
  'phantomMask',
];

export type AudioCue = 'scene-start' | 'scene-accent' | 'stop';

export type ControlToProjection =
  | { type: 'hello'; role: 'control' }
  | { type: 'state'; state: ShowState; seq: number }
  | { type: 'heartbeat'; t: number; seq: number }
  | {
      type: 'audio-cue';
      cue: AudioCue;
      volume: number;
      figure?: FigureKind;
    };

export type ProjectionToControl =
  | { type: 'hello'; role: 'projection' }
  | { type: 'pong'; t: number }
  | { type: 'status'; fullscreen: boolean; audioReady: boolean };

export type BusMessage = ControlToProjection | ProjectionToControl;
