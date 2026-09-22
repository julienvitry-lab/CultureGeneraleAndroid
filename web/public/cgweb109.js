(() => {
  "use strict";

  const VERSION = "CGWEB111";
  // CGWEB111_QUIZYPEDIA_CLEAN_LAYOUT001_DUPLICATE_AUTO_GUARD001_SETTINGS_NAV001_PRIMARY_NAV_4PLUSGEAR001
  // CGWEB110_IMPORT_REVIEW_RETIRE001_DIRECT_QUIZYPEDIA_IMPORT001_VALIDATION_UI_REMOVE001
  // CGWEB109_FIX4_NO_PERIODIC_LAYOUT001_NO_FORCED_SCROLL001
  // CGWEB109_FIX2_SCROLL_STABILITY001_OBSERVER_SCOPE001
  // CGWEB109_FIX1_BULK_PANEL_PURGE001_QUIZYPEDIA_SOURCE_MERGE001_PRIMARY_TABS_EQUAL001
  const q = (s, root=document) => root.querySelector(s);
  const qa = (s, root=document) => [...root.querySelectorAll(s)];
  const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const lower = (s) => norm(s).toLocaleLowerCase("fr-FR");

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
          <article class="cgweb109-source-card cgweb109-source-unified">
            <div class="cgweb109-card-head cgweb109-source-head">
              <div class="cgweb109-source-switch" role="group" aria-label="Type de source Quizypedia">
                <button type="button" id="cgweb109ModeUrl" aria-pressed="true">URL unique</button>
                <button type="button" id="cgweb109ModeFile" aria-pressed="false">Plusieurs URL · CSV / ODS</button>
              </div>
            </div>
            <div id="cgweb109SingleWrap" class="cgweb109-source-pane">
              <div id="cgweb109SingleMount"></div>
            </div>
            <div id="cgweb109MultiWrap" class="cgweb109-source-pane" hidden>
              <div id="cgweb109MultiMount"></div>
            </div>
          </article>
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

  function setQuizMode(mode){
    const next = mode === "file" ? "file" : "url";
    const singleWrap = q("#cgweb109SingleWrap");
    const multiWrap = q("#cgweb109MultiWrap");
    const urlBtn = q("#cgweb109ModeUrl");
    const fileBtn = q("#cgweb109ModeFile");

    if (singleWrap) singleWrap.hidden = next !== "url";
    if (multiWrap) multiWrap.hidden = next !== "file";
    if (urlBtn) urlBtn.setAttribute("aria-pressed", String(next === "url"));
    if (fileBtn) fileBtn.setAttribute("aria-pressed", String(next === "file"));

    try{ sessionStorage.setItem("cgweb109_quiz_mode", next); }catch(_){}
  }

  function wireQuizMode(){
    const urlBtn = q("#cgweb109ModeUrl");
    const fileBtn = q("#cgweb109ModeFile");

    if (urlBtn && !urlBtn.dataset.cgweb109fix1){
      urlBtn.dataset.cgweb109fix1 = "1";
      urlBtn.addEventListener("click", () => setQuizMode("url"));
    }
    if (fileBtn && !fileBtn.dataset.cgweb109fix1){
      fileBtn.dataset.cgweb109fix1 = "1";
      fileBtn.addEventListener("click", () => setQuizMode("file"));
    }

    let saved = "url";
    try{ saved = sessionStorage.getItem("cgweb109_quiz_mode") || "url"; }catch(_){}
    setQuizMode(saved);
  }

  function composeQuizypedia(){
    const flow = makeFlow();
    if (!flow) return;

    const single = q("#cgimport002Panel");
    const multi = q("#cgimport011Bulk");
    const control = q("#cgweb040ControlCenter");

    moveInto(single, q("#cgweb109SingleMount"));
    moveInto(multi, q("#cgweb109MultiMount"));
    if (control && multi?.parentElement === q("#cgweb109MultiMount")){
      q("#cgweb109MultiMount").appendChild(control);
    }
    wireQuizMode();

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
    // Navigation/panel CGWEB016.
    qa('button[data-cg16-plus="bulk"],[data-cg16-plus-panel="bulk"]').forEach(el => el.remove());

    // CGWEB039 reste actif en arrière-plan comme miroir de sélection CSV.
    // IMPORTANT : on NE RETIRE PLUS ses noeuds du DOM. Son propre observer les
    // recréait aussitôt, provoquant une boucle remove/rebuild et des sauts de scroll.
    qa("#cgweb039Toolbar,#cgweb039Modal,#cgweb039Transfer").forEach(el => {
      el.hidden = true;
      el.setAttribute("aria-hidden","true");
    });

    // Les anciens panneaux de modifications massives restent eux aussi dans le DOM
    // mais invisibles : aucune réinjection, aucun changement de hauteur répété.
    qa("h1,h2,h3").forEach(title => {
      const txt = lower(title.textContent);
      if (txt === "modifications massives sécurisées" || txt === "modifications massives"){
        const panel = title.closest("section,article,.panel");
        if (panel && !panel.closest("#cgweb109QuizypediaFlow")){
          panel.hidden = true;
          panel.setAttribute("aria-hidden","true");
          panel.dataset.cgweb109Retired = "1";
        }
      }
    });

    try{
      if (sessionStorage.getItem("cgweb016_plus") === "bulk"){
        sessionStorage.setItem("cgweb016_plus","dedup");
      }
    }catch(_){}
  }

  function apply(){
    retireBulkEdit();
    retireOldImportTools();
    installDirectory();
    composeQuizypedia();
  }

  window.addEventListener("cgweb018-selection-change", updateDirectorySelectionUi);

  let timer = null;

  function mutationNeedsApply(mutations){
    const selectors = [
      "#cgweb039Toolbar",
      "#cgweb039Modal",
      "#cgweb039Transfer",
      "#cgimport002Panel",
      "#cgimport011Bulk",
      "#cgweb040ControlCenter"
    ].join(",");

    return mutations.some(m => [...m.addedNodes].some(node => {
      if (node.nodeType !== 1) return false;
      if (node.matches?.(selectors) || node.querySelector?.(selectors)) return true;

      const titles = node.matches?.("h1,h2,h3")
        ? [node]
        : [...(node.querySelectorAll?.("h1,h2,h3") || [])];

      return titles.some(t => {
        const txt = lower(t.textContent);
        return txt === "modifications massives sécurisées" || txt === "modifications massives";
      });
    }));
  }

  const observer = new MutationObserver((mutations) => {
    if (!mutationNeedsApply(mutations)) return;

    clearTimeout(timer);
    timer = setTimeout(() => {
      // CGWEB109 FIX4 · NO_FORCED_SCROLL001
      // Aucun scroll programmatique : la position appartient exclusivement
      // à l'utilisateur. apply() est désormais rare grâce aux observers ciblés.
      apply();
    }, 60);
  });

  function boot(){
    document.documentElement.dataset.cgweb109 = VERSION;
    apply();

    // Observer ciblé : seules les surfaces encore utilisées peuvent déclencher une recomposition.
    observer.observe(document.body, {subtree:true, childList:true});

    // Stabilisation initiale seulement.
    setTimeout(apply, 250);
    setTimeout(apply, 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, {once:true});
  else boot();
})();
