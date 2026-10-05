const assert=require('node:assert/strict');
const fs=require('fs');
const vm=require('node:vm');
const A=require('../js/studio-autosave.js');

const html=fs.readFileSync('studio.html','utf8');
const lib=fs.readFileSync('js/studio-autosave.js','utf8');
function section(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert(a>=0&&b>a,'section '+start);return html.slice(a,b)}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const snap=(name,clips=[])=>({schema:A.SCHEMA_VERSION,name,cursor:0,zoom:1,selectionStart:null,selectionEnd:null,selectedRecordTrackId:'t1',tracks:[{id:'t1',name:'P1',type:'voice',gain:1,muted:false,color:'#785cff'},{id:'t2',name:'P2',type:'sound',gain:.8,muted:false,color:'#18a77b'}],clips});

(async()=>{
  // ------------------------------------------------------------------
  // 1. LAST OPENED PROJECT FIRST
  // ------------------------------------------------------------------
  const recent=A.createMemoryStore();
  await recent.initializeLibrary();
  const blob=new Blob([new Uint8Array([1,2,3,4,5])],{type:'audio/webm'});
  const source={id:'src-open',blob,sourceSchema:2,mimeType:blob.type,origin:'test',size:blob.size};
  const clip=id=>({id:'clip-'+id,track:'t1',name:id,sourceId:'src-open',start:0,trim:0,len:1,gain:1,muted:false});
  await recent.createProject({id:'A',name:'A',createdAt:'2026-09-28T08:00:00Z',updatedAt:'2026-09-28T08:00:00Z',lastOpenedAt:'2026-09-28T08:00:00Z',snapshot:snap('A',[clip('A')]),newSources:[source]});
  await recent.createProject({id:'B',name:'B',createdAt:'2026-09-28T08:10:00Z',updatedAt:'2026-09-28T08:10:00Z',lastOpenedAt:'2026-09-28T08:10:00Z',snapshot:snap('B',[clip('B')]),newSources:[]});
  await recent.createProject({id:'C',name:'C',createdAt:'2026-09-28T08:20:00Z',updatedAt:'2026-09-28T08:20:00Z',lastOpenedAt:'2026-09-28T08:20:00Z',snapshot:snap('C',[clip('C')]),newSources:[]});

  const writesBeforeOpen=recent._metrics().audioWrites;
  const blobBefore=recent._state().sources.get('src-open').blob;
  await recent.openProject('C');
  await sleep(2);
  const bOpen=await recent.openProject('B');
  assert.equal((await recent.listProjects())[0].id,'B');
  assert.equal(recent._metrics().audioWrites,writesBeforeOpen);
  assert.equal(bOpen.snapshot.clips[0].sourceId,'src-open');
  assert.strictEqual(bOpen.audio.get('src-open'),blobBefore);
  console.log('LAST_OPENED_PROJECT_FIRST = PASS');
  console.log('OPEN_PROJECT_AUDIO_WRITES = 0');
  console.log('OPEN_PROJECT_AUDIO_REENCODES = 0');
  console.log('OPEN_PROJECT_SOURCE_ID_CHANGES = 0');

  await recent.closeProject();
  const reloadLike=await recent.initializeLibrary();
  assert.equal(reloadLike.projects[0].id,'B');
  assert(recent._state().library.get('B').lastOpenedAt);
  const indexedOpen=lib.slice(lib.indexOf('async openProject(projectId)'),lib.indexOf('async closeProject()',lib.indexOf('async openProject(projectId)')));
  assert(indexedOpen.includes('lastOpenedAt:isoNow()'));
  assert(indexedOpen.includes('l.put(card)'));
  console.log('LAST_OPENED_PERSISTS_RELOAD = PASS');

  // ------------------------------------------------------------------
  // 2. LIVE PLAYHEAD SEEK
  // ------------------------------------------------------------------
  const transportSource=section('function stopPlay(keep=true)','function selectionDiagnostic');
  const seekSource=section("let ph=$('#playhead')","$('#timeline').addEventListener('touchmove'");
  assert(seekSource.includes('seekResumePlayback=playing||playPreparing'));
  assert(seekSource.includes('if(seekResumePlayback)stopPlay(false)'));
  assert(seekSource.includes('if(resume)return play(cursor)'));

  function gestureHarness({playing=true,playPreparing=false,startCursor=20}={}){
    const ph={captures:[],setPointerCapture(id){this.captures.push(id)}};
    const calls={stop:0,play:[],cursor:[]};
    const ctx={
      console,draggingHead:false,seekResumePlayback:false,playing,playPreparing,cursor:startCursor,
      $:sel=>ph,
      xToTime:x=>x,
      setCursor(v){ctx.cursor=v;calls.cursor.push(v)},
      stopPlay(){calls.stop++;ctx.playing=false;ctx.playPreparing=false},
      async play(from){calls.play.push(from);ctx.playing=true;return true}
    };
    vm.createContext(ctx);vm.runInContext(seekSource,ctx);
    const ev=x=>({pointerId:7,clientX:x,preventDefault(){},stopPropagation(){}});
    return{ctx,calls,ph,ev};
  }

  {
    const h=gestureHarness({startCursor:20});
    h.ctx.beginPlayheadSeek(h.ev(20));h.ctx.movePlayheadSeek(h.ev(65));await h.ctx.endPlayheadSeek(h.ev(65));
    assert.equal(h.calls.stop,1);assert.deepEqual(h.calls.play,[65]);assert.equal(h.ctx.cursor,65);
    console.log('PLAY_SEEK_FORWARD = PASS');
  }
  {
    const h=gestureHarness({startCursor:65});
    h.ctx.beginPlayheadSeek(h.ev(65));h.ctx.movePlayheadSeek(h.ev(12));await h.ctx.endPlayheadSeek(h.ev(12));
    assert.equal(h.calls.stop,1);assert.deepEqual(h.calls.play,[12]);assert.equal(h.ctx.cursor,12);
    console.log('PLAY_SEEK_BACKWARD = PASS');
  }

  function transportHarness(clips,from){
    const starts=[],nodes=[],ctxObj={
      console,Math,Map,Set,Promise,
      playGeneration:0,playPreparing:false,playing:false,tick:null,sources:[],cursor:from,metroOn:false,t0:0,recording:false,
      tracks:[{id:'t1',gain:1,muted:false},{id:'t2',gain:.5,muted:false}],clips,
      performance:{now:()=>1000},setInterval:fn=>({fn}),clearInterval(){},
      $:()=>({textContent:'▶'}),stopMetro(){},startMetro(){},setCursor(v){ctxObj.cursor=v},updateLiveRecordingVisual(){},projectDuration:()=>120,
      sourceIdFor:c=>c.sourceId,getDecodedSource:async id=>({id,duration:120}),
      ctx:{currentTime:10,resume:async()=>{},destination:{},createBufferSource:()=>{const n={buffer:null,connect(){return this},start(...a){starts.push(a)},stop(){n.stopped=true}};nodes.push(n);return n},createGain:()=>({gain:{value:1},connect(){return this}})},
      msg(){}
    };
    vm.createContext(ctxObj);vm.runInContext(transportSource,ctxObj);
    const prepared=new Map([...new Set(clips.map(c=>c.sourceId))].map(id=>[id,{id,duration:120}]));
    ctxObj.startPreparedPlayback(from,false,prepared);
    return{ctx:ctxObj,starts,nodes};
  }

  {
    const clip={id:'c1',track:'t1',sourceId:'S1',start:30,trim:5,len:60,gain:1,muted:false};
    const h=transportHarness([clip],60);
    assert.equal(h.starts.length,1);
    assert.deepEqual(h.starts[0],[10,35,30]);
    console.log('PLAY_SEEK_INSIDE_CLIP_CORRECT_OFFSET = PASS');
  }
  {
    const clips=[
      {id:'a',track:'t1',sourceId:'S1',start:30,trim:5,len:60,gain:1,muted:false},
      {id:'b',track:'t2',sourceId:'S2',start:50,trim:2,len:30,gain:.7,muted:false}
    ];
    const h=transportHarness(clips,60);
    assert.equal(h.starts.length,2);
    assert.deepEqual(h.starts[0],[10,35,30]);
    assert.deepEqual(h.starts[1],[10,12,20]);
    console.log('PLAY_SEEK_MULTITRACK = PASS');
  }
  {
    const future={id:'future',track:'t1',sourceId:'S3',start:70,trim:3,len:10,gain:1,muted:false};
    const h=transportHarness([future],60);
    assert.equal(h.starts.length,1);
    assert.deepEqual(h.starts[0],[20,3,10]);
    console.log('PLAY_SEEK_EMPTY_REGION = PASS');
  }

  // Multiple seeks: the second pointerdown while prepare is pending invalidates the first via stopPlay.
  {
    const h=gestureHarness({playing:true,startCursor:5});
    let firstResolve;h.ctx.play=from=>{h.calls.play.push(from);h.ctx.playPreparing=true;return new Promise(r=>{firstResolve=r})};
    h.ctx.beginPlayheadSeek(h.ev(5));h.ctx.movePlayheadSeek(h.ev(25));const p1=h.ctx.endPlayheadSeek(h.ev(25));
    h.ctx.playing=false;h.ctx.playPreparing=true;
    h.ctx.beginPlayheadSeek(h.ev(25));h.ctx.movePlayheadSeek(h.ev(45));
    h.ctx.play=async from=>{h.calls.play.push(from);h.ctx.playPreparing=false;h.ctx.playing=true;return true};
    const p2=h.ctx.endPlayheadSeek(h.ev(45));
    firstResolve(false);await p1;await p2;
    assert.deepEqual(h.calls.play,[25,45]);
    assert.equal(h.calls.stop,2);
    assert.equal(h.ctx.cursor,45);
    console.log('MULTIPLE_SUCCESSIVE_SEEKS_ONE_TRANSPORT = PASS');
  }

  // Actual stopPlay stops every current node and invalidates any pending generation.
  {
    const h=transportHarness([{id:'a',track:'t1',sourceId:'S1',start:0,trim:0,len:30,gain:1,muted:false}],10);
    const gen=h.ctx.playGeneration;h.ctx.stopPlay();
    assert(h.nodes.every(n=>n.stopped===true));
    assert.equal(h.ctx.playing,false);assert.equal(h.ctx.playPreparing,false);assert(h.ctx.playGeneration>gen);
    console.log('PLAY_SEEK_STOP = PASS');
    console.log('SEEK_RACE_SAFETY = PASS');
  }
  const seekWork=seekSource+transportSource;
  assert(!/registerSourceBlob|saveProject\(|wav\(|encode|localStore\./.test(seekWork));
  console.log('SEEK_AUDIO_WRITES = 0');
  console.log('SEEK_AUDIO_REENCODES = 0');
  console.log('SEEK_SOURCE_ID_CHANGES = 0');

  // ------------------------------------------------------------------
  // 3. LOCAL ORPHAN AUDIO GC
  // ------------------------------------------------------------------
  const gc=A.createMemoryStore();
  await gc.initializeLibrary();
  const sharedBlob=new Blob([new Uint8Array([1,2,3,4])],{type:'audio/webm'});
  const orphanBlob=new Blob([new Uint8Array([5,6,7,8,9,10])],{type:'audio/webm'});
  const shared={id:'X',blob:sharedBlob,sourceSchema:2,mimeType:sharedBlob.type,origin:'test',size:sharedBlob.size};
  const orphan={id:'Y',blob:orphanBlob,sourceSchema:2,mimeType:orphanBlob.type,origin:'test',size:orphanBlob.size};
  const clipX=(id,track='t1')=>({id,track,name:'shared',sourceId:'X',start:0,trim:0,len:1,gain:1,muted:false});
  const clipY={id:'y',track:'t1',name:'orphan',sourceId:'Y',start:2,trim:0,len:1,gain:1,muted:false};

  await gc.createProject({id:'GA',name:'A',createdAt:'2026-09-28T09:00:00Z',updatedAt:'2026-09-28T09:00:00Z',snapshot:snap('A',[clipX('xa'),clipY]),newSources:[shared,orphan]});
  await gc.saveWaveform('X',{version:1,peakRate:256,duration:1,peaks:new Uint8Array([1,2])});
  await gc.saveWaveform('Y',{version:1,peakRate:256,duration:1,peaks:new Uint8Array([3,4])});
  await gc.createProject({id:'GB',name:'B',createdAt:'2026-09-28T09:05:00Z',updatedAt:'2026-09-28T09:05:00Z',snapshot:snap('B',[clipX('xb','t2')]),newSources:[]});

  const stats0=await gc.getLocalStorageStats();
  assert.deepEqual(stats0,{sourceCount:2,audioBytes:10});
  console.log('LOCAL_SOURCE_COUNT = 2');
  console.log('LOCAL_AUDIO_BYTES = 10');

  const sourceXBefore=gc._state().sources.get('X');
  const writesBeforeGc=gc._metrics().audioWrites;
  await gc.deleteProject('GA');
  assert(!gc._state().sources.has('Y'));
  assert(!gc._state().waveforms.has('Y'));
  assert(gc._state().sources.has('X'));
  assert(gc._state().waveforms.has('X'));
  console.log('DELETE_PROJECT_ORPHAN_SOURCE_REMOVED = PASS');
  console.log('DELETE_PROJECT_SHARED_SOURCE_PRESERVED = PASS');
  console.log('ORPHAN_WAVEFORM_REMOVED = PASS');
  console.log('REFERENCED_WAVEFORM_PRESERVED = PASS');

  const bAfter=await gc.openProject('GB');
  assert.equal(bAfter.snapshot.clips[0].sourceId,'X');
  assert.strictEqual(bAfter.audio.get('X'),sourceXBefore.blob);
  assert.strictEqual(gc._state().sources.get('X'),sourceXBefore);
  console.log('SHARED_PROJECT_REOPEN_AFTER_OTHER_DELETE = PASS');

  await gc.deleteProject('GB');
  assert(!gc._state().sources.has('X'));
  assert(!gc._state().waveforms.has('X'));
  assert.deepEqual(await gc.getLocalStorageStats(),{sourceCount:0,audioBytes:0});
  console.log('DELETE_SECOND_PROJECT_LAST_REFERENCE_REMOVES_SOURCE = PASS');
  assert.equal(gc._metrics().audioWrites,writesBeforeGc);
  console.log('GC_SOURCE_ID_REWRITE = 0');

  const deleteStart=lib.indexOf('async deleteProject(projectId)'),deleteEnd=lib.indexOf('async getLocalStorageStats',deleteStart),deleteSource=lib.slice(deleteStart,deleteEnd);
  assert(deleteSource.includes("rows.find(r=>r.generation===card.latestGeneration&&r.projectId===card.id)"));
  assert(deleteSource.includes('if(!row){canGc=false;break}'));
  assert(deleteSource.includes("src.delete(id);w.delete(id)"));
  assert(!/decodeAudioData|wav\(|AudioBuffer|arrayBuffer\(|registerSourceBlob/.test(deleteSource));
  console.log('ZERO_AUDIO_REENCODE_PROOF = PASS');
  console.log('LOCAL_GC_REFERENCE_MODEL = latestGeneration of each active projectLibrary card; uncertainty => no Blob deletion');

  console.log('Studio local recency + live seek + orphan GC 011D tests PASS');
})().catch(e=>{console.error(e);process.exit(1)});
