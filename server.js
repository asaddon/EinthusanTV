#!/usr/bin/env node
const app = require('./index.js')
const {  publishToCentral } = require("stremio-addon-sdk");
const config = require('./config.js');

// create local server
app.listen((config.port), function () {
   // console.log(`Addon active on port ${config.port}`);
    //console.log(`HTTP addon accessible at: ${config.local}/configure`);
});

publishToCentral("https://einthusan.asaddon.com/manifest.json").catch((e)=>{console.error(e)})

