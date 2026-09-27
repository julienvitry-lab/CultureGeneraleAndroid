// CGWEB122 FIX2 · IMAGE_CREDIT_CAPTURE001
// SOURCE_METADATA_SEPARATION001
// RAW_FIDELITY_COMPLETE001
// CGWEB122 FIX1 · DOM_FIELD_PAIR_CAPTURE001
// COMPOUND_LABEL_PRESERVE001
// RAW_FIELD_FIDELITY001
// IMAGE_URL_EXPOSE001
// CGWEB122 · QUIZYPEDIA_FULL_FICHE_CAPTURE001
// RAW_SOURCE_ARCHIVE001
// STRUCTURED_KNOWLEDGE_EXTRACTION001

(() => {
  "use strict";

  const VERSION =
    "CGWEB122_FIX2_IMAGE_CREDIT_CAPTURE001_SOURCE_METADATA_SEPARATION001_RAW_FIDELITY_COMPLETE001";

  const ENDPOINT =
    "https://europe-west1-culturegeneralesync.cloudfunctions.net/cgimport002Quizypedia";

  let lastResult = null;


  const $ = id =>
    document.getElementById(id);


  const esc = value =>
    String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#39;");


  function setStatus(
    text,
    type=""
  ){
    const el=$("cg122Status");

    if(!el)return;

    el.textContent=text;
    el.dataset.type=type;
  }


  async function api(
    url
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
      await user.getIdToken();


    const response=
      await fetch(
        ENDPOINT,
        {
          method:"POST",

          headers:{
            "content-type":
              "application/json",

            "authorization":
              `Bearer ${token}`
          },

          body:
            JSON.stringify({
              url,
              mode:"full_fiches"
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


  function renderFields(
    fiche
  ){

    const rows=
      (fiche.fields || [])
        .map(field=>`
          <tr>
            <th>${esc(field.label)}</th>
            <td>${esc(field.value)}</td>
          </tr>
        `)
        .join("");


    return rows || `
      <tr>
        <td colspan="2">
          Aucun champ structuré détecté.
        </td>
      </tr>
    `;
  }


  function renderImageUrls(
    fiche
  ){

    const urls=
      [...new Set(
        (fiche.imageUrls || [])
          .map(url=>
            String(url || "").trim()
          )
          .filter(url=>
            /^https?:\/\//i.test(url)
          )
      )];


    if(!urls.length){
      return "";
    }


    return `
      <div class="cg122-image-urls">

        <div class="cg122-image-urls-title">
          URL image${urls.length>1 ? "s" : ""}
        </div>

        ${urls.map((url,index)=>`
          <div class="cg122-image-url-row">

            <span>
              ${urls.length>1 ? `${index+1}.` : ""}
            </span>

            <a
              href="${esc(url)}"
              target="_blank"
              rel="noopener noreferrer"
            >${esc(url)}</a>

          </div>
        `).join("")}

      </div>
    `;
  }


  function renderSourceMetadata(
    fiche
  ){

    const entries=
      fiche
        ?.sourceMetadata
        ?.image
        ?.entries || [];


    if(!entries.length){
      return "";
    }


    return `
      <div class="cg122-source-meta">

        <div class="cg122-source-meta-title">
          Métadonnées source
        </div>

        ${entries.map(entry=>`
          <div class="cg122-source-meta-row">

            <strong>
              ${esc(entry.label)}
            </strong>

            <span>
              ${esc(entry.value)}
            </span>

          </div>
        `).join("")}

      </div>
    `;
  }


  function renderFiche(
    fiche
  ){

    const knowledge=
      fiche.knowledge || {};


    const target=
      knowledge.target?.value ||
      fiche.name ||
      "Fiche";


    const image=
      fiche.primaryImageUrl
        ? `
          <img
            class="cg122-image"
            src="${esc(fiche.primaryImageUrl)}"
            alt=""
            loading="lazy"
          >
        `
        : "";


    return `
      <article class="cg122-fiche">

        <header class="cg122-fiche-head">

          <div>
            <div class="cg122-position">
              ${esc(fiche.position || "")}
            </div>

            <h4>${esc(target)}</h4>

            ${
              target !== fiche.name
                ? `<div class="cg122-source-title">
                    Source : ${esc(fiche.name)}
                   </div>`
                : ""
            }
          </div>

          ${image}

        </header>


        <table class="cg122-table">
          <tbody>
            ${renderFields(fiche)}
          </tbody>
        </table>


        ${renderImageUrls(fiche)}

        ${renderSourceMetadata(fiche)}


        <div class="cg122-fidelity">

          <span>
            Source champs :
            <strong>
              ${
                fiche.fieldSource === "dom"
                  ? "DOM Quizypedia"
                  : "fallback texte"
              }
            </strong>
          </span>

          <span>
            Couverture texte brut :
            <strong>
              ${Number(
                fiche.fieldFidelity?.coveredLineCount || 0
              )}
              /
              ${Number(
                fiche.fieldFidelity?.rawLineCount || 0
              )}
            </strong>
          </span>

          ${
            Number(
              fiche.fieldFidelity?.uncoveredCount || 0
            ) > 0
              ? `<span class="cg122-fidelity-warn">
                  ⚠ ${Number(
                    fiche.fieldFidelity.uncoveredCount
                  )} ligne(s) non couverte(s)
                 </span>`
              : `<span>✓ couverture complète</span>`
          }

        </div>


        <details class="cg122-details">

          <summary>
            Texte brut de la fiche
          </summary>

          <pre>${esc(fiche.rawText || "")}</pre>

        </details>


        <details class="cg122-details">

          <summary>
            Structure des connaissances
          </summary>

          <pre>${esc(
            JSON.stringify(
              knowledge,
              null,
              2
            )
          )}</pre>

        </details>

      </article>
    `;
  }


  function render(
    data
  ){

    const meta=
      $("cg122Meta");

    const list=
      $("cg122List");


    if(
      !meta ||
      !list
    ){
      return;
    }


    const expected=
      Number(
        data.expectedFiches || 0
      );


    const actual=
      Number(
        data.ficheCount || 0
      );


    meta.innerHTML=`
      <strong>
        ${actual.toLocaleString("fr-FR")}
        ${
          expected
            ? ` / ${expected.toLocaleString("fr-FR")}`
            : ""
        }
        fiche(s)
      </strong>

      <span>
        ${Number(data.fieldCount || 0).toLocaleString("fr-FR")}
        champ(s) structuré(s)
      </span>

      <span>
        ${
          data.complete
            ? "✓ série complète"
            : "⚠ série possiblement incomplète"
        }
      </span>

      <span>
        ${
          Number(
            data.sourceArchive?.pageCount || 0
          )
        }
        page(s) source archivée(s)
      </span>
    `;


    list.innerHTML=
      (data.fiches || [])
        .map(renderFiche)
        .join("");


    setStatus(
      `Extraction terminée : ${actual} fiche(s).`,
      data.complete
        ? "ok"
        : "warn"
    );
  }


  async function capture(){

    const url=
      $("cgimp2Url")
        ?.value
        ?.trim();


    if(!url){

      setStatus(
        "Saisis d'abord une adresse Quizypedia.",
        "error"
      );

      return;
    }


    const button=
      $("cg122Capture");


    if(button){
      button.disabled=true;
    }


    setStatus(
      "Extraction intégrale des fiches Quizypedia…",
      "busy"
    );


    const meta=
      $("cg122Meta");

    const list=
      $("cg122List");


    if(meta)meta.innerHTML="";
    if(list)list.innerHTML="";


    try{

      const data=
        await api(url);


      lastResult=data;

      render(data);

    }catch(error){

      setStatus(
        `Erreur : ${error.message}`,
        "error"
      );

    }finally{

      if(button){
        button.disabled=false;
      }
    }
  }


  async function copyJson(){

    if(!lastResult){

      setStatus(
        "Aucune extraction à copier.",
        "warn"
      );

      return;
    }


    try{

      await navigator
        .clipboard
        .writeText(
          JSON.stringify(
            lastResult,
            null,
            2
          )
        );


      setStatus(
        "JSON complet copié dans le presse-papiers.",
        "ok"
      );

    }catch{

      setStatus(
        "Impossible de copier automatiquement le JSON.",
        "error"
      );
    }
  }


  function install(){

    const host=
      $("cgimport002Panel");


    if(!host){
      return false;
    }


    if(
      $("cgweb122Panel")
    ){
      return true;
    }


    const panel=
      document.createElement(
        "section"
      );


    panel.id=
      "cgweb122Panel";


    panel.className=
      "cg122-panel";


    panel.innerHTML=`

      <header class="cg122-head">

        <div>

          <div class="cg122-kicker">
            CGWEB122
          </div>

          <h3>
            Extraction intégrale des fiches
          </h3>

          <p>
            Utilise l'adresse Quizypedia saisie ci-dessus.
            Cette opération ne crée aucune question et
            ne modifie pas Firestore.
          </p>

        </div>


        <div class="cg122-actions">

          <button
            id="cg122Capture"
            type="button"
            class="cg122-primary"
          >
            Extraire les fiches complètes
          </button>

          <button
            id="cg122Copy"
            type="button"
          >
            Copier le JSON
          </button>

        </div>

      </header>


      <div
        id="cg122Status"
        class="cg122-status"
      >
        Prêt.
      </div>


      <div
        id="cg122Meta"
        class="cg122-meta"
      ></div>


      <div
        id="cg122List"
        class="cg122-list"
      ></div>
    `;


    host.appendChild(
      panel
    );


    $("cg122Capture")
      ?.addEventListener(
        "click",
        capture
      );


    $("cg122Copy")
      ?.addEventListener(
        "click",
        copyJson
      );


    window.CGWEB122_API={
      version:VERSION,
      capture,
      getLast:()=>lastResult
    };


    document.documentElement
      .dataset
      .cgweb122=VERSION;


    return true;
  }


  function boot(){

    if(
      install()
    ){
      return;
    }


    const observer=
      new MutationObserver(()=>{

        if(
          install()
        ){
          observer.disconnect();
        }
      });


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
