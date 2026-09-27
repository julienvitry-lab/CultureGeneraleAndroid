// CGWEB123 · QUESTION_FACTORY001
// QR_GAME_SEPARATION001
// FACT_TO_QR_DRAFT001
// BATCH_DEDUP001
// HUMAN_REVIEW_WORKSHOP001
// SOURCE_TRACEABILITY001
// NO_FIRESTORE_WRITE001

(() => {
  "use strict";

  const VERSION =
    "CGWEB123_QUESTION_FACTORY001_QR_GAME_SEPARATION001_FACT_TO_QR_DRAFT001_BATCH_DEDUP001_HUMAN_REVIEW_WORKSHOP001_SOURCE_TRACEABILITY001_NO_FIRESTORE_WRITE001";

  let drafts = [];
  let sourceFingerprint = "";

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

  const norm = value =>
    text(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g," ")
      .trim();

  function hash(value){
    const s=String(value ?? "");
    let h=2166136261;

    for(let i=0;i<s.length;i++){
      h ^= s.charCodeAt(i);
      h = Math.imul(h,16777619);
    }

    return (h >>> 0)
      .toString(16)
      .padStart(8,"0");
  }

  const NOISY = new Set([
    "position",
    "numero",
    "numéro",
    "total",
    "image",
    "images",
    "photo",
    "photos",
    "url",
    "lien",
    "liens",
    "source",
    "sources",
    "credit",
    "crédit",
    "credits",
    "crédits",
    "copyright",
    "licence",
    "license"
  ].map(norm));

  const IDENTITY_LABELS = new Set([
    "nom",
    "titre",
    "personnage",
    "heroine",
    "héroïne",
    "heros",
    "héros",
    "espece",
    "espèce"
  ].map(norm));

  function setStatus(message,type=""){
    const el=$("cg123Status");
    if(!el)return;
    el.textContent=message;
    el.dataset.type=type;
  }

  function sourceData(){
    return window.CGWEB122_API
      ?.getLast
      ?.() || null;
  }

  function getTarget(fiche){
    return text(
      fiche?.knowledge?.target?.value ||
      fiche?.name ||
      ""
    );
  }

  function fieldQuestion(
    target,
    label
  ){
    const key=norm(label);
    const subject=`« ${target} »`;

    if(key==="auteur" || key==="auteurs" || key==="autrice")
      return `Qui est l’auteur associé à ${subject} ?`;

    if(key==="realisateur" || key==="réalisateur")
      return `Qui a réalisé ${subject} ?`;

    if(key==="compositeur")
      return `Qui est le compositeur associé à ${subject} ?`;

    if(key==="interprete" || key==="interprète")
      return `Quel interprète est associé à ${subject} ?`;

    if(key==="acteur")
      return `Quel acteur est associé à ${subject} ?`;

    if(key==="actrice")
      return `Quelle actrice est associée à ${subject} ?`;

    if(key==="capitale")
      return `Quelle est la capitale associée à ${subject} ?`;

    if(key==="pays")
      return `Quel pays est associé à ${subject} ?`;

    if(key==="ville")
      return `Quelle ville est associée à ${subject} ?`;

    if(
      key==="lieu" ||
      key==="localisation"
    )
      return `Quel lieu est associé à ${subject} ?`;

    if(key==="nationalite" || key==="nationalité")
      return `Quelle est la nationalité associée à ${subject} ?`;

    if(key==="profession")
      return `Quelle profession est associée à ${subject} ?`;

    if(
      key==="naissance" ||
      key==="date de naissance"
    )
      return `Quelle est la date de naissance associée à ${subject} ?`;

    if(
      key==="deces" ||
      key==="décès" ||
      key==="date de deces" ||
      key==="date de décès"
    )
      return `Quelle est la date de décès associée à ${subject} ?`;

    if(key==="annee" || key==="année")
      return `Quelle année est associée à ${subject} ?`;

    if(key==="date")
      return `Quelle date est associée à ${subject} ?`;

    if(key==="genre")
      return `Quel genre est associé à ${subject} ?`;

    if(key==="langue")
      return `Quelle langue est associée à ${subject} ?`;

    if(key==="monnaie")
      return `Quelle monnaie est associée à ${subject} ?`;

    if(key==="altitude")
      return `Quelle est l’altitude de ${subject} ?`;

    if(key==="population")
      return `Quelle population est indiquée pour ${subject} ?`;

    if(key==="superficie")
      return `Quelle superficie est indiquée pour ${subject} ?`;

    if(key==="club")
      return `Quel club est associé à ${subject} ?`;

    if(key==="equipe" || key==="équipe")
      return `Quelle équipe est associée à ${subject} ?`;

    if(key==="sport")
      return `Quel sport est associé à ${subject} ?`;

    if(
      key==="nom scientifique" ||
      key==="nom latin"
    )
      return `Quel est le nom scientifique de ${subject} ?`;

    if(
      key==="description" ||
      key==="definition" ||
      key==="définition"
    )
      return `Comment peut-on définir ${subject} ?`;

    if(
      key==="oeuvre" ||
      key==="œuvre"
    )
      return `Quelle œuvre est associée à ${subject} ?`;

    return `Concernant ${subject}, quelle information est indiquée pour « ${label} » ?`;
  }

  function qualityScore(
    question,
    answer,
    label
  ){
    let score=100;

    const q=text(question);
    const a=text(answer);
    const l=norm(label);

    if(a.length<2)score-=80;
    if(a.length>300)score-=25;
    if(q.length>220)score-=15;

    if(/^info [0-9]+$/.test(l))
      score-=25;

    if(
      /^https?:\/\//i.test(a)
    ){
      score-=80;
    }

    if(
      /^[\W_]+$/.test(a)
    ){
      score-=80;
    }

    return Math.max(
      0,
      Math.min(100,score)
    );
  }

  function buildDrafts(data){

    const result=[];
    const seen=new Set();

    const sourceUrl=
      text(
        data?.themeContext?.canonicalUrl ||
        data?.themeContext?.effectiveUrl ||
        data?.effectiveUrl ||
        data?.requestedUrl
      );

    for(
      const fiche of
      Array.isArray(data?.fiches)
        ? data.fiches
        : []
    ){

      const target=getTarget(fiche);

      if(!target){
        continue;
      }

      const fields=
        Array.isArray(fiche.fields)
          ? fiche.fields
          : [];

      for(
        let fieldIndex=0;
        fieldIndex<fields.length;
        fieldIndex++
      ){

        const field=fields[fieldIndex];

        const label=
          text(field?.label);

        const answer=
          text(field?.value);

        const key=
          norm(label);

        if(
          !label ||
          !answer ||
          NOISY.has(key)
        ){
          continue;
        }

        /*
         * Les champs d'identité servant déjà à nommer la fiche
         * sont généralement tautologiques en Q/R.
         */
        if(
          IDENTITY_LABELS.has(key) &&
          norm(answer)===norm(target)
        ){
          continue;
        }

        const question=
          fieldQuestion(
            target,
            label
          );

        const dedupKey=
          norm(question) +
          "|" +
          norm(answer);

        if(
          !dedupKey ||
          seen.has(dedupKey)
        ){
          continue;
        }

        seen.add(dedupKey);

        const score=
          qualityScore(
            question,
            answer,
            label
          );

        /*
         * On conserve les candidats moyens pour examen humain,
         * mais on élimine les déchets évidents.
         */
        if(score<25){
          continue;
        }

        const fingerprint=
          hash(
            [
              sourceUrl,
              fiche.name,
              target,
              label,
              answer
            ].join("|")
          );

        result.push({

          id:
            `QR-${fingerprint}`,

          game:
            "QR",

          schema:
            "cgweb123.qr.draft.v1",

          decision:
            "pending",

          question,

          answer,

          qualityScore:
            score,

          theme:
            text(
              data?.themeContext?.theme ||
              data?.detectedTheme ||
              data?.themeContext?.heading
            ),

          source:{
            provider:
              "Quizypedia",

            url:
              sourceUrl,

            fiche:
              text(fiche.name),

            target,

            fieldLabel:
              label,

            fieldValue:
              answer,

            fieldIndex,

            fichePosition:
              text(fiche.position),

            extractionVersion:
              text(data?.version),

            factFingerprint:
              fingerprint
          }
        });
      }
    }

    return result;
  }

  function decisionLabel(value){

    if(value==="keep")
      return "Retenue";

    if(value==="reject")
      return "Écartée";

    return "À examiner";
  }

  function renderCounters(){

    const total=drafts.length;

    const pending=
      drafts.filter(
        q=>q.decision==="pending"
      ).length;

    const keep=
      drafts.filter(
        q=>q.decision==="keep"
      ).length;

    const reject=
      drafts.filter(
        q=>q.decision==="reject"
      ).length;

    const set=(id,value)=>{
      const el=$(id);
      if(el)el.textContent=String(value);
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

  function renderDraft(
    draft,
    index
  ){

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

            <div class="cg123-card-source">
              ${esc(draft.source.fiche)}
              ·
              ${esc(draft.source.fieldLabel)}
            </div>

          </div>


          <div class="cg123-quality">
            Qualité heuristique :
            <strong>
              ${Number(draft.qualityScore)}
              /100
            </strong>
          </div>

        </header>


        <div class="cg123-field">

          <label>
            Question
          </label>

          <textarea
            rows="3"
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


        <div class="cg123-decision-state">
          Statut :
          <strong>
            ${esc(
              decisionLabel(
                draft.decision
              )
            )}
          </strong>
        </div>


        <details class="cg123-trace">

          <summary>
            Traçabilité de la source
          </summary>

          <div class="cg123-trace-grid">

            <strong>Fiche</strong>
            <span>
              ${esc(draft.source.fiche)}
            </span>

            <strong>Cible</strong>
            <span>
              ${esc(draft.source.target)}
            </span>

            <strong>Champ</strong>
            <span>
              ${esc(draft.source.fieldLabel)}
            </span>

            <strong>Valeur source</strong>
            <span>
              ${esc(draft.source.fieldValue)}
            </span>

            <strong>Empreinte</strong>
            <span>
              ${esc(draft.source.factFingerprint)}
            </span>

            <strong>URL</strong>
            <a
              href="${esc(draft.source.url)}"
              target="_blank"
              rel="noopener noreferrer"
            >
              ${esc(draft.source.url)}
            </a>

          </div>

        </details>

      </article>
    `;
  }

  function bindCards(){

    document
      .querySelectorAll(
        ".cg123-card"
      )
      .forEach(card=>{

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
          .forEach(input=>{

            input.addEventListener(
              "input",
              ()=>{

                draft[
                  input.dataset.field
                ]=input.value;
              }
            );
          });


        card
          .querySelectorAll(
            "[data-decision-value]"
          )
          .forEach(button=>{

            button.addEventListener(
              "click",
              ()=>{

                draft.decision=
                  button.dataset
                    .decisionValue;

                renderFactory();
              }
            );
          });
      });
  }

  function renderFactory(){

    const list=
      $("cg123List");

    if(!list){
      return;
    }

    renderCounters();

    if(!drafts.length){

      list.innerHTML=`
        <div class="cg123-empty">
          Aucun candidat Q/R disponible.
        </div>
      `;

      return;
    }

    list.innerHTML=
      drafts
        .map(renderDraft)
        .join("");

    bindCards();
  }

  function prepare(){

    const data=
      sourceData();

    if(!data){

      setStatus(
        "Aucune extraction CGWEB122 disponible. Lance d’abord « Extraire tout le contenu ».",
        "error"
      );

      return;
    }

    const newFingerprint=
      hash(
        JSON.stringify({
          version:
            data.version,

          requestedUrl:
            data.requestedUrl,

          ficheCount:
            data.ficheCount,

          fieldCount:
            data.fieldCount
        })
      );

    drafts=
      buildDrafts(data);

    sourceFingerprint=
      newFingerprint;

    renderFactory();

    const auxCount=
      Number(
        data?.auxiliarySource
          ?.questionCount || 0
      );

    setStatus(
      `${drafts.length} candidat(s) Q/R préparé(s). ` +
      `${auxCount} question(s) QCM annexe(s) conservée(s) séparément et non convertie(s).`,
      "ok"
    );
  }

  async function exportJson(){

    const kept=
      drafts
        .filter(
          draft=>
            draft.decision==="keep"
        )
        .map(draft=>({
          ...draft,
          review:{
            decision:
              "keep",

            exportedAt:
              new Date()
                .toISOString()
          }
        }));

    if(!kept.length){

      setStatus(
        "Aucune question Q/R retenue à exporter.",
        "warn"
      );

      return;
    }

    const payload={

      schema:
        "cgweb123.qr.export.v1",

      game:
        "QR",

      factoryVersion:
        VERSION,

      sourceFingerprint,

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
        URL.createObjectURL(blob);

      const a=
        document.createElement("a");

      a.href=href;
      a.download=
        "cgweb123_qr_questions.json";

      document.body
        .appendChild(a);

      a.click();
      a.remove();

      setTimeout(
        ()=>URL.revokeObjectURL(href),
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

    if(!sourcePanel){
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
            CGWEB123
          </div>

          <h3>
            Atelier de questions Q/R
          </h3>

          <p>
            Génère des candidats pour le futur jeu
            Question / Réponse à partir des fiches extraites
            par CGWEB122.
          </p>

          <p class="cg123-separation">
            <strong>
              Jeu distinct du QCM actuel :
            </strong>
            aucune proposition A/B/C/D n'est créée,
            les questionnaires annexes restent des sources
            auxiliaires et aucune écriture Firestore n'est effectuée.
          </p>

        </div>


        <div class="cg123-actions">

          <button
            id="cg123Prepare"
            type="button"
            class="cg123-primary"
          >
            Préparer les questions Q/R
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


      <div
        id="cg123Status"
        class="cg123-status"
      >
        En attente d'une extraction CGWEB122.
      </div>


      <div class="cg123-counters">

        <div>
          <strong id="cg123CountTotal">
            0
          </strong>
          <span>
            candidats
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
            retenus
          </span>
        </div>

        <div>
          <strong id="cg123CountReject">
            0
          </strong>
          <span>
            écartés
          </span>
        </div>

      </div>


      <div
        id="cg123List"
        class="cg123-list"
      >

        <div class="cg123-empty">
          Lance d'abord l'extraction intégrale
          CGWEB122, puis prépare les questions Q/R.
        </div>

      </div>
    `;

    sourcePanel
      .insertAdjacentElement(
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
          item=>({
            ...item
          })
        ),

      getKept:
        ()=>drafts
          .filter(
            item=>
              item.decision==="keep"
          )
          .map(
            item=>({
              ...item
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

    if(install()){
      return;
    }

    const observer=
      new MutationObserver(
        ()=>{

          if(install()){
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
