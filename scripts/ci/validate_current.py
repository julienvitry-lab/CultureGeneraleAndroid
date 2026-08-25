#!/usr/bin/env python3
from pathlib import Path
import re, sys, zipfile

ROOT = Path(__file__).resolve().parents[2]
errors = []

def require_file(path):
    p = ROOT / path
    if not p.is_file(): errors.append(f"Fichier absent : {path}")
    return p

def text(path):
    p = require_file(path)
    return p.read_text(encoding="utf-8", errors="ignore") if p.is_file() else ""

def require(path, *tokens):
    t = text(path)
    for token in tokens:
        if token not in t: errors.append(f"{path} : élément absent : {token}")
    return t

def forbid(path, *tokens):
    t = text(path)
    for token in tokens:
        if token in t: errors.append(f"{path} : élément obsolète encore actif : {token}")
    return t

allowed_root = {'.git','.github','app','docs','gradle','scripts','.gitignore','README.md','CHANGELOG.md','build.gradle','gradle.properties','gradlew','gradlew.bat','settings.gradle'}
unexpected = sorted({p.name for p in ROOT.iterdir()} - allowed_root)
if unexpected: errors.append("Éléments inattendus à la racine : " + ", ".join(unexpected))

build_text = require('app/build.gradle',
        "'IMPORT_CHANNEL', '\"IMPORT013\"'",
        "'SEGMENT_CHANNEL', '\"SEGMENT002\"'",
        "'UX_CHANNEL', '\"UX011\"'",
        "'HOME_CHANNEL', '\"HOME012\"'",
        "'GOALS_CHANNEL', '\"GOALS008\"'",
        "'TRAINING_CHANNEL', '\"TRAIN009\"'",
        "'ACTIVITY_CHANNEL', '\"ACTIVITY014\"'",
        "'EQUIPMENT_CHANNEL', '\"EQUIP006\"'",
        "'UI_CHANNEL', '\"THEMES005\"'",
        "'PERFORMANCE_CHANNEL', '\"PERF005\"'",
        "'FIT_FLOW_CHANNEL', '\"FITFLOW006\"'",
        "'CARTO_CHANNEL', '\"CARTO009\"'",
        "'SYNC_CHANNEL', '\"SYNC010\"'")
version_code_match = re.search(r'versionCode\s+(\d+)', build_text)
version_name_match = re.search(r"versionName\s+'6\.3\.(\d+)'", build_text)
if not version_code_match or int(version_code_match.group(1)) < 150:
    errors.append('Version courante inférieure à v150')
if not version_name_match or int(version_name_match.group(1)) < 150:
    errors.append('VersionName courant inférieur à 6.3.150')
current_code = int(version_code_match.group(1)) if version_code_match else 150
workflow_text = require('.github/workflows/android.yml', 'ACTIVITY014', 'EQUIP005', 'EQUIP006')
if f'DESPORTE-v{current_code}' not in workflow_text:
    errors.append(f'Workflow : artefact v{current_code} absent')
require('app/src/main/java/fr/sport/app/release/FeatureRegistry.java',
        'IMPORT013', 'SEGMENT002', 'UX011', 'HOME012', 'GOALS008', 'TRAIN009', 'ACTIVITY014', 'PERF005', 'THEMES005', 'EQUIP005', 'EQUIP006')
manifest = require('app/src/main/AndroidManifest.xml', '.SegmentHubActivity', '.SegmentCreateActivity', '.SegmentDetailActivity')
if 'android.intent.action.SEND_MULTIPLE' in manifest:
    errors.append('IMPORT013 : partage multiple encore déclaré dans le manifeste')

# IMPORT013 : deux voies, un fichier ou Strava automatique.
require('app/src/main/java/fr/sport/app/SyncCenterActivity.java',
        'Import à l\'unité', 'Importer un fichier FIT ou TCX', 'Synchroniser Strava maintenant',
        'Activer la synchronisation Strava en arrière-plan')
forbid('app/src/main/java/fr/sport/app/SyncCenterActivity.java',
       'FIT_SOURCE + Strava', 'Rattraper les FIT manquants', 'Historique des imports', 'Diagnostic et mode sécurisé')
require('app/src/main/java/fr/sport/app/ImportInboxActivity.java',
        'Un fichier FIT ou TCX à la fois', 'Intent.EXTRA_ALLOW_MULTIPLE, false')
forbid('app/src/main/java/fr/sport/app/ImportInboxActivity.java',
       'FIT • TCX • GPX', 'Analyser tous les dossiers surveillés', 'Diagnostic et mode sécurisé',
       'root.addView(importAllButton')
require('app/src/main/java/fr/sport/app/importuniversal/ImportFormat.java', 'return this == FIT || this == TCX;')
require('app/src/main/java/fr/sport/app/sync/SyncOrchestrator.java', 'Strava')
forbid('app/src/main/java/fr/sport/app/sync/SyncOrchestrator.java', 'FitSourceScanner')
require('app/src/main/java/fr/sport/app/sync/SyncNotifier.java',
        'Une activité vient d\'être synchronisée', 'listActivitiesImportedSince')

# UX010 / Accueil / Activités.
require('app/src/main/java/fr/sport/app/TodayActivity.java',
        'TextView title = text("Accueil"', 'dashboardChoiceButton("Course à pied")',
        'dashboardChoiceButton("Vélo")', '"Semaine"', '"Mois"', '"Année"', '"Total"')

# HOME018-FIX / v175 : le comparatif annuel doit réellement rester dans TodayActivity.
# Ce garde-fou évite qu'une future livraison ne change que le numéro de version/workflow.
require('app/src/main/java/fr/sport/app/TodayActivity.java',
        'Comparaison', 'Comparer avec', 'addAnnualComparisonCard()',
        'renderAnnualComparisonGraph()', 'buildAnnualComparisonData(',
        'annualCumulativeByDate(', 'AnnualComparisonChart',
        'selectedAnnualCompareYear', 'selectedAnnualCompareMetric')
forbid('app/src/main/java/fr/sport/app/TodayActivity.java',
       'Vert : réalisé • rouge : retard • gris : reste annuel', 'Cap aujourd\'hui')
lib = require('app/src/main/java/fr/sport/app/LibraryActivity.java', 'Button filtersButton = button("Filtres")')
for token in ['Répertoire central', 'Répertoire " + totalCount', 'Tous les sports", spinnerAdapter', 'Date récente", spinnerAdapter']:
    if token in lib: errors.append('ACTIVITY011 : doublon de première vue encore présent : ' + token)

# UX011 / TRAIN009 : Entraînement et Plus fusionnés en un seul onglet Plus.
training = require('app/src/main/java/fr/sport/app/TrainingHubActivity.java',
                   'text("Plus"', 'Performances', 'Calibration et profil physiologique',
                   'Segments', 'Parcours', 'Suivi du poids',
                   'Import', 'Sauvegarde et restauration', 'Apparence', 'À propos')
for token in ['Étiquettes et collections', 'Qualité des données', 'Préparation Ultra',
              'Plan adaptatif', 'Calendrier avancé', 'Planification simple', 'Rapports SPORT']:
    if token in training: errors.append('TRAIN009 : ancien menu encore visible : ' + token)
nav = require('app/src/main/java/fr/sport/app/SportNavigation.java',
              'add(activity, nav, TODAY, "Accueil"',
              'add(activity, nav, ACTIVITIES, "Activités"',
              'add(activity, nav, TRAINING, "Plus"')
if 'add(activity, nav, MORE, "Plus"' in nav:
    errors.append('UX011 : ancien quatrième onglet Plus encore présent')
require('app/src/main/java/fr/sport/app/MoreActivity.java', 'TrainingHubActivity.class')
forbid('app/src/main/java/fr/sport/app/ActivityEditActivity.java', 'FavoriteUi.bind', 'FavoriteItem.TYPE_ACTIVITY')

# PERF005 : plus de boutons Coach/Intelligence/Records, contenu inline.
perf = require('app/src/main/java/fr/sport/app/PerformanceActivity.java',
               'coachCard(data.insight)', 'intelligenceCard(data.insight.intelligence)',
               'recordsCard(data.records', 'Records GPS', 'Coach, forme et état du jour')
for token in ['new Intent(this, TrainingStatusActivity.class)', 'new Intent(this, AnalysisInsightsActivity.class)', 'new Intent(this, RecordsActivity.class)']:
    if token in perf: errors.append('PERF005 : sous-menu encore présenté comme bouton : ' + token)

# HOME012 / ACTIVITY014 / EQUIP005 / SEGMENT002.
today = require('app/src/main/java/fr/sport/app/TodayActivity.java',
                'periodParams.setMargins(0, dp(6), 0, 0)',
                'int oneMillimeter = dp(6)')
library = require('app/src/main/java/fr/sport/app/LibraryActivity.java',
                  'TextView equipmentLine = text("Matériel : " + equipment',
                  'card.addView(equipmentLine, compactLine())')
for token in ['equipmentSelector(activity, theme)', 'database.updateActivityEquipment(activityId, after, true)']:
    if token in library: errors.append('ACTIVITY015 : ancien sélecteur matériel encore actif : ' + token)
if 'source + " • " + equipment' in library:
    errors.append('ACTIVITY012 : la source d\'import est encore affichée sur les cartes')
if 'root.setBackgroundColor(Color.WHITE)' in library:
    errors.append('ACTIVITY014 : fond blanc forcé encore actif dans Activités')
for token in ['ActivityTrackPreviewView', 'loadTrackPreviews', 'trackPreviewCache']:
    if token in library: errors.append('ACTIVITY014 : ancien aperçu tracé encore actif : ' + token)
require('app/src/main/java/fr/sport/app/SegmentCreateActivity.java',
        'Positionner début et fin sur la carte', 'REQUEST_MAP_SELECTION',
        'EXTRA_SEGMENT_SELECTION_MODE')
require('app/src/main/java/fr/sport/app/ActivityMapActivity.java',
        'SEGMENT002 • sélection sur la carte', 'addOnMapClickListener',
        'selectNearestSegmentPoint', 'Utiliser cette portion',
        'SOURCE_SEGMENT_SELECTION')

# SEGMENT001 socle historique, enrichi par SEGMENT002.
require('app/src/main/java/fr/sport/app/database/SportDatabase.java',
        'CREATE TABLE IF NOT EXISTS segments',
        'CREATE TABLE IF NOT EXISTS segment_points', 'CREATE TABLE IF NOT EXISTS segment_efforts')
require('app/src/main/java/fr/sport/app/segments/SegmentMatcher.java',
        'ENDPOINT_TOLERANCE_M', 'validOrderedAnchors', 'findAll')
require('app/src/main/java/fr/sport/app/segments/SegmentRepository.java',
        'createFromActivity', 'scanSegment', 'scanActivity', 'listBestEfforts', 'listRecentEfforts')
require('app/src/main/java/fr/sport/app/importuniversal/ImportInboxProcessor.java', 'SegmentAutoMatcher.scanSaved')
require('app/src/main/java/fr/sport/app/sync/strava/StravaImportCoordinator.java', 'SegmentAutoMatcher.scanSaved')

# EQUIP006 : migration ponctuelle par CSV, aucune saisie libre.
require('app/src/main/java/fr/sport/app/EquipmentCsvMigrationActivity.java',
        'Exporter les activités en CSV', 'Importer le CSV complété',
        'MATERIEL_A_ASSOCIER', 'applyManualEquipmentAssignments')
require('app/src/main/java/fr/sport/app/equipment/EquipmentCsvCodec.java',
        'ACTIVITY_ID', 'MATERIEL_A_ASSOCIER', 'UTF-8 BOM')
require('app/src/main/java/fr/sport/app/database/SportDatabase.java',
        'listActivitiesForEquipmentCsv', 'applyManualEquipmentAssignments')
require('app/src/main/java/fr/sport/app/EquipmentHubActivity.java',
        'Affectation par CSV · temporaire')
require('app/src/main/AndroidManifest.xml', '.EquipmentCsvMigrationActivity')

# Socles toujours actifs.
for path in [
    'app/src/main/java/fr/sport/app/map/OfflineMapsforgeAtlas.java',
    'app/src/main/java/fr/sport/app/ActivityDetailActivity.java',
    'app/src/main/java/fr/sport/app/fit/CanonicalFitWriter.java',
    'app/src/main/java/fr/sport/app/importcore/TreadmillSlopeRule.java',
    'app/src/main/java/fr/sport/app/performance001/PerformanceDashboardCalculator.java',
    'app/src/main/java/fr/sport/app/BulkEquipmentAssignmentActivity.java',
    'scripts/ci/run_contract_tests.sh']:
    require_file(path)

archive = ROOT/'docs/archive/CLEAN001_LEGACY_CONTEXT.zip'
if archive.is_file():
    try:
        with zipfile.ZipFile(archive) as z:
            if len(z.namelist()) < 250: errors.append('Archive historique anormalement incomplète')
    except zipfile.BadZipFile: errors.append('Archive historique illisible')

# HOME019 / BORNES001 / v177 : empêcher une version numérotée sans la vraie rubrique Bornes.
today = (ROOT / "app/src/main/java/fr/sport/app/TodayActivity.java").read_text(encoding="utf-8")
for token in [
    "Bornes", "Année en cours", "Autre année", "findBorneCrossingDate",
    "home-borne-card", "borneValueInput", "borneYearSpinner", "renderBorneResult",
    "addBorneCard();"
]:
    if token not in today:
        errors.append("HOME019 / BORNES001 absent : " + token)

# HOME020 / REGULARITY001 / v178 : la rubrique Régularité reste présente.
_today_home020 = (ROOT / "app/src/main/java/fr/sport/app/TodayActivity.java").read_text(encoding="utf-8")
for _token in [
    'Régularité',
    'addThresholdRegularityCard();',
    'ThresholdPeriod',
    'ThresholdMode',
    'renderThresholdRegularityGraph',
    'buildThresholdHistoryData',
    'ThresholdHistoryChart',
    'moveToMonday',
]:
    if _token not in _today_home020:
        errors.append(f"HOME020/REGULARITY001 absent de TodayActivity.java : {_token}")

# HOME021 / ACTIVITY022 / CARTO012 / v179 : ajustements visuels et ergonomiques.
for _token in [
    'homeSportBarHost',
    'homeSportBarHost.addView(buildUnifiedHomeSportBar()',
    'TextView title = text("Comparaison"',
    'consecutivePlural',
    'Color.rgb(65, 224, 255)',
]:
    if _token not in _today_home020:
        errors.append(f"HOME021 absent de TodayActivity.java : {_token}")
for _obsolete in [
    'Comparaison de périodes calendaires · période en cours à droite',
    "Cumul du 1er janvier à aujourd'hui · année courante contre une année choisie",
    "Périodes au-dessus d'un seuil · touchez une année sur le graphique",
]:
    if _obsolete in _today_home020:
        errors.append(f"HOME021 : mention obsolète encore visible : {_obsolete}")

_detail_v179 = (ROOT / "app/src/main/java/fr/sport/app/ActivityDetailActivity.java").read_text(encoding="utf-8")
try:
    _render_v179 = _detail_v179[_detail_v179.index('private void render()'):_detail_v179.index('private LinearLayout buildChronologicalNavigation')]
    if not (_render_v179.index('addMapSection(root);') < _render_v179.index('addActivity017Landmarks(root);') < _render_v179.index('addActivity017Stats(root);')):
        errors.append('ACTIVITY022 : les repères personnels ne sont pas placés avant les statistiques')
    if not (_render_v179.index('Button back = button("← Retour aux activités")') < _render_v179.index('© OpenStreetMap contributors')):
        errors.append('CARTO012 : attribution OSM non placée sous Retour aux activités')
except ValueError:
    errors.append('ACTIVITY022/CARTO012 : structure render() introuvable')

# ACTIVITY023 / REPERE008 / v180 : modification en masse des repères sur la fiche activité.
_detail_v180 = (ROOT / "app/src/main/java/fr/sport/app/ActivityDetailActivity.java").read_text(encoding="utf-8")
_db_v180 = (ROOT / "app/src/main/java/fr/sport/app/database/SportDatabase.java").read_text(encoding="utf-8")
for _token in [
    'final String[] preferred = {"R", "Q", "M", "C", "B", "Y", "V",',
    'shouldShowQuickPersonalLandmark',
    'quickPersonalLandmarkLabel',
    'styleQuickPersonalLandmarkButton',
    'TextView equipment = text(cleanOr(activity.equipmentName, "—"), 14, true);',
    'activity.sport == 1 && ("V".equalsIgnoreCase(code) || "A".equalsIgnoreCase(code))',
    'activity.sport == 2 && "B"',
    'quick.setBackgroundTintList(null)',
    'quick.setStateListAnimator(null)',
]:
    if _token not in _detail_v180:
        errors.append(f"ACTIVITY023/REPERE008 absent de ActivityDetailActivity.java : {_token}")
for _token in [
    'seedPersonalLandmark(db, "A", "Repère A", "Trajet"',
    'seedPersonalLandmark(db, "X", "Problème activité", "Trajet"',
]:
    if _token not in _db_v180:
        errors.append(f"REPERE008 absent de SportDatabase.java : {_token}")
if 'Button landmarks = button("Attribuer les repères personnels")' in _detail_v180:
    errors.append('ACTIVITY023 : ancien bouton Attribuer les repères personnels encore présent dans la fiche compacte')


# ACTIVITY024 / REPERE009 / v181 : contraste doré/noir réellement indépendant du thème OEM.
_detail_v181 = (ROOT / "app/src/main/java/fr/sport/app/ActivityDetailActivity.java").read_text(encoding="utf-8")
for _token in [
    'final int gold = Color.rgb(218, 177, 76)',
    'final int black = Color.rgb(8, 8, 8)',
    'final int red = Color.rgb(215, 38, 48)',
    'if (active && problem)',
    'quick.setTextColor(Color.WHITE)',
    'quick.setBackgroundTintList(null)',
    'TextView equipment = text(cleanOr(activity.equipmentName, "—"), 14, true);',
]:
    if _token not in _detail_v181:
        errors.append(f"ACTIVITY024/REPERE009 absent de ActivityDetailActivity.java : {_token}")
if 'Matériel utilisé : " + cleanOr(activity.equipmentName' in _detail_v181:
    errors.append('ACTIVITY024 : préfixe Matériel utilisé encore présent dans le bandeau de modification en masse')


# ACTIVITY025 / REPERE010 / v182 : SportTheme ne doit plus écraser le contraste des repères.
_detail_v182 = (ROOT / "app/src/main/java/fr/sport/app/ActivityDetailActivity.java").read_text(encoding="utf-8")
_theme_v182 = (ROOT / "app/src/main/java/fr/sport/app/SportTheme.java").read_text(encoding="utf-8")
for _token in [
    'quick.setTag("sport-personal-landmark-inactive")',
    'quick.setTag("sport-personal-landmark-active")',
    'quick.setTag("sport-personal-landmark-problem-active")',
]:
    if _token not in _detail_v182:
        errors.append(f"ACTIVITY025/REPERE010 absent de ActivityDetailActivity.java : {_token}")
for _token in [
    '"sport-personal-landmark-problem-active".equals(tag)',
    '"sport-personal-landmark-active".equals(tag)',
    '"sport-personal-landmark-inactive".equals(tag)',
    'Color.rgb(215, 38, 48)',
    'Color.rgb(218, 177, 76)',
    'Color.rgb(8, 8, 8)',
]:
    if _token not in _theme_v182:
        errors.append(f"REPERE010 absent de SportTheme.java : {_token}")


# ACTIVITY027 / REPERE012 / VIRTUAL002 / v184 : filtre libre de repères, calendrier, Faucille et badge détail.
_library_v184 = (ROOT / "app/src/main/java/fr/sport/app/LibraryActivity.java").read_text(encoding="utf-8")
_db_v184 = (ROOT / "app/src/main/java/fr/sport/app/database/SportDatabase.java").read_text(encoding="utf-8")
_detail_v184 = (ROOT / "app/src/main/java/fr/sport/app/ActivityDetailActivity.java").read_text(encoding="utf-8")
for _token in [
    'Button sortButton = button("Trier")',
    'shell.addView(topActions, mw())',
    'landmarkFilterView = field("Repère(s) : R;M;V…")',
    'normalizeLandmarkFilter',
    'query.landmarkCodes = normalizeLandmarkFilter',
    'configureDatePicker(startDateView)',
    'configureDatePicker(endDateView)',
    'new DatePickerDialog',
    'showSortChooser()',
    'virtualActivityBadge(activity, theme)',
    'symbol = "🏃▰"',
    'symbol = "🚴△"',
]:
    if _token not in _library_v184:
        errors.append(f"ACTIVITY027/VIRTUAL001 absent de LibraryActivity.java : {_token}")
for _token in [
    'public String landmarkCodes = ""',
    'query.landmarkCodes.split(";")',
    'UPPER(al.landmark_code) IN (',
    'seedPersonalLandmark(db, "F", "Col de la Faucille", "Ascension"',
]:
    if _token not in _db_v184:
        errors.append(f"ACTIVITY027/REPERE012 absent de SportDatabase.java : {_token}")
for _token in [
    '{"R", "Q", "M", "C", "B", "Y", "V", "F", "A", "X"}',
    'activity.sport == 1 && ("V".equalsIgnoreCase(code) || "A".equalsIgnoreCase(code))',
    '"F".equalsIgnoreCase(code) && activity.sport != 2',
    'database.createPersonalLandmark("F", "Col de la Faucille", "Ascension")',
    'virtualActivityDetailMark(activity)',
    'return " ▰"',
    'return " △"',
]:
    if _token not in _detail_v184:
        errors.append(f"REPERE012/VIRTUAL002 absent de ActivityDetailActivity.java : {_token}")

# ACTIVITY028 / PROFILE001 / v186 : graphiques intégrés, détail km et FC point par point.
_detail_v186 = (ROOT / "app/src/main/java/fr/sport/app/ActivityDetailActivity.java").read_text(encoding="utf-8")
_db_v186 = (ROOT / "app/src/main/java/fr/sport/app/database/SportDatabase.java").read_text(encoding="utf-8")
_fit_v186 = (ROOT / "app/src/main/java/fr/sport/app/fit/FitReader.java").read_text(encoding="utf-8")
_map_v186 = (ROOT / "app/src/main/java/fr/sport/app/ActivityMapActivity.java").read_text(encoding="utf-8")
for _token in [
    'addActivityProfileGraphs(root);',
    'addKilometerDetails(root);',
    'TextView heading = text("Graphiques", 18, true);',
    'TextView heading = text("Détail par km", 18, true);',
    'Fréquence cardiaque (FC)',
    'FC détaillée indisponible',
    'chartAltitude()', 'chartHeartRate()', 'chartSlope()', 'chartPace()', 'chartSpeed()',
    'GradeAdjustedPaceEngine', 'ProfileChartView',
]:
    if _token not in _detail_v186:
        errors.append(f"ACTIVITY028/PROFILE001 absent de ActivityDetailActivity.java : {_token}")
for _token in [
    'heart_rate INTEGER', 'backfillActivityPointHeartRates',
    'putNullable(values, "heart_rate", point.heartRate)',
]:
    if _token not in _db_v186:
        errors.append(f"PROFILE001 FC détaillée absente de SportDatabase.java : {_token}")
for _token in ['values.get(3)', 'heartRate', 'point.heartRate']:
    if _token not in _fit_v186:
        errors.append(f"PROFILE001 FC FIT absente de FitReader.java : {_token}")
# PROFILE001-FIX / v187 : loadedPoints est réassigné lors du backfill FC et ne doit
# donc pas être capturé directement par la lambda UI.
for _token in [
    'final List<SportDatabase.ActivityPoint> finalLoadedPoints = loadedPoints;',
    'points = finalLoadedPoints;',
    'buildTrackProfile(finalLoadedPoints, loaded)',
]:
    if _token not in _detail_v186:
        errors.append(f"PROFILE001-FIX v187 absent de ActivityDetailActivity.java : {_token}")

# PROFILE002 / v188 : FC historique robuste, axe allure corrigé, D+/D- km et pente retirée de la fiche.
_fit_store_v188 = (ROOT / "app/src/main/java/fr/sport/app/fitflow/FitDestinationStore.java").read_text(encoding="utf-8")
for _token in [
    'readBestFitForActivity',
    'hasDetailedHeartRate(FitActivityData activity)',
    'yyyy_MM_dd_HH_mm',
]:
    if _token not in _fit_store_v188:
        errors.append(f"PROFILE002 v188 recherche FIT historique absente : {_token}")
for _token in [
    'backfillActivityPointHeartRatesFromTimeline',
    'FitActivityData.FitTimelinePoint',
    'delta > 5_000L',
    'delta > 25.0',
]:
    if _token not in _db_v186:
        errors.append(f"PROFILE002 v188 rattrapage FC timeline absent : {_token}")
for _token in [
    'destination.readBestFitForActivity(',
    'double topValue = kind == ChartKind.PACE ? min : max;',
    'final double stepMeters = 20.0;',
    'if (delta > 0.15) ascent += delta;',
]:
    if _token not in _detail_v186:
        errors.append(f"ACTIVITY029/PROFILE002 v188 absent : {_token}")
if ('database.backfillActivityPointHeartRatesFromTimeline(activityId, fit.getTimeline())' not in _detail_v186
        and 'database.backfillActivityPointHeartRatesFromTimeline(activityId, heartRateTimeline)' not in _detail_v186):
    errors.append('ACTIVITY029/PROFILE002 v188 : rattrapage FC non appelé')
if 'addProfileChart(card, "Pente", chartSlope(), ChartKind.SLOPE);' in _detail_v186:
    errors.append('ACTIVITY029 v188 : graphique Pente encore visible dans la fiche Activité')

# PROFILE003 / v189 : FC des activités découpées + courbes Activité en surbrillance.
_obs_v189 = text('app/src/main/java/fr/sport/app/importcore/ActivityObservation.java')
_adapter_v189 = text('app/src/main/java/fr/sport/app/importcore/FitImportAdapter.java')
_segment_v189 = text('app/src/main/java/fr/sport/app/importfolder/FitSegmentFactory.java')
for _token in ['private final Integer heartRate;', 'getHeartRate()', 'Integer heartRate']:
    if _token not in _obs_v189:
        errors.append(f'PROFILE003 v189 ActivityObservation FC absente : {_token}')
if 'point.heartRate' not in _adapter_v189:
    errors.append('PROFILE003 v189 FitImportAdapter ne transmet pas la FC')
for _token in ['observation.getHeartRate()', 'segmentAverageHr', 'segmentMaximumHr']:
    if _token not in _segment_v189:
        errors.append(f'PROFILE003 v189 découpage FC absent : {_token}')
for _token in [
    'findFitSourceDocumentUri(long activityId, String sourceFileSha256)',
    'readFitByDocumentUri',
    'timelineForActivitySegment',
    'loaded.segmentCount > 1',
    'database.backfillActivityPointHeartRatesFromTimeline(activityId, heartRateTimeline)',
    'setLayerType(View.LAYER_TYPE_SOFTWARE, null)',
    'line.setShadowLayer(dp(10)',
    'line.clearShadowLayer()',
]:
    _haystack = _detail_v186 + _db_v186 + _fit_store_v188
    if _token not in _haystack:
        errors.append(f'PROFILE003 v189 absent : {_token}')

# PROFILE004 / v190 : récupération FC multi-source et recherche Strava à la demande.
_hr_recovery_v190 = text('app/src/main/java/fr/sport/app/sync/strava/HeartRateRecoveryService.java')
for _token in [
    'class HeartRateRecoveryService',
    'recoverLocal(long activityId)',
    'recover(long activityId, boolean allowNetwork)',
    'FIT_SOURCE', 'FIT_DESTINATION', 'STRAVA_CACHE', 'STRAVA_REMOTE',
    'downloadCatalogCandidates',
    'api.getActivityStreams(token, candidate.activity.getId())',
    'timelineFromStrava',
    'backfillActivityPointHeartRatesFromTimeline',
]:
    if _token not in _hr_recovery_v190:
        errors.append(f'PROFILE004 v190 récupération FC absente : {_token}')
for _token in [
    'readHeartRateFitCovering',
    'isPlausibleFitDateName',
    'timelineDuration(FitActivityData activity)',
]:
    if _token not in _fit_store_v188:
        errors.append(f'PROFILE004 v190 recherche FIT étendue absente : {_token}')
for _token in [
    'Rechercher la FC détaillée',
    'recoverDetailedHeartRate()',
    'new HeartRateRecoveryService(this, database).recover(activityId, true)',
    'new HeartRateRecoveryService(this, database).recoverLocal(activityId)',
]:
    if _token not in _detail_v186:
        errors.append(f'PROFILE004 v190 interface récupération FC absente : {_token}')

if 'GAP & charge' in _map_v186:
    errors.append('ACTIVITY028 : ancien sous-menu GAP & charge encore présent dans ActivityMapActivity')


# SYNCLOUD001 / v192 : synchronisation téléphone/tablette via Google Drive appDataFolder.
_cloud_activity_v192 = text('app/src/main/java/fr/sport/app/CloudSyncActivity.java')
_cloud_coord_v192 = text('app/src/main/java/fr/sport/app/cloud/CloudSyncCoordinator.java')
_cloud_drive_v192 = text('app/src/main/java/fr/sport/app/cloud/CloudDriveClient.java')
_cloud_settings_v192 = text('app/src/main/java/fr/sport/app/cloud/CloudSyncSettings.java')
_cloud_local_v192 = text('app/src/main/java/fr/sport/app/cloud/CloudLocalState.java')
_base_v192 = text('app/src/main/java/fr/sport/app/BaseActivity.java')
_manifest_v192 = text('app/src/main/AndroidManifest.xml')
_training_v192 = text('app/src/main/java/fr/sport/app/TrainingHubActivity.java')
_gradle_v192 = text('app/build.gradle')
_workflow_v192 = text('.github/workflows/android.yml')
for _token in [
    'Synchronisation SPORT', 'Autoriser Google Drive et activer',
    'Garder cet appareil et l\'envoyer au cloud',
    'Remplacer cet appareil par la version cloud',
    'CloudSyncCoordinator.Mode.FORCE_UPLOAD', 'CloudSyncCoordinator.Mode.FORCE_DOWNLOAD',
]:
    if _token not in _cloud_activity_v192:
        errors.append(f'SYNCLOUD001 v192 écran cloud absent : {_token}')
for _token in [
    'BACKUP_NAME = "sport_sync_backup.zip"', 'META_NAME = "sport_sync_meta.json"',
    'Mode.BACKGROUND_PUSH', 'remoteChanged && localChanged',
    'BackupManager.createBackup', 'BackupManager.restoreBackup',
    'runStartup(Activity activity', 'requestBackgroundPush(Activity activity)',
]:
    if _token not in _cloud_coord_v192:
        errors.append(f'SYNCLOUD001 v192 coordinateur absent : {_token}')
for _token in [
    'https://www.googleapis.com/auth/drive.appdata', 'appDataFolder',
    'uploadType=media', '?alt=media', 'spaces=appDataFolder',
]:
    if _token not in _cloud_drive_v192:
        errors.append(f'SYNCLOUD001 v192 Drive appDataFolder absent : {_token}')
for _token in ['last_revision', 'last_local_token', 'ever_synced', 'conflict']:
    if _token not in _cloud_settings_v192:
        errors.append(f'SYNCLOUD001 v192 état local absent : {_token}')
for _token in ['changeToken(Context context)', 'activityCount(Context context)']:
    if _token not in _cloud_local_v192:
        errors.append(f'SYNCLOUD001 v192 empreinte locale absente : {_token}')
if 'CloudSyncCoordinator.requestBackgroundPush(this)' not in _base_v192:
    errors.append('SYNCLOUD001 v192 : envoi cloud à la mise en arrière-plan absent de BaseActivity')
if '<activity android:name=".CloudSyncActivity"' not in _manifest_v192:
    errors.append('SYNCLOUD001 v192 : CloudSyncActivity absente du manifeste')
if 'addAction(root, "Synchronisation cloud", new Intent(this, CloudSyncActivity.class))' not in _training_v192:
    errors.append('SYNCLOUD001 v192 : entrée Synchronisation cloud absente de Plus')
if "play-services-auth:21.6.0" not in _gradle_v192:
    errors.append('SYNCLOUD001 v192 : dépendance Google Identity Services absente')
if not (('versionCode 192' in _gradle_v192 and "versionName '6.3.192'" in _gradle_v192) or
        ('versionCode 193' in _gradle_v192 and "versionName '6.3.193'" in _gradle_v192) or
        ('versionCode 194' in _gradle_v192 and "versionName '6.3.194'" in _gradle_v192)):
    errors.append('SYNCLOUD001+ : versionCode/versionName non alignés')
if not ('DESPORTE-v192-ACTIVITY014-EQUIP005-EQUIP006-CSV' in _workflow_v192 or
        'DESPORTE-v193-ACTIVITY014-EQUIP005-EQUIP006-CSV' in _workflow_v192 or
        'DESPORTE-v194-ACTIVITY014-EQUIP005-EQUIP006-CSV' in _workflow_v192):
    errors.append('SYNCLOUD001+ : artefact workflow absent')
if 'Empreinte SHA-1 à déclarer dans le client OAuth Android Google' not in _workflow_v192:
    errors.append('SYNCLOUD001 v192 : empreinte SHA-1 OAuth non exposée dans le workflow')
for _token in ['CloudSyncCoordinator.runStartup(this', 'renderCloudStartup()', 'if (!startupInitialized) return;']:
    if _token not in _today_home020:
        errors.append(f'SYNCLOUD001 v192 démarrage Accueil absent : {_token}')



# SYNCLOUD002 / v193 : compatibilité historique, ou migration vers SYNCLOUD003.
_cloud_quick_v193 = text('app/src/main/java/fr/sport/app/cloud/CloudQuickSnapshot.java')
_is_v194 = 'versionCode 194' in _gradle_v192 and "versionName '6.3.194'" in _gradle_v192
if not _is_v194:
    for _token in [
        'SPORT_SYNCLOUD_QUICK', 'new_activity_points.tsv', 'baseMaxActivityId',
        'activity_landmarks', 'personal_landmark_references', 'performance001.db', 'journal001.db'
    ]:
        if _token not in _cloud_quick_v193:
            errors.append(f'SYNCLOUD002 v193 instantané rapide absent : {_token}')
    for _token in [
        'QUICK_NAME = "sport_sync_quick.zip"', 'uploadQuickOrFallback', 'QUICK_MAX_BYTES',
        'CloudSyncMetadata.KIND_QUICK', 'downloadQuick', 'BACKGROUND_DEBOUNCE_MS = 45_000L'
    ]:
        if _token not in _cloud_coord_v192:
            errors.append(f'SYNCLOUD002 v193 coordinateur rapide absent : {_token}')
    if 'FORMAT_VERSION = 2' not in text('app/src/main/java/fr/sport/app/cloud/CloudSyncMetadata.java'):
        errors.append('SYNCLOUD002 v193 : manifeste cloud v2 absent')
    if 'versionCode 193' not in _gradle_v192 or "versionName '6.3.193'" not in _gradle_v192:
        errors.append('SYNCLOUD002 v193 : version 193 absente')
    if 'DESPORTE-v193-ACTIVITY014-EQUIP005-EQUIP006-CSV' not in _workflow_v192:
        errors.append('SYNCLOUD002 v193 : artefact workflow v193 absent')

# SYNCLOUD003 / v194 : révisions immuables et journal différentiel SQLite.
_cloud_delta_v194 = text('app/src/main/java/fr/sport/app/cloud/CloudDeltaSnapshot.java')
_cloud_meta_v194 = text('app/src/main/java/fr/sport/app/cloud/CloudSyncMetadata.java')
_db_v194 = text('app/src/main/java/fr/sport/app/database/SportDatabase.java')
if _is_v194:
    for _token in [
        'SPORT_SYNCLOUD_DELTA', 'sync_change_log', 'pendingChangeCount(Context context)',
        'maxChangeSeq(Context context)', 'clearThrough(Context context', 'points/',
        'setApplyGuard(db, true)', 'performance001.db', 'journal001.db'
    ]:
        if _token not in _cloud_delta_v194:
            errors.append(f'SYNCLOUD003 v194 delta absent : {_token}')
    for _token in [
        'DATABASE_VERSION = 28', 'createCloudSyncJournalTables', 'sync_change_counter',
        'sync_apply_guard', 'sync_change_log', 'createSyncTriggers(db, "activity_points"'
    ]:
        if _token not in _db_v194:
            errors.append(f'SYNCLOUD003 v194 journal SQLite absent : {_token}')
    for _token in [
        'revisionManifestName', 'sport_delta_R', 'sport_full_R', 'publishRevision',
        'uploadDeltaOrCompact', 'downloadToHead', 'readRevision',
        'CloudSyncMetadata.KIND_DELTA', 'Empreinte SHA-256 invalide pour la révision'
    ]:
        if _token not in _cloud_coord_v192:
            errors.append(f'SYNCLOUD003 v194 révisions immuables absentes : {_token}')
    for _token in ['FORMAT_VERSION = 3', 'KIND_DELTA = "DELTA"', 'baseRevision', 'isLegacy()']:
        if _token not in _cloud_meta_v194:
            errors.append(f'SYNCLOUD003 v194 manifeste v3 absent : {_token}')
    if 'TOKEN_SCHEMA_VERSION = 3' not in _cloud_settings_v192:
        errors.append('SYNCLOUD003 v194 : schéma local v3 absent')
    if 'syncSequence(Context context)' not in _cloud_local_v192:
        errors.append('SYNCLOUD003 v194 : empreinte journal ultra-légère absente')
    if 'SYNCLOUD003 · différentiel' not in _cloud_activity_v192:
        errors.append('SYNCLOUD003 v194 : interface différentielle absente')
    if 'DESPORTE-v194-ACTIVITY014-EQUIP005-EQUIP006-CSV' not in _workflow_v192:
        errors.append('SYNCLOUD003 v194 : artefact workflow v194 absent')

if errors:
    for error in errors: print('ERREUR V144:', error)
    sys.exit(1)

print('SPORT v150+ validé : EQUIP006 CSV prêt sans régression ACTIVITY014/EQUIP005/THEMES005/STAB003/IMPORT013.')
