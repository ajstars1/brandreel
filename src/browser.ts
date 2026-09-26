import { access } from 'node:fs/promises';
import { chromium, type Browser } from 'playwright-core';

// Uses an installed Chrome/Chromium so nothing large is downloaded. Set BRANDREEL_CHROME to
// point at a specific binary, or run `npx playwright-core install chromium`.
const CANDIDATES: Record<string, string[]> = {
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'],
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
  win32: ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
};

const exists = async (file: string): Promise<boolean> => { try { await access(file); return true; } catch { return false; } };

export async function findChrome(): Promise<string> {
  const candidates = [process.env.BRANDREEL_CHROME, ...(CANDIDATES[process.platform] ?? []), chromium.executablePath()].filter((file): file is string => Boolean(file));
  for (const file of candidates) if (await exists(file)) return file;
  throw new Error('No Chrome or Chromium found. Install Chrome, set BRANDREEL_CHROME, or run `npx playwright-core install chromium`.');
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    executablePath: await findChrome(),
    args: ['--disable-dev-shm-usage', '--force-color-profile=srgb', '--font-render-hinting=none', '--hide-scrollbars']
  });
}
