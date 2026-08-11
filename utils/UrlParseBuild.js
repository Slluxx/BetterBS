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

        const parsed = new URL(url);

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

        result.title = decodeURIComponent(path[0]);

        if (path[1]) {
            result.season = Number(path[1]) || 1;
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