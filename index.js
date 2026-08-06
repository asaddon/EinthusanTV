const express = require("express");
const compression = require("compression");
const cors = require('cors');
const path = require('path');
const sources = require("./sources");
const config = require('./config');
const manifest = require("./manifest");
const schedule = require('node-schedule');
require('dotenv').config();

const app = express();
app.use(compression());

// Prevent multiple responses middleware
app.use((req, res, next) => {
    const originalSend = res.send;
    let hasSent = false;

    res.send = function (...args) {
        if (!hasSent) {
            hasSent = true;
            originalSend.apply(res, args);
        } else {
            console.warn('Attempted to send multiple responses for request:', req.url);
        }
        return res;
    };
    next();
});

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', {
        message: err.message,
        stack: err.stack
    });
});

// Constants
const FETCH_INTERVAL = '0 */6 * * *'; // Every 6 hours
const LOGIN_INTERVAL = '0 0 * * *'; // Every 24 hours
const REQUEST_TIMEOUT = 120 * 1000; // 120 seconds

// Initialize and schedule tasks
if (process.env.LOGIN_EMAIL && process.env.LOGIN_PASSWORD) {
    sources.initializeClientWithSession()
        .then(() => {
            console.log("Login successful. Starting initial fetch.");
            sources.fetchRecentMoviesForAllLanguages();

            schedule.scheduleJob(FETCH_INTERVAL, () => {
                sources.fetchRecentMoviesForAllLanguages();
            });

            schedule.scheduleJob(LOGIN_INTERVAL, () => {
                sources.initializeClientWithSession();
            });
        })
        .catch((error) => {
            console.error("Login failed:", error.message);
            sources.fetchRecentMoviesForAllLanguages();
            schedule.scheduleJob(FETCH_INTERVAL, () => {
                sources.fetchRecentMoviesForAllLanguages();
            });
        });
} else {
    console.log('No login credentials. Running fetch directly.');
    sources.fetchRecentMoviesForAllLanguages();
    schedule.scheduleJob(FETCH_INTERVAL, () => {
        sources.fetchRecentMoviesForAllLanguages();
    });
}

// Enable CORS and trust proxy
app.use(cors());
app.set('trust proxy', true);

// Improved timeout middleware
app.use((req, res, next) => {
    req.setTimeout(REQUEST_TIMEOUT);

    req.on('timeout', () => {
        if (!res.headersSent) {
            req.timedout = true;
            res.status(504).end();
        }
    });

    res.on('finish', () => {
        req.timedout = true;
    });

    if (!req.timedout) next();
});

// Serve static files
app.use('/configure', express.static(path.join(__dirname, 'vue', 'dist')));
app.use('/assets', express.static(path.join(__dirname, 'vue', 'dist', 'assets')));

// Utility function to set common headers
const setCommonHeaders = (res) => {
    if (!res.headersSent) {
        res.setHeader('Cache-Control', 'max-age=21600, stale-while-revalidate');
        res.setHeader('Content-Type', 'application/json');
    }
};

// Redirect root to /configure
app.get('/', (_, res) => {
    if (!res.headersSent) res.redirect('/configure/');
});

// Serve index.html with cache control
app.get('/:configuration?/configure/', (_, res) => {
    if (!res.headersSent) {
        res.setHeader('Cache-Control', 'max-age=86400, stale-while-revalidate');
        res.setHeader('Content-Type', 'text/html');
        res.sendFile(path.join(__dirname, 'vue', 'dist', 'index.html'));
    }
});

// Serve manifest.json
app.get('/manifest.json', (_, res) => {
    if (!res.headersSent) {
        res.setHeader('Cache-Control', 'max-age=86400, stale-while-revalidate');
        res.setHeader('Content-Type', 'application/json');
        manifest.behaviorHints.configurationRequired = true;
        manifest.catalogs = [];
        return res.json(manifest);
    }
});

async function updatePosterUrls(metas, rpdbKey) {
    if (!metas || !Array.isArray(metas) || !rpdbKey) return metas;

    const isKeyValid = await validateRPDBKey(rpdbKey);
    if (!isKeyValid) {
        console.warn('RPDB key is invalid. Poster URLs will not be updated.');
        return metas;
    }

    for (const meta of metas) {
        if (meta.id && /^tt\d+$/.test(meta.id)) {
            meta.poster = `https://api.ratingposterdb.com/${rpdbKey}/imdb/poster-default/${meta.id}.jpg?fallback=true`;
        }
    }
    return metas;
}

async function validateRPDBKey(rpdbKey) {
    try {
        const response = await fetch(`https://api.ratingposterdb.com/${rpdbKey}/isValid`);
        const data = await response.json();
        return data?.valid === true;
    } catch (e) {
        //console.error('Error validating RPDB key:', e.message);
        return false;
    }
}

function capitalizeFirstLetter(string) {
    if (!string) return '';
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// Serve manifest.json with optional RPDB key
app.get('/:rpdbKey?/:configuration/manifest.json', (req, res) => {
    if (!res.headersSent) {
        res.setHeader('Cache-Control', 'max-age=86400, stale-while-revalidate');
        res.setHeader('Content-Type', 'application/json');
        const { rpdbKey, configuration } = req.params;

        if (config.langs.includes(configuration)) {
            manifest.behaviorHints.configurationRequired = false;
            const localizedManifest = { ...manifest };
            localizedManifest.name = `EinthusanTV - ${capitalizeFirstLetter(configuration)}`;
            localizedManifest.catalogs = [
                {
                    type: "movie",
                    id: configuration,
                    name: `EinthusanTV - Search - ${capitalizeFirstLetter(configuration)}`,
                    extra: [{ name: "search", isRequired: true }]
                },
                {
                    type: "movie",
                    id: `${configuration}_board`,
                    name: `EinthusanTV - Newly Added - ${capitalizeFirstLetter(configuration)}`,
                    extra: [{ name: "skip", isRequired: false }]
                }
            ];

            console.log(`Addon Installed for Language: ${capitalizeFirstLetter(configuration)}${rpdbKey ? ` with RPDB Key: ${rpdbKey}` : ''}`);
            return res.json(localizedManifest);
        }
        return res.status(400).send({ error: "Invalid configuration" });
    }
});

// Handle catalog requests
app.get('/:rpdbKey?/:configuration/catalog/movie/:id/:extra?.json', async (req, res) => {
    try {
        setCommonHeaders(res);
        //console.log(`Processing catalog request: ${req.url}`);

        const { rpdbKey, configuration, id, extra } = req.params;
        const catalogId = config.langs.includes(id) ? id : id.split('_')[0];

        if (!config.langs.includes(catalogId)) {
            return res.status(400).send({ error: "Invalid catalog ID" });
        }

        const searchParams = extra ? new URLSearchParams(extra) : null;
        let metas;

        if (searchParams && searchParams.has("search")) {
            metas = await sources.search(catalogId, searchParams.get("search"));
        }

        if (!metas) {
            metas = await sources.getAllRecentMovies(15, configuration);
        }

        if (metas && Array.isArray(metas) && rpdbKey) {
            metas = await updatePosterUrls(metas, rpdbKey);
        }

        //console.log(`Sending response for: ${req.url}`);
        return res.json({ metas });
    } catch (e) {
        console.error(`Error in catalog request ${req.url}:`, e);
        if (!res.headersSent) {
            return res.status(500).send({ error: 'An error occurred while processing your request.' });
        }
    }
});

// Handle movie stream requests
app.get('/:rpdbKey?/:configuration/stream/movie/:id/:extra?.json', async (req, res) => {
    try {
        setCommonHeaders(res);
        //console.log(`Processing stream request: ${req.url}`);

        const { rpdbKey, configuration, id } = req.params;
        let streams;

        if (id.startsWith("einthusan") || id.startsWith("tt")) {
            streams = await sources.stream(id, configuration);
        }

        //console.log(`Sending response for: ${req.url}`);
        return res.json({ streams: streams?.streams || [] });
    } catch (e) {
        console.error(`Error in stream request ${req.url}:`, e);
        if (!res.headersSent) {
            return res.status(500).send({ error: 'Internal Server Error' });
        }
    }
});

// Handle movie meta requests
app.get('/:rpdbKey?/:configuration/meta/movie/:id/:extra?.json', async (req, res) => {
    try {
        setCommonHeaders(res);
        //console.log(`Processing meta request: ${req.url}`);

        const { rpdbKey, configuration, id } = req.params;
        let meta;

        if (id.startsWith("einthusan") || id.startsWith("tt")) {
            meta = await sources.meta(id, configuration);
        }

        //console.log(`Sending response for: ${req.url}`);
        return res.json({ meta: meta || [] });
    } catch (e) {
        console.error(`Error in meta request ${req.url}:`, e);
        if (!res.headersSent) {
            return res.status(500).send({ error: 'Internal Server Error' });
        }
    }
});

module.exports = app;