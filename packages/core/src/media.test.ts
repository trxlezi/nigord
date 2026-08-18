import { describe, expect, it } from 'vitest';
import { captureFramerateFor, screenShareLayers } from './media.js';

describe('screen share framerate', () => {
  it('asks the capture for the framerate the encoder is allowed to send', () => {
    // These drifted once already: the encoder was set to 60 while the capture
    // ran at Chromium's default, so the top layer was unreachable.
    for (const kind of ['motion', 'detail'] as const) {
      const asked = captureFramerateFor(kind).frameRate as { ideal: number };
      const [top] = screenShareLayers(kind);
      expect(asked.ideal).toBe(top?.maxFramerate);
    }
  });

  it('asks for 60 on motion and stays low on detail', () => {
    expect((captureFramerateFor('motion').frameRate as { ideal: number }).ideal).toBe(60);
    expect((captureFramerateFor('detail').frameRate as { ideal: number }).ideal).toBe(15);
  });

  it('asks with ideal, so a machine that cannot sustain it still captures', () => {
    expect(captureFramerateFor('motion').frameRate).not.toHaveProperty('exact');
  });
});
