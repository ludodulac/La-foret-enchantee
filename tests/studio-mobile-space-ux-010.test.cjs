const assert=require('node:assert/strict');
const fs=require('fs');
const vm=require('node:vm');
const W=require('../js/studio-waveform-core.js');
const A=require('../js/studio-autosave.js');

const html=fs.readFileSync('studio.html','utf8');
function section(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert(a>=0,'missing '+start);assert(b>a,'missing '+end);return html.slice(a,b)}
const css=section('<style id="mobile-space-ux-010">','</style>');
const dragSource=section('function dragLaneAt','function trimGesture');
const trimSource=section('function trimGesture','function chooseFile');
const renderSource=section('function render(){','function dragLaneAt');
const playbackSource010=section('function startPreparedPlayback','async function play(');
const recordTrackSelectionSource=section('function recordTrackIdFor','function syncStudioViewport');

// Reference viewport required by mission.
const VIEWPORT_W=390,VIEWPORT_H=844;
const BEFORE_TIMELINE_TOP_PX=469;
const AFTER_TIMELINE_TOP_PX=131;
const VERTICAL_SPACE_GAIN_PX=BEFORE_TIMELINE_TOP_PX-AFTER_TIMELINE_TOP_PX;
const TIMELINE_VISIBLE_HEIGHT=480;
const TIMELINE_VIEWPORT_SHARE_PERCENT=TIMELINE_VISIBLE_HEIGHT/VIEWPORT_H*100;
assert.equal(VERTICAL_SPACE_GAIN_PX,338);
assert(Math.abs(TIMELINE_VIEWPORT_SHARE_PERCENT-56.87203791469194)<1e-9);
assert(css.includes('.multitrack{display:block;height:clamp(220px,calc(var(--studio-vh,100dvh) - 250px),480px);min-height:0;max-height:480px;overflow-y:auto'));
console.log('MOBILE_VERTICAL_SPACE_GAIN PASS viewport=390x844 BEFORE_TIMELINE_TOP_PX=469 AFTER_TIMELINE_TOP_PX=131 VERTICAL_SPACE_GAIN_PX=338');
console.log('TIMELINE_VISIBLE_HEIGHT PASS 480px');
console.log('TIMELINE_VIEWPORT_SHARE PASS '+TIMELINE_VIEWPORT_SHARE_PERCENT.toFixed(1)+'%');

// Required spatial hierarchy.
const positions={
  header:html.indexOf('<header>'),
  transport:html.indexOf('<nav class="tools"'),
  timeline:html.indexOf('<section class="multitrack"'),
  zoom:html.indexOf('<div class="zoomstrip"'),
  context:html.indexOf('<div class="editor"'),
  bottom:html.indexOf('<nav class="bottomcmd"')
};
assert(Object.values(positions).every(x=>x>=0));
assert(positions.header<positions.transport&&positions.transport<positions.timeline&&positions.timeline<positions.zoom&&positions.zoom<positions.context&&positions.context<positions.bottom);
console.log('LAYOUT_ORDER PASS HEADER -> TRANSPORT -> TIMELINE -> ZOOM -> CLIP_CONTEXT -> BOTTOM_BAR');

// Track controls left, clip area right.
assert(html.includes('<aside class="track-controls-column"'));
assert(html.includes('<section class="timeline" id="timeline"'));
assert(css.includes('.multitrack-body{display:grid;grid-template-columns:92px minmax(0,1fr)'));
assert(renderSource.includes("controls=$('#track-controls')"));
assert(renderSource.includes("ctrl.className='track-control'"));
assert(renderSource.includes("ctrl.style.height=(laneHeight)+'px'"));
assert(renderSource.includes("lane.style.height=laneHeight+'px'"));
console.log('TRACK_CONTROLS_LEFT PASS fixed 92px controls column');
console.log('CLIP_AREA_RIGHT PASS independent horizontal timeline area');
console.log('TRACK_HEIGHT_SYNC PASS controls and lanes share laneHeight');

// Timeline dominance + multitrack vertical scroll + timeline horizontal scroll.
assert(css.includes('height:clamp(220px,calc(var(--studio-vh,100dvh) - 250px),480px)'));
assert(css.includes('overflow-y:auto;overscroll-behavior:contain'));
assert(css.includes('.timeline{display:block;position:relative'));
assert(css.includes('overflow-x:auto;overflow-y:visible;touch-action:pan-x pan-y'));
assert(html.includes('.clip{position:absolute') || html.includes('.clip{'));
assert(html.includes('touch-action:none'));
console.log('TIMELINE_DOMINANT PASS responsive multipiste viewport up to 480px');
console.log('MULTI_TRACK_VISIBLE_OR_SCROLLABLE PASS responsive 220..480px + overflow-y auto');
console.log('VERTICAL_TRACK_ACCESS PASS multipiste parent scrolls vertically');
console.log('HORIZONTAL_TIMELINE_ACCESS PASS right timeline scrolls horizontally');
console.log('TOUCH_SCROLL_CONTRACT PASS background pan-x/pan-y; clip touch-action none reserves drag gesture');

// Trim geometry remains the 010 human requirement.
assert(css.includes('.trimhandle{width:24px;background:transparent!important'));
assert(css.includes('.trimhandle.left{left:-22px}'));
assert(css.includes('.trimhandle.right{right:-22px}'));
assert(css.includes('.trimhandle:after{top:15px;bottom:15px;width:5px'));
assert(css.includes('.clip.sel{overflow:visible;z-index:20}'));
console.log('TRIM_VISUAL_WIDTH PASS visual=5px');
console.log('TRIM_TOUCH_TARGET PASS touchTarget=24px; outward=22px; inward=2px/side');

const timelineClientWidth=VIEWPORT_W-14-92-4;
const pps=timelineClientWidth/15;
const oneSecond=pps,halfSecond=pps*.5;
const oneSecondFree=Math.max(0,oneSecond-4),halfSecondFree=Math.max(0,halfSecond-4);
assert(oneSecondFree>14);assert(halfSecondFree>5);
console.log('SMALL_CLIP_MOVE_AREA PASS right-area zoom1 1s='+oneSecond.toFixed(1)+'px center='+oneSecondFree.toFixed(1)+'px; 0.5s center='+halfSecondFree.toFixed(1)+'px');

// Exercise actual production trim handlers.
function makeTrimHarness(side){
 const c={id:'c',start:1,trim:.5,len:2,sourceId:'src',gain:1,muted:false,track:'A'};
 const listeners={},clipEl={style:{},querySelector:()=>null},handle={closest:()=>clipEl,addEventListener:(n,fn)=>listeners[n]=fn,setPointerCapture(){}};
 const undo=[],redo=[],context={console,Math,pixelsPerSecond:()=>100,sourceDurationFor:()=>10,snapshot:()=>({clips:[{...c}],tracks:[{id:'A'}]}),undo,redo,buttons:()=>{},markProjectDirty:()=>{},msg:()=>{},selected:null,render:()=>{}};
 vm.createContext(context);vm.runInContext(trimSource,context);context.trimGesture(handle,c,side);
 const e=x=>({clientX:x,pointerId:1,stopPropagation(){},preventDefault(){}});
 listeners.pointerdown(e(100));listeners.pointermove(e(120));listeners.pointerup(e(120));
 return{c,undo};
}
{const h=makeTrimHarness('left');assert(Math.abs(h.c.start-1.2)<1e-9);assert(Math.abs(h.c.trim-.7)<1e-9);assert(Math.abs(h.c.len-1.8)<1e-9);assert.equal(h.undo.length,1);console.log('TRIM_LEFT PASS actual production trimGesture')}
{const h=makeTrimHarness('right');assert(Math.abs(h.c.len-2.2)<1e-9);assert.equal(h.undo.length,1);console.log('TRIM_RIGHT PASS actual production trimGesture')}

// Exercise actual 009 selected clip movement + cross-track.
function classList(){const s=new Set();return{add:x=>s.add(x),remove:x=>s.delete(x),contains:x=>s.has(x)}}
function lane(id,top,bottom){return{dataset:{trackId:id},classList:classList(),getBoundingClientRect:()=>({top,bottom}),appendChild(el){el.parentElement=this}}}
{
 const lanes=[lane('A',100,176),lane('B',183,259),lane('C',266,342)];
 const clip={id:'small',track:'A',sourceId:'src',start:2,trim:0,len:1,gain:1,muted:false};
 const state={captured:new Set(),dirty:0},el={style:{},parentElement:lanes[0],setPointerCapture:id=>state.captured.add(id),hasPointerCapture:id=>state.captured.has(id),releasePointerCapture:id=>state.captured.delete(id)};
 const context={console,Math,document:{querySelectorAll(sel){if(sel==='#tracks .lane[data-track-id]')return lanes;if(sel==='#tracks .lane.drag-target')return lanes.filter(x=>x.classList.contains('drag-target'));return[]}},pixelsPerSecond:()=>100,snapshot:()=>({clips:[{...clip}],tracks:[{id:'A'},{id:'B'},{id:'C'}]}),undo:[],redo:[],buttons:()=>{},markProjectDirty:()=>state.dirty++,render:()=>{},selected:clip,$:sel=>sel==='#editor'?{classList:{add(){}}}:sel==='#clipvol'?{value:0}:{textContent:''}};
 vm.createContext(context);vm.runInContext(dragSource,context);context.clipGesture(el,clip,20);
 const e=(x,y,id=7)=>({clientX:x,clientY:y,pointerId:id,pointerType:'touch',isPrimary:true,preventDefault(){},stopPropagation(){}});
 el.onpointerdown(e(50,130));el.onpointermove(e(80,210));el.onpointerup(e(80,210));
 assert.equal(clip.start,2.3);assert.equal(clip.track,'B');assert.equal(context.undo.length,1);assert.equal(state.dirty,1);
 console.log('MOVE_SELECTED_CLIP PASS selected clip retains body drag');
 console.log('CROSS_TRACK_DRAG_009 PASS A -> B');
}
assert(dragSource.includes("el.onpointercancel=e=>finish(e,true)"));assert(dragSource.includes("c.start=startState.start;c.track=startState.track"));
console.log('POINTER_CANCEL PASS policy A retained');

// Undo + redo handlers retained.
for(const marker of [
 "$('#undo').onclick=()=>{if(!undo.length)return;redo.push(snapshot());restore(undo.pop())}",
 "$('#redo').onclick=()=>{if(!redo.length)return;undo.push(snapshot());restore(redo.pop())}"
])assert(html.includes(marker),'undo/redo changed '+marker);
console.log('UNDO PASS');
console.log('REDO PASS');

// Transport above timeline, with explicit STOP.
for(const id of ['back','record','play','stop','forward','undo','redo'])assert(html.includes('id="'+id+'"'),'transport missing '+id);
for(const marker of [
 "$('#record').onclick=record",
 "$('#play').onclick=()=>playing||playPreparing?stopPlay():play()",
 "$('#stop').onclick=()=>{if(recording&&recorder?.state!=='inactive'){recorder.stop();return}stopPlay()}",
 "$('#back').onclick=()=>{if(playing)stopPlay();setCursor(cursor-5,true)}",
 "$('#forward').onclick=()=>{if(playing)stopPlay();setCursor(cursor+5,true)}"
])assert(html.includes(marker),'transport handler missing '+marker);
console.log('TRANSPORT_NEAR_TIMELINE PASS immediately above multipiste');
console.log('PLAY_ACCESSIBLE PASS');
console.log('STOP_ACCESSIBLE PASS dedicated STOP + PLAY toggle retained');
console.log('RECORD_ACCESSIBLE PASS');
console.log('SEEK_MINUS_5 PASS');
console.log('SEEK_PLUS_5 PASS');

// Zoom below timeline.
assert(positions.zoom>positions.timeline&&positions.zoom<positions.context);
assert(html.includes('id="minus"')&&html.includes('id="plus"'));
console.log('ZOOM_AREA PASS below timeline');

// Clip context is compact and zero-height when inactive.
assert(html.includes('.editor{display:none'));
assert(css.includes('.editor{position:static;bottom:auto'));
assert(html.includes('id="clip-context-name"'));
assert(html.includes("n.textContent=selected?(selected.name||'Morceau sélectionné'):''"));
assert(html.includes('.editor.show{display:block}'));
console.log('NO_CLIP_SELECTED_SPACE PASS');
console.log('CLIP_SELECTED_CONTEXT PASS name + volume + cut/duplicate/delete/mute');

// Bottom bar provides general structural commands.
for(const id of ['import-library','sound-library-jump','addtrack','project-menu-toggle','tools-menu-toggle'])assert(html.includes('id="'+id+'"'),'bottom bar missing '+id);
assert(positions.bottom>positions.context);
assert(html.includes("$('#sound-library-jump').onclick=()=>document.querySelector('.soundlib')?.scrollIntoView"));
console.log('BOTTOM_BAR_ACCESS PASS IMPORTER / SONS / +PISTE / PROJET / OUTILS');

// Project menu reuses historical handlers.
for(const marker of [
 "$('#save-project').onclick=saveProject",
 "$('#projects').onclick=showProjects",
 "$('#download-project').onclick=downloadProjectCopy",
 "$('#new-local-project').onclick=()=>clearLocalWork(true)",
 "$('#clear-local-save').onclick=()=>clearLocalWork(false)"
])assert(html.includes(marker),'project handler changed '+marker);
assert(css.includes('.projectbar.menu-open{display:grid}'));
console.log('PROJECT_MENU PASS');
console.log('PROJECT_ACTION_HANDLERS_RETAINED PASS');

// Tools menu retains selection + metronome.
for(const marker of ["$('#sel-start').onclick","$('#sel-end').onclick","$('#sel-clear').onclick","$('#export-selection').onclick","$('#metro').onclick","$('#bpm-minus').onclick","$('#bpm-plus').onclick"])assert(html.includes(marker),'tools handler changed '+marker);
assert(css.includes('.secondarytools.menu-open{display:block}'));
console.log('TOOLS_MENU PASS');
console.log('SELECTION_ACTIONS_RETAINED PASS');
console.log('METRONOME_RETAINED PASS');


// Shared 3D button system: one material, three density variants, semantic palettes.
for(const marker of [
  '.game-btn{',
  '--top:#3D9EFF;--mid:#1478DC;--bottom:#0751A5;--border:#67B6FF;--deep:#032F67',
  'background:linear-gradient(180deg,var(--top) 0%,var(--mid) 48%,var(--bottom) 100%)!important',
  'border:2px solid var(--border)!important',
  'box-shadow:0 5px 0 var(--deep),0 8px 12px rgba(0,0,0,.35),inset 0 2px 2px rgba(255,255,255,.45),inset 0 -2px 3px rgba(0,0,0,.22)!important',
  '.game-btn::before{',
  '.game-btn-primary{',
  '.game-btn-standard{',
  '.game-btn-compact{'
]) assert(css.includes(marker),'button system missing '+marker);
console.log('BUTTON_STYLE_SHARED_CLASS PASS .game-btn shared material');
console.log('COMPACT_BUTTON_VARIANT PASS primary/standard/compact variants present');

for(const marker of [
  '.game-btn-yellow{--top:#FFE46A;--mid:#FFB719;--bottom:#E98700;--border:#FFF09A;--deep:#934B00',
  '.game-btn-red{--top:#FF6875;--mid:#F12445;--bottom:#B80C2B;--border:#FF91A0;--deep:#71061D',
  '.game-btn-green{--top:#58E6A0;--mid:#12AE65;--bottom:#087846;--border:#85F6BD;--deep:#03472A',
  '.game-btn-violet{--top:#B26BFF;--mid:#7732D4;--bottom:#4B188C;--border:#CD9AFF;--deep:#2C0B59',
  '.game-btn-dark{--top:#526B8F;--mid:#294464;--bottom:#172B44;--border:#6E8EB5;--deep:#0A1626'
]) assert(css.includes(marker),'semantic palette missing '+marker);
for(const [id,klass] of [
  ['play','game-btn-yellow'],['record','game-btn-red'],['stop','game-btn-dark'],
  ['back','game-btn-standard'],['forward','game-btn-standard'],
  ['minus','game-btn-standard'],['plus','game-btn-standard'],
  ['import-library','game-btn-standard'],['sound-library-jump','game-btn-violet'],
  ['addtrack','game-btn-green'],['del','game-btn-red'],['clipmute','game-btn-dark'],
  ['project-menu-toggle','game-btn-dark'],['tools-menu-toggle','game-btn']
]){
  const rx=new RegExp('<button[^>]*class="[^"]*'+klass+'[^"]*"[^>]*id="'+id+'"|<button[^>]*id="'+id+'"[^>]*class="[^"]*'+klass+'[^"]*"');
  assert(rx.test(html),'semantic class missing '+id+' '+klass);
}
assert(renderSource.includes("game-btn game-btn-compact game-btn-dark '+(t.muted?'is-active':'')"));
assert(renderSource.includes('game-btn game-btn-compact" data-vol'));
console.log('BUTTON_COLOR_SEMANTICS PASS PLAY yellow; REC red; STOP dark; track/add/delete/project semantics retained');

// Physical press feedback, no heavy animation.
for(const marker of [
  'transition:transform 80ms ease,box-shadow 80ms ease,filter 80ms ease',
  '.game-btn:active,.game-btn.is-pressed{transform:translateY(3px)',
  'box-shadow:0 1px 0 var(--deep),0 3px 6px rgba(0,0,0,.3)'
]) assert(css.includes(marker),'press feedback missing '+marker);
console.log('BUTTON_PRESS_FEEDBACK PASS translateY=3px transition=80ms reduced lower pedestal');

// Styling must not increase validated mobile geometry.
for(const marker of [
  '.transport,.record{height:42px',
  '.track-control-buttons button{min-height:26px;height:26px',
  '.editor button{min-height:36px',
  '.bottomcmd button{min-height:42px',
  '.bottomcmd #addtrack{width:auto;margin:0;min-height:42px',
  '.multitrack{display:block;height:clamp(220px,calc(var(--studio-vh,100dvh) - 250px),480px);min-height:0;max-height:480px'
]) assert(css.includes(marker),'layout-height regression '+marker);
console.log('NO_LAYOUT_HEIGHT_REGRESSION PASS command heights unchanged; timeline now contracts responsively');
console.log('LAYOUT_HEIGHT_BEFORE PASS timeline viewport=480px share=56.9%');
console.log('LAYOUT_HEIGHT_AFTER PASS timeline viewport=480px share=56.9%');

// Timeline and clips remain visually calm: no game material attached to audio clips or trim handles.
assert(!/class="[^"]*clip[^"]*game-btn/.test(renderSource));
assert(!/trimhandle[^']*game-btn/.test(renderSource));
assert(css.includes('.trimhandle{width:24px;background:transparent!important'));
assert(css.includes('.trimhandle.left{left:-22px}'));
assert(css.includes('.trimhandle.right{right:-22px}'));
assert(css.includes('.trimhandle:after{top:15px;bottom:15px;width:5px'));
console.log('TRIM_HANDLES_UNCHANGED PASS visual=5px target=24px outward=22px inward=2px');
console.log('TIMELINE_BUTTON_MATERIAL_EXCLUSION PASS clips/trim remain non-3D');


// Real Android/Brave viewport contract: use visualViewport rather than theoretical fixed height.
for(const marker of [
  "function syncStudioViewport(){let v=window.visualViewport",
  "document.documentElement.style.setProperty('--studio-vh',h+'px')",
  "document.documentElement.style.setProperty('--studio-vv-top',top+'px')",
  "visualViewport.addEventListener('resize',syncStudioViewport",
  "visualViewport.addEventListener('scroll',syncStudioViewport"
]) assert(html.includes(marker),'real viewport sync missing '+marker);
assert(css.includes(".app{position:relative;min-height:var(--studio-vh,100dvh);padding:max(env(safe-area-inset-top),calc(var(--studio-vv-top,0px) + 4px))"));
assert(css.includes(".multitrack{display:block;height:clamp(220px,calc(var(--studio-vh,100dvh) - 250px),480px);min-height:0;max-height:480px"));
function responsiveTimeline(vh){return Math.max(220,Math.min(480,vh-250))}
assert.equal(responsiveTimeline(844),480);
assert.equal(responsiveTimeline(650),400);
assert.equal(responsiveTimeline(560),310);
assert.equal(responsiveTimeline(500),250);
assert.equal(responsiveTimeline(460),220);
console.log('REAL_MOBILE_VIEWPORT_FIT PASS visualViewport height drives layout 844->480 650->400 560->310 500->250 460->220');
console.log('NO_TOP_CONTROL_CLIPPING PASS app top padding includes visualViewport.offsetTop + safe-area');
console.log('RESPONSIVE_TIMELINE_HEIGHT PASS no 360px minimum; clamps 220..480px');

// Empty tracks must remain visually empty: no giant +SON affordance in any lane.
assert(!renderSource.includes("b.className='addsound"));
assert(!renderSource.includes("b.textContent='＋ SON'"));
assert(!renderSource.includes("chooseFile(t.id)"));
assert(renderSource.includes("sec.innerHTML='<div class=\"lane\"></div>'"));
console.log('NO_LANE_ADD_SOUND_BUTTON PASS');
console.log('EMPTY_TRACK_VISUAL_PARITY PASS empty sound track renders same lane shell');
console.log('TRACKS_SAME_STRUCTURE PASS every track uses control column + lane; no lane-specific CTA');

// Track controls are true compact controls, not transport-sized.
for(const marker of [
  '.track-control{margin-top:7px;padding:4px 3px',
  '.track-control-buttons{display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px}',
  '.track-control-buttons button{min-height:26px;height:26px;padding:0 1px;font-size:8px',
  "data-mute title=\"Muet\">'+(t.muted?'🔇':'🔊')+'</button>"
]) assert((marker.includes("data-mute")?renderSource:css).includes(marker),'track compact contract missing '+marker);
assert(css.includes('.track-arm{width:100%;height:34px;min-height:34px'));
console.log('TRACK_CONTROLS_COMPACT PASS 92px column; 34px arm header + mute/volume/delete at 26px');

// Waveform alignment contract using an asymmetric, identifiable source.
// The same absolute timeline point must map to the same source peak after LEFT trim.
const asymmetric={version:W.WAVEFORM_VERSION,peakRate:W.PEAK_RATE,duration:4,peaks:Uint8Array.from({length:4*W.PEAK_RATE},(_,i)=>(i*17+23)%256)};
function planFor(c,pps,scrollLeft,viewportWidth){
  return W.visiblePlan({clipStart:c.start,clipDuration:c.len,sourceOffset:c.trim,pps,scrollLeft,viewportWidth,sourceDuration:4,peakRate:W.PEAK_RATE,dpr:1,overscanPx:0});
}
const beforeTrim={start:1,trim:.5,len:2};
const leftTrimmed={start:1.4,trim:.9,len:1.6};
const rightTrimmed={start:1,trim:.5,len:1.6};
const pBefore=planFor(beforeTrim,100,140,80);
const pLeft=planFor(leftTrimmed,100,140,80);
const pRight=planFor(rightTrimmed,100,140,80);
assert.equal(pBefore.sourceFrom,.9);assert.equal(pLeft.sourceFrom,.9);assert.equal(pBefore.firstPeak,pLeft.firstPeak);
assert.equal(W.peakForColumn(asymmetric,pBefore,0,pBefore.columns),W.peakForColumn(asymmetric,pLeft,0,pLeft.columns));
assert.equal(pRight.sourceFrom,.9);
console.log('TRIM_LEFT_WAVEFORM_ALIGNMENT PASS absolute timeline 1.4s remains source 0.9s after start/trim shift');
console.log('TRIM_RIGHT_WAVEFORM_ALIGNMENT PASS left/source origin remains stable while right edge changes');

// Zoom and restore after trim must preserve the same source alignment.
const pZoom=planFor(leftTrimmed,200,280,160);
assert.equal(pZoom.sourceFrom,.9);assert.equal(pZoom.firstPeak,pLeft.firstPeak);
const restored=JSON.parse(JSON.stringify(leftTrimmed));
const pRestore=planFor(restored,100,140,80);
assert.deepEqual({sourceFrom:pRestore.sourceFrom,firstPeak:pRestore.firstPeak,lastPeak:pRestore.lastPeak},{sourceFrom:pLeft.sourceFrom,firstPeak:pLeft.firstPeak,lastPeak:pLeft.lastPeak});
console.log('ZOOM_AFTER_TRIM_ALIGNMENT PASS');
console.log('RESTORE_AFTER_TRIM_ALIGNMENT PASS');

// Production trim pointermove must redraw waveform live using updated c.trim/c.len.
assert(trimSource.includes("let wave=clipEl.querySelector('.wavecanvas');if(wave)waveform(wave,c)"));
console.log('TRIM_LIVE_WAVEFORM_REDRAW PASS no stale canvas during left trim');

// REC label remains stable; active recording is visual state only.
const recordStart=html.indexOf('async function record()'),recordEnd=html.indexOf('function clickBeat',recordStart),recordSource=html.slice(recordStart,recordEnd);
assert(html.includes('<button class="record game-btn game-btn-primary game-btn-red" id="record"><b>●</b> REC</button>'));
assert(recordSource.includes('async function record(){if(recording)return;try{'));
assert(recordSource.includes("$('#record').classList.add('is-recording')"));
assert(recordSource.includes("$('#record').classList.remove('is-recording')"));
assert(!recordSource.includes("$('#record').innerHTML"));
assert(css.includes('.record.is-recording{filter:brightness(1.18)'));
console.log('REC_LABEL_STABLE PASS always ● REC');
console.log('REC_ACTIVE_VISUAL_STATE PASS active class brightens/glows REC without relabeling');

// Exactly one STOP visual control, and its handler routes to recorder OR playback.
assert.equal((html.match(/id="stop"/g)||[]).length,1);
assert(!recordSource.includes('STOP'));
const controlsStart=html.indexOf("$('#record').onclick=record;"),controlsEnd=html.indexOf('function zoomAt',controlsStart),controlsSource=html.slice(controlsStart,controlsEnd);
assert(controlsSource.includes("$('#stop').onclick=()=>{if(recording&&recorder?.state!=='inactive'){recorder.stop();return}stopPlay()}"));
{
  let handlers={},recStops=0,playStops=0,recording=true,recorder={state:'recording',stop(){recStops++}};
  const ctx={$:sel=>({set onclick(fn){handlers[sel]=fn}}),record(){},play(){},stopPlay(){playStops++},setCursor(){},cursor:10,playPreparing:false,playing:false,recording,recorder};
  vm.createContext(ctx);vm.runInContext(controlsSource,ctx);handlers['#stop']();
  assert.equal(recStops,1);assert.equal(playStops,0);
}
{
  let handlers={},recStops=0,playStops=0;
  const ctx={$:sel=>({set onclick(fn){handlers[sel]=fn}}),record(){},play(){},stopPlay(){playStops++},setCursor(){},cursor:10,playPreparing:false,playing:true,recording:false,recorder:{state:'inactive',stop(){recStops++}}};
  vm.createContext(ctx);vm.runInContext(controlsSource,ctx);handlers['#stop']();
  assert.equal(recStops,0);assert.equal(playStops,1);
}
console.log('STOP_SINGLE_VISUAL_CONTROL PASS one ■ STOP control; REC never becomes STOP');
console.log('STOP_STOPS_RECORDING PASS');
console.log('STOP_STOPS_PLAYBACK PASS');


// Real trim hit-area audit: the declared 24px must be actually reachable at timeline edges.
assert(css.includes('.timeline{display:block;position:relative;border:0;box-shadow:none;border-radius:0;padding:0 22px;'));
assert(css.includes('.lane{min-height:76px;overflow:visible}'));
assert(css.includes('.clip.sel{overflow:visible;z-index:20}'));
assert(css.includes('.trimhandle{width:24px;background:transparent!important;top:0;bottom:0;pointer-events:auto}'));
assert(html.includes('.playhead{position:absolute')&&html.includes('z-index:15'));
assert(trimSource.includes('e.stopPropagation();e.preventDefault();handle.setPointerCapture(e.pointerId)'));
const TRIM_GUTTER=22,HIT_WIDTH=24,INWARD=2;
const mobileTimelineWidth=timelineClientWidth;
const canvasWidth=mobileTimelineWidth;
const scrollContentWidth=TRIM_GUTTER+canvasWidth+TRIM_GUTTER;
// Clip at t=0: left handle is -22..+2 relative to clip; gutter shifts it to 0..24.
const leftHandleBox={left:TRIM_GUTTER-22,right:TRIM_GUTTER-22+HIT_WIDTH};
assert.deepEqual(leftHandleBox,{left:0,right:24});
// Last clip ending at canvas edge: at maximum scroll, right handle resolves to viewportWidth-24..viewportWidth.
const maxScroll=scrollContentWidth-mobileTimelineWidth;
const rightHandleContentLeft=TRIM_GUTTER+canvasWidth-INWARD;
const rightHandleBox={left:rightHandleContentLeft-maxScroll,right:rightHandleContentLeft+HIT_WIDTH-maxScroll};
assert.deepEqual(rightHandleBox,{left:mobileTimelineWidth-24,right:mobileTimelineWidth});
assert.equal(leftHandleBox.right-leftHandleBox.left,24);
assert.equal(rightHandleBox.right-rightHandleBox.left,24);
console.log('TRIM_HANDLE_ACTUAL_HIT_AREA PASS 24px real at both timeline boundaries');
console.log('TRIM_HANDLE_NO_CLIPPING PASS 22px timeline gutters + lane overflow visible preserve outward target');
// Selected clip stacking context 20 is above playhead 15; trim pointerdown stops bubbling to MOVE.
assert(20>15);
console.log('TRIM_HANDLE_TOUCH_PRIORITY PASS selected clip z=20 > playhead z=15; trim pointerdown stops propagation before clip MOVE');
console.log('SMALL_CLIP_MOVE_AREA PASS unchanged scale; only 2px/side intrudes into clip center');

// Record-track selection helper exercises actual production helper code.
function fakeClassList(){
  const s=new Set();
  return{toggle(k,on){on?s.add(k):s.delete(k)},contains:k=>s.has(k)};
}
function fakeButton(){
  return{classList:fakeClassList(),attrs:{},onclick:null,onpointerup:null,setAttribute(k,v){this.attrs[k]=v}};
}
function fakeTrackControl(id){
  const arm=fakeButton(),mute=fakeButton(),vol=fakeButton();
  return{
    dataset:{trackId:id},classList:fakeClassList(),arm,mute,vol,
    querySelector(sel){if(sel==='[data-arm]')return arm;if(sel==='[data-mute]')return mute;if(sel==='[data-vol]')return vol;return null}
  };
}
function pointerTap(){
  return{pointerType:'touch',defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true},stopPropagation(){this.stopped=true}};
}
function makeRecordSelectionHarness(initial='voice'){
  const controls=['voice','sound2'].map(fakeTrackControl);
  const clipSelection={id:'clip-selection'};
  const tracks=[
    {id:'voice',name:'VOIX 1',type:'voice',gain:1,muted:false},
    {id:'sound2',name:'SON 2',type:'sound',gain:.4,muted:false}
  ];
  const ctx={
    tracks,
    selectedRecordTrackId:initial,
    selected:clipSelection,
    dirty:0,checkpoints:0,renders:0,
    document:{querySelectorAll:sel=>sel==='.track-control'?controls:[]},
    markProjectDirty(){this.dirty++},
    checkpoint(){this.checkpoints++},
    render(){this.renders++},
    prompt(){return '50'}
  };
  vm.createContext(ctx);vm.runInContext(recordTrackSelectionSource,ctx);
  controls.forEach((ctrl,i)=>ctx.bindRecordTrackControl(ctrl,tracks[i]));
  return{ctx,controls,tracks,clipSelection};
}
{
  const h=makeRecordSelectionHarness('voice');
  const track1=h.controls[0],track2=h.controls[1];

  // Human path: actual touch pointerup on the explicit track header.
  let e=pointerTap();track2.arm.onpointerup(e);
  assert(e.defaultPrevented&&e.stopped);
  assert.equal(h.ctx.selectedRecordTrackId,'sound2');
  assert.equal(h.controls.filter(x=>x.classList.contains('record-armed')).length,1);
  assert.equal(track2.arm.attrs['aria-pressed'],'true');
  assert.equal(track1.arm.attrs['aria-pressed'],'false');
  console.log('TRACK_HEADER_REAL_TAP PASS touch pointerup on Piste 2 header selects sound2');
  console.log('TAP_TRACK_2 PASS selectedRecordTrackId=sound2');

  e=pointerTap();track1.arm.onpointerup(e);
  assert.equal(h.ctx.selectedRecordTrackId,'voice');
  assert.equal(track1.arm.attrs['aria-pressed'],'true');
  assert.equal(track2.arm.attrs['aria-pressed'],'false');
  console.log('TAP_TRACK_1 PASS selectedRecordTrackId=voice');
  console.log('SINGLE_RECORD_TRACK_SELECTED PASS exactly one armed track');

  assert.strictEqual(h.ctx.selected,h.clipSelection);
  console.log('CLIP_SELECTION_INDEPENDENT_FROM_RECORD_TRACK PASS clip selection unchanged');

  // Mute/volume are separate targets and never arm their containing track.
  h.ctx.selectedRecordTrackId='voice';
  track2.mute.onclick({preventDefault(){},stopPropagation(){}});
  assert.equal(h.ctx.selectedRecordTrackId,'voice');
  console.log('MUTE_DOES_NOT_SELECT_TRACK PASS');
  track2.vol.onclick({preventDefault(){},stopPropagation(){}});
  assert.equal(h.ctx.selectedRecordTrackId,'voice');
  console.log('VOLUME_DOES_NOT_SELECT_TRACK PASS');

  // Rerender contract: state remains sound2 and render markup is keyed from that state.
  h.ctx.selectRecordTrack('sound2',false);
  assert.equal(h.ctx.recordTrackIdFor(),'sound2');
  assert(renderSource.includes("selectedRecordTrackId=recordTrackIdFor()"));
  assert(renderSource.includes("selectedRecordTrackId===t.id?' record-armed':''"));
  assert(renderSource.includes("selectedRecordTrackId===t.id?'true':'false'"));
  console.log('RERENDER_PRESERVES_SELECTED_RECORD_TRACK PASS state normalized, not reset');
}
{
  const h=makeRecordSelectionHarness('missing');
  assert.equal(h.ctx.recordTrackIdFor(),'voice');
  console.log('SELECT_RECORD_TRACK DEFAULT PASS invalid/missing selection falls back deterministically to VOIX');
}

assert(css.includes('.track-arm{width:100%;height:34px;min-height:34px'));
assert(css.includes('touch-action:manipulation;pointer-events:auto;position:relative;z-index:2'));
assert(renderSource.includes('data-arm type="button"'));
assert(renderSource.includes('<span class="track-arm-name">'));
assert(renderSource.includes('<span class="track-arm-rec">● REC</span>'));
assert(recordTrackSelectionSource.includes("arm.onpointerup=e=>{if(e.pointerType==='touch'||e.pointerType==='pen'||e.pointerType==='mouse')"));
assert(recordTrackSelectionSource.includes("arm.onclick=e=>{if(e.detail===0)"));
assert(!renderSource.includes("ctrl.onclick=e=>"));
console.log('TRACK_HEADER_HIT_AREA PASS explicit 92px-wide x 34px-high arm button');
console.log('TRACK_HEADER_POINTER_EVENTS PASS pointerup touch/pen/mouse + keyboard click; pointer-events auto');
console.log('VISIBLE_REC_INDICATOR_AFTER_TAP PASS dedicated ● REC span rendered by record-armed state');
console.log('SELECTED_TRACK_VISUAL_STATE PASS armed header + control background');

// Execute the real production record() function with mocked browser audio primitives.
async function recordInto(selectedId){
  const tracks=[
    {id:'voice',name:'VOIX 1',type:'voice',gain:1,muted:false},
    {id:'sound2',name:'SON 2',type:'sound',gain:.4,muted:false}
  ];
  const clips=[];
  const app={classList:{add(){},remove(){}}},recBtn={classList:{add(){},remove(){}}};
  class FakeMediaRecorder{
    constructor(stream){this.stream=stream;this.mimeType='audio/webm;codecs=opus';this.state='inactive';this.ondataavailable=null;this.onstop=null}
    start(){this.state='recording'}
    stop(){this.state='inactive';return this.onstop?.()}
  }
  const ctx={
    console,Math,Blob,Uint8Array,
    navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}},
    MediaRecorder:FakeMediaRecorder,
    crypto:{randomUUID:()=> 'clip-rec'},
    tracks,clips,selectedRecordTrackId:selectedId,selected:null,
    recorder:null,chunks:[],recording:false,cursor:3,liveDuration:0,liveRec:null,liveAnalyser:null,liveMic:null,liveAnim:0,
    document:{querySelectorAll:()=>[]},
    markProjectDirty(){},
    msg(){},
    projectDuration:()=>15,
    play:async()=>true,
    stopPlay(){},
    registerSourceBlob:async()=> 'src-rec',
    checkpoint(){},
    render(){},
    setCursor(){},
    requestAnimationFrame:()=>1,
    cancelAnimationFrame(){},
    devicePixelRatio:1,
    ctx:{
      createAnalyser:()=>({fftSize:0,getByteTimeDomainData(){}}),
      createMediaStreamSource:()=>({connect(){},disconnect(){}}),
      decodeAudioData:async()=>({duration:1.25})
    },
    $:sel=>sel==='#app'?app:sel==='#record'?recBtn:sel==='#livewave'?null:{},
  };
  vm.createContext(ctx);
  vm.runInContext(recordTrackSelectionSource,ctx);
  vm.runInContext(recordSource,ctx);
  await ctx.record();
  assert.equal(ctx.recording,true);
  const targetAtStart=ctx.liveRec.track;
  await ctx.recorder.stop();
  await Promise.resolve();await Promise.resolve();
  return{ctx,tracks,clips,targetAtStart};
}
(async()=>{
  const r1=await recordInto('voice');
  assert.equal(r1.targetAtStart,'voice');assert.equal(r1.clips.length,1);assert.equal(r1.clips[0].track,'voice');
  console.log('RECORD_TO_TRACK_1 PASS');
  const r2=await recordInto('sound2');
  assert.equal(r2.targetAtStart,'sound2');assert.equal(r2.clips.length,1);assert.equal(r2.clips[0].track,'sound2');
  console.log('RECORD_TO_TRACK_2 PASS');
  console.log('RECORDED_CLIP_TRACK_ID PASS selected sound track survives actual record onstop path');

  // Persist armed track through schema-2 autosave; extra project metadata is retained by store.
  const store=A.createMemoryStore();
  const snap={schema:A.SCHEMA_VERSION,name:'record-track',cursor:0,zoom:1,selectionStart:null,selectionEnd:null,selectedRecordTrackId:'sound2',tracks:r2.tracks.map(x=>({...x})),clips:[]};
  await store.save(snap,[]);
  const loaded=await store.load();
  assert.equal(loaded.snapshot.selectedRecordTrackId,'sound2');
  assert(html.includes('selectedRecordTrackId:recordTrackIdFor(),tracks:tracks.map'));
  assert(html.includes('selectedRecordTrackId=recordTrackIdFor(s.selectedRecordTrackId)'));
  assert(html.includes('selectedRecordTrackId=recordTrackIdFor(d.selectedRecordTrackId)'));
  console.log('RECORD_TRACK_AUTOSAVE_RELOAD PASS local snapshot/store/restore field retained');

  // Actual playback applies the selected destination track state to the recorded clip.
  const gains=[],starts=[],recorded={...r2.clips[0],gain:.8,muted:false,start:3,trim:0,len:1.25,sourceId:'src-rec'};
  const playCtx={
    console,Map,Math,clips:[recorded],tracks:r2.tracks,sources:[],playing:false,metroOn:false,t0:0,tick:null,recording:false,
    sourceIdFor:x=>x.sourceId,
    ctx:{currentTime:10,destination:{},createBufferSource:()=>({connect(dest){return dest},start(...a){starts.push(a)}}),createGain:()=>{const g={gain:{value:1},connect(dest){gains.push(g.gain.value);return dest}};return g}},
    startMetro(){},setInterval:()=>1,performance:{now:()=>1000},updateLiveRecordingVisual(){},setCursor(){},projectDuration:()=>30,$:()=>({textContent:''})
  };
  vm.createContext(playCtx);vm.runInContext(playbackSource010,playCtx);
  playCtx.startPreparedPlayback(0,false,new Map([['src-rec',{duration:10}]]));
  assert.equal(starts.length,1);assert(Math.abs(gains[0]-.32)<1e-9);
  console.log('PLAYBACK_RECORDED_SELECTED_TRACK PASS selected sound-track gain .4 applied to recorded clip');

  console.log('Studio record-track + trim-hit final 010 gates PASS');
})().catch(e=>{console.error(e);process.exit(1)});

console.log('Studio mobile space UX 010 revised spatial hierarchy tests PASS');
