#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
JAVA = ROOT / "tablet/src/main/java/fr/culturegenerale/android/tablet/TabletMainActivity.java"
BUILD = ROOT / "tablet/build.gradle"

java = JAVA.read_text(encoding="utf-8")
build = BUILD.read_text(encoding="utf-8")

errors = []

def require(condition, message):
    if not condition:
        errors.append(message)

def strip_java_comments(text: str) -> str:
    """
    Retire //... et /*...*/ sans regex fragile.
    Les chaînes Java sont conservées telles quelles.
    Suffisant ici car les assertions ciblent uniquement le corps de showQuestion().
    """
    out = []
    i = 0
    n = len(text)
    in_string = False
    in_char = False
    escaped = False

    while i < n:
        c = text[i]
        nxt = text[i + 1] if i + 1 < n else ""

        if in_string:
            out.append(c)
            if escaped:
                escaped = False
            elif c == "\\":
                escaped = True
            elif c == '"':
                in_string = False
            i += 1
            continue

        if in_char:
            out.append(c)
            if escaped:
                escaped = False
            elif c == "\\":
                escaped = True
            elif c == "'":
                in_char = False
            i += 1
            continue

        if c == '"':
            in_string = True
            out.append(c)
            i += 1
            continue

        if c == "'":
            in_char = True
            out.append(c)
            i += 1
            continue

        if c == "/" and nxt == "/":
            i += 2
            while i < n and text[i] not in "\r\n":
                i += 1
            continue

        if c == "/" and nxt == "*":
            i += 2
            while i + 1 < n and not (text[i] == "*" and text[i + 1] == "/"):
                i += 1
            i = min(n, i + 2)
            continue

        out.append(c)
        i += 1

    return "".join(out)

def extract_method(source: str, signature: str) -> str:
    start = source.find(signature)
    if start < 0:
        return ""

    brace = source.find("{", start)
    if brace < 0:
        return ""

    depth = 0
    in_string = False
    in_char = False
    escaped = False
    i = brace

    while i < len(source):
        c = source[i]

        if in_string:
            if escaped:
                escaped = False
            elif c == "\\":
                escaped = True
            elif c == '"':
                in_string = False
            i += 1
            continue

        if in_char:
            if escaped:
                escaped = False
            elif c == "\\":
                escaped = True
            elif c == "'":
                in_char = False
            i += 1
            continue

        if c == '"':
            in_string = True
        elif c == "'":
            in_char = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return source[start:i + 1]

        i += 1

    return ""

# -------------------------------------------------------------------------
# Version
# -------------------------------------------------------------------------
require("versionCode 17" in build, "versionCode doit être 17")
require("versionName 'CGANDROID017'" in build,
        "versionName doit être CGANDROID017")
require("'CG_CHANNEL', '\"CGANDROID017\"'" in build,
        "CG_CHANNEL doit être CGANDROID017")

# -------------------------------------------------------------------------
# MEGATHEME_SCREEN_REMOVE001
# -------------------------------------------------------------------------
show_question = extract_method(
    java,
    "private void showQuestion(CgQuestion q)"
)
require(bool(show_question), "showQuestion() non localisable")

if show_question:
    code = strip_java_comments(show_question)

    require(
        "q.megatheme" not in code,
        "showQuestion() ne doit jamais lire q.megatheme"
    )
    require(
        "selectedDomain" not in code,
        "showQuestion() ne doit jamais réinjecter selectedDomain"
    )
    require(
        "IMAGE_MEGATHEME_RESTORE001" not in code,
        "ancien IMAGE_MEGATHEME_RESTORE001 encore actif"
    )
    require(
        "String visibleTheme = safe(q.theme);" in code,
        "le bandeau thème doit utiliser exclusivement q.theme"
    )
    require(
        "q.theme.isEmpty() ? safe(q.megatheme) : q.theme" not in code,
        "fallback thème -> mégathème encore présent"
    )

# -------------------------------------------------------------------------
# ANALOG_EXCLUSION_GUARD001
# -------------------------------------------------------------------------
require(
    'return comparisonKey(theme) + "\\n" + comparisonKey(question);' in java,
    "analogKey doit rester thème normalisé + question normalisée"
)

require(
    "static String analogKey(CgQuestion q)" in java
    and "return analogKey(q.theme, q.question);" in java,
    "analogKey(CgQuestion) doit déléguer uniquement thème + question"
)

add_t = extract_method(java, "void addT(CgQuestion q)")
require(bool(add_t), "addT() non localisable")
if add_t:
    code = strip_java_comments(add_t)
    require(
        "existing.add(analogKey(q));" in code,
        "addT() doit stocker la clé du groupe analogue"
    )
    require(
        "q.id" not in code,
        "addT() ne doit jamais exclure par ID"
    )
    require(
        "comparisonKey(q.theme)" not in code,
        "addT() ne doit jamais exclure par thème seul"
    )

is_t = extract_method(java, "boolean isTExcluded(CgQuestion q)")
require(bool(is_t), "isTExcluded() non localisable")
if is_t:
    code = strip_java_comments(is_t)
    require(
        "set.contains(analogKey(q))" in code,
        "isTExcluded() doit tester la clé du groupe analogue"
    )
    require(
        "q.id" not in code,
        "isTExcluded() ne doit jamais tester l'ID"
    )

confirm = extract_method(
    java,
    "private void confirmAnalogExclusion(CgQuestion q)"
)
require(bool(confirm), "confirmAnalogExclusion() non localisable")
if confirm:
    code = strip_java_comments(confirm)

    require(
        "flags.addT(q);" in code,
        "confirmAnalogExclusion() doit passer par addT(q)"
    )
    require(
        'payload.put("group_key", CgFlags.analogKey(q));' in code,
        "group_key doit utiliser la clé analogue canonique"
    )
    require(
        'flags.enqueue("analog_exclusions", payload);' in code,
        "l'exclusion analogue doit rester persistée dans l'outbox"
    )

if errors:
    print("CGANDROID017 VALIDATION : ECHEC")
    for error in errors:
        print(" -", error)
    sys.exit(1)

print("CGANDROID017 VALIDATION : OK")
print("✓ aucun mégathème dans le code exécutable de showQuestion()")
print("✓ thème affiché uniquement depuis q.theme")
print("✓ analogie = thème normalisé + question normalisée")
print("✓ aucune exclusion par ID ou par thème seul")
