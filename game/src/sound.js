// Tiny synthesised sounds: no audio files, just a WebAudio oscillator started on the
// first user gesture. Mute toggles everything off.
export function createSound() {
  let context = null;
  let muted = false;

  function ensure() {
    if (context === null) {
      try {
        const AudioContext = window.AudioContext ?? window.webkitAudioContext;
        context = new AudioContext();
      } catch {
        context = null;
      }
    }
    if (context !== null && context.state === 'suspended') context.resume();
    return context;
  }

  function beep(frequency, seconds, type, volume, when = 0) {
    if (muted) return;
    const audio = ensure();
    if (audio === null) return;
    const start = audio.currentTime + when;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.05);
  }

  return {
    toggleMute() {
      muted = !muted;
      return muted;
    },
    get muted() {
      return muted;
    },
    /** Two-note chime when a treasure is pocketed. */
    pickup() {
      beep(880, 0.12, 'sine', 0.12);
      beep(1318, 0.18, 'sine', 0.1, 0.09);
    },
    /** Soft clink when a coin is thrown. */
    coin() {
      beep(1568, 0.07, 'triangle', 0.08);
    },
    /** Low puff when a smoke bomb goes off. */
    smoke() {
      beep(220, 0.25, 'sawtooth', 0.05);
    },
    /** Short warning blip while the alarm is high. */
    alarmTick() {
      beep(1175, 0.09, 'square', 0.045);
    },
    /** A guard has spotted the thief and gives chase. */
    spotted() {
      beep(392, 0.12, 'square', 0.07);
      beep(311, 0.16, 'square', 0.07, 0.1);
    },
    /** The run ends: caught. */
    caught() {
      beep(220, 0.3, 'sawtooth', 0.09);
      beep(165, 0.45, 'sawtooth', 0.09, 0.22);
    },
    /** The getaway: a rising arpeggio. */
    escaped() {
      [523, 659, 784, 1047].forEach((frequency, index) => {
        beep(frequency, 0.22, 'sine', 0.1, index * 0.11);
      });
    },
  };
}
