// CGWEB123 FIX5
// REVIEW_BEFORE_REJECT001
// SOFT_GENERATION_GUARD001
// THEME_GROUNDING001
// REJECTION_DIAGNOSTICS001
// TOKEN_COST_METER001
// OPENAI_USAGE_CAPTURE001
// STANDARD_COST_CALC001
// BATCH_COST_PROJECTION001
// SAMPLE_COST_HISTORY001
// QUIZYPEDIA_6000_PROJECTION001
// NO_EXTRA_AI_CALL001
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
    "CGWEB123_FIX5_REVIEW_BEFORE_REJECT001_SOFT_GENERATION_GUARD001_THEME_GROUNDING001_REJECTION_DIAGNOSTICS001";


  const ENDPOINT =
    "https://europe-west1-culturegeneralesync.cloudfunctions.net/cgweb123AiQuestionFactory";


  const TOKEN_SAMPLE_STORAGE_KEY =
    "CGWEB123_TOKEN_COST_SAMPLE_V1";


  const PROJECT_THEME_COUNT =
    6000;


  const PROJECT_FICHE_COUNT =
    60000;


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


  function numberOrZero(
    value
  ){

    const n=
      Number(
        value || 0
      );


    return Number.isFinite(n)
      ? n
      : 0;
  }


  function fmtTokens(
    value
  ){

    return new Intl.NumberFormat(
      "fr-FR"
    ).format(
      Math.round(
        numberOrZero(
          value
        )
      )
    );
  }


  function fmtUSD(
    value,
    digits=4
  ){

    const n=
      numberOrZero(
        value
      );


    return new Intl.NumberFormat(
      "fr-FR",
      {
        style:"currency",
        currency:"USD",
        minimumFractionDigits:
          digits,
        maximumFractionDigits:
          digits
      }
    ).format(
      n
    );
  }


  function fmtUSDProjection(
    value
  ){

    return new Intl.NumberFormat(
      "fr-FR",
      {
        style:"currency",
        currency:"USD",
        minimumFractionDigits:2,
        maximumFractionDigits:2
      }
    ).format(
      numberOrZero(
        value
      )
    );
  }


  function readTokenSamples(){

    try{

      const raw=
        localStorage.getItem(
          TOKEN_SAMPLE_STORAGE_KEY
        );


      if(!raw){
        return {
          version:1,
          themes:{}
        };
      }


      const parsed=
        JSON.parse(
          raw
        );


      if(
        !parsed ||
        typeof parsed!=="object"
      ){
        throw new Error(
          "invalid"
        );
      }


      return {

        version:1,

        themes:
          parsed.themes &&
          typeof parsed.themes==="object"
            ? parsed.themes
            : {}
      };


    }catch{

      return {
        version:1,
        themes:{}
      };
    }
  }


  function writeTokenSamples(
    history
  ){

    try{

      localStorage.setItem(
        TOKEN_SAMPLE_STORAGE_KEY,
        JSON.stringify(
          history
        )
      );

    }catch{
      // Le compteur courant reste disponible.
    }
  }


  function tokenSampleKey(
    corpus
  ){

    const url=
      text(
        corpus
          ?.theme
          ?.url
      )
        .toLowerCase();


    if(url){
      return url;
    }


    const title=
      text(
        corpus
          ?.theme
          ?.title
      )
        .toLowerCase();


    if(title){
      return `title:${title}`;
    }


    return "";
  }


  function recordTokenSample(
    data,
    corpus
  ){

    const meter=
      data?.tokenMeter;


    if(
      !meter?.total
    ){
      return;
    }


    const key=
      tokenSampleKey(
        corpus
      );


    /*
     * Sans identité stable du thème, on évite
     * de polluer l'échantillon.
     */
    if(!key){
      return;
    }


    const history=
      readTokenSamples();


    history.themes[
      key
    ]={

      title:
        text(
          corpus
            ?.theme
            ?.title
        ),

      url:
        text(
          corpus
            ?.theme
            ?.url
        ),

      ficheCount:
        numberOrZero(
          meter.ficheCount
        ),

      standardCostUSD:
        numberOrZero(
          meter
            ?.total
            ?.standardCostUSD
        ),

      batchEquivalentCostUSD:
        numberOrZero(
          meter
            ?.total
            ?.batchEquivalentCostUSD
        ),

      inputTokens:
        numberOrZero(
          meter
            ?.total
            ?.inputTokens
        ),

      outputTokens:
        numberOrZero(
          meter
            ?.total
            ?.outputTokens
        ),

      reasoningTokens:
        numberOrZero(
          meter
            ?.total
            ?.reasoningTokens
        ),

      measuredAt:
        new Date()
          .toISOString()
    };


    writeTokenSamples(
      history
    );
  }


  function tokenSampleStats(){

    const history=
      readTokenSamples();


    const rows=
      Object.values(
        history.themes || {}
      )
        .filter(
          row=>
            row &&
            typeof row==="object"
        );


    const themeCount=
      rows.length;


    const ficheCount=
      rows.reduce(
        (
          sum,
          row
        )=>
          sum +
          numberOrZero(
            row.ficheCount
          ),
        0
      );


    const standardTotal=
      rows.reduce(
        (
          sum,
          row
        )=>
          sum +
          numberOrZero(
            row.standardCostUSD
          ),
        0
      );


    const batchTotal=
      rows.reduce(
        (
          sum,
          row
        )=>
          sum +
          numberOrZero(
            row.batchEquivalentCostUSD
          ),
        0
      );


    const averageStandardTheme=
      themeCount
        ? standardTotal /
          themeCount
        : 0;


    const averageBatchTheme=
      themeCount
        ? batchTotal /
          themeCount
        : 0;


    const averageStandardFiche=
      ficheCount
        ? standardTotal /
          ficheCount
        : 0;


    const averageBatchFiche=
      ficheCount
        ? batchTotal /
          ficheCount
        : 0;


    return {

      themeCount,

      ficheCount,

      standardTotal,

      batchTotal,

      averageStandardTheme,

      averageBatchTheme,

      averageStandardFiche,

      averageBatchFiche,

      projectedStandardByThemes:
        averageStandardTheme *
        PROJECT_THEME_COUNT,

      projectedBatchByThemes:
        averageBatchTheme *
        PROJECT_THEME_COUNT,

      projectedStandardByFiches:
        averageStandardFiche *
        PROJECT_FICHE_COUNT,

      projectedBatchByFiches:
        averageBatchFiche *
        PROJECT_FICHE_COUNT
    };
  }


  function renderTokenMeter(){

    const host=
      $("cg123TokenMeter");


    if(!host){
      return;
    }


    const meter=
      lastMeta?.tokenMeter;


    const sample=
      tokenSampleStats();


    if(!meter){

      host.innerHTML=`

        <section class="cg123-token-box">

          <header class="cg123-token-head">

            <div>
              <strong>
                Coût API / tokens
              </strong>

              <span>
                TOKEN_COST_METER001
              </span>
            </div>

          </header>


          <p class="cg123-token-wait">
            Le coût réel du traitement apparaîtra ici
            après la prochaine génération IA.
          </p>


          ${
            sample.themeCount
              ? `
                <div class="cg123-token-sample-mini">
                  Échantillon mémorisé :
                  <strong>
                    ${sample.themeCount}
                    thème(s)
                  </strong>
                  ·
                  ${fmtTokens(sample.ficheCount)}
                  fiche(s)
                </div>
              `
              : ""
          }

        </section>
      `;

      return;
    }


    const total=
      meter.total || {};


    const generation=
      meter.generation || {};


    const review=
      meter.review || {};


    host.innerHTML=`

      <section class="cg123-token-box">

        <header class="cg123-token-head">

          <div>

            <strong>
              Coût API / tokens
            </strong>

            <span>
              GPT-5.6 Sol · tarifs au
              ${esc(meter.pricingSnapshot || "")}
            </span>

          </div>

          <button
            type="button"
            id="cg123TokenReset"
            class="cg123-token-reset"
          >
            Réinitialiser l’échantillon
          </button>

        </header>


        <div class="cg123-token-grid">

          <div>
            <strong>
              ${fmtTokens(total.inputTokens)}
            </strong>
            <span>
              tokens d’entrée
            </span>
          </div>

          <div>
            <strong>
              ${fmtTokens(total.cachedInputTokens)}
            </strong>
            <span>
              entrée en cache
            </span>
          </div>

          <div>
            <strong>
              ${fmtTokens(total.cacheWriteTokens)}
            </strong>
            <span>
              écritures cache
            </span>
          </div>

          <div>
            <strong>
              ${fmtTokens(total.outputTokens)}
            </strong>
            <span>
              tokens de sortie
            </span>
          </div>

          <div>
            <strong>
              ${fmtTokens(total.reasoningTokens)}
            </strong>
            <span>
              dont raisonnement
            </span>
          </div>

          <div>
            <strong>
              ${fmtTokens(total.apiCalls)}
            </strong>
            <span>
              appels API
            </span>
          </div>

        </div>


        <div class="cg123-cost-main">

          <div>

            <span>
              Coût du thème — Standard
            </span>

            <strong>
              ${fmtUSD(
                total.standardCostUSD,
                4
              )}
            </strong>

          </div>


          <div>

            <span>
              Équivalent Batch
            </span>

            <strong>
              ${fmtUSD(
                total.batchEquivalentCostUSD,
                4
              )}
            </strong>

          </div>


          <div>

            <span>
              Standard / fiche
            </span>

            <strong>
              ${fmtUSD(
                meter
                  ?.perFiche
                  ?.standardCostUSD,
                5
              )}
            </strong>

          </div>

        </div>


        <details class="cg123-token-details">

          <summary>
            Détail génération / relecture
          </summary>


          <div class="cg123-token-detail-grid">

            <div>

              <strong>
                Génération
              </strong>

              <span>
                ${fmtTokens(generation.inputTokens)}
                entrée
              </span>

              <span>
                ${fmtTokens(generation.outputTokens)}
                sortie
              </span>

              <span>
                ${fmtTokens(generation.reasoningTokens)}
                raisonnement
              </span>

              <span>
                ${fmtUSD(
                  generation.standardCostUSD,
                  4
                )}
              </span>

            </div>


            <div>

              <strong>
                Relecture
              </strong>

              <span>
                ${fmtTokens(review.inputTokens)}
                entrée
              </span>

              <span>
                ${fmtTokens(review.outputTokens)}
                sortie
              </span>

              <span>
                ${fmtTokens(review.reasoningTokens)}
                raisonnement
              </span>

              <span>
                ${fmtUSD(
                  review.standardCostUSD,
                  4
                )}
              </span>

            </div>

          </div>

        </details>


        <div class="cg123-token-projection">

          <h4>
            Projection Quizypedia
          </h4>


          <p>
            Échantillon :
            <strong>
              ${sample.themeCount}
              thème(s)
            </strong>
            ·
            <strong>
              ${fmtTokens(sample.ficheCount)}
              fiche(s)
            </strong>.
            Un même thème retraité remplace sa mesure précédente.
          </p>


          ${
            sample.themeCount
              ? `

                <div class="cg123-projection-grid">

                  <div>

                    <span>
                      Moyenne Standard / thème
                    </span>

                    <strong>
                      ${fmtUSD(
                        sample.averageStandardTheme,
                        4
                      )}
                    </strong>

                  </div>


                  <div>

                    <span>
                      6 000 thèmes — Standard
                    </span>

                    <strong>
                      ${fmtUSDProjection(
                        sample.projectedStandardByThemes
                      )}
                    </strong>

                  </div>


                  <div>

                    <span>
                      60 000 fiches — Standard
                    </span>

                    <strong>
                      ${fmtUSDProjection(
                        sample.projectedStandardByFiches
                      )}
                    </strong>

                  </div>


                  <div>

                    <span>
                      6 000 thèmes — Batch
                    </span>

                    <strong>
                      ${fmtUSDProjection(
                        sample.projectedBatchByThemes
                      )}
                    </strong>

                  </div>


                  <div>

                    <span>
                      60 000 fiches — Batch
                    </span>

                    <strong>
                      ${fmtUSDProjection(
                        sample.projectedBatchByFiches
                      )}
                    </strong>

                  </div>

                </div>

              `
              : `
                <p>
                  Aucune projection statistique :
                  aucun thème n’est encore dans l’échantillon.
                </p>
              `
          }


          <p class="cg123-token-note">
            Le coût Batch est une simulation.
            CGWEB123 utilise actuellement le traitement Standard.
            Les reasoning tokens sont déjà compris
            dans les tokens de sortie facturés.
          </p>

        </div>

      </section>
    `;


    $("cg123TokenReset")
      ?.addEventListener(
        "click",
        ()=>{

          if(
            !confirm(
              "Réinitialiser tout l’échantillon de coûts TOKEN_COST_METER001 ?"
            )
          ){
            return;
          }


          try{

            localStorage.removeItem(
              TOKEN_SAMPLE_STORAGE_KEY
            );

          }catch{
            // rien
          }


          renderTokenMeter();
        }
      );
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
          lastMeta?.preReviewCount ??
          lastMeta?.candidateCount ??
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
            <span>Pré-review</span>
            <span>Relecture</span>
            <span>Finales</span>
            <span>État / diagnostic</span>
          </div>


          ${coverage.map(
            row=>{

              const diagnostics=
                Array.isArray(
                  row.diagnostics
                )
                  ? row.diagnostics
                  : [];


              const preReview=
                Number(
                  row.preReviewCount ??
                  row.candidateCount ??
                  0
                );


              const reviewQuestions=
                Number(
                  row.reviewQuestionCount ||
                  0
                );


              const reviewRejects=
                Number(
                  row.reviewRejectedCount ||
                  0
                );


              const finalRejects=
                Number(
                  row.finalFilterRejectedCount ||
                  0
                );


              const finalCount=
                Number(
                  row.reviewedCount ||
                  0
                );


              return `

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
                    ${preReview}
                    ${
                      Number(row.softFlaggedCount || 0)>0
                        ? `<small>
                             ${Number(row.softFlaggedCount)}
                             à réparer
                           </small>`
                        : ""
                    }
                  </span>

                  <span>
                    ${reviewQuestions}
                    ${
                      reviewRejects>0
                        ? `<small>
                             ${reviewRejects}
                             rejet IA
                           </small>`
                        : ""
                    }
                  </span>

                  <span>
                    ${finalCount}
                    ${
                      finalRejects>0
                        ? `<small>
                             ${finalRejects}
                             rejet final
                           </small>`
                        : ""
                    }
                  </span>

                  <span class="cg123-diagnostic-cell">

                    <strong>
                      ${
                        row.status==="error"
                          ? `⚠ ${esc(row.reason || "Erreur")}`
                          : finalCount>0
                            ? `✓ ${esc(row.reason || "exploitée")}`
                            : `— ${esc(row.reason || "aucune question retenue")}`
                      }
                    </strong>

                    ${
                      diagnostics.length
                        ? `
                          <details class="cg123-rejection-details">

                            <summary>
                              ${diagnostics.length}
                              diagnostic(s)
                            </summary>

                            <ul>
                              ${diagnostics.map(
                                diagnostic=>`
                                  <li>
                                    <strong>
                                      ${esc(diagnostic.stage || "")}
                                    </strong>
                                    ·
                                    ${esc(diagnostic.code || "")}
                                    —
                                    ${esc(diagnostic.reason || "")}
                                  </li>
                                `
                              ).join("")}
                            </ul>

                          </details>
                        `
                        : ""
                    }

                  </span>

                </div>
              `;
            }
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
    renderTokenMeter();


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


      /*
       * SAMPLE_COST_HISTORY001
       *
       * Le même thème remplace sa mesure antérieure,
       * afin qu'un thème testé plusieurs fois ne pèse
       * pas artificiellement plusieurs fois dans la moyenne.
       */
      recordTokenSample(
        data,
        corpus
      );


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
          Relecture : avant rejet
        </span>

        <span>
          Pré-filtres : souples
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

        <span>
          Coût : mesure réelle des tokens API
        </span>

      </div>


      <div
        id="cg123Status"
        class="cg123-status"
      >
        En attente d’une extraction CGWEB122.
      </div>


      <div
        id="cg123TokenMeter"
        class="cg123-token-meter"
      >

        <section class="cg123-token-box">

          <p class="cg123-token-wait">
            Le coût API réel apparaîtra après la génération.
          </p>

        </section>

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
            candidats pré-review
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
