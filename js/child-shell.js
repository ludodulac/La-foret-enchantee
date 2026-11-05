// Expérience enfant locale : profils, accueil éditorial, catégories, recherche et espace parent.
(() => {
  const PROFILE_KEY = 'forestActiveChildProfile';
  const PROFILES_KEY = 'forestChildProfiles';
  const GUIDED_KEY = 'forestGuidedMode';
  const DEFAULT_PROFILES = [
    { id:'child-local-1', name:'Enfant', avatar:'🌿', language:'fr', antiZap:0, timer:0, progressBar:true, nightMode:false, likes:false },
    { id:'child-local-2', name:'Petit hibou', avatar:'🦉', language:'fr', antiZap:0, timer:0, progressBar:true, nightMode:false, likes:false }
  ];
  const gate = document.getElementById('profile-gate');
  const profileGrid = document.getElementById('profile-choice-grid');
  const switchProfile = document.getElementById('switch-profile');
  const greetingName = document.getElementById('child-greeting-name');
  const greetingAvatar = document.getElementById('child-avatar');
  const bottomNav = [...document.querySelectorAll('.child-nav-button')];
  const parentLock = document.getElementById('parent-lock');
  const parentSpace = document.getElementById('parent-space');
  const parentAnswer = document.getElementById('parent-answer');
  const parentQuestion = document.getElementById('parent-question');
  const parentError = document.getElementById('parent-error');
  const parentProfileList = document.getElementById('parent-profile-list');
  const guidedMode = document.getElementById('guided-mode');
  let parentExpected = null;
  let editedProfileId = null;
  let currentChildView = 'library';
  let parentLockOrigin = 'gate';

  function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
  function writeJsonLocal(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
  function profiles() {
    const saved = readJson(PROFILES_KEY, null);
    if (Array.isArray(saved) && saved.length) return saved;
    writeJsonLocal(PROFILES_KEY, DEFAULT_PROFILES);
    return [...DEFAULT_PROFILES];
  }
  function saveProfiles(list) { writeJsonLocal(PROFILES_KEY, list); }
  function readProfile() { return readJson(PROFILE_KEY, null); }
  function saveActiveProfile(profile) { writeJsonLocal(PROFILE_KEY, profile); }
  function activeProfile() {
    const current = readProfile();
    const list = profiles();
    return list.find(item => current && String(item.id) === String(current.id)) || list[0] || DEFAULT_PROFILES[0];
  }
  function applyProfile(profile) {
    const active = profile || activeProfile();
    saveActiveProfile(active);
    if (greetingName) greetingName.textContent = `Bonjour ${active.name}`;
    if (greetingAvatar) greetingAvatar.textContent = active.avatar || '🌿';
    document.body.dataset.childProfile = active.id;
    if (gate) gate.hidden = true;
    applyProfilePreferences(active);
    if (currentChildView === 'library') scheduleChildHome();
    else scheduleSpecialView();
  }
  function applyProfilePreferences(profile) {
    document.body.classList.toggle('child-no-progress', profile.progressBar === false);
    document.documentElement.lang = profile.language === 'en' ? 'en' : 'fr';
  }
  function renderProfileGate() {
    if (!profileGrid) return;
    profileGrid.innerHTML = profiles().map(profile => `<button class="profile-choice child" type="button" data-profile-id="${escapeHtml(profile.id)}"><span class="profile-choice-icon" aria-hidden="true">${escapeHtml(profile.avatar || '🌿')}</span><strong>${escapeHtml(profile.name)}</strong><span>Entrer dans les histoires</span></button>`).join('');
    profileGrid.querySelectorAll('[data-profile-id]').forEach(button => button.addEventListener('click', () => {
      const p = profiles().find(item => String(item.id) === button.dataset.profileId);
      if (p) applyProfile(p);
    }));
  }
  function openGate() {
    renderProfileGate();
    if (guidedMode) guidedMode.checked = localStorage.getItem(GUIDED_KEY) === 'true';
    if (gate) gate.hidden = false;
  }
  function syncBottomNav(view) {
    bottomNav.forEach(button => {
      const active = button.dataset.childView === view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
  }
  function selectView(view) {
    if (typeof state === 'undefined' || typeof render !== 'function') return;
    currentChildView = view;
    state.categoryId = null;
    state.query = '';
    const search = document.getElementById('search-input');
    const clear = document.getElementById('clear-search');
    if (search) search.value = '';
    if (clear) clear.hidden = true;
    state.view = view === 'search' ? 'all' : view;
    render();
    syncBottomNav(view);
    if (view === 'library') scheduleChildHome();
    else if (view === 'categories') scheduleChildCategories();
    else if (view === 'search') {
      scheduleChildSearch();
      requestAnimationFrame(() => search?.focus());
    }
  }
  function scheduleChildHome() { requestAnimationFrame(() => requestAnimationFrame(renderChildHome)); }
  function scheduleChildCategories() { requestAnimationFrame(() => requestAnimationFrame(renderChildCategories)); }
  function scheduleChildSearch() { requestAnimationFrame(() => requestAnimationFrame(renderChildSearch)); }
  function scheduleSpecialView() {
    if (currentChildView === 'categories') scheduleChildCategories();
    if (currentChildView === 'search') scheduleChildSearch();
  }
  function childCard(audio) {
    const cover = imageUrl(audio);
    const category = categoryFor(audio)?.name || 'Histoire';
    return `<article class="child-story-card" data-child-id="${escapeHtml(audio.id)}" tabindex="0" aria-label="${escapeHtml(audio.title)}"><div class="child-story-cover">${cover ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy">` : '<div class="child-story-placeholder child-symbolic-art" aria-hidden="true"><span>✦</span><i>⌁</i></div>'}<button class="child-story-play" type="button" data-child-play="${escapeHtml(audio.id)}" aria-label="Écouter ${escapeHtml(audio.title)}">▶</button></div><div class="child-story-category">${escapeHtml(category)}</div><div class="child-story-title">${escapeHtml(audio.title)}</div></article>`;
  }
  function rail(title, audios, actionView='') {
    if (!audios.length) return '';
    const action = actionView ? `<button class="child-rail-action" type="button" data-go-view="${actionView}">Tout voir</button>` : '';
    return `<section class="child-rail-section"><div class="child-rail-head"><h2>${escapeHtml(title)}</h2>${action}</div><div class="child-rail">${audios.map(childCard).join('')}</div></section>`;
  }
  function bindChildContent(container) {
    container.querySelectorAll('[data-child-play]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); playById(button.dataset.childPlay); }));
    container.querySelectorAll('[data-child-id]').forEach(card => {
      const open = () => { location.href = `audio.html?id=${encodeURIComponent(card.dataset.childId)}`; };
      card.addEventListener('click', event => { if (!event.target.closest('[data-child-play]')) open(); });
      card.addEventListener('keydown', event => { if (event.key === 'Enter') open(); });
    });
    container.querySelectorAll('[data-go-view]').forEach(button => button.addEventListener('click', () => selectView(button.dataset.goView || 'all')));
  }
  function renderChildHome() {
    if (typeof state === 'undefined' || currentChildView !== 'library' || state.view !== 'library' || state.query || !state.audios?.length) return;
    const main = document.getElementById('main-content');
    if (!main) return;
    const p = activeProfile();
    const featured = state.audios[0];
    const featuredCover = imageUrl(featured);
    const featuredCategory = categoryFor(featured)?.name || 'Une histoire à écouter';
    const latest = state.audios.slice(0,10);
    const recent = typeof recentIds === 'function' ? recentIds().map(id => state.audios.find(item => sameId(item.id,id))).filter(Boolean).slice(0,10) : [];
    const categoryRails = state.categories.slice(0,4).map(category => ({ title:category.name, audios:state.audios.filter(audio => sameId(audio.category_id,category.id)).slice(0,10) })).filter(group => group.audios.length);
    document.getElementById('page-eyebrow').textContent = 'Ludodio';
    document.getElementById('page-title').textContent = `Que veux-tu écouter, ${p.name} ?`;
    document.getElementById('page-subtitle').textContent = 'Choisis une histoire et laisse-toi emporter.';
    document.getElementById('toolbar').style.display = 'none';
    main.innerHTML = `<div class="child-home"><section class="child-featured" data-child-id="${escapeHtml(featured.id)}" tabindex="0"><div class="child-featured-copy"><span class="child-featured-kicker">À découvrir</span><h2>${escapeHtml(featured.title)}</h2><p>${escapeHtml(featured.description || featuredCategory)}</p><button class="child-featured-play" type="button" data-child-play="${escapeHtml(featured.id)}"><span>▶</span> Écouter</button></div><div class="child-featured-art">${featuredCover ? `<img src="${escapeHtml(featuredCover)}" alt="">` : '<div class="child-featured-placeholder child-symbolic-hero" aria-hidden="true"><span class="symbol-moon">☾</span><span class="symbol-tree">♠</span><span class="symbol-star">✦</span></div>'}</div></section>${rail('Nouveautés',latest,'all')}${recent.length ? rail('À reprendre',recent,'recent') : ''}${categoryRails.map(group => rail(group.title,group.audios,'categories')).join('')}</div>`;
    bindChildContent(main);
  }
  function categoryVisual(name='') {
    const value = name.toLocaleLowerCase('fr');
    if (/douce|calme|dormir|nuit|sommeil/.test(value)) return ['☾','Histoires douces'];
    if (/rire|dr[oô]le|humour/.test(value)) return ['☀','Pour rire'];
    if (/aventure|explor/.test(value)) return ['➜','Aventures'];
    if (/musique|chanson|comptine/.test(value)) return ['♫','Musique'];
    if (/curieu|d[ée]couv|science/.test(value)) return ['✦','Pour les curieux'];
    return ['✿',name];
  }
  function renderChildCategories() {
    if (currentChildView !== 'categories' || typeof state === 'undefined') return;
    const main = document.getElementById('main-content');
    if (!main) return;
    document.getElementById('page-eyebrow').textContent = 'Explorer';
    document.getElementById('page-title').textContent = 'Choisis ton univers';
    document.getElementById('page-subtitle').textContent = 'Une couleur, une ambiance, une histoire.';
    document.getElementById('toolbar').style.display = 'none';
    const cards = state.categories.map((category,index) => {
      const [icon,label] = categoryVisual(category.name);
      const count = state.audios.filter(audio => sameId(audio.category_id,category.id)).length;
      return `<button class="child-category-tile tone-${(index%6)+1}" type="button" data-child-category="${escapeHtml(category.id)}"><span class="child-category-icon">${icon}</span><span class="child-category-copy"><strong>${escapeHtml(label)}</strong><small>${count} histoire${count>1?'s':''}</small></span></button>`;
    }).join('');
    main.innerHTML = `<div class="child-category-grid">${cards}<button class="child-category-tile child-category-all tone-all" type="button" data-all-stories><span class="child-category-icon">∞</span><span class="child-category-copy"><strong>Toutes les histoires</strong><small>Tout explorer</small></span></button></div>`;
    main.querySelectorAll('[data-child-category]').forEach(button => button.addEventListener('click', () => { currentChildView='all'; state.view='all'; state.categoryId=button.dataset.childCategory; render(); syncBottomNav(''); }));
    main.querySelector('[data-all-stories]')?.addEventListener('click', () => selectView('all'));
  }
  function renderChildSearch() {
    if (currentChildView !== 'search' || typeof state === 'undefined' || state.query) return;
    const main = document.getElementById('main-content');
    if (!main) return;
    document.getElementById('page-eyebrow').textContent = 'Rechercher';
    document.getElementById('page-title').textContent = 'Que cherches-tu ?';
    document.getElementById('page-subtitle').textContent = 'Écris un mot, ou laisse-toi guider par les univers.';
    document.getElementById('toolbar').style.display = 'none';
    const latest = state.audios.slice(0,10);
    const categoryRails = state.categories.slice(0,5).map(category => ({ title:categoryVisual(category.name)[1], audios:state.audios.filter(audio => sameId(audio.category_id,category.id)).slice(0,10) })).filter(group=>group.audios.length);
    main.innerHTML = `<div class="child-search-discovery">${rail('Nouveautés',latest)}${categoryRails.map(group=>rail(group.title,group.audios)).join('')}</div>`;
    bindChildContent(main);
  }

  function newParentChallenge(clearError=true) {
    const a=2+Math.floor(Math.random()*7), b=1+Math.floor(Math.random()*6);
    parentExpected=a+b;
    if (parentQuestion) parentQuestion.textContent=`${a} + ${b} = ?`;
    if (parentAnswer) { parentAnswer.value=''; setTimeout(()=>parentAnswer.focus(),50); }
    if (clearError && parentError) parentError.textContent='';
  }
  function openParentLock(origin='child') {
    parentLockOrigin = origin;
    if(gate) gate.hidden=true;
    newParentChallenge();
    if(parentLock) parentLock.hidden=false;
  }
  function closeParentLock() {
    if(parentLock) parentLock.hidden=true;
    if (parentLockOrigin === 'gate') openGate();
    else {
      if(gate) gate.hidden=true;
      applyProfile(activeProfile());
    }
  }
  function openParentSpace() { if(parentLock)parentLock.hidden=true; if(parentSpace)parentSpace.hidden=false; renderParentProfiles(); const first=profiles()[0]; if(first)selectParentProfile(first.id); }
  function closeParentSpace() { if(parentSpace)parentSpace.hidden=true; applyProfile(activeProfile()); }
  function renderParentProfiles() {
    if (!parentProfileList) return;
    parentProfileList.innerHTML=profiles().map(p=>`<button type="button" class="parent-profile-chip ${String(p.id)===String(editedProfileId)?'active':''}" data-edit-profile="${escapeHtml(p.id)}"><span>${escapeHtml(p.avatar||'🌿')}</span><strong>${escapeHtml(p.name)}</strong></button>`).join('');
    parentProfileList.querySelectorAll('[data-edit-profile]').forEach(button=>button.addEventListener('click',()=>selectParentProfile(button.dataset.editProfile)));
  }
  function selectParentProfile(id) {
    const p=profiles().find(item=>String(item.id)===String(id)); if(!p)return;
    editedProfileId=p.id;
    document.getElementById('settings-profile-name').textContent=p.name;
    document.getElementById('setting-name').value=p.name||'';
    document.getElementById('setting-avatar').value=p.avatar||'🌿';
    document.getElementById('setting-language').value=p.language||'fr';
    document.getElementById('setting-antizap').value=String(p.antiZap||0);
    document.getElementById('setting-timer').value=String(p.timer||0);
    document.getElementById('setting-progress').checked=p.progressBar!==false;
    document.getElementById('setting-night').checked=!!p.nightMode;
    document.getElementById('setting-likes').checked=!!p.likes;
    renderParentProfiles();
  }
  function saveEditedProfile() {
    const list=profiles(), index=list.findIndex(item=>String(item.id)===String(editedProfileId)); if(index<0)return;
    const current=list[index];
    const next={...current,name:document.getElementById('setting-name').value.trim()||current.name,avatar:document.getElementById('setting-avatar').value||'🌿',language:document.getElementById('setting-language').value||'fr',antiZap:Number(document.getElementById('setting-antizap').value||0),timer:Number(document.getElementById('setting-timer').value||0),progressBar:document.getElementById('setting-progress').checked,nightMode:document.getElementById('setting-night').checked,likes:document.getElementById('setting-likes').checked};
    list[index]=next; saveProfiles(list); if(String(activeProfile().id)===String(next.id))saveActiveProfile(next); selectParentProfile(next.id);
  }
  function addChildProfile() {
    const list=profiles(), n=list.length+1;
    const p={id:`child-local-${Date.now()}`,name:`Enfant ${n}`,avatar:['🌿','🦊','🐻','🦉','🐰'][list.length%5],language:'fr',antiZap:0,timer:0,progressBar:true,nightMode:false,likes:false};
    list.push(p); saveProfiles(list); selectParentProfile(p.id);
  }
  function deleteEditedProfile() {
    const list=profiles(); if(list.length<=1)return;
    const next=list.filter(item=>String(item.id)!==String(editedProfileId)); saveProfiles(next);
    const active=activeProfile(); if(!next.some(item=>String(item.id)===String(active.id)))saveActiveProfile(next[0]); selectParentProfile(next[0].id);
  }

  switchProfile?.addEventListener('click',openGate);
  document.getElementById('choose-parent-space')?.addEventListener('click',()=>openParentLock('gate'));
  document.getElementById('open-parent-space')?.addEventListener('click',()=>openParentLock('child'));
  document.getElementById('close-parent-lock')?.addEventListener('click',closeParentLock);
  document.getElementById('close-parent-space')?.addEventListener('click',closeParentSpace);
  document.getElementById('add-child-profile')?.addEventListener('click',addChildProfile);
  document.getElementById('save-profile-settings')?.addEventListener('click',saveEditedProfile);
  document.getElementById('delete-child-profile')?.addEventListener('click',deleteEditedProfile);
  guidedMode?.addEventListener('change',()=>localStorage.setItem(GUIDED_KEY,String(guidedMode.checked)));
  document.getElementById('parent-lock-form')?.addEventListener('submit',event=>{
    event.preventDefault();
    if(Number(parentAnswer?.value)===parentExpected) openParentSpace();
    else { newParentChallenge(false); if(parentError)parentError.textContent='Essaie encore avec le nouveau calcul.'; }
  });
  bottomNav.forEach(button=>button.addEventListener('click',()=>selectView(button.dataset.childView||'library')));
  document.querySelector('.nav-button[data-view="library"]')?.addEventListener('click',()=>{currentChildView='library';scheduleChildHome();});
  document.querySelector('.nav-button[data-view="categories"]')?.addEventListener('click',()=>{currentChildView='categories';scheduleChildCategories();});
  const search=document.getElementById('search-input');
  search?.addEventListener('input',()=>{ if(currentChildView==='search'&&!search.value.trim()) scheduleChildSearch(); });
  document.getElementById('clear-search')?.addEventListener('click',()=>{ if(currentChildView==='search') scheduleChildSearch(); });

  renderProfileGate();
  const active=readProfile(); if(active)applyProfile(active); else openGate();
  syncBottomNav('library');
  let attempts=0;
  const waitForLibrary=setInterval(()=>{ attempts+=1; if(typeof state!=='undefined'&&state.audios?.length){clearInterval(waitForLibrary);renderChildHome();} else if(attempts>80)clearInterval(waitForLibrary); },100);
})();