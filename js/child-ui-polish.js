// Small UI corrections for the child shell. Keep behavior separate from app/player logic.
(() => {
  const PROFILES_KEY = 'forestChildProfiles';
  const PROFILE_KEY = 'forestActiveChildProfile';
  const DEFAULT_PROFILES = [
    { id:'child-local-1', name:'Enfant', avatar:'🌿', language:'fr', antiZap:0, timer:0, progressBar:true, nightMode:false, likes:false },
    { id:'child-local-2', name:'Petit hibou', avatar:'🦉', language:'fr', antiZap:0, timer:0, progressBar:true, nightMode:false, likes:false }
  ];

  function placeStatusInHeader() {
    const status = document.getElementById('child-control-status');
    const actions = document.querySelector('.child-actions');
    if (!status || !actions || status.parentElement === actions) return;
    actions.prepend(status);
  }

  function ensurePublicFooter() {
    const surface = document.querySelector('.main-surface');
    if (!surface || surface.querySelector('.public-admin-footer')) return;
    const footer = document.createElement('footer');
    footer.className = 'public-admin-footer';
    footer.setAttribute('aria-label', 'Liens secondaires');
    footer.innerHTML = '<a href="blog.html">Blog</a><span aria-hidden="true">·</span><a href="login.html">Administration</a>';
    surface.appendChild(footer);
  }

  function readProfiles() {
    try {
      const saved = JSON.parse(localStorage.getItem(PROFILES_KEY) || 'null');
      if (Array.isArray(saved) && saved.length) return saved;
    } catch {}
    return DEFAULT_PROFILES.map(profile => ({ ...profile }));
  }

  function saveProfiles(list) {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(list));
  }

  function closeCreateProfile() {
    document.getElementById('create-profile-dialog')?.remove();
  }

  function openCreateProfile() {
    closeCreateProfile();
    const dialog = document.createElement('div');
    dialog.id = 'create-profile-dialog';
    dialog.className = 'create-profile-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'create-profile-title');
    dialog.innerHTML = `
      <div class="create-profile-card">
        <button class="create-profile-close" type="button" aria-label="Fermer">×</button>
        <div class="create-profile-icon" aria-hidden="true">☺</div>
        <h2 id="create-profile-title">Créer mon profil</h2>
        <p>Choisis ton prénom et ton avatar. Le profil restera enregistré sur ce téléphone.</p>
        <form id="create-profile-form">
          <label><span>Prénom</span><input id="create-profile-name" maxlength="24" autocomplete="nickname" required placeholder="Ex. Léo"></label>
          <label><span>Avatar</span><select id="create-profile-avatar" aria-label="Avatar"><option>🌿</option><option>🦊</option><option>🐻</option><option>🦉</option><option>🐰</option><option>🐿️</option><option>🍄</option><option>🌙</option></select></label>
          <button class="create-profile-submit" type="submit">Créer mon profil</button>
        </form>
      </div>`;
    document.body.appendChild(dialog);
    dialog.querySelector('.create-profile-close')?.addEventListener('click', closeCreateProfile);
    dialog.addEventListener('click', event => { if (event.target === dialog) closeCreateProfile(); });
    dialog.querySelector('#create-profile-form')?.addEventListener('submit', event => {
      event.preventDefault();
      const name = dialog.querySelector('#create-profile-name')?.value.trim();
      const avatar = dialog.querySelector('#create-profile-avatar')?.value || '🌿';
      if (!name) return;
      const list = readProfiles();
      const profile = { id:`child-local-${Date.now()}`, name, avatar, language:'fr', antiZap:0, timer:0, progressBar:true, nightMode:false, likes:false };
      list.push(profile);
      saveProfiles(list);
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      location.reload();
    });
    setTimeout(() => dialog.querySelector('#create-profile-name')?.focus(), 60);
  }

  function ensureCreateProfileChoice() {
    const grid = document.getElementById('profile-choice-grid');
    if (!grid || grid.querySelector('[data-create-profile]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'profile-choice create-profile-choice';
    button.dataset.createProfile = 'true';
    button.innerHTML = '<span class="profile-choice-icon" aria-hidden="true">＋</span><strong>Créer mon profil</strong><span>Prénom et avatar</span>';
    button.addEventListener('click', openCreateProfile);
    grid.appendChild(button);
  }

  function ensurePublicFooterStyle() {
    if (document.getElementById('public-admin-footer-style')) return;
    const style = document.createElement('style');
    style.id = 'public-admin-footer-style';
    style.textContent = `
      body.child-experience footer.public-admin-footer{display:flex!important;justify-content:center!important;align-items:center!important;gap:9px!important;margin:56px 0 8px!important;padding:22px 16px!important;border-top:1px solid rgba(255,255,255,.06)!important;background:transparent!important;color:#626a87!important}
      body.child-experience footer.public-admin-footer a{font-size:.72rem!important;font-weight:700!important;letter-spacing:.02em!important;color:#7f87a4!important;text-decoration:none!important;opacity:.82!important}
      body.child-experience footer.public-admin-footer a:hover,body.child-experience footer.public-admin-footer a:focus-visible{color:#c7ccdd!important;opacity:1!important;text-decoration:underline!important;text-underline-offset:3px!important}
      body.child-experience footer.public-admin-footer span{font-size:.68rem!important;opacity:.65!important}
      .create-profile-choice{background:linear-gradient(145deg,#f5e39f,#f7d5bf)!important;color:#26352d!important}
      .create-profile-dialog{position:fixed;inset:0;z-index:180;display:grid;place-items:center;padding:18px;background:rgba(16,19,42,.78);backdrop-filter:blur(12px)}
      .create-profile-card{position:relative;box-sizing:border-box;width:min(430px,100%);max-height:calc(100dvh - 36px);overflow:auto;border-radius:28px;padding:26px;background:#fffdf8;color:#26352d;box-shadow:0 28px 80px rgba(0,0,0,.3)}
      .create-profile-close{position:absolute;top:12px;right:12px;width:44px;height:44px;border:0;border-radius:50%;background:#f0eadf;color:#26352d;font-size:1.7rem;line-height:1;cursor:pointer}
      .create-profile-icon{width:64px;height:64px;border-radius:22px;display:grid;place-items:center;margin-bottom:16px;background:#dcebdc;font-size:1.7rem}
      .create-profile-card h2{margin:0;font-size:1.8rem;letter-spacing:-.04em}.create-profile-card p{margin:8px 0 20px;color:#748178;line-height:1.45}
      .create-profile-card form{display:grid;gap:14px}.create-profile-card label{display:grid;gap:6px;text-align:left}.create-profile-card label span{font-size:.78rem;font-weight:800;color:#5f6e66}
      .create-profile-card input,.create-profile-card select{box-sizing:border-box;width:100%;min-width:0;min-height:52px;border:1px solid rgba(38,53,45,.12);border-radius:16px;background:#fff;color:#26352d;padding:0 14px;font:700 16px Nunito,system-ui,sans-serif;outline:none}
      .create-profile-card input:focus,.create-profile-card select:focus{border-color:#789d7e;box-shadow:0 0 0 4px rgba(120,157,126,.14)}
      .create-profile-submit{min-height:54px;border:0;border-radius:17px;background:#26352d;color:#fff;font:900 1rem Nunito,system-ui,sans-serif;cursor:pointer;margin-top:4px}
      @media(max-width:800px){body.child-experience footer.public-admin-footer{margin:34px 0 74px!important;padding:18px 12px!important}body.child-experience footer.public-admin-footer a{font-size:.68rem!important}.profile-gate{box-sizing:border-box;padding:18px 14px!important;overflow:auto!important;align-items:start!important}.profile-panel{padding:8px 0 24px!important}.profile-mark{width:58px!important;height:58px!important;border-radius:20px!important;margin-bottom:12px!important}.profile-panel h1{font-size:clamp(2rem,11vw,3rem)!important}.profile-panel p{margin:10px auto 18px!important;font-size:.95rem!important}.profile-choice-grid{grid-template-columns:1fr!important;gap:10px!important;max-width:100%!important}.profile-choice{box-sizing:border-box;width:100%!important;min-height:108px!important;border-radius:22px!important;padding:13px 15px!important;grid-template-columns:64px minmax(0,1fr)!important;gap:4px 13px!important}.profile-choice-icon{width:58px!important;height:58px!important;font-size:1.55rem!important;grid-row:1/3!important}.profile-choice strong{font-size:1.05rem!important}.profile-choice span:not(.profile-choice-icon){font-size:.76rem!important}.profile-choice.parent{width:100%!important;max-width:none!important;min-height:104px!important;margin-top:10px!important}.profile-note{margin-top:12px!important}.guided-mode{margin-bottom:14px!important}.create-profile-card{padding:22px 18px 18px;border-radius:24px}.create-profile-card h2{font-size:1.55rem}.create-profile-close{top:9px;right:9px}}
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('DOMContentLoaded', () => {
    placeStatusInHeader();
    ensurePublicFooterStyle();
    ensurePublicFooter();
    ensureCreateProfileChoice();
    const observer = new MutationObserver(() => {
      placeStatusInHeader();
      ensurePublicFooter();
      ensureCreateProfileChoice();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();

// Audio player corrections: keep playback stopped at the end and expose ±10 s + progress on mobile.
(() => {
  function addPlayerStyle() {
    if (document.getElementById('mobile-player-controls-style')) return;
    const style = document.createElement('style');
    style.id = 'mobile-player-controls-style';
    style.textContent = `
      .mini-player #prev-track,.mini-player #next-track{font-weight:900;font-size:.78rem}
      @media(max-width:800px){
        body.child-experience .mini-player{grid-template-columns:1fr!important;gap:8px!important;padding:11px 12px!important;bottom:86px!important}
        body.child-experience .mini-player .player-center{display:grid!important;gap:7px!important;width:100%}
        body.child-experience .mini-player .transport{display:flex!important;justify-content:center!important;align-items:center!important;gap:12px!important}
        body.child-experience .mini-player #prev-track,body.child-experience .mini-player #next-track{display:grid!important;place-items:center!important;width:46px!important;height:46px!important;border-radius:50%!important}
        body.child-experience .mini-player .progress-line{display:grid!important;grid-template-columns:38px minmax(0,1fr) 38px!important;align-items:center!important;gap:7px!important;width:100%!important;font-size:.68rem!important}
        body.child-experience .mini-player #player-progress{width:100%!important;min-width:0!important}
      }
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('DOMContentLoaded', () => {
    addPlayerStyle();
    if (typeof player === 'undefined') return;
    const back = document.getElementById('prev-track');
    const forward = document.getElementById('next-track');
    if (back) {
      back.textContent = '−10';
      back.setAttribute('aria-label', 'Reculer de 10 secondes');
      back.title = 'Reculer de 10 secondes';
    }
    if (forward) {
      forward.textContent = '+10';
      forward.setAttribute('aria-label', 'Avancer de 10 secondes');
      forward.title = 'Avancer de 10 secondes';
    }
    window.stepTrack = function(direction) {
      if (!Number.isFinite(player.currentTime)) return;
      const duration = Number.isFinite(player.duration) ? player.duration : Infinity;
      player.currentTime = Math.max(0, Math.min(duration, player.currentTime + direction * 10));
    };
    player.addEventListener('ended', () => {
      if (Number.isFinite(player.duration)) player.currentTime = player.duration;
      const button = document.getElementById('play-pause');
      if (button) {
        button.textContent = '▶';
        button.setAttribute('aria-label', 'Réécouter depuis le début');
      }
    });
  });
})();
