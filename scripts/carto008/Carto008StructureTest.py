#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def read(path):
    return (ROOT / path).read_text(encoding="utf-8", errors="ignore")

online = read("app/src/main/java/fr/sport/app/ActivityMapActivity.java")
offline = read("app/src/main/java/fr/sport/app/OfflineActivityMapActivity.java")
segments = read("app/src/main/java/fr/sport/app/importfolder/FitSegmentFactory.java")
database = read("app/src/main/java/fr/sport/app/database/SportDatabase.java")
build = read("app/build.gradle")
workflow = read(".github/workflows/android.yml")
today = read("app/src/main/java/fr/sport/app/TodayActivity.java")
about = read("app/src/main/java/fr/sport/app/AboutActivity.java")
registry = read("app/src/main/java/fr/sport/app/release/FeatureRegistry.java")

assert "demotiles.maplibre.org" not in online
assert "https://tile.openstreetmap.org/{z}/{x}/{y}.png" in online
assert "© OpenStreetMap contributors" in online
assert "fromJson(ONLINE_STYLE)" in online

assert "preparedMap.bounds" in offline
assert "track.south >= mapBounds.minLatitude" in offline
assert "L’atlas hors ligne sélectionné ne couvre pas entièrement cette activité" in offline
assert "Utilisez « Carte internet »" in offline

assert "firstFiniteDistance" in segments
assert "value - offset" in segments
sample = [6098.7, 6101.0, 8265.7]
offset = sample[0]
local = [max(0.0, value - offset) for value in sample]
assert abs(local[0]) < 1e-9
assert abs(local[-1] - 2167.0) < 1e-6

assert ("DATABASE_VERSION = 26" in database or "DATABASE_VERSION = 27" in database or "DATABASE_VERSION = 28" in database)
assert "rebaseSplitActivityDistances" in database
assert "distance_m=MAX(0.0, distance_m-?)" in database
assert "CARTO009" in build
assert "CARTO007 : atlas personnel" in about
assert "CARTO009 : atlas automatique multi-cartes Mapsforge" in about
assert registry.count("CARTO009") >= 2

print("CARTO008 structure OK")
