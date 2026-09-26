import { describe, expect, it } from 'vitest';
import { isAccentLine, parseMarkup, plainText } from '../src/markup.js';

describe('parseMarkup', () => {
  it('splits accent segments marked with asterisks', () => {
    expect(parseMarkup('The policy you were *sold* was.')).toEqual([
      { text: 'The policy you were ', accent: false },
      { text: 'sold', accent: true },
      { text: ' was.', accent: false }
    ]);
  });

  it('keeps escaped asterisks as text', () => {
    expect(parseMarkup('5\\* rated')).toEqual([{ text: '5* rated', accent: false }]);
  });

  it('treats an unclosed asterisk as accent until the end', () => {
    expect(parseMarkup('a *b')).toEqual([{ text: 'a ', accent: false }, { text: 'b', accent: true }]);
  });
});

describe('isAccentLine', () => {
  it('is true only when every visible segment is accent', () => {
    expect(isAccentLine(parseMarkup('*They still said no.*'))).toBe(true);
    expect(isAccentLine(parseMarkup('Now it takes *minutes.*'))).toBe(false);
    expect(isAccentLine([])).toBe(false);
  });
});

describe('plainText', () => {
  it('drops markup', () => {
    expect(plainText('Know what you *sign.*')).toBe('Know what you sign.');
  });
});
