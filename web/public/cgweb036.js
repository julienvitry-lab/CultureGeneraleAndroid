/* CGWEB036 · UX_CONSOLIDATION001 */
(()=>{"use strict";
const n=s=>(s||"").replace(/\s+/g," ").trim().toLowerCase(),t=e=>n(e&&e.textContent);
const all=()=>[...document.querySelectorAll("button,a")],by=x=>all().find(e=>t(e)===n(x));
const hide=e=>e&&e.classList.add("cg36-hidden");
const block=e=>e&&(e.closest("section,.card,.panel,[class*='card'],[class*='panel'],nav")||e);
function home(){
 if(![...document.querySelectorAll("h1,h2")].some(e=>t(e)==="culture générale"))return;
 const q=[...document.querySelectorAll("h2,h3,h4")].find(e=>t(e)==="question surprise");if(q)hide(block(q));
 all().forEach(e=>{if(["rechercher","répertoire","listes fun","tableau de bord"].includes(t(e))&&!e.closest(".cg16-primary-nav,.cg16-primary-nav-fix3,.cg16-plus-nav,.cg16-plus-nav-fix3"))hide(e)})
}
function learning(){
 if(![...document.querySelectorAll("h1,h2")].some(e=>t(e)==="apprentissage"))return;
 const v=by("Vue d'ensemble");
 if(v){const a=v.classList.contains("active")||v.getAttribute("aria-selected")==="true";hide(v);if(a){const h=by("Historique");if(h)setTimeout(()=>h.click(),0)}}
 document.body.classList.add("cg36-history-compact")
}
function plus(){const p=document.querySelector(".cg16-plus-nav,.cg16-plus-nav-fix3");if(p)p.classList.add("cg36-plus-grid")}
function search(){
 const q=[...document.querySelectorAll('input[type="search"],input[type="text"]')].find(i=>n(i.placeholder).includes("mots recherch"));
 if(!q)return;q.classList.add("cg36-question-search");q.placeholder="Mot(s) dans la question, le thème ou le mégathème";
 if(!q.nextElementSibling||!q.nextElementSibling.classList.contains("cg36-search-hint")){const d=document.createElement("div");d.className="cg36-search-hint";d.textContent="Recherche aussi le texte de la question.";q.after(d)}
}
function run(){home();learning();plus();search()}
document.readyState==="loading"?document.addEventListener("DOMContentLoaded",run):run();
new MutationObserver(run).observe(document.documentElement,{childList:true,subtree:true});
})();
