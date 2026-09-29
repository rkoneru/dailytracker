// Recording a meeting's audio with what the browser already has.
//
// MediaRecorder is in every current browser, phones included, so this is the
// part of recording that works everywhere. Live speech-to-text is a separate,
// optional layer (transcriber.js) that only some browsers have.
//
// It fails for a handful of reasons, and "nothing happened" is the worst way
// to report any of them, so each one is named before or as it happens: the
// page is not served over https (the browser will not hand over a microphone
// at all), the microphone is blocked for this site, there is no microphone, or
// another app has it. The checks that can be made before anyone presses the
// button are made then.
//
// While recording, a level meter and a clock show that sound is actually
// arriving; a recorder that looks the same whether it is working or not is
// how the old button came to seem dead.

const TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];

/** Why this browser cannot record here, or null when it can. */
export function recordingBlocker() {
  if (typeof window === 'undefined') return 'No browser.';
  if (!window.isSecureContext) {
    return 'Recording needs the app served over https (or from localhost). This page is plain http, so the browser will not give it a microphone.';
  }
  if (!navigator.mediaDevices?.getUserMedia) return 'This browser does not give web pages a microphone.';
  if (typeof MediaRecorder === 'undefined') return 'This browser cannot record audio.';
  return null;
}

/** A plain sentence for each way getUserMedia refuses. */
export function explainMicError(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return 'The microphone is blocked for this site. Allow it from the icon in the address bar (or the browser’s site settings), then press record again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
    return 'No microphone was found. Plug one in or check the system’s sound settings.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return 'The microphone could not be opened — another app (Teams, Zoom, a call) may be using it.';
  }
  return `The microphone could not be started${err?.message ? `: ${err.message}` : ''}.`;
}

function pickType() {
  return TYPES.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
}

/**
 * Starts recording. Resolves to a controller, or rejects with an Error whose
 * message is already fit to show. `onLevel(0..1)` and `onTick(ms)` drive the
 * meter and the clock.
 */
export async function startAudio({ onLevel, onTick } = {}) {
  const blocked = recordingBlocker();
  if (blocked) throw new Error(blocked);
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (err) {
    throw new Error(explainMicError(err));
  }

  const mimeType = pickType();
  const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32000 });
  const chunks = [];
  recorder.addEventListener('dataavailable', (e) => { if (e.data && e.data.size) chunks.push(e.data); });

  // Time actually spent recording, pauses excluded.
  let elapsed = 0;
  let resumedAt = Date.now();
  const now = () => elapsed + (recorder.state === 'recording' ? Date.now() - resumedAt : 0);
  const tick = setInterval(() => onTick?.(now()), 250);

  // The meter is a nicety: a browser without Web Audio still records.
  let audio = null;
  let frame = 0;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audio = new Ctx();
    const analyser = audio.createAnalyser();
    analyser.fftSize = 512;
    audio.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const draw = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i += 1) peak = Math.max(peak, Math.abs(data[i] - 128));
      onLevel?.(recorder.state === 'recording' ? Math.min(1, peak / 64) : 0);
      frame = requestAnimationFrame(draw);
    };
    draw();
  } catch {
    audio = null;
  }

  // A phone that sleeps mid-meeting stops the microphone; keep the screen on
  // where the browser allows it.
  let wakeLock = null;
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { wakeLock = null; }

  // A second of audio at a time, so a crash or a closed tab loses a second,
  // not the meeting.
  recorder.start(1000);

  const release = () => {
    clearInterval(tick);
    cancelAnimationFrame(frame);
    stream.getTracks().forEach((t) => t.stop());
    audio?.close?.().catch(() => {});
    wakeLock?.release?.().catch(() => {});
  };

  return {
    mimeType: recorder.mimeType || mimeType || 'audio/webm',
    elapsed: now,
    isPaused: () => recorder.state === 'paused',
    pause() {
      if (recorder.state !== 'recording') return;
      elapsed += Date.now() - resumedAt;
      recorder.pause();
    },
    resume() {
      if (recorder.state !== 'paused') return;
      resumedAt = Date.now();
      recorder.resume();
    },
    /** Stops and resolves to { blob, mimeType, duration }. */
    stop() {
      return new Promise((resolve) => {
        const duration = now();
        const finish = () => {
          release();
          const type = recorder.mimeType || mimeType || 'audio/webm';
          resolve({ blob: new Blob(chunks, { type }), mimeType: type, duration });
        };
        if (recorder.state === 'inactive') { finish(); return; }
        recorder.addEventListener('stop', finish, { once: true });
        recorder.stop();
      });
    },
  };
}

/** "3:07", "1:02:45". */
export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function formatSize(bytes) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
