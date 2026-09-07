from pathlib import Path
import re, sys, shutil, datetime
root=Path.cwd()
java=root/'app/src/main/java/fr/culturegenerale/android/MainActivity.java'
gradle=root/'app/build.gradle'
if not java.exists() or not gradle.exists():
    sys.exit('ERREUR: lancer depuis la racine CultureGeneraleAndroid')
text=java.read_text(encoding='utf-8')
g=gradle.read_text(encoding='utf-8')
if 'CGREV001_SMART_REVISION_START' in text:
    print('CGREV001 deja applique.'); sys.exit(0)
if "versionCode 959" not in g or "versionName '9.5.9-cgsync007'" not in g:
    sys.exit('ERREUR: version source attendue 959 / 9.5.9-cgsync007')
backup=root/f"CGREV001_backup_{datetime.datetime.now():%Y%m%d-%H%M%S}"
backup.mkdir()
shutil.copy2(java, backup/'MainActivity.java')
shutil.copy2(gradle, backup/'build.gradle')
# Add third mode button and compact the 3 choices to fit safely.
old='''        LinearLayout.LayoutParams normalLp =\n                new LinearLayout.LayoutParams(-1, cmToPx(3.0f));\n        normalLp.setMargins(0, cmToPx(0.2f), 0, cmToPx(0.25f));\n        root.addView(normal, normalLp);\n\n        Button ultimate = btn("ULTIMATE\\nQuestions encore disponibles", 25);'''
new='''        LinearLayout.LayoutParams normalLp =\n                new LinearLayout.LayoutParams(-1, cmToPx(2.35f));\n        normalLp.setMargins(0, cmToPx(0.12f), 0, cmToPx(0.12f));\n        root.addView(normal, normalLp);\n\n        // CGREV001_SMART_REVISION_START\n        Button intelligent = btn("INTELLIGENTE\\nÀ revoir en priorité", 25);\n        intelligent.setSingleLine(false);\n        intelligent.setMaxLines(3);\n        setRoundedBackgroundWithStroke(intelligent, BLUE, 18, Color.WHITE, 1);\n        intelligent.setOnClickListener(v -> {\n            revisionMode = "intelligent";\n            showRevisionDomains();\n        });\n        LinearLayout.LayoutParams intelligentLp =\n                new LinearLayout.LayoutParams(-1, cmToPx(2.35f));\n        intelligentLp.setMargins(0, cmToPx(0.12f), 0, cmToPx(0.12f));\n        root.addView(intelligent, intelligentLp);\n        // CGREV001_SMART_REVISION_END\n\n        Button ultimate = btn("ULTIMATE\\nQuestions encore disponibles", 25);'''
if old not in text: sys.exit('ERREUR: bloc revision normal introuvable')
text=text.replace(old,new,1)
text=text.replace('''        LinearLayout.LayoutParams ultimateLp =\n                new LinearLayout.LayoutParams(-1, cmToPx(3.0f));\n        ultimateLp.setMargins(0, cmToPx(0.25f), 0, cmToPx(0.2f));''','''        LinearLayout.LayoutParams ultimateLp =\n                new LinearLayout.LayoutParams(-1, cmToPx(2.35f));\n        ultimateLp.setMargins(0, cmToPx(0.12f), 0, cmToPx(0.12f));''',1)
# Title
old='''        add(tv("Révision " +\n                ("ultimate".equals(revisionMode) ? "Ultimate" : "Normale"),\n                30, Color.WHITE, Gravity.CENTER, true));'''
new='''        String revisionTitle = "ultimate".equals(revisionMode)\n                ? "Ultimate"\n                : ("intelligent".equals(revisionMode) ? "Intelligente" : "Normale");\n        add(tv("Révision " + revisionTitle,\n                30, Color.WHITE, Gravity.CENTER, true));'''
if old not in text: sys.exit('ERREUR: titre revision introuvable')
text=text.replace(old,new,1)
# Smart uses same eligibility as Ultimate: R and unseen, excludes assimilated/problems/exclusions.
old='''    private String revisionWhereClause() {\n        if ("ultimate".equals(revisionMode)) {\n            return "(status IS NULL OR TRIM(status)='' OR " +\n                    "UPPER(TRIM(status)) NOT IN ('A','P','T','X'))";\n        }\n        return "1=1";\n    }'''
new='''    private String revisionWhereClause() {\n        if ("ultimate".equals(revisionMode) || "intelligent".equals(revisionMode)) {\n            return "(status IS NULL OR TRIM(status)='' OR " +\n                    "UPPER(TRIM(status)) NOT IN ('A','P','T','X'))";\n        }\n        return "1=1";\n    }\n\n    // CGREV001: les questions R (À revoir) passent avant les questions jamais vues.\n    private String revisionOrderClause() {\n        if ("intelligent".equals(revisionMode)) {\n            return "CASE WHEN UPPER(TRIM(COALESCE(status,'')))='R' THEN 0 " +\n                    "WHEN TRIM(COALESCE(status,''))='' THEN 1 ELSE 2 END, row_number";\n        }\n        return "row_number";\n    }'''
if old not in text: sys.exit('ERREUR: revisionWhereClause introuvable')
text=text.replace(old,new,1)
# Two ORDER BYs in revision loaders only: exact nearby strings.
text=text.replace('''                            " AND " + revisionWhereClause() +\n                            " ORDER BY row_number",\n                    new String[]{domain}\n            );''','''                            " AND " + revisionWhereClause() +\n                            " ORDER BY " + revisionOrderClause(),\n                    new String[]{domain}\n            );''',1)
# second occurrence
idx=text.find('private List<Question> loadRevisionSequence')
head,tail=text[:idx],text[idx:]
tail=tail.replace('''                            " AND " + revisionWhereClause() +\n                            " ORDER BY row_number",\n                    new String[]{domain}\n            );''','''                            " AND " + revisionWhereClause() +\n                            " ORDER BY " + revisionOrderClause(),\n                    new String[]{domain}\n            );''',1)
text=head+tail
java.write_text(text,encoding='utf-8')
g=g.replace('versionCode 959','versionCode 960',1).replace("versionName '9.5.9-cgsync007'","versionName '9.6.0-cgrev001'",1)
gradle.write_text(g,encoding='utf-8')
print('OK CGREV001 applique')
print('Version: 960 / 9.6.0-cgrev001')
print('Sauvegarde:', backup)
