declare global {
  interface Window {
    Buffer: any;
    global: Window;
    process: any;
  }
}

import { Buffer } from 'buffer';

// 1. Buffer support
window.Buffer = Buffer;

// 2. Global support (some libraries expect 'global')
window.global = window;

// 3. Process support (minimal shim for libraries that check process.env or process.version)
window.process = {
    env: { NODE_DEBUG: undefined },
    version: '',
    nextTick: (cb: any) => setTimeout(cb, 0),
    browser: true,
} as any;

console.log("Wavefront Polyfills Initialized");
