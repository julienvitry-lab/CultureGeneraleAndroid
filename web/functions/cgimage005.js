const {onRequest} = require('firebase-functions/v2/https');
const {getApps, initializeApp} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getStorage} = require('firebase-admin/storage');
const {getFirestore, FieldPath, FieldValue} = require('firebase-admin/firestore');
const cheerio = require('cheerio');
const crypto = require('crypto');

if (!getApps().length) initializeApp();

const REGION = 'europe-west1';
const MAX_BATCH = 500;
const MAX_SCAN = 2000;
const MAX_BYTES = 15 * 1024 * 1024;
const USER_AGENT = 'Mozilla/5.0 (compatible; CGIMAGE005/1.0; +https://culturegeneralesync.web.app)';

function json(res, status, body) {
  res.status(status);
  res.set('content-type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(body, null, 2));
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
function one(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}
function isCloudPath(v) {
  const p = one(v);
  return p.startsWith('users/') && p.includes('/question-images/');
}
function isHttpUrl(v) {
  return /^https?:\/\//i.test(one(v));
}
function extFromType(type) {
  const t = one(type).toLowerCase().split(';')[0];
  if (t === 'image/jpeg') return '.jpg';
  if (t === 'image/png') return '.png';
  if (t === 'image/webp') return '.webp';
  if (t === 'image/gif') return '.gif';
  if (t === 'image/svg+xml') return '.svg';
  if (t === 'image/avif') return '.avif';
  return '.img';
}
function fetchHeaders() {
  return {
    'user-agent': USER_AGENT,
    'accept-language': 'fr-FR,fr;q=0.9,en;q=0.7'
  };
}
function safeQuestionSegment(id) {
  return encodeURIComponent(String(id || '').trim()).replaceAll('/', '%2F');
}
function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
function sourceSeeds(data) {
  const out = [];
  const push = (label, value) => {
    const u = one(value);
    if (!u || !isHttpUrl(u)) return;
    if (!out.some(item => item.url === u)) out.push({label, url: u});
  };
  push('url_internet', data?.url_internet);
  push('image_source_url', data?.image_source_url);
  if (!isCloudPath(data?.image_file)) push('image_file', data?.image_file);
  push('url_quizypedia', data?.url_quizypedia);
  return out;
}
function candidateImageFromHtml(html, baseUrl) {
  const $ = cheerio.load(String(html || ''));
  const candidates = [];
  const push = raw => {
    const v = one(raw);
    if (!v) return;
    try {
      const u = new URL(v, baseUrl).toString();
      if (!candidates.includes(u)) candidates.push(u);
    } catch (_) {}
  };
  push($('meta[property="og:image"]').attr('content'));
  push($('meta[name="twitter:image"]').attr('content'));
  push($('link[rel="image_src"]').attr('href'));
  $('main img[src], article img[src], .content img[src], img[src]').each((_, el) => {
    if (candidates.length >= 12) return false;
    push($(el).attr('src'));
  });
  return candidates;
}
async function fetchImageFromUrl(url) {
  const response = await fetch(url, {redirect: 'follow', headers: fetchHeaders()});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = one(response.headers.get('content-type') || '').toLowerCase();
  const length = Number(response.headers.get('content-length') || 0);
  if (contentType.startsWith('image/')) {
    if (length > MAX_BYTES) throw new Error(`Image trop volumineuse (${length} octets)`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new Error('Image vide');
    if (buffer.length > MAX_BYTES) throw new Error(`Image trop volumineuse (${buffer.length} octets)`);
    return {finalUrl: response.url || url, contentType, buffer, via: 'direct'};
  }
  if (contentType.includes('text/html')) {
    const html = await response.text();
    const candidates = candidateImageFromHtml(html, response.url || url);
    for (const candidate of candidates) {
      try {
        const nested = await fetch(candidate, {redirect: 'follow', headers: fetchHeaders()});
        if (!nested.ok) continue;
        const nestedType = one(nested.headers.get('content-type') || '').toLowerCase();
        if (!nestedType.startsWith('image/')) continue;
        const nestedLength = Number(nested.headers.get('content-length') || 0);
        if (nestedLength > MAX_BYTES) continue;
        const buffer = Buffer.from(await nested.arrayBuffer());
        if (!buffer.length || buffer.length > MAX_BYTES) continue;
        return {finalUrl: nested.url || candidate, contentType: nestedType, buffer, via: 'html'};
      } catch (_) {}
    }
    throw new Error('Aucune image exploitable trouvée dans la page HTML');
  }
  throw new Error(`Type de contenu non géré : ${contentType || 'inconnu'}`);
}
async function resolveImage(data) {
  const seeds = sourceSeeds(data);
  const errors = [];
  for (const seed of seeds) {
    try {
      const result = await fetchImageFromUrl(seed.url);
      return {...result, seedLabel: seed.label, seedUrl: seed.url};
    } catch (error) {
      errors.push(`${seed.label}: ${error?.message || String(error)}`);
    }
  }
  throw new Error(errors.join(' | ') || 'Aucune source exploitable');
}
function hasHistoricalImage(data) {
  return Number(data?.is_image || 0) === 1 || Boolean(one(data?.image_file)) || Boolean(one(data?.url_internet)) || Boolean(one(data?.url_quizypedia));
}
async function migrateOne({uid, id, data}) {
  const db = getFirestore();
  const bucket = getStorage().bucket();
  const image = await resolveImage(data);
  const digest = sha256(image.buffer);
  const folder = `users/${uid}/question-images/${safeQuestionSegment(id)}`;
  const mainPath = `${folder}/${digest.slice(0, 24)}-main${extFromType(image.contentType)}`;
  await bucket.file(mainPath).save(image.buffer, {
    resumable: false,
    contentType: image.contentType,
    metadata: {
      cacheControl: 'private,max-age=604800',
      metadata: {
        cgimage: 'CGIMAGE005_1',
        questionId: String(id),
        sha256: digest,
        sourceUrl: image.finalUrl || '',
        fetchedFrom: image.seedUrl || '',
        sourceField: image.seedLabel || '',
        via: image.via || ''
      }
    }
  });
  const ref = db.collection('users').doc(uid).collection('questions').doc(String(id));
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error(`Question ${id} introuvable lors de la mise à jour.`);
    const cloud = snap.data() || {};
    const previousRevision = Number(cloud.cg_revision || 0) || 0;
    tx.update(ref, {
      image_file: mainPath,
      image_thumb_file: '',
      image_source_url: image.finalUrl || image.seedUrl || '',
      image_mime: image.contentType,
      image_bytes: image.buffer.length,
      image_sha256: digest,
      image_schema: 1,
      image_origin: 'firebase_storage',
      image_original_name: '',
      image_updated_ms: Date.now(),
      is_image: 1,
      non_trouve: 0,
      cg_revision: previousRevision + 1,
      cg_base_revision: previousRevision,
      cg_updated_at: FieldValue.serverTimestamp(),
      cg_updated_by: 'server',
      cg_writer_id: 'cgimage005',
      cg_writer_label: 'Server · CGIMAGE005',
      cg_update_source: 'CGIMAGE005_MIGRATION'
    });
  });
  return {questionId: id, path: mainPath, sourceUrl: image.finalUrl || image.seedUrl || '', bytes: image.buffer.length, mime: image.contentType, sha256: digest, via: image.via, seedLabel: image.seedLabel};
}
async function markNotFound(uid, id, reason) {
  const db = getFirestore();
  const ref = db.collection('users').doc(uid).collection('questions').doc(String(id));
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const cloud = snap.data() || {};
    const previousRevision = Number(cloud.cg_revision || 0) || 0;
    tx.update(ref, {
      non_trouve: 1,
      cg_revision: previousRevision + 1,
      cg_base_revision: previousRevision,
      cg_updated_at: FieldValue.serverTimestamp(),
      cg_updated_by: 'server',
      cg_writer_id: 'cgimage005',
      cg_writer_label: 'Server · CGIMAGE005',
      cg_update_source: `CGIMAGE005_NOT_FOUND:${String(reason || '').slice(0, 120)}`
    });
  });
}

exports.cgimage005MigrateBatch = onRequest({region: REGION, timeoutSeconds: 540, memory: '1GiB'}, async (req, res) => {
  if (cors(req, res)) return;
  try {
    if (req.method !== 'POST') return json(res, 405, {ok: false, error: 'POST attendu.'});
    const user = await requireUser(req);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const dryRun = Boolean(body.dryRun);
    const markMissing = Boolean(body.markMissing);
    const allowNoImageFlag = Boolean(body.allowNoImageFlag);
    const limit = Math.min(Math.max(Number(body.limit) || 100, 1), MAX_BATCH);
    const scanLimit = Math.min(Math.max(Number(body.scanLimit) || (limit * 8), limit), MAX_SCAN);
    const cursor = one(body.cursor);
    const db = getFirestore();
    let query = db.collection('users').doc(user.uid).collection('questions').orderBy(FieldPath.documentId()).limit(scanLimit);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    const stats = {scanned: 0, alreadyCloud: 0, noHistoricalImage: 0, noSource: 0, candidates: 0, migrated: 0, failed: 0, markedMissing: 0};
    const candidates = [];
    let lastScannedId = cursor;
    for (const doc of snap.docs) {
      lastScannedId = doc.id;
      stats.scanned++;
      const data = doc.data() || {};
      if (isCloudPath(data.image_file)) { stats.alreadyCloud++; continue; }
      if (!hasHistoricalImage(data) && !allowNoImageFlag) { stats.noHistoricalImage++; continue; }
      const seeds = sourceSeeds(data);
      if (!seeds.length) { stats.noSource++; continue; }
      candidates.push({id: doc.id, data, seeds});
      if (candidates.length >= limit) break;
    }
    stats.candidates = candidates.length;
    const result = {
      ok: true,
      dryRun,
      limit,
      scanLimit,
      cursor,
      nextCursor: lastScannedId || '',
      hasMore: snap.size === scanLimit,
      stats,
      samples: candidates.slice(0, 25).map(item => ({id: item.id, question: one(item.data.question).slice(0, 140), sourceFields: item.seeds.map(s => `${s.label}:${s.url}`).slice(0, 4)})),
      migrated: [],
      failed: []
    };
    if (dryRun || !candidates.length) return json(res, 200, result);
    for (const item of candidates) {
      try {
        const migrated = await migrateOne({uid: user.uid, id: item.id, data: item.data});
        stats.migrated++;
        result.migrated.push(migrated);
      } catch (error) {
        const message = error?.message || String(error);
        stats.failed++;
        result.failed.push({id: item.id, error: message});
        if (markMissing) {
          try {
            await markNotFound(user.uid, item.id, message);
            stats.markedMissing++;
          } catch (markError) {
            result.failed[result.failed.length - 1].markMissingError = markError?.message || String(markError);
          }
        }
      }
    }
    return json(res, 200, result);
  } catch (error) {
    return json(res, Number(error?.status) || 500, {ok: false, error: error?.message || String(error)});
  }
});
