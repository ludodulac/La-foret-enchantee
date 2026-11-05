/* Nouveau classement dans le formulaire d'histoire, côté administration autorisée.
   Aucun contournement du contrôle Supabase is_app_admin ni des règles RLS. */
(() => {
  'use strict';
  const ids=['audio-cat','audio-sub','edit-audio-cat','edit-audio-sub'];
  const $=id=>document.getElementById(id);
  function categoryFor(target){return target.startsWith('edit-')?'edit-audio-cat':'audio-cat'}
  function subFor(target){return target.startsWith('edit-')?'edit-audio-sub':'audio-sub'}
  function isSub(target){return target.endsWith('-sub')}
  function message(target,value){const el=$(target+'-message');if(el)el.textContent=value||''}
  function close(target){
    const panel=$(target+'-create');if(panel)panel.hidden=true;
    const input=$(target+'-new');if(input)input.value='';
    message(target,'');
    $(target+'-create')?.querySelector('button[data-taxonomy-save]')?.removeAttribute('disabled');
  }
  function open(target){
    const catSelect=$(categoryFor(target));
    if(isSub(target)&&!catSelect?.value){
      message(target,'Choisis ou ajoute d’abord une catégorie.');
      catSelect?.focus();
      return;
    }
    for(const id of ids)if(id!==target)close(id);
    const panel=$(target+'-create');
    if(!panel)return;
    panel.hidden=false;
    message(target,'');
    $(target+'-new')?.focus();
  }
  function norm(s){return String(s||'').trim().toLocaleLowerCase('fr')}
  async function save(target){
    const input=$(target+'-new'),name=input?.value.trim(),sub=isSub(target),catId=$(categoryFor(target))?.value||'';
    if(!name){message(target,'Indique un nom.');input?.focus();return}
    if(name.length>100){message(target,'Nom trop long.');return}
    if(sub&&!catId){message(target,'Choisis d’abord une catégorie.');$(categoryFor(target))?.focus();return}
    const existing=(sub?subcategories:categories).find(c=>norm(c.name)===norm(name)&&(!sub||String(c.category_id)===String(catId)));
    const button=$(target+'-create')?.querySelector('button[data-taxonomy-save]');
    if(button)button.disabled=true;
    try{
      let id=existing?.id;
      if(!id){
        const table=sub?'subcategories':'categories',values=sub?{name,category_id:catId}:{name};
        const {data,error}=await dbClient.from(table).insert(values).select('id').single();
        if(error)throw error;
        if(!data?.id)throw Error('Impossible de confirmer l’ajout.');
        id=data.id;
      }
      await refreshData();
      renderAll();
      if(sub){
        $(categoryFor(target)).value=catId;
        updateSubSelect(target,catId);
        $(target).value=String(id);
      }else{
        $(target).value=String(id);
        const subSelect=subFor(target);
        updateSubSelect(subSelect,id);
        $(subSelect).value='';
      }
      close(target);
      showNotif(existing?'Catégorie déjà disponible : sélectionnée ✓':(sub?'Sous-catégorie ajoutée ✓':'Catégorie ajoutée ✓'));
    }catch(error){
      message(target,'Ajout impossible : '+(error?.message||String(error)));
    }finally{
      if(button)button.disabled=false;
    }
  }
  function init(){
    for(const id of ids){
      const toggle=document.querySelector('[data-taxonomy-toggle="'+id+'"]');
      const submit=document.querySelector('[data-taxonomy-save="'+id+'"]');
      const cancel=document.querySelector('[data-taxonomy-cancel="'+id+'"]');
      const input=$(id+'-new');
      if(!toggle||!submit||!cancel||!input)continue;
      toggle.addEventListener('click',()=>$(id+'-create').hidden?open(id):close(id));
      submit.addEventListener('click',()=>save(id));
      cancel.addEventListener('click',()=>close(id));
      input.addEventListener('keydown',e=>{
        if(e.key==='Escape'){e.preventDefault();close(id);toggle.focus()}
        if(e.key==='Enter'){e.preventDefault();if(!submit.disabled)save(id)}
      });
    }
    $('form-add-audio')?.addEventListener('reset',()=>{
      for(const id of ids.filter(x=>!x.startsWith('edit-')))close(id);
    });
    $('form-edit-audio')?.addEventListener('reset',()=>{
      for(const id of ids.filter(x=>x.startsWith('edit-')))close(id);
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
