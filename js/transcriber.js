// Live transcription, using what the browser already has.
//
// The app has no runtime dependencies and is not about to grow one for this:
// every in-browser speech library worth using is megabytes of model weights,
// which would dwarf the entire app. The Web Speech API is already in the
// platform, costs nothing to ship, and is what a PWA is for.
//
// Two things about it have to be said plainly rather than buried, and the UI
// says both:
//
//  1. It is not in every browser. Chrome and Edge have it, Safari has it under
//     a prefix and inconsistently, Firefox does not. So the paste-a-transcript
//     path is not a fallback bolted on afterwards — it is the path that always
//     works, and recording is the convenience on top.
//
//  2. In Chrome it is not local. Audio goes to Google's servers for
//     recognition. For an app whose whole pitch is that your data stays in
//     your browser, that is a material difference, and the person deciding
//     whether to press record is the one who should be told — not reassured.

const Recognition = typeof window !== 'undefined'
  && (window.SpeechRecognition || window.webkitSpeechRecognition);

export function isSupported() {
  return !!Recognition;
}

/**
 * The caveat the UI shows before anyone presses record.
 *
 * Stated unconditionally, because no API reports whether a given engine runs
 * locally or in a datacentre, and the mainstream one does not run locally. A
 * wrong "this stays on your device" is the one error here that actually costs
 * somebody something, so we never claim it.
 */
export const PRIVACY_NOTE = 'Your browser does the listening. In Chrome and Edge that means the audio '
  + 'is sent to the browser vendor to be recognised — unlike the rest of this app, it does not stay '
  + 'on your device. Nothing is stored anywhere but here.';

export function createTranscriber({ onInterim, onFinal, onError, onEnd, lang = 'en-GB' } = {}) {
  if (!Recognition) return null;

  const recognition = new Recognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = lang;

  let running = false;
  let stopping = false;
  let startedAt = 0;

  recognition.addEventListener('result', (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = String(result[0].transcript || '').trim();
      if (!text) continue;
      if (result.isFinal) {
        if (onFinal) onFinal(text, Date.now() - startedAt);
      } else {
        interim += `${interim ? ' ' : ''}${text}`;
      }
    }
    if (onInterim) onInterim(interim);
  });

  recognition.addEventListener('error', (event) => {
    // `no-speech` and `aborted` fire routinely during a normal recording and
    // are not worth interrupting anyone over; the rest are.
    if (event.error === 'no-speech' || event.error === 'aborted') return;
    if (onError) onError(event.error);
  });

  recognition.addEventListener('end', () => {
    // The engine stops on its own after a pause. Restarting keeps a long
    // meeting in one continuous transcript rather than ending it whenever
    // somebody thinks for a moment.
    if (running && !stopping) {
      try {
        recognition.start();
        return;
      } catch (err) {
        console.warn('Could not resume listening.', err);
      }
    }
    running = false;
    stopping = false;
    if (onEnd) onEnd();
  });

  return {
    start() {
      if (running) return true;
      try {
        startedAt = Date.now();
        recognition.start();
        running = true;
        return true;
      } catch (err) {
        if (onError) onError(err.message || 'could-not-start');
        return false;
      }
    },
    stop() {
      if (!running) return;
      stopping = true;
      running = false;
      try { recognition.stop(); } catch (err) { console.warn('Could not stop listening.', err); }
    },
    isRunning() { return running; },
    elapsed() { return running ? Date.now() - startedAt : 0; },
  };
}
