(() => {
  "use strict";

  const VERSION =
    "CGWEB141_FIX2_THEME_COMPARE_NORMALIZE001_FALSE_POSITIVE_GUARD001_INVISIBLE_DIFF_DIAGNOSTIC001_REPAIR_SCOPE_GUARD001";

  const MAX_THEMES = 30;
  const PAGE_SIZE = 100;
  const MAX_PAGES = 50;

  let groups = [];
  let busy = false;

  const $ = id =>
    document.getElementById(id);

  const esc = value =>
    String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;");

  function norm(value){

    return String(value ?? "")
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        " "
      )
      .trim();
  }


  /*
   * ============================================================
   * CGWEB141 FIX2
   * THEME_COMPARE_NORMALIZE001
   * ============================================================
   *
   * La comparaison fonctionnelle neutralise uniquement :
   * - composition Unicode différente ;
   * - espaces Unicode / insécables ;
   * - espaces multiples ;
   * - caractères invisibles de formatage.
   *
   * Elle ne neutralise PAS les mots, chiffres ou ponctuations
   * réellement différents.
   */
  function themeCompareKey(value){

    return String(
      value ?? ""
    )
      .normalize("NFKC")
      .replace(
        /[\u200B-\u200D\u2060\uFEFF]/gu,
        ""
      )
      .replace(
        /[\s\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+/gu,
        " "
      )
      .trim();
  }


  function sameTheme(
    actual,
    expected
  ){

    return (
      themeCompareKey(actual)
      ===
      themeCompareKey(expected)
    );
  }


  function trueThemeMismatch(
    actual,
    expected
  ){

    return !sameTheme(
      actual,
      expected
    );
  }


  function invisibleCodePoints(value){

    const found =
      new Set();

    for(
      const ch of String(
        value ?? ""
      )
    ){

      const cp =
        ch.codePointAt(0);

      if(
        cp === 0x00A0 ||
        cp === 0x1680 ||
        (
          cp >= 0x2000 &&
          cp <= 0x200D
        ) ||
        cp === 0x202F ||
        cp === 0x205F ||
        cp === 0x2060 ||
        cp === 0x3000 ||
        cp === 0xFEFF
      ){

        found.add(
          "U+"
          + cp
              .toString(16)
              .toUpperCase()
              .padStart(4,"0")
        );
      }
    }

    return [
      ...found
    ];
  }


  /*
   * INVISIBLE_DIFF_DIAGNOSTIC001
   *
   * Cette fonction n'est appelée que lorsque :
   * - les chaînes brutes diffèrent ;
   * - leur valeur fonctionnelle normalisée est identique.
   */
  function invisibleDiffDiagnostic(
    actual,
    expected
  ){

    const a =
      String(
        actual ?? ""
      );

    const e =
      String(
        expected ?? ""
      );

    if(
      a === e ||
      !sameTheme(a,e)
    ){
      return "";
    }

    const reasons =
      [];

    if(
      a.normalize("NFKC")
      !==
      a
      ||
      e.normalize("NFKC")
      !==
      e
    ){
      reasons.push(
        "normalisation Unicode"
      );
    }

    const points =
      [
        ...new Set([
          ...invisibleCodePoints(a),
          ...invisibleCodePoints(e)
        ])
      ];

    if(points.length){

      reasons.push(
        "caractères "
        + points.join(", ")
      );
    }

    if(
      /[\s\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]{2,}/u
        .test(a)
      ||
      /[\s\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]{2,}/u
        .test(e)
    ){
      reasons.push(
        "espacement multiple"
      );
    }

    if(!reasons.length){

      reasons.push(
        "différence d'espacement/formatage neutralisée"
      );
    }

    return reasons.join(
      " · "
    );
  }


  function themeFromQuizypediaUrl(raw){

    try{

      const u =
        new URL(
          String(raw || "")
        );

      if(
        !/(^|\.)quizypedia\.fr$/i
          .test(u.hostname)
      ){
        return "";
      }

      const parts =
        decodeURIComponent(
          u.pathname
        )
          .split("/")
          .filter(Boolean);

      if(
        parts.length < 2 ||
        norm(parts[0]) !== "quiz"
      ){
        return "";
      }

      return String(
        parts[1] || ""
      ).trim();

    }catch(_){

      return "";
    }
  }


  function millis(value){

    if(!value){
      return 0;
    }

    try{

      if(
        typeof value.toMillis
        === "function"
      ){
        return value.toMillis();
      }

      if(
        Number.isFinite(
          Number(
            value.seconds
          )
        )
      ){
        return (
          Number(
            value.seconds
          ) * 1000
        );
      }

      const n =
        new Date(value)
          .getTime();

      return Number.isFinite(n)
        ? n
        : 0;

    }catch(_){

      return 0;
    }
  }


  function dateText(value){

    const ms =
      millis(value);

    if(!ms){
      return "Date inconnue";
    }

    return new Date(ms)
      .toLocaleString(
        "fr-FR"
      );
  }


  function state(text,type=""){

    const el =
      $("cg141State");

    if(!el){
      return;
    }

    el.textContent =
      text;

    el.className =
      "cg141-state"
      + (
        type
          ? ` ${type}`
          : ""
      );
  }


  function installStyle(){

    if(
      $("cg141Style")
    ){
      return;
    }

    const style =
      document.createElement(
        "style"
      );

    style.id =
      "cg141Style";

    style.textContent = `
      #cg141Audit{
        margin:16px 0 4px;
        border:1px solid rgba(90,205,255,.34);
        border-radius:14px;
        background:rgba(3,22,39,.42);
        overflow:hidden
      }

      #cg141Audit summary{
        cursor:pointer;
        padding:12px 14px;
        font-weight:800;
        color:#e6f7ff
      }

      .cg141-body{
        padding:0 14px 14px
      }

      .cg141-note{
        color:#aac9da;
        font-size:12px;
        line-height:1.45;
        margin-bottom:10px
      }

      .cg141-actions{
        display:flex;
        flex-wrap:wrap;
        gap:8px;
        align-items:center;
        margin-bottom:10px
      }

      .cg141-actions button{
        border:1px solid rgba(255,255,255,.22);
        border-radius:9px;
        padding:7px 11px;
        background:#174b6c;
        color:#fff;
        font:inherit;
        font-weight:700;
        cursor:pointer
      }

      .cg141-actions button.primary{
        background:#57d4ff;
        border-color:#57d4ff;
        color:#061521
      }

      .cg141-actions button.danger{
        background:#8c3131
      }

      .cg141-actions button:disabled{
        opacity:.45;
        cursor:not-allowed
      }

      .cg141-state{
        font-size:12px;
        color:#bcd7e6;
        margin:8px 0
      }

      .cg141-state.ok{
        color:#8cf0b3
      }

      .cg141-state.warn{
        color:#ffd477
      }

      .cg141-state.err{
        color:#ff9b9b
      }

      .cg141-list{
        display:grid;
        gap:8px
      }

      .cg141-group{
        display:grid;
        grid-template-columns:auto 1fr auto;
        gap:10px;
        align-items:start;
        padding:10px;
        border-radius:10px;
        background:rgba(255,255,255,.055)
      }

      .cg141-group.bad{
        border:1px solid rgba(255,106,106,.58)
      }

      .cg141-group.good{
        border:1px solid rgba(78,218,145,.30)
      }

      .cg141-theme{
        font-weight:800;
        margin-bottom:3px
      }

      .cg141-meta,
      .cg141-url,
      .cg141-current{
        font-size:11px;
        line-height:1.4;
        color:#b5d1df
      }

      .cg141-url{
        overflow-wrap:anywhere
      }

      .cg141-mismatch{
        color:#ffaaa8;
        font-weight:800;
        margin-top:4px;
        font-size:12px
      }

      .cg141-ok{
        color:#8de9ae;
        font-weight:800;
        margin-top:4px;
        font-size:12px
      }

      .cg141-normalized{
        color:#8de9ae;
        font-weight:800;
        margin-top:4px;
        font-size:12px
      }

      .cg141-diagnostic{
        color:#d1c480;
        margin-top:3px;
        font-size:11px;
        line-height:1.35
      }

      .cg141-badge{
        white-space:nowrap;
        border-radius:999px;
        padding:4px 8px;
        font-size:11px;
        background:#214861
      }

      .cg141-badge.bad{
        background:#792e35;
        color:#ffd0d0
      }

      .cg141-badge.good{
        background:#176342;
        color:#a9ffd0
      }

      @media(max-width:760px){
        .cg141-group{
          grid-template-columns:auto 1fr
        }

        .cg141-badge{
          grid-column:2
        }
      }
    `;

    document.head
      .appendChild(style);
  }


  function mount(){

    const host =
      $("cgimport002Panel");

    if(
      !host ||
      $("cg141Audit")
    ){
      return Boolean(
        $("cg141Audit")
      );
    }

    installStyle();

    const panel =
      document.createElement(
        "details"
      );

    panel.id =
      "cg141Audit";

    panel.open =
      true;

    panel.innerHTML = `
      <summary>
        Contrôle des imports Quizypedia récents
      </summary>

      <div class="cg141-body">

        <div class="cg141-note">
          Contrôle à la demande des 30 thèmes Quizypedia
          créés le plus récemment.
          Le thème attendu est déduit de l'URL Quizypedia.
          Aucune modification n'est automatique.
        </div>

        <div class="cg141-actions">

          <button
            id="cg141Scan"
            type="button"
            class="primary"
          >
            Vérifier les 30 derniers thèmes
          </button>

          <button
            id="cg141SelectBad"
            type="button"
            disabled
          >
            Sélectionner les anomalies
          </button>

          <button
            id="cg141Repair"
            type="button"
            class="danger"
            disabled
          >
            Corriger la sélection
          </button>

        </div>

        <div
          id="cg141State"
          class="cg141-state"
        >
          Aucun contrôle lancé.
        </div>

        <div
          id="cg141List"
          class="cg141-list"
        ></div>

      </div>
    `;

    host.appendChild(
      panel
    );

    $("cg141Scan")
      ?.addEventListener(
        "click",
        () => {
          scanRecent()
            .catch(error => {

              console.error(
                "CGWEB141 scan",
                error
              );

              state(
                "❌ "
                + (
                  error?.message ||
                  String(error)
                ),
                "err"
              );
            });
        }
      );

    $("cg141SelectBad")
      ?.addEventListener(
        "click",
        selectAllMismatches
      );

    $("cg141Repair")
      ?.addEventListener(
        "click",
        () => {
          repairSelected()
            .catch(error => {

              console.error(
                "CGWEB141 repair",
                error
              );

              state(
                "❌ "
                + (
                  error?.message ||
                  String(error)
                ),
                "err"
              );
            });
        }
      );

    return true;
  }


  function selectedGroups(){

    const selected =
      new Set(
        [
          ...document
            .querySelectorAll(
              ".cg141-check:checked"
            )
        ].map(input =>
          String(
            input.dataset.key ||
            ""
          )
        )
      );

    return groups.filter(group =>
      selected.has(
        group.key
      )
    );
  }


  function updateRepairButton(){

    const repair =
      $("cg141Repair");

    if(!repair){
      return;
    }

    repair.disabled =
      busy ||
      selectedGroups()
        .length === 0;
  }


  function render(){

    const box =
      $("cg141List");

    if(!box){
      return;
    }

    if(!groups.length){

      box.innerHTML =
        "";

      $("cg141SelectBad").disabled =
        true;

      $("cg141Repair").disabled =
        true;

      return;
    }

    const ordered =
      [...groups]
        .sort(
          (a,b) =>
            b.newestMs -
            a.newestMs
        );

    box.innerHTML =
      ordered.map(group => {

        const bad =
          group.mismatches.length;

        const normalized =
          group.normalizedOnly
            ?.length ||
          0;

        const diagnostic =
          [
            ...new Set(
              (
                group.normalizedOnly ||
                []
              )
                .map(
                  item =>
                    item.diagnostic
                )
                .filter(Boolean)
            )
          ]
            .join(" · ");

        const current =
          [
            ...group.currentThemes
          ]
            .filter(Boolean)
            .join(" · ") ||
          "(vide)";

        const firstUrl =
          group.rows[0]
            ?.url_quizypedia ||
          "";

        return `
          <div
            class="cg141-group ${bad ? "bad" : "good"}"
          >

            <input
              type="checkbox"
              class="cg141-check"
              data-key="${esc(group.key)}"
              ${bad ? "" : "disabled"}
            >

            <div>

              <div class="cg141-theme">
                Attendu :
                ${esc(group.expectedTheme)}
              </div>

              <div class="cg141-meta">
                ${esc(dateText(group.newestCreated))}
                · ${group.rows.length} question(s)
              </div>

              <div class="cg141-current">
                Enregistré :
                ${esc(current)}
              </div>

              <div class="cg141-url">
                ${esc(firstUrl)}
              </div>

              ${
                bad
                  ? `<div class="cg141-mismatch">
                       ⚠ ${bad} vraie(s) discordance(s) à corriger
                     </div>`

                  : normalized
                    ? `<div class="cg141-normalized">
                         ✓ concordance après normalisation
                         · ${normalized} différence(s) brute(s) neutralisée(s)
                       </div>

                       <div class="cg141-diagnostic">
                         ${esc(
                           diagnostic ||
                           "différence Unicode / espacement invisible"
                         )}
                       </div>`

                    : `<div class="cg141-ok">
                         ✓ concordance URL / thème
                       </div>`
              }

            </div>

            <span
              class="cg141-badge ${bad ? "bad" : "good"}"
            >
              ${
                bad
                  ? "Anomalie"
                  : normalized
                    ? "OK normalisé"
                    : "OK"
              }
            </span>

          </div>
        `;
      }).join("");

    document
      .querySelectorAll(
        ".cg141-check"
      )
      .forEach(input => {

        input.addEventListener(
          "change",
          updateRepairButton
        );
      });

    const anomalies =
      groups.filter(
        g =>
          g.mismatches.length
      ).length;

    $("cg141SelectBad").disabled =
      busy ||
      anomalies === 0;

    updateRepairButton();
  }


  function addRow(
    map,
    row
  ){

    const expected =
      themeFromQuizypediaUrl(
        row.url_quizypedia
      );

    if(!expected){
      return false;
    }

    const key =
      norm(expected);

    let group =
      map.get(key);

    if(!group){

      group = {
        key,
        expectedTheme:expected,
        rows:[],
        currentThemes:
          new Set(),

        /*
         * mismatches :
         * vraies discordances uniquement.
         *
         * normalizedOnly :
         * chaînes brutes différentes mais fonctionnellement
         * identiques après normalisation.
         */
        mismatches:[],
        normalizedOnly:[],

        newestMs:0,
        newestCreated:null
      };

      map.set(
        key,
        group
      );
    }

    group.rows.push(
      row
    );

    const actual =
      String(
        row.theme ||
        ""
      ).trim();

    group.currentThemes.add(
      actual
    );

    /*
     * CGWEB141 FIX2 :
     * une différence brute ne suffit plus à déclarer
     * une anomalie.
     */
    if(
      trueThemeMismatch(
        actual,
        expected
      )
    ){

      group.mismatches.push(
        row
      );

    }else if(
      actual !== expected
    ){

      group.normalizedOnly.push({
        row,
        diagnostic:
          invisibleDiffDiagnostic(
            actual,
            expected
          )
      });
    }

    const ms =
      millis(
        row.cg_created_at
      );

    if(
      ms > group.newestMs
    ){

      group.newestMs =
        ms;

      group.newestCreated =
        row.cg_created_at;
    }

    return true;
  }


  async function scanRecent(){

    if(busy){
      return;
    }

    const api =
      window.CGWEB001;

    if(
      !api?.listRecentCreatedPage
    ){
      throw new Error(
        "API créations récentes indisponible."
      );
    }

    busy = true;

    $("cg141Scan").disabled =
      true;

    $("cg141SelectBad").disabled =
      true;

    $("cg141Repair").disabled =
      true;

    state(
      "Lecture des créations les plus récentes…",
      "warn"
    );

    try{

      const map =
        new Map();

      let cursor =
        null;

      let pages =
        0;

      let scanned =
        0;

      let stop =
        false;

      while(
        pages < MAX_PAGES &&
        !stop
      ){

        const result =
          await api
            .listRecentCreatedPage({
              cursor,
              pageSize:
                PAGE_SIZE
            });

        pages++;

        const rows =
          Array.isArray(
            result?.items
          )
            ? result.items
            : [];

        if(!rows.length){
          break;
        }

        for(
          const row of rows
        ){

          scanned++;

          const expected =
            themeFromQuizypediaUrl(
              row.url_quizypedia
            );

          if(!expected){
            continue;
          }

          const key =
            norm(expected);

          /*
           * Dès que 30 thèmes ont été identifiés,
           * on termine les questions appartenant
           * à ces thèmes mais on n'introduit pas
           * un 31e thème.
           */
          if(
            !map.has(key) &&
            map.size >= MAX_THEMES
          ){
            stop = true;
            break;
          }

          addRow(
            map,
            row
          );
        }

        cursor =
          result?.nextCursor ||
          null;

        state(
          `Lecture… ${scanned} question(s) examinée(s) · `
          + `${map.size}/${MAX_THEMES} thème(s) Quizypedia.`,
          "warn"
        );

        if(
          stop ||
          !cursor
        ){
          break;
        }

        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              0
            )
        );
      }

      groups =
        [...map.values()]
          .sort(
            (a,b) =>
              b.newestMs -
              a.newestMs
          );

      render();

      const anomalies =
        groups.filter(
          g =>
            g.mismatches.length
        );

      const badQuestions =
        anomalies.reduce(
          (sum,g) =>
            sum +
            g.mismatches.length,
          0
        );

      const normalizedQuestions =
        groups.reduce(
          (sum,g) =>
            sum +
            (
              g.normalizedOnly
                ?.length ||
              0
            ),
          0
        );

      const normalizedSuffix =
        normalizedQuestions
          ? (
              ` · ${normalizedQuestions} différence(s) `
              + `invisible(s)/Unicode neutralisée(s)`
            )
          : "";

      if(anomalies.length){

        state(
          `⚠ ${groups.length} thème(s) contrôlé(s) · `
          + `${anomalies.length} thème(s) avec vraie anomalie · `
          + `${badQuestions} question(s) réellement concernée(s)`
          + `${normalizedSuffix}.`,
          "warn"
        );

      }else{

        state(
          `✅ ${groups.length} thème(s) Quizypedia récents contrôlés · `
          + `aucune vraie discordance URL / thème`
          + `${normalizedSuffix}.`,
          "ok"
        );
      }

    }finally{

      busy = false;

      $("cg141Scan").disabled =
        false;

      render();
    }
  }


  function selectAllMismatches(){

    document
      .querySelectorAll(
        ".cg141-check:not(:disabled)"
      )
      .forEach(input => {

        input.checked =
          true;
      });

    updateRepairButton();
  }


  /*
   * ============================================================
   * CGWEB141 FIX2 · REPAIR_SCOPE_GUARD001
   * ============================================================
   *
   * Une ligne n'entre dans le plan de réparation que si :
   * 1. son URL Quizypedia donne toujours un thème ;
   * 2. ce thème correspond au groupe audité ;
   * 3. le thème enregistré reste réellement différent après
   *    normalisation.
   *
   * Un simple écart Unicode/espacement ne peut donc jamais être
   * réécrit.
   */
  function safeRepairRows(group){

    return (
      group?.mismatches ||
      []
    ).filter(row => {

      const expectedNow =
        themeFromQuizypediaUrl(
          row.url_quizypedia
        );

      if(!expectedNow){
        return false;
      }

      if(
        !sameTheme(
          expectedNow,
          group.expectedTheme
        )
      ){
        return false;
      }

      return trueThemeMismatch(
        row.theme,
        expectedNow
      );
    });
  }


  async function repairSelected(){

    if(busy){
      return;
    }

    const selectedGroupsNow =
      selectedGroups();

    const selected =
      selectedGroupsNow
        .map(group => ({
          group,
          rows:
            safeRepairRows(
              group
            )
        }))
        .filter(
          item =>
            item.rows.length
        );

    if(!selected.length){

      state(
        "Aucune vraie discordance sélectionnée. "
        + "Le garde-fou de réparation n'autorise aucune écriture.",
        "warn"
      );

      return;
    }

    const total =
      selected.reduce(
        (sum,item) =>
          sum +
          item.rows.length,
        0
      );

    const blocked =
      selectedGroupsNow.reduce(
        (sum,group) =>
          sum +
          (
            group.mismatches
              ?.length ||
            0
          ),
        0
      )
      -
      total;

    const preview =
      selected
        .slice(0,8)
        .map(item => {

          const group =
            item.group;

          const actual =
            [
              ...group.currentThemes
            ]
              .filter(Boolean)
              .join(" / ") ||
            "(vide)";

          return (
            `• ${actual}`
            + ` → ${group.expectedTheme}`
            + ` (${item.rows.length})`
          );
        })
        .join("\n");

    const suffix =
      selected.length > 8
        ? (
            `\n• … `
            + `${selected.length - 8} autre(s)`
          )
        : "";

    const confirmed =
      confirm(
        `Corriger ${total} question(s) `
        + `dans ${selected.length} thème(s) ?\n\n`
        + `${preview}${suffix}\n\n`
        + (
            blocked > 0
              ? `${blocked} ligne(s) exclue(s) par le garde-fou.\n\n`
              : ""
          )
        + `Seules les vraies discordances seront modifiées.\n`
        + `Les différences Unicode/espaces sont exclues.\n`
        + `Chaque modification sera historisée.`
      );

    if(!confirmed){
      return;
    }

    const api =
      window.CGWEB006_API;

    if(
      !api?.update
    ){
      throw new Error(
        "API de modification indisponible."
      );
    }

    busy = true;

    $("cg141Scan").disabled =
      true;

    $("cg141SelectBad").disabled =
      true;

    $("cg141Repair").disabled =
      true;

    let done =
      0;

    const failures =
      [];

    let rescan =
      false;

    try{

      for(
        const item of selected
      ){

        const group =
          item.group;

        const rows =
          item.rows;

        for(
          const row of rows
        ){

          state(
            `Correction ${done + 1}/${total} · `
            + `${group.expectedTheme}`,
            "warn"
          );

          try{

            const revision =
              Number(
                row.cg_revision
              );

            const options = {
              source:
                "CGWEB141_THEME_REPAIR"
            };

            if(
              Number.isFinite(
                revision
              )
            ){
              options.expectedRevision =
                revision;
            }

            const result =
              await api.update(
                String(row.id),
                {
                  theme:
                    group.expectedTheme
                },
                options
              );

            if(
              result?.conflict
            ){
              throw new Error(
                "Conflit de révision"
              );
            }

            done++;

          }catch(error){

            failures.push({
              id:
                String(row.id),

              error:
                error?.message ||
                String(error)
            });
          }

          await new Promise(
            resolve =>
              setTimeout(
                resolve,
                0
              )
          );
        }
      }

      try{

        await window
          .CGWEB018_API
          ?.reload
          ?.();

      }catch(_){}


      if(failures.length){

        state(
          `⚠ ${done}/${total} correction(s) effectuée(s) · `
          + `${failures.length} échec(s). `
          + `Relance le contrôle avant une nouvelle correction.`,
          "warn"
        );

      }else{

        state(
          `✅ ${done} question(s) corrigée(s). `
          + `Nouvelle vérification…`,
          "ok"
        );

        rescan =
          true;
      }

    }finally{

      busy = false;

      $("cg141Scan").disabled =
        false;

      updateRepairButton();
    }

    /*
     * IMPORTANT :
     * scanRecent() refuse de s'exécuter si busy=true.
     * La relance se fait donc APRES le finally.
     */
    if(rescan){

      await scanRecent();
    }
  }


  function boot(){

    document
      .documentElement
      .dataset
      .cgweb141 =
        VERSION;

    if(mount()){
      return;
    }

    const observer =
      new MutationObserver(
        () => {

          if(mount()){
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

    setTimeout(
      () => {

        mount();

        if(
          $("cg141Audit")
        ){
          observer.disconnect();
        }
      },
      1200
    );
  }


  window.CGWEB141_API = {
    version:VERSION,
    themeFromQuizypediaUrl,
    themeCompareKey,
    sameTheme,
    trueThemeMismatch,
    invisibleDiffDiagnostic,
    scanRecent,
    repairSelected
  };


  if(
    document.readyState
    === "loading"
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
