const CGWEB019_VERSION="CGWEB131";
const CGWEB131_VERSION="CGWEB131_DIRECTORY_QR_NORMALIZE001_QUESTION_DETAIL_ANSWER001_EDITOR_QR001_LEGACY_CATALOG_COMPAT001";
// CGWEB131_QUESTION_DETAIL_ANSWER001
// CGWEB131_EDITOR_QR001
// CGWEB131_LEGACY_CATALOG_COMPAT001
const cg19$=id=>document.getElementById(id);
const cg19Esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
function cg19SetText(id,value){const e=cg19$(id);if(e)e.textContent=String(value??"");return e}
function cg19SetHtml(id,value){const e=cg19$(id);if(e)e.innerHTML=String(value??"");return e}
/*
 * CGWEB131 · LEGACY_CATALOG_COMPAT001
 *
 * answer est prioritaire.
 * Le fallback historique est centralisé dans CGQR001.
 * Les anciennes mauvaises propositions ne sont jamais affichées.
 */
function cg19ResolveAnswer(r){
  return window.CGQR001.resolveAnswer(r);
}

const CG19={id:"",record:null,list:[],editing:false};
function cg19Date(v){if(!v)return"—";try{const d=typeof v?.toDate==="function"?v.toDate():v?.seconds?new Date(v.seconds*1000):new Date(v);return Number.isNaN(d.getTime())?"—":d.toLocaleString("fr-FR")}catch(_){return"—"}}
function cg19Status(t,type=""){const e=cg19$("cg19Status");if(e){e.textContent=t;e.className=`cg19-status${type?" cg19-"+type:""}`}}
function cg19SourceLink(url,label){const u=String(url||"").trim();return /^https?:\/\//i.test(u)?`<a href="${cg19Esc(u)}" target="_blank" rel="noopener">${label}</a>`:""}
async function cg19Image(record){
  const box=cg19$("cg19Image"), phone=cg19$("cg19AndroidImage");
  if(!box&&!phone)return;
  const path=String(record?.image_file||record?.image_thumb_file||"").trim();
  const source=String(record?.image_source_url||"").trim();
  if(!path&&!/^https?:\/\//i.test(source)){
    cg19SetHtml("cg19Image","<span>Aucune image</span>");
    cg19SetHtml("cg19AndroidImage","");
    return;
  }
  cg19SetHtml("cg19Image","<span>Chargement…</span>");
  cg19SetHtml("cg19AndroidImage","<span>Chargement…</span>");
  try{
    let url="";
    if(path&&window.CGIMAGE001?.isCloudPath?.(path)){
      try{url=await window.CGIMAGE001.urlForPath(path)}catch(_){url=""}
    }
    if(!url&&/^https?:\/\//i.test(path))url=path;
    if(!url&&/^https?:\/\//i.test(source))url=source;
    if(!url){
      cg19SetHtml("cg19Image",`<span>Image indisponible : ${cg19Esc(path||source)}</span>`);
      cg19SetHtml("cg19AndroidImage","");
      return;
    }
    cg19SetHtml("cg19Image",`<img src="${cg19Esc(url)}" alt="Image de la question" loading="eager" decoding="async">`);
    cg19SetHtml("cg19AndroidImage",`<img src="${cg19Esc(url)}" alt="Aperçu Android" loading="eager" decoding="async">`);
  }catch(error){
    cg19SetHtml("cg19Image",`<span class="cg19-error">${cg19Esc(error?.message||String(error))}</span>`);
    cg19SetHtml("cg19AndroidImage","");
  }
}
function cg19HistoryPatchLabels(patch){

  const labels = {
    megatheme:"Mégathème",
    theme:"Thème",
    question:"Question",
    detail:"Détail",
    answer:"Réponse",
    status:"Statut",
    image_file:"Image",
    image_source_url:"Source image",
    url_quizypedia:"Quizypedia",
    url_internet:"Source Internet"
  };

  const visible = [];

  for(
    const key
    of Object.keys(patch || {})
  ){

    const label =
      window.CGQR001.isLegacyField(key)
        ? "Réponse"
        : labels[key] || key;

    if(
      !visible.includes(label)
    ){
      visible.push(label);
    }
  }

  return visible;
}


async function cg19History(id){

  const box =
    cg19$("cg19History");

  if(!box){
    return;
  }

  box.innerHTML =
    "Chargement…";

  try{

    const rows =
      await window
        .CGWEB019_DATA_API
        ?.history?.(
          id,
          30
        ) || [];


    box.innerHTML =
      rows.length

        ? rows.map(h=>{

            const fields =
              cg19HistoryPatchLabels(
                h.patch
              );

            return `
              <article>

                <div>
                  <strong>
                    ${cg19Esc(
                      h.operation ||
                      "update"
                    )}
                  </strong>

                  <span>
                    rév.
                    ${cg19Esc(
                      h.revision_after ??
                      h.revision_before ??
                      "—"
                    )}
                  </span>
                </div>

                <small>
                  ${cg19Date(h.created_at)}
                  ·
                  ${cg19Esc(
                    h.writer_label ||
                    h.writer_id ||
                    ""
                  )}
                </small>

                <div class="cg19-patch">
                  ${cg19Esc(
                    fields.join(", ") ||
                    "—"
                  )}
                </div>

              </article>
            `;
          }).join("")

        : `<div class="cg19-empty">
             Aucun historique CGWEB019 encore enregistré.
             Révision actuelle :
             ${cg19Esc(
               CG19.record?.cg_revision ??
               0
             )}.
           </div>`;

  }catch(error){

    box.innerHTML =
      `<div class="cg19-error">
         ${cg19Esc(
           error?.message ||
           String(error)
         )}
       </div>`;
  }
}


function cg19Render(record){

  if(
    !record ||
    !record.id
  ){

    cg19Status(
      "Fiche question invalide ou incomplète.",
      "error"
    );

    return;
  }


  CG19.record =
    record;

  CG19.id =
    String(record.id);


  const answer =
    cg19ResolveAnswer(
      record
    );


  cg19SetText(
    "cg19Id",
    `#${record.original_id ?? record.id}`
  );


  cg19SetText(
    "cg19Path",
    `${record.megatheme || ""}${
      record.theme
        ? " › " + record.theme
        : ""
    }`
  );


  cg19SetText(
    "cg19Question",
    record.question || ""
  );


  cg19SetText(
    "cg19Detail",
    record.detail || ""
  );


  /*
   * QUESTION_DETAIL_ANSWER001
   * Une seule réponse visible.
   */
  cg19SetHtml(
    "cg19Answer",
    `<span>Réponse</span>
     <b>${cg19Esc(answer || "—")}</b>`
  );


  cg19SetHtml(
    "cg19Meta",

    `<span>
       Statut :
       <b>${cg19Esc(record.status ?? "—")}</b>
     </span>` +

    `<span>
       Révision :
       <b>${cg19Esc(record.cg_revision ?? 0)}</b>
     </span>` +

    `<span>
       Image :
       <b>${Number(record.is_image || 0) === 1 ? "oui" : "non"}</b>
     </span>` +

    `<span>
       Introuvable :
       <b>${Number(record.non_trouve || 0) === 1 ? "oui" : "non"}</b>
     </span>` +

    `<span>
       Mise à jour :
       <b>${cg19Date(
         record.cg_updated_at ||
         record.updated_at
       )}</b>
     </span>`
  );


  cg19SetHtml(
    "cg19Sources",

    [
      cg19SourceLink(
        record.url_quizypedia,
        "Quizypedia"
      ),

      cg19SourceLink(
        record.url_internet,
        "Source Internet"
      ),

      cg19SourceLink(
        record.image_source_url,
        "Source image"
      )
    ]
      .filter(Boolean)
      .join(" · ") ||

      "Aucun lien source"
  );


  /*
   * Aperçu Android désormais lui aussi Q/R.
   */
  cg19SetText(
    "cg19AndroidTheme",
    record.theme ||
    record.megatheme ||
    "Culture générale"
  );


  cg19SetText(
    "cg19AndroidQuestion",
    record.question || ""
  );


  cg19SetHtml(
    "cg19AndroidAnswer",
    `<span>Réponse</span>
     <b>${cg19Esc(answer || "—")}</b>`
  );


  cg19FillForm(record);
  cg19Image(record);
  cg19History(record.id);
  cg19NavState();
}
function cg19FillForm(r){

  const fields = [
    ["Mega","megatheme"],
    ["Theme","theme"],
    ["Question","question"],
    ["Detail","detail"],
    ["StatusEdit","status"]
  ];


  for(
    const [id,key]
    of fields
  ){

    const e =
      cg19$(
        `cg19Edit${id}`
      );

    if(e){
      e.value =
        r?.[key] ??
        "";
    }
  }


  const answer =
    cg19$("cg19EditAnswer");

  if(answer){
    answer.value =
      cg19ResolveAnswer(r);
  }
}


function cg19ToggleEdit(force){

  CG19.editing =
    force ??
    !CG19.editing;

  const e =
    cg19$("cg19Editor");

  if(e){
    e.classList.toggle(
      "cg19-hidden",
      !CG19.editing
    );
  }

  cg19SetText(
    "cg19EditBtn",
    CG19.editing
      ? "Fermer l'édition"
      : "Modifier"
  );
}


async function cg19Save(){

  const answer =
    cg19$("cg19EditAnswer")
      .value
      .trim();


  if(!answer){

    cg19Status(
      "La réponse est obligatoire.",
      "error"
    );

    return;
  }


  /*
   * EDITOR_QR001
   *
   * answer = donnée canonique.
   *
   * L'éditeur écrit uniquement la réponse Q/R.
   * La normalisation retire les anciens champs
   * encore présents sur une fiche historique.
   */
  const patch = {

    megatheme:
      cg19$("cg19EditMega")
        .value
        .trim(),

    theme:
      cg19$("cg19EditTheme")
        .value
        .trim(),

    question:
      cg19$("cg19EditQuestion")
        .value
        .trim(),

    detail:
      cg19$("cg19EditDetail")
        .value,

    answer,

status:
      cg19$("cg19EditStatusEdit")
        .value
        .trim()
  };


  cg19Status(
    "Enregistrement…"
  );


  try{

    const result =
      await window
        .CGWEB006_API
        .update(
          CG19.id,
          patch,
          {
            expectedRevision:
              Number(
                CG19.record.cg_revision ||
                0
              ),

            source:
              "CGWEB019_EDITOR_QR",

            normalizeQr:
              true
          }
        );


    if(result?.conflict){

      throw new Error(
        "Conflit de révision : recharge la fiche avant d'enregistrer."
      );
    }


    const fresh =
      await window
        .CGWEB006_API
        .byId(
          CG19.id
        );


    cg19Render(fresh);
    cg19ToggleEdit(false);


    cg19Status(
      "✅ Question Q/R enregistrée.",
      "ok"
    );


    window
      .CGWEB018_API
      ?.reload?.();


  }catch(error){

    cg19Status(
      error?.message ||
      String(error),
      "error"
    );
  }
}


function cg19NavState(){const i=CG19.list.indexOf(CG19.id),p=cg19$("cg19Prev"),n=cg19$("cg19Next");if(p)p.disabled=i<=0;if(n)n.disabled=i<0||i>=CG19.list.length-1}
async function cg19Go(delta){const i=CG19.list.indexOf(CG19.id);const id=CG19.list[i+delta];if(id)await cg19Open(id,CG19.list)}
async function cg19Open(id,listIds=[]){
  cg19Ensure();CG19.list=Array.isArray(listIds)&&listIds.length?listIds.map(String):CG19.list;cg19$("cgweb019Drawer").classList.remove("cg19-hidden");document.body.classList.add("cg19-open");cg19Status("Chargement…");
  try{const row=await window.CGWEB006_API?.byId?.(String(id));if(!row)throw new Error(`Question ${id} introuvable.`);cg19Render(row);cg19Status("Fiche chargée.","ok")}catch(error){cg19Status(error?.message||String(error),"error")}
}
function cg19Close(){cg19$("cgweb019Drawer")?.classList.add("cg19-hidden");document.body.classList.remove("cg19-open")}
function cg19Ensure(){

  if(
    cg19$("cgweb019Drawer")
  ){
    return;
  }


  const drawer =
    document.createElement(
      "div"
    );


  drawer.id =
    "cgweb019Drawer";

  drawer.className =
    "cg19-drawer cg19-hidden";


  drawer.innerHTML = `

    <div class="cg19-sheet">

      <header class="cg19-head">

        <div>

          <div class="cg19-kicker">
            CGWEB131 · QUESTION / RÉPONSE
          </div>

          <h2 id="cg19Id">
            Question
          </h2>

          <div id="cg19Path"></div>

        </div>


        <div class="cg19-head-actions">

          <button id="cg19Prev">
            ←
          </button>

          <button id="cg19Next">
            →
          </button>

          <button id="cg19EditBtn">
            Modifier
          </button>

          <button id="cg19Close">
            ×
          </button>

        </div>

      </header>


      <main class="cg19-main">

        <section class="cg19-content">

          <div
            id="cg19Question"
            class="cg19-question"
          ></div>

          <div
            id="cg19Detail"
            class="cg19-detail"
          ></div>

          <div
            id="cg19Image"
            class="cg19-image"
          ></div>

          <div
            id="cg19Answer"
            class="cg19-answer"
          ></div>

          <div
            id="cg19Meta"
            class="cg19-meta"
          ></div>

          <div
            id="cg19Sources"
            class="cg19-sources"
          ></div>


          <section
            id="cg19Editor"
            class="cg19-editor cg19-hidden"
          >

            <h3>
              Modification
            </h3>


            <div class="cg19-form">

              <label>
                Mégathème
                <input id="cg19EditMega">
              </label>

              <label>
                Thème
                <input id="cg19EditTheme">
              </label>

              <label class="wide">
                Question
                <textarea id="cg19EditQuestion"></textarea>
              </label>

              <label class="wide">
                Détail
                <textarea id="cg19EditDetail"></textarea>
              </label>

              <label class="wide">
                Réponse
                <textarea
                  id="cg19EditAnswer"
                  required
                ></textarea>
              </label>

              <label>
                Statut
                <input id="cg19EditStatusEdit">
              </label>

            </div>


            <button
              id="cg19Save"
              class="cg19-primary"
            >
              Enregistrer
            </button>

          </section>

        </section>


        <aside class="cg19-side">

          <h3>
            Aperçu Q/R
          </h3>


          <div class="cg19-phone">

            <div
              id="cg19AndroidTheme"
              class="cg19-phone-theme"
            ></div>

            <div
              id="cg19AndroidQuestion"
              class="cg19-phone-question"
            ></div>

            <div
              id="cg19AndroidImage"
              class="cg19-phone-image"
            ></div>

            <div
              id="cg19AndroidAnswer"
              class="cg19-phone-answer"
            ></div>

          </div>


          <h3>
            Historique
          </h3>

          <div
            id="cg19History"
            class="cg19-history"
          ></div>

        </aside>

      </main>


      <footer
        id="cg19Status"
        class="cg19-status"
      ></footer>

    </div>
  `;


  document.body.appendChild(
    drawer
  );


  cg19$("cg19Close").onclick =
    cg19Close;

  cg19$("cg19EditBtn").onclick =
    ()=>cg19ToggleEdit();

  cg19$("cg19Save").onclick =
    cg19Save;

  cg19$("cg19Prev").onclick =
    ()=>cg19Go(-1);

  cg19$("cg19Next").onclick =
    ()=>cg19Go(1);


  drawer.onclick =
    e=>{

      if(
        e.target === drawer
      ){
        cg19Close();
      }
    };
}

window.CGWEB019_API={open:cg19Open,close:cg19Close};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",cg19Ensure);else cg19Ensure();
