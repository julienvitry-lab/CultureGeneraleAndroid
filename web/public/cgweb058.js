(() => {
  "use strict";

  const VERSION = "SIMILARITY_SEARCH001";
  const STOP = new Set(["de","du","des","la","le","les","un","une","et","ou","a","au","aux","en","dans","sur","sous","par","pour","avec","sans","ce","cet","cette","ces","qui","que","quoi","quel","quelle","quels","quelles","est","sont","etre","être","son","sa","ses","leur","leurs","il","elle","ils","elles","on","se","ne","pas","plus"]);

  const norm = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const clean = (v) => String(v ?? "").replace(/\s+/g," ").trim();
  const esc = (v) => clean(v).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));

  function toks(v) {
    return [...new Set(norm(v).split(/\s+/).filter((t) => t.length >= 2 && !STOP.has(t)))];
  }
  function grams(v) {
    const s = `  ${norm(v)}  `;
    const out = new Set();
    for (let i=0;i<s.length-2;i++) out.add(s.slice(i,i+3));
    return out;
  }
  function jaccard(a,b) {
    const A=new Set(a),B=new Set(b); if(!A.size&&!B.size)return 1;
    let inter=0; for(const x of A)if(B.has(x))inter++;
    return inter/(A.size+B.size-inter||1);
  }
  function diceSets(A,B) {
    if(!A.size&&!B.size)return 1;
    let inter=0; for(const x of A)if(B.has(x))inter++;
    return 2*inter/(A.size+B.size||1);
  }
  function scoreText(a,b) {
    const na=norm(a),nb=norm(b);
    if(!na||!nb)return 0;
    if(na===nb)return 100;
    return Math.round(100*(.45*jaccard(toks(a),toks(b))+.55*diceSets(grams(a),grams(b))));
  }

  function currentId() {
    const id = clean(window.CGWEB038?.context?.()?.id);
    if (id) return id;
    const raw = clean(document.getElementById("cg19Id")?.textContent);
    const m = raw.match(/#?([A-Za-z0-9_.:-]+)/);
    return m ? m[1] : "";
  }

  async function currentRecord() {
    const ctx = window.CGWEB038?.context?.();
    if (ctx?.question) return ctx;
    const id = currentId();
    if (!id) return null;
    return await window.CGWEB006_API?.byId?.(id);
  }

  function ensureModal() {
    let m=document.getElementById("cgweb058Modal"); if(m)return m;
    m=document.createElement("div");m.id="cgweb058Modal";m.className="cgweb058-overlay";m.hidden=true;
    m.innerHTML=`
      <div class="cgweb058-dialog" role="dialog" aria-modal="true" aria-label="Questions similaires">
        <header><div><strong>Questions similaires</strong><small id="cgweb058Title">Question courante</small></div><button type="button" data-cg58-close>×</button></header>
        <div class="cgweb058-actions">
          <label>Score minimum<select id="cgweb058Threshold"><option value="35">35 % · large</option><option value="50" selected>50 % · équilibré</option><option value="65">65 % · proche</option><option value="80">80 % · très proche</option></select></label>
          <button type="button" data-cg58-run>Comparer au catalogue</button>
        </div>
        <div id="cgweb058Status" class="cgweb058-status"></div>
        <div id="cgweb058List"></div>
      </div>`;
    document.body.appendChild(m);
    m.querySelector("#cgweb058Threshold").addEventListener("change",()=>run(false));
    m.addEventListener("click",(ev)=>{
      if(ev.target===m||ev.target.closest("[data-cg58-close]"))close();
      if(ev.target.closest("[data-cg58-run]"))run(true);
      const b=ev.target.closest("[data-cg58-open]");
      if(b)window.CGWEB019_API?.open?.(b.dataset.cg58Open,[b.dataset.cg58Open]);
    });
    return m;
  }

  let last = { base:null, rows:[] };

  async function compare(record, rows) {
    const baseQ=clean(record?.question);
    const baseId=clean(record?.id ?? record?.original_id ?? currentId());
    const result=[];
    let i=0;
    for(const row of rows||[]){
      const id=clean(row?.id ?? row?.original_id);
      if(id && baseId && id===baseId)continue;
      const q=clean(row?.question); if(!q)continue;
      const score=scoreText(baseQ,q);
      result.push({score,id,question:q,megatheme:clean(row?.megatheme),theme:clean(row?.theme),detail:clean(row?.detail)});
      if(++i%2500===0)await new Promise((resolve)=>setTimeout(resolve,0));
    }
    result.sort((a,b)=>b.score-a.score||a.question.localeCompare(b.question,"fr"));
    return result;
  }

  function render() {
    const m=ensureModal();
    const threshold=Number(m.querySelector("#cgweb058Threshold").value||50);
    const rows=last.rows.filter((x)=>x.score>=threshold).slice(0,100);
    m.querySelector("#cgweb058List").innerHTML=rows.length?rows.map((x)=>`
      <article class="cgweb058-row">
        <div class="cgweb058-score">${x.score}%</div>
        <div><strong>${esc(x.question)}</strong><small>${esc([x.megatheme,x.theme,x.id?`#${x.id}`:""].filter(Boolean).join(" · "))}</small>${x.detail?`<p>${esc(x.detail)}</p>`:""}</div>
        ${x.id?`<button type="button" data-cg58-open="${esc(x.id)}">Ouvrir</button>`:""}
      </article>`).join(""):`<p class="cgweb058-empty">Aucune question au-dessus de ce seuil.</p>`;
    m.querySelector("#cgweb058Status").textContent =
      `${rows.length} résultat(s) affiché(s) · ${last.rows.length.toLocaleString("fr-FR")} questions comparées.`;
  }

  async function run(forceCatalog=false) {
    const m=ensureModal(),status=m.querySelector("#cgweb058Status"),btn=m.querySelector("[data-cg58-run]");
    btn.disabled=true;
    try{
      const record=await currentRecord();
      if(!record?.question)throw new Error("Aucune question courante détectée.");
      m.querySelector("#cgweb058Title").textContent=`#${clean(record.id??record.original_id??currentId())||"?"} · ${clean(record.question).slice(0,120)}`;
      if(!window.CGWEB055?.catalog)throw new Error("CGWEB055 requis pour lire le catalogue.");
      const rows=await window.CGWEB055.catalog(forceCatalog,({loaded,total})=>{
        status.textContent=`Lecture du catalogue… ${loaded.toLocaleString("fr-FR")}${total?` / ${total.toLocaleString("fr-FR")}`:""}`;
      });
      status.textContent="Comparaison locale en cours…";
      last.base=record; last.rows=await compare(record,rows);
      render();
    }catch(e){status.textContent=e?.message||String(e)}
    finally{btn.disabled=false}
  }

  function open(){const m=ensureModal();m.hidden=false;run(false)}
  function close(){ensureModal().hidden=true}

  function installButton(){
    const host=document.getElementById("cgweb038Workspace");
    if(!host||document.getElementById("cgweb058Open"))return;
    const b=document.createElement("button");b.type="button";b.id="cgweb058Open";b.textContent="Questions similaires";
    b.addEventListener("click",open);host.appendChild(b);
  }
  installButton();
  let timer=null;
  new MutationObserver((muts)=>{
    if(!muts.some((m)=>m.addedNodes.length))return;
    clearTimeout(timer);timer=setTimeout(installButton,120);
  }).observe(document.body,{childList:true,subtree:true});

  window.CGWEB058={version:VERSION,open,run,score:scoreText,last:()=>({base:last.base,rows:last.rows.slice()})};
})();
