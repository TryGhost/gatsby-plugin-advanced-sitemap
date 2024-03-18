jest.mock(`fs-extra`);

const fs = require(`fs-extra`);
const path = require(`path`);

const { onPostBuild } = require(`../gatsby-node`);
const utils = require(`../utils`);

const basePath = undefined;
const pathPrefix = ``;

beforeEach(() => {
    global.__PATH_PREFIX__ = ``;
});

describe(`Test plugin sitemap`, () => {
    it(`default settings work properly`, async () => {
        utils.writeFile = jest.fn();
        utils.writeFile.mockResolvedValue(true);

        utils.outputFile = jest.fn();
        utils.outputFile.mockResolvedValue(true);

        utils.readFile = jest.fn();
        utils.readFile.mockResolvedValue(true);

        const graphql = jest.fn();

        graphql.mockResolvedValue({
            data: {
                site: {
                    siteMetadata: {
                        siteUrl: `http://dummy.url`,
                    },
                },
                allSitePage: {
                    edges: [
                        {
                            node: {
                                id: 1,
                                slug: `page-1`,
                                url: `http://dummy.url/page-1`,
                            },
                        },
                        {
                            node: {
                                id: 2,
                                slug: `page-2`,
                                url: `http://dummy.url/page-2`,
                            },
                        },
                    ],
                },
            },
        });

        await onPostBuild({ graphql, pathPrefix, basePath }, {});

        const [filePath] = utils.outputFile.mock.calls[0];

        expect(filePath).toEqual(path.join(`public`, `sitemap.xml`));
    });

    it(`custom query runs`, async () => {
        utils.writeFile = jest.fn();
        utils.writeFile.mockResolvedValue(true);

        utils.outputFile = jest.fn();
        utils.outputFile.mockResolvedValue(true);

        utils.readFile = jest.fn();
        utils.readFile.mockResolvedValue(true);

        const graphql = jest.fn();

        graphql.mockResolvedValue({
            data: {
                site: {
                    siteMetadata: {
                        siteUrl: `http://dummy.url`,
                    },
                },
                allSitePage: {
                    edges: [
                        {
                            node: {
                                id: 1,
                                slug: `page-1`,
                                url: `http://dummy.url/page-1`,
                            },
                        },
                        {
                            node: {
                                id: 2,
                                slug: `/exclude-page`,
                                url: `http://dummy.url/post/exclude-page`,
                            },
                        },
                    ],
                },
            },
        });

        const customQuery = `
      {
        site {
          siteMetadata {
            siteUrl
          }
        }

        allSitePage {
          edges {
            node {
              slug: path
            }
          }
        }
    }`;

        const options = {
            output: `custom-sitemap.xml`,
            serialize: edges => edges.map((edge) => {
                edge.node.slug = `/post` + edge.node.slug;

                return edge;
            }),
            exclude: [`/post/exclude-page`],
            query: customQuery,
        };

        await onPostBuild({ graphql, pathPrefix, basePath }, options);

        const [filePath] = utils.outputFile.mock.calls[0];

        expect(filePath).toEqual(path.join(`public`, `custom-sitemap.xml`));
        expect(graphql).toBeCalledWith(customQuery);
    });
});

describe(`sitemap index`, () => {
    let graphql = null;
    const queryResult = {
        data: {
            site: {
                siteMetadata: {
                    siteUrl: `http://dummy.url`,
                },
            },
            allSitePage: {
                edges: [
                    {
                        node: {
                            id: 1,
                            slug: `page-1`,
                            url: `http://dummy.url/page-1`,
                        },
                    },
                    {
                        node: {
                            id: 2,
                            slug: `/exclude-page`,
                            url: `http://dummy.url/post/exclude-page`,
                        },
                    },
                ],
            },
        },
    };
    beforeEach(() => {
        graphql = jest.fn();
        graphql.mockResolvedValue(queryResult);

        fs.createWriteStream.mockReset();
        fs.createWriteStream.mockReturnValue({
            once: jest.fn((event, cb) => cb()),
            write: jest.fn(),
            end: jest.fn(),
        });

        fs.statSync.mockReset();
        fs.statSync.mockReturnValue({
            isDirectory: jest.fn(() => true),
        });
    });

    it(`set Prefix to sitemaps`, async () => {
        const options = {
            prefix: `posts/`,
        };
        utils.renameFile = jest.fn();
        utils.renameFile.mockResolvedValue(true);

        utils.writeFile = jest.fn();
        utils.writeFile.mockResolvedValue(true);

        utils.outputFile = jest.fn();
        utils.outputFile.mockResolvedValue(true);

        await onPostBuild({ graphql, pathPrefix, basePath }, options);
        const [sitemap] = utils.outputFile.mock.calls[0];

        expect(sitemap).toEqual(path.join(`public`, `sitemap.xml`));
    });

    it(`uses basePath instead of pathPrefix`, async () => {
        const basePath = '/blog'
        const pathPrefix = 'https://cdn.example.com/blog'

        utils.writeFile = jest.fn();
        utils.writeFile.mockResolvedValue(true);

        utils.outputFile = jest.fn();
        utils.outputFile.mockResolvedValue(true);

        utils.readFile = jest.fn();
        utils.readFile.mockResolvedValue(true);

        const graphql = jest.fn();

        graphql.mockResolvedValue({
            data: {
                site: {
                    siteMetadata: {
                        siteUrl: `http://dummy.url`,
                    },
                },
                allSitePage: {
                    edges: [
                        {
                            node: {
                                id: 1,
                                slug: `page-1`,
                                url: `http://dummy.url/page-1`,
                            },
                        },
                        {
                            node: {
                                id: 2,
                                slug: `page-2`,
                                url: `http://dummy.url/page-2`,
                            },
                        },
                    ],
                },
            },
        });

        await onPostBuild({ graphql, pathPrefix, basePath }, {});
        const [sitemap] = utils.outputFile.mock.calls[0];

        expect(sitemap).toEqual(path.join(`public`, `blog`, `sitemap.xml`));
    })
});
