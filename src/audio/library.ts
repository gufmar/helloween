import type { FigureKind } from '../core/types';

/** Local MP3s from /media (served by Vite plugin). Filenames may contain spaces. */
export const MEDIA = {
  ghostStart: '/media/06%20-%20Free%20Sounds%20-%20Ghostly%20Whisper.mp3',
  ghostBoo: '/media/spooky-ghost-uuuh-sound-effect.mp3',
  spookyStart: '/media/07%20-%20Free%20Sounds%20-%20Ghostly%20Breath.mp3',
  spookyAccent: '/media/haunted-piano.mp3',
  spiderStart: '/media/suspense-string-glissando-sound-effect_for-spider.mp3',
  spiderAccent: '/media/silly-spooky-alarm-fx.mp3',
  pumpkinStart: '/media/half-broken-music-box.mp3',
  pumpkinAccent: '/media/silly-spooky-alarm-fx.mp3',
  witchStart: '/media/witch-laugh-sound-effect.mp3',
  witchAccent: '/media/screeching-strings.mp3',
  unlockClick: '/media/undertaker-bell-sound-effect.mp3',
} as const;

export function startSoundFor(figure: FigureKind): string {
  switch (figure) {
    case 'spider':
      return MEDIA.spiderStart;
    case 'pumpkin':
      return MEDIA.pumpkinStart;
    case 'witch':
      return MEDIA.witchStart;
    case 'ghostSpooky':
      return MEDIA.spookyStart;
    case 'phantomMask':
      return MEDIA.ghostStart;
    default:
      return MEDIA.ghostStart;
  }
}

export function accentSoundFor(figure: FigureKind): string {
  switch (figure) {
    case 'spider':
      return MEDIA.spiderAccent;
    case 'pumpkin':
      return MEDIA.pumpkinAccent;
    case 'witch':
      return MEDIA.witchAccent;
    case 'ghostSpooky':
      return MEDIA.spookyAccent;
    case 'phantomMask':
      return MEDIA.ghostBoo;
    default:
      return MEDIA.ghostBoo;
  }
}
