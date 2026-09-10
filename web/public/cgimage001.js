// CGIMAGE001 · Firebase Storage = source officielle ; Web + cache Android.
import { getApp, getApps } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getStorage, ref, uploadBytes, deleteObject, getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-storage.js";

const VERSION="CGIMAGE001_1";
const MAX_INPUT_BYTES=12*1024*1024;
const MAIN_MAX_W=1600, MAIN_MAX_H=1200;
const THUMB_MAX_W=480, THUMB_MAX_H=360;
const urlCache=new Map();
let editorRecord=null;

const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function isCloudPath(path){
  const p=String(path||"").trim();
  return p.startsWith("users/")&&p.includes("/question-images/");
}

async function waitContext(){
  for(let i=0;i<120;i++){
    const user=window.CGWEB001?.getUser?.();
    if(user&&getApps().length&&window.CGWEB006_API)return {user,storage:getStorage(getApp()),api:window.CGWEB006_API};
    await sleep(100);
  }
  throw new Error("Contexte Firebase CGIMAGE001 indisponible.");
}

function loadBitmap(file){
  if(globalThis.createImageBitmap)return createImageBitmap(file);
  return new Promise((resolve,reject)=>{
    const img=new Image();
    const url=URL.createObjectURL(file);
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("Image illisible."))};
    img.src=url;
  });
}

function canvasBlob(canvas,type="image/webp",quality=.86){
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Conversion WebP impossible.")),type,quality));
}

async function makeVariant(bitmap,maxW,maxH,quality){
  const sourceW=Number(bitmap.width||bitmap.naturalWidth||0),sourceH=Number(bitmap.height||bitmap.naturalHeight||0);
  if(!sourceW||!sourceH)throw new Error("Dimensions d’image invalides.");
  const ratio=Math.min(1,maxW/sourceW,maxH/sourceH);
  const width=Math.max(1,Math.round(sourceW*ratio));
  const height=Math.max(1,Math.round(sourceH*ratio));
  const canvas=document.createElement("canvas");
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext("2d",{alpha:true});
  ctx.drawImage(bitmap,0,0,width,height);
  return {blob:await canvasBlob(canvas,"image/webp",quality),width,height};
}

async function prepareImage(file){
  if(!(file instanceof Blob))throw new Error("Fichier image manquant.");
  if(!String(file.type||"").startsWith("image/"))throw new Error("Le fichier sélectionné n’est pas une image.");
  if(file.size>MAX_INPUT_BYTES)throw new Error("Image trop volumineuse : 12 Mo maximum avant conversion.");
  const bitmap=await loadBitmap(file);
  try{
    const main=await makeVariant(bitmap,MAIN_MAX_W,MAIN_MAX_H,.86);
    const thumb=await makeVariant(bitmap,THUMB_MAX_W,THUMB_MAX_H,.80);
    const digest=await crypto.subtle.digest("SHA-256",await main.blob.arrayBuffer());
    const sha=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
    return {main,thumb,sha};
  }finally{
    if(typeof bitmap.close==="function")bitmap.close();
  }
}

async function urlForPath(path){
  const p=String(path||"").trim();
  if(!isCloudPath(p))return "";
  if(urlCache.has(p))return urlCache.get(p);
  const {storage}=await waitContext();
  const url=await getDownloadURL(ref(storage,p));
  urlCache.set(p,url);
  return url;
}

async function safeDelete(path){
  if(!isCloudPath(path))return;
  try{
    const {storage}=await waitContext();
    await deleteObject(ref(storage,path));
    urlCache.delete(path);
  }catch(error){
    if(error?.code!=="storage/object-not-found")console.warn("CGIMAGE001 delete",path,error);
  }
}

function safeQuestionSegment(id){return encodeURIComponent(String(id||"").trim()).replaceAll("/","%2F")}

async function uploadForQuestion(questionId,file,options={}){
  const id=String(questionId||"").trim();
  if(!id)throw new Error("ID de question manquant.");
  const {user,storage,api}=await waitContext();
  const existing=await api.byId(id);
  if(!existing)throw new Error(`Question ${id} introuvable.`);

  const prepared=await prepareImage(file);
  const folder=`users/${user.uid}/question-images/${safeQuestionSegment(id)}`;
  const key=prepared.sha.slice(0,24);
  const mainPath=`${folder}/${key}-main.webp`;
  const thumbPath=`${folder}/${key}-thumb.webp`;
  const metadata={
    contentType:"image/webp",
    cacheControl:"private,max-age=604800",
    customMetadata:{
      cgimage:VERSION,
      questionId:id,
      sha256:prepared.sha,
      originalName:String(file.name||"")
    }
  };

  await uploadBytes(ref(storage,mainPath),prepared.main.blob,metadata);
  try{
    await uploadBytes(ref(storage,thumbPath),prepared.thumb.blob,metadata);
  }catch(error){
    await safeDelete(mainPath);
    throw error;
  }

  const expectedRevision=options.expectedRevision??Number(existing.cg_revision??0);
  const patch={
    image_file:mainPath,
    image_thumb_file:thumbPath,
    image_source_url:String(options.sourceUrl||""),
    image_mime:"image/webp",
    image_width:prepared.main.width,
    image_height:prepared.main.height,
    image_bytes:prepared.main.blob.size,
    image_sha256:prepared.sha,
    image_schema:1,
    image_origin:"firebase_storage",
    image_original_name:String(file.name||""),
    image_updated_ms:Date.now(),
    is_image:1
  };

  let result;
  try{
    result=await api.update(id,patch,{expectedRevision,source:"CGIMAGE001_"+String(options.sourceOrigin||"WEB")});
    if(result?.conflict)throw Object.assign(new Error("Conflit de révision : recharge la question avant d’associer l’image."),{cgConflict:result});
  }catch(error){
    // Les nouveaux chemins sont versionnés : on peut annuler sans toucher à l'ancienne image.
    await Promise.allSettled([safeDelete(mainPath),safeDelete(thumbPath)]);
    throw error;
  }

  const oldMain=String(existing.image_file||"");
  const oldThumb=String(existing.image_thumb_file||"");
  await Promise.allSettled([
    oldMain!==mainPath?safeDelete(oldMain):Promise.resolve(),
    oldThumb!==thumbPath?safeDelete(oldThumb):Promise.resolve()
  ]);

  return {result,patch,mainPath,thumbPath};
}

async function removeForQuestion(questionId,options={}){
  const id=String(questionId||"").trim();
  const {api}=await waitContext();
  const existing=await api.byId(id);
  if(!existing)throw new Error(`Question ${id} introuvable.`);
  const expectedRevision=options.expectedRevision??Number(existing.cg_revision??0);
  const patch={
    image_file:"",image_thumb_file:"",image_source_url:"",image_mime:"",
    image_width:0,image_height:0,image_bytes:0,image_sha256:"",image_schema:1,
    image_origin:"",image_original_name:"",image_updated_ms:Date.now(),is_image:0
  };
  const result=await api.update(id,patch,{expectedRevision,source:"CGIMAGE001_DELETE"});
  if(result?.conflict)throw new Error("Conflit de révision : recharge la question avant de supprimer l’image.");
  await Promise.allSettled([safeDelete(existing.image_file),safeDelete(existing.image_thumb_file)]);
  return {result,patch};
}

async function hydrateElement(element,path){
  if(!element||element.dataset.cgimg1Loaded===path)return;
  element.dataset.cgimg1Loaded=path;
  if(!isCloudPath(path))return;
  try{
    const url=await urlForPath(path);
    if(element.dataset.cgimg1Loaded!==path)return;
    element.innerHTML=`<img loading="lazy" decoding="async" alt="Illustration de la question">`;
    element.querySelector("img").src=url;
  }catch(error){
    element.innerHTML=`<span class="cgimg1-error">Image indisponible</span>`;
    element.title=error?.message||String(error);
  }
}

function hydrateDirectory(){
  document.querySelectorAll("[data-cgimg1-path]").forEach(el=>hydrateElement(el,el.dataset.cgimg1Path||""));
}

function ensureEditor(){
  const editor=$("cg6Modal")?.querySelector(".cg6-editor");
  if(!editor)return null;
  let box=$("cgimg1Editor");
  if(box)return box;
  box=document.createElement("section");
  box.id="cgimg1Editor";
  box.className="cgimg1-editor cg6-wide";
  box.innerHTML=`
    <div class="cgimg1-editor-head"><strong>Image de la question</strong><span>CGIMAGE001 · Firebase Storage</span></div>
    <div id="cgimg1EditorPreview" class="cgimg1-editor-preview"><span>Aucune image</span></div>
    <div class="cgimg1-editor-actions">
      <input id="cgimg1EditorFile" type="file" accept="image/*">
      <button id="cgimg1EditorUpload" type="button" class="cg6-btn cg6-primary">Ajouter / remplacer</button>
      <button id="cgimg1EditorDelete" type="button" class="cg6-btn">Supprimer l’image</button>
    </div>
    <div id="cgimg1EditorState" class="cgimg1-editor-state"></div>`;
  editor.appendChild(box);
  $("cgimg1EditorFile").addEventListener("change",previewSelectedFile);
  $("cgimg1EditorUpload").addEventListener("click",uploadFromEditor);
  $("cgimg1EditorDelete").addEventListener("click",deleteFromEditor);
  return box;
}

async function renderEditor(record){
  editorRecord=record||null;
  const box=ensureEditor();if(!box)return;
  const preview=$("cgimg1EditorPreview"),del=$("cgimg1EditorDelete"),state=$("cgimg1EditorState");
  $("cgimg1EditorFile").value="";
  state.textContent="";
  const path=String(record?.image_file||"").trim();
  del.disabled=!path;
  if(!path){preview.innerHTML="<span>Aucune image</span>";return;}
  if(!isCloudPath(path)){
    preview.innerHTML=`<span>Image locale historique : ${esc(path)}<br>Elle reste compatible Android mais n’est pas encore dans Firebase Storage.</span>`;
    return;
  }
  preview.innerHTML="<span>Chargement…</span>";
  try{
    const url=await urlForPath(path);
    if(editorRecord!==record)return;
    preview.innerHTML='<img alt="Illustration actuelle">';preview.querySelector("img").src=url;
  }catch(error){preview.innerHTML=`<span class="cgimg1-error">${esc(error?.message||String(error))}</span>`}
}

function previewSelectedFile(){
  const file=$("cgimg1EditorFile")?.files?.[0],preview=$("cgimg1EditorPreview");
  if(!file){renderEditor(editorRecord);return;}
  const url=URL.createObjectURL(file);
  preview.innerHTML='<img alt="Nouvelle image sélectionnée">';
  const img=preview.querySelector("img");img.src=url;img.onload=()=>URL.revokeObjectURL(url);
}

function syncEditorRevision(result){
  const revision=Number(result?.revision||0);
  if(!revision)return;
  if(window.CGWEB006_state)window.CGWEB006_state.editorBaseRevision=revision;
  window.CGSYNC007_EDITOR_BASE_REVISION=revision;
}

async function refreshQuestionInDirectory(id){
  try{
    const api=window.CGWEB006_API;if(!api)return;
    const fresh=await api.byId(id);if(!fresh)return;
    const rows=window.CGWEB006_state?.rows||[];
    const row=rows.find(item=>String(item.id)===String(id));
    if(row)Object.assign(row,fresh);
    if(typeof window.CGWEB011_rerender==="function")window.CGWEB011_rerender();
    editorRecord=fresh;
  }catch(error){console.warn("CGIMAGE001 refresh",error)}
}

async function uploadFromEditor(){
  const file=$("cgimg1EditorFile")?.files?.[0];
  const state=$("cgimg1EditorState"),button=$("cgimg1EditorUpload");
  if(!editorRecord){state.textContent="❌ Question non chargée.";return;}
  if(!file){state.textContent="Choisis une image.";return;}
  button.disabled=true;state.textContent="Conversion WebP et envoi vers Firebase Storage…";
  try{
    const expected=Number(window.CGWEB006_state?.editorBaseRevision??editorRecord.cg_revision??0);
    const response=await uploadForQuestion(editorRecord.id,file,{expectedRevision:expected,sourceOrigin:"editor"});
    syncEditorRevision(response.result);
    await refreshQuestionInDirectory(editorRecord.id);
    state.textContent="✅ Image enregistrée dans Firebase Storage.";
    await renderEditor(editorRecord);
  }catch(error){state.textContent="❌ "+(error?.message||String(error))}
  finally{button.disabled=false}
}

async function deleteFromEditor(){
  const state=$("cgimg1EditorState"),button=$("cgimg1EditorDelete");
  if(!editorRecord)return;
  if(!confirm("Supprimer l’image associée à cette question ?"))return;
  button.disabled=true;state.textContent="Suppression…";
  try{
    const expected=Number(window.CGWEB006_state?.editorBaseRevision??editorRecord.cg_revision??0);
    const response=await removeForQuestion(editorRecord.id,{expectedRevision:expected});
    syncEditorRevision(response.result);
    await refreshQuestionInDirectory(editorRecord.id);
    state.textContent="✅ Image supprimée.";
    await renderEditor(editorRecord);
  }catch(error){state.textContent="❌ "+(error?.message||String(error))}
  finally{button.disabled=false}
}

window.addEventListener("cgweb006-rendered",hydrateDirectory);
window.addEventListener("cgweb006-editor-opened",event=>renderEditor(event.detail?.record));

window.CGIMAGE001={
  version:VERSION,
  isCloudPath,
  urlForPath,
  uploadForQuestion,
  removeForQuestion,
  hydrateDirectory
};

document.documentElement.dataset.cgimage001="1";
ensureEditor();
hydrateDirectory();
console.info("CGIMAGE001 actif · Storage central + cache Android");
