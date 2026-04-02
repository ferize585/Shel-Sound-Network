import { Buffer } from 'buffer';
// @ts-ignore
import process from 'process';

/**
 * Polyfills for the browser environment.
 * These are required by the Shelby SDK and its internal dependencies (like reed-solomon).
 * By importing this file as the very first line of main.tsx, we ensure Node.js globals 
 * like 'Buffer' and 'global' are available before any other code is evaluated.
 */

if (typeof window !== 'undefined') {
  (window as any).Buffer = Buffer;
  (window as any).global = window;
  (window as any).process = process;
}

export {};
