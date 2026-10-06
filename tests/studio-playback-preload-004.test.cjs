const assert=require('node:assert/strict');
const fs=require('fs');
const P=require('../js/studio-playback-preload.js');
const R=require('../js/studio-audio-runtime.js');

function clips(spec){return spec.map((x,i)=>({id:'c'+i,track:x.track||'t',sourceId:x.id,start:x.start,len:x.len??1,muted:!!x.muted}))}
const tracks=[{id:'t',muted:false},{id:'muted',muted:true}];

// Active sources first; future sources by earliest timeline use; duplicates collapse.
assert.deepEqual(P.buildPreloadPlan({clips:clips([
  {id:'future2',start:9},{id:'activeB',start:4,len:5},{id:'future1',start:7},
  {id:'activeA',start:0,len:8},{id:'future1',start:12},{id:'ignoredClip',start:5,len:2,muted:true},
  {id:'ignoredTrack',start:5,len:2,track:'muted'}
]),tracks,cursor:5}),['activeB','activeA','future1','future2']);

// Production cache bound: never naïvely preload all sources when project has >8.
const many=clips(Array.from({length:20},(_,i)=>({id:'S'+i,start:i})));
const plan=P.buildPreloadPlan({clips:many,tracks,cursor:0,limit:8});
assert.equal(plan.length,8);
assert.deepEqual(plan,['S0','S1','S2','S3','S4','S5','S6','S7']);
assert.equal(P.DEFAULT_LIMIT,8);

(async()=>{
// Sequential preload stops before launching another source once its generation is invalidated.
let generation=1,started=[],releaseFirst;
const firstDone=new Promise(r=>releaseFirst=r);
const sequential=P.runSequentialPreload(['A','B','C'],async id=>{started.push(id);if(id==='A')await firstDone},()=>generation===1);
await Promise.resolve();
assert.deepEqual(started,['A']);
generation=2;
releaseFirst();
await sequential;
assert.deepEqual(started,['A']);

// Existing inflight dedup: preload and PLAY-style request share one decode.
let resolveDecode,decodeCalls=0;
const pending=new Promise(r=>resolveDecode=r);
const runtime=R.createDecodedSourceCache({maxEntries:8,getBlob:async()=>new Blob([1]),decodeBlob:async()=>{decodeCalls++;return pending}});
const preload=runtime.getDecodedSource('A');
const play=runtime.getDecodedSource('A');
await Promise.resolve();
assert.equal(decodeCalls,1);
assert.equal(runtime.metrics().inflightHits,1);
const buffer={duration:1,getChannelData:()=>new Float32Array(1)};
resolveDecode(buffer);
assert.strictEqual(await preload,buffer);
assert.strictEqual(await play,buffer);

// clear()/epoch: a late old-project decode cannot repopulate the new cache.
let resolveOld;
const oldPending=new Promise(r=>resolveOld=r);
const epochRuntime=R.createDecodedSourceCache({maxEntries:8,getBlob:async()=>new Blob([2]),decodeBlob:async()=>oldPending});
const old=epochRuntime.getDecodedSource('OLD');
await Promise.resolve();
epochRuntime.clear();
resolveOld(buffer);
await old;
assert.equal(epochRuntime.getCached('OLD'),null);
assert.equal(epochRuntime.metrics().decodedSourceCount,0);

// Structural integration invariants.
const html=fs.readFileSync('studio.html','utf8');
assert(html.includes('js/studio-playback-preload.js'));
assert(html.includes('const PRELOAD_LIMIT=StudioPlaybackPreload.DEFAULT_LIMIT'));
assert(html.includes('function invalidateAudioPreload(){audioPreloadGeneration++}'));
assert(html.includes('async function runAudioPreload(token,ids)'));\nassert(html.includes('StudioPlaybackPreload.runSequentialPreload(ids,getDecodedSource,()=>token===audioPreloadGeneration)'));
assert(html.includes('if(token!==audioPreloadGeneration)return'));
assert(html.includes('function startAudioPreload(){'));
assert(html.includes('StudioPlaybackPreload.buildPreloadPlan'));
assert(html.includes('showEditorScreen();startAudioPreload();msg(\'Projet ouvert ✓\')'));

const openStart=html.indexOf('async function openLocalProject('),openEnd=html.indexOf('async function returnToProjectLibrary()',openStart);
const open=html.slice(openStart,openEnd);
assert(open.includes('invalidateAudioPreload()'));\nassert(!open.includes('await startAudioPreload'));
assert(open.indexOf('showEditorScreen()')<open.indexOf('startAudioPreload()'));

const resetStart=html.indexOf('function resetEditorRuntime()'),resetEnd=html.indexOf('async function applyLocalProject(',resetStart);
assert(html.slice(resetStart,resetEnd).includes('invalidateAudioPreload()'));
const applyStart=html.indexOf('async function applyLocalProject('),applyEnd=html.indexOf('function showEditorScreen()',applyStart);
assert(html.slice(applyStart,applyEnd).includes('invalidateAudioPreload()'));
const returnStart=html.indexOf('async function returnToProjectLibrary()'),returnEnd=html.indexOf('async function initializeProjectLibraryEntry()',returnStart);
assert(html.slice(returnStart,returnEnd).includes('invalidateAudioPreload()'));

// Safety barrier and Web Audio scheduling remain unchanged.
assert(html.includes("async function preparePlayback(from){let ids=new Set();clips.forEach(c=>{let t=tracks.find(x=>x.id===c.track),off=Math.max(0,from-c.start),remain=c.len-off;if(!c.muted&&!t?.muted&&remain>0)ids.add(sourceIdFor(c))});let entries=await Promise.all([...ids].map(async id=>[id,await getDecodedSource(id)]));return new Map(entries)}"));
assert(html.includes("s.start(now+Math.max(0,c.start-from),c.trim+off,remain)"));

console.log('Studio background playback preload 004 PASS');

})().catch(e=>{console.error(e);process.exit(1)});
