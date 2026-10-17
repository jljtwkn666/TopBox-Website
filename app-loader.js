try {
  document.documentElement.dataset.appLoaderState = 'loading-payload';
  const response = await fetch(`app-payload.js?v=2.7.5`, { cache: 'no-store' });
  const payloadModule = await response.text();
  const match = payloadModule.match(/compressedApp\s*=\s*'([^']+)'/);
  if (!response.ok || !match) throw new Error('应用载荷不可用');
  document.documentElement.dataset.appLoaderState = 'starting-app';
  const bytes = Uint8Array.from(atob(match[1]), char => char.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const source = await new Response(stream).text();
  await import(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
  document.documentElement.dataset.appLoaderState = 'ready';
  window.dispatchEvent(new Event('topbox-app-ready'));
} catch (error) {
  document.documentElement.dataset.appLoaderState = 'failed';
  document.documentElement.dataset.appLoaderError = String(error?.message || error);
  console.error(error);
}

