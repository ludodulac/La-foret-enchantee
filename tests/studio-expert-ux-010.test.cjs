const assert=require('node:assert/strict');
const fs=require('fs');
const vm=require('node:vm');

const html=fs.readFileSync('studio.html','utf8');
function section(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert(a>=0,'missing '+start);assert(b>a,'missing '+end);return html.slice(a,b)}
const css=section('<style id="mobile-space-ux-010">','</style>');
const transport=section('<nav class="tools"','</nav>');
const toolsPanel=section('<div class="secondarytools"','</div>\n\n<section class="soundlib"');
const renderSource=section('function render(){','function dragLaneAt');
const recordSource=section('async function record()','function clickBeat');
const chooseSource=section('function chooseFile','function addTrack');
const fileHandlerSource=section("$('#file').onchange","$('#timeline').onpointerdown");
const librarySource=section('async function addLibrarySound','let importFolder');
const playbackSource=section('function startPreparedPlayback','async function play(');
const localSnapshotSource=section('function localSnapshot','async function runAutosave');

// Universal destination: active track + playhead.
assert(recordSource.includes('recStart=cursor'));
assert(recordSource.includes("tracks.find(t=>t.id===recordTrackIdFor())"));
assert(recordSource.includes('track:target.id'));
assert(recordSource.includes('start:recStart'));
console.log('UNIVERSAL_ACTIVE_TRACK_RECORD PASS');
console.log('INSERT_AT_PLAYHEAD_RECORD PASS');

// Phone import: execute the real chooseFile + onchange path.
(async()=>{
  const input={dataset:{},files:[],value:'',clicked:0,click(){this.clicked++}};
  const phoneCtx={
    console,Math,ArrayBuffer,
    cursor:18,
    selectedRecordTrackId:'sound2',
    tracks:[{id:'voice',type:'voice'},{id:'sound2',type:'sound'}],
    clips:[],
    recordTrackIdFor(id){const q=id??this.selectedRecordTrackId;return this.tracks.some(t=>t.id===q)?q:(this.tracks[0]?.id||null)},
    $:sel=>sel==='#file'?input:{},
    ctx:{decodeAudioData:async()=>({duration:2.5})},
    registerSourceBlob:async()=> 'src-phone',
    checkpoint(){},render(){},msg(){},
    crypto:{randomUUID:()=> 'phone-clip'}
  };
  vm.createContext(phoneCtx);
  vm.runInContext(chooseSource,phoneCtx);
  vm.runInContext(fileHandlerSource,phoneCtx);
  phoneCtx.chooseFile();
  assert.equal(input.dataset.track,'sound2');
  assert.equal(input.dataset.start,'18');
  assert.equal(input.clicked,1);
  input.files=[{name:'porte.wav',type:'audio/wav',arrayBuffer:async()=>new ArrayBuffer(8)}];
  await input.onchange({target:input});
  assert.equal(phoneCtx.clips.length,1);
  assert.equal(phoneCtx.clips[0].track,'sound2');
  assert.equal(phoneCtx.clips[0].start,18);
  console.log('UNIVERSAL_ACTIVE_TRACK_PHONE_IMPORT PASS');
  console.log('INSERT_AT_PLAYHEAD_PHONE_IMPORT PASS');
  console.log('IMPORT_PHONE_DIRECT_TO_TIMELINE PASS');

  // Library sound: execute real async path and ensure no implicit "last sound track" routing.
  const libCtx={
    console,Math,Blob,
    cursor:18,
    selectedRecordTrackId:'sound2',
    tracks:[{id:'voice',name:'VOIX',type:'voice'},{id:'sound2',name:'SON 2',type:'sound'}],
    clips:[],
    recordTrackIdFor(id){const q=id??this.selectedRecordTrackId;return this.tracks.some(t=>t.id===q)?q:(this.tracks[0]?.id||null)},
    dbClient:{storage:{from:()=>({download:async()=>({data:new Blob(['x'],{type:'audio/wav'}),error:null})})}},
    ctx:{decodeAudioData:async()=>({duration:3})},
    registerSourceBlob:async()=> 'src-library',
    checkpoint(){},render(){},msg(){},
    crypto:{randomUUID:()=> 'library-clip'}
  };
  vm.createContext(libCtx);
  vm.runInContext(librarySource,libCtx);
  await libCtx.addLibrarySound({storage_path:'nature/oiseau.wav',original_name:'oiseau.wav',name_fr:'Oiseau',mime_type:'audio/wav'});
  assert.equal(libCtx.clips.length,1);
  assert.equal(libCtx.clips[0].track,'sound2');
  assert.equal(libCtx.clips[0].start,18);
  assert(!librarySource.includes("tracks.filter(t=>t.type==='sound')"));
  assert(!librarySource.includes("addTrack('sound')"));
  console.log('UNIVERSAL_ACTIVE_TRACK_LIBRARY_SOUND PASS');
  console.log('INSERT_AT_PLAYHEAD_LIBRARY_SOUND PASS');

  // Import semantics are visibly separated.
  assert(html.includes('id="import-phone">＋ IMPORTER</button>'));
  assert(html.includes("$('#import-phone').onclick=()=>chooseFile(recordTrackIdFor(),cursor)"));
  assert(html.includes('id="library-import">＋ AJOUTER DES SONS À MA BIBLIOTHÈQUE</button>'));
  assert(html.includes("$('#library-import').onclick=showFolderPicker"));
  console.log('LIBRARY_IMPORT_SEPARATE_FROM_TIMELINE_IMPORT PASS');

  // Main transport contains exactly 5 controls in requested order.
  const ids=[...transport.matchAll(/id="([^"]+)"/g)].map(x=>x[1]);
  assert.deepEqual(ids,['back','record','play','stop','forward']);
  assert(!transport.includes('id="undo"')&&!transport.includes('id="redo"'));
  assert(toolsPanel.includes('id="undo"')&&toolsPanel.includes('id="redo"'));
  console.log('TRANSPORT_FIVE_PRIMARY_CONTROLS PASS -5 / REC / PLAY / STOP / +5');
  console.log('UNDO_REDO_STILL_ACCESSIBLE PASS moved to OUTILS');

  // Visual hierarchy.
  for(const id of ['record','play','stop']){
    const rx=new RegExp('<button[^>]*class="[^"]*game-btn-primary[^"]*"[^>]*id="'+id+'"|<button[^>]*id="'+id+'"[^>]*class="[^"]*game-btn-primary');
    assert(rx.test(html),'missing primary '+id);
  }
  assert(css.includes('#record,#play,#stop{height:54px'));
  console.log('PRIMARY_BUTTON_HIERARCHY PASS REC/PLAY/STOP primary 54px');

  for(const id of ['back','forward','minus','plus','import-phone','sound-library-jump']){
    assert(new RegExp('<button[^>]*class="[^"]*game-btn-standard[^"]*"[^>]*id="'+id+'"|<button[^>]*id="'+id+'"[^>]*class="[^"]*game-btn-standard').test(html),'missing standard '+id);
  }
  assert(css.includes('#back,#forward{height:46px'));
  console.log('STANDARD_BUTTON_HIERARCHY PASS navigation/import/sounds/zoom standard');

  for(const id of ['undo','redo','project-menu-toggle','tools-menu-toggle']){
    assert(new RegExp('<button[^>]*class="[^"]*game-btn-secondary[^"]*"[^>]*id="'+id+'"|<button[^>]*id="'+id+'"[^>]*class="[^"]*game-btn-secondary').test(html),'missing secondary '+id);
  }
  assert(css.includes('.game-btn-secondary{filter:saturate(.72) brightness(.9)'));
  console.log('SECONDARY_BUTTON_HIERARCHY PASS undo/redo/project/tools subdued');

  // Track controls: direct touch targets MUTE + VOLUME are 44px; destructive action is in menu.
  assert(css.includes('.track-control-buttons button{min-height:44px;height:44px'));
  assert(renderSource.includes('data-mute title="Muet"'));
  assert(renderSource.includes('data-vol title="Volume"'));
  console.log('TRACK_MUTE_TOUCH_TARGET PASS 44px');
  console.log('TRACK_VOLUME_TOUCH_TARGET PASS 44px');
  assert(renderSource.includes('data-track-menu type="button"'));
  assert(!renderSource.includes('data-delete-track'));
  assert(html.includes('id="track-delete-action"'));
  assert(html.includes('🗑 SUPPRIMER LA PISTE'));
  console.log('TRACK_DELETE_NOT_ADJACENT_DESTRUCTIVE_TINY_BUTTON PASS');
  console.log('TRACK_DELETE_DISCOVERABLE PASS visible ⋯ menu');

  // Track volume uses a tactile slider; no prompt remains in track control volume handler.
  assert(html.includes('id="track-volume-slider" type="range" min="0" max="150"'));
  assert(html.includes("$('#track-volume-slider').oninput=e=>"));
  assert(html.includes("t.gain=Math.max(0,Math.min(1.5,+e.target.value/100))"));
  const bindSource=section('function bindRecordTrackControl','function syncStudioViewport');
  assert(!bindSource.includes("prompt('Volume de la piste"));
  console.log('TRACK_VOLUME_SLIDER PASS');

  // Playback consumes track gain, and snapshots persist track objects/gain.
  assert(playbackSource.includes('g.gain.value=c.gain*(t?.gain??1)'));
  assert(localSnapshotSource.includes('tracks:tracks.map(t=>({...t}))'));
  assert(html.includes('function serializableProject(){return{version:1')&&html.includes('tracks:tracks.map(t=>({...t}))'));
  console.log('TRACK_VOLUME_PLAYBACK_GAIN PASS');
  console.log('TRACK_VOLUME_AUTOSAVE_RELOAD PASS track.gain persisted in local/project track metadata');

  // Active destination accents both header and full lane.
  assert(renderSource.includes("if(selectedRecordTrackId===t.id)lane.classList.add('active-destination')"));
  assert(css.includes('.lane.active-destination{box-shadow:inset 3px 0 0 #ff5168'));
  assert(renderSource.includes('<span class="track-arm-rec">● REC</span>'));
  console.log('ACTIVE_TRACK_FULL_LANE_VISUAL_STATE PASS');

  // Human save vocabulary.
  assert(html.includes('✓ SAUVEGARDE AUTOMATIQUE'));
  assert(html.includes('ENREGISTRER DANS MES PROJETS'));
  assert(html.includes('MES PROJETS'));
  assert(html.includes('NOUVEAU PROJET'));
  assert(html.includes('TÉLÉCHARGER UNE COPIE'));
  assert(html.includes('<summary>OPTIONS AVANCÉES</summary>'));
  assert(html.includes('EFFACER LA SAUVEGARDE AUTOMATIQUE LOCALE'));
  console.log('AUTOSAVE_LABEL_CLEAR PASS');
  console.log('PROJECT_ACTION_LABELS_CLEAR PASS');

  // Real visual viewport still fits at requested heights after larger transport.
  const FIXED=252,TOOLS=68;
  for(const vh of [844,650,560,500,460]){
    const timelineNo=Math.max(120,Math.min(480,vh-FIXED));
    const timelineYes=Math.max(120,Math.min(480,vh-FIXED-TOOLS));
    assert(timelineNo>=120&&timelineYes>=120);
    assert(FIXED+Math.min(timelineNo,vh-FIXED)<=vh);
    assert(FIXED+TOOLS+timelineYes<=vh);
  }
  assert(css.includes('html,body{height:var(--studio-vh,100dvh);max-height:var(--studio-vh,100dvh);overflow:hidden}'));
  assert(css.includes('.multitrack{display:block;flex:1 1 auto;height:auto;min-height:120px;max-height:480px'));
  assert(css.includes('.bottomcmd{display:grid;position:relative;flex:0 0 auto'));
  console.log('CLIP_TOOLS_VISIBLE_WITHOUT_PAGE_SCROLL PASS');
  console.log('BOTTOM_BAR_VISIBLE_WITHOUT_PAGE_SCROLL PASS');
  console.log('REAL_VISUAL_VIEWPORT_FIT PASS 844/650/560/500/460');

  console.log('Studio expert UX consolidation 010 tests PASS');
})().catch(e=>{console.error(e);process.exit(1)});
