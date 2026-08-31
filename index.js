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

// Track Active Connections
let activeConnections = 0;
app.use((req, res, next) => {
    activeConnections++;
    res.on('close', () => {
        activeConnections--;
    });
    next();
});

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
        path === '/api/setup' || // Allow the new analytics route
        path === '/kv-dashboard' ||
        path === '/api/kv-stats' ||
        path === '/api/cache-explorer' ||
        path === '/api/drop-cache' ||
        path === '/api/cf-analytics' ||
        path.startsWith('/api/kv-keys') ||
        path.startsWith('/api/kv-value') ||
        path === '/einthusan-gate' ||
        path === '/api/gate-auth' ||
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
            res.setHeader('Cache-Control', 'public, max-age=7200, s-maxage=604800, stale-while-revalidate=7200');
            
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

// In-Memory Session Store
const activeSessions = new Set();

app.use('/api/gate-auth', express.json());

// Custom KV Dashboard & Telemetry Endpoint (Secured by Cookie Auth)
const cookieAuth = (req, res, next) => {
    const cookieHeader = req.headers.cookie || '';
    const cookies = Object.fromEntries(cookieHeader.split('; ').map(c => c.split('=')));
    
    if (cookies.auth_token && activeSessions.has(cookies.auth_token)) {
        return next();
    }
    
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect('/einthusan-gate');
};

app.post('/api/gate-auth', (req, res) => {
    const { username, password } = req.body || {};
    const expectedUser = process.env.STATS_USERNAME || 'admin';
    const expectedPass = process.env.STATS_PASSWORD;

    if (username && password && username === expectedUser && password === expectedPass) {
        const token = require('crypto').randomBytes(32).toString('hex');
        activeSessions.add(token);
        res.setHeader('Set-Cookie', `auth_token=${token}; HttpOnly; Path=/; Max-Age=86400`);
        return res.json({ success: true });
    }
    return res.status(401).json({ error: 'Invalid credentials' });
});

app.get('/einthusan-gate', (req, res) => {
    res.sendFile(require('path').join(__dirname, 'public/login.html'));
});

app.get('/kv-dashboard', cookieAuth, (req, res) => {
    res.sendFile(require('path').join(__dirname, 'public/kv-dashboard.html'));
});

app.get('/api/kv-stats', cookieAuth, (req, res) => {
    const stats = sources.cache.getStats();
    const mapSizes = sources.getMapSizes();
    
    // Server Telemetry
    const serverRamMb = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
    const cpuLoad = require('os').loadavg()[0].toFixed(2);
    const uptime = process.uptime();
    
    res.json({ 
        ...stats, 
        ...mapSizes,
        serverRamMb,
        cpuLoad,
        uptime,
        activeConnections
    });
});

app.get('/api/cache-explorer', cookieAuth, (req, res) => {
    res.json(sources.cache.getCacheDump());
});

app.get('/api/drop-cache', (req, res, next) => {
    // 1. Webhook Authentication (for GitHub Actions)
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader === `Bearer ${process.env.CF_API_TOKEN}`) {
        return next(); 
    }
    // 2. Fallback to Dashboard Cookie Authentication (for human users)
    cookieAuth(req, res, next);
}, async (req, res) => {
    try {
        sources.dropAllCaches();
        await sources.triggerCloudflarePurge('API/Dashboard');
        
        // Asynchronously preload from KV to repopulate RAM without waiting for a user request
        setImmediate(() => {
            console.log('Initiating automated KV preload after cache drop...');
            sources.preloadFromKV().catch(e => console.error('Automated KV preload failed:', e.message));
        });

        res.json({ success: true, message: 'All RAM catalogs and L1 caches forcefully dropped, Cloudflare Edge Purge triggered, and KV preload initiated.' });
    } catch (error) {
        console.error('Error dropping cache:', error);
        res.status(500).json({ success: false, error: 'Failed to drop cache.' });
    }
});

// Cloudflare Analytics Route
let cfCache = { data: null, timestamp: 0, dateKey: '' };
app.get('/api/cf-analytics', cookieAuth, async (req, res) => {
    try {
        const todayStr = new Date().toISOString().split('T')[0];
        const start = req.query.start || todayStr;
        const end = req.query.end || todayStr;
        const dateKey = `${start}_${end}`;

        if (cfCache.data && (Date.now() - cfCache.timestamp < 5 * 60 * 1000) && cfCache.dateKey === dateKey) {
            return res.json(cfCache.data);
        }
        
        const data = await sources.cache.getCloudflareAnalytics(start, end);
        if (data && !data.error) {
            const enrichedData = {
                ...data,
                namespaceName: 'einthusantv-cache',
                namespaceId: process.env.CF_KV_NAMESPACE_ID
            };
            cfCache = { data: enrichedData, timestamp: Date.now(), dateKey };
            res.json(enrichedData);
        } else if (data && data.error) {
            res.status(403).json(data);
        } else {
            res.status(500).json({ error: 'Failed to fetch CF Analytics' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/kv-keys', cookieAuth, async (req, res) => {
    if (req.query.type === 'permanent') {
        return res.json({ keys: sources.getPermanentKeys() });
    }
    const keys = await sources.cache.listKVKeys();
    res.json({ keys });
});

app.get('/api/kv-value/:key', cookieAuth, async (req, res) => {
    try {
        if (req.query.type === 'permanent') {
            const val = sources.getPermanentValue(req.params.key);
            if (!val) return res.json({ error: "Key not found in permanent RAM." });
            return res.json({ value: val });
        }
        const val = await sources.cache.get(req.params.key);
        if (val === undefined) {
            return res.json({ error: "Key not found in KV or expired." });
        }
        res.json({ value: sources.decompressData(val) });
    } catch (e) {
        res.json({ error: "Failed to fetch or decompress key: " + e.message });
    }
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
        // max-age=7200 (2 hours) tells the browser/Stremio app to fetch new data after 2 hours
        // s-maxage=604800 (7 days) tells Cloudflare Edge to cache the data for up to 7 days (until purged)
        res.setHeader('Cache-Control', 'public, max-age=7200, s-maxage=604800, stale-while-revalidate=7200');
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
app.post('/api/setup', (req, res) => {
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
        res.setHeader('Cache-Control', 'public, max-age=7200, s-maxage=604800, stale-while-revalidate=7200');
        res.setHeader('Content-Type', 'text/html');
        res.sendFile(path.join(__dirname, 'vue', 'dist', 'index.html'));
    }
});

// Serve manifest.json
app.get('/manifest.json', (_, res) => {
    if (!res.headersSent) {
        res.setHeader('Cache-Control', 'public, max-age=7200, s-maxage=604800, stale-while-revalidate=7200');
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
        res.setHeader('Cache-Control', 'public, max-age=7200, s-maxage=604800, stale-while-revalidate=7200');
        res.setHeader('Content-Type', 'application/json');
        let { rpdbKey, configuration } = req.params;

        // Clean rogue .json extensions from configuration (e.g., /hindi.json/manifest.json)
        if (configuration.endsWith('.json')) {
            configuration = configuration.replace('.json', '');
        }

        const requestedLangs = configuration.split(',');
        const validLangs = requestedLangs.filter(lang => config.langs.includes(lang));



        if (validLangs.length > 0) {
            manifest.behaviorHints.configurationRequired = false;
            const localizedManifest = { ...manifest };
            
            if (validLangs.length === 1) {
                localizedManifest.name = `EinthusanTV - ${capitalizeFirstLetter(validLangs[0])}`;
            }
            let descriptionAddon = ` | Languages: ${validLangs.map(capitalizeFirstLetter).join(', ')}`;
            if (rpdbKey) {
                descriptionAddon += ` | RPDB: ${rpdbKey}`;
            }
            localizedManifest.description = `${manifest.description}${descriptionAddon}`;
            
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

        if (id.startsWith("tt")) {
            const isIndian = await sources.isIndianCinemaTMDB(id);
            if (!isIndian) {
                // Instantly drop non-Indian movie requests, saving Einthusan scrapes
                return res.json({ streams: [] });
            }
        }

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

        if (id.startsWith("einthusan")) {
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

// Dummy route to gracefully block all subtitle requests and silence 404 errors
app.get('*/subtitles/*', (req, res) => {
    return res.json({ subtitles: [] });
});

module.exports = app;