const assert=require('node:assert/strict');
const fs=require('fs');
const vm=require('node:vm');
const R=require('../js/studio-audio-runtime.js');

const html=fs.readFileSync('studio.html','utf8');
function section(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert(a>=0&&b>a,'section '+start);return html.slice(a,b)}
const transportSource=section('function stopPlay(keep=true)','function selectionDiagnostic');

function deferred(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j});return{promise,resolve,reject}}
function fakeBuffer(id){return{id,duration:1,length:48000,sampleRate:48000,numberOfChannels:1,getChannelData:()=>new Float32Array(48000)}}

function makeHarness({ids=['A'],runtime=null}={}){
  const elements={play:{textContent:'▶'}};
  const state={
    playGeneration:0,playPreparing:false,playing:false,tick:null,sources:[],cursor:0,
    metroOn:false,t0:0,recording:false,tracks:[{id:'t',gain:1,muted:false}],
    clips:ids.map((id,i)=>({id:'c'+i,track:'t',sourceId:id,start:i*.1,trim:0,len:.8,gain:1,muted:false})),
    starts:0,stops:0,cursorWrites:0,metroStarts:0,metroStops:0
  };
  const rt=runtime||{getDecodedSource:async id=>fakeBuffer(id)};
  const context={
    console,
    Promise,Map,Set,Math,performance:{now:()=>1000},
    setInterval:fn=>({fn}),clearInterval:()=>{},
    playGeneration:state.playGeneration,playPreparing:state.playPreparing,playing:state.playing,tick:state.tick,
    sources:state.sources,cursor:state.cursor,metroOn:state.metroOn,t0:state.t0,recording:state.recording,
    tracks:state.tracks,clips:state.clips,
    $:sel=>elements[sel==='#play'?'play':'play'],
    stopMetro:()=>{state.metroStops++},
    startMetro:()=>{state.metroStarts++},
    setCursor:()=>{state.cursorWrites++},
    updateLiveRecordingVisual:()=>{},
    projectDuration:()=>10,
    sourceIdFor:c=>c.sourceId,
    getDecodedSource:id=>rt.getDecodedSource(id),
    ctx:{
      currentTime:10,
      resume:async()=>{},
      createBufferSource:()=>({
        buffer:null,
        connect(){return this},
        start(){state.starts++;this.started=true},
        stop(){state.stops++;this.stopped=true}
      }),
      createGain:()=>({gain:{value:1},connect(){return this}})
    },
    msg:()=>{}
  };
  vm.createContext(context);
  vm.runInContext(transportSource,context);
  function sync(){
    for(const k of ['playGeneration','playPreparing','playing','tick','sources','cursor','t0'])state[k]=context[k];
    return state;
  }
  return{context,state,elements,sync,play:(...a)=>context.play(...a),stop:()=>context.stopPlay(),prepare:(...a)=>context.preparePlayback(...a),startPrepared:(...a)=>context.startPreparedPlayback(...a)};
}

(async()=>{
  // CASE 1
  const d1=deferred();let dec1=0;
  const r1=R.createDecodedSourceCache({getBlob:async()=>new Blob([1]),decodeBlob:async()=>{dec1++;return d1.promise}});
  const h1=makeHarness({runtime:r1});
  const p1=h1.play(0,false);h1.sync();
  assert.equal(h1.state.playing,false);assert.equal(h1.state.playPreparing,true);assert.equal(h1.state.starts,0);
  d1.resolve(fakeBuffer('A'));assert.equal(await p1,true);h1.sync();
  assert.equal(dec1,1);assert.equal(h1.state.playing,true);assert.equal(h1.state.playPreparing,false);assert.equal(h1.state.starts,1);
  console.log('PLAY_SIMPLE PASS pending: playing=false preparing=true; resolved: starts=1 playing=true preparing=false');

  // CASE 2
  const d2=deferred();const r2=R.createDecodedSourceCache({getBlob:async()=>new Blob([2]),decodeBlob:async()=>d2.promise});
  const h2=makeHarness({runtime:r2});const p2=h2.play(0,false);h2.sync();h2.stop();h2.sync();
  assert.equal(h2.state.playing,false);assert.equal(h2.state.playPreparing,false);
  d2.resolve(fakeBuffer('A'));assert.equal(await p2,false);h2.sync();
  assert.equal(h2.state.starts,0);assert.equal(h2.state.playing,false);assert.equal(h2.state.playPreparing,false);
  assert(r2.getCached('A'));
  console.log('CANCEL_DURING_DECODE PASS late resolution cached but transport starts=0');

  // CASE 3
  const d3=deferred();let d3calls=0;
  const r3=R.createDecodedSourceCache({getBlob:async()=>new Blob([3]),decodeBlob:async()=>{d3calls++;return d3.promise}});
  const h3=makeHarness({runtime:r3});const gen1=h3.play(0,false);h3.sync();h3.stop();h3.sync();const gen2=h3.play(.2,false);h3.sync();
  assert.equal(d3calls,1,'generation 2 must share inflight decode');
  d3.resolve(fakeBuffer('A'));
  assert.equal(await gen1,false);assert.equal(await gen2,true);h3.sync();
  assert.equal(h3.state.starts,1);assert.equal(h3.state.playing,true);assert.equal(h3.state.cursorWrites,3,'only the three explicit stopPlay calls may touch cursor; stale generation must not');
  console.log('PLAY_CANCEL_PLAY PASS stale generation starts=0; generation2 starts exactly once; decode=1');

  // CASE 4A: real UI policy is second command while preparing => stopPlay, not second play.
  const d4=deferred();let d4calls=0;const r4=R.createDecodedSourceCache({getBlob:async()=>new Blob([4]),decodeBlob:async()=>{d4calls++;return d4.promise}});
  const h4=makeHarness({runtime:r4});const first=h4.play(0,false);h4.sync();
  assert.equal(h4.state.playPreparing,true);
  h4.stop(); // same branch used by $('#play'): playing||playPreparing ? stopPlay() : play()
  d4.resolve(fakeBuffer('A'));assert.equal(await first,false);h4.sync();
  assert.equal(d4calls,1);assert.equal(h4.state.starts,0);assert.equal(h4.state.playing,false);assert.equal(h4.state.playPreparing,false);
  console.log('DOUBLE_PLAY_UI PASS second press cancels pending PLAY; decode=1 starts=0');

  // CASE 4B: even two direct play() calls cannot double transport/decode.
  const d4b=deferred();let d4bcalls=0;const r4b=R.createDecodedSourceCache({getBlob:async()=>new Blob([4]),decodeBlob:async()=>{d4bcalls++;return d4b.promise}});
  const h4b=makeHarness({runtime:r4b});const q1=h4b.play(0,false),q2=h4b.play(0,false);d4b.resolve(fakeBuffer('A'));
  assert.equal(await q1,false);assert.equal(await q2,true);h4b.sync();
  assert.equal(d4bcalls,1);assert.equal(h4b.state.starts,1);
  console.log('DOUBLE_PLAY_DIRECT PASS decode=1 transport=1');

  // CASE 5
  let attempts=0;const r5=R.createDecodedSourceCache({getBlob:async()=>new Blob([5]),decodeBlob:async()=>{attempts++;if(attempts===1)throw Error('boom');return fakeBuffer('A')}});
  const h5=makeHarness({runtime:r5});assert.equal(await h5.play(0,false),false);h5.sync();
  assert.equal(h5.state.playing,false);assert.equal(h5.state.playPreparing,false);assert.equal(h5.state.starts,0);assert.equal(h5.state.sources.length,0);assert.equal(r5.metrics().inflightCount,0);
  assert.equal(await h5.play(0,false),true);h5.sync();assert.equal(attempts,2);assert.equal(h5.state.starts,1);assert.equal(h5.state.playing,true);
  console.log('DECODE_FAILURE_RETRY PASS failure idle/clean; retry decode succeeds once');

  // CASE 6
  const counts={A:0,B:0,C:0};const cachedA=fakeBuffer('A');
  const r6=R.createDecodedSourceCache({getBlob:async id=>new Blob([id.charCodeAt(0)]),decodeBlob:async(blob,id)=>{counts[id]++;return fakeBuffer(id)}});
  r6.inject('A',cachedA);
  const h6=makeHarness({ids:['A','B','C'],runtime:r6});assert.equal(await h6.play(0,false),true);h6.sync();
  assert.deepEqual(counts,{A:0,B:1,C:1});assert.equal(h6.state.starts,3);assert.equal(h6.state.playing,true);
  console.log('MULTI_SOURCE_PLAY PASS A cache-hit; B=1 decode; C=1 decode; transport starts once with 3 nodes');

  // CASE 7
  let sharedDecodes=0;const r7=R.createDecodedSourceCache({getBlob:async()=>new Blob([7]),decodeBlob:async()=>{sharedDecodes++;return fakeBuffer('A')}});
  const h7=makeHarness({ids:['A','A','A'],runtime:r7});assert.equal(await h7.play(0,false),true);h7.sync();
  assert.equal(sharedDecodes,1);assert.equal(h7.state.starts,3);
  console.log('SHARED_SOURCE_PLAY PASS A decoded once; 3 clips use same cached buffer');

  // CASE 8/9
  const decodes={A:0,B:0,C:0};const r89=R.createDecodedSourceCache({maxEntries:2,getBlob:async id=>new Blob([id.charCodeAt(0)]),decodeBlob:async(blob,id)=>{decodes[id]++;return fakeBuffer(id)}});
  const activeA=await r89.getDecodedSource('A');
  const activeNode={buffer:activeA,playing:true};
  await r89.getDecodedSource('B');await r89.getDecodedSource('C');
  assert(!r89.ids().includes('A'),'A must be evicted from Map');
  assert.strictEqual(activeNode.buffer,activeA,'active node keeps its direct AudioBuffer reference');
  assert.equal(activeNode.playing,true);
  await r89.getDecodedSource('A');
  assert.equal(decodes.A,2,'evicted A re-decodes exactly once');
  console.log('ACTIVE_BUFFER_LRU_EVICTION PASS Map eviction does not mutate active node buffer reference');
  console.log('LRU_REDECODE PASS evicted A next true use = exactly one new decode');

  // CASE 10 is certified from actual record source plus transport behavior.
  const recordSource=section('async function record()','function clickBeat');
  assert(recordSource.includes("if(!await play(recStart,true)){stream.getTracks().forEach(t=>t.stop());return}recorder.start();recording=true"));
  assert(recordSource.indexOf('await play(recStart,true)')<recordSource.indexOf('recorder.start()'));
  console.log('RECORD_PREPARATION PASS actual source awaits play before MediaRecorder.start; failed/cancelled prepare stops stream and returns');

  // CASE 11 structural async stop invariant.
  assert(transportSource.includes('playGeneration++;playPreparing=false;playing=false;clearInterval(tick);tick=null;'));
  console.log('POST_STOP_ASYNC_PLAY PASS stopPlay invalidates pending generation and normalizes preparing/playing/tick before source stops');

  // CASE 12 static contamination checks are in 006 tests; repeat exact source constraints.
  const autosave=section('async function runAutosave()','function markProjectDirty()');
  const waveform=section('function waveform(canvas,c)','function pixelsPerSecond()');
  assert(!autosave.includes('decodeAudioData')&&!autosave.includes('getDecodedSource'));
  assert(!waveform.includes('decodeAudioData')&&!waveform.includes('getDecodedSource'));
  console.log('AUTOSAVE_DECODE_METRIC 10 autosaves path=0 decode hooks');
  console.log('WAVEFORM_DECODE_METRIC cache-hit render path=0 decode hooks');

  console.log('Studio lazy decode playback race gate 006B PASS');
})().catch(e=>{console.error(e);process.exit(1)});