from pathlib import Path
import re

candidates = [Path("settings.gradle"), Path("settings.gradle.kts"), Path("build.gradle")]
target = next((p for p in candidates if p.exists()), None)
if target is None:
    raise SystemExit("ERREUR: ni settings.gradle, ni settings.gradle.kts, ni build.gradle trouvé")

s = target.read_text(encoding="utf-8")

if "jitpack.io" in s:
    print(f"INFO: JitPack déjà présent dans {target}")
else:
    if target.name == "settings.gradle":
        # Cas moderne : dependencyResolutionManagement { repositories { ... } }
        drm = s.find("dependencyResolutionManagement")
        if drm >= 0:
            repos = s.find("repositories", drm)
            brace = s.find("{", repos)
            if repos < 0 or brace < 0:
                raise SystemExit("ERREUR: bloc repositories introuvable dans settings.gradle")
            insert_at = brace + 1
            s = s[:insert_at] + "\n        maven { url 'https://jitpack.io' }" + s[insert_at:]
        else:
            # Cas ancien : ajouter un bloc allprojects dans build.gradle est plus sûr.
            b = Path("build.gradle")
            if not b.exists():
                raise SystemExit("ERREUR: build.gradle introuvable pour fallback")
            bs = b.read_text(encoding="utf-8")
            if "jitpack.io" not in bs:
                m = re.search(r'allprojects\s*\{\s*repositories\s*\{', bs)
                if m:
                    pos = m.end()
                    bs = bs[:pos] + "\n        maven { url 'https://jitpack.io' }" + bs[pos:]
                else:
                    bs += "\n\nallprojects {\n    repositories {\n        google()\n        mavenCentral()\n        maven { url 'https://jitpack.io' }\n    }\n}\n"
                b.write_text(bs, encoding="utf-8")
                print("OK: JitPack ajouté dans build.gradle (fallback)")
            print("=== CGSYNC002 JITPACK FIX OK ===")
            raise SystemExit(0)

    elif target.name == "settings.gradle.kts":
        drm = s.find("dependencyResolutionManagement")
        repos = s.find("repositories", drm if drm >= 0 else 0)
        brace = s.find("{", repos)
        if repos < 0 or brace < 0:
            raise SystemExit("ERREUR: bloc repositories introuvable dans settings.gradle.kts")
        insert_at = brace + 1
        s = s[:insert_at] + '\n        maven("https://jitpack.io")' + s[insert_at:]

    elif target.name == "build.gradle":
        m = re.search(r'allprojects\s*\{\s*repositories\s*\{', s)
        if m:
            pos = m.end()
            s = s[:pos] + "\n        maven { url 'https://jitpack.io' }" + s[pos:]
        else:
            s += "\n\nallprojects {\n    repositories {\n        google()\n        mavenCentral()\n        maven { url 'https://jitpack.io' }\n    }\n}\n"

    target.write_text(s, encoding="utf-8")
    print(f"OK: JitPack ajouté dans {target}")

print()
print("=== CGSYNC002 JITPACK FIX OK ===")
