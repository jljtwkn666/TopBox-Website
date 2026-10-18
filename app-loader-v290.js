/* Immutable v2.9.0 entry point.  This filename is intentionally new so an
   earlier cached loader can never run the retired cargo selector. */
try {
  document.documentElement.dataset.appLoaderState = 'loading-payload';
  const response = await fetch('app-payload-v290.js', { cache: 'no-store' });
  const payloadModule = await response.text();
  const chunks = [...payloadModule.matchAll(/'([A-Za-z0-9+/=]+)'/g)].map(item => item[1]);
  const encoded = chunks.join('');
  if (!response.ok || !encoded) throw new Error('应用载荷不可用');
  document.documentElement.dataset.appLoaderState = 'starting-app';
  const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const source = await new Response(stream).text();
  const appModule = await import(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
  if (!window.TopBoxApp && appModule?.topboxApp) window.TopBoxApp = appModule.topboxApp;
  document.documentElement.dataset.appLoaderState = 'ready';
  window.dispatchEvent(new Event('topbox-app-ready'));
} catch (error) {
  document.documentElement.dataset.appLoaderState = 'failed';
  document.documentElement.dataset.appLoaderError = String(error?.message || error);
  console.error(error);
}

