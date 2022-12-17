import path from 'path';
import uniqBy from 'lodash/uniqBy';
import merge from 'lodash/merge';

import defaultOptions, { DEFAULTMAPPING, DEFAULTQUERY, PUBLICPATH, RESOURCESFILE, XSLFILE } from './defaults';
import Manager from './SiteMapManager';

import * as utils from './utils';
import { addPageNodes, serializeMarkdownNodes, serializeSources } from './serializers';
import { getNodePath } from './helpers';

let siteURL;

const copyStylesheet = async ({ siteUrl, pathPrefix, indexOutput }) => {
    const siteRegex = /(\{\{blog-url\}\})/g;

    // Get our stylesheet template
    const data = await utils.readFile(XSLFILE);

    // Replace the `{{blog-url}}` variable with our real site URL
    const sitemapStylesheet = data.toString().replace(siteRegex, new URL(path.join(pathPrefix, indexOutput), siteUrl).toString());

    // Save the updated stylesheet to the public folder, so it will be
    // available for the xml sitemap files
    await utils.writeFile(path.join(PUBLICPATH, `sitemap.xsl`), sitemapStylesheet);
};

const runQuery = (handler, { query, mapping, exclude }) => handler(query).then((r) => {
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
            r.data[source].edges = r.data[source].edges.filter(({ node }) => !exclude.some((excludedRoute) => { 
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

const serialize = ({ ...sources } = {}, { site, allSitePage }, { mapping, addUncaughtPages, pathPrefix }) => {
    const nodes = [];
    const sourceObject = {};

    const allSitePagePathNodeMap = new Map();

    allSitePage.edges.forEach((page) => {
        if (page?.node?.url){
            const pathurl = page.node.url.replace(/\/$/,``);
            allSitePagePathNodeMap.set(pathurl, pathurl);
        }
    });

    siteURL = site.siteMetadata.siteUrl;

    for (let type in sources) {
        if (mapping?.[type]?.sitemap) {
            const currentSource = sources[type] ? sources[type] : [];

            if (currentSource) {
                sourceObject[mapping[type].sitemap] = sourceObject[mapping[type].sitemap] || [];
                currentSource.edges.map(({ node }) => {
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
                    node = getNodePath(node, allSitePagePathNodeMap);

                    sourceObject[mapping[type].sitemap].push({
                        url: new URL(path.join(pathPrefix, node.path), siteURL).toString(),
                        node: node,
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

    nodes[0].pages = uniqBy(nodes[0].pages, `url`);

    return nodes;
};

exports.onPostBuild = async ({ graphql, pathPrefix }, pluginOptions) => {
    let queryRecords;

    // Passing the config option addUncaughtPages will add all pages which are not covered by passed mappings
    // to the default `pages` sitemap. Otherwise they will be ignored.
    const options = pluginOptions.addUncaughtPages ? merge(defaultOptions, pluginOptions) : Object.assign({}, defaultOptions, pluginOptions);
    options.pathPrefix = pathPrefix;

    const indexSitemapFile = path.join(PUBLICPATH, options.output);
    const resourcesSitemapFile = path.join(PUBLICPATH, RESOURCESFILE);
    delete options.plugins;
    delete options.createLinkInHead;

    options.indexOutput = options.output;
    options.resourcesOutput = RESOURCESFILE;

    // We always query siteAllPage as well as the site query to
    // get data we need and to also allow not passing any custom
    // query or mapping
    const defaultQueryRecords = await runQuery(
        graphql,
        { query: DEFAULTQUERY, exclude: options.exclude }
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
                xml: manager.getSiteMapXml(type.sitemap, options),
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
