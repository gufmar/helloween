/** Audio output device for HTMLMediaElement.setSinkId (Chromium). */

export interface AudioOutputDevice {
  deviceId: string;
  label: string;
}

let cached: AudioOutputDevice[] | null = null;

export function getCachedAudioOutputs(): AudioOutputDevice[] {
  return cached ?? [];
}

/**
 * Enumerate speaker outputs. Labels need a prior media permission on some browsers;
 * we try a short getUserMedia and immediately stop tracks.
 */
export async function refreshAudioOutputDevices(): Promise<AudioOutputDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    cached = [{ deviceId: '', label: 'System-Standard' }];
    return cached;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const t of stream.getTracks()) t.stop();
  } catch {
    /* labels may stay empty; deviceIds can still work */
  }
  const all = await navigator.mediaDevices.enumerateDevices();
  const outs = all
    .filter((d) => d.kind === 'audiooutput')
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label?.trim() || `Lautsprecher ${i + 1}`,
    }));
  cached = [{ deviceId: '', label: 'System-Standard' }, ...outs];
  return cached;
}

type SinkMedia = HTMLMediaElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
  sinkId?: string;
};

export function canSetSinkId(): boolean {
  if (typeof HTMLMediaElement === 'undefined') return false;
  return typeof (HTMLMediaElement.prototype as SinkMedia).setSinkId === 'function';
}

export async function applyMediaSinkId(
  el: HTMLMediaElement,
  sinkId: string,
): Promise<string | null> {
  const media = el as SinkMedia;
  if (typeof media.setSinkId !== 'function') {
    return 'setSinkId is not supported in this browser (Chrome/Edge recommended).';
  }
  const id = sinkId || '';
  if (media.sinkId === id) return null;
  try {
    await media.setSinkId(id);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
