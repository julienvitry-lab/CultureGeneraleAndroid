(function(root){
  "use strict";

  /*
   * ================================================================
   * CGWEB138
   * PURE_QR_SMOKE_TEST001
   * NEW_QUESTION_LIFECYCLE001
   * HISTORY_ROUNDTRIP001
   * LEGACY_FALLBACK_PROBE001
   * ================================================================
   *
   * Test volontairement petit et réversible.
   *
   * Il utilise les API réellement employées par CGWEB :
   *
   * CGWEB010 create/delete
   * CGWEB006 read/update
   * CGWEB019 history
   * CGWEB022 restore
   * CGQR001 legacy fallback
   *
   * Aucune écriture directe Firestore n'est réalisée ici.
   */

  const VERSION =
    "CGWEB138_FIX1_VISIBLE_SMOKE_PANEL001_CREATE_TAB_MOUNT001";

  const HISTORY_ENDPOINT =
    "https://europe-west1-culturegeneralesync.cloudfunctions.net/cgweb022History";

  const LEGACY_FIELDS = Object.freeze([
    "proposition_a",
    "proposition_b",
    "proposition_c",
    "proposition_d",
    "correct_index"
  ]);

  let running = false;


  function sleep(ms){
    return new Promise(
      resolve => setTimeout(resolve, ms)
    );
  }


  function hasOwn(obj,key){
    return Boolean(
      obj &&
      Object.prototype.hasOwnProperty.call(
        obj,
        key
      )
    );
  }


  function legacyFieldsOf(obj){

    if(
      !obj ||
      typeof obj !== "object"
    ){
      return [];
    }

    return LEGACY_FIELDS.filter(
      field => hasOwn(obj,field)
    );
  }


  function assert(condition,message){

    if(!condition){
      throw new Error(
        message ||
        "Assertion CGWEB138 échouée."
      );
    }
  }


  function answerOf(data){

    if(
      !root.CGQR001 ||
      typeof root.CGQR001.resolveAnswer !== "function"
    ){
      throw new Error(
        "CGQR001 indisponible."
      );
    }

    return root.CGQR001.resolveAnswer(
      data
    );
  }


  function ui(){

    return {
      panel:
        document.getElementById(
          "cg138Panel"
        ),

      button:
        document.getElementById(
          "cg138Run"
        ),

      state:
        document.getElementById(
          "cg138State"
        ),

      log:
        document.getElementById(
          "cg138Log"
        )
    };
  }


  function setState(
    text,
    kind = ""
  ){

    const el =
      ui().state;

    if(!el){
      return;
    }

    el.textContent =
      text;

    el.dataset.kind =
      kind;
  }


  function clearLog(){

    const el =
      ui().log;

    if(el){
      el.textContent = "";
    }
  }


  function log(
    text,
    kind = ""
  ){

    const el =
      ui().log;

    const line =
      `[${new Date().toLocaleTimeString("fr-FR")}] ${text}`;

    console.log(
      "CGWEB138",
      text
    );

    if(!el){
      return;
    }

    const row =
      document.createElement(
        "div"
      );

    row.className =
      "cg138-line" +
      (
        kind
          ? ` cg138-${kind}`
          : ""
      );

    row.textContent =
      line;

    el.appendChild(
      row
    );

    el.scrollTop =
      el.scrollHeight;
  }


  async function waitRuntime(){

    for(
      let attempt=0;
      attempt<120;
      attempt++
    ){

      if(
        root.CGWEB001 &&
        root.CGWEB006_API &&
        root.CGWEB010_API &&
        root.CGWEB019_DATA_API &&
        root.CGQR001
      ){
        return;
      }

      await sleep(250);
    }

    throw new Error(
      "Runtime CGWEB incomplet après 30 secondes."
    );
  }


  async function historyApi(body){

    const user =
      root.CGWEB001
        ?.getUser
        ?.();

    if(
      !user ||
      typeof user.getIdToken !== "function"
    ){
      throw new Error(
        "Utilisateur Firebase non connecté."
      );
    }

    const token =
      await user.getIdToken();

    const response =
      await fetch(
        HISTORY_ENDPOINT,
        {
          method:"POST",

          headers:{
            "content-type":
              "application/json",

            authorization:
              `Bearer ${token}`
          },

          body:
            JSON.stringify(
              body || {}
            )
        }
      );

    const raw =
      await response.text();

    let data = {};

    try{
      data =
        raw
          ? JSON.parse(raw)
          : {};
    }catch(_){
      throw new Error(
        `Réponse CGWEB022 illisible · HTTP ${response.status}`
      );
    }

    if(
      !response.ok ||
      !data?.ok
    ){
      throw new Error(
        data?.error ||
        `CGWEB022 · HTTP ${response.status}`
      );
    }

    return data;
  }


  async function historyRows(questionId){

    return (
      await root
        .CGWEB019_DATA_API
        .history(
          questionId,
          50
        )
    ) || [];
  }


  async function waitHistory(
    questionId,
    predicate,
    label
  ){

    for(
      let attempt=0;
      attempt<20;
      attempt++
    ){

      const rows =
        await historyRows(
          questionId
        );

      const found =
        rows.find(
          predicate
        );

      if(found){
        return found;
      }

      await sleep(300);
    }

    throw new Error(
      `Historique introuvable : ${label}`
    );
  }


  function assertPureQr(
    row,
    expectedAnswer,
    label
  ){

    assert(
      row &&
      typeof row === "object",
      `${label} : document absent.`
    );

    assert(
      String(
        row.answer ?? ""
      ).trim() === expectedAnswer,
      `${label} : answer incorrect.`
    );

    assert(
      answerOf(row) === expectedAnswer,
      `${label} : resolver answer incorrect.`
    );

    const legacy =
      legacyFieldsOf(row);

    assert(
      legacy.length === 0,
      `${label} : champ(s) QCM encore présent(s) : ${legacy.join(", ")}`
    );
  }


  function legacyFallbackProbe(){

    /*
     * Ancienne question réellement structurée
     * comme un QCM.
     */
    const legacy = {
      proposition_a:
        "Ancienne mauvaise réponse A",

      proposition_b:
        "Ancienne mauvaise réponse B",

      proposition_c:
        "Réponse historique attendue",

      proposition_d:
        "Ancienne mauvaise réponse D",

      correct_index:
        3
    };


    assert(
      answerOf(legacy) ===
        "Réponse historique attendue",
      "Fallback legacy correct_index=3 invalide."
    );


    /*
     * answer doit toujours être prioritaire,
     * même si un vieux schéma est encore présent.
     */
    const mixed = {
      ...legacy,

      answer:
        "Réponse canonique prioritaire"
    };


    assert(
      answerOf(mixed) ===
        "Réponse canonique prioritaire",
      "answer n'est pas prioritaire sur le legacy."
    );


    /*
     * Compatibilité d'anciens documents
     * normalisés index=0 + proposition_a.
     */
    const legacyZero = {
      proposition_a:
        "Réponse historique index zéro",

      correct_index:
        0
    };


    assert(
      answerOf(legacyZero) ===
        "Réponse historique index zéro",
      "Fallback legacy index zéro invalide."
    );


    return {
      standard:true,
      canonicalPriority:true,
      zeroIndex:true
    };
  }


  async function emergencyCleanup(
    id
  ){

    if(!id){
      return;
    }

    try{

      const current =
        await root
          .CGWEB006_API
          .byId(id);

      if(!current){
        return;
      }

      log(
        `Nettoyage de secours de ${id}…`,
        "warn"
      );

      await root
        .CGWEB010_API
        .remove(
          id,
          {
            expectedRevision:
              Number(
                current.cg_revision ||
                0
              ),

            force:true,

            source:
              "CGWEB138_EMERGENCY_CLEANUP"
          }
        );

      log(
        "Question temporaire supprimée par le nettoyage de secours.",
        "ok"
      );

    }catch(error){

      log(
        "⚠ Nettoyage automatique impossible : " +
        (
          error?.message ||
          String(error)
        ),
        "error"
      );
    }
  }


  async function run(){

    if(running){
      throw new Error(
        "Un test CGWEB138 est déjà en cours."
      );
    }

    running = true;

    const controls =
      ui();

    if(controls.button){
      controls.button.disabled = true;
    }

    clearLog();

    setState(
      "Test en cours…",
      "running"
    );


    let id = "";
    let deleted = false;


    const report = {
      version:VERSION,
      id:"",
      legacyFallback:false,
      create:false,
      update:false,
      historyUpdate:false,
      restore:false,
      historyRestore:false,
      delete:false,
      historyDelete:false,
      pureQr:false
    };


    try{

      await waitRuntime();


      const user =
        root.CGWEB006_API
          .currentUser
          ?.();

      assert(
        user?.uid,
        "Utilisateur Firebase non connecté."
      );


      /*
       * ------------------------------------------------------------
       * LEGACY_FALLBACK_PROBE001
       * ------------------------------------------------------------
       */

      log(
        "LEGACY_FALLBACK_PROBE001…"
      );

      legacyFallbackProbe();

      report.legacyFallback =
        true;

      log(
        "✓ fallback historique + priorité answer",
        "ok"
      );


      /*
       * ------------------------------------------------------------
       * NEW_QUESTION_LIFECYCLE001 · CREATE
       * ------------------------------------------------------------
       */

      const stamp =
        Date.now();

      const random =
        (
          root.crypto
            ?.randomUUID
            ?.() ||
          Math.random()
            .toString(16)
            .slice(2)
        )
          .replace(
            /[^a-zA-Z0-9]/g,
            ""
          )
          .slice(0,12);


      id =
        `CGWEB138_SMOKE_${stamp}_${random}`;

      report.id =
        id;


      const answer1 =
        `Réponse initiale CGWEB138 ${stamp}`;

      const answer2 =
        `Réponse modifiée CGWEB138 ${stamp}`;


      log(
        `Création temporaire ${id}…`
      );


      const createdId =
        await root
          .CGWEB010_API
          .create({
            requested_id:id,

            megatheme:
              "Culture Générale",

            theme:
              "CGWEB138_SMOKE_TEST",

            question:
              `Question temporaire CGWEB138 ${stamp}`,

            detail:
              "PURE_QR_SMOKE_TEST001 · état initial",

            answer:
              answer1,

            status:
              "CGWEB138_SMOKE",

            non_trouve:
              0,

            is_image:
              0,


            /*
             * Injection volontaire de vieux champs.
             *
             * CGWEB010 doit les jeter.
             */
            proposition_a:
              "NE_DOIT_PAS_ETRE_ECRIT_A",

            proposition_b:
              "NE_DOIT_PAS_ETRE_ECRIT_B",

            proposition_c:
              "NE_DOIT_PAS_ETRE_ECRIT_C",

            proposition_d:
              "NE_DOIT_PAS_ETRE_ECRIT_D",

            correct_index:
              4
          });


      assert(
        String(createdId) === id,
        "ID créé différent de l'ID demandé."
      );


      let row =
        await root
          .CGWEB006_API
          .byId(id);


      assertPureQr(
        row,
        answer1,
        "CREATE"
      );


      assert(
        Number(
          row.cg_revision
        ) === 1,
        "CREATE : cg_revision initiale différente de 1."
      );


      report.create =
        true;

      log(
        "✓ CREATE : answer seul · aucun champ QCM",
        "ok"
      );


      /*
       * ------------------------------------------------------------
       * NEW_QUESTION_LIFECYCLE001 · UPDATE
       * ------------------------------------------------------------
       */

      log(
        "Modification Q/R…"
      );


      const update =
        await root
          .CGWEB006_API
          .update(
            id,
            {
              answer:
                answer2,

              detail:
                "PURE_QR_SMOKE_TEST001 · état modifié",


              /*
               * Nouvelle tentative volontaire d'injection.
               */
              proposition_a:
                "NE_DOIT_TOUJOURS_PAS_ETRE_ECRIT",

              proposition_b:
                "NE_DOIT_TOUJOURS_PAS_ETRE_ECRIT",

              correct_index:
                2
            },
            {
              expectedRevision:
                Number(
                  row.cg_revision
                ),

              source:
                "CGWEB138_SMOKE_UPDATE",

              normalizeQr:
                true
            }
          );


      assert(
        update?.ok === true,
        "UPDATE : résultat CGSYNC007 invalide."
      );


      row =
        await root
          .CGWEB006_API
          .byId(id);


      assertPureQr(
        row,
        answer2,
        "UPDATE"
      );


      assert(
        Number(
          row.cg_revision
        ) === 2,
        "UPDATE : révision attendue = 2."
      );


      report.update =
        true;

      log(
        "✓ UPDATE : answer modifié · zéro QCM",
        "ok"
      );


      /*
       * ------------------------------------------------------------
       * HISTORY_ROUNDTRIP001 · UPDATE HISTORY
       * ------------------------------------------------------------
       */

      log(
        "Recherche de l'historique de modification…"
      );


      const updateHistory =
        await waitHistory(
          id,

          history =>
            history?.operation ===
              "update" &&
            String(
              history?.source ||
              ""
            ).includes(
              "CGWEB138_SMOKE_UPDATE"
            ),

          "update CGWEB138"
        );


      assert(
        answerOf(
          updateHistory.before_snapshot
        ) === answer1,
        "Historique UPDATE : before_snapshot incorrect."
      );


      assert(
        answerOf(
          updateHistory.after_snapshot
        ) === answer2,
        "Historique UPDATE : after_snapshot incorrect."
      );


      assert(
        legacyFieldsOf(
          updateHistory.before_snapshot
        ).length === 0,
        "Historique UPDATE : before_snapshot contient du QCM."
      );


      assert(
        legacyFieldsOf(
          updateHistory.after_snapshot
        ).length === 0,
        "Historique UPDATE : after_snapshot contient du QCM."
      );


      report.historyUpdate =
        true;

      log(
        "✓ historique UPDATE Q/R pur",
        "ok"
      );


      /*
       * ------------------------------------------------------------
       * HISTORY_ROUNDTRIP001 · RESTORE
       * ------------------------------------------------------------
       */

      log(
        "Restauration de l'état initial…"
      );


      const restoredResult =
        await historyApi({
          mode:
            "restore",

          historyId:
            updateHistory.id,

          expectedCurrentRevision:
            Number(
              row.cg_revision
            )
        });


      assert(
        restoredResult?.questionId === id,
        "RESTORE : mauvais ID retourné."
      );


      row =
        await root
          .CGWEB006_API
          .byId(id);


      assertPureQr(
        row,
        answer1,
        "RESTORE"
      );


      assert(
        Number(
          row.cg_revision
        ) === 3,
        "RESTORE : révision attendue = 3."
      );


      report.restore =
        true;

      log(
        "✓ RESTORE : retour à answer initial · zéro QCM",
        "ok"
      );


      const restoreHistory =
        await waitHistory(
          id,

          history =>
            history?.operation ===
              "restore" &&
            String(
              history?.restored_from_history_id ||
              ""
            ) ===
              String(
                updateHistory.id
              ),

          "restore CGWEB138"
        );


      assert(
        answerOf(
          restoreHistory.after_snapshot
        ) === answer1,
        "Historique RESTORE : after_snapshot incorrect."
      );


      assert(
        legacyFieldsOf(
          restoreHistory.after_snapshot
        ).length === 0,
        "Historique RESTORE : snapshot contient du QCM."
      );


      report.historyRestore =
        true;

      log(
        "✓ historique RESTORE Q/R pur",
        "ok"
      );


      /*
       * ------------------------------------------------------------
       * NEW_QUESTION_LIFECYCLE001 · DELETE
       * ------------------------------------------------------------
       */

      log(
        "Suppression de la question temporaire…"
      );


      const deletion =
        await root
          .CGWEB010_API
          .remove(
            id,
            {
              expectedRevision:
                Number(
                  row.cg_revision
                ),

              source:
                "CGWEB138_SMOKE_DELETE"
            }
          );


      assert(
        deletion?.ok === true,
        "DELETE : résultat invalide."
      );


      const afterDelete =
        await root
          .CGWEB006_API
          .byId(id);


      assert(
        afterDelete === null,
        "DELETE : la question existe encore."
      );


      deleted =
        true;

      report.delete =
        true;

      log(
        "✓ question temporaire supprimée",
        "ok"
      );


      const deleteHistory =
        await waitHistory(
          id,

          history =>
            history?.operation ===
              "delete" &&
            String(
              history?.source ||
              ""
            ).includes(
              "CGWEB138_SMOKE_DELETE"
            ),

          "delete CGWEB138"
        );


      assert(
        answerOf(
          deleteHistory.before_snapshot
        ) === answer1,
        "Historique DELETE : before_snapshot incorrect."
      );


      assert(
        legacyFieldsOf(
          deleteHistory.before_snapshot
        ).length === 0,
        "Historique DELETE : snapshot contient du QCM."
      );


      report.historyDelete =
        true;

      report.pureQr =
        true;


      log(
        "✓ historique DELETE Q/R pur",
        "ok"
      );


      log(
        "CGWEB138 : TOUS LES TESTS SONT PASSÉS.",
        "success"
      );


      setState(
        "✅ Smoke test Q/R réussi",
        "success"
      );


      root.dispatchEvent(
        new CustomEvent(
          "cgweb138-smoke-complete",
          {
            detail:{
              ...report
            }
          }
        )
      );


      return report;


    }catch(error){

      const message =
        error?.message ||
        String(error);


      log(
        `❌ ${message}`,
        "error"
      );


      setState(
        "❌ Smoke test interrompu",
        "error"
      );


      root.dispatchEvent(
        new CustomEvent(
          "cgweb138-smoke-error",
          {
            detail:{
              ...report,
              error:message
            }
          }
        )
      );


      throw error;


    }finally{

      if(
        id &&
        !deleted
      ){
        await emergencyCleanup(
          id
        );
      }


      running =
        false;


      if(controls.button){
        controls.button.disabled = false;
      }
    }
  }


  /*
   * CGWEB138 FIX1
   * VISIBLE_SMOKE_PANEL001 / CREATE_TAB_MOUNT001
   *
   * Le shell moderne CGWEB016 est créé dynamiquement
   * en dehors de l'ancien <main>.
   *
   * Le panneau CGWEB138 doit donc vivre dans
   * l'onglet visible "Création de questions".
   */
  function mountPanelInCreateTab(){

    const panel =
      document.getElementById(
        "cg138Panel"
      );

    const createPage =
      document.getElementById(
        "cg16PageCreate"
      );

    if(
      !panel ||
      !createPage
    ){
      return false;
    }


    if(
      panel.parentElement !==
      createPage
    ){
      createPage.appendChild(
        panel
      );
    }


    /*
     * Le smoke test est un outil temporaire de validation.
     * On l'ouvre par défaut afin qu'il soit immédiatement visible.
     */
    panel.open = true;

    panel.dataset.cg138Mount =
      "create-tab";

    return true;
  }


  function installPanel(){

    if(
      document.getElementById(
        "cg138Panel"
      )
    ){
      return;
    }


    const style =
      document.createElement(
        "style"
      );

    style.textContent = `
      #cg138Panel{
        width:100%;
        box-sizing:border-box;
        margin:18px 0 0;
        border:1px solid rgba(125,211,252,.34);
        border-radius:12px;
        padding:12px 14px;
        background:rgba(5,25,46,.42);
      }

      #cg138Panel summary{
        cursor:pointer;
        font-weight:700;
      }

      .cg138-body{
        margin-top:12px;
      }

      .cg138-actions{
        display:flex;
        gap:10px;
        align-items:center;
        flex-wrap:wrap;
        margin:10px 0;
      }

      #cg138Run{
        padding:8px 14px;
        cursor:pointer;
      }

      #cg138Run:disabled{
        opacity:.55;
        cursor:wait;
      }

      #cg138State{
        font-weight:700;
      }

      #cg138Log{
        margin-top:10px;
        max-height:320px;
        overflow:auto;
        white-space:pre-wrap;
        font-family:monospace;
        font-size:.9em;
        line-height:1.45;
      }

      .cg138-line{
        padding:2px 0;
      }

      .cg138-ok,
      .cg138-success{
        font-weight:700;
      }

      .cg138-error{
        font-weight:700;
      }

      .cg138-note{
        opacity:.82;
        margin:8px 0;
      }
    `;

    document.head.appendChild(
      style
    );


    const panel =
      document.createElement(
        "details"
      );

    panel.id =
      "cg138Panel";


    panel.innerHTML = `
      <summary>
        CGWEB138 · Smoke test Q/R
      </summary>

      <div class="cg138-body">

        <p>
          Test réel et temporaire :
          création → modification → historique →
          restauration → suppression.
        </p>

        <p class="cg138-note">
          Une question de test est créée dans votre compte puis supprimée.
          Les journaux d’audit et le tombstone sont conservés comme preuve
          du test. Aucun scan massif du catalogue n’est effectué.
        </p>

        <div class="cg138-actions">

          <button
            id="cg138Run"
            type="button"
          >
            Lancer le smoke test Q/R
          </button>

          <span id="cg138State">
            Prêt
          </span>

        </div>

        <div
          id="cg138Log"
          aria-live="polite"
        ></div>

      </div>
    `;


    /*
     * Montage de secours immédiatement dans le body.
     *
     * Si CGWEB016 n'est pas encore construit,
     * le MutationObserver ci-dessous déplacera
     * le panneau dès que #cg16PageCreate apparaîtra.
     */
    document.body.appendChild(
      panel
    );


    mountPanelInCreateTab();


    document
      .getElementById(
        "cg138Run"
      )
      ?.addEventListener(
        "click",
        async()=>{

          try{
            await run();
          }catch(error){
            console.error(
              "CGWEB138",
              error
            );
          }
        }
      );
  }


  /*
   * Le shell CGWEB016 peut être créé après CGWEB138.
   * Observation très courte et idempotente :
   * dès que la cible existe, on monte le panneau
   * puis on coupe l'observateur.
   */
  let mountObserver = null;


  function ensureVisibleMount(){

    if(
      mountPanelInCreateTab()
    ){

      if(mountObserver){
        mountObserver.disconnect();
        mountObserver = null;
      }

      return true;
    }

    return false;
  }


  if(
    !ensureVisibleMount()
  ){

    mountObserver =
      new MutationObserver(
        ()=>{
          ensureVisibleMount();
        }
      );

    mountObserver.observe(
      document.documentElement,
      {
        childList:true,
        subtree:true
      }
    );
  }


  root.CGWEB138_API =
    Object.freeze({
      version:VERSION,
      run,
      legacyFallbackProbe,
      legacyFieldsOf,
      mountPanelInCreateTab
    });


  if(
    document.readyState ===
    "loading"
  ){

    document.addEventListener(
      "DOMContentLoaded",
      installPanel,
      {
        once:true
      }
    );

  }else{

    installPanel();
  }

})(window);
