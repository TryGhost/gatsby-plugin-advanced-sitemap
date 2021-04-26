import path from 'path';
import _ from 'lodash';

import defaultOptions from './defaults';
import Manager from './SiteMapManager';

import * as utils from './utils';

const PUBLICPATH = `./public`;
const RESOURCESFILE = `/sitemap-:resource.xml`;
const XSLFILE = path.resolve(__dirname, `./static/sitemap.xsl`);
const DEFAULTQUERY = `{
  allSitePage {
    edges {
      node {
        id
        slug: path
        url: path
      }
    }
  }
  site {
    siteMetadata {
      siteUrl
    }
  }
}`;
const DEFAULTMAPPING = {
    allSitePage: {
        sitemap: `pages`
    }
};
let siteURL;

const copyStylesheet = async ({siteUrl, pathPrefix, indexOutput}) => {
    const siteRegex = /(\{\{blog-url\}\})/g;

    // Get our stylesheet template
    const data = await utils.readFile(XSLFILE);

    // Replace the `{{blog-url}}` variable with our real site URL
    const sitemapStylesheet = data.toString().replace(siteRegex, new URL(path.join(pathPrefix, indexOutput), siteUrl).toString());

    // Save the updated stylesheet to the public folder, so it will be
    // available for the xml sitemap files
    await utils.writeFile(path.join(PUBLICPATH, `sitemap.xsl`), sitemapStylesheet);
};

const serializeMarkdownNodes = (node) => {
    if (!node.slug && !node.fields.slug) {
        throw Error(`\`slug\` is a required field`);
    }

    if (!node.slug) {
        node.slug = node.fields.slug;
        delete node.fields.slug;
    }

    if (node.frontmatter) {
        if (node.frontmatter.published_at) {
            node.published_at = node.frontmatter.published_at;
            delete node.frontmatter.published_at;
        }
        if (node.frontmatter.feature_image) {
            node.feature_image = node.frontmatter.feature_image;
            delete node.frontmatter.feature_image;
        }
    }

    return node;
};

// Compare our node paths with the ones that Gatsby has generated and updated them
// with the "real" used ones.
const getNodePath = (node, allSitePage) => {
    if (!node.path || node.path === `/`) {
        return node;
    }

    const exactMatchRegex = new RegExp(`^${node.path.replace(/\/$/, ``)}$`, `gi`);
    const partialMatchRegex = new RegExp(`${node.path.replace(/\/$/, ``)}$`, `gi`);

    let partialMatch;

    for (let page of allSitePage.edges) {
        if (!page?.node?.url) {
            continue;
        }
        const url = page.node.url.replace(/\/$/, ``);
        if (exactMatchRegex.test(url)) {
            node.path = page.node.url;
            return node;
        }
        if (partialMatchRegex.test(url)) {
            partialMatch = page.node.url;
        }
    }

    if (partialMatch) {
        node.path = partialMatch;
    }

    return node;
};

// Add all other URLs that Gatsby generated, using siteAllPage,
// but we didn't fetch with our queries
const addPageNodes = (parsedNodesArray, allSiteNodes) => {
    const [parsedNodes] = parsedNodesArray;
    const pageNodes = [];
    const addedPageNodes = {pages: []};

    const usedNodes = allSiteNodes.filter(({node}) => {
        let foundOne;
        for (let type in parsedNodes) {
            parsedNodes[type].forEach(((fetchedNode) => {
                if (node.url === fetchedNode.node.path) {
                    foundOne = true;
                }
            }));
        }
        return foundOne;
    });

    const remainingNodes = _.difference(allSiteNodes, usedNodes);

    remainingNodes.forEach(({node}) => {
        addedPageNodes.pages.push({
            url: new URL(node.url, siteURL).toString(),
            node: node
        });
    });

    pageNodes.push(addedPageNodes);

    return pageNodes;
};

const serializeSources = ({mapping, additionalSitemaps = []}) => {
    let sitemaps = [];

    for (let resourceType in mapping) {
        sitemaps.push(mapping[resourceType]);
    }

    sitemaps = _.map(sitemaps, (source) => {
        // Ignore the key and only return the name and
        // source as we need those to create the index
        // and the belonging sources accordingly
        return {
            name: source.name || source.sitemap,
            sitemap: source.sitemap || `pages`
        };
    });

    if (Array.isArray(additionalSitemaps)) {
        additionalSitemaps.forEach((addSitemap, index) => {
            if (!addSitemap.url) {
                throw new Error(`URL is required for additional Sitemap: `, addSitemap);
            }
            sitemaps.push({
                name: `external-${addSitemap.name || addSitemap.sitemap || `pages-${index}`}`,
                url: addSitemap.url
            });
        });
    }

    sitemaps = _.uniqBy(sitemaps, `name`);

    return sitemaps;
};

const runQuery = (handler, {query, mapping, exclude}) => handler(query).then((r) => {
    if (r.errors) {
        throw new Error(r.errors.join(`, `));
    }

    for (let source in r.data) {
        // Check for custom serializer
        if (typeof mapping?.[source]?.serializer === `function`) {
            if (r.data[source] && Array.isArray(r.data[source].edges)) {
                const serializedEdges = mapping[source].serializer(r.data[source].edges);

                if (!Array.isArray(serializedEdges)) {
                    throw new Error(`Custom sitemap serializer must return an array`);
                }
                r.data[source].edges = serializedEdges;
            }
        }

        // Removing excluded paths
        if (r.data?.[source]?.edges && r.data[source].edges.length) {
            r.data[source].edges = r.data[source].edges.filter(({node}) => !exclude.some((excludedRoute) => {
                const sourceType = node.__typename ? `all${node.__typename}` : source;
                const slug = (sourceType === `allMarkdownRemark` || sourceType === `allMdx`) || (node?.fields?.slug) ? node.fields.slug.replace(/^\/|\/$/, ``) : node.slug.replace(/^\/|\/$/, ``);

                excludedRoute = typeof excludedRoute === `object` ? excludedRoute : excludedRoute.replace(/^\/|\/$/, ``);

                // test if the passed regular expression is valid
                if (typeof excludedRoute === `object`) {
                    let excludedRouteIsValidRegEx = true;
                    try {
                        new RegExp(excludedRoute);
                    } catch (e) {
                        excludedRouteIsValidRegEx = false;
                    }

                    if (!excludedRouteIsValidRegEx) {
                        throw new Error(`Excluded route is not a valid RegExp: `, excludedRoute);
                    }

                    return excludedRoute.test(slug);
                } else {
                    return slug.indexOf(excludedRoute) >= 0;
                }
            }));
        }
    }

    return r.data;
});

const serialize = ({...sources} = {}, {site, allSitePage}, {mapping, addUncaughtPages}) => {
    const nodes = [];
    const sourceObject = {};

    siteURL = site.siteMetadata.siteUrl;

    for (let type in sources) {
        if (mapping?.[type]?.sitemap) {
            const currentSource = sources[type] ? sources[type] : [];

            if (currentSource) {
                sourceObject[mapping[type].sitemap] = sourceObject[mapping[type].sitemap] || [];
                currentSource.edges.map(({node}) => {
                    if (!node) {
                        return;
                    }
                    const nodeType = node.__typename ? `all${node.__typename}` : type;
                    if (nodeType === `allMarkdownRemark` || nodeType === `allMdx`) {
                        node = serializeMarkdownNodes(node);
                    }

                    // if a mapping path is set, e. g. `/blog/tag` for tags, update the path
                    // to reflect this. This prevents mapping issues, when we later update
                    // the path with the Gatsby generated one in `getNodePath`
                    if (mapping[type].path) {
                        node.path = path.resolve(mapping[type].path, node.slug);
                    } else {
                        node.path = node.slug;
                    }

                    if (typeof mapping[type].prefix === `string` && mapping[type].prefix !== ``){
                        node.path = mapping[type].prefix + node.path;
                    }

                    // get the real path for the node, which is generated by Gatsby
                    node = getNodePath(node, allSitePage);

                    sourceObject[mapping[type].sitemap].push({
                        url: new URL(node.path, siteURL).toString(),
                        node: node
                    });
                });
            }
        }
    }
    nodes.push(sourceObject);

    // Get all additionally created page URLs that have been generated by Gatsby
    if (addUncaughtPages) {
        const pageNodes = addPageNodes(nodes, allSitePage.edges, siteURL);
        if (pageNodes[0].pages && pageNodes[0].pages.length > 0) {
            if (nodes[0].pages) {
                nodes[0].pages = nodes[0].pages.concat(pageNodes[0].pages);
            } else {
                nodes[0].pages = pageNodes[0].pages;
            }
        }
    }

    nodes[0].pages = _.uniqBy(nodes[0].pages, `url`);

    return nodes;
};

exports.onPostBuild = async ({graphql, pathPrefix}, pluginOptions) => {
    let queryRecords;

    // Passing the config option addUncaughtPages will add all pages which are not covered by passed mappings
    // to the default `pages` sitemap. Otherwise they will be ignored.
    const options = pluginOptions.addUncaughtPages ? _.merge(defaultOptions, pluginOptions) : Object.assign({}, defaultOptions, pluginOptions);

    const indexSitemapFile = path.join(PUBLICPATH, pathPrefix, options.output);
    const resourcesSitemapFile = path.join(PUBLICPATH, pathPrefix, RESOURCESFILE);

    delete options.plugins;
    delete options.createLinkInHead;

    options.indexOutput = options.output;
    options.resourcesOutput = RESOURCESFILE;

    // We always query siteAllPage as well as the site query to
    // get data we need and to also allow not passing any custom
    // query or mapping
    const defaultQueryRecords = await runQuery(
        graphql,
        {query: DEFAULTQUERY, exclude: options.exclude}
    );

    // Don't run this query when no query and mapping is passed
    if (!options.query || !options.mapping) {
        options.mapping = options.mapping || DEFAULTMAPPING;
    } else {
        queryRecords = await runQuery(graphql, options);
    }

    // Instanciate the Ghost Sitemaps Manager
    const manager = new Manager(options);

    await serialize(queryRecords, defaultQueryRecords, options).forEach((source) => {
        for (let type in source) {
            source[type].forEach((node) => {
                // "feed" the sitemaps manager with our serialized records
                manager.addUrls(type, node);
            });
        }
    });

    // The siteUrl is only available after we have the returned query results
    options.siteUrl = siteURL;
    options.pathPrefix = pathPrefix;

    await copyStylesheet(options);

    const resourcesSiteMapsArray = [];

    // Because it's possible to map duplicate names and/or sources to different
    // sources, we need to serialize it in a way that we know which source names
    // we need and which types they are assigned to, independently from where they
    // come from
    options.sources = serializeSources(options);

    options.sources.forEach((type) => {
        if (!type.url) {
            // for each passed name we want to receive the related source type
            resourcesSiteMapsArray.push({
                type: type.name,
                xml: manager.getSiteMapXml(type.sitemap, options)
            });
        }
    });

    const indexSiteMap = manager.getIndexXml(options);

    // Save the generated xml files in the public folder
    try {
        await utils.outputFile(indexSitemapFile, indexSiteMap);
    } catch (err) {
        console.error(err);
    }

    for (let sitemap of resourcesSiteMapsArray) {
        const filePath = resourcesSitemapFile.replace(/:resource/, sitemap.type);

        // Save the generated xml files in the public folder
        try {
            await utils.outputFile(filePath, sitemap.xml);
        } catch (err) {
            console.error(err);
        }
    }

    return;
};
