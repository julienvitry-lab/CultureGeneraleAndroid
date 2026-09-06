#!/usr/bin/env python3
from pathlib import Path
import re

MAIN = Path('app/src/main/java/fr/culturegenerale/android/MainActivity.java')
GRADLE = Path('app/build.gradle')
APP = Path('web/public/app.js')
CG6 = Path('web/public/cgweb006.js')
CG12 = Path('web/public/cgweb012.js')
INDEX = Path('web/public/index.html')
CSS = Path('web/public/cgsync007.css')
JS = Path('web/public/cgsync007.js')

for p in (MAIN, GRADLE, APP, CG6, CG12, INDEX, CSS, JS):
    if not p.exists():
        raise SystemExit(f'ERREUR : fichier introuvable : {p}')

main = MAIN.read_text(encoding='utf-8')
gradle = GRADLE.read_text(encoding='utf-8')
app = APP.read_text(encoding='utf-8')
cg6 = CG6.read_text(encoding='utf-8')
cg12 = CG12.read_text(encoding='utf-8')
index = INDEX.read_text(encoding='utf-8')

print('==================================================')
print(' CGSYNC007 - CONFLITS MULTI-SESSION / MULTI-APPAREILS')
print('==================================================')

# ------------------------------------------------------------
# 1. Firestore transaction API
# ------------------------------------------------------------
if 'runTransaction' not in app.split('} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";')[0]:
    old = '  setDoc, deleteDoc\n} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";'
    new = '  setDoc, deleteDoc, runTransaction\n} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";'
    if old not in app:
        raise SystemExit('ERREUR : import Firestore attendu introuvable dans app.js')
    app = app.replace(old, new, 1)
    print('OK : runTransaction importé')
else:
    print('INFO : runTransaction déjà importé')

# ------------------------------------------------------------
# 2. Moteur transactionnel CGSYNC007
# ------------------------------------------------------------
if '// CGSYNC007_CONFLICT_ENGINE_START' not in app:
    anchor = '// CGWEB006_BRIDGE_START\n'
    if anchor not in app:
        raise SystemExit('ERREUR : ancre CGWEB006_BRIDGE_START introuvable')

    engine = r'''// CGSYNC007_CONFLICT_ENGINE_START
const CGSYNC007_EDITABLE_FIELDS = new Set([
  "megatheme", "theme", "question", "detail",
  "proposition_a", "proposition_b", "proposition_c", "proposition_d",
  "correct_index", "url_quizypedia", "url_internet", "image_file",
  "non_trouve", "is_image", "status",
  "updated_at", "updated_from", "cloud_schema"
]);

function cgsync007Revision(data) {
  const n = Number(data?.cg_revision ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
}

function cgsync007WriterId() {
  const key = "CGSYNC007_WRITER_ID";
  try {
    let value = localStorage.getItem(key);
    if (!value) {
      value = (globalThis.crypto?.randomUUID?.()
        || `web-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      localStorage.setItem(key, value);
    }
    return value;
  } catch (_) {
    return `web-${Date.now()}`;
  }
}

function cgsync007WriterMeta(source = "WEB") {
  const id = cgsync007WriterId();
  return {
    cg_updated_by: "web",
    cg_writer_id: id,
    cg_writer_label: `Web · ${id.slice(0, 8)}`,
    cg_update_source: String(source || "WEB")
  };
}

function cgsync007CleanPatch(patch) {
  const clean = {};
  for (const [key, value] of Object.entries(patch || {})) {
    if (CGSYNC007_EDITABLE_FIELDS.has(key) && value !== undefined) {
      clean[key] = value;
    }
  }
  return clean;
}

function cgsync007ExpectedRevision(options, cloudRevision) {
  const raw = options?.expectedRevision;
  if (raw === null || raw === undefined || raw === "") return cloudRevision;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : cloudRevision;
}

async function cgsync007WriteQuestion(questionId, patch, options = {}) {
  const u = auth.currentUser;
  if (!u) throw new Error("Utilisateur Firebase non connecté.");

  const id = String(questionId || "").trim();
  if (!id) throw new Error("ID manquant.");

  const clean = cgsync007CleanPatch(patch);
  if (!Object.keys(clean).length) throw new Error("Modification vide.");

  const questionRef = doc(db, "users", u.uid, "questions", id);
  const conflictRef = doc(collection(db, "users", u.uid, "question_conflicts"));
  const writer = cgsync007WriterMeta(options.source || "CGSYNC007");

  const result = await runTransaction(db, async transaction => {
    const snap = await transaction.get(questionRef);
    if (!snap.exists()) throw new Error(`Question ${id} introuvable.`);

    const cloud = snap.data() || {};
    const cloudRevision = cgsync007Revision(cloud);
    const expectedRevision = cgsync007ExpectedRevision(options, cloudRevision);

    if (!options.force && expectedRevision !== cloudRevision) {
      const conflict = {
        question_id: id,
        operation: "update",
        status: "open",
        expected_revision: expectedRevision,
        cloud_revision: cloudRevision,
        attempted_patch: clean,
        cloud_snapshot: cloud,
        cloud_updated_at: cloud.cg_updated_at || null,
        writer_id: writer.cg_writer_id,
        writer_label: writer.cg_writer_label,
        writer_type: "web",
        source: writer.cg_update_source,
        created_at: serverTimestamp()
      };

      transaction.set(conflictRef, conflict);

      return {
        ok: false,
        conflict: true,
        conflictId: conflictRef.id,
        questionId: id,
        expectedRevision,
        cloudRevision,
        cloud
      };
    }

    const nextRevision = cloudRevision + 1;
    transaction.update(questionRef, {
      ...clean,
      ...writer,
      cg_revision: nextRevision,
      cg_base_revision: cloudRevision,
      cg_updated_at: serverTimestamp()
    });

    if (options.conflictId) {
      const resolvedRef = doc(
        db,
        "users",
        u.uid,
        "question_conflicts",
        String(options.conflictId)
      );
      transaction.update(resolvedRef, {
        status: "resolved",
        resolution: options.resolution || "local_applied",
        resolved_revision: nextRevision,
        resolved_at: serverTimestamp(),
        resolved_by: writer.cg_writer_id
      });
    }

    return {
      ok: true,
      conflict: false,
      questionId: id,
      revision: nextRevision,
      previousRevision: cloudRevision
    };
  });

  if (result?.ok) {
    try {
      await cgindex001SyncQuestion(id);
    } catch (cgindexError) {
      console.warn("CGINDEX001 update", cgindexError);
    }
  }

  return result;
}

async function cgsync007DeleteQuestion(questionId, options = {}) {
  const u = auth.currentUser;
  if (!u) throw new Error("Utilisateur Firebase non connecté.");

  const id = String(questionId || "").trim();
  if (!id) throw new Error("ID manquant.");

  const questionRef = doc(db, "users", u.uid, "questions", id);
  const tombstoneRef = doc(db, "users", u.uid, "question_tombstones", id);
  const conflictRef = doc(collection(db, "users", u.uid, "question_conflicts"));
  const writer = cgsync007WriterMeta(options.source || "CGSYNC007_DELETE");

  const result = await runTransaction(db, async transaction => {
    const snap = await transaction.get(questionRef);
    if (!snap.exists()) {
      return { ok: true, alreadyDeleted: true, questionId: id };
    }

    const cloud = snap.data() || {};
    const cloudRevision = cgsync007Revision(cloud);
    const expectedRevision = cgsync007ExpectedRevision(options, cloudRevision);

    if (!options.force && expectedRevision !== cloudRevision) {
      transaction.set(conflictRef, {
        question_id: id,
        operation: "delete",
        status: "open",
        expected_revision: expectedRevision,
        cloud_revision: cloudRevision,
        cloud_snapshot: cloud,
        cloud_updated_at: cloud.cg_updated_at || null,
        writer_id: writer.cg_writer_id,
        writer_label: writer.cg_writer_label,
        writer_type: "web",
        source: writer.cg_update_source,
        created_at: serverTimestamp()
      });

      return {
        ok: false,
        conflict: true,
        conflictId: conflictRef.id,
        questionId: id,
        expectedRevision,
        cloudRevision,
        cloud,
        operation: "delete"
      };
    }

    transaction.set(tombstoneRef, {
      question_id: id,
      deleted_at: serverTimestamp(),
      source: "CGSYNC007",
      deleted_revision: cloudRevision,
      ...writer
    });
    transaction.delete(questionRef);

    return {
      ok: true,
      conflict: false,
      questionId: id,
      deletedRevision: cloudRevision
    };
  });

  if (result?.ok) {
    try {
      await cgindex001MarkDeleted(id);
    } catch (cgindexError) {
      console.warn("CGINDEX001 delete", cgindexError);
    }
  }

  return result;
}

async function cgsync007ResolveConflict(conflictId, resolution = "acknowledged") {
  const u = auth.currentUser;
  if (!u) throw new Error("Utilisateur Firebase non connecté.");
  const id = String(conflictId || "").trim();
  if (!id) return false;

  await updateDoc(
    doc(db, "users", u.uid, "question_conflicts", id),
    {
      status: "resolved",
      resolution: String(resolution || "acknowledged"),
      resolved_at: serverTimestamp(),
      resolved_by: cgsync007WriterId()
    }
  );
  return true;
}

async function cgsync007ListOpenConflicts(maxResults = 50) {
  const u = auth.currentUser;
  if (!u) return [];

  const ref = collection(db, "users", u.uid, "question_conflicts");
  const snap = await getDocs(
    query(
      ref,
      where("status", "==", "open"),
      limit(Math.min(Math.max(Number(maxResults) || 50, 1), 100))
    )
  );

  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

window.CGSYNC007_API = {
  writerId: cgsync007WriterId,
  update: cgsync007WriteQuestion,
  remove: cgsync007DeleteQuestion,
  resolveConflict: cgsync007ResolveConflict,
  listOpen: cgsync007ListOpenConflicts
};
// CGSYNC007_CONFLICT_ENGINE_END

'''
    app = app.replace(anchor, engine + anchor, 1)
    print('OK : moteur transactionnel CGSYNC007 ajouté')
else:
    print('INFO : moteur CGSYNC007 déjà présent')

# ------------------------------------------------------------
# 3. CGCLOUD002/CGWEB005 : révision monotone également
# ------------------------------------------------------------
if '// CGSYNC007_LEGACY_UPDATE' not in app:
    old = '''    const ref = doc(db, "users", user.uid, "questions", String(questionId));
    await updateDoc(ref, { ...(clean), cg_updated_at: serverTimestamp() /* CGSYNC003_WEB_STAMP */ });
    const fresh = await getDoc(ref);'''
    new = '''    const ref = doc(db, "users", user.uid, "questions", String(questionId));
    // CGSYNC007_LEGACY_UPDATE
    await cgsync007WriteQuestion(questionId, clean, {
      source: "CGWEB005"
    });
    const fresh = await getDoc(ref);'''
    if old not in app:
        raise SystemExit('ERREUR : updateQuestion CGWEB005 attendu introuvable')
    app = app.replace(old, new, 1)
    print('OK : CGWEB005 raccordé aux révisions')

# ------------------------------------------------------------
# 4. CGWEB006 API : optimistic concurrency
# ------------------------------------------------------------
if '// CGSYNC007_CGWEB006_UPDATE' not in app:
    old = '''  update: async (questionId,patch) => {
    const u=auth.currentUser;if(!u)throw new Error("Utilisateur Firebase non connecté.");
    const id=String(questionId||"").trim();if(!id)throw new Error("ID manquant.");
    await updateDoc(doc(db,"users",u.uid,"questions",id),{...(patch||{}),cg_updated_at:serverTimestamp()});
    // CGINDEX001_AFTER_UPDATE
    try {
      await cgindex001SyncQuestion(id);
    } catch (cgindexError) {
      console.warn("CGINDEX001 update", cgindexError);
    }return true;
  }'''
    new = '''  update: async (questionId, patch, options = {}) => {
    // CGSYNC007_CGWEB006_UPDATE
    return cgsync007WriteQuestion(questionId, patch, {
      ...(options || {}),
      source: options?.source || "CGWEB006"
    });
  }'''
    if old not in app:
        raise SystemExit('ERREUR : CGWEB006_API.update attendu introuvable')
    app = app.replace(old, new, 1)
    print('OK : édition CGWEB006 protégée')

# ------------------------------------------------------------
# 5. Création et suppression CGWEB010
# ------------------------------------------------------------
if '// CGSYNC007_CREATE_REVISION' not in app:
    old = '    await setDoc(ref,{...clean,original_id:id,row_number:Number.isFinite(Number(id))?Number(id):id,cg_created_at:serverTimestamp(),cg_updated_at:serverTimestamp()});'
    new = '''    // CGSYNC007_CREATE_REVISION
    const writer = cgsync007WriterMeta("CGWEB010_CREATE");
    await setDoc(ref,{
      ...clean,
      original_id:id,
      row_number:Number.isFinite(Number(id))?Number(id):id,
      cg_created_at:serverTimestamp(),
      cg_updated_at:serverTimestamp(),
      cg_revision:1,
      cg_base_revision:0,
      ...writer
    });'''
    if old not in app:
        raise SystemExit('ERREUR : création CGWEB010 attendue introuvable')
    app = app.replace(old, new, 1)
    print('OK : nouvelles questions démarrent à révision 1')

if '// CGSYNC007_DELETE_GUARD' not in app:
    pattern = re.compile(
        r'''  remove: async questionId => \{\n'''
        r'''    const u = auth\.currentUser;\n'''
        r'''    if \(!u\) throw new Error\("Utilisateur Firebase non connecté\."\);\n'''
        r'''    const id = String\(questionId\|\|""\)\.trim\(\);\n'''
        r'''    if \(!id\) throw new Error\("ID manquant\."\);\n'''
        r'''    await setDoc\(doc\(db,"users",u\.uid,"question_tombstones",id\),\{question_id:id,deleted_at:serverTimestamp\(\),source:"CGWEB010"\}\);\n'''
        r'''    await deleteDoc\(doc\(db,"users",u\.uid,"questions",id\)\);\n'''
        r'''    // CGINDEX001_AFTER_DELETE\n'''
        r'''    try \{\n'''
        r'''      await cgindex001MarkDeleted\(id\);\n'''
        r'''    \} catch \(cgindexError\) \{\n'''
        r'''      console\.warn\("CGINDEX001 delete", cgindexError\);\n'''
        r'''    \}\n'''
        r'''    return true;\n'''
        r'''  \}'''
    )
    m = pattern.search(app)
    if not m:
        raise SystemExit('ERREUR : CGWEB010_API.remove attendu introuvable')
    new = '''  remove: async (questionId, options = {}) => {
    // CGSYNC007_DELETE_GUARD
    return cgsync007DeleteQuestion(questionId, {
      ...(options || {}),
      source: options?.source || "CGWEB010"
    });
  }'''
    app = app[:m.start()] + new + app[m.end():]
    print('OK : suppressions stale bloquées')

# ------------------------------------------------------------
# 6. Éditeur CGWEB006 : base revision + boîte de conflit
# ------------------------------------------------------------
if 'editorBaseRevision' not in cg6:
    old = 'const state={stack:[null],page:0,last:null,rows:[],mode:"directory"};'
    new = 'const state={stack:[null],page:0,last:null,rows:[],mode:"directory",editorBaseRevision:0};'
    if old not in cg6:
        raise SystemExit('ERREUR : état CGWEB006 inattendu')
    cg6 = cg6.replace(old, new, 1)

if '// CGSYNC007_EDITOR_HELPERS_START' not in cg6:
    old_open = 'function openEditor(id){const r=state.rows.find(x=>String(x.id)===String(id));if(!r)return;$("cg6EditId").value=r.id;$("cg6EditOriginal").textContent=r.original_id??r.id;for(const [k,v] of [["Mega","megatheme"],["Theme","theme"],["Question","question"],["Detail","detail"],["A","proposition_a"],["B","proposition_b"],["C","proposition_c"],["D","proposition_d"],["Correct","correct_index"],["Status","status"]])$(`cg6Edit${k}`).value=r[v]??"";$("cg6Modal").classList.remove("cg6-hidden")}'
    if old_open not in cg6:
        raise SystemExit('ERREUR : openEditor CGWEB006 attendu introuvable')

    helpers = r'''// CGSYNC007_EDITOR_HELPERS_START
function cg7FillEditor(r){
  if(!r)return;
  $("cg6EditId").value=r.id;
  $("cg6EditOriginal").textContent=r.original_id??r.id;
  for(const [k,v] of [["Mega","megatheme"],["Theme","theme"],["Question","question"],["Detail","detail"],["A","proposition_a"],["B","proposition_b"],["C","proposition_c"],["D","proposition_d"],["Correct","correct_index"],["Status","status"]]){
    $(`cg6Edit${k}`).value=r[v]??"";
  }
  state.editorBaseRevision=Number(r.cg_revision??0)||0;
  window.CGSYNC007_EDITOR_BASE_REVISION=state.editorBaseRevision;
  $("cg7Conflict")?.remove();
}

async function cg7ReloadEditorCloud(){
  const id=$("cg6EditId").value;
  if(!id)return null;
  const fresh=await (await waitApi()).byId(id);
  if(fresh){
    cg7FillEditor(fresh);
    $("cg6SaveState").textContent=`Cloud rechargé · révision ${state.editorBaseRevision}`;
  }
  return fresh;
}
window.CGSYNC007_reloadEditorCloud=cg7ReloadEditorCloud;

function cg7ConflictFields(cloud,patch){
  const labels={megatheme:"Mégathème",theme:"Thème",question:"Question",detail:"Détail",proposition_a:"A",proposition_b:"B",proposition_c:"C",proposition_d:"D",correct_index:"Réponse",status:"Statut"};
  return Object.keys(patch||{}).filter(k=>String(cloud?.[k]??"")!==String(patch?.[k]??"")).map(k=>labels[k]||k);
}

function cg7ShowConflict(result,patch){
  $("cg7Conflict")?.remove();
  const card=$("cg6Modal")?.querySelector(".cg6-modal-card");
  if(!card)return;
  const changed=cg7ConflictFields(result?.cloud||{},patch);
  const box=document.createElement("div");
  box.id="cg7Conflict";
  box.className="cg7-conflict";
  box.innerHTML=`<div class="cg7-conflict-title">⚠️ Conflit détecté</div><div>Cette question a changé depuis l'ouverture de l'éditeur.</div><div class="cg7-conflict-meta">Votre base : révision ${state.editorBaseRevision} · Cloud : révision ${result.cloudRevision}</div><div class="cg7-conflict-fields">Champ(s) concerné(s) : ${esc(changed.join(", ")||"modification concurrente")}</div><div class="cg7-conflict-actions"><button id="cg7UseCloud" class="cg6-btn">Utiliser le Cloud</button><button id="cg7UseMine" class="cg6-btn cg6-primary">Appliquer mes modifications</button></div>`;
  card.querySelector(".cg6-actions")?.insertAdjacentElement("beforebegin",box);

  $("cg7UseCloud").onclick=async()=>{
    try{
      await window.CGSYNC007_API?.resolveConflict(result.conflictId,"cloud_reloaded");
      await cg7ReloadEditorCloud();
      box.remove();
      window.dispatchEvent(new CustomEvent("cgsync007-conflicts-changed"));
    }catch(e){$("cg6SaveState").textContent="❌ "+(e?.message||String(e))}
  };

  $("cg7UseMine").onclick=async()=>{
    try{
      $("cg6SaveState").textContent="Résolution du conflit…";
      const resolved=await (await waitApi()).update(
        $("cg6EditId").value,
        patch,
        {expectedRevision:result.cloudRevision,force:true,conflictId:result.conflictId,resolution:"local_applied",source:"CGWEB006_CONFLICT_RESOLUTION"}
      );
      state.editorBaseRevision=Number(resolved?.revision??result.cloudRevision+1)||0;
      window.CGSYNC007_EDITOR_BASE_REVISION=state.editorBaseRevision;
      box.remove();
      $("cg6SaveState").textContent=`✅ Conflit résolu · révision ${state.editorBaseRevision}`;
      window.dispatchEvent(new CustomEvent("cgsync007-conflicts-changed"));
      setTimeout(async()=>{closeEditor();state.mode==="directory"?await load(false):await search()},500);
    }catch(e){$("cg6SaveState").textContent="❌ "+(e?.message||String(e))}
  };
}
// CGSYNC007_EDITOR_HELPERS_END
function openEditor(id){const r=state.rows.find(x=>String(x.id)===String(id));if(!r)return;cg7FillEditor(r);$("cg6Modal").classList.remove("cg6-hidden")}
'''
    cg6 = cg6.replace(old_open, helpers, 1)
    print('OK : éditeur mémorise la révision de base')

if '// CGSYNC007_EDITOR_SAVE' not in cg6:
    old_save = 'async function save(){const raw=$("cg6EditCorrect").value.trim(),n=raw===""?null:Number(raw);const patch={megatheme:$("cg6EditMega").value.trim(),theme:$("cg6EditTheme").value.trim(),question:$("cg6EditQuestion").value.trim(),detail:$("cg6EditDetail").value,proposition_a:$("cg6EditA").value,proposition_b:$("cg6EditB").value,proposition_c:$("cg6EditC").value,proposition_d:$("cg6EditD").value,correct_index:Number.isFinite(n)?n:raw,status:$("cg6EditStatus").value.trim()};try{$("cg6SaveState").textContent="Enregistrement…";await (await waitApi()).update($("cg6EditId").value,patch);$("cg6SaveState").textContent="✅ Enregistré";setTimeout(async()=>{closeEditor();state.mode==="directory"?await load(false):await search()},350)}catch(e){$("cg6SaveState").textContent="❌ "+(e?.message||String(e))}}'
    if old_save not in cg6:
        raise SystemExit('ERREUR : save CGWEB006 attendu introuvable')
    new_save = r'''// CGSYNC007_EDITOR_SAVE
async function save(){
  const raw=$("cg6EditCorrect").value.trim(),n=raw===""?null:Number(raw);
  const patch={megatheme:$("cg6EditMega").value.trim(),theme:$("cg6EditTheme").value.trim(),question:$("cg6EditQuestion").value.trim(),detail:$("cg6EditDetail").value,proposition_a:$("cg6EditA").value,proposition_b:$("cg6EditB").value,proposition_c:$("cg6EditC").value,proposition_d:$("cg6EditD").value,correct_index:Number.isFinite(n)?n:raw,status:$("cg6EditStatus").value.trim()};
  try{
    $("cg6SaveState").textContent="Enregistrement…";
    const result=await (await waitApi()).update(
      $("cg6EditId").value,
      patch,
      {expectedRevision:state.editorBaseRevision,source:"CGWEB006_EDITOR"}
    );
    if(result?.conflict){
      $("cg6SaveState").textContent="⚠️ Conflit : choisissez la version à conserver";
      cg7ShowConflict(result,patch);
      window.dispatchEvent(new CustomEvent("cgsync007-conflicts-changed"));
      return;
    }
    state.editorBaseRevision=Number(result?.revision??state.editorBaseRevision+1)||0;
    window.CGSYNC007_EDITOR_BASE_REVISION=state.editorBaseRevision;
    $("cg6SaveState").textContent=`✅ Enregistré · révision ${state.editorBaseRevision}`;
    setTimeout(async()=>{closeEditor();state.mode==="directory"?await load(false):await search()},350);
  }catch(e){
    $("cg6SaveState").textContent="❌ "+(e?.message||String(e));
  }
}'''
    cg6 = cg6.replace(old_save, new_save, 1)
    print('OK : sauvegarde optimiste + résolution interactive')

# Afficher la révision dans chaque fiche.
if 'Révision :' not in cg6:
    old = '<span>row : ${esc(r.row_number??"—")}</span></div></article>`}'
    new = '<span>row : ${esc(r.row_number??"—")}</span><span>Révision : ${esc(r.cg_revision??0)}</span></div></article>`}'
    if old in cg6:
        cg6 = cg6.replace(old, new, 1)

# ------------------------------------------------------------
# 7. Suppression depuis l'éditeur : utiliser la revision d'ouverture
# ------------------------------------------------------------
if '// CGSYNC007_DELETE_UI' not in cg12:
    old = '''    await api.remove(id);
    alert(`Question ${original} supprimée du Cloud. Tombstone enregistré.`);'''
    new = '''    // CGSYNC007_DELETE_UI
    const removal = await api.remove(id, {
      expectedRevision: Number(window.CGSYNC007_EDITOR_BASE_REVISION ?? 0),
      source: "CGWEB010_EDITOR"
    });

    if (removal?.conflict) {
      alert(
        `Conflit détecté : la question ${original} a été modifiée depuis l'ouverture.\\n\\n` +
        `La suppression est annulée. La version Cloud va être rechargée.`
      );
      try {
        await window.CGSYNC007_API?.resolveConflict(
          removal.conflictId,
          "delete_blocked_cloud_reloaded"
        );
      } catch (_) { }
      if (typeof window.CGSYNC007_reloadEditorCloud === "function") {
        await window.CGSYNC007_reloadEditorCloud();
      }
      window.dispatchEvent(new CustomEvent("cgsync007-conflicts-changed"));
      return;
    }

    alert(`Question ${original} supprimée du Cloud. Tombstone enregistré.`);'''
    if old not in cg12:
        raise SystemExit('ERREUR : suppression CGWEB012 attendue introuvable')
    cg12 = cg12.replace(old, new, 1)
    print('OK : suppression concurrente protégée')

# ------------------------------------------------------------
# 8. Registre Web des conflits
# ------------------------------------------------------------
if 'cgsync007.css' not in index:
    pos = index.lower().rfind('</head>')
    if pos < 0:
        raise SystemExit('ERREUR : </head> introuvable')
    index = index[:pos] + '\n<link rel="stylesheet" href="./cgsync007.css?v=CGSYNC007_1">\n' + index[pos:]

if 'cgsync007.js' not in index:
    pos = index.lower().rfind('</body>')
    if pos < 0:
        raise SystemExit('ERREUR : </body> introuvable')
    index = index[:pos] + '\n<script type="module" src="./cgsync007.js?v=CGSYNC007_1"></script>\n' + index[pos:]

# Cache bust des fichiers modifiés.
index = re.sub(
    r"""src=([\"'])(?:\./)?app\.js(?:\?v=[^\"']*)?\1""",
    'src="./app.js?v=CGSYNC007_1"',
    index,
    count=1
)
index = re.sub(
    r"""src=([\"'])(?:\./)?cgweb006\.js(?:\?v=[^\"']*)?\1""",
    'src="./cgweb006.js?v=CGSYNC007_1"',
    index,
    count=1
)
index = re.sub(
    r"""src=([\"'])(?:\./)?cgweb012\.js(?:\?v=[^\"']*)?\1""",
    'src="./cgweb012.js?v=CGSYNC007_1"',
    index,
    count=1
)

# ------------------------------------------------------------
# 9. Android : compteur des conflits ouverts dans CGSYNC006
# ------------------------------------------------------------
if '// CGSYNC007_ANDROID_CONFLICT_SUMMARY' not in main:
    old = '''        add(tv(
                "SUPPRESSIONS\\n"
                        + cgSync006ChannelSummary("tomb"),
                15,
                Color.WHITE,
                Gravity.LEFT,
                false));

        addOneMillimeterGap();'''
    new = '''        add(tv(
                "SUPPRESSIONS\\n"
                        + cgSync006ChannelSummary("tomb"),
                15,
                Color.WHITE,
                Gravity.LEFT,
                false));

        addOneMillimeterGap();

        // CGSYNC007_ANDROID_CONFLICT_SUMMARY
        cgSync007AddConflictSummary();

        addOneMillimeterGap();'''
    if old not in main:
        raise SystemExit('ERREUR : emplacement dashboard CGSYNC006 introuvable')
    main = main.replace(old, new, 1)

if '// CGSYNC007_ANDROID_METHODS_START' not in main:
    anchor = '    // CGSYNC006_METHODS_END\n'
    if anchor not in main:
        raise SystemExit('ERREUR : fin CGSYNC006 introuvable')

    methods = r'''    // CGSYNC007_ANDROID_METHODS_START
    private void cgSync007AddConflictSummary() {
        final TextView conflictView = tv(
                "CONFLITS D'ÉDITION\nChargement…",
                15,
                Color.WHITE,
                Gravity.LEFT,
                false);
        add(conflictView);

        FirebaseUser user =
                com.google.firebase.auth.FirebaseAuth.getInstance().getCurrentUser();

        if (user == null) {
            conflictView.setText(
                    "CONFLITS D'ÉDITION\nCloud non connecté");
            return;
        }

        com.google.firebase.firestore.FirebaseFirestore.getInstance()
                .collection("users")
                .document(user.getUid())
                .collection("question_conflicts")
                .whereEqualTo("status", "open")
                .limit(100)
                .get()
                .addOnSuccessListener(snapshot -> {
                    int count = snapshot == null ? 0 : snapshot.size();
                    String suffix = count >= 100 ? "+" : "";
                    conflictView.setText(
                            "CONFLITS D'ÉDITION\n"
                                    + count + suffix
                                    + " conflit(s) ouvert(s)"
                                    + (count == 0
                                    ? " · aucune action requise"
                                    : " · résolution sur le site Web"));
                })
                .addOnFailureListener(error ->
                        conflictView.setText(
                                "CONFLITS D'ÉDITION\n"
                                        + "État indisponible : "
                                        + cgSync006SafeError(error)));
    }
    // CGSYNC007_ANDROID_METHODS_END

'''
    main = main.replace(anchor, methods + anchor, 1)
    print('OK : compteur de conflits visible sur Android')

# ------------------------------------------------------------
# 10. Version Android 959
# ------------------------------------------------------------
gradle, n1 = re.subn(r'versionCode\s+\d+', 'versionCode 959', gradle, count=1)
gradle, n2 = re.subn(
    r'versionName\s+[\'\"][^\'\"]+[\'\"]',
    "versionName '9.5.9-cgsync007'",
    gradle,
    count=1
)
if not n1 or not n2:
    raise SystemExit('ERREUR : version Android introuvable')
print('OK : version 959 · 9.5.9-cgsync007')

# ------------------------------------------------------------
# 11. Contrôles et écritures
# ------------------------------------------------------------
checks = {
    'engine': '// CGSYNC007_CONFLICT_ENGINE_START' in app,
    'transaction': 'runTransaction' in app,
    'web update': '// CGSYNC007_CGWEB006_UPDATE' in app,
    'create revision': '// CGSYNC007_CREATE_REVISION' in app,
    'delete guard': '// CGSYNC007_DELETE_GUARD' in app,
    'editor': '// CGSYNC007_EDITOR_SAVE' in cg6,
    'delete ui': '// CGSYNC007_DELETE_UI' in cg12,
    'android': '// CGSYNC007_ANDROID_METHODS_START' in main,
    'css': 'cgsync007.css?v=CGSYNC007_1' in index,
    'js': 'cgsync007.js?v=CGSYNC007_1' in index,
    'version': 'versionCode 959' in gradle and '9.5.9-cgsync007' in gradle,
}
bad = [k for k,v in checks.items() if not v]
if bad:
    raise SystemExit('ERREUR vérification CGSYNC007 : ' + ', '.join(bad))

MAIN.write_text(main, encoding='utf-8')
GRADLE.write_text(gradle, encoding='utf-8')
APP.write_text(app, encoding='utf-8')
CG6.write_text(cg6, encoding='utf-8')
CG12.write_text(cg12, encoding='utf-8')
INDEX.write_text(index, encoding='utf-8')

print()
print('==================================================')
print(' CGSYNC007 PATCH OK')
print('==================================================')
print('• révision monotone par question')
print('• transaction optimiste')
print('• conflit enregistré au lieu d\'écraser silencieusement')
print('• choix Cloud / mes modifications dans l\'éditeur')
print('• suppression stale bloquée')
print('• registre Web des conflits ouverts')
print('• compteur de conflits dans le diagnostic Android')
