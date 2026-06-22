/**
 * Efeitos sonoros (bônus) gerados via Web Audio API — sem assets binários.
 * Camada Service: encapsula a integração com o áudio do browser. O
 * AudioContext é criado preguiçosamente (após gesto do usuário) e os tons são
 * sintetizados para feedback de aposta, cashout, crash e vitória.
 */

let audioContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    audioContext = new Ctor();
  }
  return audioContext;
}

type ToneStep = { freq: number; start: number; duration: number };

function playSequence(steps: ToneStep[], type: OscillatorType = 'sine'): void {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();

  const now = ctx.currentTime;
  for (const step of steps) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = step.freq;

    const startAt = now + step.start;
    const endAt = startAt + step.duration;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(endAt);
  }
}

export const sound = {
  /** Clique curto ao registrar a aposta. */
  bet(): void {
    playSequence([{ freq: 440, start: 0, duration: 0.12 }], 'triangle');
  },
  /** Arpejo ascendente ao sacar. */
  cashout(): void {
    playSequence(
      [
        { freq: 523, start: 0, duration: 0.1 },
        { freq: 784, start: 0.08, duration: 0.12 },
      ],
      'triangle',
    );
  },
  /** Acorde de vitória (cashout que virou WON na liquidação). */
  win(): void {
    playSequence(
      [
        { freq: 523, start: 0, duration: 0.14 },
        { freq: 659, start: 0.1, duration: 0.14 },
        { freq: 988, start: 0.2, duration: 0.2 },
      ],
      'sine',
    );
  },
  /** Descida grave de crash. */
  crash(): void {
    playSequence(
      [
        { freq: 220, start: 0, duration: 0.18 },
        { freq: 110, start: 0.12, duration: 0.28 },
      ],
      'sawtooth',
    );
  },
};
