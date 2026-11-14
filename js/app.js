// Ludodio — bibliothèque 2026
const STORAGE = {
  display: 'forestDisplay',
  progress: 'forestAudioProgress',
  recent: 'forestRecentAudios'
};
const state = {
  view: 'library',
  display: localStorage.getItem(STORAGE.display) || 'grid',
  categoryId: null,
  query: '',
  categories: [],
  subcategories: [],
  audios: [],
  currentAudio: null,
  queue: []
};
const player = new Audio();
player.preload = 'metadata';
let lastSavedSecond = -1;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const sameId = (a, b) => String(a ?? '') === String(b ?? '');

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
  }[char]));
}
function formatDuration(seconds) {
  if (!Number.isFinite(Number(seconds))) return '—';
  const value = Math.max(0, Math.floor(Number(seconds)));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { console.warn('Stockage local indisponible', error); }
}
function categoryFor(audio) { return state.categories.find(category => sameId(category.id, audio.category_id)); }
function subcategoryFor(audio) { return state.subcategories.find(sub => sameId(sub.id, audio.subcategory_id)); }
function imageUrl(audio) { return audio.image_path ? getPublicUrl('images', audio.image_path) : ''; }
function audioUrl(audio) { return audio.audio_path ? getPublicUrl('audios', audio.audio_path) : ''; }
function recentIds() { return readJson(STORAGE.recent, []); }
function progressMap() { return readJson(STORAGE.progress, {}); }

function recordRecent(id) {
  const next = [String(id), ...recentIds().filter(existing => !sameId(existing, id))].slice(0, 30);
  writeJson(STORAGE.recent, next);
}
function saveCurrentProgress(force = false) {
  if (!state.currentAudio || !Number.isFinite(player.currentTime)) return;
  const wholeSecond = Math.floor(player.currentTime);
  if (!force && wholeSecond === lastSavedSecond) return;
  lastSavedSecond = wholeSecond;
  const map = progressMap();
  const id = String(state.currentAudio.id);
  const duration = Number.isFinite(player.duration) ? player.duration : Number(state.currentAudio.duration || 0);
  if (duration && player.currentTime >= duration - 5) delete map[id];
  else map[id] = { time: player.currentTime, duration, updatedAt: Date.now() };
  writeJson(STORAGE.progress, map);
}

// Restore only a paused resume point: browsers should never be forced to autoplay on load.
function restoreResumePoint() {
  const map = progressMap();
  const candidateId = recentIds().find(id => {
    const entry = map[String(id)];
    return entry && Number(entry.time) > 3;
  });
  const audio = state.audios.find(item => sameId(item.id, candidateId));
  if (!audio || !audio.audio_path) return;
  state.currentAudio = audio;
  player.src = audioUrl(audio);
  updateNowPlaying();
  const resumeAt = Number(map[String(audio.id)]?.time || 0);
  player.addEventListener('loadedmetadata', () => {
    if (resumeAt > 0 && (!Number.isFinite(player.duration) || resumeAt < player.duration - 3)) player.currentTime = resumeAt;
    updateProgress();
  }, { once: true });
}

document.addEventListener('DOMContentLoaded', async () => {
  wireInterface();
  await loadData();
  restoreResumePoint();
  render();
});

async function loadData() {
  const main = $('#main-content');
  try {
    const [cats, subs, audios] = await Promise.all([
      dbClient.from('categories').select('*').order('name'),
      dbClient.from('subcategories').select('*').order('name'),
      dbClient.from('audios').select('*').order('created_at', { ascending: false })
    ]);
    const error = cats.error || subs.error || audios.error;
    if (error) throw error;
    state.categories = cats.data ?? [];
    state.subcategories = subs.data ?? [];
    state.audios = audios.data ?? [];
  } catch (error) {
    console.error(error);
    main.innerHTML = '<div class="empty-state"><strong>Impossible de charger la bibliothèque</strong><span>Vérifie la connexion puis recharge la page.</span></div>';
  }
}

function wireInterface() {
  $$('.nav-button').forEach(button => button.addEventListener('click', () => {
    state.view = button.dataset.view;
    state.categoryId = null;
    state.query = '';
    $('#search-input').value = '';
    $('#clear-search').hidden = true;
    render();
  }));
  const search = $('#search-input');
  search.addEventListener('input', () => {
    state.query = search.value.trim();
    $('#clear-search').hidden = !state.query;
    render();
  });
  $('#clear-search').addEventListener('click', () => {
    search.value = '';
    state.query = '';
    $('#clear-search').hidden = true;
    search.focus();
    render();
  });
  $('#grid-view').addEventListener('click', () => setDisplay('grid'));
  $('#list-view').addEventListener('click', () => setDisplay('list'));
  $('#play-pause').addEventListener('click', togglePlay);
  $('#prev-track').addEventListener('click', () => stepTrack(-1));
  $('#next-track').addEventListener('click', () => stepTrack(1));
  $('#player-progress').addEventListener('input', event => {
    if (Number.isFinite(player.duration)) player.currentTime = Number(event.target.value);
  });
  $('#player-volume').addEventListener('input', event => { player.volume = Number(event.target.value); });
  player.addEventListener('play', () => { recordRecent(state.currentAudio?.id); updatePlayerState(); });
  player.addEventListener('pause', () => { saveCurrentProgress(true); updatePlayerState(); });
  player.addEventListener('loadedmetadata', updateProgress);
  player.addEventListener('timeupdate', () => { updateProgress(); saveCurrentProgress(); });
  player.addEventListener('ended', () => { saveCurrentProgress(true); stepTrack(1); });
  window.addEventListener('pagehide', () => saveCurrentProgress(true));
}

function setDisplay(display) {
  state.display = display;
  localStorage.setItem(STORAGE.display, display);
  render();
}

function filteredAudios() {
  let result = [...state.audios];
  if (state.view === 'recent') {
    const ids = recentIds();
    result = ids.map(id => state.audios.find(audio => sameId(audio.id, id))).filter(Boolean);
  }
  if (state.categoryId) result = result.filter(audio => sameId(audio.category_id, state.categoryId));
  if (state.query) {
    const needle = state.query.toLocaleLowerCase('fr');
    result = result.filter(audio => {
      const category = categoryFor(audio)?.name ?? '';
      const subcategory = subcategoryFor(audio)?.name ?? '';
      return [audio.title, audio.description, category, subcategory].some(value => (value ?? '').toLocaleLowerCase('fr').includes(needle));
    });
  }
  return result;
}

function render() {
  updateNavigation();
  updateHeader();
  renderFilters();
  const main = $('#main-content');
  if (state.view === 'categories' && !state.query) {
    renderCategories(main);
    return;
  }
  const audios = filteredAudios();
  state.queue = audios;
  if (!audios.length) {
    const emptyCopy = state.view === 'recent' && !state.query
      ? '<div class="empty-state"><strong>Aucune écoute récente</strong><span>Les histoires que tu lanceras apparaîtront ici pour les retrouver rapidement.</span></div>'
      : (state.audios.length===0 ? '<div class="empty-state"><strong>Bienvenue sur Ludodio</strong><span>La bibliothèque est prête à accueillir de nouveaux contes. Les prochaines histoires apparaîtront ici.</span></div>' : '<div class="empty-state"><strong>Aucun résultat</strong><span>Essaie un autre mot ou enlève le filtre de catégorie.</span></div>');
    main.innerHTML = emptyCopy;
    return;
  }
  main.innerHTML = state.display === 'list' ? renderList(audios) : renderGrid(audios);
  bindMediaActions(main);
}

function updateNavigation() {
  $$('.nav-button').forEach(button => button.classList.toggle('active', button.dataset.view === state.view));
  $('#grid-view').classList.toggle('active', state.display === 'grid');
  $('#list-view').classList.toggle('active', state.display === 'list');
  $('#grid-view').setAttribute('aria-pressed', String(state.display === 'grid'));
  $('#list-view').setAttribute('aria-pressed', String(state.display === 'list'));
}

function updateHeader() {
  const titles = {
    library: ['Médiathèque personnelle', 'Votre bibliothèque audio', 'Choisissez une histoire et lancez-la.'],
    recent: ['À reprendre', 'Écoutés récemment', 'Retrouvez les dernières histoires lancées sur cet appareil et reprenez votre écoute.'],
    categories: ['Explorer', 'Toutes les catégories', 'Parcourez la collection par univers sonore.'],
    all: ['Bibliothèque', 'Tous les audios', 'Une vue exhaustive, idéale pour retrouver rapidement un contenu précis.']
  };
  let [eyebrow, title, subtitle] = titles[state.view] ?? titles.library;
  if (state.query) {
    eyebrow = 'Recherche';
    title = `« ${state.query} »`;
    subtitle = 'Résultats dans les titres, descriptions et catégories.';
  }
  $('#page-eyebrow').textContent = eyebrow;
  $('#page-title').textContent = title;
  $('#page-subtitle').textContent = subtitle;
  $('#content-stats').innerHTML = `<span class="stat-pill">${state.audios.length} audio${state.audios.length > 1 ? 's' : ''}</span><span class="stat-pill">${state.categories.length} catégorie${state.categories.length > 1 ? 's' : ''}</span>`;
  $('#toolbar').style.display = state.view === 'categories' && !state.query ? 'none' : '';
}

function renderFilters() {
  const chips = $('#category-chips');
  chips.innerHTML = `<button class="chip ${!state.categoryId ? 'active' : ''}" data-category="">Tout</button>` + state.categories.map(category => {
    const count = state.audios.filter(audio => sameId(audio.category_id, category.id)).length;
    return `<button class="chip ${sameId(state.categoryId, category.id) ? 'active' : ''}" data-category="${escapeHtml(category.id)}">${escapeHtml(category.name)} · ${count}</button>`;
  }).join('');
  chips.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
    state.categoryId = chip.dataset.category || null;
    render();
  }));
}

function renderCategories(container) {
  const cards = state.categories.map(category => {
    const count = state.audios.filter(audio => sameId(audio.category_id, category.id)).length;
    const subs = state.subcategories.filter(sub => sameId(sub.category_id, category.id)).length;
    return `<button class="collection-card" data-category="${escapeHtml(category.id)}"><span class="collection-icon" aria-hidden="true">⌁</span><div class="collection-name">${escapeHtml(category.name)}</div><div class="collection-count">${count} histoire${count > 1 ? 's' : ''}${subs ? ` · ${subs} sous-catégorie${subs > 1 ? 's' : ''}` : ''}</div></button>`;
  }).join('');
  container.innerHTML = cards ? `<div class="collection-grid">${cards}</div>` : '<div class="empty-state"><strong>Aucune catégorie</strong><span>Les catégories créées dans l’administration apparaîtront ici.</span></div>';
  container.querySelectorAll('.collection-card').forEach(card => card.addEventListener('click', () => {
    state.view = 'all';
    state.categoryId = card.dataset.category;
    render();
  }));
}

function renderGrid(audios) {
  return `<div class="media-grid">${audios.map(audio => {
    const category = categoryFor(audio)?.name ?? 'Audio';
    const cover = imageUrl(audio);
    return `<article class="media-card" data-id="${escapeHtml(audio.id)}" tabindex="0" aria-label="${escapeHtml(audio.title)}"><div class="cover-wrap">${cover ? `<img class="cover-image" src="${escapeHtml(cover)}" alt="" loading="lazy">` : '<div class="cover-placeholder" aria-hidden="true">⌁</div>'}<button class="card-play" type="button" data-play="${escapeHtml(audio.id)}" aria-label="Lire ${escapeHtml(audio.title)}">▶</button></div><div class="media-meta"><div class="media-title">${escapeHtml(audio.title)}</div><div class="media-sub"><span>${escapeHtml(category)}</span><span>${formatDuration(audio.duration)}</span></div></div></article>`;
  }).join('')}</div>`;
}

function renderList(audios) {
  return `<div class="media-list">${audios.map(audio => {
    const category = categoryFor(audio)?.name ?? 'Audio';
    const cover = imageUrl(audio);
    const excerpt = audio.description ? escapeHtml(String(audio.description).slice(0, 90)) : '';
    return `<article class="media-row" data-id="${escapeHtml(audio.id)}" tabindex="0">${cover ? `<img class="row-cover" src="${escapeHtml(cover)}" alt="" loading="lazy">` : '<div class="row-cover cover-placeholder" aria-hidden="true">⌁</div>'}<div><div class="row-title">${escapeHtml(audio.title)}</div><div class="row-sub">${escapeHtml(category)}${excerpt ? ` · ${excerpt}` : ''}</div></div><div class="row-duration">${formatDuration(audio.duration)}</div><button class="row-play" type="button" data-play="${escapeHtml(audio.id)}" aria-label="Lire ${escapeHtml(audio.title)}">▶</button></article>`;
  }).join('')}</div>`;
}

function bindMediaActions(container) {
  container.querySelectorAll('[data-play]').forEach(button => button.addEventListener('click', event => {
    event.stopPropagation();
    playById(button.dataset.play);
  }));
  container.querySelectorAll('[data-id]').forEach(item => {
    const open = () => { location.href = `audio.html?id=${encodeURIComponent(item.dataset.id)}`; };
    item.addEventListener('click', event => { if (!event.target.closest('[data-play]')) open(); });
    item.addEventListener('keydown', event => { if (event.key === 'Enter') open(); });
  });
}

function playById(id) {
  const audio = state.audios.find(item => sameId(item.id, id));
  if (!audio || !audio.audio_path) return;
  const same = state.currentAudio && sameId(state.currentAudio.id, audio.id);
  if (!same) {
    saveCurrentProgress(true);
    state.currentAudio = audio;
    player.src = audioUrl(audio);
    const stored = progressMap()[String(audio.id)];
    if (stored?.time > 3) {
      player.addEventListener('loadedmetadata', () => {
        if (stored.time < player.duration - 3) player.currentTime = stored.time;
      }, { once: true });
    }
    updateNowPlaying();
  }
  recordRecent(audio.id);
  player.play().catch(error => console.error('Lecture impossible', error));
}

function togglePlay() {
  if (!state.currentAudio) {
    const first = filteredAudios()[0] || state.audios[0];
    if (first) playById(first.id);
    return;
  }
  player.paused ? player.play().catch(error => console.error('Lecture impossible', error)) : player.pause();
}

function stepTrack(direction) {
  if (!state.queue.length) state.queue = filteredAudios();
  if (!state.queue.length) state.queue = [...state.audios];
  if (!state.queue.length) return;
  const current = state.currentAudio ? state.queue.findIndex(item => sameId(item.id, state.currentAudio.id)) : -1;
  const next = (current + direction + state.queue.length) % state.queue.length;
  playById(state.queue[next].id);
}

function updateNowPlaying() {
  const audio = state.currentAudio;
  if (!audio) return;
  const mini = $('#mini-player');
  mini.classList.add('visible');
  mini.setAttribute('aria-hidden', 'false');
  $('#mini-title').textContent = audio.title;
  $('#mini-sub').textContent = categoryFor(audio)?.name ?? 'Ludodio';
  const cover = imageUrl(audio);
  const coverEl = $('#mini-cover');
  coverEl.src = cover || '';
  coverEl.hidden = !cover;
  $('#details-link').href = `audio.html?id=${encodeURIComponent(audio.id)}`;
  updatePlayerState();
}

function updatePlayerState() {
  const button = $('#play-pause');
  button.textContent = player.paused ? '▶' : 'Ⅱ';
  button.setAttribute('aria-label', player.paused ? 'Lecture' : 'Pause');
}

function updateProgress() {
  const progress = $('#player-progress');
  const duration = Number.isFinite(player.duration) ? player.duration : Number(state.currentAudio?.duration || 0);
  progress.max = duration || 100;
  progress.value = Number.isFinite(player.currentTime) ? player.currentTime : 0;
  $('#elapsed').textContent = formatDuration(player.currentTime || 0);
  $('#remaining').textContent = formatDuration(duration || 0);
}
