import SiteMapIndexGenerator from './IndexMapGenerator';
import SiteMapGenerator from './SiteMapGenerator';
import uniq from 'lodash/uniq';

export default class SiteMapManager {
    constructor(options) {
        let sitemapTypes = [];

        options = options || {};

        this.options = options;

        for (let type in options.mapping) {
            const sitemapType = options.mapping[type].sitemap || `pages`;
            sitemapTypes.push(sitemapType);
        }

        // ensure, we have a cleaned up array
        sitemapTypes = uniq(sitemapTypes);

        // create sitemaps for each type
        sitemapTypes.forEach((type) => {
            this[type] = options[type] || this.createSiteMapGenerator(options, type);
        });

        this.index = options.index || this.createIndexGenerator(sitemapTypes);
        // create the default pages one for all fallback sitemap URLs
        this.pages = options.pages || this.createSiteMapGenerator(options, `pages`);
    }

    createIndexGenerator(sitemapTypes) {
        const types = {};

        sitemapTypes.forEach(type => types[type] = this[type]);

        return new SiteMapIndexGenerator({
            types: types
        });
    }

    createSiteMapGenerator(options, type) {
        return new SiteMapGenerator(options, type);
    }

    getIndexXml(options) {
        return this.index.getXml(options);
    }

    getSiteMapXml(type, options) {
        return this[type].getXml(options);
    }

    // This is the equivalent of adding the URLs on bootstrap by listening to the events
    // like we do in Ghost core
    addUrls(type, {url, node}) {
        return this[type].addUrl(url, node);
    }
}

