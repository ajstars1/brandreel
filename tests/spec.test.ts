import { describe, expect, it } from 'vitest';
import { dimensions, parseVideo, totalDuration } from '../src/spec.js';

const brand = {
  name: 'Test',
  colors: { primary: '#112233', primaryDark: '#001122', accent: '#445566' },
  fonts: { display: { family: 'Anton' }, body: { family: 'Poppins' } }
};

describe('parseVideo', () => {
  it('fills defaults for format, fps, transition, colours and logo motion', () => {
    const video = parseVideo({ brand, scenes: [{ template: 'strike', duration: 3, before: 'Old way.', after: 'New *way.*' }] });
    expect(video.format).toBe('16:9');
    expect(video.fps).toBe(30);
    expect(video.transition).toBe('wipe');
    expect(video.brand.colors.paper).toBe('#fbfbf8');
    expect(video.brand.logoMotion).toBe('pop');
  });

  it('rejects unknown templates', () => {
    expect(() => parseVideo({ brand, scenes: [{ template: 'nope', duration: 3 }] })).toThrow();
  });

  it('rejects bad colours', () => {
    expect(() => parseVideo({ brand: { ...brand, colors: { ...brand.colors, primary: 'purple' } }, scenes: [{ template: 'logo-reveal', duration: 3 }] })).toThrow(/hex/);
  });

  it('requires at least one flag in doc-scan', () => {
    expect(() => parseVideo({ brand, scenes: [{ template: 'doc-scan', duration: 3, docTitle: 'x', flags: [], headline: ['h'] }] })).toThrow();
  });
});

describe('helpers', () => {
  it('sums scene durations', () => {
    expect(totalDuration({ scenes: [{ template: 'logo-reveal', duration: 2.5 }, { template: 'logo-reveal', duration: 1.5 }] as never })).toBe(4);
  });

  it('maps formats to pixel sizes', () => {
    expect(dimensions('9:16')).toEqual({ width: 1080, height: 1920 });
    expect(dimensions('4:5')).toEqual({ width: 1080, height: 1350 });
  });
});
