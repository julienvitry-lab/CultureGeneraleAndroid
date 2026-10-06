(() => {
  "use strict";

  /*
   * CGWEB140
   * FULL_QR_EXPORT001
   * PROGRESS_UI001
   * NON_BLOCKING_EXPORT001
   */

  const VERSION =
    "CGWEB140_FULL_QR_EXPORT001_SERVER_PAGINATION001_PROGRESS_UI001_NON_BLOCKING_EXPORT001_ANSWER_CANONICAL001";

  const PAGE_SIZE =
    1000;

  const state = {
    running:false,
    cancelled:false,
    controller:null,
    writer:null
  };


  const q =
    (selector, root=document) =>
      root.querySelector(selector);


  const fmt =
    value =>
      new Intl.NumberFormat(
        "fr-FR"
      ).format(
        Number(value || 0)
      );


  function nextPaint() {

    return new Promise(
      resolve =>
        requestAnimationFrame(
          () =>
            setTimeout(
              resolve,
              0
            )
        )
    );
  }


  function currentUser() {

    return window.CGWEB001
      ?.getUser
      ?.() || null;
  }


  function fileName() {

    return (
      "CultureGenerale_QR_complet_"
      + new Date()
          .toISOString()
          .slice(0,10)
      + ".csv"
    );
  }


  function setUi({
    text="",
    value=0,
    max=0,
    running=state.running
  }={}) {

    const button =
      q("#cg140ExportAll");

    const cancel =
      q("#cg140Cancel");

    const status =
      q("#cg140StatusText");

    const progress =
      q("#cg140Progress");


    if (button) {

      button.disabled =
        Boolean(running);

      button.textContent =
        running
          ? "Export Q/R en cours…"
          : "Exporter tout Q/R";
    }


    if (cancel) {

      cancel.hidden =
        !running;

      cancel.disabled =
        !running;
    }


    if (status) {

      status.textContent =
        text || "";
    }


    if (progress) {

      progress.hidden =
        !running &&
        !value;

      if (max > 0) {

        progress.max =
          max;

        progress.value =
          Math.min(
            value,
            max
          );

      } else {

        progress.removeAttribute(
          "value"
        );
      }
    }
  }


  async function fetchPage({
    token,
    cursor,
    first
  }) {

    const response =
      await fetch(
        "/api/cgweb140",
        {
          method:"POST",
          headers:{
            "content-type":
              "application/json",
            authorization:
              `Bearer ${token}`
          },
          body:JSON.stringify({
            cursor:
              cursor || "",
            pageSize:
              PAGE_SIZE,
            includeTotal:
              Boolean(first)
          }),
          signal:
            state.controller
              ?.signal
        }
      );


    const text =
      await response.text();


    let payload = null;

    try {

      payload =
        text
          ? JSON.parse(text)
          : {};

    } catch (_) {

      throw new Error(
        `Réponse export illisible (HTTP ${response.status}).`
      );
    }


    if (
      !response.ok ||
      !payload?.ok
    ) {

      throw new Error(
        payload?.error ||
        `Export HTTP ${response.status}`
      );
    }


    return payload;
  }


  async function chooseWriter() {

    /*
     * Chrome/Edge desktop :
     * écriture directe et incrémentale sur disque.
     *
     * Aucun catalogue complet n'est conservé en RAM.
     */
    if (
      typeof window.showSaveFilePicker
      === "function"
    ) {

      const handle =
        await window.showSaveFilePicker({
          suggestedName:
            fileName(),
          types:[
            {
              description:
                "Fichier CSV",
              accept:{
                "text/csv":[
                  ".csv"
                ]
              }
            }
          ]
        });


      const writer =
        await handle.createWritable();


      return {
        mode:"stream",
        writer,
        chunks:null
      };
    }


    /*
     * Fallback navigateur/mobile :
     * accumulation par chunks, sans concaténation géante.
     */
    return {
      mode:"blob",
      writer:null,
      chunks:[
        "\ufeff"
      ]
    };
  }


  async function writeChunk(
    output,
    chunk,
    firstChunk
  ) {

    if (!chunk) {
      return;
    }


    if (
      output.mode === "stream"
    ) {

      if (firstChunk) {

        await output.writer.write(
          "\ufeff"
        );
      }

      await output.writer.write(
        chunk
      );

      return;
    }


    output.chunks.push(
      chunk
    );
  }


  function downloadBlob(chunks) {

    const blob =
      new Blob(
        chunks,
        {
          type:
            "text/csv;charset=utf-8"
        }
      );


    const url =
      URL.createObjectURL(
        blob
      );


    const a =
      document.createElement(
        "a"
      );

    a.href =
      url;

    a.download =
      fileName();

    document.body.appendChild(
      a
    );

    a.click();
    a.remove();


    setTimeout(
      () =>
        URL.revokeObjectURL(
          url
        ),
      5000
    );
  }


  async function cancelOutput(
    output
  ) {

    if (
      output?.mode === "stream" &&
      output.writer
    ) {

      try {

        await output.writer.abort();

      } catch (_) {}
    }
  }


  async function exportAll() {

    if (state.running) {
      return;
    }


    const user =
      currentUser();

    if (!user) {

      setUi({
        text:
          "Utilisateur Firebase non connecté."
      });

      return;
    }


    /*
     * Le file picker doit être appelé directement depuis le clic,
     * avant les premiers await réseau.
     */
    let output;

    try {

      output =
        await chooseWriter();

    } catch (error) {

      if (
        error?.name ===
        "AbortError"
      ) {

        setUi({
          text:
            "Export annulé avant démarrage."
        });

        return;
      }

      throw error;
    }


    state.running =
      true;

    state.cancelled =
      false;

    state.controller =
      new AbortController();

    state.writer =
      output.writer;


    setUi({
      running:true,
      text:
        output.mode === "stream"
          ? "Préparation de l’export Q/R · écriture directe sur disque…"
          : "Préparation de l’export Q/R · mode mémoire du navigateur…"
    });


    let exported =
      0;

    let total =
      0;

    let cursor =
      "";

    let page =
      0;


    try {

      const token =
        await user.getIdToken();


      while (
        !state.cancelled
      ) {

        page += 1;


        const payload =
          await fetchPage({
            token,
            cursor,
            first:
              page === 1
          });


        if (
          page === 1 &&
          Number.isFinite(
            Number(
              payload.total
            )
          )
        ) {

          total =
            Number(
              payload.total || 0
            );
        }


        await writeChunk(
          output,
          String(
            payload.csv || ""
          ),
          page === 1
        );


        exported +=
          Number(
            payload.count || 0
          );


        setUi({
          running:true,
          value:exported,
          max:total,
          text:
            total > 0
              ? `${fmt(exported)} / ${fmt(total)} question(s) exportée(s) · page ${fmt(page)}`
              : `${fmt(exported)} question(s) exportée(s) · page ${fmt(page)}`
        });


        cursor =
          String(
            payload.nextCursor || ""
          );


        if (!cursor) {
          break;
        }


        /*
         * Rend explicitement la main au navigateur.
         */
        await nextPaint();
      }


      if (state.cancelled) {

        await cancelOutput(
          output
        );

        setUi({
          running:false,
          value:0,
          max:0,
          text:
            `Export annulé après ${fmt(exported)} question(s).`
        });

        return;
      }


      if (
        output.mode === "stream"
      ) {

        await output.writer.close();

      } else {

        downloadBlob(
          output.chunks
        );
      }


      setUi({
        running:false,
        value:exported,
        max:
          total || exported,
        text:
          `${fmt(exported)} question(s) Q/R exportée(s) avec succès.`
      });


    } catch (error) {

      await cancelOutput(
        output
      );


      if (
        state.cancelled ||
        error?.name ===
          "AbortError"
      ) {

        setUi({
          running:false,
          value:0,
          max:0,
          text:
            `Export annulé après ${fmt(exported)} question(s).`
        });

      } else {

        console.error(
          "CGWEB140",
          error
        );

        setUi({
          running:false,
          value:0,
          max:0,
          text:
            `Erreur export : ${
              error?.message ||
              String(error)
            }`
        });
      }

    } finally {

      state.running =
        false;

      state.controller =
        null;

      state.writer =
        null;
    }
  }


  function cancel() {

    if (!state.running) {
      return;
    }


    state.cancelled =
      true;

    try {

      state.controller
        ?.abort();

    } catch (_) {}


    setUi({
      running:true,
      text:
        "Annulation de l’export…"
    });
  }


  function installStyle() {

    if (
      q("#cg140Style")
    ) {
      return;
    }


    const style =
      document.createElement(
        "style"
      );

    style.id =
      "cg140Style";

    style.textContent = `
      #cg140ExportStatus{
        display:flex;
        align-items:center;
        gap:10px;
        flex-wrap:wrap;
        margin-top:8px;
        font-size:.82rem;
      }

      #cg140Progress{
        width:min(420px,100%);
        height:12px;
      }

      #cg140StatusText{
        opacity:.9;
        min-width:220px;
      }

      #cg140Cancel[hidden]{
        display:none!important;
      }
    `;

    document.head.appendChild(
      style
    );
  }


  function install() {

    const existing =
      q("#cg140ExportAll");

    if (existing) {
      return true;
    }


    const selectedExport =
      q("#cgweb109ExportCsv");

    if (!selectedExport) {
      return false;
    }


    /*
     * Clarifie la différence :
     * l'ancien bouton reste un export de sélection/résumé.
     */
    selectedExport.textContent =
      "Exporter sélection (résumé)";


    const button =
      document.createElement(
        "button"
      );

    button.id =
      "cg140ExportAll";

    button.type =
      "button";

    button.className =
      selectedExport.className ||
      "cg18-btn";

    button.textContent =
      "Exporter tout Q/R";

    button.addEventListener(
      "click",
      exportAll
    );


    selectedExport.insertAdjacentElement(
      "afterend",
      button
    );


    const actions =
      selectedExport.closest(
        ".cg18-actions"
      );


    if (actions) {

      const status =
        document.createElement(
          "div"
        );

      status.id =
        "cg140ExportStatus";

      status.innerHTML = `
        <progress
          id="cg140Progress"
          hidden
        ></progress>

        <span
          id="cg140StatusText"
        ></span>

        <button
          id="cg140Cancel"
          type="button"
          class="cg18-btn"
          hidden
        >
          Annuler export
        </button>
      `;

      actions.insertAdjacentElement(
        "afterend",
        status
      );


      q("#cg140Cancel")
        ?.addEventListener(
          "click",
          cancel
        );
    }


    installStyle();

    return true;
  }


  function boot() {

    document.documentElement
      .dataset
      .cgweb140 =
        VERSION;


    if (install()) {
      return;
    }


    /*
     * Observer temporaire uniquement :
     * il se déconnecte dès que le Répertoire est monté.
     */
    const observer =
      new MutationObserver(
        () => {

          if (install()) {

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

        install();

        if (
          q("#cg140ExportAll")
        ) {
          observer.disconnect();
        }
      },
      1500
    );
  }


  window.CGWEB140 =
    Object.freeze({
      version:VERSION,
      exportAll,
      cancel
    });


  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      boot,
      {
        once:true
      }
    );

  } else {

    boot();
  }

})();
