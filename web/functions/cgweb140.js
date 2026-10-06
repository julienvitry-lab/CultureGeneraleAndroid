"use strict";

/*
 * CGWEB140
 * FULL_QR_EXPORT001
 * SERVER_PAGINATION001
 * ANSWER_CANONICAL001
 *
 * Une requête = une page Firestore.
 *
 * Aucun ancien champ QCM n'est renvoyé au navigateur.
 * Les propositions legacy servent uniquement à reconstruire answer
 * lorsqu'une ancienne fiche ne possède pas encore le champ canonique.
 */

const { onRequest } =
  require("firebase-functions/v2/https");

const {
  getApps,
  initializeApp
} =
  require("firebase-admin/app");

const {
  getAuth
} =
  require("firebase-admin/auth");

const {
  getFirestore,
  FieldPath
} =
  require("firebase-admin/firestore");


if (!getApps().length) {
  initializeApp();
}


const REGION =
  "europe-west1";

const DEFAULT_PAGE_SIZE =
  1000;

const MAX_PAGE_SIZE =
  1000;


/* ============================================================
   HTTP
   ============================================================ */

function cors(req, res) {

  res.set(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.set(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type"
  );

  res.set(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  if (req.method === "OPTIONS") {

    res.status(204).send("");
    return true;
  }

  return false;
}


function json(res, status, body) {

  res.status(status);

  res.set(
    "content-type",
    "application/json; charset=utf-8"
  );

  res.send(
    JSON.stringify(body)
  );
}


async function requireUser(req) {

  const header =
    String(
      req.headers.authorization || ""
    );

  if (!header.startsWith("Bearer ")) {

    throw Object.assign(
      new Error(
        "Authentification Firebase requise."
      ),
      {
        status:401
      }
    );
  }

  return getAuth().verifyIdToken(
    header.slice(7)
  );
}


/* ============================================================
   QR
   ============================================================ */

function text(value) {

  return String(
    value ?? ""
  ).trim();
}


function resolveAnswer(data) {

  if (
    !data ||
    typeof data !== "object"
  ) {
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

  if (direct) {
    return direct;
  }


  /*
   * LEGACY READ ONLY.
   * Convention historique 1..4.
   */
  const index =
    Number(
      data.correct_index
    );

  if (
    Number.isInteger(index) &&
    index >= 1 &&
    index <= 4
  ) {

    const key =
      `proposition_${
        String.fromCharCode(
          96 + index
        )
      }`;

    return text(
      data[key]
    );
  }


  /*
   * Quelques anciennes fiches :
   * index 0 + proposition_a.
   */
  if (index === 0) {

    return text(
      data.proposition_a
    );
  }


  return "";
}


/* ============================================================
   CSV
   ============================================================ */

const HEADERS =
  Object.freeze([
    "ID",
    "Original_ID",
    "Megatheme",
    "Theme",
    "Question",
    "Detail",
    "Reponse",
    "Origine",
    "URL_Quizypedia",
    "URL_Internet",
    "Image",
    "Statut",
    "Non_trouve",
    "Is_image"
  ]);


function csvCell(value) {

  const string =
    String(
      value ?? ""
    );

  return `"${string.replace(
    /"/g,
    '""'
  )}"`;
}


function csvLine(values) {

  return values
    .map(csvCell)
    .join(";")
    + "\r\n";
}


function exportRow(doc) {

  const data =
    doc.data() || {};

  return [
    doc.id,
    data.original_id ?? "",
    data.megatheme ?? "",
    data.theme ?? "",
    data.question ?? "",
    data.detail ?? "",
    resolveAnswer(data),
    data.question_origin ?? "",
    data.url_quizypedia ?? "",
    data.url_internet ?? "",
    data.image_file ?? "",
    data.status ?? "",
    data.non_trouve ?? "",
    data.is_image ?? ""
  ];
}


/* ============================================================
   SERVER_PAGINATION001
   ============================================================ */

async function exportPage(
  uid,
  body
) {

  const db =
    getFirestore();

  const questions =
    db
      .collection("users")
      .doc(uid)
      .collection("questions");


  const requested =
    Number(
      body?.pageSize
    );

  const pageSize =
    Math.max(
      1,
      Math.min(
        Number.isFinite(requested) &&
        requested > 0
          ? Math.floor(requested)
          : DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE
      )
    );


  const cursor =
    typeof body?.cursor === "string"
      ? body.cursor
      : "";


  /*
   * Projection minimale.
   *
   * Les champs proposition_* ne sont lus que pour assurer le fallback
   * des anciennes fiches et ne quittent jamais le backend.
   */
  let query =
    questions
      .select(
        "original_id",
        "megatheme",
        "theme",
        "question",
        "detail",
        "answer",
        "correct_answer",
        "question_origin",
        "url_quizypedia",
        "url_internet",
        "image_file",
        "status",
        "non_trouve",
        "is_image",
        "proposition_a",
        "proposition_b",
        "proposition_c",
        "proposition_d",
        "correct_index"
      )
      .orderBy(
        FieldPath.documentId()
      );


  if (cursor) {

    query =
      query.startAfter(
        cursor
      );
  }


  query =
    query.limit(
      pageSize
    );


  const snap =
    await query.get();


  const firstPage =
    !cursor;


  let csv = "";

  if (firstPage) {

    csv +=
      csvLine(
        HEADERS
      );
  }


  for (const doc of snap.docs) {

    csv +=
      csvLine(
        exportRow(doc)
      );
  }


  const last =
    snap.docs.length
      ? snap.docs[
          snap.docs.length - 1
        ]
      : null;


  let total = null;

  /*
   * Une seule requête de comptage :
   * uniquement sur la première page.
   */
  if (
    firstPage &&
    body?.includeTotal !== false
  ) {

    try {

      const countSnap =
        await questions
          .count()
          .get();

      total =
        Number(
          countSnap.data()?.count || 0
        );

    } catch (error) {

      console.warn(
        "CGWEB140 count",
        error?.message ||
        String(error)
      );
    }
  }


  return {
    ok:true,
    schema:"CGWEB140_QR_EXPORT_V1",
    pageSize,
    count:snap.size,
    total,
    nextCursor:
      snap.size === pageSize && last
        ? last.id
        : null,
    csv
  };
}


/* ============================================================
   FUNCTION
   ============================================================ */

exports.cgweb140ExportPage =
  onRequest(
    {
      region:REGION,
      timeoutSeconds:120,
      memory:"512MiB"
    },
    async (req, res) => {

      if (cors(req, res)) {
        return;
      }

      try {

        if (req.method !== "POST") {

          return json(
            res,
            405,
            {
              ok:false,
              error:"POST attendu."
            }
          );
        }


        const user =
          await requireUser(req);


        const result =
          await exportPage(
            user.uid,
            req.body || {}
          );


        return json(
          res,
          200,
          result
        );

      } catch (error) {

        console.error(
          "CGWEB140",
          error
        );

        return json(
          res,
          Number(
            error?.status
          ) || 500,
          {
            ok:false,
            error:
              error?.message ||
              String(error)
          }
        );
      }
    }
  );
