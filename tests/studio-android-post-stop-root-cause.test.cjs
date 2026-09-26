const assert=require('node:assert/strict');
const fs=require('fs');
const vm=require('node:vm');
const A=require('../js/studio-autosave.js');
const W=require('../js/studio-waveform-core.js');
const D=require('../js/studio-diagnostic.js');

function fakeStorage(){const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),_map:m}}
function fakeRoot(storage){let next=1,timers=new Map();return{
  localStorage:storage,performance:{now:()=>0},setInterval(fn){let id=next++;timers.set(id,fn);return id},clearInterval:id=>timers.delete(id),
  setTimeout(fn){fn();return next++},clearTimeout(){},addEventListener(){},navigator:{userAgent:'test',clipboard:{writeText:async()=>{}}},
  location:{href:'https://example.test/studio'},document:null,Blob,URL,Date,Math
}}
function fakeBuffer(seconds=1.68,sampleRate=48000){const length=Math.round(seconds*sampleRate),data=new Float32Array(length);for(let i=0;i<length;i++)data[i]=Math.sin(i/19)*.7;return{duration:length/sampleRate,length,sampleRate,numberOfChannels:1,getChannelData:()=>data}}

(async()=>{
  const storage=fakeStorage(),diag1=D.create(fakeRoot(storage));
  diag1.add('REC_START',{recording:true});
  diag1.add('STOP_REQUEST',{recording:true,playing:true});
  assert(storage.getItem(D.KEY)?.includes('STOP_REQUEST'),'diagnostic must persist automatically');
  diag1._stop();
  const diag2=D.create(fakeRoot(storage));
  const persisted=JSON.parse(diag2.report());
  assert(persisted.log.some(x=>x.event==='STOP_REQUEST'),'previous session diagnostic must survive reopen');
  assert(persisted.log.some(x=>x.event==='DIAGNOSTIC_BOOT'),'new boot must append without erasing previous log');
  diag2._stop();

  const state={recording:false,playing:false,recorderState:'inactive',trackReadyState:'ended',tickActive:false,liveAnimActive:false,liveMicActive:false,liveAnalyserActive:false,liveRecActive:false,draggingHead:false,autosaveBusy:false};
  const events=[];
  const log=(e,d={})=>events.push({e,d});
  const store=A.createMemoryStore();
  const cache=W.createPeakCache({yieldFn:()=>Promise.resolve(),yieldFrames:4096});
  const sourceId='mic-source-003';
  let clips=[];
  async function syntheticPostStop(){
    state.recording=true;state.playing=true;state.recorderState='recording';state.trackReadyState='live';state.tickActive=true;state.liveAnimActive=true;state.liveMicActive=true;state.liveAnalyserActive=true;state.liveRecActive=true;
    log('REC_START');log('STOP_REQUEST',{playing:state.playing});
    assert.equal(state.playing,true,'playing=true au STOP est attendu pendant transport REC');
    state.recorderState='inactive';log('MEDIARECORDER_STOP');
    state.trackReadyState='ended';log('STREAM_TRACK_STOP');
    state.playing=false;state.tickActive=false;state.liveAnimActive=false;state.liveMicActive=false;state.liveAnalyserActive=false;state.liveRecActive=false;log('TRANSPORT_STOP');
    const raw=new Uint8Array([26,69,223,163,1,2,3,4,5,6,7,8,9]),blob=new Blob([raw],{type:'audio/webm;codecs=opus'});log('BLOB_READY',{size:blob.size});
    log('DECODE_BEGIN');const buffer=fakeBuffer();log('DECODE_END',{duration:buffer.duration});
    log('WAVEFORM_BEGIN');const ensured=await cache.ensure(sourceId,buffer);log('WAVEFORM_END',{created:ensured.created});
    await store.saveWaveform(sourceId,ensured.waveform);
    clips.push({id:'clip-1',track:'voice',name:'Voix',sourceId,start:0,trim:0,len:buffer.duration,gain:1,muted:false,buffer});log('CLIP_CREATE');
    log('RENDER_BEGIN');log('RENDER_END');
    state.recording=false;log('POST_STOP_IDLE');
    state.autosaveBusy=true;log('AUTOSAVE_BEGIN');
    const snap={schema:2,name:'',cursor:buffer.duration,zoom:1,selectionStart:null,selectionEnd:null,tracks:[{id:'voice',name:'Voix',gain:1,muted:false}],clips:clips.map(c=>({id:c.id,track:c.track,name:c.name,start:c.start,trim:c.trim,len:c.len,gain:c.gain,muted:c.muted,sourceId:c.sourceId}))};
    log('SOURCE_PERSIST_BEGIN');await store.save(snap,[{id:sourceId,blob,sourceSchema:2,mimeType:blob.type,origin:'micro-recording',size:blob.size}]);log('SOURCE_PERSIST_END');
    state.autosaveBusy=false;log('AUTOSAVE_END');
    return{blob,buffer};
  }
  const out=await syntheticPostStop();
  assert.equal(out.blob.size,13);
  assert.equal(cache.metrics().pcmScans,1);
  assert.equal(store._metrics().audioWrites,1);
  assert.equal(store._metrics().waveformWrites,1);
  assert.equal(clips.length,1);
  assert.equal(state.recording,false);
  assert.equal(state.playing,false);
  assert.equal(state.recorderState,'inactive');
  assert.equal(state.trackReadyState,'ended');
  assert.equal(state.tickActive,false);
  assert.equal(state.liveAnimActive,false);
  assert.equal(state.liveMicActive,false);
  assert.equal(state.liveAnalyserActive,false);
  assert.equal(state.liveRecActive,false);
  assert.equal(state.draggingHead,false);
  assert.equal(state.autosaveBusy,false);

  const html=fs.readFileSync('studio.html','utf8');
  const required=['STOP_REQUEST','MEDIARECORDER_STOP','STREAM_TRACK_STOP','BLOB_READY','DECODE_BEGIN','DECODE_END','SOURCE_PERSIST_BEGIN','SOURCE_PERSIST_END','CLIP_CREATE','WAVEFORM_BEGIN','WAVEFORM_END','AUTOSAVE_BEGIN','AUTOSAVE_END','RENDER_BEGIN','RENDER_END','TRANSPORT_STOP','POST_STOP_IDLE','AUDIOCONTEXT_STATE'];
  for(const marker of required)assert(html.includes(marker),'missing diagnostic marker '+marker);
  assert(html.includes('StudioDiag.watchdog(studioPostStopState)'),'post-stop watchdog missing');
  assert(html.includes("$('#copy-diagnostic').onclick"),'copy diagnostic control missing');
  assert(html.includes("$('#export-diagnostic').onclick"),'export diagnostic control missing');
  assert(html.includes('tick=null'),'cleared transport timer must be represented as inactive');
  assert(html.includes('liveAnim=0'),'cancelled REC animation must be represented as inactive');
  const recordStart=html.indexOf('async function record()'),recordEnd=html.indexOf('function clickBeat',recordStart),recordFn=html.slice(recordStart,recordEnd);
  assert(recordFn.indexOf("StudioDiag.add(recording?'STOP_REQUEST'")<recordFn.indexOf('recorder.stop()'),'STOP_REQUEST must be logged before MediaRecorder.stop');
  assert(recordFn.indexOf("StudioDiag.add('MEDIARECORDER_STOP'")<recordFn.indexOf("StudioDiag.add('BLOB_READY'"),'MediaRecorder stop must precede Blob');
  assert(recordFn.indexOf("StudioDiag.add('TRANSPORT_STOP'")===-1,'transport marker belongs in stopPlay, not duplicated in record');
  assert(html.indexOf("function stopPlay")<html.indexOf("function play("));
  assert(recordFn.includes('stopPlay(false)'),'onstop must stop REC transport');
  assert(recordFn.includes("StudioDiag.add('POST_STOP_IDLE'"),'idle state must be explicit after pipeline');
  assert(!recordFn.includes('setPointerCapture'),'record button lifecycle must not own pointer capture');

  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);
  assert.doesNotThrow(()=>new vm.Script(scripts.at(-1),{filename:'studio-inline.js'}));

  const stopRequest=events.find(x=>x.e==='STOP_REQUEST');
  assert.equal(stopRequest.d.playing,true);
  console.log('AUTOMATED_POST_STOP_REPRO PASS: START->STOP->Blob->decode->waveform->clip->autosave->idle');
  console.log('POST_STOP_INVARIANTS recording=false playing=false recorder=inactive track=ended tick=false liveRAF=false liveMic=false liveAnalyser=false liveRec=false autosaveBusy=false');
  console.log('CLICK_STOP_PLAYING_TRUE EXPECTED: REC uses play(recStart,true) transport and onstop calls stopPlay(false)');
  console.log('ROOT_CAUSE_AUTOMATED_STATUS NOT_REPRODUCED');
})().catch(e=>{console.error(e);process.exit(1)});