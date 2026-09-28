// CGWEB123 FIX3
// STANDALONE_QUESTION001
// MIXED_DOMAIN_CONTEXT001
// CONTEXT_ANCHOR001
// AMBIGUITY_REWRITE001
// FULL_FICHE_COVERAGE001
// PER_FICHE_AI_GENERATION001
// PER_FICHE_QUOTA001
// GLOBAL_AI_REVIEW001
// COVERAGE_REPORT001
// SOURCE_GROUNDING002
// QR_GAME_SEPARATION003
// NO_FIRESTORE_WRITE003

(() => {
  "use strict";


  const VERSION =
    "CGWEB123_FIX3_STANDALONE_QUESTION001_MIXED_DOMAIN_CONTEXT001_CONTEXT_ANCHOR001_AMBIGUITY_REWRITE001";


  const ENDPOINT =
    "https://europe-west1-culturegeneralesync.cloudfunctions.net/cgweb123AiQuestionFactory";


  let drafts=[];
  let lastMeta=null;


  const $ = id =>
    document.getElementById(id);


  const esc = value =>
    String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#39;");


  const text = value =>
    String(value ?? "")
      .replace(/\s+/g," ")
      .trim();


  const cut = (
    value,
    max
  ) => {

    const raw=
      String(
        value ?? ""
      ).trim();


    return raw.length<=max
      ? raw
      : raw.slice(
          0,
          max
        ) + " […]";
  };


  function setStatus(
    message,
    type=""
  ){

    const el=
      $("cg123Status");


    if(!el){
      return;
    }


    el.textContent=
      message;

    el.dataset.type=
      type;
  }


  function sourceData(){

    return window
      .CGWEB122_API
      ?.getLast
      ?.() || null;
  }


  function buildCorpus(
    data
  ){

    const ctx=
      data?.themeContext || {};


    const fiches=
      (
        Array.isArray(
          data?.fiches
        )
          ? data.fiches
          : []
      )
        .map(
          fiche=>({

            name:
              text(
                fiche?.name
              ),

            target:
              text(
                fiche
                  ?.knowledge
                  ?.target
                  ?.value ||
                fiche?.name
              ),

            position:
              text(
                fiche?.position
              ),

            fields:
              (
                Array.isArray(
                  fiche?.fields
                )
                  ? fiche.fields
                  : []
              )
                .map(
                  field=>({

                    label:
                      text(
                        field?.label
                      ),

                    value:
                      cut(
                        field?.value,
                        5000
                      )
                  })
                )
                .filter(
                  field=>
                    field.label &&
                    field.value
                ),

            rawText:
              cut(
                fiche?.rawText,
                9000
              )
          })
        );


    const annexQuestions=[];


    for(
      const questionnaire of
      data
        ?.auxiliarySource
        ?.questionnaires || []
    ){

      for(
        const q of
        questionnaire
          ?.questions || []
      ){

        annexQuestions.push({

          questionnaire:
            text(
              questionnaire?.label ||
              questionnaire?.title
            ),

          question:
            text(
              q?.question
            ),

          answer:
            text(
              q?.correct_text
            ),

          detail:
            cut(
              q?.detail,
              4000
            ),

          sourceFiche:
            text(
              q?.source_fiche
            )
        });
      }
    }


    return {

      theme:{

        title:
          text(
            ctx.heading ||
            ctx.theme ||
            ctx.pageTitle
          ),

        description:
          cut(
            ctx.metaDescription,
            3000
          ),

        paragraphs:
          (
            Array.isArray(
              ctx.paragraphs
            )
              ? ctx.paragraphs
              : []
          )
            .slice(
              0,
              20
            )
            .map(
              value=>
                cut(
                  value,
                  2500
                )
            ),

        url:
          text(
            ctx.canonicalUrl ||
            ctx.effectiveUrl ||
            data?.requestedUrl
          )
      },

      fiches,

      annexQuestions
    };
  }


  async function callFactory(
    corpus,
    maxPerFiche
  ){

    const user=
      window.CGWEB001
        ?.getUser
        ?.();


    if(
      !user?.getIdToken
    ){

      throw new Error(
        "Utilisateur Firebase non connecté."
      );
    }


    const token=
      await user
        .getIdToken();


    const response=
      await fetch(
        ENDPOINT,
        {

          method:
            "POST",

          headers:{

            "content-type":
              "application/json",

            "authorization":
              `Bearer ${token}`
          },

          body:
            JSON.stringify({
              corpus,
              maxPerFiche
            })
        }
      );


    const raw=
      await response.text();


    let data;


    try{

      data=
        JSON.parse(
          raw
        );

    }catch{

      throw new Error(
        `HTTP ${response.status} : réponse JSON invalide.`
      );
    }


    if(
      !response.ok ||
      !data?.ok
    ){

      throw new Error(
        data?.error ||
        `HTTP ${response.status}`
      );
    }


    return data;
  }


  function renderCounters(){

    const pending=
      drafts.filter(
        row=>
          row.decision==="pending"
      ).length;


    const keep=
      drafts.filter(
        row=>
          row.decision==="keep"
      ).length;


    const reject=
      drafts.filter(
        row=>
          row.decision==="reject"
      ).length;


    const values={

      cg123CountCoverage:
        lastMeta
          ? `${Number(lastMeta.analyzedFicheCount || 0)}/${Number(lastMeta.totalFicheCount || 0)}`
          : "0/0",

      cg123CountFichesQuestions:
        Number(
          lastMeta?.ficheWithQuestionCount ||
          0
        ),

      cg123CountGenerated:
        Number(
          lastMeta?.candidateCount ||
          0
        ),

      cg123CountTotal:
        drafts.length,

      cg123CountPending:
        pending,

      cg123CountKeep:
        keep,

      cg123CountReject:
        reject
    };


    for(
      const [
        id,
        value
      ] of Object.entries(
        values
      )
    ){

      const el=$(id);

      if(el){
        el.textContent=
          String(value);
      }
    }


    const exportButton=
      $("cg123Export");


    if(exportButton){

      exportButton.disabled=
        keep===0;
    }
  }


  function renderCoverage(){

    const host=
      $("cg123Coverage");


    if(!host){
      return;
    }


    const coverage=
      Array.isArray(
        lastMeta?.coverage
      )
        ? lastMeta.coverage
        : [];


    if(
      !coverage.length
    ){

      host.innerHTML="";
      return;
    }


    host.innerHTML=`

      <details
        class="cg123-coverage"
        open
      >

        <summary>
          Couverture des fiches :
          ${Number(lastMeta.analyzedFicheCount || 0)}
          /
          ${Number(lastMeta.totalFicheCount || 0)}
          analysée(s)
        </summary>


        <div class="cg123-coverage-table">

          <div class="cg123-coverage-head">
            <span>Fiche</span>
            <span>IA</span>
            <span>Après filtres</span>
            <span>Finales</span>
            <span>État</span>
          </div>


          ${coverage.map(
            row=>`

              <div
                class="cg123-coverage-row"
                data-status="${esc(row.status || "")}"
              >

                <span>
                  ${esc(row.fiche_name || row.fiche_id || "")}
                </span>

                <span>
                  ${Number(row.generatedCount || 0)}
                </span>

                <span>
                  ${Number(row.candidateCount || 0)}
                </span>

                <span>
                  ${Number(row.reviewedCount || 0)}
                </span>

                <span>
                  ${
                    row.status==="error"
                      ? `⚠ ${esc(row.reason || "Erreur")}`
                      : Number(row.reviewedCount || 0)>0
                        ? "✓ exploitée"
                        : `— ${esc(row.reason || "aucune question retenue")}`
                  }
                </span>

              </div>
            `
          ).join("")}

        </div>

      </details>
    `;
  }


  function renderCard(
    draft,
    index
  ){

    const sources=
      Array.isArray(
        draft.source_fiches
      )
        ? draft.source_fiches
        : [];


    const evidence=
      Array.isArray(
        draft.evidence
      )
        ? draft.evidence
        : [];


    return `
      <article
        class="cg123-card"
        data-index="${index}"
        data-decision="${esc(draft.decision)}"
      >

        <header class="cg123-card-head">

          <div>

            <div class="cg123-card-id">
              ${esc(draft.id)}
            </div>

            <div class="cg123-primary-source">
              Fiche principale :
              <strong>
                ${esc(draft.primary_fiche_name || "")}
              </strong>
            </div>

            <div class="cg123-ai-badge">
              IA · ${esc(draft.model || "")}
              · génération par fiche
              · relecture globale
            </div>

            <div class="cg123-standalone-badge">
              ✓ Contexte autonome
              ${
                draft.context_anchor
                  ? ` · ancrage : ${esc(draft.context_anchor)}`
                  : " · aucun ancrage supplémentaire nécessaire"
              }
            </div>

          </div>

        </header>


        <div class="cg123-field">

          <label>
            Question
          </label>

          <textarea
            rows="4"
            data-field="question"
          >${esc(draft.question)}</textarea>

        </div>


        <div class="cg123-field">

          <label>
            Réponse
          </label>

          <textarea
            rows="2"
            data-field="answer"
          >${esc(draft.answer)}</textarea>

        </div>


        <div class="cg123-decisions">

          <button
            type="button"
            data-decision-value="keep"
            class="${
              draft.decision==="keep"
                ? "is-active"
                : ""
            }"
          >
            ✓ Retenir
          </button>

          <button
            type="button"
            data-decision-value="pending"
            class="${
              draft.decision==="pending"
                ? "is-active"
                : ""
            }"
          >
            À examiner
          </button>

          <button
            type="button"
            data-decision-value="reject"
            class="${
              draft.decision==="reject"
                ? "is-active"
                : ""
            }"
          >
            × Écarter
          </button>

        </div>


        <details class="cg123-trace">

          <summary>
            Sources et contrôle éditorial
          </summary>


          ${
            sources.length
              ? `
                <div class="cg123-source-block">

                  <strong>
                    Fiche(s) source
                  </strong>

                  <ul>
                    ${sources.map(
                      value=>`
                        <li>
                          ${esc(value)}
                        </li>
                      `
                    ).join("")}
                  </ul>

                </div>
              `
              : ""
          }


          ${
            evidence.length
              ? `
                <div class="cg123-source-block">

                  <strong>
                    Éléments documentaires utilisés
                  </strong>

                  <ul>
                    ${evidence.map(
                      value=>`
                        <li>
                          ${esc(value)}
                        </li>
                      `
                    ).join("")}
                  </ul>

                </div>
              `
              : ""
          }


          ${
            draft.ambiguity_note
              ? `
                <div class="cg123-context-control">

                  <strong>
                    Contrôle hors contexte
                  </strong>

                  <p>
                    ${esc(draft.ambiguity_note)}
                  </p>

                </div>
              `
              : ""
          }


          ${
            draft.review_note
              ? `
                <div class="cg123-review-note">

                  <strong>
                    Relecture IA
                  </strong>

                  <p>
                    ${esc(draft.review_note)}
                  </p>

                </div>
              `
              : ""
          }

        </details>

      </article>
    `;
  }


  function bindCards(){

    document
      .querySelectorAll(
        ".cg123-card"
      )
      .forEach(
        card=>{

          const index=
            Number(
              card.dataset.index
            );


          const draft=
            drafts[index];


          if(!draft){
            return;
          }


          card
            .querySelectorAll(
              "[data-field]"
            )
            .forEach(
              input=>{

                input.addEventListener(
                  "input",
                  ()=>{

                    draft[
                      input.dataset.field
                    ]=
                      input.value;
                  }
                );
              }
            );


          card
            .querySelectorAll(
              "[data-decision-value]"
            )
            .forEach(
              button=>{

                button.addEventListener(
                  "click",
                  ()=>{

                    draft.decision=
                      button.dataset
                        .decisionValue;

                    render();
                  }
                );
              }
            );
        }
      );
  }


  function render(){

    renderCounters();
    renderCoverage();


    const list=
      $("cg123List");


    if(!list){
      return;
    }


    if(
      !drafts.length
    ){

      list.innerHTML=`
        <div class="cg123-empty">
          Aucune question IA disponible.
        </div>
      `;

      return;
    }


    list.innerHTML=
      drafts
        .map(
          renderCard
        )
        .join("");


    bindCards();
  }


  async function prepare(){

    const source=
      sourceData();


    if(!source){

      setStatus(
        "Lance d’abord « Extraire tout le contenu » avec CGWEB122.",
        "error"
      );

      return;
    }


    const ficheCount=
      Array.isArray(
        source?.fiches
      )
        ? source.fiches.length
        : 0;


    if(
      !ficheCount
    ){

      setStatus(
        "L’extraction ne contient aucune fiche.",
        "error"
      );

      return;
    }


    const maxPerFiche=
      Math.max(
        1,
        Math.min(
          5,
          Number(
            $("cg123PerFiche")
              ?.value ||
            3
          )
        )
      );


    const button=
      $("cg123Prepare");


    const corpus=
      buildCorpus(
        source
      );


    if(button){

      button.disabled=true;

      button.textContent=
        "Analyse de toutes les fiches…";
    }


    drafts=[];
    lastMeta=null;
    render();


    setStatus(
      `${ficheCount} fiche(s) vont être analysées. ` +
      `Maximum ${maxPerFiche} question(s) par fiche, puis relecture globale. ` +
      `L’opération peut prendre plusieurs minutes.`,
      "busy"
    );


    try{

      const data=
        await callFactory(
          corpus,
          maxPerFiche
        );


      lastMeta=data;


      drafts=
        (
          Array.isArray(
            data.questions
          )
            ? data.questions
            : []
        )
          .map(
            row=>({
              ...row,
              decision:
                "pending"
            })
          );


      render();


      const total=
        Number(
          data.totalFicheCount ||
          0
        );

      const analyzed=
        Number(
          data.analyzedFicheCount ||
          0
        );

      const errors=
        Number(
          data.errorFicheCount ||
          0
        );


      if(
        errors>0
      ){

        setStatus(
          `Analyse terminée avec anomalie : ${analyzed}/${total} fiche(s) analysée(s), ` +
          `${errors} en erreur, ${Number(data.candidateCount || 0)} candidat(s), ` +
          `${Number(data.reviewedCount || 0)} question(s) finale(s). ` +
          `Aucune écriture Firestore.`,
          "warn"
        );

      }else{

        setStatus(
          `Analyse complète : ${analyzed}/${total} fiche(s) traitée(s), ` +
          `${Number(data.ficheWithQuestionCount || 0)} fiche(s) représentée(s) dans le lot final, ` +
          `${Number(data.candidateCount || 0)} candidat(s), ` +
          `${Number(data.reviewedCount || 0)} question(s) après relecture globale. ` +
          `Aucune écriture Firestore.`,
          "ok"
        );
      }


    }catch(error){

      drafts=[];
      lastMeta=null;
      render();


      setStatus(
        `Erreur IA : ${error.message}`,
        "error"
      );


    }finally{

      if(button){

        button.disabled=false;

        button.textContent=
          "Analyser toutes les fiches avec l’IA";
      }
    }
  }


  async function exportJson(){

    const kept=
      drafts.filter(
        row=>
          row.decision==="keep"
      );


    if(
      !kept.length
    ){

      setStatus(
        "Aucune question retenue à exporter.",
        "warn"
      );

      return;
    }


    const payload={

      schema:
        "cgweb123.qr.ai.export.v3",

      game:
        "QR",

      factoryVersion:
        VERSION,

      model:
        lastMeta?.model || "",

      maxPerFiche:
        lastMeta?.maxPerFiche || null,

      coverage:
        lastMeta?.coverage || [],

      exportedAt:
        new Date()
          .toISOString(),

      count:
        kept.length,

      questions:
        kept
    };


    const json=
      JSON.stringify(
        payload,
        null,
        2
      );


    try{

      await navigator
        .clipboard
        .writeText(
          json
        );


      setStatus(
        `${kept.length} question(s) retenue(s) copiée(s) en JSON.`,
        "ok"
      );


    }catch{

      const blob=
        new Blob(
          [json],
          {
            type:
              "application/json"
          }
        );


      const href=
        URL.createObjectURL(
          blob
        );


      const a=
        document.createElement(
          "a"
        );


      a.href=
        href;

      a.download=
        "cgweb123_fix2_qr_questions.json";


      document.body
        .appendChild(
          a
        );


      a.click();
      a.remove();


      setTimeout(
        ()=>
          URL.revokeObjectURL(
            href
          ),
        1000
      );


      setStatus(
        `${kept.length} question(s) retenue(s) exportée(s).`,
        "ok"
      );
    }
  }


  function install(){

    const sourcePanel=
      $("cgweb122Panel");

    const meta=
      $("cg122Meta");


    if(
      !sourcePanel ||
      !meta
    ){
      return false;
    }


    if(
      $("cgweb123Panel")
    ){
      return true;
    }


    const panel=
      document.createElement(
        "section"
      );


    panel.id=
      "cgweb123Panel";

    panel.className=
      "cg123-panel";


    panel.innerHTML=`

      <header class="cg123-head">

        <div>

          <div class="cg123-kicker">
            CGWEB123 FIX2
          </div>

          <h3>
            Fabrique IA de questions Q/R
          </h3>

          <p>
            Chaque fiche est désormais analysée individuellement.
            Une fiche riche peut fournir plusieurs questions ;
            une fiche pauvre peut n’en fournir aucune.
            Chaque question est contrôlée comme si elle apparaissait
            seule parmi des domaines totalement différents.
          </p>

          <p class="cg123-separation">

            <strong>
              Toutes les fiches sont examinées avant la relecture globale.
            </strong>

            Le jeu Q/R reste totalement distinct du QCM actuel
            et aucune écriture Firestore n’est effectuée.

          </p>

        </div>


        <div class="cg123-config">

          <label>

            Questions max. par fiche

            <select id="cg123PerFiche">
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3" selected>3</option>
              <option value="4">4</option>
              <option value="5">5</option>
            </select>

          </label>


          <button
            id="cg123Prepare"
            type="button"
            class="cg123-primary"
          >
            Analyser toutes les fiches avec l’IA
          </button>


          <button
            id="cg123Export"
            type="button"
            disabled
          >
            Exporter les retenues
          </button>

        </div>

      </header>


      <div class="cg123-ai-info">

        <span>
          Couverture : toutes les fiches
        </span>

        <span>
          Génération : par fiche
        </span>

        <span>
          Relecture : globale
        </span>

        <span>
          Questions : autonomes hors thème
        </span>

        <span>
          Modèle : GPT-5.6 Sol
        </span>

        <span>
          Firestore : aucune écriture
        </span>

      </div>


      <div
        id="cg123Status"
        class="cg123-status"
      >
        En attente d’une extraction CGWEB122.
      </div>


      <div class="cg123-counters cg123-counters-fix2">

        <div>
          <strong id="cg123CountCoverage">
            0/0
          </strong>
          <span>
            fiches analysées
          </span>
        </div>

        <div>
          <strong id="cg123CountFichesQuestions">
            0
          </strong>
          <span>
            fiches avec question
          </span>
        </div>

        <div>
          <strong id="cg123CountGenerated">
            0
          </strong>
          <span>
            candidats
          </span>
        </div>

        <div>
          <strong id="cg123CountTotal">
            0
          </strong>
          <span>
            questions finales
          </span>
        </div>

        <div>
          <strong id="cg123CountPending">
            0
          </strong>
          <span>
            à examiner
          </span>
        </div>

        <div>
          <strong id="cg123CountKeep">
            0
          </strong>
          <span>
            retenues
          </span>
        </div>

        <div>
          <strong id="cg123CountReject">
            0
          </strong>
          <span>
            écartées
          </span>
        </div>

      </div>


      <div id="cg123Coverage"></div>


      <div
        id="cg123List"
        class="cg123-list"
      >

        <div class="cg123-empty">
          Extrais d’abord un thème avec CGWEB122,
          puis lance l’analyse de toutes les fiches.
        </div>

      </div>
    `;


    meta.insertAdjacentElement(
      "afterend",
      panel
    );


    $("cg123Prepare")
      ?.addEventListener(
        "click",
        prepare
      );


    $("cg123Export")
      ?.addEventListener(
        "click",
        exportJson
      );


    window.CGWEB123_API={

      version:
        VERSION,

      prepare,

      getDrafts:
        ()=>drafts.map(
          row=>({
            ...row
          })
        ),

      getCoverage:
        ()=>(
          lastMeta?.coverage || []
        ).map(
          row=>({
            ...row
          })
        )
    };


    document
      .documentElement
      .dataset
      .cgweb123=
        VERSION;


    return true;
  }


  function boot(){

    if(
      install()
    ){
      return;
    }


    const observer=
      new MutationObserver(
        ()=>{

          if(
            install()
          ){

            observer.disconnect();
          }
        }
      );


    observer.observe(
      document.body,
      {
        childList:true,
        subtree:true
      }
    );
  }


  if(
    document.readyState===
    "loading"
  ){

    document.addEventListener(
      "DOMContentLoaded",
      boot,
      {
        once:true
      }
    );

  }else{

    boot();
  }

})();
