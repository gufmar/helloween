/** Soft synthetic placeholder tones. No external assets. */
export class SynthAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private active: OscillatorNode[] = [];
  ready = false;

  async unlock(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.4;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    this.ready = true;
  }

  setVolume(v: number): void {
    if (!this.master) return;
    this.master.gain.value = Math.min(1, Math.max(0, v));
  }

  stopAll(): void {
    for (const osc of this.active) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
    }
    this.active = [];
  }

  /** Soft appear pad. */
  playSceneStart(volume: number): void {
    void this.playTone(220, 0.6, 'sine', volume * 0.25);
    void this.playTone(330, 0.8, 'triangle', volume * 0.12);
  }

  /** Soft accent (boo / wave), not shrill. */
  playSceneAccent(volume: number): void {
    void this.playSweep(180, 120, 0.7, volume * 0.3);
  }

  /** @deprecated alias */
  playDemoStart(volume: number): void {
    this.playSceneStart(volume);
  }

  /** @deprecated alias */
  playDemoBoo(volume: number): void {
    this.playSceneAccent(volume);
  }

  private async ensure(): Promise<boolean> {
    if (!this.ready) return false;
    if (!this.ctx || this.ctx.state === 'suspended') {
      await this.unlock();
    }
    return !!this.ctx && !!this.master;
  }

  private async playTone(
    freq: number,
    duration: number,
    type: OscillatorType,
    gain: number,
  ): Promise<void> {
    if (!(await this.ensure()) || !this.ctx || !this.master) return;
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
    this.active.push(osc);
    osc.onended = () => {
      this.active = this.active.filter((o) => o !== osc);
    };
  }

  private async playSweep(
    from: number,
    to: number,
    duration: number,
    gain: number,
  ): Promise<void> {
    if (!(await this.ensure()) || !this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(to, this.ctx.currentTime + duration);
    g.gain.setValueAtTime(0, this.ctx.currentTime);
    g.gain.linearRampToValueAtTime(gain, this.ctx.currentTime + 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + duration + 0.05);
    this.active.push(osc);
    osc.onended = () => {
      this.active = this.active.filter((o) => o !== osc);
    };
  }
}
