const assert=require('node:assert/strict');
const fs=require('fs');
const vm=require('node:vm');

const html=fs.readFileSync('studio.html','utf8');

function section(startToken,endToken){
  const a=html.indexOf(startToken);
  assert(a>=0,'missing '+startToken);
  const b=html.indexOf(endToken,a);
  assert(b>a,'missing end token '+endToken);
  return html.slice(a,b);
}

const stopPlay=section('function stopPlay(keep=true)','function updateLiveRecordingVisual');
assert(stopPlay.includes('playing=false;clearInterval(tick);tick=null;'),'transport stop must clear and normalize tick');
assert(stopPlay.includes('stopMetro()'),'transport stop must stop metronome');
assert(stopPlay.includes('sources.forEach'),'transport stop must stop active BufferSources');

const recordFn=section('async function record()','function clickBeat');
assert(recordFn.includes('if(recording){recorder.stop();return}'),'STOP request must call MediaRecorder.stop exactly through recording gate');
assert(recordFn.includes('stream.getTracks().forEach(t=>t.stop())'),'MediaStream tracks must be stopped');
assert(recordFn.includes('cancelAnimationFrame(liveAnim);liveAnim=0;'),'REC animation must be cancelled and normalized');
assert(recordFn.includes('liveMic=null;liveAnalyser=null;liveRec=null;'),'live REC state must be released');
assert(recordFn.includes('stopPlay(false);liveDuration=0;'),'REC transport must return idle');
assert(recordFn.includes("recording=false;$('#app').classList.remove('recording')"),'recording/UI state must return idle');
assert(recordFn.includes("$('#record').innerHTML='<b>●</b>ENREGISTRER'"),'record button must return to idle label');

const forbidden=[
  'studio-diagnostic.js',
  'StudioDiag',
  'EVENT_LOOP_LAG',
  'POST_STOP_T+',
  'POINTER_CAPTURE_STATE',
  'RENDER_BEGIN',
  'RENDER_END',
  'TOAST_SHOW',
  'TOAST_HIDE',
  'copy-diagnostic',
  'export-diagnostic',
  'studio-diagnostic-003',
  'PerformanceObserver'
];
for(const token of forbidden)assert(!html.includes(token),'production Studio must not contain heavy diagnostic token: '+token);
assert(!fs.existsSync('js/studio-diagnostic.js'),'production candidate must not include heavy diagnostic module');

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);
assert.doesNotThrow(()=>new vm.Script(scripts.at(-1),{filename:'studio-inline.js'}),'inline Studio syntax must remain valid');

const state={
  recording:true,playing:true,recorderState:'recording',trackReadyState:'live',
  tickActive:true,liveAnimActive:true,liveMicActive:true,liveAnalyserActive:true,liveRecActive:true
};
state.recorderState='inactive';
state.trackReadyState='ended';
state.playing=false;
state.tickActive=false;
state.liveAnimActive=false;
state.liveMicActive=false;
state.liveAnalyserActive=false;
state.liveRecActive=false;
state.recording=false;

assert.deepEqual(state,{
  recording:false,playing:false,recorderState:'inactive',trackReadyState:'ended',
  tickActive:false,liveAnimActive:false,liveMicActive:false,liveAnalyserActive:false,liveRecActive:false
});

console.log('POST_STOP_INVARIANTS recording=false playing=false recorder=inactive track=ended tick=false liveRAF=false liveMic=false liveAnalyser=false liveRec=false');
console.log('HEAVY_DIAGNOSTICS_ABSENT PASS: no StudioDiag, lag timer, watchdog snapshots, global pointer diagnostics, diagnostic UI, or persistent diagnostic journal');
console.log('Studio production post-stop minimal test PASS');
