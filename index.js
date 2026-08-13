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

// Ultra-lightweight Status Monitor (0 dependencies, crash-proof)
const os = require('os');
app.get('/status', (req, res) => {
    const mem = process.memoryUsage();
    const ut = process.uptime();
    const days = Math.floor(ut / 86400);
    const hours = Math.floor((ut % 86400) / 3600);
    const minutes = Math.floor((ut % 3600) / 60);
    const seconds = Math.floor(ut % 60);
    const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;

    res.json({
        uptime: uptimeStr,
        memory: {
            rss: `${(mem.rss / 1024 / 1024).toFixed(2)} MB`,
            heapTotal: `${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB`,
            heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        },
        system: {
            freeRam: `${(os.freemem() / 1024 / 1024).toFixed(2)} MB`,
            totalRam: `${(os.totalmem() / 1024 / 1024).toFixed(2)} MB`,
            cpuLoad: os.loadavg()
        }
    });
});

// Redirect favicon.ico requests to the actual Einthusan favicon
app.get('/favicon.ico', (req, res) => res.redirect('https://einthusan.tv/etc/favicon-16x16.png'));

app.use(compression());



// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', {
        message: err.message,
        stack: err.stack
    });
});

// Constants

const LOGIN_INTERVAL = '0 0 * * *'; // Every 24 hours
const REQUEST_TIMEOUT = 120 * 1000; // 120 seconds

// Initialize and schedule tasks
if (process.env.LOGIN_EMAIL && process.env.LOGIN_PASSWORD) {
    sources.initializeClientWithSession()
        .then(() => {
            console.log("Login successful.");
            schedule.scheduleJob(LOGIN_INTERVAL, () => {
                sources.initializeClientWithSession();
            });
        })
        .catch((error) => {
            console.error("Login failed:", error.message);
        });
} else {
    console.log('No login credentials provided. Scraping public pages only.');
}

// Preload all catalogs and id_maps from KV into permanent RAM at startup
// This costs exactly 16 KV GETs once, then zero KV reads for the rest of the server's lifetime
setImmediate(() => {
    sources.preloadFromKV().catch(e => console.error('Startup KV preload failed:', e.message));
});

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

// Fast-fail for TV Series requests (Einthusan is movies only)
app.get('/:rpdbKey?/:configuration/stream/series/:id/:extra?.json', (req, res) => {
    setCommonHeaders(res);
    return res.json({ streams: [] });
});

app.get('/:rpdbKey?/:configuration/meta/series/:id/:extra?.json', (req, res) => {
    setCommonHeaders(res);
    return res.json({ meta: {} });
});

app.get('/:rpdbKey?/:configuration/catalog/series/:id/:extra?.json', (req, res) => {
    setCommonHeaders(res);
    return res.json({ metas: [] });
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

        let isTempCatalog = false;

        if (id === `${configuration}_board`) {
            metas = await sources.getCachedCatalog(configuration, 15);

            if (!metas) {
                // If the 15-page catalog is missing (e.g. KV rate limited and no scrape has finished),
                // fall back to a rapid 1-page scrape just to keep the Stremio UI from timing out.
                metas = await sources.getAllRecentMovies(1, configuration);
                isTempCatalog = true;
                
                // Fire off the full 15-page fetch in the background (if not already running) so the next request gets the full catalog!
                if (!sources.isCatalogFetchInProgress(configuration, 15)) {
                    setImmediate(() => {
                        console.info(`Triggering background 15-page fetch for ${configuration} after temporary 1-page serve.`);
                        sources.getAllRecentMovies(15, configuration, false, false).catch(e => console.error(e));
                    });
                }
            }
        }

        if (!metas) {
            metas = await sources.getAllRecentMovies(15, configuration);
        }

        if (metas && Array.isArray(metas) && rpdbKey) {
            metas = await updatePosterUrls(metas, rpdbKey);
        }

        if (isTempCatalog) {
            res.setHeader('Cache-Control', 'max-age=30, stale-while-revalidate=30');
        }

        // Handle Stremio Pagination for infinite catalogs
        const skip = searchParams && searchParams.has("skip") ? parseInt(searchParams.get("skip"), 10) : 0;
        if (metas && Array.isArray(metas)) {
            metas = metas.slice(skip, skip + 100);
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