import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// A small deterministic synthesizer for background beds: chords, a soft beat, a fade in and
// out, rendered to WAV and encoded with FFmpeg. It exists so every video can have music that
// is free of licensing questions; bring your own track when you want a real one.

export type Mood = 'calm' | 'upbeat' | 'tech';
export const MOODS: Mood[] = ['calm', 'upbeat', 'tech'];

export interface MusicOptions {
  mood: Mood;
  seconds: number;
  bpm?: number;
  seed?: number;
  key?: string;   // root note, e.g. "C", "F#", "Bb"
}

const RATE = 44100;
const NOTE_INDEX: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const hz = (semitonesFromC4: number): number => 261.6256 * 2 ** (semitonesFromC4 / 12);

// Chord progressions as semitone offsets from the key root, with the chord quality.
type Chord = { root: number; minor: boolean };
const PROGRESSIONS: Record<Mood, { bpm: number; chords: Chord[]; minorKey: boolean }> = {
  calm: { bpm: 84, minorKey: false, chords: [{ root: 0, minor: false }, { root: 7, minor: false }, { root: 9, minor: true }, { root: 5, minor: false }] },
  upbeat: { bpm: 112, minorKey: false, chords: [{ root: 9, minor: true }, { root: 5, minor: false }, { root: 0, minor: false }, { root: 7, minor: false }] },
  tech: { bpm: 100, minorKey: true, chords: [{ root: 0, minor: true }, { root: 0, minor: true }, { root: 8, minor: false }, { root: 10, minor: false }] }
};

const mulberry32 = (seed: number) => (): number => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Attack/decay/sustain/release, all in seconds, evaluated at time t within a note of `length`.
const envelope = (t: number, length: number, attack: number, release: number): number => {
  if (t < 0 || t > length) return 0;
  const a = attack > 0 ? Math.min(1, t / attack) : 1;
  const r = release > 0 ? Math.min(1, (length - t) / release) : 1;
  return Math.min(a, r);
};

export function renderBed(options: MusicOptions): { left: Float32Array; right: Float32Array } {
  const preset = PROGRESSIONS[options.mood];
  const bpm = options.bpm ?? preset.bpm;
  const beat = 60 / bpm, bar = beat * 4, chordLength = bar * 2;
  const keyRoot = NOTE_INDEX[options.key ?? 'C'] ?? 0;
  const random = mulberry32(options.seed ?? 1);
  const total = Math.ceil(options.seconds * RATE);
  const left = new Float32Array(total), right = new Float32Array(total);
  const kickLevel = options.mood === 'calm' ? .22 : .38;
  const hatLevel = options.mood === 'calm' ? .035 : .06;

  // Pads: one chord every two bars, three or four voices, each a pair of slightly detuned
  // sines panned apart, with a sub octave underneath.
  const voices: { freq: number; start: number; length: number; pan: number; gain: number }[] = [];
  for (let start = 0, index = 0; start < options.seconds; start += chordLength, index++) {
    const chord = preset.chords[index % preset.chords.length] as Chord;
    const root = keyRoot + chord.root - 12;
    const notes = [root, root + (chord.minor ? 3 : 4), root + 7, root + 12 + (options.mood === 'tech' ? 7 : 0)];
    notes.forEach((note, n) => {
      voices.push({ freq: hz(note) * (1 + .0018), start, length: chordLength + .6, pan: -.5 + (n % 2), gain: .16 / notes.length });
      voices.push({ freq: hz(note) * (1 - .0018), start, length: chordLength + .6, pan: .5 - (n % 2), gain: .16 / notes.length });
    });
    voices.push({ freq: hz(root - 12), start, length: chordLength + .6, pan: 0, gain: .11 });
  }
  for (const voice of voices) {
    const from = Math.max(0, Math.floor(voice.start * RATE)), to = Math.min(total, Math.floor((voice.start + voice.length) * RATE));
    const l = Math.cos((voice.pan + 1) * Math.PI / 4), r = Math.sin((voice.pan + 1) * Math.PI / 4);
    for (let i = from; i < to; i++) {
      const t = i / RATE - voice.start;
      const env = envelope(t, voice.length, 1.2, 1.4);
      // Two harmonics keep a sine from sounding like a test tone; the second fades with a slow LFO.
      const lfo = .5 + .5 * Math.sin(2 * Math.PI * .11 * i / RATE);
      const sample = (Math.sin(2 * Math.PI * voice.freq * i / RATE) + .25 * lfo * Math.sin(4 * Math.PI * voice.freq * i / RATE) + (options.mood === 'tech' ? .18 * Math.sin(6 * Math.PI * voice.freq * i / RATE) : 0)) * env * voice.gain;
      left[i] = (left[i] ?? 0) + sample * l; right[i] = (right[i] ?? 0) + sample * r;
    }
  }

  // Arpeggio (upbeat and tech): short plucks on eighth or sixteenth notes.
  if (options.mood !== 'calm') {
    const step = options.mood === 'tech' ? beat / 4 : beat / 2;
    for (let start = 0, k = 0; start < options.seconds; start += step, k++) {
      const chord = preset.chords[Math.floor(start / chordLength) % preset.chords.length] as Chord;
      const tones = [0, chord.minor ? 3 : 4, 7, 12];
      const pattern = options.mood === 'tech' ? [0, 2, 1, 2, 3, 2, 1, 2] : [0, 1, 2, 3, 2, 1];
      if (options.mood === 'tech' && random() < .2) continue;   // leave some gaps
      const note = keyRoot + chord.root + (tones[(pattern[k % pattern.length] ?? 0)] ?? 0) + (options.mood === 'tech' ? 0 : 12);
      const freq = hz(note), length = step * (options.mood === 'tech' ? .9 : 1.6), gain = options.mood === 'tech' ? .09 : .07;
      const from = Math.floor(start * RATE), to = Math.min(total, Math.floor((start + length) * RATE));
      for (let i = from; i < to; i++) {
        const t = (i - from) / RATE;
        const env = Math.exp(-t * (options.mood === 'tech' ? 14 : 7)) * Math.min(1, t / .004);
        const s = (Math.sin(2 * Math.PI * freq * t) + .3 * Math.sin(4 * Math.PI * freq * t)) * env * gain;
        left[i] = (left[i] ?? 0) + s * (k % 2 ? .8 : .5); right[i] = (right[i] ?? 0) + s * (k % 2 ? .5 : .8);
      }
    }
  }

  // Beat: a soft sine kick, a noise hat on the off-beats, a clap on 2 and 4 when upbeat.
  for (let start = 0, b = 0; start < options.seconds; start += beat, b++) {
    const onBeat = options.mood === 'calm' ? b % 2 === 0 : true;
    if (onBeat) {
      const from = Math.floor(start * RATE), to = Math.min(total, from + Math.floor(.28 * RATE));
      for (let i = from; i < to; i++) {
        const t = (i - from) / RATE;
        const f = 48 + 90 * Math.exp(-t * 30);
        const s = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 11) * kickLevel;
        left[i] = (left[i] ?? 0) + s; right[i] = (right[i] ?? 0) + s;
      }
    }
    const hatAt = start + beat / 2, from = Math.floor(hatAt * RATE), to = Math.min(total, from + Math.floor(.05 * RATE));
    for (let i = from; i < to; i++) {
      const t = (i - from) / RATE;
      const s = (random() * 2 - 1) * Math.exp(-t * 90) * hatLevel;
      left[i] = (left[i] ?? 0) + s * .7; right[i] = (right[i] ?? 0) + s;
    }
    if (options.mood === 'upbeat' && b % 4 === 1 || options.mood === 'upbeat' && b % 4 === 3) {
      const cfrom = Math.floor(start * RATE), cto = Math.min(total, cfrom + Math.floor(.12 * RATE));
      for (let i = cfrom; i < cto; i++) {
        const t = (i - cfrom) / RATE;
        const s = (random() * 2 - 1) * Math.exp(-t * 28) * .12;
        left[i] = (left[i] ?? 0) + s; right[i] = (right[i] ?? 0) + s;
      }
    }
  }

  // Master: fade in, fade out, soft clip, normalise to a quiet bed (about -20 dBFS RMS).
  const fadeIn = .6 * RATE, fadeOut = Math.min(2.5 * RATE, total / 3);
  let sumSquares = 0;
  for (let i = 0; i < total; i++) {
    const gain = Math.min(1, i / fadeIn, (total - i) / fadeOut);
    left[i] = Math.tanh((left[i] ?? 0) * 1.4) * gain; right[i] = Math.tanh((right[i] ?? 0) * 1.4) * gain;
    sumSquares += ((left[i] ?? 0) ** 2 + (right[i] ?? 0) ** 2) / 2;
  }
  const rms = Math.sqrt(sumSquares / total) || 1, target = 10 ** (-20 / 20);
  let peak = 1e-6;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(left[i] ?? 0), Math.abs(right[i] ?? 0));
  const scale = Math.min(target / rms, .95 / peak);
  for (let i = 0; i < total; i++) { left[i] = (left[i] ?? 0) * scale; right[i] = (right[i] ?? 0) * scale; }
  return { left, right };
}

export function toWav(left: Float32Array, right: Float32Array): Buffer {
  const frames = left.length, data = Buffer.alloc(frames * 4);
  for (let i = 0; i < frames; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i] ?? 0)) * 32767), i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i] ?? 0)) * 32767), i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
  header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// Renders a bed and encodes it to the output's format (.m4a, .mp3, .wav) with FFmpeg.
export async function writeMusic(options: MusicOptions, output: string): Promise<void> {
  const { left, right } = renderBed(options);
  const wav = toWav(left, right);
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  if (path.extname(output).toLowerCase() === '.wav') { await writeFile(output, wav); return; }
  const temp = path.join(tmpdir(), `brandreel-music-${process.pid}.wav`);
  await writeFile(temp, wav);
  try {
    await new Promise<void>((resolve, reject) => {
      const codec = path.extname(output).toLowerCase() === '.mp3' ? ['-c:a', 'libmp3lame', '-q:a', '3'] : ['-c:a', 'aac', '-b:a', '160k'];
      const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', temp, ...codec, path.resolve(output)], { stdio: ['ignore', 'ignore', 'pipe'] });
      let errors = '';
      child.stderr.on('data', (chunk: Buffer) => { errors += chunk.toString(); });
      child.on('error', error => reject(new Error(`FFmpeg could not start (${error.message}).`)));
      child.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg failed: ${errors.trim()}`)));
    });
  } finally {
    await rm(temp, { force: true });
  }
}
