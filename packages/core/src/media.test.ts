import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHARE_QUALITY,
  captureConstraintsFor,
  shareDimensions,
  shareEncodingFor,
  shareMaxBitrateBps,
} from './media.js';

describe('qualidade da transmissão', () => {
  it('pede resolução à captura, e não apenas taxa de quadros', () => {
    // specs/screen-sharing: "Resolução pedida na captura". Pedir só framerate
    // deixava a resolução a critério da plataforma, e nenhum codificador
    // recupera pixels que a captura não produziu.
    const constraints = captureConstraintsFor({
      resolution: '1080p',
      framerate: 60,
      bitrate: 'high',
    });

    expect(constraints.width).toEqual({ ideal: 1920 });
    expect(constraints.height).toEqual({ ideal: 1080 });
    expect(constraints.frameRate).toEqual({ ideal: 60 });
  });

  it('pede com ideal, para que uma janela menor capture no tamanho que tem', () => {
    const constraints = captureConstraintsFor(DEFAULT_SHARE_QUALITY);

    for (const value of [constraints.width, constraints.height, constraints.frameRate]) {
      expect(value).not.toHaveProperty('exact');
    }
  });

  it('traduz cada resolução nas dimensões correspondentes', () => {
    expect(shareDimensions('720p')).toEqual({ width: 1280, height: 720 });
    expect(shareDimensions('360p')).toEqual({ width: 640, height: 360 });
  });

  it('ordena os tetos de bitrate do menor para o maior', () => {
    expect(shareMaxBitrateBps('low')).toBeLessThan(shareMaxBitrateBps('medium'));
    expect(shareMaxBitrateBps('medium')).toBeLessThan(shareMaxBitrateBps('high'));
  });

  it('publica uma codificação com o teto e os quadros escolhidos', () => {
    // Uma só: a qualidade é de quem transmite, e é a mesma para toda a sala.
    expect(shareEncodingFor({ resolution: '720p', framerate: 30, bitrate: 'medium' })).toEqual({
      maxBitrate: 2_000_000,
      maxFramerate: 30,
    });
  });

  it('parte de 1080p60 no bitrate mais alto', () => {
    // O caso de uso é mostrar jogo para amigos; o padrão conservador seria uma
    // resposta pior à pergunta que motivou a mudança.
    expect(DEFAULT_SHARE_QUALITY).toEqual({
      resolution: '1080p',
      framerate: 60,
      bitrate: 'high',
    });
  });
});
