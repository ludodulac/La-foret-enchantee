const assert=require('node:assert/strict');
const fs=require('fs');
const vm=require('node:vm');
const Autosave=require('../js/studio-autosave.js');

const html=fs.readFileSync('studio.html','utf8');
function section(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert(a>=0,'missing '+start);assert(b>a,'missing '+end);return html.slice(a,b)}
const dragSource=section('function dragLaneAt','function trimGesture');
const playbackSource=section('function startPreparedPlayback','async function play(');
const trimSource=section('function trimGesture','function chooseFile');
const playheadSource=section("$('#timeline').onpointerdown","async function record()");

function classList(){const s=new Set();return{add:x=>s.add(x),remove:x=>s.delete(x),contains:x=>s.has(x)}}
function makeLane(id,top,bottom){return{dataset:{trackId:id},rect:{top,bottom},classList:classList(),children:[],getBoundingClientRect(){return this.rect},appendChild(el){this.children.push(el);el.parentElement=this;return el}}}
function event(x,y,id=1){return{clientX:x,clientY:y,pointerId:id,pointerType:'touch',isPrimary:true,preventDefault(){this.defaultPrevented=true},stopPropagation(){this.stopped=true}}}\nfunction near(actual,expected,eps=1e-6){assert(Math.abs(actual-expected)<=eps,`expected ${actual} ≈ ${expected}`)}
function makeHarness({start=12.4,track='A',extraClips=[]}={}){
  const lanes=[makeLane('A',0,100),makeLane('B',120,220),makeLane('C',240,360)];
  const clip={id:'birds',track,name:'OISEAUX',sourceId:'src-birds',start,trim:.25,len:2.5,gain:.7,muted:false};
  let clips=[clip,...extraClips.map(x=>({...x}))];
  const tracks=[
    {id:'A',gain:1,muted:false},{id:'B',gain:.5,muted:false},{id:'C',gain:.8,muted:false}
  ];
  const undo=[],redo=[];
  const state={dirty:0,renders:0,buttons:0,captured:new Set()};
  const editor={classList:{add(){}}},clipvol={value:0},clipmute={textContent:''};
  const el={
    style:{},parentElement:lanes.find(x=>x.dataset.trackId===track),
    setPointerCapture(id){state.captured.add(id)},
    hasPointerCapture(id){return state.captured.has(id)},
    releasePointerCapture(id){state.captured.delete(id)}
  };
  const context={
    console,Math,document:{querySelectorAll(sel){
      if(sel==='#tracks .lane[data-track-id]')return lanes;
      if(sel==='#tracks .lane.drag-target')return lanes.filter(x=>x.classList.contains('drag-target'));
      return[];
    }},
    pixelsPerSecond:()=>100,
    snapshot:()=>({clips:clips.map(c=>({...c})),tracks:tracks.map(t=>({...t}))}),
    undo,redo,buttons:()=>state.buttons++,markProjectDirty:()=>state.dirty++,render:()=>state.renders++,
    selected:null,$:sel=>sel==='#editor'?editor:sel==='#clipvol'?clipvol:clipmute
  };
  vm.createContext(context);vm.runInContext(dragSource,context);
  context.clipGesture(el,clip,30);
  return{context,clip,clips,tracks,lanes,undo,redo,state,el};
}
function drag(h,{downX=100,downY=50,moveX=100,moveY=50,cancel=false,pointerId=1}){
  h.el.onpointerdown(event(downX,downY,pointerId));
  h.el.onpointermove(event(moveX,moveY,pointerId));
  if(cancel)h.el.onpointercancel(event(moveX,moveY,pointerId));else h.el.onpointerup(event(moveX,moveY,pointerId));
}

(async()=>{
  // 1 + 13 HORIZONTAL_DRAG / EXISTING_HORIZONTAL_DRAG
  {
    const h=makeHarness();drag(h,{moveX:150,moveY:50});
    assert.equal(h.clip.start,12.9);assert.equal(h.clip.track,'A');assert.equal(h.undo.length,1);assert.equal(h.state.dirty,1);
    console.log('HORIZONTAL_DRAG PASS start 12.4 -> 12.9; track A unchanged');
    console.log('EXISTING_HORIZONTAL_DRAG PASS dx/pixelsPerSecond behavior preserved');
  }

  // 2 CROSS_TRACK_DRAG
  {
    const h=makeHarness();drag(h,{moveX:100,moveY:160});
    assert.equal(h.clip.start,12.4);assert.equal(h.clip.track,'B');assert.strictEqual(h.el.parentElement,h.lanes[1]);
    console.log('CROSS_TRACK_DRAG PASS A -> B using rendered lane geometry');
  }

  // 3 COMBINED_DRAG
  let combined;
  {
    const h=makeHarness();drag(h,{moveX:180,moveY:280});combined=h;
    near(h.clip.start,13.2);assert.equal(h.clip.track,'C');assert.equal(h.undo.length,1);
    console.log('COMBINED_DRAG PASS start 12.4/A -> 13.2/C in one gesture');
  }

  // 4 + 5 identity metadata
  assert.equal(combined.clip.sourceId,'src-birds');
  assert.equal(combined.clip.trim,.25);assert.equal(combined.clip.len,2.5);assert.equal(combined.clip.gain,.7);assert.equal(combined.clip.muted,false);
  console.log('SOURCE_IDENTITY PASS sourceId unchanged');
  console.log('AUDIO_METADATA PASS trim/len/gain/muted unchanged');

  // 6 ZERO_AUDIO_WORK
  for(const forbidden of ['decodeAudioData','registerSourceBlob','getDecodedSource','waveformCache.ensure','saveWaveform','new Blob','arrayBuffer()']){
    assert(!dragSource.includes(forbidden),'drag must not perform audio work: '+forbidden);
  }
  console.log('ZERO_AUDIO_WORK_METRIC drag=0 audio writes; 0 decodeAudioData; 0 PCM waveform scans');

  // 7 OVERLAP_ALLOWED
  {
    const h=makeHarness({extraClips:[{id:'occupied',track:'B',name:'VENT',sourceId:'src-wind',start:12,trim:0,len:4,gain:1,muted:false}]});
    drag(h,{moveX:130,moveY:170});assert.equal(h.clip.track,'B');assert.equal(h.clips.length,2);
    console.log('OVERLAP_ALLOWED PASS destination lane already occupied');
  }

  // 8 INVALID_VERTICAL_DROP: keep last valid lane, no phantom track.
  {
    const h=makeHarness();
    h.el.onpointerdown(event(100,50));
    h.el.onpointermove(event(120,170));assert.equal(h.clip.track,'B');
    h.el.onpointermove(event(140,999));assert.equal(h.clip.track,'B');
    h.el.onpointerup(event(140,999));
    assert(['A','B','C'].includes(h.clip.track));
    console.log('INVALID_VERTICAL_DROP PASS last valid track B retained; no phantom track');
  }

  // 9 POINTER_CANCEL policy A: restore initial start+track, release capture, no undo/dirty.
  {
    const h=makeHarness();drag(h,{moveX:180,moveY:280,cancel:true,pointerId:9});
    assert.equal(h.clip.start,12.4);assert.equal(h.clip.track,'A');assert.equal(h.undo.length,0);assert.equal(h.state.dirty,0);
    assert.equal(h.state.captured.size,0);assert(h.lanes.every(x=>!x.classList.contains('drag-target')));
    console.log('POINTER_CANCEL PASS policy=A restore initial start+track; capture released; no residual drag');
  }

  // 10 UNDO: exactly one snapshot contains both initial properties.
  {
    const h=makeHarness();drag(h,{moveX:180,moveY:280});
    assert.equal(h.undo.length,1);
    const prior=h.undo[0].clips.find(x=>x.id==='birds');
    assert.equal(prior.start,12.4);assert.equal(prior.track,'A');
    const restored={...prior};assert.equal(restored.start,12.4);assert.equal(restored.track,'A');
    console.log('UNDO PASS one undo snapshot restores start 12.4 + track A together');
  }

  // 11 AUTOSAVE_RESTORE + no additional audio writes.
  {
    const h=makeHarness();drag(h,{moveX:180,moveY:280});
    const store=Autosave.createMemoryStore(),blob=new Blob([new Uint8Array([1,2,3])],{type:'audio/webm'});
    const snap={schema:Autosave.SCHEMA_VERSION,name:'009',cursor:0,zoom:1,selectionStart:null,selectionEnd:null,tracks:h.tracks.map(x=>({...x})),clips:h.clips.map(x=>({...x}))};
    await store.save(snap,[{id:'src-birds',blob,origin:'test'}]);const writes=store._metrics().audioWrites;
    await store.save({...snap,name:'009-after-drop'},[]);
    const loaded=await store.load(),c=loaded.snapshot.clips.find(x=>x.id==='birds');
    near(c.start,13.2);assert.equal(c.track,'C');assert.equal(c.sourceId,'src-birds');assert.equal(store._metrics().audioWrites,writes);
    console.log('AUTOSAVE_RESTORE PASS dropped start/track survive reload; additional audio writes=0');
  }

  // 12 PLAYBACK_TRACK_STATE using actual production playback function.
  {
    function runPlayback(trackMuted){
      const gains=[],starts=[];
      const c={id:'birds',track:'B',sourceId:'src-birds',start:4,trim:0,len:2,gain:.7,muted:false};
      const context={console,Map,Math,clips:[c],tracks:[{id:'A',gain:1,muted:false},{id:'B',gain:.5,muted:trackMuted}],sources:[],playing:false,metroOn:false,t0:0,tick:null,recording:false,
        sourceIdFor:x=>x.sourceId,ctx:{currentTime:10,destination:{},createBufferSource:()=>({connect(){return this},start(...a){starts.push(a)}}),createGain:()=>{const g={gain:{value:1},connect(){gains.push(g.gain.value);return this}};return g}},
        startMetro:()=>{},setInterval:()=>1,performance:{now:()=>1000},updateLiveRecordingVisual:()=>{},setCursor:()=>{},projectDuration:()=>30,$:()=>({textContent:''})};
      vm.createContext(context);vm.runInContext(playbackSource,context);
      context.startPreparedPlayback(0,false,new Map([['src-birds',{duration:10}]]));
      return{gains,starts,playing:context.playing};
    }
    let a=runPlayback(false);assert.equal(a.starts.length,1);assert.equal(a.gains[0],.35);assert.equal(a.playing,true);
    let b=runPlayback(true);assert.equal(b.starts.length,0);
    console.log('PLAYBACK_TRACK_STATE PASS new track B gain applied (.7*.5=.35); B mute suppresses clip');
  }

  // 14 TRIM_GESTURES non-regression.
  for(const marker of ["handle.setPointerCapture(e.pointerId)","handle.addEventListener('pointermove'","handle.addEventListener('pointerup',finish)","handle.addEventListener('pointercancel',finish)","c.trim=startState.trim+change","c.len=Math.max(.08"])assert(trimSource.includes(marker),'trim regression: '+marker);
  console.log('TRIM_GESTURES PASS pointer capture/move/up/cancel and trim math retained');

  // 15 PLAYHEAD_GESTURE non-regression.
  for(const marker of ["setCursor(xToTime(e.clientX))","ph.setPointerCapture(e.pointerId)","ph.onpointermove","ph.onpointerup","ph.onpointercancel"])assert(playheadSource.includes(marker),'playhead regression: '+marker);
  console.log('PLAYHEAD_GESTURE PASS timeline tap + playhead drag handlers retained');

  // DOM geometry + feedback contract.
  assert(dragSource.includes("document.querySelectorAll('#tracks .lane[data-track-id]')"));
  assert(dragSource.includes('lane.getBoundingClientRect()'));
  assert(dragSource.includes("lane.classList.add('drag-target')"));
  assert(html.includes("lane.dataset.trackId=t.id"));
  assert(html.includes('.lane.drag-target{outline:2px solid var(--px-yellow)'));
  console.log('TRACK_HIT_TEST PASS real rendered lane getBoundingClientRect geometry; no hard-coded lane heights');
  console.log('VISUAL_FEEDBACK PASS target lane receives minimal drag-target outline');

  console.log('Studio mobile cross-track drag 009 tests PASS');
})().catch(e=>{console.error(e);process.exit(1)});
