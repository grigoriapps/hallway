// Мягкие звуки. Синтезируются через Web Audio — никаких аудиофайлов.
//  online  — два восходящих «колокольчика» (ми → си)
//  offline — два нисходящих, тише и длиннее (соль → до)
//  message — вариант на выбор: колокольчик, щебет птиц, свист, капля, маримба, пузырёк, арфа
//            или без звука; своя мелодия у личных сообщений, групп и общего чата

import type { MessageTone, SoundEvent, SoundKind } from './types'

/** если событий много подряд (несколько человек, пачка сообщений) — один звук, а не очередь */
const COALESCE_MS: Record<SoundKind, number> = { online: 1200, offline: 1200, message: 700 }

let context: AudioContext | null = null
const lastPlayed: Record<SoundKind, number> = { online: -Infinity, offline: -Infinity, message: -Infinity }

function getContext(): AudioContext {
  context ??= new AudioContext()
  if (context.state === 'suspended') void context.resume()
  return context
}

/** Нота колокольчика: основной тон и тихие обертоны, быстрая атака и плавное затухание */
function chime(ac: AudioContext, out: AudioNode, frequency: number, at: number, peak: number, length: number) {
  const partials: Array<[ratio: number, level: number]> = [
    [1, 1],
    [2, 0.16],
    [3, 0.04]
  ]
  for (const [ratio, level] of partials) {
    const osc = ac.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = frequency * ratio
    const gain = ac.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(peak * level, at + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length / ratio)
    osc.connect(gain).connect(out)
    osc.start(at)
    osc.stop(at + length + 0.05)
  }
}

/** Короткая птичья трель: тон быстро взлетает и опускается */
function chirp(
  ac: AudioContext,
  out: AudioNode,
  at: number,
  from: number,
  top: number,
  to: number,
  length: number,
  peak: number
) {
  const osc = ac.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(from, at)
  osc.frequency.exponentialRampToValueAtTime(top, at + length * 0.35)
  osc.frequency.exponentialRampToValueAtTime(to, at + length)
  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
  osc.connect(gain).connect(out)
  osc.start(at)
  osc.stop(at + length + 0.05)
}

/** Свист: плавный подъём с лёгкой вибрацией и мягким затуханием */
function whistle(ac: AudioContext, out: AudioNode, at: number) {
  const osc = ac.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(880, at)
  osc.frequency.exponentialRampToValueAtTime(1720, at + 0.14)
  osc.frequency.exponentialRampToValueAtTime(1320, at + 0.36)

  const vibrato = ac.createOscillator()
  vibrato.frequency.value = 11
  const vibratoAmount = ac.createGain()
  vibratoAmount.gain.value = 26
  vibrato.connect(vibratoAmount).connect(osc.frequency)

  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.12, at + 0.05)
  gain.gain.setValueAtTime(0.12, at + 0.22)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.42)

  osc.connect(gain).connect(out)
  osc.start(at)
  vibrato.start(at)
  osc.stop(at + 0.47)
  vibrato.stop(at + 0.47)
}

/** Капля: щелчок и быстро падающий тон */
function drop(ac: AudioContext, out: AudioNode, at: number) {
  const osc = ac.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(1250, at)
  osc.frequency.exponentialRampToValueAtTime(240, at + 0.17)
  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.16, at + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.24)
  osc.connect(gain).connect(out)
  osc.start(at)
  osc.stop(at + 0.3)
  // тихий высокий призвук делает каплю «водянистой»
  chime(ac, out, 2100, at, 0.035, 0.09)
}

/** Маримба: деревянный удар — основной тон и быстро гаснущий обертон на 4-й гармонике */
function mallet(ac: AudioContext, out: AudioNode, frequency: number, at: number, peak: number) {
  const partials: Array<[ratio: number, level: number, length: number]> = [
    [1, 1, 0.32],
    [3.93, 0.22, 0.07],
    [9.2, 0.05, 0.03]
  ]
  for (const [ratio, level, length] of partials) {
    const osc = ac.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = frequency * ratio
    const gain = ac.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(peak * level, at + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
    osc.connect(gain).connect(out)
    osc.start(at)
    osc.stop(at + length + 0.05)
  }
}

/** Пузырёк: короткий тон, быстро взлетающий вверх */
function bubble(ac: AudioContext, out: AudioNode, at: number, from: number, to: number, peak: number) {
  const osc = ac.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(from, at)
  osc.frequency.exponentialRampToValueAtTime(to, at + 0.07)
  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.1)
  osc.connect(gain).connect(out)
  osc.start(at)
  osc.stop(at + 0.14)
}

/** Струна арфы: треугольная волна с мягкой атакой и долгим затуханием */
function pluck(ac: AudioContext, out: AudioNode, frequency: number, at: number, peak: number) {
  const osc = ac.createOscillator()
  osc.type = 'triangle'
  osc.frequency.value = frequency
  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.6)
  osc.connect(gain).connect(out)
  osc.start(at)
  osc.stop(at + 0.65)
}

function playMessageTone(ac: AudioContext, out: AudioNode, at: number, tone: MessageTone): void {
  switch (tone) {
    case 'chime':
      chime(ac, out, 1046.5, at, 0.09, 0.35)
      chime(ac, out, 1318.51, at + 0.08, 0.08, 0.45)
      break
    case 'birds':
      chirp(ac, out, at, 2100, 3400, 2500, 0.09, 0.11)
      chirp(ac, out, at + 0.13, 2400, 3800, 2800, 0.07, 0.095)
      chirp(ac, out, at + 0.24, 1950, 3000, 2250, 0.1, 0.08)
      break
    case 'whistle':
      whistle(ac, out, at)
      break
    case 'drop':
      drop(ac, out, at)
      break
    case 'marimba':
      mallet(ac, out, 783.99, at, 0.13)
      mallet(ac, out, 1046.5, at + 0.11, 0.12)
      break
    case 'pop':
      bubble(ac, out, at, 420, 980, 0.14)
      bubble(ac, out, at + 0.1, 560, 1300, 0.11)
      break
    case 'harp':
      pluck(ac, out, 1046.5, at, 0.07)
      pluck(ac, out, 1318.51, at + 0.07, 0.065)
      pluck(ac, out, 1567.98, at + 0.14, 0.06)
      break
    case 'none':
      break
  }
}

export function playSound(event: SoundEvent, options: { force?: boolean } = {}): void {
  const { kind, tone } = event
  const now = performance.now()
  if (!options.force && now - lastPlayed[kind] < COALESCE_MS[kind]) return
  lastPlayed[kind] = now

  try {
    const ac = getContext()
    const filter = ac.createBiquadFilter()
    filter.type = 'lowpass'
    // щебет и свист живут выше колокольчиков — фильтр не должен их срезать
    filter.frequency.value = kind === 'message' ? 7000 : 3500
    filter.connect(ac.destination)

    const start = ac.currentTime + 0.03
    switch (kind) {
      case 'online':
        chime(ac, filter, 659.25, start, 0.16, 0.9)
        chime(ac, filter, 987.77, start + 0.13, 0.13, 1.0)
        break
      case 'offline':
        chime(ac, filter, 783.99, start, 0.11, 0.9)
        chime(ac, filter, 523.25, start + 0.16, 0.1, 1.2)
        break
      case 'message':
        playMessageTone(ac, filter, start, tone)
        break
    }
  } catch (err) {
    console.warn('sound failed', err)
  }
}
