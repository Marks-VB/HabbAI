// Sons sintetizados com WebAudio (sem arquivos de áudio): curtos, baixos e de timbre suave.
import type { SoundKind } from './scheduler';

export interface VoiceOpts {
  /** Ganho final (já com o volume mestre). */
  gain: number;
  /** -1 .. 1 (esquerda .. direita). */
  pan?: number;
  /** Teclado: teclas na rajada. */
  count?: number;
  rng: () => number;
  /** Ruído branco curto (teclas). */
  noise: AudioBuffer | null;
}

/** Envelope percussivo: ataque curto e queda exponencial. */
function env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(ac: AudioContext, out: AudioNode, type: OscillatorType, freq: number, t: number, peak: number, attack: number, decay: number, toFreq?: number): void {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, t + Math.min(decay, 0.08));
  env(g, t, peak, attack, decay);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
}

/** Cria um buffer de ruído branco (base das teclas). */
export function makeNoise(ac: AudioContext): AudioBuffer | null {
  try {
    const len = Math.floor(ac.sampleRate * 0.06);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  } catch {
    return null;
  }
}

/** Toca `kind` em `t` (tempo do AudioContext) na saída `dest`. */
export function playVoice(ac: AudioContext, dest: AudioNode, kind: SoundKind, t: number, o: VoiceOpts): void {
  let out: AudioNode = dest;
  if (o.pan && typeof ac.createStereoPanner === 'function') {
    const p = ac.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    p.connect(dest);
    out = p;
  }
  const g = o.gain;
  switch (kind) {
    case 'chime':
      // sino suave e cristalino: tom fundamental com harmônicos quentes e brilho estendido
      tone(ac, out, 'sine', 880, t, 0.22 * g, 0.012, 1.4);
      tone(ac, out, 'sine', 1318.5, t, 0.13 * g, 0.012, 1.2);
      tone(ac, out, 'sine', 1760, t, 0.05 * g, 0.008, 0.8);
      tone(ac, out, 'sine', 1174.7, t + 0.12, 0.18 * g, 0.012, 1.3);
      tone(ac, out, 'sine', 1760, t + 0.12, 0.06 * g, 0.008, 0.7);
      return;
    case 'pop':
      // estalo "pop" nítido e orgânico (clique + corpo)
      tone(ac, out, 'sine', 880, t, 0.18 * g, 0.003, 0.12, 280);
      tone(ac, out, 'triangle', 440, t, 0.12 * g, 0.005, 0.08, 160);
      return;
    case 'elevator':
      // "ding" de elevador rico: harmônicos dourados com reverb natural
      tone(ac, out, 'sine', 784, t, 0.18 * g, 0.004, 1.8);
      tone(ac, out, 'sine', 1174.7, t, 0.06 * g, 0.004, 1.1);
      tone(ac, out, 'sine', 1568, t, 0.05 * g, 0.004, 0.9);
      tone(ac, out, 'sine', 2349, t, 0.02 * g, 0.003, 0.4);
      return;
    case 'keys':
      keys(ac, out, t, o);
      return;
    case 'pingpong':
      // raquetada: "tok" nítido e amortecido
      tone(ac, out, 'sine', 1320, t, 0.14 * g, 0.002, 0.07, 820);
      tone(ac, out, 'triangle', 400, t, 0.06 * g, 0.002, 0.04, 200);
      return;
    case 'table':
      // quique na mesa: batida de celuloide oca
      tone(ac, out, 'sine', 740, t, 0.11 * g, 0.002, 0.055, 480);
      tone(ac, out, 'triangle', 260, t, 0.05 * g, 0.002, 0.035, 140);
      return;
    case 'arcade': {
      // fliperama 8-bit vibrante e polido
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      lp.connect(out);
      const scale = [1046.5, 1318.5, 1568, 1760, 2093];
      for (let i = 0; i < 3; i++) {
        const f = scale[Math.floor(o.rng() * scale.length)];
        tone(ac, lp, 'square', f, t + i * 0.05, 0.045 * g, 0.003, 0.06);
      }
      return;
    }
  }
}

/** Rajada de teclas: estalos de ruído filtrado com intervalos irregulares, como digitação de verdade. */
function keys(ac: AudioContext, out: AudioNode, t: number, o: VoiceOpts): void {
  if (!o.noise) return;
  const n = Math.max(1, Math.min(8, o.count ?? 4));
  let at = t;
  for (let i = 0; i < n; i++) {
    const src = ac.createBufferSource();
    src.buffer = o.noise;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800 + o.rng() * 1600;
    bp.Q.value = 1.6;
    const g = ac.createGain();
    // pequeno claque mecânico com ataque ultra-rápido e corpo
    env(g, at, 0.12 * o.gain * (0.7 + o.rng() * 0.3), 0.001, 0.028 + o.rng() * 0.014);
    src.connect(bp).connect(g).connect(out);
    src.start(at, o.rng() * 0.02, 0.045);
    at += 0.06 + o.rng() * 0.08 + (o.rng() < 0.15 ? 0.12 : 0);
  }
}
