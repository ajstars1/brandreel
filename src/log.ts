// CLI output. Kept in one place so library code never writes to the console directly.
export const info = (message: string): void => { process.stdout.write(`${message}\n`); };
export const warn = (message: string): void => { process.stderr.write(`${message}\n`); };
export const progress = (message: string): void => { if (process.stdout.isTTY) process.stdout.write(`\r${message}\x1b[K`); };
