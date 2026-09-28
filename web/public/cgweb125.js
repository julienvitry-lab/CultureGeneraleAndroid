/*
 * CGWEB125
 *
 * QUIZYPEDIA_MINIMAL001
 * SINGLE_URL_ONLY001
 * AUXILIARY_UI_RETIRE001
 * DUPLICATE_ACTION_REMOVE001
 * THEME_AUTO_ONLY001
 */

(()=>{
  "use strict";


  const remove=
    selector=>{

      document
        .querySelectorAll(selector)
        .forEach(
          node=>
            node.remove()
        );
    };


  function cleanup(){

    /*
     * Anciens blocs retirés.
     * Sert aussi de garde contre un ancien cache navigateur.
     */
    remove("#cgimport011Bulk");
    remove("#cgweb040ControlCenter");
    remove("#cgweb122Panel");
    remove("#cgweb123Panel");


    /*
     * Plus de sélection globale manuelle.
     */
    remove("#cgimp2All");
    remove("#cgimp2None");


    /*
     * Thème entièrement automatique.
     */
    const theme=
      document.getElementById(
        "cgimp2Theme"
      );


    if(theme){

      theme.type=
        "hidden";

      const field=
        theme.closest(
          ".cgimp2-field"
        );


      if(field){
        field.style.display=
          "none";
      }
    }


    /*
     * Hook technique du moteur historique.
     * Ne doit jamais apparaître à l'utilisateur.
     */
    const technicalImport=
      document.getElementById(
        "cgimp2Import"
      );


    if(technicalImport){

      technicalImport.hidden=
        true;

      technicalImport.style.display=
        "none";

      technicalImport.setAttribute(
        "aria-hidden",
        "true"
      );

      technicalImport.tabIndex=
        -1;
    }


    const toolbar=
      document.querySelector(
        "#cgimport002Panel .cgimp2-toolbar"
      );


    if(toolbar){
      toolbar.remove();
    }


    /*
     * URL unique = seul mode Quizypedia restant.
     */
    const single=
      document.getElementById(
        "cgimport002Panel"
      );


    if(single){
      single.hidden=false;
    }
  }


  if(
    document.readyState==="loading"
  ){

    document.addEventListener(
      "DOMContentLoaded",
      cleanup,
      {
        once:true
      }
    );

  }else{

    cleanup();
  }


  /*
   * Protection complémentaire contre les scripts
   * éventuellement encore servis depuis un ancien cache.
   */
  setTimeout(
    cleanup,
    250
  );

  setTimeout(
    cleanup,
    1200
  );


  window.CGWEB125={

    version:
      "CGWEB125_QUIZYPEDIA_MINIMAL001",

    cleanup
  };

})();
