import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { SpecError } from './load.js';

// Batch rendering: one series spec with {{placeholders}} plus a CSV or JSON file of rows.
//   {{name}}          → the row's value as text
//   {{name:number}}   → as a number (for counter values, durations, scores)
//   {{name:json}}     → parsed JSON (for arrays such as list items)
//   {{name?}}         → optional: an empty cell removes the field (or the list entry) entirely
// A placeholder may sit inside longer text ("Tip {{n}} of 30"); the typed and optional forms
// must be the whole string.

export type Row = Record<string, unknown>;

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_.-]+)(\?)?(?::(number|json))?\s*\}\}/g;

export class MissingColumn extends SpecError {
  constructor(public column: string, rowLabel: string) { super(`${rowLabel}: column "${column}" is missing or empty`); }
}

const isBlank = (value: unknown): boolean => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

// Marks a value to drop from its parent object or array.
const OMIT = Symbol('omit');

function fillString(source: string, row: Row, rowLabel: string): unknown {
  const whole = new RegExp(`^${PLACEHOLDER.source}$`).exec(source);
  if (whole) {
    const [, name, optional, type] = whole;
    const value = row[name as string];
    if (isBlank(value)) {
      if (optional) return OMIT;
      throw new MissingColumn(name as string, rowLabel);
    }
    if (type === 'number') {
      const number = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
      if (!Number.isFinite(number)) throw new SpecError(`${rowLabel}: column "${name}" should be a number, got "${String(value)}"`);
      return number;
    }
    if (type === 'json') {
      if (typeof value !== 'string') return value;
      try { return JSON.parse(value); }
      catch { throw new SpecError(`${rowLabel}: column "${name}" should be JSON, got "${value}"`); }
    }
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  return source.replace(PLACEHOLDER, (_match, name: string, optional: string | undefined) => {
    const value = row[name];
    if (isBlank(value)) {
      if (optional) return '';
      throw new MissingColumn(name, rowLabel);
    }
    return typeof value === 'string' ? value : JSON.stringify(value);
  });
}

export function fillTemplate(spec: unknown, row: Row, rowLabel: string): unknown {
  const fill = (node: unknown): unknown => {
    if (typeof node === 'string') return fillString(node, row, rowLabel);
    if (Array.isArray(node)) return node.map(fill).filter(item => item !== OMIT);
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node)) {
        const filled = fill(value);
        if (filled !== OMIT) out[key] = filled;
      }
      return out;
    }
    return node;
  };
  const result = fill(spec);
  return result === OMIT ? undefined : result;
}

// Every column the series references, so a data file can be checked before rendering.
export function placeholders(spec: unknown): string[] {
  const found = new Set<string>();
  const walk = (node: unknown): void => {
    if (typeof node === 'string') for (const match of node.matchAll(PLACEHOLDER)) found.add(match[1] as string);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') Object.values(node).forEach(walk);
  };
  walk(spec);
  return [...found];
}

// RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes, CRLF or LF.
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = '', record: string[] = [], quoted = false;
  const source = text.replace(/^﻿/, '');
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { record.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      record.push(field); rows.push(record); field = ''; record = [];
    } else field += char;
  }
  if (field !== '' || record.length) { record.push(field); rows.push(record); }
  const [header, ...body] = rows.filter(row => row.some(cell => cell.trim() !== ''));
  if (!header) return [];
  return body.map(cells => Object.fromEntries(header.map((name, index) => [name.trim(), (cells[index] ?? '').trim()])));
}

export async function loadRows(file: string): Promise<Row[]> {
  const text = await readFile(file, 'utf8');
  if (path.extname(file).toLowerCase() === '.json') {
    const data: unknown = JSON.parse(text);
    if (!Array.isArray(data)) throw new SpecError(`${file} should contain a JSON array of rows`);
    return data as Row[];
  }
  return parseCsv(text);
}

// Picks a file-safe name for a row: its id/slug/name column, else its position.
export function rowName(row: Row, index: number, pattern?: string): string {
  const raw = pattern
    ? pattern.replace(PLACEHOLDER, (_m, name: string) => String(row[name] ?? ''))
    : String(row['id'] ?? row['slug'] ?? row['name'] ?? '');
  const safe = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return safe || `row-${String(index + 1).padStart(2, '0')}`;
}
