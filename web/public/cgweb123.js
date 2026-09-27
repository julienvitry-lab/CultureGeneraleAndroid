// CGWEB123 FIX1 · AI_QUESTION_FACTORY001
// FULL_FICHE_AI_CONTEXT001
// AI_EDITORIAL_GENERATION001
// AI_REVIEW_PASS001
// SOURCE_GROUNDING001
// ANNEX_AS_SOURCE001
// MECHANICAL_GENERATOR_REMOVE001
// TAUTOLOGY_GUARD001
// GENERIC_QUESTION_BAN001
// QR_GAME_SEPARATION002
// NO_FIRESTORE_WRITE002

(() => {
  "use strict";


  const VERSION =
    "CGWEB123_FIX1_AI_QUESTION_FACTORY001";


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


    if(
      raw.length<=max
    ){
      return raw;
    }


    return (
      raw.slice(
        0,
        max
      ) +
      " […]"
    );
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
              questionnaire
                ?.label ||
              questionnaire
                ?.title
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
    targetCount
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
              targetCount
            })
        }
      );


    const raw=
      await response.text();


    let data;


    try{

      data=
        JSON.parse(raw);

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

    const total=
      drafts.length;


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


    const set=(
      id,
      value
    )=>{

      const el=$(id);

      if(el){
        el.textContent=
          String(value);
      }
    };


    set(
      "cg123CountTotal",
      total
    );

    set(
      "cg123CountPending",
      pending
    );

    set(
      "cg123CountKeep",
      keep
    );

    set(
      "cg123CountReject",
      reject
    );


    const exportButton=
      $("cg123Export");


    if(exportButton){
      exportButton.disabled=
        keep===0;
    }
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

            <div class="cg123-ai-badge">
              IA · ${esc(draft.model || "")}
              · double passe
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

    const list=
      $("cg123List");


    if(!list){
      return;
    }


    renderCounters();


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
        .map(renderCard)
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


    const button=
      $("cg123Prepare");


    const targetCount=
      Math.max(
        3,
        Math.min(
          25,
          Number(
            $("cg123Target")
              ?.value ||
            10
          )
        )
      );


    const corpus=
      buildCorpus(
        source
      );


    if(button){

      button.disabled=true;

      button.textContent=
        "Rédaction IA en cours…";
    }


    setStatus(
      "Passe 1 : rédaction des questions. Passe 2 : relecture éditoriale. L’opération peut prendre plusieurs dizaines de secondes.",
      "busy"
    );


    drafts=[];
    render();


    try{

      const data=
        await callFactory(
          corpus,
          targetCount
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


      if(
        drafts.length
      ){

        setStatus(
          `IA terminée : ${Number(data.generatedCount || 0)} candidat(s) rédigé(s), ` +
          `${Number(data.preReviewCount || 0)} passé(s) au filtre initial, ` +
          `${Number(data.reviewedCount || 0)} retenu(s) après relecture. ` +
          `Aucune écriture Firestore.`,
          "ok"
        );

      }else{

        setStatus(
          `L’IA n’a conservé aucune question suffisamment solide sur ce corpus. ` +
          `${Number(data.generatedCount || 0)} candidat(s) avaient été envisagé(s). ` +
          `Aucune écriture Firestore.`,
          "warn"
        );
      }


    }catch(error){

      drafts=[];
      render();


      setStatus(
        `Erreur IA : ${error.message}`,
        "error"
      );


    }finally{

      if(button){

        button.disabled=false;

        button.textContent=
          "Préparer les questions Q/R avec l’IA";
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
        "cgweb123.qr.ai.export.v1",

      game:
        "QR",

      factoryVersion:
        VERSION,

      model:
        lastMeta?.model || "",

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
        .writeText(json);


      setStatus(
        `${kept.length} question(s) Q/R retenue(s) copiée(s) en JSON. Aucune écriture Firestore.`,
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
        document
          .createElement(
            "a"
          );


      a.href=href;

      a.download=
        "cgweb123_ai_qr_questions.json";


      document.body
        .appendChild(a);


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
        `${kept.length} question(s) Q/R exportée(s). Aucune écriture Firestore.`,
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
            CGWEB123 FIX1
          </div>

          <h3>
            Fabrique IA de questions Q/R
          </h3>

          <p>
            L’IA étudie l’ensemble du corpus documentaire,
            rédige de véritables questions de culture générale
            puis effectue une seconde passe de relecture.
          </p>

          <p class="cg123-separation">

            <strong>
              Jeu Q/R distinct du QCM actuel.
            </strong>

            Les questionnaires annexes sont uniquement des sources.
            Aucune question n’est enregistrée dans Firestore.

          </p>

        </div>


        <div class="cg123-config">

          <label>

            Nombre cible

            <select id="cg123Target">
              <option value="5">5</option>
              <option value="8">8</option>
              <option value="10" selected>10</option>
              <option value="12">12</option>
              <option value="15">15</option>
              <option value="20">20</option>
              <option value="25">25</option>
            </select>

          </label>


          <button
            id="cg123Prepare"
            type="button"
            class="cg123-primary"
          >
            Préparer les questions Q/R avec l’IA
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
          Source stricte : CGWEB122
        </span>

        <span>
          Rédaction : GPT-5.6 Sol
        </span>

        <span>
          Relecture : GPT-5.6 Sol
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


      <div class="cg123-counters">

        <div>
          <strong id="cg123CountTotal">
            0
          </strong>
          <span>
            questions IA
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


      <div
        id="cg123List"
        class="cg123-list"
      >

        <div class="cg123-empty">
          Extrais d’abord un thème avec CGWEB122,
          puis lance la rédaction IA.
        </div>

      </div>
    `;


    /*
     * Placement volontairement AVANT le détail énorme
     * des questionnaires annexes et des fiches.
     */
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

            observer
              .disconnect();
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
