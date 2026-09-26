// A slug is percent-encoded in the site's own URLs, and the URL parser leaves
// invalid escapes intact — so a path segment like "100%.html" reaches
// decodeURIComponent unchanged and makes it throw URIError. Decode defensively
// and fall back to the raw segment.
function safeDecode(value) {
    try {
        return decodeURIComponent(value);
    } catch {
        return String(value);
    }
}

class SeriesUrl {
    static defaults = {
        language: "de",
        hoster: "Doodstream"
    };

    static parse(url, defaults = {}) {
        const baseDefaults = {
            ...this.defaults,
            ...defaults
        };

        let parsed;
        try {
            parsed = new URL(url);
        } catch {
            return null;
        }

        const parts = parsed.pathname
            .split("/")
            .filter(Boolean);

        const result = {
            title: null,
            season: 1,
            episode: 1,
            language: baseDefaults.language,
            hoster: baseDefaults.hoster,
            hosterExplicit: false
        };

        const serieIndex = parts.indexOf("serie");

        if (serieIndex === -1) {
            result.homepage = true;
            return result;
        }

        const path = parts.slice(serieIndex + 1);

        if (!path[0]) {
            result.allShows = true;
            return result;
        }

        result.title = safeDecode(path[0]);

        if (path[1]) {
            const season = Number(path[1]);
            // `Number(x) || 1` would turn season 0 into season 1, and 0 is a
            // real season here (Specials). Only a non-numeric segment falls back.
            result.season = Number.isFinite(season) ? season : 1;
        }

        if (path[2]) {
            const episodeMatch = path[2].match(/^(\d+)/);

            if (episodeMatch) {
                result.episode = Number(
                    episodeMatch[1]
                );
            }
        }

        if (path[3]) {
            result.language = path[3];
        }

        if (path[4]) {
            result.hoster = path[4];
            result.hosterExplicit = true;
        }

        return result;
    }
}

export default SeriesUrl;