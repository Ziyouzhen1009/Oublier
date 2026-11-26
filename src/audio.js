(function (global) {
  "use strict";

  const Oublier = (global.Oublier = global.Oublier || {});

  let ctx = null;
  let masterGain = null;
  let oceanGain = null;
  let rainGain = null;
  let fireGain = null;
  let chimesGain = null;
  let crackleTimer = null;

  let initialized = false;
  let muted = false;

  const volumes = {
    ocean: 0.45,
    rain: 0.15,
    fire: 0.35,
    chimes: 0.6
  };

  function createPinkNoiseBuffer(audioCtx, seconds) {
    const length = Math.floor(audioCtx.sampleRate * seconds);
    const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const output = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.06;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  function init() {
    if (initialized) {
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(function () {});
      }
      return true;
    }

    const AudioCtx = global.AudioContext || global.webkitAudioContext;
    if (!AudioCtx) return false;

    try {
      ctx = new AudioCtx();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : 0.72;
      masterGain.connect(ctx.destination);

      const noiseBuffer = createPinkNoiseBuffer(ctx, 4);

      // 1. 海浪声：低通粉红噪声 + 极慢潮汐 LFO
      const oceanSrc = ctx.createBufferSource();
      oceanSrc.buffer = noiseBuffer;
      oceanSrc.loop = true;

      const oceanFilter = ctx.createBiquadFilter();
      oceanFilter.type = "lowpass";
      oceanFilter.frequency.value = 340;
      oceanFilter.Q.value = 0.7;

      const waveDepth = ctx.createGain();
      waveDepth.gain.value = 0.55;

      const waveBase = ctx.createGain();
      waveBase.gain.value = 0.65;

      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.11;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.35;
      lfo.connect(lfoGain);
      lfoGain.connect(waveBase.gain);

      oceanGain = ctx.createGain();
      oceanGain.gain.value = volumes.ocean * 0.5;

      oceanSrc.connect(oceanFilter);
      oceanFilter.connect(waveDepth);
      waveDepth.connect(waveBase);
      waveBase.connect(oceanGain);
      oceanGain.connect(masterGain);

      oceanSrc.start();
      lfo.start();

      // 2. 细雨声：带通柔化噪声
      const rainSrc = ctx.createBufferSource();
      rainSrc.buffer = noiseBuffer;
      rainSrc.loop = true;

      const rainFilter = ctx.createBiquadFilter();
      rainFilter.type = "bandpass";
      rainFilter.frequency.value = 1650;
      rainFilter.Q.value = 0.45;

      rainGain = ctx.createGain();
      rainGain.gain.value = volumes.rain * 0.42;

      rainSrc.connect(rainFilter);
      rainFilter.connect(rainGain);
      rainGain.connect(masterGain);
      rainSrc.start();

      // 3. 篝火声：低沉火炉底噪 + 轻柔木柴噼啪脉冲
      const fireSrc = ctx.createBufferSource();
      fireSrc.buffer = noiseBuffer;
      fireSrc.loop = true;

      const fireFilter = ctx.createBiquadFilter();
      fireFilter.type = "lowpass";
      fireFilter.frequency.value = 210;

      fireGain = ctx.createGain();
      fireGain.gain.value = volumes.fire * 0.48;

      fireSrc.connect(fireFilter);
      fireFilter.connect(fireGain);
      fireGain.connect(masterGain);
      fireSrc.start();

      // 星铃总线
      chimesGain = ctx.createGain();
      chimesGain.gain.value = volumes.chimes * 0.4;
      chimesGain.connect(masterGain);

      scheduleCrackle();

      initialized = true;
      return true;
    } catch (err) {
      return false;
    }
  }

  function scheduleCrackle() {
    if (crackleTimer) clearTimeout(crackleTimer);
    crackleTimer = setTimeout(function () {
      if (ctx && fireGain && !muted && volumes.fire > 0.05 && ctx.state === "running") {
        triggerCrackle();
      }
      scheduleCrackle();
    }, 320 + Math.random() * 1100);
  }

  function triggerCrackle() {
    if (!ctx || !fireGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(1100 + Math.random() * 1900, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.032);

    const amp = (0.02 + Math.random() * 0.035) * volumes.fire;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(amp, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.036);

    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  function setVolume(channel, value01) {
    const clamped = Math.max(0, Math.min(1, value01));
    volumes[channel] = clamped;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (channel === "ocean" && oceanGain) {
      oceanGain.gain.setTargetAtTime(clamped * 0.5, now, 0.15);
    } else if (channel === "rain" && rainGain) {
      rainGain.gain.setTargetAtTime(clamped * 0.42, now, 0.25);
    } else if (channel === "fire" && fireGain) {
      fireGain.gain.setTargetAtTime(clamped * 0.48, now, 0.15);
    } else if (channel === "chimes" && chimesGain) {
      chimesGain.gain.setTargetAtTime(clamped * 0.4, now, 0.1);
    }
  }

  function getVolumes() {
    return Object.assign({}, volumes);
  }

  function setMuted(nextMuted) {
    muted = Boolean(nextMuted);
    if (ctx && masterGain) {
      masterGain.gain.setTargetAtTime(muted ? 0 : 0.72, ctx.currentTime, 0.15);
    }
    return muted;
  }

  function isMuted() {
    return muted;
  }

  function syncMood(moodId) {
    // 切换细雨心境时柔和增加雨声；离开细雨时若仍为默认偏高雨声则回落
    if (moodId === "rainy") {
      setVolume("rain", Math.max(volumes.rain, 0.55));
    } else if (volumes.rain > 0.45) {
      setVolume("rain", 0.15);
    }
    return volumes.rain;
  }

  const PENTATONIC = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];

  function playNote(freq, delaySec, durationSec, peak) {
    if (!ctx || !chimesGain || muted || volumes.chimes <= 0.02) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(function () {});
    }
    const start = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, start);
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(freq * 2, start);

    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.14, start);

    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(peak, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);

    osc.connect(g);
    osc2.connect(g2);
    g2.connect(g);
    g.connect(chimesGain);

    osc.start(start);
    osc2.start(start);
    osc.stop(start + durationSec + 0.05);
    osc2.stop(start + durationSec + 0.05);
  }

  function playChime(type) {
    if (!initialized && !init()) return;
    if (muted || volumes.chimes <= 0.02) return;

    if (type === "enter") {
      playNote(PENTATONIC[0], 0, 1.8, 0.22);
      playNote(PENTATONIC[2], 0.14, 1.9, 0.18);
      playNote(PENTATONIC[4], 0.28, 2.2, 0.2);
    } else if (type === "release") {
      playNote(PENTATONIC[3], 0, 1.5, 0.2);
      playNote(PENTATONIC[5], 0.12, 1.8, 0.22);
      playNote(PENTATONIC[7], 0.26, 2.3, 0.16);
    } else if (type === "bottle") {
      playNote(PENTATONIC[2], 0, 1.4, 0.18);
      playNote(PENTATONIC[6], 0.18, 1.9, 0.16);
    } else if (type === "star") {
      playNote(PENTATONIC[4], 0, 1.6, 0.18);
      playNote(PENTATONIC[7], 0.14, 2.1, 0.18);
    } else if (type === "tea") {
      playNote(PENTATONIC[1], 0, 1.4, 0.18);
      playNote(PENTATONIC[4], 0.16, 1.7, 0.18);
    } else {
      const f = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
      playNote(f, 0, 1.2, 0.14);
    }
  }

  Oublier.Audio = {
    init,
    setVolume,
    getVolumes,
    setMuted,
    isMuted,
    syncMood,
    playChime
  };
})(window);
