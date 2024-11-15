const express = require("express");
const cors = require('cors');
const path = require('path');
const swStats = require('swagger-stats');
const serveIndex = require('serve-index');
const sources = require("./sources");
const config = require('./config');
const manifest = require("./manifest");

const app = express();
const langs = ["hindi", "tamil", "telugu", "malayalam", "kannada", "bengali", "marathi", "punjabi"];

app.set('trust proxy', true);

// Middleware for Swagger Stats
app.use(swStats.getMiddleware({
    name: manifest.name,
    version: manifest.version,
    authentication: true,
    onAuthenticate: (req, username, password) => {
        const User = process.env.USER || 'stremio';
        const Pass = process.env.PASS || 'stremioIsTheBest';
        return username === User && password === Pass;
    }
}));


// Timeout middleware
app.use((req, res, next) => {
    req.setTimeout(25 * 1000); // Set timeout to 25 seconds
    req.socket.removeAllListeners('timeout');
    req.socket.once('timeout', () => {
        req.timedout = true;
        res.status(504).end();
    });
    if (!req.timedout) next();
});

// Serve logs with cache control
app.use('/logs', 
    (req, res, next) => {
        res.set('Cache-Control', 'no-store');
        next();
    },
    express.static(path.join(__dirname, 'logs'), { etag: false }),
    serveIndex('logs', { icons: true, view: 'details' })
);

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

// Serve configuration-specific manifest.json
app.get('/:configuration?/manifest.json', (req, res) => {
    const { configuration } = req.params;
    res.setHeader('Cache-Control', 'max-age=86400, stale-while-revalidate');
    res.setHeader('Content-Type', 'application/json');

    if (langs.includes(configuration)) {
        manifest.behaviorHints.configurationRequired = false;
        manifest.catalogs = [{
            type: "movie",
            id: configuration,
            name: `EinthusanTV - ${configuration}`,
            extra: [{ name: "search", isRequired: false }]
        }];
        return res.json(manifest);
    }
    
    return res.status(400).send({ error: "Invalid configuration" });
});

// Utility function to set common headers
const setCommonHeaders = (res) => {
    res.setHeader('Cache-Control', 'max-age=86400, stale-while-revalidate');
    res.setHeader('Content-Type', 'application/json');
};

// Handle catalog requests
app.get('/:configuration?/catalog/movie/:id/:extra?.json', async (req, res) => {
    setCommonHeaders(res);
    try {
        const { id, extra, configuration } = req.params;
        let metas;

        // Validate the catalog ID
        const catalogId = langs.includes(id) ? id : id.split('movies')[0];
        if (!langs.includes(catalogId)) {
            return res.status(400).send({ error: "Invalid catalog ID" });
        }

        // Parse extra parameters
        const searchParams = extra ? new URLSearchParams(extra) : null;

        // Handle search if applicable
        if (searchParams && searchParams.has("search")) {
            metas = await sources.search(catalogId, searchParams.get("search"));
        }

        // If no metas found, get recent movies
        if (!metas) {
            metas = await sources.getAllRecentMovies();
        }

        return res.json({ metas });
    } catch (e) {
        console.error(e);
        return res.status(500).send({ error: 'An error occurred while processing your request.' });
    }
});

// Handle movie metadata requests
app.get('/:configuration?/meta/movie/:id/:extra?.json', async (req, res) => {
    setCommonHeaders(res);
    try {
        const { id, configuration } = req.params;
        let meta;

        if (id.startsWith("einthusan_id:") || id.startsWith("tt")) {
            meta = await sources.meta(id, configuration);
        }

        return res.json({ meta: meta || [] });
    } catch (e) {
        console.error(e);
        return res.status(500).send({ error: 'Internal Server Error' });
    }
});

// Handle movie stream requests
app.get('/:configuration?/stream/movie/:id/:extra?.json', async (req, res) => {
    setCommonHeaders(res);
    try {
        const { id, configuration } = req.params;
        let streams;

        if (id.startsWith("einthusan_id:") || id.startsWith("tt")) {
            streams = await sources.stream(id, configuration);
        }

        return res.json({ streams: streams?.streams || [] });
    } catch (e) {
        console.error(e);
        return res.status(500).send({ error: 'Internal Server Error' });
    }
});

module.exports = app;