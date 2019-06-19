# gatsby-plugin-advanced-sitemap

The default Gatsby sitemap plugin generates a simple blob of raw XML for all your pages. This **advanced sitemap plugin** adds more power and configuration, generating a single or multiple sitemaps with full XSL templates to make them neatly organised and human + machine readable, as well linking image resources to encourage media indexing.

**Demo:** https://docs.ghost.org/sitemap.xml 


&nbsp;

![example](https://user-images.githubusercontent.com/120485/53555088-d27a0280-3b73-11e9-88ca-fb4ec08d9d26.png)

_NOTE: This plugin only generates output in `production` mode! To test, run: `gatsby build && gatsby serve`_

&nbsp;


## Install

`npm install --save gatsby-plugin-advanced-sitemap`

## How to Use

By default this plugin will generate a single sitemap of all pages on your site, without any configuration needed.

```javascript
// gatsby-config.js

siteMetadata: {
    siteUrl: `https://www.example.com`,
},
plugins: [
    `gatsby-plugin-advanced-sitemap`
]
```

&nbsp;

## Options

If you want to generate advanced, individually organised sitemaps based on your data, you can do so by passing in a query and config. The example below uses [Ghost](https://ghost.org), but this should work with any data source - including Pages, Markdown, Contentful, etc.

**Example:**

```javascript
// gatsby-config.js

plugins: [
    {
        resolve: `gatsby-plugin-advanced-sitemap`,
        options: {
             // 1 query for each data type
            query: `
            {
                allGhostPost {
                    edges {
                        node {
                            id
                            slug
                            updated_at
                            feature_image
                        }
                    }
                }
                allGhostPage {
                    edges {
                        node {
                            id
                            slug
                            updated_at
                            feature_image
                        }
                    }
                }
                allGhostTag {
                    edges {
                        node {
                            id
                            slug
                            feature_image
                        }
                    }
                }
                allGhostAuthor {
                    edges {
                        node {
                            id
                            slug
                            profile_image
                        }
                    }
                }
            }`,
            mapping: {
                // Each data type can be mapped to a predefined sitemap
                // Routes can be grouped in one of: posts, tags, authors, pages
                allGhostPost: {
                    sitemap: `posts`,
                },
                allGhostTag: {
                    sitemap: `tags`,
                },
                allGhostAuthor: {
                    sitemap: `authors`,
                },
                allGhostPage: {
                    sitemap: `pages`,
                },
            },
            exclude: [
                `/dev-404-page`,
                `/404`,
                `/404.html`,
                `/offline-plugin-app-shell-fallback`,
                `/my-excluded-page`,
            ],
            createLinkInHead: true,
        }
    }
]
```

Example output of ☝️ this exact config 👉 https://gatsby.ghost.org/sitemap.xml

&nbsp;

# Copyright & License

Copyright (c) 2019 [Ghost Foundation](https://ghost.org) - Released under the [MIT license](LICENSE).
