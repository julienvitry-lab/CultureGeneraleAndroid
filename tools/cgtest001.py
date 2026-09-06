#!/usr/bin/env python3
"""
CGTEST001 — batterie de non-régression CultureGeneraleAndroid.

Lecture seule : ce test ne modifie ni SQLite, ni Firestore, ni le Web.
Il produit un rapport dans /storage/emulated/0/Download/.

Couverture :
- Git / versions / marqueurs Android
- syntaxe Python et JavaScript
- SQLite local
- index plein texte statique
- CGDEDUP001
- CGBACKUP002 + cron
- déploiement Web
- cohérence d'un échantillon SQLite <-> Firestore
"""

from __future__ import annotations

import gzip
import hashlib
import json
import os
from pathlib import Path
import py_compile
import re
import sqlite3
import stat
import subprocess
import sys
import tarfile
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = Path.cwd()
DOWNLOAD = Path("/storage/emulated/0/Download")
PROJECT = "culturegeneralesync"
WEB_URL = "https://culturegeneralesync.web.app"

DB_CANDIDATES = [
    Path("/storage/emulated/0/Culture Générale/questions_base.sqlite"),
    Path("/storage/emulated/0/Culture Générale/questions_base.sqlite.HOLD_FIX2_TEST"),
    Path("/storage/emulated/0/Culture Générale/questions_base.sqlite.BACKUP_CGBOOT001"),
]

INDEX_DIR = ROOT / "web/public/cgweb012_index"
DEDUP_REPORT = ROOT / "web/public/cgdedup001_pairs.json"
BACKUP_DIR = Path("/storage/emulated/0/Download/CultureGenerale_Backups")
AUTH_FILE = Path.home() / ".config/cgbackup002/auth.json"

PASS = "PASS"
WARN = "WARN"
FAIL = "FAIL"

results = []


def stamp():
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def add(status, test, detail):
    results.append((status, test, str(detail)))
    icon = {"PASS": "✅", "WARN": "⚠️", "FAIL": "❌"}[status]
    print(f"{icon} {test}: {detail}")


def run(cmd, cwd=None, timeout=180):
    return subprocess.run(
        cmd,
        cwd=cwd or ROOT,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def http_bytes(url, *, method="GET", headers=None, body=None, form=None, timeout=90):
    headers = dict(headers or {})
    data = None

    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers.setdefault("Content-Type", "application/json; charset=utf-8")
    elif form is not None:
        data = urllib.parse.urlencode(form).encode("utf-8")
        headers.setdefault(
            "Content-Type",
            "application/x-www-form-urlencoded; charset=utf-8",
        )

    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read(), dict(resp.headers)
    except urllib.error.HTTPError as e:
        raw = e.read()
        raise RuntimeError(f"HTTP {e.code}: {raw[:1200]!r}") from None
    except urllib.error.URLError as e:
        raise RuntimeError(f"Erreur réseau: {e}") from None


def http_json(url, **kwargs):
    status, raw, headers = http_bytes(url, **kwargs)
    return status, json.loads(raw.decode("utf-8")) if raw else {}, headers


def find_api_key():
    candidates = [
        ROOT / "web/public/app.js",
        ROOT / "web/public/firebase-config.js",
        ROOT / "app/google-services.json",
    ]
    for p in candidates:
        if not p.exists():
            continue
        text = p.read_text(encoding="utf-8", errors="ignore")
        m = re.search(r'apiKey\s*:\s*["\']([^"\']+)["\']', text)
        if m:
            return m.group(1)
        if p.name == "google-services.json":
            try:
                data = json.loads(text)
                for client in data.get("client", []):
                    for item in client.get("api_key", []):
                        if item.get("current_key"):
                            return item["current_key"]
            except Exception:
                pass
    return None


def refresh_session(api_key):
    if not AUTH_FILE.exists():
        raise RuntimeError("autorisation CGBACKUP002 absente")

    auth = json.loads(AUTH_FILE.read_text(encoding="utf-8"))
    refresh = str(auth.get("refresh_token") or "").strip()
    if not refresh:
        raise RuntimeError("refresh token CGBACKUP002 absent")

    url = (
        "https://securetoken.googleapis.com/v1/token"
        f"?key={urllib.parse.quote(api_key)}"
    )
    _, data, _ = http_json(
        url,
        method="POST",
        form={
            "grant_type": "refresh_token",
            "refresh_token": refresh,
        },
    )
    token = data.get("id_token")
    uid = data.get("user_id") or auth.get("uid")
    if not token or not uid:
        raise RuntimeError("renouvellement Firebase incomplet")
    return str(uid), str(token), str(auth.get("email") or "")


def fs_value(v):
    if not isinstance(v, dict):
        return v
    for key in (
        "stringValue", "timestampValue", "referenceValue", "bytesValue"
    ):
        if key in v:
            return v[key]
    if "integerValue" in v:
        try:
            return int(v["integerValue"])
        except Exception:
            return v["integerValue"]
    if "doubleValue" in v:
        return float(v["doubleValue"])
    if "booleanValue" in v:
        return bool(v["booleanValue"])
    if "nullValue" in v:
        return None
    if "arrayValue" in v:
        return [fs_value(x) for x in v.get("arrayValue", {}).get("values", [])]
    if "mapValue" in v:
        return {
            k: fs_value(x)
            for k, x in v.get("mapValue", {}).get("fields", {}).items()
        }
    return v


def norm(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return "1" if value else "0"
    s = str(value).strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ("'", '"'):
        s = s[1:-1].strip()
    s = unicodedata.normalize("NFC", s)
    s = re.sub(r"\s+", " ", s)
    return s


def choose_db():
    valid = []
    for p in DB_CANDIDATES:
        if not p.exists():
            continue
        try:
            con = sqlite3.connect(f"file:{p}?mode=ro", uri=True)
            cur = con.cursor()
            cur.execute("PRAGMA integrity_check")
            ok = cur.fetchone()
            cur.execute(
                "SELECT name FROM sqlite_master "
                "WHERE type='table' AND name='questions'"
            )
            table = cur.fetchone()
            count = 0
            if table:
                cur.execute("SELECT COUNT(*) FROM questions")
                count = int(cur.fetchone()[0])
            con.close()
            if ok and str(ok[0]).lower() == "ok" and table:
                valid.append((count, p))
        except Exception:
            pass
    if not valid:
        return None, 0
    valid.sort(reverse=True)
    return valid[0][1], valid[0][0]


def test_git_and_version():
    print("\n=== 1. GIT / VERSION ===")
    branch = run(["git", "branch", "--show-current"])
    if branch.returncode == 0 and branch.stdout.strip() == "main":
        add(PASS, "Branche Git", "main")
    else:
        add(WARN, "Branche Git", branch.stdout.strip() or "indéterminée")

    head = run(["git", "rev-parse", "--short", "HEAD"])
    add(
        PASS if head.returncode == 0 else WARN,
        "Commit",
        head.stdout.strip() if head.returncode == 0 else "indéterminé",
    )

    gradle = ROOT / "app/build.gradle"
    if gradle.exists():
        text = gradle.read_text(encoding="utf-8", errors="ignore")
        vc = re.search(r"versionCode\s+(\d+)", text)
        vn = re.search(r"versionName\s+['\"]([^'\"]+)['\"]", text)
        add(
            PASS,
            "Version Android source",
            f"{vc.group(1) if vc else '?'} · {vn.group(1) if vn else '?'}",
        )
    else:
        add(FAIL, "Version Android source", "app/build.gradle absent")

    st = run(["git", "status", "--short"])
    if st.returncode != 0:
        add(WARN, "État Git", "indisponible")
    elif not st.stdout.strip():
        add(PASS, "État Git", "propre")
    else:
        lines = st.stdout.strip().splitlines()
        tracked = [x for x in lines if not x.startswith("??")]
        if tracked:
            add(WARN, "État Git", f"{len(lines)} changement(s), dont {len(tracked)} suivi(s)")
        else:
            add(WARN, "État Git", f"{len(lines)} fichier(s) non suivi(s)")


def test_markers():
    print("\n=== 2. MARQUEURS DE FONCTIONNALITES ===")
    checks = [
        ("CGSYNC006", ROOT / "app/src/main/java/fr/culturegenerale/android/MainActivity.java", "CGSYNC006_METHODS_START"),
        ("CGSYNC007", ROOT / "web/public/app.js", "CGSYNC007_CONFLICT_ENGINE_START"),
        ("CGINDEX001", ROOT / "web/public/app.js", "CGINDEX001_HELPERS_START"),
        ("CGINDEX002", ROOT / "tools/cgindex002_compact.py", "CGINDEX002"),
        ("CGDEDUP001", ROOT / "web/public/app.js", "CGDEDUP001_API_START"),
        ("CGBACKUP002", ROOT / "tools/cgbackup002.py", "CGBACKUP002"),
    ]
    for name, path, marker in checks:
        if path.exists() and marker in path.read_text(encoding="utf-8", errors="ignore"):
            add(PASS, name, "marqueur présent")
        else:
            add(FAIL, name, f"marqueur absent dans {path}")


def test_python_and_js():
    print("\n=== 3. SYNTAXE OUTILS / WEB ===")
    py_files = sorted((ROOT / "tools").glob("*.py"))
    py_bad = []
    for p in py_files:
        try:
            py_compile.compile(str(p), doraise=True)
        except Exception as e:
            py_bad.append((p.name, str(e)))
    if py_bad:
        add(FAIL, "Syntaxe Python", f"{len(py_bad)} erreur(s): {py_bad[:3]}")
    else:
        add(PASS, "Syntaxe Python", f"{len(py_files)} outil(s) compilés")

    node = shutil_which("node")
    js_files = [
        ROOT / "web/public/app.js",
        ROOT / "web/public/cgweb006.js",
        ROOT / "web/public/cgweb012.js",
        ROOT / "web/public/cgsync007.js",
        ROOT / "web/public/cgdedup001.js",
    ]
    js_files = [p for p in js_files if p.exists()]
    if not node:
        add(WARN, "Syntaxe JavaScript", "node absent — contrôle ignoré")
        return

    bad = []
    for p in js_files:
        r = run([node, "--check", str(p)])
        if r.returncode != 0:
            bad.append((p.name, (r.stderr or r.stdout).strip()[:300]))
    if bad:
        add(FAIL, "Syntaxe JavaScript", f"{len(bad)} erreur(s): {bad[:2]}")
    else:
        add(PASS, "Syntaxe JavaScript", f"{len(js_files)} fichier(s) valides")


def shutil_which(name):
    import shutil
    return shutil.which(name)


def test_sqlite():
    print("\n=== 4. SQLITE LOCAL ===")
    db, count = choose_db()
    if not db:
        add(FAIL, "SQLite", "aucune base valide")
        return None, 0, []

    add(PASS, "SQLite intégrité", f"{db.name} · {count:,} questions".replace(",", " "))

    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    cur = con.cursor()
    cur.execute("PRAGMA table_info(questions)")
    columns = [row[1] for row in cur.fetchall()]
    required = [
        "original_id", "question", "detail",
        "proposition_a", "proposition_b", "proposition_c", "proposition_d",
        "correct_index", "status"
    ]
    missing = [c for c in required if c not in columns]
    if missing:
        add(FAIL, "Schéma SQLite", "colonnes absentes: " + ", ".join(missing))
    else:
        add(PASS, "Schéma SQLite", f"{len(columns)} colonnes · minimum requis présent")

    cur.execute(
        "SELECT COUNT(*) FROM ("
        "SELECT CAST(original_id AS TEXT) x FROM questions "
        "GROUP BY x HAVING COUNT(*)>1)"
    )
    dup_ids = int(cur.fetchone()[0])
    add(
        PASS if dup_ids == 0 else WARN,
        "original_id uniques",
        "aucun doublon" if dup_ids == 0 else f"{dup_ids} ID dupliqué(s)",
    )

    targets = sorted(set([
        0,
        max(0, count // 4),
        max(0, count // 2),
        max(0, (3 * count) // 4),
        max(0, count - 1),
    ]))
    samples = []
    target_set = set(targets)
    cur.execute("""
        SELECT original_id, megatheme, theme, question, detail,
               proposition_a, proposition_b, proposition_c, proposition_d,
               correct_index
        FROM questions
        ORDER BY row_number
    """)
    for i, row in enumerate(cur):
        if i in target_set:
            qid = norm(row[0])
            samples.append({
                "id": qid,
                "megatheme": row[1],
                "theme": row[2],
                "question": row[3],
                "detail": row[4],
                "proposition_a": row[5],
                "proposition_b": row[6],
                "proposition_c": row[7],
                "proposition_d": row[8],
                "correct_index": row[9],
            })
        if i > targets[-1]:
            break

    con.close()
    return db, count, samples


def test_index():
    print("\n=== 5. INDEX PLEIN TEXTE ===")
    manifest = INDEX_DIR / "manifest.json"
    if not manifest.exists():
        add(FAIL, "Index statique", "manifest.json absent")
        return

    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except Exception as e:
        add(FAIL, "Index manifest", str(e))
        return

    shards = [p for p in INDEX_DIR.glob("*.json") if p.name != "manifest.json"]
    if not shards:
        add(FAIL, "Index shards", "aucun shard")
        return

    token_count = 0
    posting_count = 0
    bad = 0
    duplicate_postings = 0

    for p in shards:
        try:
            obj = json.loads(p.read_text(encoding="utf-8"))
            if not isinstance(obj, dict):
                bad += 1
                continue
            token_count += len(obj)
            for token, ids in obj.items():
                if not isinstance(ids, list):
                    bad += 1
                    continue
                posting_count += len(ids)
                if len(ids) != len(set(map(str, ids))):
                    duplicate_postings += 1
        except Exception:
            bad += 1

    if bad:
        add(FAIL, "Index JSON", f"{bad} anomalie(s)")
    else:
        add(
            PASS,
            "Index JSON",
            f"{len(shards)} shards · {token_count:,} mots · {posting_count:,} postings"
            .replace(",", " "),
        )

    if duplicate_postings:
        add(WARN, "Postings uniques", f"{duplicate_postings} liste(s) avec doublons")
    else:
        add(PASS, "Postings uniques", "aucun doublon interne détecté")

    stated_tokens = data.get("token_count")
    if isinstance(stated_tokens, int):
        add(
            PASS if stated_tokens == token_count else WARN,
            "Manifest token_count",
            f"manifest={stated_tokens:,} · réel={token_count:,}".replace(",", " "),
        )


def test_dedup():
    print("\n=== 6. CGDEDUP001 ===")
    if not DEDUP_REPORT.exists():
        add(FAIL, "Catalogue doublons", "cgdedup001_pairs.json absent")
        return

    try:
        data = json.loads(DEDUP_REPORT.read_text(encoding="utf-8"))
        groups = data.get("groups", [])
        ids = [str(g.get("group_id")) for g in groups]
        malformed = [
            g for g in groups
            if not isinstance(g.get("ids"), list) or len(g.get("ids", [])) < 2
        ]
        if malformed:
            add(FAIL, "Catalogue doublons", f"{len(malformed)} groupe(s) mal formé(s)")
        else:
            add(
                PASS,
                "Catalogue doublons",
                f"{len(groups)} groupe(s) snapshot · "
                f"{data.get('duplicate_question_count', '?')} question(s)",
            )
        if len(ids) != len(set(ids)):
            add(WARN, "group_id dédup", "doublons détectés")
        else:
            add(PASS, "group_id dédup", "uniques")
    except Exception as e:
        add(FAIL, "Catalogue doublons", str(e))


def test_backup_and_cron():
    print("\n=== 7. CGBACKUP002 / CRON ===")
    backups = sorted(BACKUP_DIR.glob("CGBACKUP002_*.tar.gz"), reverse=True)
    if not backups:
        add(FAIL, "Sauvegarde locale", "aucune archive CGBACKUP002")
    else:
        latest = backups[0]
        tool = ROOT / "tools/cgbackup002.py"
        if tool.exists():
            r = run([sys.executable, str(tool), "verify", str(latest)], timeout=240)
            if r.returncode == 0:
                add(
                    PASS,
                    "Archive CGBACKUP002",
                    f"{latest.name} · {latest.stat().st_size/1024/1024:.1f} Mo",
                )
            else:
                add(FAIL, "Archive CGBACKUP002", (r.stderr or r.stdout)[-600:])
        else:
            add(FAIL, "Archive CGBACKUP002", "outil cgbackup002.py absent")

    if AUTH_FILE.exists():
        mode = stat.S_IMODE(AUTH_FILE.stat().st_mode)
        add(
            PASS if (mode & 0o077) == 0 else WARN,
            "Secret local backup",
            f"refresh token présent · permissions {oct(mode)}",
        )
    else:
        add(WARN, "Secret local backup", "auth.json absent")

    cr = run(["crontab", "-l"]) if shutil_which("crontab") else None
    if cr and cr.returncode == 0 and "CGBACKUP002_WEEKLY" in cr.stdout:
        line = next(
            (x for x in cr.stdout.splitlines() if "CGBACKUP002_WEEKLY" in x),
            "entrée présente",
        )
        add(PASS, "Planification backup", line)
    else:
        add(WARN, "Planification backup", "entrée cron CGBACKUP002 absente")

    pg = run(["pgrep", "-a", "crond"]) if shutil_which("pgrep") else None
    if pg and pg.returncode == 0 and pg.stdout.strip():
        add(PASS, "Processus crond", pg.stdout.strip().splitlines()[0])
    else:
        add(WARN, "Processus crond", "crond non détecté")


def test_web_deployed():
    print("\n=== 8. WEB DEPLOYE ===")
    try:
        status, raw, _ = http_bytes(WEB_URL + "/?cgtest001=" + stamp())
        text = raw.decode("utf-8", errors="ignore")
        if status == 200:
            add(PASS, "Hosting", f"HTTP {status}")
        else:
            add(FAIL, "Hosting", f"HTTP {status}")

        required = [
            ("CGDEDUP001 JS", "cgdedup001.js"),
            ("CGDEDUP001 CSS", "cgdedup001.css"),
        ]
        for label, needle in required:
            add(
                PASS if needle in text else WARN,
                label,
                "référencé" if needle in text else "non visible dans index.html",
            )

        _, remote_dedup, _ = http_json(
            WEB_URL + "/cgdedup001_pairs.json?cgtest001=" + stamp()
        )
        local_dedup = json.loads(DEDUP_REPORT.read_text(encoding="utf-8"))
        same = (
            remote_dedup.get("generated_at") == local_dedup.get("generated_at")
            and remote_dedup.get("duplicate_group_count")
            == local_dedup.get("duplicate_group_count")
        )
        add(
            PASS if same else WARN,
            "Catalogue dédup déployé",
            "identique au local" if same else "diffère du local",
        )

        _, remote_manifest, _ = http_json(
            WEB_URL + "/cgweb012_index/manifest.json?cgtest001=" + stamp()
        )
        local_manifest = json.loads(
            (INDEX_DIR / "manifest.json").read_text(encoding="utf-8")
        )
        same_manifest = (
            remote_manifest.get("generated_at") == local_manifest.get("generated_at")
            or remote_manifest.get("compacted_at") == local_manifest.get("compacted_at")
        )
        add(
            PASS if same_manifest else WARN,
            "Index déployé",
            "manifest cohérent avec local" if same_manifest else "manifest différent",
        )
    except Exception as e:
        add(FAIL, "Web déployé", str(e))


def test_cloud_samples(samples):
    print("\n=== 9. SQLITE <-> FIRESTORE (LECTURE SEULE) ===")
    if not samples:
        add(WARN, "Échantillon Cloud", "aucune question locale disponible")
        return

    api_key = find_api_key()
    if not api_key:
        add(WARN, "Échantillon Cloud", "apiKey Firebase introuvable")
        return

    try:
        uid, token, email = refresh_session(api_key)
    except Exception as e:
        add(WARN, "Échantillon Cloud", str(e))
        return

    fields = [
        "megatheme", "theme", "question", "detail",
        "proposition_a", "proposition_b", "proposition_c", "proposition_d",
        "correct_index"
    ]

    ok = 0
    missing = 0
    mismatched = []

    for sample in samples:
        qid = sample["id"]
        if not qid:
            continue
        url = (
            f"https://firestore.googleapis.com/v1/projects/{PROJECT}"
            "/databases/(default)/documents/users/"
            f"{urllib.parse.quote(uid)}/questions/"
            f"{urllib.parse.quote(qid, safe='')}"
        )
        try:
            _, data, _ = http_json(
                url,
                headers={"Authorization": f"Bearer {token}"},
            )
        except RuntimeError as e:
            if "HTTP 404" in str(e):
                missing += 1
                continue
            raise

        cloud = {
            k: fs_value(v)
            for k, v in data.get("fields", {}).items()
        }
        bad_fields = [
            key for key in fields
            if norm(sample.get(key)) != norm(cloud.get(key))
        ]
        if bad_fields:
            mismatched.append((qid, bad_fields))
        else:
            ok += 1

    if ok:
        add(PASS, "Échantillon Cloud identique", f"{ok}/{len(samples)} question(s)")
    if missing:
        add(WARN, "Questions échantillon absentes Cloud", f"{missing}/{len(samples)}")
    if mismatched:
        add(
            WARN,
            "Écarts SQLite/Cloud",
            "; ".join(f"#{qid}: {','.join(fs)}" for qid, fs in mismatched[:5]),
        )
    if not ok and not missing and not mismatched:
        add(WARN, "Échantillon Cloud", "aucun résultat exploitable")


def write_report(started_at):
    DOWNLOAD.mkdir(parents=True, exist_ok=True)
    report = DOWNLOAD / f"CGTEST001_REPORT_{stamp()}.txt"

    counts = {
        PASS: sum(1 for r in results if r[0] == PASS),
        WARN: sum(1 for r in results if r[0] == WARN),
        FAIL: sum(1 for r in results if r[0] == FAIL),
    }

    lines = [
        "CGTEST001 — RAPPORT DE NON-REGRESSION",
        "=====================================",
        f"Généré : {now_iso()}",
        f"Projet : {PROJECT}",
        f"Durée  : {time.time() - started_at:.1f} s",
        "",
        f"PASS : {counts[PASS]}",
        f"WARN : {counts[WARN]}",
        f"FAIL : {counts[FAIL]}",
        "",
    ]

    for status, test, detail in results:
        lines.append(f"[{status}] {test} — {detail}")

    lines += [
        "",
        "VERDICT",
        "-------",
        (
            "ECHEC : au moins un test bloquant a échoué."
            if counts[FAIL]
            else (
                "VALIDE AVEC AVERTISSEMENTS : aucun échec bloquant."
                if counts[WARN]
                else "VALIDE : tous les tests sont passés."
            )
        ),
    ]

    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return report, counts


def main():
    started = time.time()

    print("==================================================")
    print(" CGTEST001 — BATTERIE DE NON-REGRESSION")
    print("==================================================")
    print("Mode : lecture seule")
    print()

    test_git_and_version()
    test_markers()
    test_python_and_js()
    db, count, samples = test_sqlite()
    test_index()
    test_dedup()
    test_backup_and_cron()
    test_web_deployed()
    test_cloud_samples(samples)

    report, counts = write_report(started)

    print()
    print("==================================================")
    print(" CGTEST001 — RESULTAT")
    print("==================================================")
    print(f"PASS : {counts[PASS]}")
    print(f"WARN : {counts[WARN]}")
    print(f"FAIL : {counts[FAIL]}")
    print(f"Rapport : {report}")

    if counts[FAIL]:
        print("❌ VERDICT : ECHEC — corriger avant de poursuivre.")
        raise SystemExit(1)

    if counts[WARN]:
        print("⚠️ VERDICT : VALIDE AVEC AVERTISSEMENTS.")
        raise SystemExit(0)

    print("✅ VERDICT : VALIDE — aucune régression détectée.")


if __name__ == "__main__":
    main()
