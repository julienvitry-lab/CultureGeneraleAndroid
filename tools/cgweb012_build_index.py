#!/usr/bin/env python3
from pathlib import Path
import sqlite3, json, re, unicodedata, shutil
from datetime import datetime, timezone

BASE = Path('/storage/emulated/0/Culture Générale')
CANDIDATES = [
    BASE / 'questions_base.sqlite',
    BASE / 'questions_base.sqlite.HOLD_FIX2_TEST',
    BASE / 'questions_base.sqlite.BACKUP_CGBOOT001',
]
OUT = Path('web/public/cgweb012_index')
TMP = Path('tools/.cgweb012_tmp')

STOP = {
    'de','du','des','la','le','les','un','une','et','ou','a','au','aux','en',
    'dans','sur','sous','par','pour','avec','sans','ce','cet','cette','ces',
    'qui','que','quoi','quel','quelle','quels','quelles','est','sont','etre',
    'son','sa','ses','leur','leurs','il','elle','ils','elles','on','se','ne',
    'pas','plus','the','of','and','to','in','is','are','an'
}

def inspect(path):
    if not path.exists():
        return None
    try:
        con = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
        cur = con.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='questions'")
        if cur.fetchone() is None:
            con.close(); return None
        cur.execute('SELECT COUNT(*) FROM questions')
        n = int(cur.fetchone()[0])
        con.close(); return n
    except Exception:
        return None

def normalize(text):
    text = unicodedata.normalize('NFD', str(text or ''))
    text = ''.join(ch for ch in text if unicodedata.category(ch) != 'Mn')
    return re.sub(r'[^a-z0-9]+', ' ', text.lower()).strip()

def tokens(text):
    return {t for t in normalize(text).split() if len(t) >= 2 and t not in STOP}

valid = []
for p in CANDIDATES:
    n = inspect(p)
    if n is not None:
        valid.append((n,p))
if not valid:
    raise SystemExit('ERREUR : aucune base SQLite exploitable.')
valid.sort(reverse=True, key=lambda x:x[0])
question_count, db = valid[0]
if question_count < 200000:
    raise SystemExit(f'ERREUR : base incomplète ({question_count} questions).')

print('=== CGWEB012 / INDEX PLEIN TEXTE ===')
print('Base      :', db)
print('Questions :', question_count)

if OUT.exists(): shutil.rmtree(OUT)
if TMP.exists(): shutil.rmtree(TMP)
OUT.mkdir(parents=True)
TMP.mkdir(parents=True)

handles = {}
def handle(first):
    if first not in handles:
        handles[first] = (TMP / f'{first}.tsv').open('a', encoding='utf-8')
    return handles[first]

con = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
cur = con.cursor()
cur.execute('''
SELECT original_id, megatheme, theme, question, detail,
       proposition_a, proposition_b, proposition_c, proposition_d
FROM questions
ORDER BY row_number
''')

processed = 0
for row in cur:
    oid = str(row[0])
    text = ' '.join(str(v or '') for v in row[1:])
    for token in tokens(text):
        first = token[0] if token and token[0].isalnum() else '_'
        handle(first).write(token + '\t' + oid + '\n')
    processed += 1
    if processed % 10000 == 0:
        print(f'  {processed} / {question_count}')
con.close()
for f in handles.values(): f.close()

shards = []
token_count = 0
posting_count = 0
for temp_file in sorted(TMP.glob('*.tsv')):
    by_token = {}
    with temp_file.open('r', encoding='utf-8') as f:
        for line in f:
            token, oid = line.rstrip('\n').split('\t',1)
            by_token.setdefault(token, []).append(oid)

    grouped = {}
    for token, ids in by_token.items():
        prefix = token[:2] if len(token) >= 2 else '__'
        grouped.setdefault(prefix, {})[token] = ids
        token_count += 1
        posting_count += len(ids)

    for prefix, data in grouped.items():
        (OUT / f'{prefix}.json').write_text(
            json.dumps(data, ensure_ascii=False, separators=(',',':')),
            encoding='utf-8'
        )
        shards.append(prefix)
    del by_token, grouped

manifest = {
    'version':'CGWEB012_1',
    'generated_at':datetime.now(timezone.utc).isoformat(),
    'source_db':db.name,
    'question_count':question_count,
    'token_count':token_count,
    'posting_count':posting_count,
    'shards':sorted(set(shards)),
}
(OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
shutil.rmtree(TMP, ignore_errors=True)

print('Shards     :', len(manifest['shards']))
print('Mots       :', token_count)
print('Postings   :', posting_count)
print('OK : index CGWEB012 généré.')
