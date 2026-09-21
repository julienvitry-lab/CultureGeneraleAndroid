(() => {
  "use strict";

  const VERSION = "CGWEB109";
  const q = (s, root=document) => root.querySelector(s);
  const qa = (s, root=document) => [...root.querySelectorAll(s)];
  const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

  function selectedIds(){
    const nativeIds = window.CGWEB018_API?.selectedIds?.();
    if (Array.isArray(nativeIds)) return nativeIds.map(String);
    const mirror = window.CGWEB039?.ids?.();
    return Array.isArray(mirror) ? mirror.map(String) : [];
  }

  function updateDirectorySelectionUi(){
    const ids = selectedIds();
    const count = q("#cg18Selected");
    const exp = q("#cgweb109ExportCsv");
    if (count) count.textContent = `${ids.length.toLocaleString("fr-FR")} sélectionnée(s)`;
    if (exp) exp.disabled = ids.length === 0;
  }

  function csvEscape(value){
    const s = String(value ?? "");
    return `"${s.replace(/"/g, '""')}"`;
  }

  function exportSelectionCsv(){
    const ids = selectedIds();
    if (!ids.length) return;

    // Le miroir CGWEB039 conserve les contextes des sélections traversant plusieurs pages.
    const contexts = window.CGWEB039?.state?.contexts;
    const visibleRows = window.CGWEB018_API?.rows?.() || [];
    const visibleMap = new Map(visibleRows.map(r => [String(r.id), r]));

    const rows = [["ID","Megatheme","Theme","Question"]];
    for (const id of ids){
      const ctx = contexts?.get?.(String(id)) || visibleMap.get(String(id)) || {};
      rows.push([
        id,
        ctx.megatheme || ctx.mega || "",
        ctx.theme || "",
        ctx.question || ""
      ]);
    }

    const csv = "\uFEFF" + rows.map(r => r.map(csvEscape).join(";")).join("\r\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `selection-questions-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }

  function installDirectory(){
    const exp = q("#cgweb109ExportCsv");
    if (exp && !exp.dataset.cgweb109){
      exp.dataset.cgweb109 = "1";
      exp.addEventListener("click", exportSelectionCsv);
    }

    // BULK_EDIT_RETIRE001 : l'ancien bandeau est conservé uniquement comme
    // service interne de contexte, mais n'est plus présenté à l'utilisateur.
    const oldToolbar = q("#cgweb039Toolbar");
    if (oldToolbar) oldToolbar.hidden = true;

    q("#cgweb039Modal")?.setAttribute("hidden","");
    q("#cgweb039Transfer")?.setAttribute("hidden","");

    updateDirectorySelectionUi();
  }

  function forceQuizypediaRoute(){
    try{
      sessionStorage.setItem("cgweb016_import","url");
      window.CGWEB016_API?.navigateImport?.("url");
    }catch(_){}
  }

  function makeFlow(){
    const page = q('[data-cg16-page-panel="import"]');
    if (!page) return null;

    let flow = q("#cgweb109QuizypediaFlow", page);
    if (!flow){
      flow = document.createElement("section");
      flow.id = "cgweb109QuizypediaFlow";
      flow.className = "cgweb109-quiz-flow";
      flow.innerHTML = `
        <section class="cgweb109-source-block">
          <div class="cgweb109-flow-head">
            <div>
              <div class="cgweb109-kicker">QUIZYPEDIA</div>
              <h2>Capture de questions</h2>
              <p>Une seule chaîne de travail : une URL ou un fichier de thèmes, puis contrôle avant création définitive.</p>
            </div>
          </div>
          <div class="cgweb109-source-grid">
            <article class="cgweb109-source-card">
              <div class="cgweb109-card-head"><strong>Un thème</strong><span>URL Quizypedia</span></div>
              <div id="cgweb109SingleMount"></div>
            </article>
            <article class="cgweb109-source-card">
              <div class="cgweb109-card-head"><strong>Plusieurs thèmes</strong><span>CSV / ODS</span></div>
              <div id="cgweb109MultiMount"></div>
            </article>
          </div>
        </section>
        <section class="cgweb109-review-block">
          <div class="cgweb109-flow-head cgweb109-review-head">
            <div>
              <div class="cgweb109-kicker">VALIDATION</div>
              <h2>Validation après capture Quizypedia</h2>
              <p>Les questions capturées restent en attente tant qu'elles ne sont pas validées.</p>
            </div>
          </div>
          <div id="cgweb109ReviewMount"></div>
        </section>`;
      page.prepend(flow);
    }
    return flow;
  }

  function moveInto(node, mount){
    if (!node || !mount || node.parentElement === mount) return false;
    mount.appendChild(node);
    return true;
  }

  function composeQuizypedia(){
    const flow = makeFlow();
    if (!flow) return;

    const single = q("#cgimport002Panel");
    const multi = q("#cgimport011Bulk");
    const control = q("#cgweb040ControlCenter");
    const review = q("#cgweb024Panel");

    moveInto(single, q("#cgweb109SingleMount"));
    moveInto(multi, q("#cgweb109MultiMount"));
    if (control && multi?.parentElement === q("#cgweb109MultiMount")){
      q("#cgweb109MultiMount").appendChild(control);
    }
    moveInto(review, q("#cgweb109ReviewMount"));

    // Titres internes allégés : les nouvelles cartes donnent déjà le contexte.
    const singleTitle = single && qa("h1,h2,h3", single)
      .find(x => norm(x.textContent).toLowerCase().includes("import quizypedia par url"));
    if (singleTitle) singleTitle.textContent = "Importer depuis une URL";

    const multiTitle = multi && qa("h1,h2,h3", multi)
      .find(x => norm(x.textContent).toLowerCase().includes("import de plusieurs thèmes"));
    if (multiTitle) multiTitle.textContent = "Importer plusieurs thèmes";

    const reviewTitle = review && qa("h1,h2,h3", review)
      .find(x => norm(x.textContent).toLowerCase().includes("validation"));
    if (reviewTitle) reviewTitle.textContent = "Questions en attente de validation";
  }

  function retireOldImportTools(){
    q("#cg16ImportNav")?.setAttribute("hidden","");
    qa('[data-cg16-import-panel="images"],[data-cg16-import-panel="migration"],[data-cg16-import-panel="recovery404"],[data-cg16-import-panel="semantic"]')
      .forEach(el => el.hidden = true);

    const primary = q('button[data-cg16-page="import"]');
    if (primary){
      primary.textContent = "Quizypedia";
      if (!primary.dataset.cgweb109){
        primary.dataset.cgweb109 = "1";
        primary.addEventListener("click", () => setTimeout(forceQuizypediaRoute, 0));
      }
    }
  }

  function retireBulkEdit(){
    qa('button[data-cg16-plus="bulk"],[data-cg16-plus-panel="bulk"]').forEach(el => el.remove());
    if (sessionStorage.getItem("cgweb016_plus") === "bulk"){
      sessionStorage.setItem("cgweb016_plus","dedup");
    }
  }

  function apply(){
    retireBulkEdit();
    retireOldImportTools();
    installDirectory();
    composeQuizypedia();
  }

  window.addEventListener("cgweb018-selection-change", updateDirectorySelectionUi);

  let timer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(apply, 40);
  });

  function boot(){
    document.documentElement.dataset.cgweb109 = VERSION;
    apply();
    observer.observe(document.body, {subtree:true, childList:true});
    setTimeout(apply, 250);
    setTimeout(apply, 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, {once:true});
  else boot();
})();
