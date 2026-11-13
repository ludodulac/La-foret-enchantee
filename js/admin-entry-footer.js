/* Un seul formulaire : le code est vérifié par Cloudflare, jamais dans ce fichier public. */
(() => {
  'use strict';
  const openButton=document.getElementById('forest-admin-entry');
  const gate=document.getElementById('forest-admin-gate');
  const form=document.getElementById('forest-admin-code-form');
  const input=document.getElementById('forest-admin-code');
  const error=document.getElementById('forest-admin-code-error');
  const cancel=document.getElementById('forest-admin-cancel');
  if(!openButton||!gate||!form||!input||!error||!cancel)return;
  const submit=form.querySelector('button[type=submit]');
  let previousFocus=null,busy=false;
  function showGate(){
    previousFocus=document.activeElement;
    input.value='';error.hidden=true;gate.hidden=false;input.focus();
  }
  function closeGate(){
    if(busy)return;
    gate.hidden=true;input.value='';error.hidden=true;
    if(previousFocus?.isConnected)previousFocus.focus();
  }
  openButton.addEventListener('click',showGate);
  cancel.addEventListener('click',closeGate);
  gate.addEventListener('click',event=>{if(event.target===gate)closeGate()});
  gate.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();closeGate();return}
    if(event.key==='Tab'){
      const controls=[input,cancel,submit];
      if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();submit.focus()}
      else if(!event.shiftKey&&document.activeElement===submit){event.preventDefault();input.focus()}
    }
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy)return;
    const code=input.value.trim();
    if(!code){error.textContent='Saisis ton code.';error.hidden=false;return}
    busy=true;submit.disabled=true;error.hidden=true;submit.textContent='Vérification…';
    try{
      const {error:authError}=await dbClient.auth.signInWithPassword({password:code});
      if(authError)throw authError;
      const {data:authorized,error:permissionError}=await dbClient.rpc('is_app_admin');
      if(permissionError||authorized!==true){
        await dbClient.auth.signOut();
        throw permissionError||Error('Accès refusé');
      }
      window.location.assign('admin.html');
    }catch(err){
      error.textContent=err?.message||'Code incorrect ou service inaccessible.';
      error.hidden=false;input.select();input.focus();
    }finally{busy=false;submit.disabled=false;submit.textContent='Continuer'}
  });
  if(window.location.hash==='#administration'){
    history.replaceState(null,'',window.location.pathname+window.location.search);
    showGate();
  }
})();