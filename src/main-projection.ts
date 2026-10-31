import './styles/projection.css';
import { PROJECTION_TIMEOUT_MS, type FigureKind, type ShowState } from './core/types';
import { createInitialShowState } from './ui/state';
import { Compositor } from './render/compositor';
import { pauseAllVideos, setVideoHost } from './render/video-playback';
import { ShowBus } from './sync/channel';
import { ShowAudio } from './audio/show-audio';

const appEl = document.querySelector<HTMLDivElement>('#app');
if (!appEl) throw new Error('#app missing');
const app: HTMLDivElement = appEl;

app.innerHTML = `
  <div class="gate" id="gate">
    <div class="gate-card">
      <h1>Media-Projector Projection</h1>
      <p>Drag this window onto the projector. Then press <strong>Space</strong> (or the button): unlock audio and go fullscreen.</p>
      <button type="button" id="btn-start">Start / Unlock audio</button>
      <p style="margin-top:12px;font-size:0.8rem;color:#777">Space = start/fullscreen. Esc exits fullscreen. Cursor hides afterward.</p>
    </div>
  </div>
  <div id="stage"><canvas id="beam"></canvas></div>
`;

const canvas = app.querySelector<HTMLCanvasElement>('#beam')!;
const stage = app.querySelector<HTMLElement>('#stage')!;
const gate = app.querySelector<HTMLDivElement>('#gate')!;
const compositor = new Compositor(canvas);
setVideoHost(stage);
const bus = new ShowBus();
const audio = new ShowAudio();

let state: ShowState = createInitialShowState();
let lastHeartbeat = Date.now();
let started = false;
let forcedBlackout = false;
let starting = false;

async function enterFullscreen(): Promise<void> {
  if (document.fullscreenElement) return;
  try {
    await document.documentElement.requestFullscreen();
  } catch {
    // F11 still works; fullscreen needs a user gesture.
  }
}

async function startProjection(): Promise<void> {
  if (starting) return;
  starting = true;
  try {
    if (!started) {
      await audio.unlock();
      audio.setVolume(state.volume);
      started = true;
      gate.classList.add('hidden');
      bus.post({ type: 'status', fullscreen: !!document.fullscreenElement, audioReady: true });
      bus.post({ type: 'hello', role: 'projection' });
    }
    await enterFullscreen();
    bus.post({ type: 'status', fullscreen: !!document.fullscreenElement, audioReady: true });
  } finally {
    starting = false;
  }
}

app.querySelector('#btn-start')!.addEventListener('click', () => {
  void startProjection();
});

window.addEventListener('keydown', (ev) => {
  if (ev.code !== 'Space' && ev.key !== ' ') return;
  // Avoid scrolling / accidental double-trigger while holding Space.
  ev.preventDefault();
  if (ev.repeat) return;
  void startProjection();
});

bus.onMessage((msg) => {
  if (msg.type === 'hello' && msg.role === 'control') {
    lastHeartbeat = Date.now();
    bus.post({ type: 'hello', role: 'projection' });
  } else if (msg.type === 'heartbeat') {
    lastHeartbeat = Date.now();
    bus.post({ type: 'pong', t: msg.t });
  } else if (msg.type === 'state') {
    lastHeartbeat = Date.now();
    state = msg.state;
    forcedBlackout = false;
    audio.setVolume(state.volume);
    if (state.blackout || !state.showArmed) {
      audio.stopAll();
      // layoutDomVideo hides elements; keep held last-frame times for re-arm.
    } else if (!state.video && (state.heldVideoIds?.length ?? 0) === 0) {
      pauseAllVideos();
    }
  } else if (msg.type === 'audio-cue') {
    lastHeartbeat = Date.now();
    if (!started) return;
    audio.setVolume(msg.volume);
    const figure: FigureKind = msg.figure ?? 'ghost';
    if (msg.cue === 'stop' || state.blackout) {
      audio.stopAll();
    } else if (msg.cue === 'scene-start') {
      audio.playSceneStart(figure, msg.volume);
    } else if (msg.cue === 'scene-accent') {
      audio.playSceneAccent(figure, msg.volume);
    }
  }
});

bus.post({ type: 'hello', role: 'projection' });

function tick(): void {
  compositor.resizeToClient();
  const now = Date.now();

  if (started && now - lastHeartbeat > PROJECTION_TIMEOUT_MS) {
    forcedBlackout = true;
    audio.stopAll();
  }

  const renderState: ShowState = forcedBlackout
    ? { ...state, blackout: true, scene: null }
    : state;

  compositor.render(renderState, now, { role: 'projection' });
  requestAnimationFrame(tick);
}

window.addEventListener('resize', () => compositor.resizeToClient());
requestAnimationFrame(tick);
