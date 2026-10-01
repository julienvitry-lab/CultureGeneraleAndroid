package fr.culturegenerale.android.tablet;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * CGANDROID016 · LEGACY_IMAGE_NORMALIZE001 / DETAIL_TO_IMAGE001
 *
 * Compatibilité locale avec les formes historiques du catalogue.
 * Aucune donnée Cloud n'est modifiée ici : la normalisation est purement
 * Android et prépare une référence exploitable par le chargeur d'images.
 */
final class CgLegacyImageNormalizer {

    private CgLegacyImageNormalizer() { }

    static boolean normalizeQuestion(
            CgQuestion question,
            String imageThumbFile,
            String imageSourceUrl
    ) {
        if (question == null) return false;

        String oldDetail = safe(question.detail);
        String oldImage = safe(question.imageFile);
        boolean oldIsImage = question.isImage;

        String detailImage = imageReferenceFromDetail(oldDetail);
        String main = normalizeReference(oldImage);
        String thumb = normalizeReference(imageThumbFile);
        String source = normalizeReference(imageSourceUrl);

        String chosen = chooseBest(main, thumb, source, detailImage);

        if (!detailImage.isEmpty() && sameReference(chosen, detailImage)) {
            question.detail = "";
        } else {
            question.detail = oldDetail;
        }

        question.imageFile = chosen;

        boolean imageSignal =
                oldIsImage
                        || !oldImage.isEmpty()
                        || !safe(imageThumbFile).isEmpty()
                        || !safe(imageSourceUrl).isEmpty()
                        || !detailImage.isEmpty();

        question.isImage = imageSignal && !chosen.isEmpty();

        return !oldDetail.equals(question.detail)
                || !oldImage.equals(question.imageFile)
                || oldIsImage != question.isImage;
    }

    static String normalizeReference(String raw) {
        String value = safe(raw).replace('\u00A0', ' ').trim();
        if (value.isEmpty()) return "";

        if (value.length() >= 2) {
            char first = value.charAt(0);
            char last = value.charAt(value.length() - 1);
            if ((first == '"' && last == '"') || (first == '\'' && last == '\'')) {
                value = value.substring(1, value.length() - 1).trim();
            }
        }

        value = value.replace('\\', '/');

        while (value.startsWith("./")) {
            value = value.substring(2);
        }

        if (value.startsWith("/users/") && value.contains("/question-images/")) {
            value = value.substring(1);
        }

        if (!value.contains("://") && value.toLowerCase(Locale.ROOT).contains("%2f")) {
            try {
                String decoded = URLDecoder.decode(value, StandardCharsets.UTF_8.name());
                if (decoded.startsWith("users/") && decoded.contains("/question-images/")) {
                    value = decoded;
                }
            } catch (Exception ignored) { }
        }

        int embeddedUsers = value.indexOf("users/");
        if (embeddedUsers > 0 && value.contains("/question-images/")) {
            value = value.substring(embeddedUsers);
        }

        return value.trim();
    }

    static String imageReferenceFromDetail(String detail) {
        String value = normalizeReference(detail);
        return looksLikeImageReference(value) ? value : "";
    }

    static boolean isRemoteImageReference(String value) {
        String ref = normalizeReference(value);
        if (ref.isEmpty()) return false;
        String lower = ref.toLowerCase(Locale.ROOT);
        return lower.startsWith("http://")
                || lower.startsWith("https://")
                || lower.startsWith("gs://")
                || (ref.startsWith("users/") && ref.contains("/question-images/"));
    }

    static boolean looksLikeImageReference(String value) {
        String ref = normalizeReference(value);
        if (ref.isEmpty()) return false;

        String lower = ref.toLowerCase(Locale.ROOT);
        if (lower.startsWith("gs://")) return true;
        if (ref.startsWith("users/") && ref.contains("/question-images/")) return true;

        if (lower.startsWith("http://") || lower.startsWith("https://")) {
            if (lower.contains("firebasestorage.googleapis.com/")) return true;
            if (lower.contains("/question-images/")) return true;
        }

        int query = lower.indexOf('?');
        if (query >= 0) lower = lower.substring(0, query);
        int hash = lower.indexOf('#');
        if (hash >= 0) lower = lower.substring(0, hash);

        return lower.endsWith(".jpg")
                || lower.endsWith(".jpeg")
                || lower.endsWith(".png")
                || lower.endsWith(".webp")
                || lower.endsWith(".bmp")
                || lower.endsWith(".gif");
    }

    private static String chooseBest(
            String main,
            String thumb,
            String source,
            String detailImage
    ) {
        // image_file et image_thumb_file sont des champs média : une forme
        // Cloud/HTTP exploitable prime sur les anciens noms locaux.
        if (isRemoteImageReference(main)) return normalizeReference(main);
        if (isRemoteImageReference(thumb)) return normalizeReference(thumb);

        // image_source_url reste un champ de provenance : il n'est utilisé
        // comme média que s'il ressemble réellement à une image.
        if (isRemoteImageReference(source) && looksLikeImageReference(source)) {
            return normalizeReference(source);
        }
        if (isRemoteImageReference(detailImage)) return normalizeReference(detailImage);

        String[] candidates = new String[]{main, thumb, source, detailImage};
        for (String candidate : candidates) {
            String normalized = normalizeReference(candidate);
            if (looksLikeImageReference(normalized)) return normalized;
        }

        return "";
    }

    private static boolean sameReference(String a, String b) {
        return normalizeReference(a).equals(normalizeReference(b));
    }

    private static String safe(String value) {
        return value == null ? "" : value.trim();
    }
}
