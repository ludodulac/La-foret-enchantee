(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioAudioRuntime=api})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const DEFAULT_MAX_ENTRIES=8;
function validBuffer(buffer){return !!buffer&&typeof buffer.getChannelData==='function'&&Number.isFinite(buffer.duration)&&buffer.duration>=0}
function createDecodedSourceCache(opts={}){
  const getBlob=opts.getBlob,decodeBlob=opts.decodeBlob,maxEntries=Math.max(1,Math.floor(opts.maxEntries||DEFAULT_MAX_ENTRIES));
  if(typeof getBlob!=='function'||typeof decodeBlob!=='function')throw Error('Cache audio: getBlob/decodeBlob requis');
  const cache=new Map(),inflight=new Map();
  let decodeCalls=0,cacheHits=0,inflightHits=0,evictions=0,injections=0,epoch=0;
  function touch(id,buffer){cache.delete(id);cache.set(id,buffer);return buffer}
  function enforceLimit(){while(cache.size>maxEntries){const oldest=cache.keys().next().value;cache.delete(oldest);evictions++}}
  function insert(id,buffer,countInjection){if(!id||!validBuffer(buffer))throw Error('Cache audio: source/buffer invalide');if(countInjection)injections++;touch(id,buffer);enforceLimit();return buffer}
  function inject(id,buffer){return insert(id,buffer,true)}
  function getCached(id){if(!cache.has(id))return null;return touch(id,cache.get(id))}
  async function getDecodedSource(id){
    if(!id)throw Error('Cache audio: sourceId requis');
    if(cache.has(id)){cacheHits++;return touch(id,cache.get(id))}
    if(inflight.has(id)){inflightHits++;return inflight.get(id)}
    const requestEpoch=epoch;
    const p=(async()=>{
      decodeCalls++;
      const blob=await getBlob(id);
      if(!(blob instanceof Blob))throw Error('Source audio absente : '+id);
      const buffer=await decodeBlob(blob,id);
      if(!validBuffer(buffer))throw Error('Décodage audio invalide : '+id);
      if(requestEpoch===epoch)insert(id,buffer,false);
      return buffer
    })();
    inflight.set(id,p);
    try{return await p}finally{if(inflight.get(id)===p)inflight.delete(id)}
  }
  function clear(){epoch++;cache.clear();inflight.clear()}
  function remove(id){cache.delete(id);inflight.delete(id)}
  function metrics(){return{decodeCalls,decodedSourceCount:cache.size,inflightCount:inflight.size,cacheHits,inflightHits,evictions,injections,maxEntries}}
  function ids(){return[...cache.keys()]}
  return{getDecodedSource,getCached,inject,remove,clear,metrics,ids};
}
return{DEFAULT_MAX_ENTRIES,createDecodedSourceCache};
});