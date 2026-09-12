async function signIn(email, password) {
  const { data, error } = await dbClient.auth.signInWithPassword({ email, password });
  return { data, error };
}

async function signOut() {
  await dbClient.auth.signOut();
  window.location.href = 'index.html';
}

async function getSession() {
  const { data } = await dbClient.auth.getSession();
  return data?.session ?? null;
}

async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = 'login.html?next=admin.html';
    return null;
  }

  const { data: isAdmin, error } = await dbClient.rpc('is_app_admin');
  if (error || isAdmin !== true) {
    console.warn('Accès administration refusé', error || 'Compte non autorisé');
    await dbClient.auth.signOut();
    window.location.href = 'login.html?unauthorized=1&next=admin.html';
    return null;
  }
  return session;
}

function loadAdminScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.addEventListener('load', () => resolve(src), { once: true });
    script.addEventListener('error', () => reject(new Error(`Impossible de charger ${src}`)), { once: true });
    document.body.appendChild(script);
  });
}

const isAdminPage = location.pathname.split('/').pop() === 'admin.html';

if (isAdminPage) {
  document.documentElement.classList.add('admin-auth-pending');
  const gateStyle = document.createElement('style');
  gateStyle.textContent = '.admin-auth-pending body{visibility:hidden}';
  document.head.appendChild(gateStyle);

  window.adminSessionPromise = requireAuth();

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'css/admin-2026.css';
  document.head.appendChild(css);

  const coverCss = document.createElement('link');
  coverCss.rel = 'stylesheet';
  coverCss.href = 'css/admin-covers.css';
  document.head.appendChild(coverCss);

  const storyFlowCss = document.createElement('link');
  storyFlowCss.rel = 'stylesheet';
  storyFlowCss.href = 'css/admin-story-flow.css';
  document.head.appendChild(storyFlowCss);

  document.addEventListener('DOMContentLoaded', async () => {
    const session = await window.adminSessionPromise;
    if (!session) return;

    const wrap = document.querySelector('.admin-wrap');
    if (wrap && !document.querySelector('.admin-intro')) {
      const intro = document.createElement('section');
      intro.className = 'admin-intro';
      intro.innerHTML = `
        <div>
          <div class="eyebrow">Studio de publication</div>
          <h1>Gérer La Forêt Enchantée</h1>
          <p>Histoires, journal et catégories sont réunis ici.</p>
        </div>
        <div class="admin-search">
          <input id="admin-global-search" type="search" placeholder="Filtrer les éléments affichés…" aria-label="Filtrer les contenus de l’administration">
          <button type="button" class="btn-primary" data-action="new-audio" style="margin-top:8px;width:100%">＋ Nouvelle histoire</button>
        </div>`;
      wrap.prepend(intro);
    }

    try {
      await loadAdminScript('js/admin-cover-editor.js?v=20260912-final-cover-images');
      await loadAdminScript('js/admin-story-flow.js');
      await loadAdminScript('js/admin-blog-safety.js');
      await loadAdminScript('js/admin-ux.js');
      document.documentElement.classList.remove('admin-auth-pending');
    } catch (error) {
      console.error('Initialisation du back-office incomplète', error);
      document.body.innerHTML = '<main style="padding:3rem;font-family:Inter,sans-serif;color:#fff;background:#09100d;min-height:100vh"><h1>Administration indisponible</h1><p>Une composante de sécurité ou d’interface n’a pas pu être chargée. Recharge la page avant toute modification.</p></main>';
      document.documentElement.classList.remove('admin-auth-pending');
    }
  });
}
