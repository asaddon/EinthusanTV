#!/usr/bin/env node
const app = require('./index.js')
const {  publishToCentral } = require("stremio-addon-sdk");
const config = require('./config.js');

// create local server
app.listen((config.port), function () {
   // console.log(`Addon active on port ${config.port}`);
    //console.log(`HTTP addon accessible at: ${config.local}/configure`);
});

const manifest = require('./manifest.json');

// Delay publishing by 20 seconds to give Render time to fully boot and route traffic
setTimeout(() => {
    publishToCentral("https://einthusan.asaddon.com/manifest.json")
        .then(() => console.log(`Successfully published v${manifest.version} to Stremio Central!`))
        .catch((e) => console.error("Central publish error (safe to ignore if already published):", e.message));
}, 20000);
