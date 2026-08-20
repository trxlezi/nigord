import type { ContentKind } from '@nigord/shared';

/**
 * Media constraints and encoding policy, kept as plain data so the choices
 * are inspectable and testable without a browser.
 */

/**
 * Voice capture. Echo cancellation and noise suppression are wanted here and
 * only here — see systemAudioConstraints for why.
 */
export const microphoneConstraints = (deviceId: string): MediaTrackConstraints => ({
  ...(deviceId === 'default' ? {} : { deviceId: { exact: deviceId } }),
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
});

/**
 * System audio must bypass every voice filter (design.md D3).
 *
 * Echo cancellation and noise suppression assume the signal is speech and treat
 * music and sound effects as noise to remove. Running game audio through them
 * destroys it. Stereo and the full sample rate are kept for the same reason.
 */
export const systemAudioConstraints = (): MediaTrackConstraints => ({
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 2,
});

/**
 * The content hint tells the encoder what it is looking at. Without it, screen
 * share is encoded as if it were a video call: low framerate, conservative
 * bitrate, blurry under motion.
 *
 * 'motion' trades detail for fluidity (games). 'detail' trades framerate for
 * sharpness (code, text). See specs/screen-sharing.
 */
export const contentHintFor = (kind: ContentKind): 'motion' | 'detail' =>
  kind === 'motion' ? 'motion' : 'detail';

export const SHARE_RESOLUTIONS = ['1080p', '720p', '480p', '360p'] as const;
export type ShareResolution = (typeof SHARE_RESOLUTIONS)[number];

export const SHARE_FRAMERATES = [15, 24, 30, 60] as const;
export type ShareFramerate = (typeof SHARE_FRAMERATES)[number];

export const SHARE_BITRATES = ['low', 'medium', 'high'] as const;
export type ShareBitrate = (typeof SHARE_BITRATES)[number];

export interface ShareQuality {
  readonly resolution: ShareResolution;
  readonly framerate: ShareFramerate;
  readonly bitrate: ShareBitrate;
}

const RESOLUTION_DIMENSIONS: Record<ShareResolution, { width: number; height: number }> = {
  '1080p': { width: 1920, height: 1080 },
  '720p': { width: 1280, height: 720 },
  '480p': { width: 854, height: 480 },
  '360p': { width: 640, height: 360 },
};

/**
 * Tetos de bitrate, em bits por segundo.
 *
 * Estes números não são multiplicados por espectador: com um SFU, quem
 * transmite sobe um fluxo só. É por isso que o projeto de referência, que é
 * mesh, precisa ser mais conservador aqui do que este.
 */
const BITRATE_BPS: Record<ShareBitrate, number> = {
  low: 700_000,
  medium: 2_000_000,
  high: 4_000_000,
};

export const shareDimensions = (resolution: ShareResolution): { width: number; height: number } =>
  RESOLUTION_DIMENSIONS[resolution];

export const shareMaxBitrateBps = (bitrate: ShareBitrate): number => BITRATE_BPS[bitrate];

/**
 * O que se pede à captura.
 *
 * Tudo `ideal` e nada `exact`: uma janela menor que a resolução escolhida deve
 * ser capturada no tamanho que tem, e não recusada. Pedir só a taxa de quadros
 * — o que esta função fazia antes — deixava a resolução a critério da
 * plataforma, e nenhum codificador recupera pixels que a captura não produziu.
 */
export const captureConstraintsFor = (quality: ShareQuality): MediaTrackConstraints => {
  const { width, height } = shareDimensions(quality.resolution);
  return {
    width: { ideal: width },
    height: { ideal: height },
    frameRate: { ideal: quality.framerate },
  };
};

/**
 * A publicação: uma codificação só, com o teto escolhido por quem transmite
 * (design D1 de qualidade-escolhida-por-quem-transmite).
 *
 * Não há camadas. Com simulcast, quem escolhia o que cada espectador recebia
 * eram o tamanho da janela dele, a estimativa de banda e o dynacast — e o
 * resultado medido foi 960×540 numa captura de 1920×1080, sem que quem
 * transmitia soubesse. Aqui a sala inteira vê o que quem mostra escolheu.
 */
export const shareEncodingFor = (
  quality: ShareQuality,
): { maxBitrate: number; maxFramerate: number } => ({
  maxBitrate: shareMaxBitrateBps(quality.bitrate),
  maxFramerate: quality.framerate,
});

export const DEFAULT_SHARE_QUALITY: ShareQuality = {
  resolution: '1080p',
  framerate: 60,
  bitrate: 'high',
};

/** Voice needs very little; the ceiling exists to stop the encoder overreaching. */
export const VOICE_MAX_BITRATE_BPS = 32_000;

/** System audio is music-grade and stereo, so it gets a real budget. */
export const SYSTEM_AUDIO_MAX_BITRATE_BPS = 160_000;
