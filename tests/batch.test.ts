import { describe, expect, it } from 'vitest';
import { fillTemplate, parseCsv, placeholders, rowName } from '../src/batch.js';

const row = { n: '7', hook: 'Cap the *renewal* price.', body: '', items: '["a","b"]', score: '92', id: 'Tip 07' };

describe('fillTemplate', () => {
  it('substitutes text placeholders inside strings', () => {
    expect(fillTemplate({ kicker: 'Tip {{n}} of 30', text: '{{hook}}' }, row, 'row 1')).toEqual({ kicker: 'Tip 7 of 30', text: 'Cap the *renewal* price.' });
  });

  it('casts typed placeholders', () => {
    expect(fillTemplate({ value: '{{score:number}}', items: '{{items:json}}' }, row, 'row 1')).toEqual({ value: 92, items: ['a', 'b'] });
  });

  it('drops optional fields and list entries when the cell is empty', () => {
    expect(fillTemplate({ body: '{{body?}}', lines: ['{{hook}}', '{{body?}}'], note: 'x' }, row, 'row 1')).toEqual({ lines: ['Cap the *renewal* price.'], note: 'x' });
  });

  it('names the missing column and the row', () => {
    expect(() => fillTemplate({ text: '{{missing}}' }, row, 'row 3')).toThrow(/row 3.*"missing"/);
    expect(() => fillTemplate({ text: '{{body}}' }, row, 'row 3')).toThrow(/"body"/);
    expect(() => fillTemplate({ value: '{{hook:number}}' }, row, 'row 3')).toThrow(/should be a number/);
  });

  it('leaves non-string values alone', () => {
    expect(fillTemplate({ duration: 3.5, flag: true, nested: { n: '{{n:number}}' } }, row, 'row 1')).toEqual({ duration: 3.5, flag: true, nested: { n: 7 } });
  });
});

describe('placeholders', () => {
  it('lists every referenced column once', () => {
    expect(placeholders({ a: '{{x}} and {{y?}}', b: ['{{x:number}}'], c: { d: '{{z:json}}' } }).sort()).toEqual(['x', 'y', 'z']);
  });
});

describe('parseCsv', () => {
  it('handles quotes, commas, escaped quotes and newlines', () => {
    const rows = parseCsv('id,text\r\n1,"Hello, world"\n2,"She said ""hi""\nand left"\n\n');
    expect(rows).toEqual([{ id: '1', text: 'Hello, world' }, { id: '2', text: 'She said "hi"\nand left' }]);
  });

  it('strips a BOM and trims headers', () => {
    expect(parseCsv('﻿ id , n \n a, 1\n')).toEqual([{ id: 'a', n: '1' }]);
  });
});

describe('rowName', () => {
  it('prefers id, then slug or name, else the row number', () => {
    expect(rowName({ id: 'Tip 07' }, 0)).toBe('tip-07');
    expect(rowName({ slug: 'room-rent' }, 4)).toBe('room-rent');
    expect(rowName({}, 4)).toBe('row-05');
    expect(rowName({ n: '3', topic: 'Co pay' }, 0, 'tip-{{n}}-{{topic}}')).toBe('tip-3-co-pay');
  });
});
