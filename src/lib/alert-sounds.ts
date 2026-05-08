// Web Audio API based alert sounds - no external files needed

let AUDIO_CONTEXT: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!AUDIO_CONTEXT) {
    AUDIO_CONTEXT = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    )();
  }
  return AUDIO_CONTEXT;
}

// Check if alert sounds are enabled
export function areAlertSoundsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("sysmonitor.alertSoundsEnabled") === "true";
}

export function setAlertSoundsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("sysmonitor.alertSoundsEnabled", enabled ? "true" : "false");
}

// Resume audio context (required after user interaction)
export async function ensureAudioContext(): Promise<AudioContext | null> {
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
  return ctx;
}

// Play a warning sound (lower pitch, gentle beep)
export async function playWarningSound(): Promise<void> {
  if (!areAlertSoundsEnabled()) return;

  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = "sine";
  osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
  osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.3);

  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.3);
}

// Play a critical alert sound (higher pitch, urgent)
export async function playCriticalSound(): Promise<void> {
  if (!areAlertSoundsEnabled()) return;

  const ctx = await ensureAudioContext();
  if (!ctx) return;

  // First beep
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.type = "square";
  osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
  gain1.gain.setValueAtTime(0.2, ctx.currentTime);
  gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
  osc1.start(ctx.currentTime);
  osc1.stop(ctx.currentTime + 0.1);

  // Second beep (slightly delayed)
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.type = "square";
  osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
  gain2.gain.setValueAtTime(0.2, ctx.currentTime + 0.15);
  gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
  osc2.start(ctx.currentTime + 0.15);
  osc2.stop(ctx.currentTime + 0.25);
}

// Play sound based on severity
export async function playAlertSound(severity: "warn" | "critical"): Promise<void> {
  if (severity === "critical") {
    await playCriticalSound();
  } else {
    await playWarningSound();
  }
}

// Test sound (for settings page)
export async function testAlertSound(severity: "warn" | "critical"): Promise<void> {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  // Temporarily play regardless of setting for testing
  if (severity === "critical") {
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.type = "square";
    osc1.frequency.setValueAtTime(880, ctx.currentTime);
    gain1.gain.setValueAtTime(0.2, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.1);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = "square";
    osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
    gain2.gain.setValueAtTime(0.2, ctx.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
    osc2.start(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.25);
  } else {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  }
}
