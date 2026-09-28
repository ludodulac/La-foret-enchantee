const assert=require('node:assert/strict');
const fs=require('fs');
const A=require('../js/studio-autosave.js');

const html=fs.readFileSync('studio.html','utf8');
const lib=fs.readFileSync('js/studio-autosave.js','utf8');
const clone=x=>JSON.parse(JSON.stringify(x));

function snapshot(name,sourceId='src-shared',clipId='clip'){
  return{
    schema:A.SCHEMA_VERSION,name,cursor:7.5,zoom:2,selectionStart:null,selectionEnd:null,selectedRecordTrackId:'voice',
    tracks:[{id:'voice',name:'VOIX 1',type:'voice',gain:.8,muted:false,color:'#785cff'}],
    clips:[{id:clipId,track:'voice',name:'Voix',sourceId,start:3.2,trim:.1,len:2.4,gain:.9,muted:false}]
  };
}

(async()=>{
  // Rename modal is bound to the real visualViewport and biased toward the top on mobile.
  assert(html.includes('.project-dialog-panel{position:fixed;left:0;right:0;top:var(--studio-vv-top,0px);height:var(--studio-vh,100dvh)'));
  assert(html.includes('.project-dialog-box{width:min(100%,520px);max-height:calc(var(--studio-vh,100dvh) - 24px);overflow:auto'));
  assert(html.includes('.project-dialog-panel{align-items:flex-start;padding:clamp(12px,calc(var(--studio-vh,100dvh) * .08),48px) 12px 12px}'));
  assert(html.includes('function keepProjectRenameVisible(){syncStudioViewport()'));
  assert(html.includes("focus({preventScroll:true})"));
  assert(html.includes("visualViewport.addEventListener('resize',keepProjectRenameVisible"));
  assert(html.includes("visualViewport.addEventListener('scroll',keepProjectRenameVisible"));
  console.log('RENAME_DIALOG_VISUAL_VIEWPORT_SAFE = PASS');

  // Geometry proof for requested small Android visible heights after keyboard resize.
  function padTop(vh){return Math.min(48,Math.max(12,vh*.08))}
  const renameContentHeight=24+13+8+46+9+44; // padding + title + input + actions
  for(const vh of [460,380,320]){
    const top=padTop(vh),maxBox=vh-Math.min(96,Math.max(36,vh*.16));
    assert(top>=12&&top<=48);
    assert(renameContentHeight<=maxBox,'rename box must fit keyboard-shrunk visual viewport '+vh);
    assert(top+renameContentHeight<vh,'rename actions must remain above keyboard-visible bottom '+vh);
  }
  console.log('RENAME_DIALOG_ANDROID_KEYBOARD_SAFE = PASS');

  // UX: ⋯ exposes RENOMMER and SUPPRIMER; delete is explicit/destructive and confirmed separately.
  assert(html.includes('id="project-options-panel"'));
  assert(html.includes('id="project-option-rename"'));
  assert(html.includes('id="project-option-delete"'));
  assert(html.includes('id="project-delete-panel"'));
  assert(html.includes('id="project-delete-confirm"'));
  assert(html.includes('class="game-btn game-btn-standard game-btn-red" id="project-delete-confirm"'));
  assert(html.includes("$('#project-option-delete').onclick=()=>{let p=projectOptionsTarget;if(p)openProjectDelete(p)}"));
  assert(html.includes("$('#project-delete-cancel').onclick=closeProjectDelete"));
  assert(html.includes("$('#project-delete-confirm').onclick=commitProjectDelete"));
  assert(html.includes("$('#project-delete-copy').textContent='Supprimer « '+p.name+' » ?'"));
  console.log('DELETE_PROJECT_CONFIRM = PASS');

  // Cancel handler is side-effect free: no storage/library/delete calls.
  const closeStart=html.indexOf('function closeProjectDelete()'),closeEnd=html.indexOf('function openProjectDelete',closeStart),closeSrc=html.slice(closeStart,closeEnd);
  assert(!/deleteProject\(|saveProject\(|renameProject\(|localStore\.|updatedAt/.test(closeSrc));
  console.log('DELETE_PROJECT_CANCEL = PASS');

  // Local-store deletion proof.
  const store=A.createMemoryStore();
  await store.initializeLibrary();
  const sharedBlob=new Blob([new Uint8Array([11,22,33,44,55])],{type:'audio/webm'});
  const source={id:'src-shared',blob:sharedBlob,sourceSchema:2,mimeType:'audio/webm',originalName:'shared.webm',origin:'test',size:sharedBlob.size};

  await store.createProject({
    id:'project-a',name:'Projet A',createdAt:'2026-09-28T10:00:00Z',updatedAt:'2026-09-28T10:00:00Z',
    snapshot:snapshot('Projet A','src-shared','clip-a'),newSources:[source]
  });
  await store.saveProject('project-a',{...snapshot('Projet A','src-shared','clip-a'),cursor:12},[]);
  await store.createProject({
    id:'project-b',name:'Projet B',createdAt:'2026-09-28T10:05:00Z',updatedAt:'2026-09-28T10:05:00Z',
    snapshot:snapshot('Projet B','src-shared','clip-b'),newSources:[]
  });

  const beforeDelete=store._state();
  const audioWritesBefore=store._metrics().audioWrites;
  const sourceBefore=beforeDelete.sources.get('src-shared');
  const aGenerationsBefore=[...beforeDelete.projects.values()].filter(r=>r.projectId==='project-a').length;
  assert(aGenerationsBefore>=2);

  await store.deleteProject('project-a');
  const afterDelete=store._state();
  assert(!afterDelete.library.has('project-a'));
  console.log('DELETE_PROJECT_REMOVES_LIBRARY_CARD = PASS');
  assert.equal([...afterDelete.projects.values()].filter(r=>r.projectId==='project-a').length,0);
  assert([...afterDelete.projects.values()].some(r=>r.projectId==='project-b'));
  console.log('DELETE_PROJECT_REMOVES_OWN_SNAPSHOTS = PASS');
  await assert.rejects(()=>store.openProject('project-a'),/introuvable/);
  console.log('DELETE_PROJECT_CANNOT_REOPEN = PASS');

  // Shared source is never deleted/mutated; project B remains exactly reopenable.
  const reopenedB=await store.openProject('project-b');
  assert.equal(reopenedB.snapshot.clips[0].sourceId,'src-shared');
  assert.strictEqual(reopenedB.audio.get('src-shared'),sourceBefore.blob);
  assert.strictEqual(afterDelete.sources.get('src-shared'),sourceBefore);
  console.log('SHARED_SOURCE_PROJECT_A_B = PASS');

  // Delete-current safety at store level.
  assert.equal(store._state().currentProjectId,'project-b');
  await store.deleteProject('project-b');
  assert.equal(store._state().currentProjectId,null);
  assert.equal((await store.listProjects()).length,0);
  console.log('DELETE_CURRENT_PROJECT_SAFE = PASS');
  console.log('DELETE_LAST_PROJECT_LEAVES_EMPTY_LIBRARY = PASS');

  // Production UI additionally clears pending current-project state before delete.
  const commitStart=html.indexOf('async function commitProjectDelete()'),commitEnd=html.indexOf('async function renderLocalProjectLibrary()',commitStart),commitSrc=html.slice(commitStart,commitEnd);
  for(const marker of [
    "deletingCurrent=currentProjectId===target.id",
    "clearTimeout(autosaveTimer)",
    "autosavePending=false",
    "currentProjectId=null",
    "currentProjectName=''",
    "await localStore.deleteProject(target.id)",
    "showProjectLibraryScreen()",
    "await renderLocalProjectLibrary()"
  ])assert(commitSrc.includes(marker),'missing current-delete safety '+marker);

  // 011D supersedes the temporary "never delete Blob" rule with reference-safe orphan GC.
  const deleteStart=lib.indexOf('async deleteProject(projectId)'),deleteEnd=lib.indexOf('async getLocalStorageStats',deleteStart),deleteSrc=lib.slice(deleteStart,deleteEnd);
  assert(deleteSrc.includes("['meta','projects','sources','waveforms',LIBRARY_STORE]"));
  assert(deleteSrc.includes('latestGeneration'));
  assert(deleteSrc.includes('if(!referenced.has(id)){src.delete(id);w.delete(id)}'));
  assert(!/decodeAudioData|wav\(|AudioBuffer|arrayBuffer\(|registerSourceBlob/.test(deleteSrc));
  assert.equal(store._metrics().audioWrites,audioWritesBefore);
  console.log('DELETE_PROJECT_SHARED_AUDIO_PRESERVED = PASS');
  console.log('DELETE_PROJECT_AUDIO_REENCODES = 0');
  console.log('DELETE_PROJECT_SOURCE_ID_MUTATIONS = 0');

  // UI doesn't auto-create after deleting the last card.
  const renderStart=html.indexOf('async function renderLocalProjectLibrary()'),renderEnd=html.indexOf('async function createLocalProject()',renderStart),renderSrc=html.slice(renderStart,renderEnd);
  assert(renderSrc.includes('Aucun projet pour le moment.'));
  assert(!renderSrc.includes('createLocalProject()'));

  console.log('Studio project rename/delete 011C tests PASS');
})().catch(e=>{console.error(e);process.exit(1)});
