/* Petit code de navigation, pas un mécanisme d'authentification.
 * L'accès véritable reste protégé par Supabase et la fonction requireAuth().
 */
(() => {
  'use strict';
  const openButton=document.getElementById('forest-admin-entry');
  const gate=document.getElementById('forest-admin-gate');
  const form=document.getElementById('forest-admin-code-form');
  const input=document.getElementById('forest-admin-code');
  const error=document.getElementById('forest-admin-code-error');
  const cancel=document.getElementById('forest-admin-cancel');
  if(!openButton||!gate||!form||!input||!error||!cancel)return;
  let previousFocus=null;
  function showGate(){
    previousFocus=document.activeElement;
    input.value='';
    error.hidden=true;
    gate.hidden=false;
    input.focus();
  }
  function closeGate(){
    gate.hidden=true;
    input.value='';
    error.hidden=true;
    if(previousFocus?.isConnected)previousFocus.focus();
  }
  openButton.addEventListener('click',showGate);
  cancel.addEventListener('click',closeGate);
  gate.addEventListener('click',event=>{if(event.target===gate)closeGate()});
  gate.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();closeGate();return}
    if(event.key==='Tab'){
      const focusable=[input,cancel,form.querySelector('button[type=submit]')];
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    }
  });
  form.addEventListener('submit',event=>{
    event.preventDefault();
    if(input.value.trim().toLowerCase()!=='lfe'){
      error.textContent='Code incorrect.';
      error.hidden=false;
      input.focus();
      input.select();
      return;
    }
    // Ne délivre aucun droit administrateur : Supabase vérifie toujours la session.
    window.location.assign('admin.html');
  });
})();
