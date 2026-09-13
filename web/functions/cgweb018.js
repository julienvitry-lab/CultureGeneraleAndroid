const {onRequest} = require('firebase-functions/v2/https');
const {getApps, initializeApp} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');

if (!getApps().length) initializeApp();

const REGION = 'europe-west1';
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_RETURN_ROWS = 20000;

function one(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

function norm(v) {
  return one(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function json(res, status, body) {
  res.status(status);
  res.set('content-type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(body));
}

function cors(req, res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true;
  }
  return false;
}

async function requireUser(req) {
  const h = String(req.headers.authorization || '');
  if (!h.startsWith('Bearer ')) {
    throw Object.assign(new Error('Authentification Firebase requise.'), {status: 401});
  }
  return getAuth().verifyIdToken(h.slice(7));
}

async function buildThemeCatalog(uid) {
  const db = getFirestore();
  const questionsRef = db.collection('users').doc(uid).collection('questions');

  // On ne dépend PAS de question_search_delta : celui-ci peut être incomplet
  // pour les questions historiques. On lit uniquement le champ theme.
  const snap = await questionsRef.select('theme').get();
  const set = new Set();

  for (const doc of snap.docs) {
    const theme = one(doc.get('theme'));
    if (theme) set.add(theme);
  }

  const collator = new Intl.Collator('fr', {sensitivity: 'base', numeric: true});
  const themes = [...set].sort(collator.compare);

  const metaRef = db.collection('users').doc(uid).collection('meta').doc('cgweb018_theme_catalog');
  try {
    await metaRef.set({
      themes,
      theme_count: themes.length,
      question_count_at_build: snap.size,
      updated_ms: Date.now(),
      updated_at: FieldValue.serverTimestamp(),
      source: 'CGWEB018_FIX4'
    }, {merge: true});
  } catch (error) {
    // Si le catalogue devenait trop volumineux pour un document Firestore,
    // la recherche reste fonctionnelle pour cet appel.
    console.warn('CGWEB018 catalog cache write', error?.message || String(error));
  }

  return {themes, refreshed: true, questionCount: snap.size};
}

async function getThemeCatalog(uid, force = false) {
  const db = getFirestore();
  const metaRef = db.collection('users').doc(uid).collection('meta').doc('cgweb018_theme_catalog');

  if (!force) {
    const snap = await metaRef.get();
    if (snap.exists) {
      const data = snap.data() || {};
      const themes = Array.isArray(data.themes) ? data.themes.map(one).filter(Boolean) : [];
      const updatedMs = Number(data.updated_ms || 0);
      if (themes.length && updatedMs && Date.now() - updatedMs < CATALOG_TTL_MS) {
        return {
          themes,
          refreshed: false,
          questionCount: Number(data.question_count_at_build || 0)
        };
      }
    }
  }

  return buildThemeCatalog(uid);
}

function applyOtherFilters(rows, filters) {
  const megatheme = one(filters?.megatheme);
  const statusFilter = String(filters?.status || '');
  const questionPrefix = norm(filters?.questionPrefix || '');
  const imageState = String(filters?.imageState || '');
  const nonTrouve = String(filters?.nonTrouve || '');

  return rows.filter(row => {
    if (megatheme && String(row.megatheme || '') !== megatheme) return false;

    if (statusFilter) {
      const expected = statusFilter === '__EMPTY__' ? '' : statusFilter;
      if (String(row.status ?? '') !== expected) return false;
    }

    if (questionPrefix && !norm(row.question).startsWith(questionPrefix)) return false;

    const hasImage =
      Number(row.is_image || 0) === 1 || Boolean(one(row.image_file));
    if (imageState === '1' && !hasImage) return false;
    if (imageState === '0' && hasImage) return false;

    const missing = Number(row.non_trouve || 0) === 1;
    if (nonTrouve === '1' && !missing) return false;
    if (nonTrouve === '0' && missing) return false;

    return true;
  });
}

function sortRows(rows, sortField, sortDirection) {
  const direction = sortDirection === 'desc' ? -1 : 1;
  const collator = new Intl.Collator('fr', {numeric: true, sensitivity: 'base'});

  const value = row => {
    if (sortField === 'question') return String(row.question || '');
    if (sortField === 'megatheme') return String(row.megatheme || '');
    if (sortField === 'theme') return String(row.theme || '');
    if (sortField === 'status') return String(row.status ?? '');
    return String(row.id || '');
  };

  return rows.sort((a, b) => {
    const primary = collator.compare(value(a), value(b));
    if (primary !== 0) return primary * direction;
    return collator.compare(String(a.id), String(b.id)) * direction;
  });
}

async function search(uid, body, forceCatalog = false) {
  const term = one(body?.term);
  const needle = norm(term);
  if (!needle) throw Object.assign(new Error('Saisis un terme dans « Thème contient ».'), {status: 400});

  const pageSize = Math.max(1, Math.min(Number(body?.pageSize) || 50, 100));
  const offset = Math.max(0, Number(body?.cursor?.offset || 0));
  const filters = body?.filters && typeof body.filters === 'object' ? body.filters : {};
  const sortField = one(body?.sortField) || 'id';
  const sortDirection = body?.sortDirection === 'desc' ? 'desc' : 'asc';

  let catalog = await getThemeCatalog(uid, forceCatalog);
  let matchingThemes = catalog.themes.filter(theme => norm(theme).includes(needle));

  // Un catalogue ancien peut manquer un thème tout juste créé/modifié.
  if (!matchingThemes.length && !catalog.refreshed) {
    catalog = await getThemeCatalog(uid, true);
    matchingThemes = catalog.themes.filter(theme => norm(theme).includes(needle));
  }

  if (!matchingThemes.length) {
    return {
      ok: true,
      items: [],
      total: 0,
      nextCursor: null,
      matchingThemes: [],
      themeCatalogSize: catalog.themes.length,
      catalogRefreshed: catalog.refreshed,
      truncated: false
    };
  }

  const db = getFirestore();
  const questionsRef = db.collection('users').doc(uid).collection('questions');
  const rows = [];
  let truncated = false;

  // Requête exacte sur chacun des thèmes trouvés. Le « contient » est donc
  // appliqué au catalogue de thèmes, pas à l'index texte des questions.
  for (const theme of matchingThemes) {
    const snap = await questionsRef.where('theme', '==', theme).get();
    for (const doc of snap.docs) {
      rows.push({id: doc.id, ...doc.data()});
      if (rows.length >= MAX_RETURN_ROWS) {
        truncated = true;
        break;
      }
    }
    if (truncated) break;
  }

  const filtered = applyOtherFilters(rows, filters);
  sortRows(filtered, sortField, sortDirection);

  const items = filtered.slice(offset, offset + pageSize);
  const nextOffset = offset + items.length;

  return {
    ok: true,
    items,
    total: filtered.length,
    nextCursor: nextOffset < filtered.length ? {offset: nextOffset} : null,
    effectiveSort: sortField,
    matchingThemes,
    themeCatalogSize: catalog.themes.length,
    catalogRefreshed: catalog.refreshed,
    truncated
  };
}

exports.cgweb018ThemeContains = onRequest(
  {region: REGION, timeoutSeconds: 540, memory: '1GiB'},
  async (req, res) => {
    if (cors(req, res)) return;
    try {
      if (req.method !== 'POST') return json(res, 405, {ok: false, error: 'POST attendu.'});
      const user = await requireUser(req);
      const result = await search(user.uid, req.body || {}, false);
      return json(res, 200, result);
    } catch (error) {
      return json(res, Number(error?.status) || 500, {
        ok: false,
        error: error?.message || String(error)
      });
    }
  }
);
