class SoundEngine {
  private ctx: AudioContext | null = null;
  private activeSirenStop: (() => void) | null = null;

  private getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playWalkieChirp() {
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch {
      // Audio context might be restricted before interaction
    }
  }

  public playRogerBeep() {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1180, now);
      osc.frequency.setValueAtTime(1400, now + 0.07);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(now + 0.16);
    } catch {}
  }

  public playAlertPing() {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.3);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(now + 0.3);
    } catch {}
  }

  public startAlarmSiren(volume: number = 0.8, pattern: 'police' | 'beeps' | 'sonar' = 'police'): () => void {
    this.stopAlarmSiren();

    try {
      const ctx = this.getContext();
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(Math.min(1, Math.max(0.1, volume)), ctx.currentTime);
      masterGain.connect(ctx.destination);

      let isRunning = true;
      const oscillators: OscillatorNode[] = [];

      if (pattern === 'police') {
        const osc = ctx.createOscillator();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(750, ctx.currentTime);

        // LFO modulates frequency between 500Hz and 1000Hz (wailing siren)
        lfo.type = 'triangle';
        lfo.frequency.setValueAtTime(1.8, ctx.currentTime); // 1.8 Hz modulation
        lfoGain.gain.setValueAtTime(300, ctx.currentTime);

        lfo.connect(osc.frequency);
        osc.connect(masterGain);

        osc.start();
        lfo.start();
        oscillators.push(osc, lfo);
      } else if (pattern === 'beeps') {
        // High urgency rapid pulsed alarm
        const osc = ctx.createOscillator();
        const pulseGain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(950, ctx.currentTime);

        const pulseLfo = ctx.createOscillator();
        pulseLfo.type = 'square';
        pulseLfo.frequency.setValueAtTime(5, ctx.currentTime); // 5 beeps per second

        pulseLfo.connect(pulseGain.gain);
        osc.connect(pulseGain);
        pulseGain.connect(masterGain);

        osc.start();
        pulseLfo.start();
        oscillators.push(osc, pulseLfo);
      } else {
        // Sonar alert
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.connect(masterGain);
        osc.start();
        oscillators.push(osc);
      }

      const stopFn = () => {
        if (!isRunning) return;
        isRunning = false;
        try {
          masterGain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.1);
          setTimeout(() => {
            oscillators.forEach(o => {
              try { o.stop(); o.disconnect(); } catch {}
            });
            masterGain.disconnect();
          }, 120);
        } catch {}
      };

      this.activeSirenStop = stopFn;
      return stopFn;
    } catch {
      return () => {};
    }
  }

  public stopAlarmSiren() {
    if (this.activeSirenStop) {
      this.activeSirenStop();
      this.activeSirenStop = null;
    }
  }
}

export const soundEngine = new SoundEngine();
