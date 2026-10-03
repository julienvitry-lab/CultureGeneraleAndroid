(function(root){
  "use strict";

  /*
   * CGWEB137 · LEGACY_READER_MINIMIZE001
   *
   * UNIQUE frontière de lecture du vieux schéma QCM
   * pour le navigateur.
   *
   * Le reste de CGWEB manipule uniquement answer.
   */

  const VERSION =
    "CGWEB137_LEGACY_READER_CORE001";

  const LEGACY_FIELDS =
    Object.freeze([
      "proposition_a",
      "proposition_b",
      "proposition_c",
      "proposition_d",
      "correct_index"
    ]);


  function text(value){
    return String(
      value ?? ""
    ).trim();
  }


  function resolveAnswer(data){

    if(
      !data ||
      typeof data !== "object"
    ){
      return "";
    }


    /*
     * Vérité canonique.
     */
    const direct =
      text(
        data.answer ??
        data.correct_answer ??
        ""
      );

    if(direct){
      return direct;
    }


    /*
     * LEGACY READ ONLY.
     *
     * Utilisé uniquement pour une ancienne question
     * ne possédant pas encore answer.
     */
    const index =
      Number(
        data.correct_index
      );


    if(
      Number.isInteger(index) &&
      index >= 1 &&
      index <= 4
    ){
      const key =
        `proposition_${String.fromCharCode(96 + index)}`;

      return text(
        data[key]
      );
    }


    /*
     * Quelques anciens documents normalisés
     * utilisaient index 0 + proposition_a.
     */
    if(index === 0){
      return text(
        data.proposition_a
      );
    }


    return "";
  }


  function isLegacyField(name){
    return LEGACY_FIELDS.includes(
      String(name ?? "")
    );
  }


  root.CGQR001 =
    Object.freeze({
      version:VERSION,
      resolveAnswer,
      isLegacyField
    });

})(window);
