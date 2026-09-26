// Tiny text markup shared by every template: *words* are set in the accent style.
// A literal asterisk is written as \*.

export interface Segment {
  text: string;
  accent: boolean;
}

export const parseMarkup = (source: string): Segment[] => {
  const segments: Segment[] = [];
  let text = '', accent = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '\\' && source[i + 1] === '*') { text += '*'; i++; continue; }
    if (char === '*') {
      if (text) segments.push({ text, accent });
      text = ''; accent = !accent;
      continue;
    }
    text += char;
  }
  if (text) segments.push({ text, accent });
  return segments;
};

// A line written entirely in accent (e.g. "*They still said no.*") is styled as an accent line.
export const isAccentLine = (segments: Segment[]): boolean =>
  segments.length > 0 && segments.every(segment => segment.accent || !segment.text.trim());

export const plainText = (source: string): string => parseMarkup(source).map(segment => segment.text).join('');
