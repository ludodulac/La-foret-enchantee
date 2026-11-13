// ============================================================
// admin.js — Tableau de bord administrateur
// ============================================================

let categories = [];
let subcategories = [];
let audios = [];

document.addEventListener('DOMContentLoaded', async () => {
  const session = await requireAuth();
  if (!session) return;
  await refreshData();
  setupTabs();
  setupForms();
  setupEditForm();
  renderAll();
});

async function refreshData() {
  const [cats, subs, auds] = await Promise.all([
    dbClient.from('categories').select('*').order('name'),
    dbClient.from('subcategories').select('*').order('name'),
    dbClient.from('audios').select('*').order('created_at', { ascending: false }),
  ]);
  const error = cats.error || subs.error || auds.error;
  if (error) {
    showNotif('Erreur de chargement : ' + error.message, 'error');
    return;
  }
  categories = cats.data ?? [];
  subcategories = subs.data ?? [];
  audios = auds.data ?? [];
}

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab)?.classList.add('active');
    });
  });
}

function renderAll() {
  renderCatList();
  renderSubList();
  renderAudioList();
  populateCatSelects();
}

function sameId(a, b) {
  return String(a ?? '') === String(b ?? '');
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
  }[char]));
}

function renderCatList() {
  const list = document.getElementById('cat-list');
  if (!list) return;
  if (!categories.length) {
    list.innerHTML = '<p class="empty-msg">Aucune catégorie.</p>';
    return;
  }
  list.innerHTML = categories.map(cat => {
    const count = audios.filter(a => sameId(a.category_id, cat.id)).length;
    return `<div class="admin-row">
      <span class="row-name">${escapeHtml(cat.name)}</span>
      <span class="row-meta">${count} histoire${count !== 1 ? 's' : ''}</span>
      <div class="row-actions">
        <button class="btn-sm btn-edit" type="button" data-edit-cat="${escapeHtml(cat.id)}">Modifier</button>
        <button class="btn-sm btn-del" type="button" data-delete-cat="${escapeHtml(cat.id)}">Supprimer</button>
      </div>
    </div>`;
  }).join('');
  list.querySelectorAll('[data-edit-cat]').forEach(btn => btn.addEventListener('click', () => {
    const cat = categories.find(item => sameId(item.id, btn.dataset.editCat));
    if (cat) editCat(cat.id, cat.name);
  }));
  list.querySelectorAll('[data-delete-cat]').forEach(btn => btn.addEventListener('click', () => deleteCat(btn.dataset.deleteCat)));
}

async function addCategory(name) {
  const { error } = await dbClient.from('categories').insert({ name });
  if (error) return showNotif('Erreur : ' + error.message, 'error');
  showNotif('Catégorie ajoutée ✓');
  await refreshData();
  renderAll();
}

async function editCat(id, oldName) {
  const name = prompt('Nouveau nom :', oldName);
  if (!name || name.trim() === oldName) return;
  const { error } = await dbClient.from('categories').update({ name: name.trim() }).eq('id', id);
  if (error) return showNotif('Erreur : ' + error.message, 'error');
  showNotif('Catégorie modifiée ✓');
  await refreshData();
  renderAll();
}

async function deleteCat(id) {
  const attached = audios.filter(audio => sameId(audio.category_id, id)).length;
  const message = attached
    ? `Cette catégorie contient ${attached} audio${attached > 1 ? 's' : ''}. La supprimer peut échouer tant que ces audios y sont liés. Continuer ?`
    : 'Supprimer cette catégorie ?';
  if (!confirm(message)) return;
  const { error } = await dbClient.from('categories').delete().eq('id', id);
  if (error) return showNotif('Erreur : ' + error.message, 'error');
  showNotif('Catégorie supprimée');
  await refreshData();
  renderAll();
}

function renderSubList() {
  const list = document.getElementById('sub-list-admin');
  if (!list) return;
  if (!subcategories.length) {
    list.innerHTML = '<p class="empty-msg">Aucune sous-catégorie.</p>';
    return;
  }
  list.innerHTML = subcategories.map(sub => {
    const cat = categories.find(c => sameId(c.id, sub.category_id));
    const count = audios.filter(a => sameId(a.subcategory_id, sub.id)).length;
    return `<div class="admin-row">
      <span class="row-name">${escapeHtml(sub.name)}</span>
      <span class="row-meta">${escapeHtml(cat?.name ?? '—')} · ${count} histoire${count !== 1 ? 's' : ''}</span>
      <div class="row-actions">
        <button class="btn-sm btn-edit" type="button" data-edit-sub="${escapeHtml(sub.id)}">Modifier</button>
        <button class="btn-sm btn-del" type="button" data-delete-sub="${escapeHtml(sub.id)}">Supprimer</button>
      </div>
    </div>`;
  }).join('');
  list.querySelectorAll('[data-edit-sub]').forEach(btn => btn.addEventListener('click', () => {
    const sub = subcategories.find(item => sameId(item.id, btn.dataset.editSub));
    if (sub) editSub(sub.id, sub.name);
  }));
  list.querySelectorAll('[data-delete-sub]').forEach(btn => btn.addEventListener('click', () => deleteSub(btn.dataset.deleteSub)));
}

async function addSubcategory(name, categoryId) {
  const { error } = await dbClient.from('subcategories').insert({ name, category_id: categoryId });
  if (error) return showNotif('Erreur : ' + error.message, 'error');
  showNotif('Sous-catégorie ajoutée ✓');
  await refreshData();
  renderAll();
}

async function editSub(id, oldName) {
  const name = prompt('Nouveau nom :', oldName);
  if (!name || name.trim() === oldName) return;
  const { error } = await dbClient.from('subcategories').update({ name: name.trim() }).eq('id', id);
  if (error) return showNotif('Erreur : ' + error.message, 'error');
  showNotif('Sous-catégorie modifiée ✓');
  await refreshData();
  renderAll();
}

async function deleteSub(id) {
  if (!confirm('Supprimer cette sous-catégorie ?')) return;
  const { error } = await dbClient.from('subcategories').delete().eq('id', id);
  if (error) return showNotif('Erreur : ' + error.message, 'error');
  showNotif('Sous-catégorie supprimée');
  await refreshData();
  renderAll();
}

function formatAdminDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return 'Durée inconnue';
  const whole = Math.floor(value);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function renderAudioList() {
  const list=document.getElementById('audio-list-admin');
  const draftsSection=document.getElementById('audio-drafts-section');
  const draftList=document.getElementById('audio-drafts-admin');
  const draftCount=document.getElementById('audio-draft-count');
  if(!list)return;
  const waiting=audios.filter(audio=>audio.is_published===false);
  const published=audios.filter(audio=>audio.is_published!==false);
  if(draftsSection)draftsSection.hidden=waiting.length===0;
  if(draftCount)draftCount.textContent=waiting.length?'('+waiting.length+')':'';
  function rows(items){
    return items.map(audio=>{
      const category=categories.find(cat=>sameId(cat.id,audio.category_id));
      const sub=subcategories.find(sub=>sameId(sub.id,audio.subcategory_id));
      const cover=audio.image_path?getPublicUrl('images',audio.image_path):'';
      const isDraft=audio.is_published===false;
      const safeId=escapeHtml(audio.id);
      return `<div class="admin-row">
        <div class="admin-audio-identity">${cover?`<img class="admin-audio-thumb" src="${escapeHtml(cover)}" alt="">`:'<div class="admin-audio-thumb placeholder" aria-hidden="true">⌁</div>'}<span class="admin-audio-title">${escapeHtml(audio.title)}</span></div>
        <span class="row-meta">${escapeHtml(category?.name??'Sans catégorie')}${sub?' › '+escapeHtml(sub.name):''} · <span class="admin-audio-duration">${formatAdminDuration(audio.duration)}</span></span>
        <div class="row-actions">
          <button class="btn-sm btn-edit" type="button" data-edit-audio="${safeId}">${isDraft?'Classer':'Modifier'}</button>
          ${isDraft?`<button class="btn-sm btn-publish-audio" type="button" data-publish-audio="${safeId}" ${!category?'disabled title="Choisir une catégorie avant de publier"':''}>Publier</button>`:''}
          <button class="btn-sm btn-del" type="button" data-delete-audio="${safeId}">Supprimer</button>
        </div>
      </div>`;
    }).join('');
  }
  list.innerHTML=published.length?rows(published):'<p class="empty-msg">Aucune histoire publiée.</p>';
  if(draftList)draftList.innerHTML=rows(waiting);
  for(const container of [list,draftList].filter(Boolean)){
    container.querySelectorAll('[data-edit-audio]').forEach(btn=>btn.addEventListener('click',()=>openEditAudio(btn.dataset.editAudio)));
    container.querySelectorAll('[data-delete-audio]').forEach(btn=>btn.addEventListener('click',()=>{
      const audio=audios.find(item=>sameId(item.id,btn.dataset.deleteAudio));
      if(audio)deleteAudio(audio.id,audio.image_path,audio.audio_path);
    }));
    container.querySelectorAll('[data-publish-audio]').forEach(btn=>btn.addEventListener('click',async()=>{
      const audio=audios.find(item=>sameId(item.id,btn.dataset.publishAudio));
      if(!audio||audio.is_published!==false)return;
      if(!audio.category_id)return showNotif('Choisis une catégorie et enregistre avant de publier.','error');
      if(!confirm('Rendre cette histoire visible sur le site Ludodio ?'))return;
      btn.disabled=true;
      try{
        const {data,error}=await dbClient.from('audios').update({is_published:true})
          .eq('id',audio.id).eq('is_published',false).select('id,is_published').single();
        if(error||!data?.id||data.is_published!==true)throw error||Error('Publication non confirmée');
        showNotif('Histoire publiée sur Ludodio ✓');
        await refreshData();
        renderAll();
      }catch(error){
        btn.disabled=false;
        showNotif('Publication impossible : '+(error?.message||String(error)),'error');
      }
    }));
  }
}
function setupForms() {
  document.getElementById('form-add-cat')?.addEventListener('submit', async e => {
    e.preventDefault();
    const input = document.getElementById('new-cat-name');
    const name = input.value.trim();
    if (!name) return;
    await addCategory(name);
    e.target.reset();
  });

  document.getElementById('form-add-sub')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('new-sub-name').value.trim();
    const catId = document.getElementById('new-sub-cat').value || null;
    if (!name || !catId) return;
    await addSubcategory(name, catId);
    e.target.reset();
  });

  document.getElementById('form-add-audio')?.addEventListener('submit', handleAddAudio);
  document.getElementById('audio-cat')?.addEventListener('change', e => updateSubSelect('audio-sub', e.target.value || null));
  document.getElementById('edit-audio-cat')?.addEventListener('change', e => updateSubSelect('edit-audio-sub', e.target.value || null));
}

function populateCatSelects() {
  ['new-sub-cat', 'audio-cat', 'edit-audio-cat'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const val = sel.value;
    sel.innerHTML = '<option value="">— Catégorie —</option>';
    categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      if (sameId(c.id, val)) opt.selected = true;
      sel.appendChild(opt);
    });
  });
  updateSubSelect('audio-sub', document.getElementById('audio-cat')?.value || null);
  updateSubSelect('edit-audio-sub', document.getElementById('edit-audio-cat')?.value || null);
}

function updateSubSelect(selId, catId) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const val = sel.value;
  sel.innerHTML = '<option value="">— Sous-catégorie (optionnel) —</option>';
  subcategories
    .filter(s => !catId || sameId(s.category_id, catId))
    .forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      if (sameId(s.id, val)) opt.selected = true;
      sel.appendChild(opt);
    });
}

async function uploadFile(bucket, path, file) {
  // Only stories and their covers move to R2. Blog and other assets are unchanged.
  if (bucket === 'audios' || bucket === 'images') {
    if (!window.ForestR2Media) throw Error('Le module Cloudflare des contes est indisponible.');
    return window.ForestR2Media.upload(dbClient, bucket, file);
  }
  const { error } = await dbClient.storage.from(bucket).upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

async function removeFiles(entries) {
  const oldBuckets = {};
  const tasks = [];
  for (const item of entries.filter(entry => entry?.path)) {
    // Une référence vers Espace Jeunesse ne nous appartient pas : ne jamais supprimer son fichier R2.
    if (/^ej:[0-9a-f-]{36}$/i.test(item.path)) continue;
    if (item.path.startsWith('r2:')) {
      if (!window.ForestR2Media?.isR2Path(item.path)) {
        tasks.push(Promise.reject(Error('Référence R2 invalide : suppression refusée')));
        continue;
      }
      tasks.push(window.ForestR2Media.remove(dbClient, item.path));
    } else {
      (oldBuckets[item.bucket] ||= []).push(item.path);
    }
  }
  for (const [bucket, paths] of Object.entries(oldBuckets)) {
    tasks.push(dbClient.storage.from(bucket).remove(paths).then(({ error }) => {
      if (error) throw error;
    }));
  }
  const results = await Promise.allSettled(tasks);
  const failed = results.some(result => result.status === 'rejected');
  if (failed) console.warn('Certains anciens médias n’ont pas pu être nettoyés.', results);
  return !failed;
}

function makeStoragePath(title, filename) {
  const ext = String(filename || '').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  return `${Date.now()}-${crypto.randomUUID()}-${slugify(title)}.${ext}`;
}

async function handleAddAudio(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-add-audio');
  btn.disabled = true;
  btn.textContent = 'Envoi en cours…';
  const uploaded = [];

  try {
    const title = document.getElementById('audio-title-in').value.trim();
    const description = document.getElementById('audio-desc-in').value.trim();
    const catId = document.getElementById('audio-cat').value || null;
    const subId = document.getElementById('audio-sub').value || null;
    const imgFile = document.getElementById('audio-img').files[0];
    const audFile = document.getElementById('audio-file').files[0];
    const espaceJeunesseId = window.EJAudioPicker?.selectedId?.() || '';

    if (!title || (!audFile && !espaceJeunesseId)) throw new Error('Titre et fichier audio requis.');

    let imagePath = null;
    if (imgFile) {
      imagePath = await uploadFile('images', makeStoragePath(title, imgFile.name), imgFile);
      uploaded.push({ bucket: 'images', path: imagePath });
    }

    // Mode lien : conserver seulement l'UUID, aucun second import audio.
    const audPath = audFile
      ? await uploadFile('audios', makeStoragePath(title, audFile.name), audFile)
      : 'ej:' + espaceJeunesseId;
    if (audFile) uploaded.push({ bucket: 'audios', path: audPath });
    const duration = audFile ? await getAudioDuration(audFile) : null;
    const { error: dbErr } = await dbClient.from('audios').insert({
      title,
      description: description || null,
      category_id: catId,
      subcategory_id: subId,
      image_path: imagePath,
      audio_path: audPath,
      duration: Math.floor(duration) || null,
    });
    if (dbErr) throw dbErr;

    uploaded.length = 0;
    showNotif('Audio ajouté avec succès ✓');
    e.target.reset();
    await refreshData();
    renderAll();
  } catch (err) {
    if (uploaded.length) await removeFiles(uploaded);
    showNotif('Erreur : ' + (err.message ?? err), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = "Ajouter l'audio";
  }
}

function openEditAudio(id) {
  const audio = audios.find(a => sameId(a.id, id));
  if (!audio) return;
  document.getElementById('edit-panel').style.display = 'block';
  document.getElementById('edit-audio-id').value = audio.id;
  document.getElementById('edit-audio-title').value = audio.title;
  document.getElementById('edit-audio-desc').value = audio.description ?? '';
  document.getElementById('edit-audio-cat').value = audio.category_id ?? '';
  updateSubSelect('edit-audio-sub', audio.category_id);
  document.getElementById('edit-audio-sub').value = audio.subcategory_id ?? '';

  const cat = categories.find(c => sameId(c.id, audio.category_id));
  const sub = subcategories.find(item => sameId(item.id, audio.subcategory_id));
  const coverUrl = audio.image_path ? getPublicUrl('images', audio.image_path) : '';
  const audioUrl = audio.audio_path ? getPublicUrl('audios', audio.audio_path) : '';
  const currentCover = document.getElementById('edit-current-cover');
  if (currentCover) currentCover.innerHTML = coverUrl
    ? `<img src="${escapeHtml(coverUrl)}" alt="Couverture actuelle de ${escapeHtml(audio.title)}">`
    : '<div class="placeholder" aria-hidden="true">⌁</div>';
  const currentTitle = document.getElementById('edit-current-title');
  if (currentTitle) currentTitle.textContent = audio.title;
  const currentMeta = document.getElementById('edit-current-meta');
  if (currentMeta) currentMeta.textContent = [cat?.name, sub?.name, formatAdminDuration(audio.duration)].filter(Boolean).join(' · ');
  const currentAudio = document.getElementById('edit-current-audio');
  if (currentAudio) {
    currentAudio.src = audioUrl;
    currentAudio.hidden = !audioUrl;
  }
  document.getElementById('edit-panel').scrollIntoView({ behavior: 'smooth' });
}

function setupEditForm() {
  document.getElementById('form-edit-audio')?.addEventListener('submit', handleEditAudio);
  document.getElementById('btn-cancel-edit')?.addEventListener('click', () => {
    document.getElementById('edit-panel').style.display = 'none';
  });
}

async function handleEditAudio(e) {
  e.preventDefault();
  const id = document.getElementById('edit-audio-id').value;
  const title = document.getElementById('edit-audio-title').value.trim();
  const description = document.getElementById('edit-audio-desc').value.trim();
  const catId = document.getElementById('edit-audio-cat').value || null;
  const subId = document.getElementById('edit-audio-sub').value || null;
  const imgFile = document.getElementById('edit-audio-img').files[0];
  const audFile = document.getElementById('edit-audio-file').files[0];
  if (!title) return showNotif('Titre requis.', 'error');

  const audio = audios.find(a => sameId(a.id, id));
  if (!audio) return showNotif('Audio introuvable.', 'error');

  const uploaded = [];
  let imagePath = audio.image_path;
  let audioPath = audio.audio_path;

  try {
    if (imgFile) {
      imagePath = await uploadFile('images', makeStoragePath(title, imgFile.name), imgFile);
      uploaded.push({ bucket: 'images', path: imagePath });
    }
    if (audFile) {
      audioPath = await uploadFile('audios', makeStoragePath(title, audFile.name), audFile);
      uploaded.push({ bucket: 'audios', path: audioPath });
    }

    const patch = {
      title,
      description: description || null,
      category_id: catId,
      subcategory_id: subId,
      image_path: imagePath,
      audio_path: audioPath,
    };
    if (audFile) patch.duration = Math.floor(await getAudioDuration(audFile)) || null;

    const { error: dbErr } = await dbClient.from('audios').update(patch).eq('id', id);
    if (dbErr) throw dbErr;

    const oldFiles = [];
    if (imgFile && audio.image_path && audio.image_path !== imagePath) oldFiles.push({ bucket: 'images', path: audio.image_path });
    if (audFile && audio.audio_path && audio.audio_path !== audioPath) oldFiles.push({ bucket: 'audios', path: audio.audio_path });
    if (oldFiles.length) {
      const cleaned = await removeFiles(oldFiles);
      if (!cleaned) showNotif('Audio modifié, mais un ancien fichier reste à nettoyer.', 'error');
      else showNotif('Audio modifié ✓');
    } else {
      showNotif('Audio modifié ✓');
    }

    uploaded.length = 0;
    e.target.reset();
    document.getElementById('edit-panel').style.display = 'none';
    await refreshData();
    renderAll();
  } catch (err) {
    if (uploaded.length) await removeFiles(uploaded);
    showNotif('Erreur : ' + (err.message ?? err), 'error');
  }
}

async function deleteAudio(id, imagePath, audioPath) {
  if (!confirm('Supprimer cet audio définitivement ?')) return;
  const { error } = await dbClient.from('audios').delete().eq('id', id);
  if (error) return showNotif('Erreur : ' + error.message, 'error');

  const files = [];
  if (imagePath && imagePath !== 'undefined') files.push({ bucket: 'images', path: imagePath });
  if (audioPath && audioPath !== 'undefined') files.push({ bucket: 'audios', path: audioPath });
  const cleaned = await removeFiles(files);
  showNotif(cleaned ? 'Audio supprimé' : 'Audio supprimé, mais un fichier Storage reste à nettoyer.', cleaned ? 'success' : 'error');
  await refreshData();
  renderAll();
}

document.getElementById('btn-logout')?.addEventListener('click', signOut);

function getAudioDuration(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const el = new Audio(url);
    const cleanup = value => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    el.addEventListener('loadedmetadata', () => cleanup(el.duration), { once: true });
    el.addEventListener('error', () => cleanup(0), { once: true });
  });
}

function slugify(str) {
  return String(str || 'audio').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'audio';
}

function showNotif(msg, type = 'success') {
  let notif = document.getElementById('notif');
  if (!notif) {
    notif = document.createElement('div');
    notif.id = 'notif';
    document.body.appendChild(notif);
  }
  notif.textContent = msg;
  notif.className = `notif ${type}`;
  notif.style.display = 'block';
  clearTimeout(notif._timer);
  notif._timer = setTimeout(() => { notif.style.display = 'none'; }, 3500);
}
