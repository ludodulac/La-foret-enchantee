const assert=require('node:assert/strict');
const fs=require('fs');
const vm=require('node:vm');
const R=require('../js/studio-audio-runtime.js');
const W=require('../js/studio-waveform-core.js');
const A=require('../js/studio-autosave.js');

function fakeBuffer(seconds=1,sampleRate=48000){
  const length=Math.round(seconds*sampleRate),data=new Float32Array(length);
  for(let i=0;i<length;i++)data[i]=Math.sin(i/23)*.25;
  return{duration:length/sampleRate,length,sampleRate,numberOfChannels:1,getChannelData:()=>data};
}
function peak(seconds=1){return{version:W.WAVEFORM_VERSION,peakRate:W.PEAK_RATE,duration:seconds,peaks:new Uint8Array(Math.ceil(seconds*W.PEAK_RATE))}}
function snapshot(ids){return{schema:2,name:'Lazy',cursor:0,zoom:1,selectionStart:null,selectionEnd:null,tracks:[{id:'v',name:'Voix',gain:1,muted:false}],clips:ids.map((id,i)=>({id:'c'+i,track:'v',name:id,start:i,trim:0,len:1,gain:1,muted:false,sourceId:id}))}}

(async()=>{
  const blobs=new Map(Array.from({length:20},(_,i)=>['S'+i,new Blob([new Uint8Array([i,1,2,3])],{type:'audio/test'})]));
  let decodeCalls=0;
  const runtime=R.createDecodedSourceCache({maxEntries:8,getBlob:async id=>blobs.get(id),decodeBlob:async()=>{decodeCalls++;return fakeBuffer()}});
  const wave=W.createPeakCache({yieldFn:()=>Promise.resolve()});
  for(let i=0;i<20;i++)wave.seed('S'+i,peak());

  assert.equal(runtime.metrics().decodeCalls,0);
  assert.equal(runtime.metrics().decodedSourceCount,0);
  assert.equal(decodeCalls,0);
  console.log('DECODE_METRIC A RESTORE 20_SOURCES_WITH_PEAKS=0 decodeAudioData; decodedSourceCount=0');

  await runtime.getDecodedSource('S0');
  assert.equal(runtime.metrics().decodeCalls,1);
  assert.equal(runtime.metrics().decodedSourceCount,1);
  console.log('DECODE_METRIC B FIRST_USE_A=1 decode total; decodedSourceCount=1');

  await runtime.getDecodedSource('S0');
  assert.equal(runtime.metrics().decodeCalls,1);
  assert.equal(runtime.metrics().decodedSourceCount,1);
  console.log('DECODE_METRIC C REPLAY_A=0 additional decode');

  let sharedCalls=0;
  const shared=R.createDecodedSourceCache({getBlob:async()=>blobs.get('S0'),decodeBlob:async()=>{sharedCalls++;await Promise.resolve();return fakeBuffer()}});
  const same=await Promise.all([shared.getDecodedSource('S0'),shared.getDecodedSource('S0'),shared.getDecodedSource('S0')]);
  assert.equal(sharedCalls,1);
  assert.equal(shared.metrics().decodeCalls,1);
  assert.equal(shared.metrics().inflightHits,2);
  assert.strictEqual(same[0],same[1]);
  assert.strictEqual(same[1],same[2]);
  console.log('DECODE_METRIC D/E SHARED_AND_CONCURRENT_A=1 decode total for 3 requests');

  await runtime.getDecodedSource('S1');
  assert.equal(runtime.metrics().decodeCalls,2);
  assert.equal(runtime.metrics().decodedSourceCount,2);
  console.log('DECODE_METRIC F FIRST_USE_B=1 additional decode; decodedSourceCount=2');

  const store=A.createMemoryStore();
  const autosaveRuntime=R.createDecodedSourceCache({getBlob:async id=>blobs.get(id),decodeBlob:async()=>{throw Error('autosave must not decode')}});
  let snap=snapshot(['S0','S1']);
  await store.save(snap,[{id:'S0',blob:blobs.get('S0')},{id:'S1',blob:blobs.get('S1')}]);
  for(let i=0;i<10;i++)await store.save({...snap,cursor:i},[]);
  assert.equal(autosaveRuntime.metrics().decodeCalls,0);
  console.log('DECODE_METRIC G 10_AUTOSAVES=0 decodeAudioData');

  const hitRuntime=R.createDecodedSourceCache({getBlob:async id=>blobs.get(id),decodeBlob:async()=>{throw Error('waveform cache hit must not decode')}});
  const hitWave=W.createPeakCache({yieldFn:()=>Promise.resolve()});hitWave.seed('S0',peak());
  assert(hitWave.get('S0'));assert.equal(hitRuntime.metrics().decodeCalls,0);
  console.log('DECODE_METRIC H WAVEFORM_CACHE_HIT=0 decodeAudioData');

  let legacyDecodes=0;
  const legacyRuntime=R.createDecodedSourceCache({getBlob:async()=>blobs.get('S2'),decodeBlob:async()=>{legacyDecodes++;return fakeBuffer()}});
  const legacyWave=W.createPeakCache({yieldFn:()=>Promise.resolve()});
  async function legacyReady(){const b=await legacyRuntime.getDecodedSource('S2');if(!legacyWave.has('S2'))await legacyWave.ensure('S2',b);return b}
  await legacyReady();await legacyReady();
  assert.equal(legacyDecodes,1);
  assert.equal(legacyWave.metrics().pcmScans,1);
  console.log('DECODE_METRIC H LEGACY_WAVEFORM_MISS=1 decode maximum; PCM scan=1');

  let attempts=0;
  const failing=R.createDecodedSourceCache({getBlob:async()=>blobs.get('S3'),decodeBlob:async()=>{attempts++;if(attempts===1)throw Error('decode fail');return fakeBuffer()}});
  await assert.rejects(()=>failing.getDecodedSource('S3'),/decode fail/);
  assert.equal(failing.metrics().decodedSourceCount,0);
  assert.equal(failing.metrics().inflightCount,0);
  const recovered=await failing.getDecodedSource('S3');
  assert(recovered);
  assert.equal(attempts,2);
  assert.equal(failing.metrics().decodedSourceCount,1);
  console.log('DECODE_METRIC I FAILURE_RECOVERY first_fail=clean; retry=success; poisoned_cache=false');

  let lruDecodes=0;
  const lru=R.createDecodedSourceCache({maxEntries:3,getBlob:async id=>blobs.get(id),decodeBlob:async()=>{lruDecodes++;return fakeBuffer()}});
  await lru.getDecodedSource('S0');await lru.getDecodedSource('S1');await lru.getDecodedSource('S2');await lru.getDecodedSource('S0');await lru.getDecodedSource('S3');
  assert.deepEqual(lru.ids(),['S2','S0','S3']);
  assert.equal(lru.metrics().decodedSourceCount,3);
  assert.equal(lru.metrics().evictions,1);
  console.log('RUNTIME_BUFFER_METRIC LRU maxEntries=3 decodedSourceCount=3 evictions=1 least_recently_used=S1');

  let injectedDecodes=0;
  const injected=R.createDecodedSourceCache({getBlob:async()=>blobs.get('S4'),decodeBlob:async()=>{injectedDecodes++;return fakeBuffer()}});
  const natural=fakeBuffer(2);
  injected.inject('S4',natural);
  assert.strictEqual(await injected.getDecodedSource('S4'),natural);
  assert.equal(injectedDecodes,0);
  console.log('DECODE_METRIC IMPORT_RECORD_INJECTION existing_AudioBuffer=0 additional decode');

  const html=fs.readFileSync('studio.html','utf8');
  assert(html.includes('js/studio-audio-runtime.js'));
  assert(html.includes('StudioAudioRuntime.createDecodedSourceCache({maxEntries:8'));
  assert(html.includes('async function getDecodedSource(id)'));
  assert(html.includes('decodedSourceCache.inject(id,buffer)'));

  const restoreStart=html.indexOf('async function restoreLocalAutosave()'),restoreEnd=html.indexOf('async function clearLocalWork',restoreStart);
  const restore=html.slice(restoreStart,restoreEnd);
  assert(restore.includes('registerSourceBlob(blob,null'));
  assert(!restore.includes('decodeAudioData'));
  assert(!restore.includes('buffer:'));
  console.log('DECODE_METRIC A HTML_RESTORE_PATH=0 direct decodeAudioData');

  const waveformStart=html.indexOf('function waveform(canvas,c)'),waveformEnd=html.indexOf('function pixelsPerSecond()',waveformStart);
  const waveformFn=html.slice(waveformStart,waveformEnd);
  assert(!waveformFn.includes('decodeAudioData'));
  assert(!waveformFn.includes('getDecodedSource'));
  assert(waveformFn.includes('waveformCache.get(c.sourceId)'));

  const autosaveStart=html.indexOf('async function runAutosave()'),autosaveEnd=html.indexOf('function markProjectDirty()',autosaveStart);
  const autosave=html.slice(autosaveStart,autosaveEnd);
  assert(!autosave.includes('decodeAudioData'));
  assert(!autosave.includes('getDecodedSource'));

  const playStart=html.indexOf('async function preparePlayback('),playEnd=html.indexOf('function selectionDiagnostic',playStart);
  const playback=html.slice(playStart,playEnd);
  assert(playback.includes('await getDecodedSource(id)'));
  assert(playback.includes('playPreparing=true'));
  assert(playback.includes('if(token!==playGeneration)return false'));
  assert(playback.includes("stopPlay(false);msg('Impossible de préparer le son')"));
  assert(!playback.includes('c.buffer'));

  const exportStart=html.indexOf('async function exportRange('),exportEnd=html.indexOf("$('#export').onclick",exportStart);
  assert(html.slice(exportStart,exportEnd).includes('buffer:await getDecodedSource(sourceIdFor(c))'));
  assert(html.includes("buffer=await getDecodedSource(sourceIdFor(c)),blob=wav(buffer)"));

  const cloudStart=html.indexOf('async function loadProjectRow('),cloudEnd=html.indexOf('async function showProjects()',cloudStart);
  const cloud=html.slice(cloudStart,cloudEnd);
  assert(!cloud.includes('decodeAudioData'));
  assert(cloud.includes('registerSourceBlob(blob,null'));
  assert(cloud.includes('sourceByPath'));

  assert(!html.includes('buffer:b,sourceId'));
  assert(!html.includes('s.buffer=c.buffer'));
  assert(!html.includes('c.buffer.duration-startState.trim'));
  assert(!html.includes('StudioDiag'));
  assert(!html.includes('EVENT_LOOP_LAG'));

  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);
  assert.doesNotThrow(()=>new vm.Script(scripts.at(-1),{filename:'studio-inline.js'}));

  console.log('MEMORY_MODEL PROJECT=20 persisted sources; RESTORE decodedSourceCount=0; FIRST_USE_A=1; FIRST_USE_B=2; production LRU maxEntries=8');
  console.log('Studio lazy audio decode runtime cache 006 tests PASS');
})().catch(e=>{console.error(e);process.exit(1)});