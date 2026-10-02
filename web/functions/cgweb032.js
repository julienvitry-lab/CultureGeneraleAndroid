// CGWEB121_FIX2_STREAMING_DIRECTORY_SCAN001_PROJECTED_FIELDS001_BOUNDED_RESULT_CACHE001

const {
  onRequest
} = require('firebase-functions/v2/https');

const {
  getApps,
  initializeApp
} = require('firebase-admin/app');

const {
  getAuth
} = require('firebase-admin/auth');

const {
  getFirestore,
  FieldPath
} = require('firebase-admin/firestore');

const {
  handleLearningHub
} = require('./cgweb035');

const {getQuestionCatalog}=require('./cgcost001');


if (!getApps().length) {
  initializeApp();
}


const REGION = 'europe-west1';

/*
 * STREAMING_DIRECTORY_SCAN001
 *
 * La base n'est plus chargée intégralement en RAM.
 * Firestore est parcouru par blocs projetés.
 */
const BATCH_SIZE = 1000;


/*
 * PROJECTED_FIELDS001
 *
 * On ne télécharge que les champs réellement utiles
 * au Répertoire et au moteur plein texte.
 */
const PROJECTED_FIELDS = [
  'question',
  'detail',
  'megatheme',
  'theme',
  'status',
  'is_image',
  'non_trouve'
];


/*
 * BOUNDED_RESULT_CACHE001
 *
 * Le cache ne contient JAMAIS le catalogue complet.
 * Il contient au maximum quelques réponses finales,
 * chaque réponse comportant au plus 300 lignes.
 */
const RESULT_CACHE = new Map();
const RESULT_CACHE_TTL = 5 * 60 * 1000;
const RESULT_CACHE_MAX_ENTRIES = 16;


const one = value =>
  String(value ?? '').trim();


const norm = value =>
  one(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();


function cors(req, res) {
  res.set(
    'Access-Control-Allow-Origin',
    '*'
  );

  res.set(
    'Access-Control-Allow-Headers',
    'Authorization, X-Firebase-Auth, Content-Type'
  );

  res.set(
    'Access-Control-Allow-Methods',
    'POST, OPTIONS'
  );

  res.set(
    'Access-Control-Max-Age',
    '3600'
  );

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true;
  }

  return false;
}


function json(res, status, body) {
  res
    .status(status)
    .set(
      'content-type',
      'application/json; charset=utf-8'
    )
    .send(
      JSON.stringify(body)
    );
}


async function user(req) {

  /*
   * FIREBASE_AUTH_HEADER_ISOLATION001
   *
   * X-Firebase-Auth reste le chemin prioritaire.
   */
  const isolated =
    one(
      req.headers['x-firebase-auth']
    );

  if (isolated) {
    const token =
      isolated.replace(
        /^Bearer\s+/i,
        ''
      );

    return getAuth()
      .verifyIdToken(token);
  }


  /*
   * Compatibilité historique.
   */
  const legacy =
    one(
      req.headers.authorization
    );

  if (
    legacy.startsWith(
      'Bearer '
    )
  ) {
    return getAuth()
      .verifyIdToken(
        legacy.slice(7)
      );
  }


  throw Object.assign(
    new Error(
      'Authentification Firebase requise.'
    ),
    {
      status: 401
    }
  );
}


function cacheGet(key) {
  const hit =
    RESULT_CACHE.get(key);

  if (!hit) {
    return null;
  }

  if (
    Date.now() - hit.at >
    RESULT_CACHE_TTL
  ) {
    RESULT_CACHE.delete(key);
    return null;
  }

  /*
   * LRU simple :
   * l'élément consulté revient en fin de Map.
   */
  RESULT_CACHE.delete(key);
  RESULT_CACHE.set(key, hit);

  return hit.value;
}


function cachePut(key, value) {

  RESULT_CACHE.delete(key);

  RESULT_CACHE.set(
    key,
    {
      at: Date.now(),
      value
    }
  );

  while (
    RESULT_CACHE.size >
    RESULT_CACHE_MAX_ENTRIES
  ) {
    const oldest =
      RESULT_CACHE.keys().next().value;

    RESULT_CACHE.delete(oldest);
  }
}


function makeCacheKey(uid, criteria) {
  return JSON.stringify([
    uid,
    criteria.term,
    criteria.megatheme,
    criteria.theme,
    criteria.withImage,
    criteria.status,
    criteria.nonTrouve,
    criteria.offset,
    criteria.sortField,
    criteria.sortDirection,
    criteria.limit
  ]);
}


function rowFromDocument(doc) {
  const x =
    doc.data() || {};

  return {
    id: doc.id,

    question:
      one(x.question),

    detail:
      one(x.detail),

    megatheme:
      one(x.megatheme),

    theme:
      one(x.theme),

    status:
      one(x.status),

    is_image:
      Number(
        x.is_image || 0
      ),

    non_trouve:
      Number(
        x.non_trouve || 0
      )
  };
}


function evaluateRow(row, criteria) {

  /*
   * Les formes normalisées vivent uniquement
   * le temps du traitement de CETTE ligne.
   * Elles ne sont plus stockées dans un catalogue.
   */
  const q =
    norm(row.question);

  const d =
    norm(row.detail);

  const m =
    norm(row.megatheme);

  const t =
    norm(row.theme);


  if (
    criteria.megatheme &&
    !m.includes(criteria.megatheme)
  ) {
    return null;
  }


  if (
    criteria.theme &&
    !t.includes(criteria.theme)
  ) {
    return null;
  }


  if (
    criteria.withImage === 'yes' &&
    !row.is_image
  ) {
    return null;
  }


  if (
    criteria.withImage === 'no' &&
    row.is_image
  ) {
    return null;
  }


  if (
    criteria.status &&
    one(row.status) !==
    criteria.status
  ) {
    return null;
  }


  if (
    criteria.nonTrouve === '1' &&
    Number(row.non_trouve) !== 1
  ) {
    return null;
  }


  if (
    criteria.nonTrouve === '0' &&
    Number(row.non_trouve) === 1
  ) {
    return null;
  }


  if (
    criteria.words.length
  ) {
    const hay =
      `${q} ${t} ${m} ${d}`;

    if (
      !criteria.words.every(
        word =>
          hay.includes(word)
      )
    ) {
      return null;
    }
  }


  let score = 0;

  if (criteria.term) {

    if (q === criteria.term) {
      score += 100;
    }

    if (
      q.startsWith(
        criteria.term
      )
    ) {
      score += 60;
    }

    if (
      q.includes(
        criteria.term
      )
    ) {
      score += 40;
    }

    if (
      t.includes(
        criteria.term
      )
    ) {
      score += 25;
    }

    if (
      m.includes(
        criteria.term
      )
    ) {
      score += 15;
    }
  }


  return {
    ...row,
    score
  };
}


function compareRows(
  a,
  b,
  criteria
) {

  const idCompare = () =>
    String(a.id)
      .localeCompare(
        String(b.id),
        undefined,
        {
          numeric: true
        }
      );


  if (
    !criteria.sortField ||
    criteria.sortField === 'score'
  ) {
    return (
      b.score -
      a.score
    ) || idCompare();
  }


  const value = row => {

    switch (
      criteria.sortField
    ) {

      case 'question':
        return row.question;

      case 'megatheme':
        return row.megatheme;

      case 'theme':
        return row.theme;

      case 'status':
        return row.status;

      case 'id':
        return row.id;

      default:
        return row.score;
    }
  };


  const av =
    String(
      value(a) ?? ''
    );

  const bv =
    String(
      value(b) ?? ''
    );


  const direction =
    criteria.sortDirection === 'desc'
      ? -1
      : 1;


  const cmp =
    av.localeCompare(
      bv,
      'fr',
      {
        numeric: true,
        sensitivity: 'base'
      }
    );


  return (
    cmp * direction
  ) || idCompare();
}


async function streamingSearch(uid,criteria){
  const startedAt=Date.now();
  const catalog=await getQuestionCatalog(uid);
  const keepCount=Math.max(1,criteria.offset+criteria.limit);
  const candidates=[];
  let total=0;

  for(const row of catalog.rows){
    const match=evaluateRow(row,criteria);
    if(!match)continue;
    total++;
    candidates.push(match);

    if(candidates.length>keepCount+2000){
      candidates.sort((a,b)=>compareRows(a,b,criteria));
      candidates.length=Math.min(candidates.length,keepCount);
    }
  }

  candidates.sort((a,b)=>compareRows(a,b,criteria));
  if(candidates.length>keepCount)candidates.length=keepCount;

  const page=candidates.slice(criteria.offset,criteria.offset+criteria.limit);
  const nextOffset=criteria.offset+page.length;

  return {
    ok:true,
    total,
    catalogSize:catalog.rows.length,
    cached:catalog.source!=='firestore-full-build'&&catalog.source!=='firestore-full-build-count-repair',
    rows:page,
    offset:criteria.offset,
    nextOffset:nextOffset<total?nextOffset:null,
    truncated:nextOffset<total,
    scanMode:'cgcost001-persistent-catalog',
    batchSize:0,
    batches:0,
    scanMs:Date.now()-startedAt,
    catalogSource:catalog.source,
    catalogVersion:catalog.version,
    catalogFirestoreReads:catalog.firestoreReads,
    catalogChangedRows:catalog.changedRows,
    catalogDeletedRows:catalog.deletedRows
  };
}

exports.cgweb032Search =
  onRequest(
    {
      region: REGION,

      /*
       * DIRECT_FUNCTION_ENDPOINT002 permet
       * d'utiliser réellement cette fenêtre longue
       * sans passer par Firebase Hosting.
       */
      timeoutSeconds: 540,

      memory: '1GiB'
    },

    async (
      req,
      res
    ) => {

      if (
        cors(req, res)
      ) {
        return;
      }


      /*
       * Compatibilité CGWEB035 existante.
       */
      if (
        req.body &&
        req.body.cgweb035 === true
      ) {
        return handleLearningHub(
          req,
          res
        );
      }


      try {

        if (
          req.method !== 'POST'
        ) {
          return json(
            res,
            405,
            {
              ok: false,
              error:
                'POST attendu.'
            }
          );
        }


        const authenticatedUser =
          await user(req);


        const body =
          req.body || {};


        const criteria = {

          term:
            norm(body.term),

          megatheme:
            norm(body.megatheme),

          theme:
            norm(body.theme),

          withImage:
            one(body.withImage),

          status:
            one(body.status),

          nonTrouve:
            one(body.nonTrouve),

          offset:
            Math.max(
              0,
              Number(
                body.offset
              ) || 0
            ),

          sortField:
            one(
              body.sortField
            ),

          sortDirection:
            one(
              body.sortDirection
            ) === 'desc'
              ? 'desc'
              : 'asc',

          limit:
            Math.min(
              Math.max(
                Number(
                  body.limit
                ) || 100,
                1
              ),
              300
            )
        };


        criteria.words =
          criteria.term
            .split(/\s+/)
            .filter(Boolean);


        if (
          !criteria.term &&
          !criteria.megatheme &&
          !criteria.theme
        ) {
          return json(
            res,
            400,
            {
              ok: false,
              error:
                'Saisis au moins un critère.'
            }
          );
        }


        const cacheKey =
          makeCacheKey(
            authenticatedUser.uid,
            criteria
          );


        /*
         * forceRefresh ne reconstruit plus
         * un catalogue géant.
         * Il signifie simplement :
         * ne pas utiliser le cache de résultats.
         */
        if (
          !Boolean(
            body.forceRefresh
          )
        ) {

          const cached =
            cacheGet(
              cacheKey
            );


          if (cached) {
            return json(
              res,
              200,
              {
                ...cached,
                cached: true
              }
            );
          }
        }


        const result =
          await streamingSearch(
            authenticatedUser.uid,
            criteria
          );


        cachePut(
          cacheKey,
          result
        );


        return json(
          res,
          200,
          result
        );


      } catch (error) {

        console.error(
          'CGWEB121 FIX2 search error',
          error
        );


        return json(
          res,
          Number(
            error?.status
          ) || 500,
          {
            ok: false,

            error:
              error?.message ||
              String(error)
          }
        );
      }
    }
  );
