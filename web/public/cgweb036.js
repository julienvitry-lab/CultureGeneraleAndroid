/* CGWEB036 FIX1 · UX_CONSOLIDATION002 */
(()=>{"use strict";
const n=s=>(s||"").replace(/\s+/g," ").trim().toLowerCase();
const text=e=>n(e&&e.textContent);
const hide=e=>e&&e.classList.add("cg36-hidden");
function cleanDevLabels(){
  const rx=/\bCGWEB\d+\b|\bDIRECTORY\d+\b|\bHOME\d+\b|\bSEARCH\d+\b|\bLEARNING_HUB\d+\b|\bDUPLICATES\d+\b/i;
  document.querySelectorAll("body *").forEach(e=>{
    if(["SCRIPT","STYLE","OPTION"].includes(e.tagName))return;
    const raw=(e.textContent||"").replace(/\s+/g," ").trim();
    if(!raw||raw.length>140||!rx.test(raw))return;
    if(e.querySelector("button,input,select,textarea,a"))return;
    if(e.children.length===0||e.matches(".k,[class*='kicker'],small,[class*='badge']"))hide(e);
  });
}
function cleanHome(){
  const title=[...document.querySelectorAll("h1,h2")].find(e=>text(e)==="culture générale");
  if(!title)return;
  [...document.querySelectorAll("button,a")].forEach(e=>{
    const t=text(e);
    if(["rechercher","répertoire","listes fun","tableau de bord"].some(x=>t.includes(x))){
      if(!e.closest("nav"))hide(e);
    }
  });
  const surprise=[...document.querySelectorAll("h2,h3,h4")].find(e=>text(e)==="question surprise");
  if(surprise)hide(surprise.closest("section,.card,article,[class*='card']")||surprise);
}
function cleanLearning(){
  if(![...document.querySelectorAll("h1,h2")].some(e=>text(e)==="apprentissage"))return;
  const v=[...document.querySelectorAll("button,a")].find(e=>text(e)==="vue d'ensemble");
  if(v){const active=v.classList.contains("active")||v.getAttribute("aria-selected")==="true";hide(v);
    if(active){const h=[...document.querySelectorAll("button,a")].find(e=>text(e)==="historique");if(h)setTimeout(()=>h.click(),0)}}
  document.body.classList.add("cg36-history-compact");
}
function plus(){
  const p=[...document.querySelectorAll("nav")].find(e=>e.querySelector("[data-cg16-plus]"));
  if(p)p.classList.add("cg36-plus-grid");
}
function run(){cleanDevLabels();cleanHome();cleanLearning();plus()}
document.readyState==="loading"?document.addEventListener("DOMContentLoaded",run):run();
new MutationObserver(run).observe(document.documentElement,{childList:true,subtree:true});
})();
