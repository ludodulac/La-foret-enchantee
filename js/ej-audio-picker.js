/* Ludodio (écoute) : sélecteur de liens approuvés par l'administration Espace Jeunesse.
   Aucun bruitage ni projet de montage Ludodio Studio n'entre ici. */
(function(){
"use strict";
const API="https://espace-jeunesse-api.rondes.workers.dev/api/ludodio/catalog";
const area=document.getElementById("ej-audio-source");
const picker=document.getElementById("ej-audio-select");
const file=document.getElementById("audio-file");
const message=document.getElementById("ej-audio-message");
const refresh=document.getElementById("ej-audio-refresh");
const player=document.getElementById("ej-audio-preview");
if(!area||!picker||!file)return;
const valid=id=>/^[0-9a-f-]{36}$/i.test(id||"");
let entries=[];
function choice(){
 const id=picker.value;
 file.required=!valid(id);
 if(valid(id)){
  file.value="";
  const selected=entries.find(x=>x.id===id);
  if(selected){
   const title=document.getElementById("audio-title-in");
   if(title&&!title.value.trim())title.value=selected.title.replace(/\.(mp3|wav)$/i,"");
   if(player){player.src=selected.url;player.hidden=false}
  }
  message.textContent="Le son sera lié à sa médiathèque d'origine, sans nouveau téléchargement.";
 }else{
  if(player){player.removeAttribute("src");player.hidden=true}
  message.textContent="Choisissez un MP3 déjà proposé par Espace Jeunesse, ou importez un fichier sur cet écran.";
 }
}
async function load(){
 picker.disabled=true;refresh.disabled=true;message.textContent="Recherche des sons proposés par Espace Jeunesse…";
 try{
  const r=await fetch(API,{cache:"no-store"});
  if(!r.ok)throw Error("Connexion indisponible ("+r.status+")");
  const data=await r.json();entries=(data.audios||[]).filter(x=>valid(x.id)&&/^https:\/\//.test(x.url));
  const prev=picker.value;
  picker.replaceChildren(new Option("— Choisir un MP3 Espace Jeunesse —",""));
  for(const m of entries)picker.add(new Option(m.title,m.id));
  if(entries.some(x=>x.id===prev))picker.value=prev;
  choice();
  if(!entries.length)message.textContent="Aucun MP3 proposé depuis Espace Jeunesse pour l'instant.";
 }catch(e){message.textContent="Bibliothèque indisponible : "+e.message}
 finally{picker.disabled=false;refresh.disabled=false}
}
picker.addEventListener("change",choice);
file.addEventListener("change",()=>{
 if(file.files.length){picker.value="";choice()}
});
area.closest("form")?.addEventListener("reset",()=>{
 setTimeout(()=>{picker.value="";choice()},0);
});
refresh.addEventListener("click",()=>void load());
window.EJAudioPicker={selectedId:()=>valid(picker.value)?picker.value:""};
void load();
})();