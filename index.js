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

// Enforce Custom Domain (Block direct Render URL traffic that bypasses Cloudflare WAF)
app.use((req, res, next) => {
    const host = req.get('host') || '';
    if (host.includes('onrender.com')) {
        return res.redirect(301, `https://einthusan.asaddon.com${req.originalUrl}`);
    }
    next();
});

// Strict Allowlist Middleware (Blocks useless bots from polluting logs)
// Drops any request that isn't explicitly an addon route, asset, or dashboard
app.use((req, res, next) => {
    const path = req.path;
    
    // Instantly drop automated vulnerability scanners
    if (path.endsWith('.php') || path.endsWith('.env') || path.includes('.git') || path.includes('admin')) {
        return res.status(403).send('Forbidden');
    }
    
    const isAllowed = 
        path.startsWith('/status') ||
        path.includes('/configure') ||
        path.startsWith('/assets') ||
        path.endsWith('.json') ||
        path === '/favicon.ico' ||
        path === '/robots.txt' ||
        path === '/api/track-install' || // Allow the new analytics route
        path === '/'; // root redirects to /configure

    if (!isAllowed) {
        // Drop the request instantly without logging to swagger-stats
        return res.status(403).send('Forbidden');
    }
    
    // Additional fast-fail for all non-movie types (series, tv, anime, other, etc.)
    // Because this addon is strictly movies only, we instantly return empty arrays for everything else.
    if (path.endsWith('.json')) {
        const isStremioResource = path.includes('/stream/') || path.includes('/meta/') || path.includes('/catalog/');
        const isMissingLanguageSlug = path.startsWith('/stream/') || path.startsWith('/meta/') || path.startsWith('/catalog/');
        
        if (isStremioResource && (!path.includes('/movie/') || isMissingLanguageSlug)) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'max-age=21600, stale-while-revalidate');
            
            if (path.includes('/stream/')) return res.json({ streams: [] });
            if (path.includes('/meta/')) return res.json({ meta: {} });
            if (path.includes('/catalog/')) return res.json({ metas: [] });
        }
    }
    
    next();
});

// Add swagger-stats monitoring (Crash-proof telemetry dashboard)
const swStats = require('swagger-stats');
app.use(swStats.getMiddleware({
    name: 'EinthusanTV Addon',
    version: manifest.version,
    uriPath: '/status', // Map dashboard to /status/ui
    authentication: true,
    onAuthenticate: function(req, username, password) {
        // Basic auth so random people can't snoop your traffic
        return ((username === (process.env.STATS_USERNAME || 'admin')) && (password === process.env.STATS_PASSWORD));
    }
}));

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

// Basic robots.txt to prevent 404 logs
app.get('/robots.txt', (_, res) => {
    res.type('text/plain');
    res.send("User-agent: *\nDisallow: /");
});

// Analytics tracking endpoint for new installs
app.use(express.json()); // Need to parse JSON bodies for the tracker
app.post('/api/track-install', (req, res) => {
    let langs = req.body.languages || 'unknown';
    if (langs !== 'unknown') {
        langs = langs.split(', ').map(l => capitalizeFirstLetter(l.trim())).join(', ');
    }
    const rpdbKey = req.body.rpdbKey || 'None';
    console.log(`\n🎉 [NEW INSTALL] Addon Installed for Languages: ${langs} | RPDB Key: ${rpdbKey}\n`);
    res.status(200).send({ success: true });
});

// Serve index.html with cache control
app.get(['/configure/?', '/:configuration/configure/?', '/:rpdbKey/:configuration/configure/?'], (_, res) => {
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

// Intercept buggy Stremio clients that append /configure/manifest.json
app.get('*/configure/manifest.json', (req, res) => {
    return res.redirect(301, req.originalUrl.replace('/configure', ''));
});

// Serve manifest.json with optional RPDB key
app.get('/:rpdbKey?/:configuration/manifest.json', (req, res) => {
    if (!res.headersSent) {
        res.setHeader('Cache-Control', 'max-age=86400, stale-while-revalidate');
        res.setHeader('Content-Type', 'application/json');
        let { rpdbKey, configuration } = req.params;

        // Clean rogue .json extensions from configuration (e.g., /hindi.json/manifest.json)
        if (configuration.endsWith('.json')) {
            configuration = configuration.replace('.json', '');
        }

        const requestedLangs = configuration.split(',');
        const validLangs = requestedLangs.filter(lang => config.langs.includes(lang));

        const langShortcodes = {
            hindi: 'HI', tamil: 'TA', telugu: 'TE', malayalam: 'ML',
            kannada: 'KN', bengali: 'BN', marathi: 'MR', punjabi: 'PA'
        };

        if (validLangs.length > 0) {
            manifest.behaviorHints.configurationRequired = false;
            const localizedManifest = { ...manifest };
            
            if (validLangs.length === 1) {
                localizedManifest.name = `EinthusanTV - ${capitalizeFirstLetter(validLangs[0])}`;
            } else {
                const shortcodes = validLangs.map(l => langShortcodes[l] || capitalizeFirstLetter(l).substring(0, 2)).join(', ');
                localizedManifest.name = `EinthusanTV - ${shortcodes}`;
            }
            
            localizedManifest.catalogs = [];
            
            for (const lang of validLangs) {
                localizedManifest.catalogs.push({
                    type: "movie",
                    id: lang,
                    name: `EinthusanTV - Search - ${capitalizeFirstLetter(lang)}`,
                    extra: [{ name: "search", isRequired: true }]
                });
                localizedManifest.catalogs.push({
                    type: "movie",
                    id: `${lang}_board`,
                    name: `EinthusanTV - Latest - ${capitalizeFirstLetter(lang)}`,
                    extra: [{ name: "skip", isRequired: false }]
                });
            }
            
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
        const catalogId = id.split('_')[0]; // Extract language from catalog ID
        const requestedLangs = configuration.split(',');

        if (!config.langs.includes(catalogId) || !requestedLangs.includes(catalogId)) {
            // Silently return empty metas instead of a 400 error to prevent Stremio from showing red 'Failed to fetch' toasts
            return res.json({ metas: [] });
        }

        const searchParams = extra ? new URLSearchParams(extra) : null;
        let metas;

        if (searchParams && searchParams.has("search")) {
            metas = await sources.search(catalogId, searchParams.get("search"));
        }

        let isTempCatalog = false;

        if (id === `${catalogId}_board`) {
            metas = await sources.getCachedCatalog(catalogId, 15);

            if (!metas) {
                // If the 15-page catalog is missing (e.g. KV rate limited and no scrape has finished),
                // fall back to a rapid 1-page scrape just to keep the Stremio UI from timing out.
                metas = await sources.getAllRecentMovies(1, catalogId);
                isTempCatalog = true;
                
                // Fire off the full 15-page fetch in the background (if not already running) so the next request gets the full catalog!
                if (!sources.isCatalogFetchInProgress(catalogId, 15)) {
                    setImmediate(() => {
                        console.info(`Triggering background 15-page fetch for ${catalogId} after temporary 1-page serve.`);
                        sources.getAllRecentMovies(15, catalogId, false, false).catch(e => console.error(e));
                    });
                }
            }
        }

        if (!metas) {
            metas = await sources.getAllRecentMovies(15, catalogId);
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
        const requestedLangs = configuration.split(',');
        let allStreams = [];

        if (id.startsWith("einthusan") || id.startsWith("tt")) {
            for (const lang of requestedLangs) {
                if (config.langs.includes(lang)) {
                    const result = await sources.stream(id, lang);
                    if (result && result.streams && result.streams.length > 0) {
                        allStreams.push(...result.streams);
                    }
                }
            }
        }

        //console.log(`Sending response for: ${req.url}`);
        return res.json({ streams: allStreams });
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
        const requestedLangs = configuration.split(',');
        let meta;

        if (id.startsWith("einthusan") || id.startsWith("tt")) {
            for (const lang of requestedLangs) {
                if (config.langs.includes(lang)) {
                    const result = await sources.meta(id, lang);
                    if (result && Object.keys(result).length > 0) {
                        meta = result;
                        break; // Metadata is identical across languages, return first found
                    }
                }
            }
        }

        //console.log(`Sending response for: ${req.url}`);
        return res.json({ meta: meta || {} });
    } catch (e) {
        console.error(`Error in meta request ${req.url}:`, e);
        if (!res.headersSent) {
            return res.status(500).send({ error: 'Internal Server Error' });
        }
    }
});


module.exports = app;