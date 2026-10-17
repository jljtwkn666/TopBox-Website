import { compressedApp } from './app-payload.js';

const bytes = Uint8Array.from(atob(compressedApp), char => char.charCodeAt(0));
const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
const source = await new Response(stream).text();
await import(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
window.dispatchEvent(new Event('topbox-app-ready'));

