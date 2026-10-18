(async()=>{
  const release='v2.9.6';
  const payloadUrl=`./app-payload-v296.js?release=${release}`;
  try{
    const module=await import(payloadUrl);
    const packed=module.compressedApp.join('');
    const bytes=Uint8Array.from(atob(packed),char=>char.charCodeAt(0));
    const stream=new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')));
    const source=await stream.text();
    const script=document.createElement('script');
    script.text=source;
    document.head.appendChild(script);
    document.documentElement.dataset.appRelease=release;
  }catch(error){
    console.error('TOP BOX app load failed',error);
    document.documentElement.dataset.appRelease='failed';
  }
})();

