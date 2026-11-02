// ============================================================================
// WILLOW'S TROOP - PROCEDURAL WEB AUDIO SYNTHESIZER
// High-fidelity tactile sounds generated directly in-browser (Zero external files)
// ============================================================================

window.SoundEngine = {
  ctx: null,
  enabled: localStorage.getItem('willow_sound_enabled') !== 'false',
  volume: Number(localStorage.getItem('willow_sound_volume')) || 0.6,

  init() {
    // AudioContext will be resumed on first user gesture
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      this.ctx = new AudioCtx();
    }
  },

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  toggleMute() {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem('willow_sound_enabled', this.enabled ? 'true' : 'false');
    } catch (e) {}
    this.updateMuteButtonUI();
    if (this.enabled) {
      this.playChime();
    }
    return this.enabled;
  },

  updateMuteButtonUI() {
    const btn = document.getElementById('btn-sound-toggle');
    if (!btn) return;
    btn.classList.toggle('active', this.enabled);
    btn.title = this.enabled ? 'Som Ativado (Clique para Silenciar)' : 'Som Mudo (Clique para Ativar)';
    btn.innerHTML = this.enabled
      ? `<svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`
      : `<svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;
  },

  // Tactile resonant hollow wood/resin impact when dice hit the table
  playDiceImpact(intensity = 1.0) {
    if (!this.enabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    const vol = Math.min(1.0, Math.max(0.1, intensity)) * this.volume * 0.7;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08 + Math.random() * 0.04);
    gain.connect(this.ctx.destination);

    // Resonant wooden body fundamental
    const osc = this.ctx.createOscillator();
    const baseFreq = 260 + Math.random() * 120;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, t + 0.07);
    osc.connect(gain);
    osc.start(t);
    osc.stop(t + 0.12);

    // Sharp clicking resin click
    const clickOsc = this.ctx.createOscillator();
    clickOsc.type = 'sine';
    clickOsc.frequency.setValueAtTime(1400 + Math.random() * 600, t);
    clickOsc.frequency.exponentialRampToValueAtTime(400, t + 0.025);

    const clickGain = this.ctx.createGain();
    clickGain.gain.setValueAtTime(vol * 0.85, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.028);

    clickOsc.connect(clickGain);
    clickGain.connect(this.ctx.destination);
    clickOsc.start(t);
    clickOsc.stop(t + 0.035);
  },

  // Shake / rattle sound when throwing multiple dice
  playDiceShake() {
    if (!this.enabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        this.playDiceImpact(0.45 + Math.random() * 0.4);
      }, i * (35 + Math.random() * 30));
    }
  },

  // Heavy wooden thud when a miniature lands on the table
  playPieceDrop() {
    if (!this.enabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);

    gain.gain.setValueAtTime(this.volume * 0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.15);
  },

  // Soft pickup sound when lifting a piece
  playPieceLift() {
    if (!this.enabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.06);

    gain.gain.setValueAtTime(this.volume * 0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.08);
  },

  // Pleasant bell chime for turn transition, pings and critical rolls
  playChime(isCritSuccess = false, isCritFail = false) {
    if (!this.enabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const notes = isCritSuccess
      ? [523.25, 659.25, 783.99, 1046.50] // C5, E5, G5, C6 arpeggio
      : (isCritFail ? [320, 240, 180] : [587.33, 880]); // D5, A5 or fail chord

    notes.forEach((freq, idx) => {
      const start = t + idx * (isCritSuccess ? 0.07 : 0.09);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = isCritFail ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(freq, start);

      const dur = isCritSuccess ? 0.7 : 0.45;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(this.volume * 0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.05);
    });
  },

  // Soft radar ping sound
  playPingSound() {
    if (!this.enabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, t); // B5
    osc.frequency.exponentialRampToValueAtTime(493.88, t + 0.28);

    gain.gain.setValueAtTime(this.volume * 0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.35);
  }
};
