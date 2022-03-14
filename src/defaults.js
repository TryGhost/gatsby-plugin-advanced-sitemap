// These are the default options which can be overwritten
// in gatsby-config.js
const defaultOptions = {
    query: `
    {
        allSitePage {
            edges {
                node {
                    id
                    slug: path
                    url: path
                }
            }
        }
    }`,
    mapping: {
        allSitePage: {
            sitemap: `pages`
        }
    },
    output: `/sitemap-index.xml`,
    summaryOutput: `/sitemap.xml`,
    exclude: [
        `/dev-404-page`,
        `/404`,
        `/404.html`,
        `/offline-plugin-app-shell-fallback`
    ],
    createLinkInHead: true,
    slugsMapping: {},
    additionPages: []
};

export default defaultOptions;
