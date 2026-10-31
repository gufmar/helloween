import './styles/control.css';
import { canvasToLogical, clampLogical, isInsideContent } from './core/coords';
import { HistoryStack } from './core/history';
import { newId } from './core/id';
import { downloadJson, exportProjectJson, loadProjectFromStorage, saveProjectToStorage } from './core/storage';
import {
  CONTROL_HEARTBEAT_MS,
  VIDEO_SEQUENCE_GAP_MS,
  type Point,
  type Polygon,
  type ProjectDocument,
  type ShowState,
  type VideoClip,
} from './core/types';
import {
  clampVideoRect,
  createVideoClip,
  fetchAvailableVideoFiles,
  fileNameFromVideoSrc,
  findVideoClip,
  pointInVideoRect,
  reorderVideos,
  sequenceQueueIds,
  videoCorners,
} from './core/videos';
import {
  calibrationInvalidatingChange,
  cloneProject,
  createEmptyProject,
  hasClosedWall,
  nextPolygonName,
  parseProjectDocument,
  pruneEmptyPolygons,
} from './core/validation';
import { Compositor } from './render/compositor';
import {
  activeVideoClip,
  beginSequenceGap,
  clearPlaySession,
  finishSequenceGap,
  isActiveVideoFinished,
  pauseAllVideos,
  setVideoHost,
  withHeldClip,
  withoutHeldClip,
} from './render/video-playback';
import {
  canSetSinkId,
  getCachedAudioOutputs,
  refreshAudioOutputDevices,
  type AudioOutputDevice,
} from './audio/outputs';
import { ShowBus } from './sync/channel';
import { ShowAudio } from './audio/show-audio';
import { createInitialShowState } from './ui/state';

const NUDGE = 1;
const NUDGE_FAST = 8;
/** Hit radius in CSS pixels; converted to logical space via viewport scale. */
const HANDLE_HIT_CSS = 18;

const appEl = document.querySelector<HTMLDivElement>('#app');
if (!appEl) throw new Error('#app missing');
const app: HTMLDivElement = appEl;

const history = new HistoryStack<ProjectDocument>(loadProjectFromStorage());
let state: ShowState = createInitialShowState(history.state);
let seq = 0;
let projectionConnected = false;
let lastPong = 0;
let projectionWindow: Window | null = null;
let audioReady = false;
let showReference = false;
let referenceImage: HTMLImageElement | null = null;
let drag:
  | { kind: 'poly'; polyId: string; index: number; snapshot: ProjectDocument }
  | {
      kind: 'video-move';
      videoId: string;
      offsetX: number;
      offsetY: number;
      snapshot: ProjectDocument;
    }
  | {
      kind: 'video-resize';
      videoId: string;
      handle: number;
      snapshot: ProjectDocument;
    }
  | null = null;
/** Clip ids played this session (grey list marker; replay still allowed). */
const playedVideoIds = new Set<string>();
/** Skip video-list rebuild mid drag-reorder. */
let videoListDragFromId: string | null = null;
let availableVideoFiles: string[] = [];
let audioOutputs: AudioOutputDevice[] = getCachedAudioOutputs();
let aspectWarning: string[] = [];
let editorFeedback =
  'Calibration: start with + Wall or + Exclude. A rectangle appears for adjusting.';
let editorFeedbackKind: 'ok' | 'err' | '' = '';

const bus = new ShowBus();
const audio = new ShowAudio();

function clearShowPlaybackState(): Partial<ShowState> {
  return {
    selectedSceneId: null,
    scene: null,
    video: null,
    heldVideoIds: [],
    selectedPathPointIndex: null,
  };
}

function setFeedback(msg: string, kind: 'ok' | 'err' | '' = ''): void {
  editorFeedback = msg;
  editorFeedbackKind = kind;
  const el = app.querySelector('#editor-feedback');
  if (el) {
    el.textContent = msg;
    el.className = 'editor-feedback' + (kind ? ` ${kind}` : '');
  }
}

function defaultRect(doc: ProjectDocument, insetRatio: number): Point[] {
  const w = doc.meta.logicalWidth;
  const h = doc.meta.logicalHeight;
  const x0 = w * insetRatio;
  const y0 = h * insetRatio;
  const x1 = w * (1 - insetRatio);
  const y1 = h * (1 - insetRatio);
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

app.innerHTML = `
  <aside class="sidebar" id="sidebar">
    <div class="brand">Media-Projector<span>Facade calibration · video placement</span></div>

    <div class="section" data-section="windows">
      <button type="button" class="section-toggle" aria-expanded="true"><span class="section-title">Windows</span><span class="section-chevron" aria-hidden="true"></span></button>
      <div class="section-body">
      <div class="row">
        <button type="button" id="btn-open-proj" class="primary">Open projection window</button>
      </div>
      <div class="row">
        <button type="button" id="btn-audio">Unlock audio</button>
      </div>
      <p class="status" id="conn-status"><span class="dot" id="conn-dot"></span><span id="conn-label">Projection: disconnected</span></p>
      <p class="hint">Allow pop-ups. Drag the window to the projector, focus it there, then press <strong>Space</strong> (audio + fullscreen).</p>
      </div>
    </div>

    <div class="section" data-section="show">
      <button type="button" class="section-toggle" aria-expanded="true"><span class="section-title">Show</span><span class="section-chevron" aria-hidden="true"></span></button>
      <div class="section-body">
      <div class="row">
        <button type="button" id="btn-calib">Calibration</button>
        <button type="button" id="btn-blackout" class="danger">Blackout now</button>
      </div>
      <div class="row">
        <button type="button" id="btn-arm" disabled>Arm show</button>
      </div>
      <label class="inline">Volume
        <input type="range" id="vol" min="0" max="100" value="40" />
      </label>
      <p class="status" id="show-status"></p>
      </div>
    </div>

    <div class="section" data-section="calibration">
      <button type="button" class="section-toggle" aria-expanded="true"><span class="section-title">Calibration</span><span class="section-chevron" aria-hidden="true"></span></button>
      <div class="section-body">
      <div class="row">
        <button type="button" id="btn-add-wall">+ Wall</button>
        <button type="button" id="btn-add-excl">+ Exclude</button>
      </div>
      <div class="row">
        <button type="button" id="btn-close-poly">Close polygon</button>
        <button type="button" id="btn-del-poly" class="danger">Delete</button>
      </div>
      <div class="row">
        <button type="button" id="btn-prune-empty">Remove empty entries</button>
      </div>
      <div class="row">
        <button type="button" id="btn-undo">Undo</button>
        <button type="button" id="btn-redo">Redo</button>
      </div>
      <div class="row">
        <label class="inline"><input type="checkbox" id="chk-grid" checked /> Grid</label>
        <label class="inline"><input type="checkbox" id="chk-ref" /> Reference photo</label>
      </div>
      <div class="row">
        <label class="inline"><input type="checkbox" id="chk-proj-calib" /> Show calibration on projector</label>
      </div>
      <p class="hint">Guide lines on the projector only when “Show calibration on projector” is on. The control preview always shows them while calibration mode is on.</p>
      <label class="inline">Name
        <input type="text" id="poly-name" placeholder="Polygon name" />
      </label>
      <label class="inline">Exclude padding (px)
        <input type="number" id="exclude-pad" min="0" max="200" step="1" />
      </label>
      <div class="poly-list" id="poly-list"></div>
      <p class="hint">+ Wall / + Exclude adds a rectangle. Drag corners or use arrow keys (Shift = 8px). Then close the polygon. Extra corners: click on the preview.</p>
      </div>
    </div>

    <div class="section" data-section="videos">
      <button type="button" class="section-toggle" aria-expanded="true"><span class="section-title">Videos</span><span class="section-chevron" aria-hidden="true"></span></button>
      <div class="section-body">
      <div class="row">
        <button type="button" id="btn-video-refresh">Refresh files</button>
        <button type="button" id="btn-add-video">+ Clip</button>
      </div>
      <label class="inline">File
        <select id="video-file-select"></select>
      </label>
      <div class="row">
        <button type="button" id="btn-play-video-seq" class="primary">Play sequence (selection)</button>
        <button type="button" id="btn-stop-video">Stop video</button>
      </div>
      <div class="row">
        <button type="button" id="btn-clear-played">Clear played marks &amp; held frames</button>
        <button type="button" id="btn-audio-outputs">Load speakers</button>
        <button type="button" id="btn-del-video" class="danger">Delete clip</button>
      </div>
      <label class="inline">Name
        <input type="text" id="video-name" placeholder="Clip name" />
      </label>
      <label class="inline"><input type="checkbox" id="chk-video-muted" /> Muted</label>
      <label class="inline"><input type="checkbox" id="chk-video-hold" /> Hold last frame</label>
      <div class="poly-list video-list" id="video-list"></div>
      <p class="hint">Drop MP4/WebM in <code>media/videos/</code>, refresh, then add clips. ▶ plays one clip (replay anytime). Checkboxes include clips in the sequence. Drag ⠿ to reorder. Grey rows = played this session. Hold last frame keeps the end frame visible (not covered by later clips). ${(VIDEO_SEQUENCE_GAP_MS / 1000).toFixed(0)}s gap between sequence clips. Load speakers, then pick output per clip (Chrome/Edge).</p>
      </div>
    </div>

    <div class="section" data-section="project">
      <button type="button" class="section-toggle" aria-expanded="true"><span class="section-title">Project</span><span class="section-chevron" aria-hidden="true"></span></button>
      <div class="section-body">
      <div class="row">
        <button type="button" id="btn-save">Save locally</button>
        <button type="button" id="btn-export">Export JSON</button>
      </div>
      <div class="row">
        <label class="file-btn">Import JSON<input type="file" id="file-import" accept="application/json,.json" /></label>
        <button type="button" id="btn-reset">New project</button>
      </div>
      <p class="status" id="project-meta"></p>
      <div class="warn-banner" id="aspect-warn" hidden></div>
      </div>
    </div>

    <div class="section" data-section="calib-note">
      <button type="button" class="section-toggle" aria-expanded="true"><span class="section-title">Calibration note</span><span class="section-chevron" aria-hidden="true"></span></button>
      <div class="section-body">
      <p class="hint">Recalibrate when the projector moves, zoom changes, keystone or image correction changes, output format changes, or logical resolution / aspect ratio changes. This tool does not change projector settings.</p>
      </div>
    </div>
  </aside>
  <div class="split-resizer" id="split-resizer" role="separator" aria-orientation="vertical" aria-label="Sidebar width"></div>
  <main class="stage">
    <div class="stage-toolbar">
      <span id="logic-label"></span>
      <span id="edit-label"></span>
      <div class="editor-feedback" id="editor-feedback"></div>
    </div>
    <div class="stage-canvas-wrap" id="canvas-wrap">
      <canvas id="preview"></canvas>
    </div>
  </main>
`;

const canvas = app.querySelector<HTMLCanvasElement>('#preview')!;
const canvasWrap = app.querySelector<HTMLElement>('#canvas-wrap')!;
const compositor = new Compositor(canvas);
setVideoHost(canvasWrap);

const SECTION_COLLAPSE_KEY = 'helloween-section-collapsed-v1';
const SIDEBAR_WIDTH_KEY = 'helloween-sidebar-width-v1';
const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 640;

function loadCollapsedSections(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SECTION_COLLAPSE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function saveCollapsedSections(map: Record<string, boolean>): void {
  try {
    localStorage.setItem(SECTION_COLLAPSE_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

function initCollapsibleSections(): void {
  const collapsed = loadCollapsedSections();
  app.querySelectorAll<HTMLElement>('.section[data-section]').forEach((section) => {
    const id = section.dataset.section;
    if (!id) return;
    const toggle = section.querySelector<HTMLButtonElement>('.section-toggle');
    if (!toggle) return;
    const apply = (isCollapsed: boolean) => {
      section.classList.toggle('collapsed', isCollapsed);
      toggle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      collapsed[id] = isCollapsed;
      saveCollapsedSections(collapsed);
    };
    if (collapsed[id]) apply(true);
    toggle.addEventListener('click', () => {
      apply(!section.classList.contains('collapsed'));
    });
  });
}

function applySidebarWidth(px: number): void {
  const clamped = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Math.round(px)));
  app.style.setProperty('--sidebar-width', `${clamped}px`);
  try {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clamped));
  } catch {
    /* quota */
  }
}

function initSidebarResizer(): void {
  const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
  if (Number.isFinite(stored) && stored > 0) applySidebarWidth(stored);
  else applySidebarWidth(320);

  const handle = app.querySelector<HTMLElement>('#split-resizer');
  if (!handle) return;

  let dragging = false;
  handle.addEventListener('pointerdown', (ev) => {
    dragging = true;
    handle.classList.add('dragging');
    handle.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  handle.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    const rect = app.getBoundingClientRect();
    applySidebarWidth(ev.clientX - rect.left);
    compositor.resizeToClient();
  });
  const end = (ev: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    if (handle.hasPointerCapture(ev.pointerId)) {
      try {
        handle.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
    }
    compositor.resizeToClient();
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

initCollapsibleSections();
initSidebarResizer();

function touchProject(mutator: (doc: ProjectDocument) => void, record = true): void {
  const next = cloneProject(history.state);
  mutator(next);
  next.meta.updatedAt = new Date().toISOString();
  if (record) history.push(next);
  else history.setSilent(next);
  state = { ...state, project: history.state };
  if (record) persistSoft();
  broadcastState();
  refreshUi();
}

function persistSoft(): void {
  try {
    saveProjectToStorage(history.state);
  } catch {
    /* quota */
  }
}

function broadcastState(): void {
  seq += 1;
  bus.post({ type: 'state', state, seq });
}

function setState(patch: Partial<ShowState>, broadcast = true): void {
  state = { ...state, ...patch };
  refreshUi();
  if (broadcast) broadcastState();
}

function refreshConnectionUi(): void {
  const connDot = app.querySelector('#conn-dot');
  const connLabel = app.querySelector('#conn-label');
  if (connDot) {
    connDot.className = projectionConnected ? 'dot ok' : 'dot bad';
  }
  if (connLabel) {
    connLabel.innerHTML = projectionConnected
      ? '<strong>Projection: connected</strong>'
      : 'Projection: disconnected';
  }
}

function refreshUi(): void {
  refreshConnectionUi();

  const showStatus = app.querySelector('#show-status');
  if (showStatus) {
    const parts: string[] = [];
    parts.push(state.calibrationMode ? 'Calibration ON' : 'Calibration OFF');
    parts.push(state.blackout ? 'BLACKOUT' : state.showArmed ? 'armed' : 'locked');
    parts.push(hasClosedWall(state.project) ? 'wall OK' : 'no wall');
    const now = Date.now();
    if (state.video?.gapUntilMs != null && now < state.video.gapUntilMs) {
      const sec = Math.max(0, Math.ceil((state.video.gapUntilMs - now) / 1000));
      parts.push(`video gap (${sec}s)`);
    } else if (state.video) {
      const clip = activeVideoClip(state);
      const n = state.video.index + 1;
      const total = state.video.queue.length;
      parts.push(`video: ${clip?.name ?? '?'} (${n}/${total})`);
    } else if ((state.heldVideoIds?.length ?? 0) > 0) {
      parts.push(`held frames: ${state.heldVideoIds.length}`);
    } else {
      parts.push('idle');
    }
    if (audioReady) parts.push('audio ready');
    showStatus.textContent = parts.join(' · ');
  }

  app.querySelector('#btn-calib')?.classList.toggle('active', state.calibrationMode);
  const projCalib = app.querySelector<HTMLInputElement>('#chk-proj-calib');
  if (projCalib && document.activeElement !== projCalib) {
    projCalib.checked = state.projectionShowCalibration;
  }
  const armBtn = app.querySelector<HTMLButtonElement>('#btn-arm');
  if (armBtn) armBtn.disabled = state.showArmed && !state.blackout;
  const undoBtn = app.querySelector<HTMLButtonElement>('#btn-undo');
  if (undoBtn) undoBtn.disabled = !history.canUndo;
  const redoBtn = app.querySelector<HTMLButtonElement>('#btn-redo');
  if (redoBtn) redoBtn.disabled = !history.canRedo;

  const audioBtn = app.querySelector<HTMLButtonElement>('#btn-audio');
  if (audioBtn) {
    audioBtn.textContent = audioReady ? 'Audio ready' : 'Unlock audio';
    audioBtn.classList.toggle('active', audioReady);
  }

  const fb = app.querySelector('#editor-feedback');
  if (fb) {
    fb.textContent = editorFeedback;
    fb.className = 'editor-feedback' + (editorFeedbackKind ? ` ${editorFeedbackKind}` : '');
  }

  const meta = state.project.meta;
  const projectMeta = app.querySelector('#project-meta');
  if (projectMeta) {
    projectMeta.textContent =
      `${meta.name} · ${meta.logicalWidth}×${meta.logicalHeight} · AR ${(meta.logicalWidth / meta.logicalHeight).toFixed(4)} · v${meta.version}`;
  }
  const logicLabel = app.querySelector('#logic-label');
  if (logicLabel) {
    logicLabel.textContent =
      `Logical ${meta.logicalWidth}×${meta.logicalHeight} (letterbox, no distortion)`;
  }
  const editLabel = app.querySelector('#edit-label');
  if (editLabel) {
    const selVideo = findVideoClip(state.project, state.selectedVideoId);
    if (state.editMode === 'videoRect') {
      editLabel.textContent = `Mode: video (${selVideo?.name ?? '–'})`;
    } else {
      editLabel.textContent = 'Mode: polygons';
    }
  }

  const pad = app.querySelector<HTMLInputElement>('#exclude-pad');
  if (pad && document.activeElement !== pad) pad.value = String(meta.excludePadding);

  const warn = app.querySelector<HTMLDivElement>('#aspect-warn');
  if (warn) {
    if (aspectWarning.length) {
      warn.hidden = false;
      warn.textContent =
        'Warning: ' +
        aspectWarning.join(', ') +
        '. Existing calibration may be invalid. Verify on the wall.';
    } else {
      warn.hidden = true;
    }
  }

  renderPolyList();
  renderVideoFileSelect();
  renderVideoList();

  const sel = state.project.polygons.find((p) => p.id === state.selectedPolygonId);
  const nameInput = app.querySelector<HTMLInputElement>('#poly-name');
  if (nameInput) {
    nameInput.disabled = !sel;
    if (document.activeElement !== nameInput) {
      nameInput.value = sel?.name ?? '';
    }
  }

  const video = findVideoClip(state.project, state.selectedVideoId);
  const videoNameInput = app.querySelector<HTMLInputElement>('#video-name');
  if (videoNameInput) {
    videoNameInput.disabled = !video;
    if (document.activeElement !== videoNameInput) {
      videoNameInput.value = video?.name ?? '';
    }
  }
  const mutedChk = app.querySelector<HTMLInputElement>('#chk-video-muted');
  if (mutedChk && document.activeElement !== mutedChk) {
    mutedChk.disabled = !video;
    mutedChk.checked = video?.muted ?? false;
  }
  const holdChk = app.querySelector<HTMLInputElement>('#chk-video-hold');
  if (holdChk && document.activeElement !== holdChk) {
    holdChk.disabled = !video;
    holdChk.checked = video?.holdLastFrame ?? false;
  }
}

function renderVideoFileSelect(): void {
  const sel = app.querySelector<HTMLSelectElement>('#video-file-select');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '';
  if (availableVideoFiles.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '(no files in media/videos)';
    sel.appendChild(opt);
    return;
  }
  for (const name of availableVideoFiles) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  }
  if (prev && availableVideoFiles.includes(prev)) sel.value = prev;
}

function fillAudioOutputSelect(sel: HTMLSelectElement, selectedId: string): void {
  sel.innerHTML = '';
  const opts =
    audioOutputs.length > 0 ? audioOutputs : [{ deviceId: '', label: 'System default' }];
  for (const d of opts) {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = d.label;
    sel.appendChild(opt);
  }
  const ids = opts.map((d) => d.deviceId);
  sel.value = ids.includes(selectedId) ? selectedId : '';
}

function clearVideoDropIndicators(list: Element): void {
  for (const node of list.querySelectorAll('.video-item.drop-before, .video-item.drop-after')) {
    node.classList.remove('drop-before', 'drop-after');
  }
}

function renderVideoList(): void {
  const list = app.querySelector('#video-list');
  if (!list) return;
  const active = document.activeElement;
  if (active && list.contains(active)) return;
  if (videoListDragFromId) return;
  list.innerHTML = '';
  const videos = state.project.videos ?? [];
  if (videos.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'hint';
    empty.textContent = 'No video clips yet. Pick a file and + Clip.';
    list.appendChild(empty);
    return;
  }
  videos.forEach((clip, index) => {
    const el = document.createElement('div');
    el.className =
      'poly-item video-item' +
      (clip.id === state.selectedVideoId ? ' selected' : '') +
      (playedVideoIds.has(clip.id) ? ' is-played' : '');
    el.dataset.videoId = clip.id;

    const handle = document.createElement('span');
    handle.className = 'video-drag-handle';
    handle.title = 'Drag to reorder';
    handle.setAttribute('aria-label', 'Change order');
    handle.setAttribute('role', 'button');
    handle.tabIndex = 0;
    handle.textContent = '⠿';
    handle.draggable = true;
    handle.addEventListener('dragstart', (ev) => {
      ev.stopPropagation();
      videoListDragFromId = clip.id;
      ev.dataTransfer?.setData('text/plain', clip.id);
      ev.dataTransfer!.effectAllowed = 'move';
      el.classList.add('dragging');
    });
    handle.addEventListener('dragend', () => {
      videoListDragFromId = null;
      el.classList.remove('dragging');
      clearVideoDropIndicators(list);
      renderVideoList();
    });

    el.addEventListener('dragover', (ev) => {
      if (!videoListDragFromId || videoListDragFromId === clip.id) return;
      ev.preventDefault();
      ev.dataTransfer!.dropEffect = 'move';
      const rect = el.getBoundingClientRect();
      const before = ev.clientY < rect.top + rect.height / 2;
      clearVideoDropIndicators(list);
      el.classList.add(before ? 'drop-before' : 'drop-after');
    });
    el.addEventListener('dragleave', (ev) => {
      if (!el.contains(ev.relatedTarget as Node | null)) {
        el.classList.remove('drop-before', 'drop-after');
      }
    });
    el.addEventListener('drop', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const fromId = ev.dataTransfer?.getData('text/plain') || videoListDragFromId;
      clearVideoDropIndicators(list);
      el.classList.remove('dragging');
      videoListDragFromId = null;
      if (!fromId || fromId === clip.id) {
        renderVideoList();
        return;
      }
      const rect = el.getBoundingClientRect();
      const before = ev.clientY < rect.top + rect.height / 2;
      touchProject((doc) => {
        if (before) {
          doc.videos = reorderVideos(doc.videos, fromId, clip.id);
        } else {
          const idx = doc.videos.findIndex((v) => v.id === clip.id);
          const nextId = idx >= 0 ? doc.videos[idx + 1]?.id ?? null : null;
          doc.videos = reorderVideos(doc.videos, fromId, nextId);
        }
      });
      setFeedback('Video order updated.', 'ok');
    });

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'video-play';
    playBtn.title = 'Play';
    playBtn.textContent = '▶';
    playBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      setState({
        selectedVideoId: clip.id,
        selectedVideoHandle: null,
        editMode: 'videoRect',
      });
      playVideoQueue([clip.id]);
    });

    const seqLabel = document.createElement('label');
    seqLabel.className = 'video-seq';
    seqLabel.title = 'In sequence';
    const seqChk = document.createElement('input');
    seqChk.type = 'checkbox';
    seqChk.checked = clip.inSequence !== false;
    seqChk.addEventListener('click', (ev) => ev.stopPropagation());
    seqChk.addEventListener('change', () => {
      touchProject((doc) => {
        const c = doc.videos.find((v) => v.id === clip.id);
        if (c) c.inSequence = seqChk.checked;
      });
    });
    seqLabel.appendChild(seqChk);

    const info = document.createElement('button');
    info.type = 'button';
    info.className = 'poly-select';
    const file = fileNameFromVideoSrc(clip.src);
    const flags =
      (clip.muted ? ' · muted' : '') +
      (clip.holdLastFrame ? ' · hold' : '') +
      (state.heldVideoIds.includes(clip.id) ? ' · held' : '');
    info.innerHTML = `<span class="kind-wall">${index + 1}. ${escapeHtml(clip.name)}</span><span>${escapeHtml(file)}${flags}</span>`;
    info.addEventListener('click', () => {
      setState({
        selectedVideoId: clip.id,
        selectedVideoHandle: null,
        editMode: 'videoRect',
        calibrationMode: true,
      });
      setFeedback(`Video “${clip.name}”: drag the purple rectangle on the preview.`, 'ok');
    });

    const sink = document.createElement('select');
    sink.className = 'video-sink';
    sink.title = 'Speaker output';
    fillAudioOutputSelect(sink, clip.audioOutputId || '');
    sink.addEventListener('click', (ev) => ev.stopPropagation());
    sink.addEventListener('mousedown', (ev) => ev.stopPropagation());
    sink.addEventListener('change', () => {
      touchProject((doc) => {
        const c = doc.videos.find((v) => v.id === clip.id);
        if (c) c.audioOutputId = sink.value;
      });
      setFeedback(`Speaker for “${clip.name}” updated.`, 'ok');
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'poly-del';
    del.title = 'Delete';
    del.textContent = '×';
    del.addEventListener('click', (ev) => {
      ev.stopPropagation();
      deleteVideoById(clip.id);
    });

    el.appendChild(handle);
    el.appendChild(playBtn);
    el.appendChild(seqLabel);
    el.appendChild(info);
    el.appendChild(sink);
    el.appendChild(del);
    list.appendChild(el);
  });
}

function renderPolyList(): void {
  const list = app.querySelector('#poly-list');
  if (!list) return;
  list.innerHTML = '';
  if (state.project.polygons.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'hint';
    empty.textContent = 'No polygons yet.';
    list.appendChild(empty);
    return;
  }
  for (const poly of state.project.polygons) {
    const el = document.createElement('div');
    el.className = 'poly-item' + (poly.id === state.selectedPolygonId ? ' selected' : '');
    const info = document.createElement('button');
    info.type = 'button';
    info.className = 'poly-select';
    info.innerHTML = `<span class="kind-${poly.kind}">${escapeHtml(poly.name)}</span><span>${poly.closed ? 'closed' : 'open'} · ${poly.points.length} pt</span>`;
    info.addEventListener('click', () => {
      setState({
        selectedPolygonId: poly.id,
        selectedPointIndex: poly.points.length ? 0 : null,
        calibrationMode: true,
      });
      setFeedback(`${poly.name} selected.`, '');
      app.querySelector<HTMLInputElement>('#poly-name')?.focus();
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'poly-del';
    del.title = 'Delete';
    del.textContent = '×';
    del.addEventListener('click', (ev) => {
      ev.stopPropagation();
      deletePolygonById(poly.id);
    });
    el.appendChild(info);
    el.appendChild(del);
    list.appendChild(el);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function canStartShowMedia(): boolean {
  if (state.video) {
    setFeedback('Something is already playing. Stop video first.', 'err');
    return false;
  }
  if (state.blackout || !state.showArmed) {
    setFeedback('Show is locked (blackout). Use Arm show first.', 'err');
    return false;
  }
  if (!hasClosedWall(state.project)) {
    setFeedback('No closed wall polygon. Add + Wall, adjust corners, then close the polygon.', 'err');
    return false;
  }
  return true;
}

function markVideoPlayed(id: string): void {
  if (playedVideoIds.has(id)) return;
  playedVideoIds.add(id);
  const row = app.querySelector(`.video-item[data-video-id="${CSS.escape(id)}"]`);
  row?.classList.add('is-played');
}

function clearPlayedMarks(): void {
  playedVideoIds.clear();
  pauseAllVideos();
  setState({ heldVideoIds: [] });
  renderVideoList();
  setFeedback('Played marks and held frames cleared.', 'ok');
}

async function refreshVideoFiles(): Promise<void> {
  availableVideoFiles = await fetchAvailableVideoFiles();
  renderVideoFileSelect();
  setFeedback(
    availableVideoFiles.length
      ? `${availableVideoFiles.length} video file(s) found.`
      : 'No MP4/WebM in media/videos/. Add files there, then refresh.',
    availableVideoFiles.length ? 'ok' : '',
  );
}

function addVideoFromSelect(): void {
  const sel = app.querySelector<HTMLSelectElement>('#video-file-select');
  const fileName = sel?.value?.trim();
  if (!fileName) {
    setFeedback('No file selected. Refresh files first.', 'err');
    return;
  }
  const already = state.project.videos.some(
    (v) => fileNameFromVideoSrc(v.src) === fileName,
  );
  if (already) {
    setFeedback(`“${fileName}” is already a clip.`, '');
    return;
  }
  const { logicalWidth: w, logicalHeight: h } = history.state.meta;
  const clip = createVideoClip(fileName, undefined, w, h);
  touchProject((doc) => {
    if (!doc.videos) doc.videos = [];
    doc.videos.push(clip);
  });
  setState({
    selectedVideoId: clip.id,
    selectedVideoHandle: null,
    editMode: 'videoRect',
    calibrationMode: true,
  });
  setFeedback(`Clip “${clip.name}” added. Position the purple rectangle.`, 'ok');
}

function deleteVideoById(id: string): void {
  const clip = findVideoClip(state.project, id);
  if (!clip) return;
  touchProject((doc) => {
    doc.videos = doc.videos.filter((v) => v.id !== id);
  });
  const clear = state.selectedVideoId === id;
  setState({
    selectedVideoId: clear ? history.state.videos[0]?.id ?? null : state.selectedVideoId,
    selectedVideoHandle: null,
    heldVideoIds: withoutHeldClip(state.heldVideoIds, id),
    video: state.video && state.video.queue.includes(id) ? null : state.video,
  });
  setFeedback(`Clip “${clip.name}” deleted.`, 'ok');
}

function playVideoQueue(queue: string[]): void {
  if (!canStartShowMedia()) return;
  if (queue.length === 0) {
    setFeedback('No clips in queue.', 'err');
    return;
  }
  const first = findVideoClip(state.project, queue[0]);
  if (!first) {
    setFeedback('First clip missing from project.', 'err');
    return;
  }
  clearPlaySession();
  setState({
    scene: null,
    video: { queue, index: 0, startedAtMs: Date.now() },
    selectedVideoId: first.id,
    calibrationMode: false,
    heldVideoIds: withoutHeldClip(state.heldVideoIds, first.id),
  });
  markVideoPlayed(first.id);
  setFeedback(
    queue.length === 1
      ? `Playing “${first.name}”.`
      : `Sequence started (${queue.length} clips), first: “${first.name}”.`,
    'ok',
  );
}

function playVideoSequence(): void {
  const queue = sequenceQueueIds(state.project);
  if (queue.length === 0) {
    setFeedback('No clips checked for sequence.', 'err');
    return;
  }
  playVideoQueue(queue);
}

function stopVideoOnly(): void {
  if (!state.video) {
    setFeedback('No video playing.', '');
    return;
  }
  clearPlaySession();
  setState({ video: null });
  setFeedback('Video stopped.', 'ok');
}

async function loadAudioOutputs(): Promise<void> {
  if (!canSetSinkId()) {
    setFeedback('Per-clip speakers need Chrome or Edge (setSinkId).', 'err');
    return;
  }
  try {
    audioOutputs = await refreshAudioOutputDevices();
    renderVideoList();
    setFeedback(
      `${Math.max(0, audioOutputs.length - 1)} output(s) found. Pick one per clip.`,
      'ok',
    );
  } catch (err) {
    setFeedback(
      'Load speakers failed: ' + (err instanceof Error ? err.message : String(err)),
      'err',
    );
  }
}

function mutateSelectedVideo(mutator: (clip: VideoClip) => void, record = true): void {
  const id = state.selectedVideoId;
  if (!id) return;
  touchProject((doc) => {
    const clip = doc.videos.find((v) => v.id === id);
    if (!clip) return;
    mutator(clip);
    Object.assign(clip, clampVideoRect(clip, doc.meta.logicalWidth, doc.meta.logicalHeight));
  }, record);
}

function resizeVideoByHandle(clip: VideoClip, handle: number, logical: Point): void {
  const right = clip.x + clip.width;
  const bottom = clip.y + clip.height;
  if (handle === 0) {
    clip.width = right - logical.x;
    clip.height = bottom - logical.y;
    clip.x = logical.x;
    clip.y = logical.y;
  } else if (handle === 1) {
    clip.width = logical.x - clip.x;
    clip.height = bottom - logical.y;
    clip.y = logical.y;
  } else if (handle === 2) {
    clip.width = logical.x - clip.x;
    clip.height = logical.y - clip.y;
  } else {
    clip.width = right - logical.x;
    clip.height = logical.y - clip.y;
    clip.x = logical.x;
  }
}

function openProjection(): void {
  const url = new URL('projection.html', window.location.href).href;
  projectionWindow = window.open(url, 'media-projector-projection', 'popup=yes,width=1280,height=720');
  if (!projectionWindow) {
    alert('Pop-up blocked. Allow pop-ups for this site and try again.');
    return;
  }
  bus.post({ type: 'hello', role: 'control' });
  broadcastState();
}

function blackoutNow(): void {
  pauseAllVideos();
  audio.stopAll();
  bus.post({ type: 'audio-cue', cue: 'stop', volume: state.volume });
  setState({
    blackout: true,
    showArmed: false,
    scene: null,
    video: null,
    heldVideoIds: [],
  });
}

function armShow(): void {
  setState({ blackout: false, showArmed: true });
}

function selectedPolygon(): Polygon | null {
  return state.project.polygons.find((p) => p.id === state.selectedPolygonId) ?? null;
}

function addPolygon(kind: Polygon['kind']): void {
  const inset = kind === 'wall' ? 0.08 : 0.35;
  const points = defaultRect(history.state, inset);
  const poly: Polygon = {
    id: newId(kind),
    name: nextPolygonName(history.state, kind),
    kind,
    planeId: 'facade-a',
    closed: false,
    points,
  };
  touchProject((doc) => {
    doc.polygons.push(poly);
  });
  setState({
    selectedPolygonId: poly.id,
    selectedPointIndex: 0,
    calibrationMode: true,
  });
  setFeedback(
    `${poly.name} added (rectangle, open). Drag corners, then close the polygon.`,
    'ok',
  );
  app.querySelector('#poly-list')?.scrollIntoView({ block: 'nearest' });
}

function closePolygon(): void {
  const poly = selectedPolygon();
  if (!poly) {
    setFeedback('No polygon selected. Use + Wall / + Exclude or pick one in the list.', 'err');
    return;
  }
  if (poly.closed) {
    setFeedback(`${poly.name} is already closed.`, '');
    return;
  }
  if (poly.points.length < 3) {
    setFeedback(
      `${poly.name} has only ${poly.points.length} point(s). At least 3 corners required.`,
      'err',
    );
    return;
  }
  touchProject((doc) => {
    const p = doc.polygons.find((x) => x.id === poly.id);
    if (p) p.closed = true;
  });
  setFeedback(
    `${poly.name} closed.` + (poly.kind === 'exclude' ? ' Exclude is active after closing.' : ''),
    'ok',
  );
}

function deletePolygonById(id: string): void {
  const target = state.project.polygons.find((p) => p.id === id);
  if (!target) {
    setFeedback('Polygon not found.', 'err');
    return;
  }
  touchProject((doc) => {
    doc.polygons = doc.polygons.filter((p) => p.id !== id);
  });
  const clearSel = state.selectedPolygonId === id;
  setState({
    selectedPolygonId: clearSel ? null : state.selectedPolygonId,
    selectedPointIndex: clearSel ? null : state.selectedPointIndex,
  });
  setFeedback(`${target.name} deleted.`, 'ok');
}

function deleteSelectedPolygon(): void {
  const id = state.selectedPolygonId;
  if (!id) {
    setFeedback('No polygon selected to delete. Pick one in the list or use ×.', 'err');
    return;
  }
  deletePolygonById(id);
}

function pruneEmptyEntries(): void {
  const before = history.state.polygons.length;
  const cleaned = pruneEmptyPolygons(history.state);
  const removed = before - cleaned.polygons.length;
  if (removed === 0) {
    setFeedback('No empty polygons (0 points) found.', '');
    return;
  }
  history.push(cleaned);
  state = {
    ...state,
    project: history.state,
    editMode: 'polygons',
    selectedPolygonId: cleaned.polygons.some((p) => p.id === state.selectedPolygonId)
      ? state.selectedPolygonId
      : null,
    selectedPointIndex: null,
  };
  persistSoft();
  broadcastState();
  refreshUi();
  setFeedback(`Removed ${removed} empty entr${removed === 1 ? 'y' : 'ies'}.`, 'ok');
}

function hitTestHandle(logical: Point): {
  kind: 'poly' | 'video-handle' | 'video-body';
  polyId?: string;
  videoId?: string;
  index: number;
} | null {
  const vp = compositor.viewport;
  if (!vp || vp.scale <= 0) return null;
  const thresh = HANDLE_HIT_CSS / vp.scale;

  if (state.editMode === 'videoRect') {
    const clip = findVideoClip(state.project, state.selectedVideoId);
    if (clip) {
      const corners = videoCorners(clip);
      for (let i = corners.length - 1; i >= 0; i--) {
        const p = corners[i];
        if (Math.hypot(p.x - logical.x, p.y - logical.y) <= thresh) {
          return { kind: 'video-handle', videoId: clip.id, index: i };
        }
      }
      if (pointInVideoRect(clip, logical)) {
        return { kind: 'video-body', videoId: clip.id, index: 0 };
      }
    }
    return null;
  }

  for (let pi = state.project.polygons.length - 1; pi >= 0; pi--) {
    const poly = state.project.polygons[pi];
    for (let i = poly.points.length - 1; i >= 0; i--) {
      const p = poly.points[i];
      if (Math.hypot(p.x - logical.x, p.y - logical.y) <= thresh) {
        return { kind: 'poly', polyId: poly.id, index: i };
      }
    }
  }
  return null;
}

function eventToLogical(ev: PointerEvent, duringDrag = false): Point | null {
  const vp = compositor.viewport;
  if (!vp || vp.scale <= 0) return null;
  const rect = canvas.getBoundingClientRect();
  const canvasPt = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  if (!duringDrag && !isInsideContent(canvasPt, vp)) return null;
  return clampLogical(
    canvasToLogical(canvasPt, vp),
    state.project.meta.logicalWidth,
    state.project.meta.logicalHeight,
  );
}

function applyDragPoint(logical: Point): void {
  const active = drag;
  if (!active) return;
  const next = cloneProject(history.state);
  if (active.kind === 'poly') {
    const p = next.polygons.find((x) => x.id === active.polyId);
    if (p?.points[active.index]) p.points[active.index] = logical;
    history.setSilent(next);
    state = {
      ...state,
      project: history.state,
      selectedPolygonId: active.polyId,
      selectedPointIndex: active.index,
      editMode: 'polygons',
    };
  } else if (active.kind === 'video-move') {
    const clip = next.videos.find((v) => v.id === active.videoId);
    if (clip) {
      clip.x = logical.x - active.offsetX;
      clip.y = logical.y - active.offsetY;
      Object.assign(clip, clampVideoRect(clip, next.meta.logicalWidth, next.meta.logicalHeight));
    }
    history.setSilent(next);
    state = { ...state, project: history.state, selectedVideoId: active.videoId, editMode: 'videoRect' };
  } else if (active.kind === 'video-resize') {
    const clip = next.videos.find((v) => v.id === active.videoId);
    if (clip) {
      resizeVideoByHandle(clip, active.handle, logical);
      Object.assign(clip, clampVideoRect(clip, next.meta.logicalWidth, next.meta.logicalHeight));
    }
    history.setSilent(next);
    state = {
      ...state,
      project: history.state,
      selectedVideoId: active.videoId,
      selectedVideoHandle: active.handle,
      editMode: 'videoRect',
    };
  }
  broadcastState();
}

canvas.addEventListener('pointerdown', (ev) => {
  if (!state.calibrationMode) {
    setFeedback('Calibration is off. Turn on Calibration.', 'err');
    return;
  }
  const logical = eventToLogical(ev, false);
  if (!logical) return;
  ev.preventDefault();
  canvas.setPointerCapture(ev.pointerId);

  const hit = hitTestHandle(logical);
  if (hit) {
    if (hit.kind === 'video-handle' && hit.videoId) {
      state = {
        ...state,
        selectedVideoId: hit.videoId,
        selectedVideoHandle: hit.index,
        editMode: 'videoRect',
      };
      drag = {
        kind: 'video-resize',
        videoId: hit.videoId,
        handle: hit.index,
        snapshot: cloneProject(history.state),
      };
      refreshUi();
      broadcastState();
      setFeedback(`Video corner ${hit.index + 1}: drag to resize.`, '');
    } else if (hit.kind === 'video-body' && hit.videoId) {
      const clip = findVideoClip(state.project, hit.videoId);
      if (!clip) return;
      state = {
        ...state,
        selectedVideoId: hit.videoId,
        selectedVideoHandle: null,
        editMode: 'videoRect',
      };
      drag = {
        kind: 'video-move',
        videoId: hit.videoId,
        offsetX: logical.x - clip.x,
        offsetY: logical.y - clip.y,
        snapshot: cloneProject(history.state),
      };
      refreshUi();
      broadcastState();
      setFeedback('Drag to move video rectangle.', '');
    } else if (hit.polyId) {
      state = {
        ...state,
        selectedPolygonId: hit.polyId,
        selectedPointIndex: hit.index,
        editMode: 'polygons',
      };
      drag = {
        kind: 'poly',
        polyId: hit.polyId,
        index: hit.index,
        snapshot: cloneProject(history.state),
      };
      refreshUi();
      broadcastState();
      setFeedback(`Corner ${hit.index + 1} selected — drag to move.`, '');
    }
    return;
  }

  if (state.editMode === 'videoRect') {
    setFeedback('Missed video rectangle. Select a clip in the list, then hit its area or corner.', 'err');
    return;
  }

  let poly = selectedPolygon();
  if (!poly) {
    setFeedback('No active polygon. Use + Wall or + Exclude first.', 'err');
    return;
  }
  if (poly.closed) {
    setFeedback(
      `${poly.name} is closed. Add a new polygon or use Undo to extend.`,
      '',
    );
    return;
  }

  const polyId = poly.id;
  touchProject((doc) => {
    const p = doc.polygons.find((x) => x.id === polyId);
    if (!p || p.closed) return;
    p.points.push(logical);
  });
  setState({
    selectedPolygonId: polyId,
    selectedPointIndex: (selectedPolygon()?.points.length ?? 1) - 1,
  });
  setFeedback(`Point added (${selectedPolygon()?.points.length ?? 0}).`, 'ok');
});

canvas.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const logical = eventToLogical(ev, true);
  if (!logical) return;
  applyDragPoint(logical);
});

function endDrag(ev?: PointerEvent): void {
  if (!drag) return;
  if (ev && canvas.hasPointerCapture(ev.pointerId)) {
    try {
      canvas.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
  }
  const final = cloneProject(history.state);
  const moved = JSON.stringify(final) !== JSON.stringify(drag.snapshot);
  history.setSilent(drag.snapshot);
  if (moved) {
    history.push(final);
  } else {
    history.setSilent(final);
  }
  const mode =
    drag?.kind === 'video-move' || drag?.kind === 'video-resize' ? 'videoRect' : 'polygons';
  state = { ...state, project: history.state, editMode: mode };
  drag = null;
  persistSoft();
  broadcastState();
  refreshUi();
}

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

window.addEventListener('keydown', (ev) => {
  if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;

  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
    ev.preventDefault();
    if (ev.shiftKey) {
      history.redo();
    } else {
      history.undo();
    }
    state = { ...state, project: history.state, editMode: 'polygons' };
    persistSoft();
    broadcastState();
    refreshUi();
    return;
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') {
    ev.preventDefault();
    history.redo();
    state = { ...state, project: history.state, editMode: 'polygons' };
    persistSoft();
    broadcastState();
    refreshUi();
    return;
  }

  if (!state.calibrationMode) return;
  const step = ev.shiftKey ? NUDGE_FAST : NUDGE;
  let dx = 0;
  let dy = 0;
  if (ev.key === 'ArrowLeft') dx = -step;
  else if (ev.key === 'ArrowRight') dx = step;
  else if (ev.key === 'ArrowUp') dy = -step;
  else if (ev.key === 'ArrowDown') dy = step;
  else return;
  ev.preventDefault();

  if (state.editMode === 'videoRect' && state.selectedVideoId) {
    mutateSelectedVideo((clip) => {
      clip.x += dx;
      clip.y += dy;
    });
    return;
  }

  const poly = selectedPolygon();
  if (!poly || state.selectedPointIndex == null) return;
  const idx = state.selectedPointIndex;
  const polyId = poly.id;
  touchProject((doc) => {
    const p = doc.polygons.find((x) => x.id === polyId);
    const pt = p?.points[idx];
    if (!pt || !p) return;
    p.points[idx] = clampLogical(
      { x: pt.x + dx, y: pt.y + dy },
      doc.meta.logicalWidth,
      doc.meta.logicalHeight,
    );
  });
});

app.querySelector('#btn-open-proj')!.addEventListener('click', openProjection);
app.querySelector('#btn-audio')!.addEventListener('click', async () => {
  try {
    await audio.unlock();
    audio.setVolume(state.volume);
    audioReady = true;
  } catch (err) {
    audioReady = false;
    setFeedback(
      'Audio context failed: ' + (err instanceof Error ? err.message : String(err)),
      'err',
    );
    refreshUi();
    return;
  }
  try {
    audio.playUnlockChime();
  } catch {
    /* optional */
  }
  setFeedback(
    'Audio unlocked on control. On the projector: focus the projection window and press Space.',
    'ok',
  );
  refreshUi();
});
app.querySelector('#btn-calib')!.addEventListener('click', () => {
  const next = !state.calibrationMode;
  setState({ calibrationMode: next });
  setFeedback(next ? 'Calibration mode on.' : 'Calibration mode off.', 'ok');
});
app.querySelector('#btn-blackout')!.addEventListener('click', () => {
  blackoutNow();
  setFeedback('Blackout active. Use Arm show to continue.', 'ok');
});
app.querySelector('#btn-arm')!.addEventListener('click', () => {
  armShow();
  setFeedback('Show armed.', 'ok');
});
app.querySelector('#vol')!.addEventListener('input', (ev) => {
  const v = Number((ev.target as HTMLInputElement).value) / 100;
  audio.setVolume(v);
  setState({ volume: v });
});
app.querySelector('#btn-add-wall')!.addEventListener('click', () => addPolygon('wall'));
app.querySelector('#btn-add-excl')!.addEventListener('click', () => addPolygon('exclude'));
app.querySelector('#btn-close-poly')!.addEventListener('click', closePolygon);
app.querySelector('#btn-del-poly')!.addEventListener('click', deleteSelectedPolygon);
app.querySelector('#btn-prune-empty')!.addEventListener('click', pruneEmptyEntries);
app.querySelector('#btn-undo')!.addEventListener('click', () => {
  history.undo();
  state = { ...state, project: history.state, editMode: 'polygons' };
  persistSoft();
  broadcastState();
  refreshUi();
});
app.querySelector('#btn-redo')!.addEventListener('click', () => {
  history.redo();
  state = { ...state, project: history.state, editMode: 'polygons' };
  persistSoft();
  broadcastState();
  refreshUi();
});
app.querySelector('#chk-grid')!.addEventListener('change', (ev) => {
  setState({ gridVisible: (ev.target as HTMLInputElement).checked });
});
app.querySelector('#chk-proj-calib')!.addEventListener('change', (ev) => {
  const on = (ev.target as HTMLInputElement).checked;
  setState({ projectionShowCalibration: on });
  setFeedback(
    on
      ? 'Calibration guides visible on the projector too.'
      : 'Calibration guides only in the control preview.',
    'ok',
  );
});
app.querySelector('#chk-ref')!.addEventListener('change', (ev) => {
  showReference = (ev.target as HTMLInputElement).checked;
  if (showReference && !referenceImage) {
    void tryLoadReference();
  }
});
app.querySelector('#poly-name')!.addEventListener('input', (ev) => {
  const name = (ev.target as HTMLInputElement).value;
  const id = state.selectedPolygonId;
  if (!id) return;
  const next = cloneProject(history.state);
  const p = next.polygons.find((x) => x.id === id);
  if (!p) return;
  p.name = name;
  history.setSilent(next);
  state = { ...state, project: history.state, editMode: 'polygons' };
  broadcastState();
  const selected = app.querySelector('.poly-item.selected .kind-wall, .poly-item.selected .kind-exclude');
  if (selected) selected.textContent = name || p.name;
});
app.querySelector('#poly-name')!.addEventListener('change', (ev) => {
  const name = (ev.target as HTMLInputElement).value.trim();
  const id = state.selectedPolygonId;
  if (!id) return;
  if (!name) {
    setFeedback('Name cannot be empty.', 'err');
    return;
  }
  touchProject((doc) => {
    const p = doc.polygons.find((x) => x.id === id);
    if (p) p.name = name;
  });
  setFeedback(`Renamed to “${name}”.`, 'ok');
});
app.querySelector('#exclude-pad')!.addEventListener('change', (ev) => {
  const n = Number((ev.target as HTMLInputElement).value);
  if (!Number.isFinite(n) || n < 0) return;
  touchProject((doc) => {
    doc.meta.excludePadding = n;
  });
});
app.querySelector('#btn-video-refresh')!.addEventListener('click', () => {
  void refreshVideoFiles();
});
app.querySelector('#btn-add-video')!.addEventListener('click', addVideoFromSelect);
app.querySelector('#btn-play-video-seq')!.addEventListener('click', playVideoSequence);
app.querySelector('#btn-stop-video')!.addEventListener('click', stopVideoOnly);
app.querySelector('#btn-clear-played')!.addEventListener('click', clearPlayedMarks);
app.querySelector('#btn-audio-outputs')!.addEventListener('click', () => {
  void loadAudioOutputs();
});
app.querySelector('#btn-del-video')!.addEventListener('click', () => {
  if (!state.selectedVideoId) {
    setFeedback('No clip selected.', 'err');
    return;
  }
  deleteVideoById(state.selectedVideoId);
});
app.querySelector('#video-name')!.addEventListener('change', (ev) => {
  const name = (ev.target as HTMLInputElement).value.trim();
  if (!name || !state.selectedVideoId) return;
  mutateSelectedVideo((clip) => {
    clip.name = name;
  });
  setFeedback(`Clip renamed to “${name}”.`, 'ok');
});
app.querySelector('#chk-video-muted')!.addEventListener('change', (ev) => {
  const muted = (ev.target as HTMLInputElement).checked;
  mutateSelectedVideo((clip) => {
    clip.muted = muted;
  });
});
app.querySelector('#chk-video-hold')!.addEventListener('change', (ev) => {
  const hold = (ev.target as HTMLInputElement).checked;
  mutateSelectedVideo((clip) => {
    clip.holdLastFrame = hold;
  });
  if (!hold && state.selectedVideoId) {
    setState({ heldVideoIds: withoutHeldClip(state.heldVideoIds, state.selectedVideoId) });
  }
});
app.querySelector('#btn-save')!.addEventListener('click', () => {
  saveProjectToStorage(history.state);
  setFeedback('Saved locally.', 'ok');
  refreshUi();
});
app.querySelector('#btn-export')!.addEventListener('click', () => {
  downloadJson('media-projector-project.json', exportProjectJson(history.state));
  setFeedback('JSON export started.', 'ok');
});
app.querySelector('#file-import')!.addEventListener('change', async (ev) => {
  const file = (ev.target as HTMLInputElement).files?.[0];
  (ev.target as HTMLInputElement).value = '';
  if (!file) return;
  const text = await file.text();
  const result = parseProjectDocument(text);
  if (!result.ok || !result.value) {
    alert('Import rejected:\n' + result.errors.join('\n'));
    return;
  }
  aspectWarning = calibrationInvalidatingChange(history.state, result.value);
  history.replace(result.value);
  state = {
    ...createInitialShowState(history.state),
    calibrationMode: true,
    ...clearShowPlaybackState(),
  };
  persistSoft();
  broadcastState();
  refreshUi();
  setFeedback('Project imported.', 'ok');
});
app.querySelector('#btn-reset')!.addEventListener('click', () => {
  if (!confirm('Create a new empty project? Current calibration will be lost unless exported.')) return;
  history.replace(createEmptyProject());
  aspectWarning = [];
  state = {
    ...createInitialShowState(history.state),
    ...clearShowPlaybackState(),
  };
  persistSoft();
  broadcastState();
  refreshUi();
  setFeedback(editorFeedback, '');
});

async function tryLoadReference(): Promise<void> {
  const candidates = [
    state.project.referencePhoto,
    '/reference/facade.jpg',
    '/reference/facade.jpeg',
    '/reference/facade.png',
    '/reference/ref.jpg',
    '/reference/ref.jpeg',
    '/reference/ref.png',
  ].filter(Boolean) as string[];

  for (const src of candidates) {
    const ok = await loadImage(src);
    if (ok) {
      referenceImage = ok;
      return;
    }
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

bus.onMessage((msg) => {
  if (msg.type === 'hello' && msg.role === 'projection') {
    projectionConnected = true;
    lastPong = Date.now();
    broadcastState();
    refreshConnectionUi();
  } else if (msg.type === 'pong') {
    projectionConnected = true;
    lastPong = Date.now();
    refreshConnectionUi();
  } else if (msg.type === 'status') {
    projectionConnected = true;
    lastPong = Date.now();
    refreshConnectionUi();
  }
});

setInterval(() => {
  bus.post({ type: 'heartbeat', t: Date.now(), seq });
  if (projectionConnected && Date.now() - lastPong > 3000) {
    projectionConnected = false;
    refreshConnectionUi();
  }
  if (projectionWindow && projectionWindow.closed) {
    projectionConnected = false;
    projectionWindow = null;
    refreshConnectionUi();
  }
}, CONTROL_HEARTBEAT_MS);

function tick(): void {
  compositor.resizeToClient();
  const now = Date.now();

  if (state.video) {
    if (state.video.gapUntilMs != null) {
      if (now >= state.video.gapUntilMs) {
        const next = finishSequenceGap(state.video);
        if (next) {
          const clip = findVideoClip(state.project, next.queue[next.index] ?? null);
          setState({
            video: next,
            selectedVideoId: clip?.id ?? state.selectedVideoId,
            heldVideoIds: clip
              ? withoutHeldClip(state.heldVideoIds, clip.id)
              : state.heldVideoIds,
          });
          if (clip) markVideoPlayed(clip.id);
          setFeedback(clip ? `Next video: “${clip.name}”.` : 'Next video…', 'ok');
        } else {
          clearPlaySession();
          setState({ video: null });
          setFeedback('Video sequence finished.', 'ok');
        }
      }
    } else if (isActiveVideoFinished(state, now)) {
      const finished = activeVideoClip(state);
      let heldVideoIds = state.heldVideoIds;
      if (finished?.holdLastFrame) {
        heldVideoIds = withHeldClip(heldVideoIds, finished.id);
      }
      clearPlaySession();
      const hasMore = state.video.index + 1 < state.video.queue.length;
      if (hasMore) {
        setState({
          video: beginSequenceGap(state.video, now, VIDEO_SEQUENCE_GAP_MS),
          heldVideoIds,
        });
        setFeedback(
          `Pause ${(VIDEO_SEQUENCE_GAP_MS / 1000).toFixed(0)}s before next clip…`,
          '',
        );
      } else {
        setState({ video: null, heldVideoIds });
        setFeedback(
          finished?.holdLastFrame
            ? `“${finished.name}” finished — last frame held.`
            : 'Video sequence finished.',
          'ok',
        );
      }
    }
  }

  compositor.render(state, now, {
    role: 'control',
    showReference: showReference && state.calibrationMode,
    referenceImage,
    muteVideoAudio: projectionConnected,
  });
  requestAnimationFrame(tick);
}

window.addEventListener('resize', () => compositor.resizeToClient());
compositor.resizeToClient();
setFeedback(editorFeedback, '');
void refreshVideoFiles();
refreshUi();
broadcastState();
requestAnimationFrame(tick);
