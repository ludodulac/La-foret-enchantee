// admin-cover-editor.js — permet d’importer une couverture ou de choisir une image finale prête à l’emploi.
(() => {
  const BANK_URL = 'assets/covers/manifest.json';
  const BANK_BASE = 'assets/covers/';

  let bank = [];
  const states = new Map();

  function makeEditor(kind, fileInputId, titleInputId) {
    const fileInput = document.getElementById(fileInputId);
    const titleInput = document.getElementById(titleInputId);
    if (!fileInput || !titleInput) return null;

    const state = {
      kind,
      mode: 'upload',
      key: bank[0]?.id || '',
      fileInput,
      titleInput,
      current: null,
      initialMode: 'upload',
      initialKey: null,
    };

    const root = document.createElement('div');
    root.className = 'cover-editor';
    root.dataset.coverEditor = kind;
    root.innerHTML = `
      <div class="cover-mode-switch" role="group" aria-label="Mode de couverture">
        <button type="button" class="cover-mode active" data-cover-mode="upload">Importer ma propre couverture</button>
        <button type="button" class="cover-mode" data-cover-mode="library">Choisir une image prête</button>
      </div>
      <div class="cover-builder" hidden>
        <div class="cover-builder-copy">
          <strong>Choisis une image</strong>
          <span>L’image est utilisée telle quelle, sans couleur ni transparence ajoutée.</span>
        </div>
        <div class="cover-gallery" role="listbox" aria-label="Images de couverture prêtes"></div>
        <div class="cover-gallery-empty" data-cover-bank-empty hidden>Aucune image finale n’est encore disponible.</div>
        <div class="cover-preview-wrap">
          <img class="cover-preview cover-preview-image" alt="Aperçu de la couverture sélectionnée">
          <div class="cover-preview-note">Aperçu de l’image finale</div>
        </div>
      </div>`;

    fileInput.closest('.form-group')?.appendChild(root);
    state.root = root;
    state.builder = root.querySelector('.cover-builder');
    state.gallery = root.querySelector('.cover-gallery');
    state.preview = root.querySelector('.cover-preview-image');
    state.bankEmpty = root.querySelector('[data-cover-bank-empty]');
    states.set(kind, state);

    root.querySelectorAll('[data-cover-mode]').forEach(button => {
      button.addEventListener('click', () => setMode(state, button.dataset.coverMode));
    });

    renderGallery(state);
    setMode(state, 'upload');
    return state;
  }

  function setMode(state, mode) {
    state.mode = mode === 'library' && bank.length ? 'library' : 'upload';
    state.root.querySelectorAll('[data-cover-mode]').forEach(button => {
      const selected = button.dataset.coverMode === state.mode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    state.builder.hidden = state.mode !== 'library';
    state.fileInput.hidden = state.mode === 'library';
    const hint = state.fileInput.parentElement?.querySelector('.upload-hint,.keep-file-hint');
    if (hint) hint.hidden = state.mode === 'library';
    if (state.mode === 'library') renderPreview(state);
  }

  function renderGallery(state) {
    const libraryButton = state.root.querySelector('[data-cover-mode="library"]');
    if (libraryButton) libraryButton.hidden = bank.length === 0;
    state.bankEmpty.hidden = bank.length !== 0;

    state.gallery.innerHTML = bank.map(item => `
      <button type="button" class="cover-illustration" data-illustration-key="${item.id}" role="option" aria-label="${item.label}">
        <span class="cover-illustration-art"><img src="${BANK_BASE}${item.file}" alt=""></span>
        <span>${item.label}</span>
      </button>`).join('');

    state.gallery.querySelectorAll('[data-illustration-key]').forEach(button => {
      button.addEventListener('click', () => {
        state.key = button.dataset.illustrationKey;
        syncSelection(state);
        renderPreview(state);
      });
    });
    syncSelection(state);
  }

  function syncSelection(state) {
    state.gallery.querySelectorAll('[data-illustration-key]').forEach(button => {
      const selected = button.dataset.illustrationKey === state.key;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
  }

  function selectedAsset(state) {
    return bank.find(item => item.id === state.key) || bank[0] || null;
  }

  function renderPreview(state) {
    if (state.mode !== 'library') return;
    const asset = selectedAsset(state);
    if (!asset) {
      state.preview.removeAttribute('src');
      state.preview.alt = 'Aucune couverture sélectionnée';
      return;
    }
    state.preview.src = BANK_BASE + asset.file;
    state.preview.alt = `Aperçu : ${asset.label}`;
  }

  async function assetFile(state) {
    const asset = selectedAsset(state);
    if (!asset) throw new Error('Choisis une image de couverture.');
    const response = await fetch(BANK_BASE + asset.file, { cache: 'no-cache' });
    if (!response.ok) throw new Error('L’image de couverture sélectionnée est indisponible.');
    const blob = await response.blob();
    return new File([blob], asset.file, { type: blob.type || 'image/png' });
  }

  async function resolveAdd() {
    const state = states.get('add');
    if (!state || state.mode === 'upload') {
      return { file: state?.fileInput.files[0] || null, illustrationKey: null, coverColor: null, generated: false };
    }
    return {
      file: await assetFile(state),
      illustrationKey: selectedAsset(state).id,
      coverColor: null,
      generated: false,
    };
  }

  async function resolveEdit() {
    const state = states.get('edit');
    if (!state || !state.current) return { file: null, illustrationKey: null, coverColor: null, generated: false, replace: false };
    const importedFile = state.fileInput.files[0] || null;

    if (state.mode === 'upload') {
      return {
        file: importedFile,
        illustrationKey: importedFile ? null : state.initialKey,
        coverColor: null,
        generated: false,
        replace: Boolean(importedFile),
      };
    }

    const asset = selectedAsset(state);
    if (!asset) throw new Error('Choisis une image de couverture.');
    const mustReplace = state.initialMode !== 'library' || asset.id !== state.initialKey;
    return {
      file: mustReplace ? await assetFile(state) : null,
      illustrationKey: asset.id,
      coverColor: null,
      generated: false,
      replace: mustReplace,
    };
  }

  function prepareEdit(audio) {
    const state = states.get('edit');
    if (!state || !audio) return;
    state.current = audio;
    state.initialKey = audio.illustration_key || null;
    state.initialMode = state.initialKey && bank.some(item => item.id === state.initialKey) ? 'library' : 'upload';
    state.fileInput.value = '';
    if (state.initialMode === 'library') {
      state.key = state.initialKey;
      syncSelection(state);
    }
    setMode(state, state.initialMode);
  }

  function reset(kind) {
    const state = states.get(kind);
    if (!state) return;
    state.current = null;
    state.initialKey = null;
    state.initialMode = 'upload';
    state.key = bank[0]?.id || '';
    syncSelection(state);
    setMode(state, 'upload');
  }

  async function verifyStoragePath(bucket, path) {
    const cleanPath = String(path || '').replace(/^\/+/, '');
    const parts = cleanPath.split('/');
    const fileName = parts.pop();
    const folder = parts.join('/');
    const { data, error } = await dbClient.storage.from(bucket).list(folder, { limit: 100, search: fileName });
    if (error) throw error;
    if (!(data || []).some(item => item.name === fileName)) throw new Error(`Le fichier ${fileName} n’a pas été confirmé dans Storage.`);
    return true;
  }

  async function uploadVerified(bucket, path, file) {
    await uploadFile(bucket, path, file);
    await verifyStoragePath(bucket, path);
    return path;
  }

  function verifyRow(row, expected) {
    if (!row) throw new Error('La sauvegarde n’a pas pu être confirmée.');
    Object.entries(expected).forEach(([key, value]) => {
      if ((row[key] ?? null) !== (value ?? null)) throw new Error(`La sauvegarde de ${key} n’a pas pu être confirmée.`);
    });
  }

  async function enhancedAddAudio(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const btn = document.getElementById('btn-add-audio');
    btn.disabled = true;
    btn.textContent = 'Envoi en cours…';
    const uploaded = [];

    try {
      const title = document.getElementById('audio-title-in').value.trim();
      const description = document.getElementById('audio-desc-in').value.trim();
      const catId = document.getElementById('audio-cat').value || null;
      const subId = document.getElementById('audio-sub').value || null;
      const audFile = document.getElementById('audio-file').files[0];
      if (!title || !audFile) throw new Error('Titre et fichier audio requis.');

      const cover = await resolveAdd();
      let imagePath = null;
      if (cover.file) {
        imagePath = makeStoragePath(title, cover.file.name);
        await uploadVerified('images', imagePath, cover.file);
        uploaded.push({ bucket: 'images', path: imagePath });
      }

      const audPath = makeStoragePath(title, audFile.name);
      await uploadVerified('audios', audPath, audFile);
      uploaded.push({ bucket: 'audios', path: audPath });
      const duration = await getAudioDuration(audFile);

      const payload = {
        title,
        description: description || null,
        category_id: catId,
        subcategory_id: subId,
        image_path: imagePath,
        audio_path: audPath,
        duration: Math.floor(duration) || null,
        illustration_key: cover.illustrationKey,
        cover_color: null,
      };
      const { data: row, error: dbErr } = await dbClient.from('audios').insert(payload)
        .select('id,title,image_path,audio_path,illustration_key,cover_color').single();
      if (dbErr) throw dbErr;
      verifyRow(row, {
        title,
        image_path: imagePath,
        audio_path: audPath,
        illustration_key: cover.illustrationKey,
        cover_color: null,
      });

      uploaded.length = 0;
      showNotif('Histoire ajoutée avec succès ✓');
      event.target.reset();
      reset('add');
      await refreshData();
      renderAll();
    } catch (error) {
      if (uploaded.length) await removeFiles(uploaded);
      showNotif('Erreur : ' + (error.message || error), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Ajouter l’histoire';
    }
  }

  async function enhancedEditAudio(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const id = document.getElementById('edit-audio-id').value;
    const title = document.getElementById('edit-audio-title').value.trim();
    const description = document.getElementById('edit-audio-desc').value.trim();
    const catId = document.getElementById('edit-audio-cat').value || null;
    const subId = document.getElementById('edit-audio-sub').value || null;
    const audFile = document.getElementById('edit-audio-file').files[0];
    if (!title) return showNotif('Titre requis.', 'error');

    const audio = audios.find(item => sameId(item.id, id));
    if (!audio) return showNotif('Audio introuvable.', 'error');

    const uploaded = [];
    let imagePath = audio.image_path;
    let audioPath = audio.audio_path;

    try {
      const cover = await resolveEdit();
      if (cover.file) {
        imagePath = makeStoragePath(title, cover.file.name);
        await uploadVerified('images', imagePath, cover.file);
        uploaded.push({ bucket: 'images', path: imagePath });
      }
      if (audFile) {
        audioPath = makeStoragePath(title, audFile.name);
        await uploadVerified('audios', audioPath, audFile);
        uploaded.push({ bucket: 'audios', path: audioPath });
      }

      const patch = {
        title,
        description: description || null,
        category_id: catId,
        subcategory_id: subId,
        image_path: imagePath,
        audio_path: audioPath,
        illustration_key: cover.illustrationKey,
        cover_color: null,
      };
      if (audFile) patch.duration = Math.floor(await getAudioDuration(audFile)) || null;

      const { data: row, error: dbErr } = await dbClient.from('audios').update(patch).eq('id', id)
        .select('id,title,image_path,audio_path,illustration_key,cover_color').single();
      if (dbErr) throw dbErr;
      verifyRow(row, {
        title,
        image_path: imagePath,
        audio_path: audioPath,
        illustration_key: cover.illustrationKey,
        cover_color: null,
      });

      const oldFiles = [];
      if (cover.file && audio.image_path && audio.image_path !== imagePath) oldFiles.push({ bucket: 'images', path: audio.image_path });
      if (audFile && audio.audio_path && audio.audio_path !== audioPath) oldFiles.push({ bucket: 'audios', path: audio.audio_path });
      uploaded.length = 0;
      const cleaned = oldFiles.length ? await removeFiles(oldFiles) : true;
      showNotif(cleaned ? 'Histoire modifiée ✓' : 'Histoire modifiée, mais un ancien fichier reste à nettoyer.', cleaned ? 'success' : 'error');

      event.target.reset();
      reset('edit');
      document.getElementById('edit-panel').style.display = 'none';
      await refreshData();
      renderAll();
    } catch (error) {
      if (uploaded.length) await removeFiles(uploaded);
      showNotif('Erreur : ' + (error.message || error), 'error');
    }
  }

  async function init() {
    try {
      const response = await fetch(BANK_URL, { cache: 'no-cache' });
      if (!response.ok) throw new Error('Banque d’images finales indisponible.');
      const manifest = await response.json();
      bank = Array.isArray(manifest) ? manifest.filter(item => item?.id && item?.label && item?.file) : [];
    } catch (error) {
      console.warn(error);
      bank = [];
    }
    makeEditor('add', 'audio-img', 'audio-title-in');
    makeEditor('edit', 'edit-audio-img', 'edit-audio-title');
  }

  const originalOpenEditAudio = window.openEditAudio;
  if (typeof originalOpenEditAudio === 'function') {
    window.openEditAudio = function(id) {
      originalOpenEditAudio(id);
      const audio = audios.find(item => sameId(item.id, id));
      if (audio) prepareEdit(audio);
    };
  }

  function bindEnhancedForms() {
    const addForm = document.getElementById('form-add-audio');
    if (addForm && !addForm.dataset.coverImageBound) {
      addForm.dataset.coverImageBound = 'true';
      addForm.addEventListener('submit', enhancedAddAudio, true);
    }
    const editForm = document.getElementById('form-edit-audio');
    if (editForm && !editForm.dataset.coverImageBound) {
      editForm.dataset.coverImageBound = 'true';
      editForm.addEventListener('submit', enhancedEditAudio, true);
    }
  }

  window.handleAddAudio = enhancedAddAudio;
  window.handleEditAudio = enhancedEditAudio;
  window.AdminCoverEditor = { init, prepareEdit, resolveAdd, resolveEdit, reset, verifyStoragePath };

  async function boot() {
    await init();
    bindEnhancedForms();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
