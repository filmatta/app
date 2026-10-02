"use client";

const MIN_INTERVAL_MS = 34;
const MAX_ACTIVE_VOICES = 3;

let audioContext: AudioContext | null = null;
let lastPlayedAt = 0;
let activeVoices = 0;

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

export function playWriterTypewriterClick() {
  const now = performance.now();
  if (now - lastPlayedAt < MIN_INTERVAL_MS || activeVoices >= MAX_ACTIVE_VOICES) return false;
  const Context = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return false;
  audioContext ??= new Context();
  if (audioContext.state === "suspended") void audioContext.resume();
  const start = audioContext.currentTime;
  const duration = 0.026;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(760 + Math.random() * 90, start);
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1050, start);
  filter.Q.setValueAtTime(0.7, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.018 + Math.random() * 0.005, start + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(filter).connect(gain).connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
  activeVoices += 1;
  lastPlayedAt = now;
  oscillator.addEventListener("ended", () => { activeVoices = Math.max(0, activeVoices - 1); }, { once: true });
  return true;
}

export function isWriterTextInputKey(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "isComposing">) {
  return !event.isComposing
    && !event.ctrlKey
    && !event.metaKey
    && !event.altKey
    && [...event.key].length === 1;
}
