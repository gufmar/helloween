import type { FigureKind } from '../core/types';
import { accentSoundFor, MEDIA, startSoundFor } from './library';

/**
 * Prefers local media files; soft synth fallback if a file is missing.
 * Call unlock() from a user gesture before playback.
 */
export class ShowAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private players: HTMLAudioElement[] = [];
  private oscillators: OscillatorNode[] = [];
  ready = false;
  private volume = 0.4;

  async unlock(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    // Warm HTMLAudio with a silent short unlock path (resume is enough for most browsers).
    this.ready = true;
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.master) this.master.gain.value = this.volume;
    for (const a of this.players) a.volume = this.volume;
  }

  stopAll(): void {
    for (const a of this.players) {
      try {
        a.pause();
        a.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    this.players = [];
    for (const osc of this.oscillators) {
      try {
        osc.stop();
      } catch {
        /* ignore */
      }
    }
    this.oscillators = [];
  }

  playUnlockChime(): void {
    void this.playUrl(MEDIA.unlockClick, Math.min(this.volume, 0.35), true);
  }

  playSceneStart(figure: FigureKind, volume = this.volume): void {
    void this.playUrl(startSoundFor(figure), volume, false, () => {
      this.synthStart(volume);
    });
  }

  playSceneAccent(figure: FigureKind, volume = this.volume): void {
    void this.playUrl(accentSoundFor(figure), volume, false, () => {
      this.synthAccent(volume);
    });
  }

  /** Back-compat names used by older call sites. */
  playDemoStart(volume: number): void {
    this.playSceneStart('ghost', volume);
  }

  playDemoBoo(volume: number): void {
    this.playSceneAccent('ghost', volume);
  }

  private async playUrl(
    url: string,
    volume: number,
    softFail: boolean,
    onMissing?: () => void,
  ): Promise<void> {
    if (!this.ready) return;
    try {
      const audio = new Audio(url);
      audio.volume = Math.min(1, Math.max(0, volume));
      this.players.push(audio);
      audio.onended = () => {
        this.players = this.players.filter((p) => p !== audio);
      };
      await audio.play();
    } catch {
      this.players = this.players.filter((p) => p.src !== url);
      if (!softFail) onMissing?.();
    }
  }

  private synthStart(volume: number): void {
    void this.playTone(220, 0.6, 'sine', volume * 0.25);
    void this.playTone(330, 0.8, 'triangle', volume * 0.12);
  }

  private synthAccent(volume: number): void {
    void this.playSweep(200, 90, 0.85, volume * 0.45);
  }

  private async ensureCtx(): Promise<boolean> {
    if (!this.ready) return false;
    if (!this.ctx || this.ctx.state === 'suspended') await this.unlock();
    return !!this.ctx && !!this.master;
  }

  private async playTone(
    freq: number,
    duration: number,
    type: OscillatorType,
    gain: number,
  ): Promise<void> {
    if (!(await this.ensureCtx()) || !this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, this.ctx.currentTime);
    g.gain.linearRampToValueAtTime(gain, this.ctx.currentTime + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + duration + 0.05);
    this.oscillators.push(osc);
    osc.onended = () => {
      this.oscillators = this.oscillators.filter((o) => o !== osc);
    };
  }

  private async playSweep(
    from: number,
    to: number,
    duration: number,
    gain: number,
  ): Promise<void> {
    if (!(await this.ensureCtx()) || !this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(to, this.ctx.currentTime + duration);
    g.gain.setValueAtTime(0, this.ctx.currentTime);
    g.gain.linearRampToValueAtTime(gain, this.ctx.currentTime + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + duration + 0.05);
    this.oscillators.push(osc);
    osc.onended = () => {
      this.oscillators = this.oscillators.filter((o) => o !== osc);
    };
  }
}
