const express = require("express");
const cors = require('cors');
const path = require('path');
const swStats = require('swagger-stats');
const serveIndex = require('serve-index');
const sources = require("./sources");
const config = require('./config');
const manifest = require("./manifest");
require('dotenv').config();
const app = express();
const rateLimit = require('express-rate-limit');
// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});


// Create a global rate limiter
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: "Too many requests from this IP, please try again later.", // Custom message
    keyGenerator: (req, res) => {
        // Use a custom key, e.g., use a user ID or session ID instead of IP
        return req.user ? req.user.id : req.ip; // Adjust as necessary
    },
});

// Apply the rate limiter globally
app.use(globalLimiter);

if (process.env.LOGIN_EMAIL && process.env.LOGIN_PASSWORD) {
    // If login credentials are set, run the login function first
    sources.initializeClientWithSession()
        .then(() => {
            console.log("Login successful. Starting initial fetch of recent movies.");
            // Initial fetch when the server starts
            sources.fetchRecentMoviesForAllLanguages();

            // Schedule the fetch every 12 hours (43200000 milliseconds)
            setInterval(sources.fetchRecentMoviesForAllLanguages, 43200000);
        })
        .catch((error) => {
            console.error("Login failed. Running fetch directly:", error.message);
            // Run fetchRecentMoviesForAllLanguages even if login fails
            sources.fetchRecentMoviesForAllLanguages();

            // Schedule the fetch every 12 hours (43200000 milliseconds)
            setInterval(sources.fetchRecentMoviesForAllLanguages, 43200000);
        });

    // Schedule the login function to run every 24 hours (86400000 milliseconds)
    setInterval(sources.initializeClientWithSession, 86400000);
} else {
    // If login credentials are not set, run the fetch function directly
    console.log('Environment variables LOGIN_EMAIL and LOGIN_PASSWORD are not defined. Running fetch directly.');
    sources.fetchRecentMoviesForAllLanguages();

    // Schedule the fetch every 12 hours (43200000 milliseconds)
    setInterval(sources.fetchRecentMoviesForAllLanguages, 43200000);
}

app.set('trust proxy', true);

// Middleware for Swagger Stats
app.use(swStats.getMiddleware({
    name: manifest.name,
    version: manifest.version,
    uriPath: '/stats',
    authentication: true,
    onAuthenticate: (req, username, password) => {
        const User = process.env.API_USER;
        const Pass = process.env.API_PASS;
        return username === User && password === Pass;
    }
}));

// Timeout middleware
app.use((req, res, next) => {
    req.setTimeout(120 * 1000); // Set timeout to 120 seconds
    req.socket.removeAllListeners('timeout');
    req.socket.once('timeout', () => {
        req.timedout = true;
        res.status(504).end();
    });
    if (!req.timedout) next();
});

// Serve static files
app.use('/configure', express.static(path.join(__dirname, 'vue', 'dist')));
app.use('/assets', express.static(path.join(__dirname, 'vue', 'dist', 'assets')));

// Enable CORS
app.use(cors());

// Redirect root to /configure
app.get('/', (_, res) => res.redirect('/configure/'));

// Serve index.html with cache control
app.get('/:configuration?/configure/', (_, res) => {
    res.setHeader('Cache-Control', 'max-age=86400, stale-while-revalidate');
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, 'vue', 'dist', 'index.html'));
});

// Serve manifest.json
app.get('/manifest.json', (_, res) => {
    res.setHeader('Cache-Control', 'max-age=86400, stale-while-revalidate');
    res.setHeader('Content-Type', 'application/json');
    manifest.behaviorHints.configurationRequired = true;
    manifest.catalogs = [];
    return res.json(manifest);
});

async function updatePosterUrls(metas, rpdbKey) {
    // Check if metas is valid and rpdbKey is provided
    if (!metas || !Array.isArray(metas) || !rpdbKey) return metas;

    // Validate the RPDB key
    const isKeyValid = await validateRPDBKey(rpdbKey);

    // If the key is invalid, return the original metas without modifying poster URLs
    if (!isKeyValid) {
        console.warn('RPDB key is invalid. Poster URLs will not be updated.');
        return metas;
    }

    // If the key is valid, update poster URLs
    for (const meta of metas) {
        if (meta.id && /^tt\d+$/.test(meta.id)) {
            const imdbId = meta.id; // IMDb ID (e.g., tt1234567)
            // Use the RatingPosterDB URL with fallback=true
            meta.poster = `https://api.ratingposterdb.com/${rpdbKey}/imdb/poster-default/${imdbId}.jpg?fallback=true`;
        }
    }

    return metas;
}

// Helper function to validate the RPDB key
async function validateRPDBKey(rpdbKey) {
    try {
        const response = await fetch(`https://api.ratingposterdb.com/${rpdbKey}/isValid`);
        const data = await response.json();
        return data?.valid === true; // Return true if the key is valid
    } catch (e) {
        //console.error('Error validating RPDB key:', e);
        return false; // Return false if validation fails
    }
}

// Utility function to capitalize the first letter
function capitalizeFirstLetter(string) {
    if (!string) return ''; // Handle empty strings
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// Serve manifest.json with optional RPDB key
app.get('/:rpdbKey?/:configuration/manifest.json', (req, res) => {
    const { rpdbKey, configuration } = req.params; // Extract path parameters

    setCommonHeaders(res);

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
                extra: []
            }
        ];

        // Use the RPDB key if provided
        if (rpdbKey) {console.log(`Addon Installed for Language: ${capitalizeFirstLetter(configuration)} with RPDB Key:`, rpdbKey);}
        console.log(`Addon Installed for Language: ${capitalizeFirstLetter(configuration)}`)
        return res.json(localizedManifest);
    }
    return res.status(400).send({ error: "Invalid configuration" });
});

// Utility function to set common headers
const setCommonHeaders = (res) => {
    res.setHeader('Cache-Control', 'max-age=86400, stale-while-revalidate');
    res.setHeader('Content-Type', 'application/json');
};

// Handle catalog requests with optional RPDB key
app.get('/:rpdbKey?/:configuration/catalog/movie/:id/:extra?.json', async (req, res) => {
    setCommonHeaders(res);
    try {
        const { rpdbKey, configuration, id, extra } = req.params;

        let metas;
        const catalogId = config.langs.includes(id) ? id : id.split('_')[0];
        if (!config.langs.includes(catalogId)) {
            return res.status(400).send({ error: "Invalid catalog ID" });
        }

        const searchParams = extra ? new URLSearchParams(extra) : null;

        if (searchParams && searchParams.has("search")) {
            metas = await sources.search(catalogId, searchParams.get("search"));
            //console.log(metas);
        }

        if (!metas) {
            metas = await sources.getAllRecentMovies(15, configuration);
        }

        // Update poster URLs for IMDb IDs using the helper function
        if (metas && Array.isArray(metas) && rpdbKey) {
            metas = await updatePosterUrls(metas, rpdbKey);
        }

        return res.json({ metas });
    } catch (e) {
        console.error(e);
        return res.status(500).send({ error: 'An error occurred while processing your request.' });
    }
});

// Handle movie stream requests with optional RPDB key
app.get('/:rpdbKey?/:configuration/stream/movie/:id/:extra?.json', async (req, res) => {
    setCommonHeaders(res);
    try {
        const { rpdbKey, configuration, id } = req.params;

        let streams;
        if (id.startsWith("einthusan") || id.startsWith("tt")) {
            streams = await sources.stream(id, configuration);
        }

        return res.json({ streams: streams?.streams || [] });
    } catch (e) {
        console.error(e);
        return res.status(500).send({ error: 'Internal Server Error' });
    }
});

// Handle movie meta requests with optional RPDB key
app.get('/:rpdbKey?/:configuration/meta/movie/:id/:extra?.json', async (req, res) => {
    setCommonHeaders(res);
    try {
        const { rpdbKey, configuration, id } = req.params;

        let meta;
        if (id.startsWith("einthusan") || id.startsWith("tt")) {
            meta = await sources.meta(id, configuration);
        }
        return res.json({ meta: meta || [] });
    } catch (e) {
        console.error(e);
        return res.status(500).send({ error: 'Internal Server Error' });
    }
});

module.exports = app;