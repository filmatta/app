"use client";

export const WRITER_TYPEWRITER_AUDIO_URL = "/audio/writer/typewriter-key.wav";
export const WRITER_TYPEWRITER_EFFECTIVE_DURATION_SECONDS = 0.2;
export const WRITER_TYPEWRITER_MAX_ACTIVE_VOICES = 4;

const MIN_INTERVAL_MS = 38;
const BASE_GAIN = 0.052;
const PLAYBACK_RATE_VARIATION = 0.025;

let audioContext: AudioContext | null = null;
let audioBuffer: AudioBuffer | null = null;
let audioBufferPromise: Promise<AudioBuffer | null> | null = null;
let lastPlayedAt = 0;
const activeVoices = new Set<AudioBufferSourceNode>();

export function writerTypewriterSoundStorageKey(userId: string) {
  return `filmatta:writer-typewriter-sound:v1:${userId}`;
}

export function defaultWriterTypewriterSoundEnabled() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: fine) and (min-width: 769px)").matches;
}

export function loadWriterTypewriterSoundPreference(userId: string) {
  try {
    const value = window.localStorage.getItem(writerTypewriterSoundStorageKey(userId));
    if (value === "on") return true;
    if (value === "off") return false;
  } catch {
    // Local preferences are best-effort.
  }
  return defaultWriterTypewriterSoundEnabled();
}

export function saveWriterTypewriterSoundPreference(userId: string, enabled: boolean) {
  try {
    window.localStorage.setItem(writerTypewriterSoundStorageKey(userId), enabled ? "on" : "off");
  } catch {
    // Writer remains usable when storage is unavailable.
  }
}

export function writerTypewriterVoiceSettings(random = Math.random) {
  return {
    gain: BASE_GAIN * (0.94 + random() * 0.12),
    playbackRate: 1 - PLAYBACK_RATE_VARIATION + random() * PLAYBACK_RATE_VARIATION * 2,
  };
}

export function primeWriterTypewriterSound() {
  const context = writerAudioContext();
  if (!context) return Promise.resolve(false);
  if (context.state === "suspended") void context.resume();
  return loadWriterTypewriterBuffer(context).then(Boolean);
}

export function playWriterTypewriterClick() {
  const now = performance.now();
  if (now - lastPlayedAt < MIN_INTERVAL_MS || activeVoices.size >= WRITER_TYPEWRITER_MAX_ACTIVE_VOICES) return false;
  const context = writerAudioContext();
  if (!context) return false;
  if (!audioBuffer) {
    void loadWriterTypewriterBuffer(context);
    if (context.state === "suspended") void context.resume();
    return false;
  }
  if (context.state === "suspended") {
    void context.resume();
    return false;
  }
  const start = context.currentTime;
  const settings = writerTypewriterVoiceSettings();
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = audioBuffer;
  source.playbackRate.setValueAtTime(settings.playbackRate, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(settings.gain, start + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + WRITER_TYPEWRITER_EFFECTIVE_DURATION_SECONDS);
  source.connect(gain).connect(context.destination);
  source.start(start, 0, WRITER_TYPEWRITER_EFFECTIVE_DURATION_SECONDS);
  source.stop(start + WRITER_TYPEWRITER_EFFECTIVE_DURATION_SECONDS + 0.01);
  activeVoices.add(source);
  lastPlayedAt = now;
  source.addEventListener("ended", () => {
    activeVoices.delete(source);
    source.disconnect();
    gain.disconnect();
  }, { once: true });
  return true;
}

export function isWriterTextInputKey(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "isComposing">) {
  return !event.isComposing
    && !event.ctrlKey
    && !event.metaKey
    && !event.altKey
    && [...event.key].length === 1;
}

function writerAudioContext() {
  const Context = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;
  audioContext ??= new Context();
  return audioContext;
}

function loadWriterTypewriterBuffer(context: AudioContext) {
  if (audioBuffer) return Promise.resolve(audioBuffer);
  audioBufferPromise ??= fetch(WRITER_TYPEWRITER_AUDIO_URL, { cache: "force-cache" })
    .then((response) => {
      if (!response.ok) throw new Error("Writer typewriter audio unavailable");
      return response.arrayBuffer();
    })
    .then((data) => context.decodeAudioData(data))
    .then((decoded) => {
      audioBuffer = decoded;
      return decoded;
    })
    .catch(() => {
      audioBufferPromise = null;
      return null;
    });
  return audioBufferPromise;
}
