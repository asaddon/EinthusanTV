const { parse } = require("node-html-parser");
const config = require('./config');
require('dotenv').config();
const cheerio = require('cheerio');
const axios = require('axios');
const nameToImdb = require("name-to-imdb");
const NodeCache = require("node-cache");
const { promisify } = require('util');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const zlib = require('zlib'); // Import zlib for compression
const useColors = process.env.USE_COLORS === 'true' || false;
// Enhanced caching configuration
const Redis = require("ioredis");

class CacheWrapper {
    constructor() {
        this.useRedis = !!process.env.REDIS_URL;
        if (this.useRedis) {
            let redisUrl = process.env.REDIS_URL.trim();
            // Remove accidental quotes that the user might have copy-pasted
            if (redisUrl.startsWith('"') && redisUrl.endsWith('"')) {
                redisUrl = redisUrl.slice(1, -1);
            } else if (redisUrl.startsWith("'") && redisUrl.endsWith("'")) {
                redisUrl = redisUrl.slice(1, -1);
            }
            this.redis = new Redis(redisUrl);
            console.log("Connected to Redis Cache.");
        } else {
            this.localCache = new NodeCache({
                stdTTL: 30 * 60,
                checkperiod: 60 * 60,
                useClones: false,
                maxKeys: 10000
            });
            console.log("Using Local NodeCache.");
        }
    }

    async get(key) {
        if (this.useRedis) {
            try {
                const val = await this.redis.getBuffer(key);
                if (!val) return undefined;
                // Check if it's a gzipped buffer (starts with 1F 8B)
                if (val.length >= 2 && val[0] === 0x1f && val[1] === 0x8b) {
                    return val;
                }
                return val.toString('utf8');
            } catch (err) {
                console.error("Redis Get Error:", err.message);
                return undefined;
            }
        }
        return this.localCache.get(key);
    }

    async set(key, value, ttlSeconds = 1800) {
        if (this.useRedis) {
            try {
                if (Buffer.isBuffer(value)) {
                    await this.redis.set(key, value, "EX", ttlSeconds);
                } else {
                    await this.redis.set(key, String(value), "EX", ttlSeconds);
                }
            } catch (err) {
                console.error("Redis Set Error:", err.message);
            }
        } else {
            this.localCache.set(key, value, ttlSeconds);
        }
    }
}
const cache = new CacheWrapper();
// Function to fetch recent movies for all languages
let isFirstRun = true;
const fetchRecentMoviesForAllLanguages = async (maxPages = 15) => {
    const results = {};
    let newMoviesAdded = false; // Track if new movies were added during this run

    const fetchMoviesForLanguage = async (lang) => {
        const cacheKey = `recent_movies_${lang}_${maxPages}`;
        const cached = await cache.get(cacheKey);

        if (cached) {
            const cachedMovies = decompressData(cached);
            let newMovies = [];

            try {
                newMovies = await getAllRecentMovies(2, lang, false, true);
            } catch (error) {
                console.error(`Error fetching new movies for ${lang}:`, error);
            }

            const uniqueNewMovies = newMovies.filter(
                (newMovie) => !cachedMovies.some((cachedMovie) => cachedMovie.EinthusanID === newMovie.EinthusanID)
            );

            if (uniqueNewMovies.length > 0) {
                const updatedCache = uniqueNewMovies.concat(cachedMovies);
                await cache.set(cacheKey, compressData(updatedCache), 604800);
                console.info(`Added ${uniqueNewMovies.length} new movies for ${capitalizeFirstLetter(lang)}`);
                results[lang] = updatedCache;
                newMoviesAdded = true; // Mark that new movies were added
            } else {
                results[lang] = cachedMovies;
            }
        } else {
            try {
                results[lang] = await getAllRecentMovies(maxPages, lang, false);
                await cache.set(cacheKey, compressData(results[lang]), 604800);
                newMoviesAdded = true; // Mark that new movies were added (since cache was empty)
            } catch (error) {
                console.error(`Error fetching movies for language ${lang}:`, error);
                results[lang] = [];
            }
        }
    };

    try {
        for (const lang of config.langs) {
            await fetchMoviesForLanguage(lang);
        }

        // Log final summary only on the first run or if new movies are found
        if (isFirstRun || newMoviesAdded) {
            console.info(`=== Final Summary ===`);
            Object.entries(results).forEach(([lang, movies]) => {
                console.info(`Fetched ${movies.length} recent movies in ${capitalizeFirstLetter(lang)}`);
            });
        }

        isFirstRun = false; // Mark first run as complete after the first execution
        return results;
    } catch (error) {
        console.error("Error Fetching Movies For All Languages:", error);
        return {};
    }
}

const jar = new CookieJar();

// Render Refresh Start
const renderUrl = 'https://einthusantv-k9mh.onrender.com/';
const interval = 10 * 60 * 1000; // 10 minutes in milliseconds
const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Karachi', timeZoneName: 'long' };

setInterval(async () => {
    try {
      const date = new Date();
      const res = await axios.get(renderUrl);
      console.info(`Reloaded at ${date.toLocaleString('en-US', options)}: Status ${res.status}`);
    } catch (err) {
      console.error(`Error at ${date.toLocaleString('en-US', options)}: (${err.message})`);
    }
  }, interval);
  
// Render Refresh End
// Compression and Decompression Functions
const compressData = (data) => {
    return zlib.deflateSync(JSON.stringify(data)).toString('base64');
};

const decompressData = (data) => {
    return JSON.parse(zlib.inflateSync(Buffer.from(data, 'base64')).toString());
};
// Create axios instance with optimized settings
const client = wrapper(axios.create({
    baseURL: config.BaseURL, // Replace with your base URL
    timeout: 1200000,
    headers: {
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
    },
        // Attach the cookie jar
    jar,
    withCredentials: true, // Ensure cookies are sent with requests
    // Implement retry logic
    retries: 3,
    retryDelay: (retryCount) => retryCount * 1000
}));

async function initializeClientWithSession() {
    const email = process.env.LOGIN_EMAIL;
    const password = process.env.LOGIN_PASSWORD;

    if (!email || !password) {
        throw new Error("Missing credentials. Set LOGIN_EMAIL and LOGIN_PASSWORD in .env file.");
    }

    try {
        const loginUrl = "/login/";
        let loginPageResponse;
        try {
            loginPageResponse = await client.get(loginUrl);
        } catch (err) {
            throw new Error(`Failed to fetch login page: ${err.message}`);
        }

        const $ = cheerio.load(loginPageResponse.data);
        const csrfToken = $('html').attr('data-pageid');
        if (!csrfToken) throw new Error('CSRF token not found in the login page.');

        const loginPayload = new URLSearchParams({
            xEvent: 'Login',
            xJson: JSON.stringify({ Email: email, Password: password }),
            tabID: 'vwmSPyo0giMK9nETr0vMMrE/dIBvZQ6a11v+i2kVk6/t7UCLFWORSxePRTDTpRTAeuu/D/9t32a7lO3aJNo7EA==25',
            'gorilla.csrf.Token': csrfToken,
        });

        const ajaxLoginUrl = "/ajax/login/";
        let loginResponse;
        try {
            loginResponse = await client.post(ajaxLoginUrl, loginPayload.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Origin': 'https://einthusan.tv',
                    'Referer': 'https://einthusan.tv/login/',
                    'User-Agent': 'Mozilla/5.0',
                },
            });
        } catch (err) {
            throw new Error(`Login request failed: ${err.message}`);
        }

        if (loginResponse.data.Event === 'redirect') {
            const accountUrl = loginResponse.data.Data;
            let accountResponse;
            try {
                accountResponse = await client.get(accountUrl);
            } catch (err) {
                throw new Error(`Failed to fetch account page: ${err.message}`);
            }

            const $account = cheerio.load(accountResponse.data);
            const accountDetails = {
                username: $account('div.profile div.header div div.quickinfo h2').text().trim(),
                email: $account('div.profile div.header div div.quickinfo p.e-addr').text().trim(),
                ipaddr: $account('.details div:contains("IP Addr") p').text().trim(),
                location: $account('.details div:contains("Location") p').text().trim(),
            };

            console.log("Account details:", accountDetails);
            return accountDetails;
        } else {
            throw new Error("Login failed: " + (loginResponse.data.message || "Unknown error"));
        }
    } catch (error) {
        console.error("Login failed:", error.message);
        throw error;
    }
}


// Add retry interceptor
client.interceptors.response.use(undefined, async (err) => {
    const config = err.config;
    if (!config || !config.retries) return Promise.reject(err);

    config.retryCount = config.retryCount ?? 0;
    if (config.retryCount >= Math.min(config.retries, 5)) {  // Cap retries at 5
        console.error(`Request failed after ${config.retryCount} retries:`, err);
        return Promise.reject(err); // Ensure the error is thrown
    }

    config.retryCount += 1;
    const delay = Math.min(config.retryDelay(config.retryCount) || 1000, 10000);
    console.info(`Retrying request... Attempt ${config.retryCount} after ${delay} ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return client(config);
});



// Promisify nameToImdb for better async handling
const getImdbIdAsync = promisify(nameToImdb);

// Function to decode HTML entities
const decodeHtmlEntities = (str) => str.replace(/&(?:#(\d+);|([a-zA-Z0-9]+);)/g, (match, num, name) => {
    if (num) {
        return String.fromCharCode(num); // Numeric entities (e.g., &#39;)
    }
    const entityMap = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®' };
    return entityMap[name] || match; // Named entities (e.g., &amp;)
});


function capitalizeFirstLetter(string) {
    if (!string) return string; // Handle empty string case
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// Optimized title normalization
const normalizeTitle = (str) => str.toLowerCase().replace(/[\s\W_]+/g, '');

// Implement request queue to prevent rate limiting
class RequestQueue {
    constructor(concurrency = 5) {
        this.queue = [];
        this.running = 0;
        this.concurrency = concurrency;
    }

    async add(fn) {
        if (this.running >= this.concurrency) {
            //console.info('Request Queue is Full. Waiting For Available Slots...');
            await new Promise(resolve => this.queue.push(resolve));
        }
        this.running++;
        try {
            return await fn();
        } finally {
            this.running--;
            if (this.queue.length > 0) {
                const next = this.queue.shift();
                next();
            }
        }
    }
}

async function verifyImdbTitle(title, year) {
    try {
        const imdbId = await getImdbId(title, year).catch(() => null);
        if (!imdbId) return false;

        const fetchedTitle = await ttnumberToTitle(imdbId).catch(() => null);
        if (!fetchedTitle) return false;

        // Extract the first word from both titles
        const inputFirstWord = title.split(/\s+/)[0].toLowerCase();
        const fetchedFirstWord = fetchedTitle.split(/\s+/)[0].toLowerCase();

        // Check if the first words match exactly
        if (inputFirstWord === fetchedFirstWord) {
            //console.info(`Match Found: The title "${title}" matches the fetched title "${fetchedTitle}" for IMDb ID "${imdbId}".`);
            return imdbId; // Return IMDb ID if the first words match
        }

        // If the first words are different but we want to avoid false positives, we can further refine the logic
        // Example: Don't match numbers with words or completely different titles.
        if (inputFirstWord === fetchedFirstWord || 
            (isNaN(inputFirstWord) && isNaN(fetchedFirstWord) && inputFirstWord.toLowerCase().startsWith(fetchedFirstWord)) || 
            (inputFirstWord.toLowerCase() === fetchedFirstWord.toLowerCase())) {
            //console.warn(`Relaxed Match: The title "${title}" does not perfectly match the fetched title "${fetchedTitle}" but the first words align based on starting letter. Accepting as a match.`);
            return imdbId;// Adjusted to reject false positives more effectively
        }

        // If no match found
        return null;
    } catch (err) {
        //console.error(`Error in verifyImdbTitle: ${err.message}`);
        return null; // Return null if there is an error
    }
}

const requestQueue = new RequestQueue();

// Optimized IMDb ID fetching
async function getImdbId(title, year) {
    if (typeof title !== 'string' || !title.trim()) {
        console.error('Invalid Title Provided.');
        return null;
    }
    const cleanedTitle = title.replace(/\s?\(.*?\)$/, '').replace(/#/g, '').trim();

    if (year !== undefined) {
        year = Number(year);
        if (isNaN(year) || year < 1888 || year > new Date().getFullYear()) {
            console.error('Invalid Year Provided. Year Must Be A Number Between 1888 And The Current Year.');
            return null;
        }
    }

    const cacheKey = `imdb_${normalizeTitle(cleanedTitle)}_${year || 'any'}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
        //console.log(`Cache Hit For IMDb ID: ${cleanedTitle} ${year ? `(${year})` : ''}`);
        return decompressData(cached);
    }

    try {
        const result = await getImdbIdAsync({ name: cleanedTitle, year: year }).catch((err) => {
            console.error(`Error Fetching IMDb ID For "${cleanedTitle}":`, err.message);
            return null;
        });

        if (result) {
            //console.log(`Fetched IMDb ID: ${result} For Title: "${cleanedTitle}"${year ? ` (${year})` : ''}`);
            await cache.set(cacheKey, compressData(result));
            return result;  // Return the result immediately after caching
        }
        //console.warn(`${useColors ? '\x1b[33m' : ''}IMDB ID Not Found For Cleaned Title: ${useColors ? '\x1b[0m' : ''}${useColors ? '\x1b[36m' : ''}"${cleanedTitle}"${useColors ? '\x1b[0m' : ''}${cleanedTitle !== title ? `${useColors ? '\x1b[33m' : ''} Original Title: ${useColors ? '\x1b[36m' : ''}"${title}"${useColors ? '\x1b[0m' : ''}` : ''}${year ? ` ${useColors ? '\x1b[33m' : ''}(${year})${useColors ? '\x1b[0m' : ''}` : ''}`);
        return null;
    } catch (err) {
        console.error(`Error Fetching IMDb ID For "${cleanedTitle}":`, err.message);
        return null;
    }
}

// Create a promise cache
const promiseCache = new Map();

async function ttnumberToTitle(ttNumber, retries = 5) {
    if (!/^tt\d{7,8}$/.test(ttNumber)) {
        throw new Error('Invalid IMDb ID format.');
    }

    if (promiseCache.has(ttNumber)) {
        return promiseCache.get(ttNumber);
    }

    const fetchPromise = (async () => {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                let title = await fetchFromIMDbApi(ttNumber) || 
                            await fetchFromCinemeta(ttNumber) || 
                            await fetchFromIMDbPage(ttNumber);
                if (title) return title;
                throw new Error('No title found on IMDb API, Cinemeta, or IMDb Page');
            } catch (err) {
                if (attempt < retries) {
                    await sleep(2000);
                } else {
                    console.warn(`Failed to fetch title for IMDb ID: ${ttNumber} after ${retries} attempts`);
                    throw err;
                }
            }
        }
    })();

    promiseCache.set(ttNumber, fetchPromise);

    return fetchPromise
        .catch((error) => {
            console.warn(`Failed to fetch title for IMDb ID: ${ttNumber}`, error.message);
            promiseCache.delete(ttNumber); // Remove failed promise from cache
            throw error;
        })
        .finally(() => promiseCache.delete(ttNumber)); // Ensure cleanup
}


async function fetchFromIMDbApi(ttNumber) {
    const imdbApiUrl = `https://v2.sg.media-imdb.com/suggestion/t/${ttNumber}.json`;
    try {
        const imdbResponse = await axios.get(imdbApiUrl, { timeout: 10000 });
        const movie = imdbResponse.data.d.find(item => item.id === ttNumber);
        return movie?.l || null;
    } catch (err) {
        //console.warn(`IMDb API failed: ${err.message}`);
        return null;
    }
}

async function fetchFromCinemeta(ttNumber) {
    const cinemetaApiUrl = `https://v3-cinemeta.strem.io/meta/movie/${ttNumber}.json`;
    try {
        const cinemetaResponse = await axios.get(cinemetaApiUrl, { timeout: 10000 });
        return cinemetaResponse.data.meta?.name || null;
    } catch (err) {
        //console.warn(`Cinemeta API failed: ${err.message}`);
        return null;
    }
}

async function fetchFromIMDbPage(ttNumber) {
    const imdbUrl = `https://www.imdb.com/title/${ttNumber}/`;
    try {
        const imdbPageResponse = await axios.get(imdbUrl, {
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        const $ = cheerio.load(imdbPageResponse.data);
        const imdbTitle = $('title').text();
        return imdbTitle ? imdbTitle.replace(/ \(.*\)/, '').split('IMDb')[0].trim() : null;
    } catch (err) {
        //console.warn(`IMDb Page Scraping failed: ${err.message}`);
        return null;
    }
}


// Optimized IP replacement
const replaceIpInLink = (link) => {
    //console.log(`Original link: ${link}`);
    const updatedLink = link.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/, 'cdn1.einthusan.io');
    //console.log(`Updated link: ${updatedLink}`);
    return updatedLink;
};

// Optimized stream function
async function stream(einthusan_id, lang) {
    if (typeof lang === 'undefined') {
        console.error("Error: 'lang' Parameter Is Undefined.");
        return;
    }

    const imdb = einthusan_id;
    const cacheKey = `stream_${einthusan_id}_${lang}`;
    const cached = await cache.get(cacheKey);

    if (cached) {
        const cachedResult = decompressData(cached);
        const cachedTitle = cachedResult.streams[0].title;
        console.info(`${useColors ? '\x1b[32m' : ''}Cache Hit For Stream:${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[36m' : ''}${cachedTitle.replace(/\n/g, ' ')}${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[33m' : ''}(${einthusan_id})${useColors ? '\x1b[0m' : ''}`);
        return cachedResult;
    }

    try {
        let title;
        let validEinthusanId = false;

        if (einthusan_id.startsWith("tt")) {
            let mappedEinthusanId = await cache.get(`ttToEinthusan_${einthusan_id}`);

            if (!mappedEinthusanId) {
                // Fallback to checking the 15-page cache if the direct map isn't found
                const cacheKeyForMovies = `recent_movies_${lang}_15`;
                const cachedMovies = await cache.get(cacheKeyForMovies);

                if (cachedMovies) {
                    const movies = decompressData(cachedMovies);
                    const movie = movies.find(m => m.id === einthusan_id);
                    if (movie) {
                        mappedEinthusanId = movie.EinthusanID;
                        await cache.set(`ttToEinthusan_${einthusan_id}`, mappedEinthusanId, 604800);
                    }
                }
            }

            if (mappedEinthusanId) {
                einthusan_id = mappedEinthusanId;
            } else {
                // Handle ttnumberToTitle promise locally
                const imdbTitle = await ttnumberToTitle(einthusan_id).catch(() => null);
                if (!imdbTitle) return;

                // Handle getEinthusanIdByTitle promise locally
                einthusan_id = await getEinthusanIdByTitle(imdbTitle, lang, einthusan_id).catch(() => null);
                if (typeof einthusan_id === 'undefined') {
                    throw new Error(`Einthusan ID could not be retrieved for Title: ${imdbTitle} in Language: ${capitalizeFirstLetter(lang)}`);
                }
            }
        } else {
            // If einthusan_id is not a ttnumber (IMDB ID), assume it's already an Einthusan ID
            einthusan_id = einthusan_id.replace("einthusan_", "");
            //console.info(`Using provided Einthusan ID: ${einthusan_id}`);
        }
        if (!einthusan_id) return;
        const url = `${config.BaseURL}/movie/watch/${einthusan_id}/`;

        // Handle requestQueue promise locally
        const response = await requestQueue.add(() => client.get(url)).catch((err) => {
            throw new Error(`Failed to fetch movie details: ${err.message}`);
        });

        const $ = cheerio.load(response.data);
        const videoSection = $('#UIVideoPlayer');
        if (!videoSection.length) throw new Error(`Video player section not found using URL: ${url}`);

        title = videoSection.attr("data-content-title");
        const year = $('#UIMovieSummary div.info p').contents().first().text().trim();
        const mp4Link = replaceIpInLink(videoSection.attr('data-mp4-link'));

        if (!mp4Link) throw new Error("No video source found");

        const languageCheck = $('#UIMovieSummary div.info p').text().toLowerCase();
        if (!languageCheck.includes(lang.toLowerCase())) {
            throw new Error(`The Einthusan ID: ${einthusan_id} is not valid for the language: ${lang}`);
        }

        validEinthusanId = true;

        const capitalizedLang = capitalizeFirstLetter(lang);
        const result = {
            streams: [{
                url: mp4Link,
                name: `Einthusan ⚡️`,
                title: `🍿 ${title} (${year})\n🌐 ${capitalizedLang}`
            }]
        };

        console.info(`${useColors ? '\x1b[32m' : ''}Stream Fetched Successfully For:${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[36m' : ''}${title}${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[33m' : ''}(${year})${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[31m' : ''}(EinthusanID: ${einthusan_id} and imdbID: ${imdb})${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[32m' : ''}In Language:${useColors ? '\x1b[0m' : ''} ${capitalizedLang}`);

        await cache.set(cacheKey, compressData(result), 3600);
        return result;
    } catch (err) {
        // Handle specific and general errors
        if (err.message.includes("Einthusan ID could not be retrieved") || err.message.includes("is not valid for the language")) {
            // Handle specific case (suppress logging or take other actions)
        } else {
            console.error("Error in Stream Function:", err.message);
        }
    }
}

async function search(lang, slug) {
    if (!lang || !slug) {
        //console.error("Error: Missing 'lang' or 'slug' parameter.");
        return null;
    }

    try {
        const url = `/movie/results/?lang=${lang}&query=${encodeURIComponent(slug)}`;
        const results = await getcatalogresults(url);
        return results;
    } catch (err) {
        console.error("Error in search function:", err.message, { lang, slug });
        return null;
    }
}

// Optimized catalog results fetching
async function getcatalogresults(url) {
    try {
        const response = await requestQueue.add(() => client.get(url));
        const html = parse(response.data);
        const searchResults = html.querySelector("#UIMovieSummary")?.querySelectorAll("li") || [];

        const batchSize = 10;
        const resultsArray = [];

        for (let i = 0; i < searchResults.length; i += batchSize) {
            const batch = searchResults.slice(i, i + batchSize);
            const batchPromises = batch.map(async (item) => {
                try {
                    const imgElement = item.querySelector("div.block1 a img");
                    const infoElement = item.querySelector("div.info p");
                    const titleElement = item.querySelector("a.title h3");
                    const idElement = item.querySelector("a.title");
                    const ttElement = item.querySelectorAll("div.extras a")[0];
                    const synopsisElement = item.querySelector("p.synopsis");
                    const trailerElement = item.querySelectorAll("div.extras a")[1];

                    if (!imgElement || !infoElement || !titleElement || !idElement || !ttElement) return null;

                    const img = imgElement.rawAttributes?.src || null;
                    const year = infoElement.childNodes[0]?.rawText.trim() || null;
                    const title = titleElement.rawText ? decodeHtmlEntities(titleElement.rawText.trim()) : null;
                    const einthusanId = idElement.rawAttributes?.href?.split('/')[3] || null;
                    const ttNumber = ttElement?.rawAttributes['href']?.match(/tt\d+/)?.[0] || null;

                    if (!img || !year || !title || !einthusanId) return null;

                    let imdbId = ttNumber; // Default to ttNumber
                    if (!imdbId) {
                        imdbId = await verifyImdbTitle(title, year).catch(() => null);
                    }

                    const finalId = imdbId || `einthusan_${einthusanId}`;
                    if (imdbId) await cache.set(`ttToEinthusan_${imdbId}`, einthusanId, 604800);

                    const description = synopsisElement ? decodeHtmlEntities(synopsisElement.rawText.trim()) : null;
                    const trailer = trailerElement?.rawAttributes['href']?.split("v=")[1] || null;

                    const castAndRoles = Array.from(item.querySelectorAll("div.prof")).map(prof => {
                        const name = prof.querySelector("p")?.rawText.trim() || null;
                        const role = prof.querySelector("label")?.rawText.trim() || null;
                        return name && role ? { name, role } : null;
                    }).filter(Boolean);

                    const directors = castAndRoles.filter(item => item.role.toLowerCase() === "director").map(item => item.name) || [];
                    const actors = castAndRoles.filter(item => !["director", "writer"].includes(item.role.toLowerCase())).map(item => item.name) || [];

                    const posterUrl = img.startsWith('http') ? img : `https:${img}`;

                    return {
                        id: finalId,
                        EinthusanID: einthusanId,
                        type: "movie",
                        name: title,
                        poster: posterUrl,
                        releaseInfo: year,
                        description,
                        trailers: trailer ? [{ source: trailer, type: "Trailer" }] : [],
                        links: [
                            ...actors.map(actor => ({
                                name: actor,
                                category: "Cast",
                                url: `stremio:///search?search=${encodeURIComponent(actor)}`
                            })),
                            ...directors.map(director => ({
                                name: director,
                                category: "Directors",
                                url: `stremio:///search?search=${encodeURIComponent(director)}`
                            })),
                        ]
                    };
                } catch (err) {
                    console.error(`Error processing movie on page:`, err.message);
                    return null; // Skip this movie and continue
                }
            });

            const batchResults = await Promise.all(batchPromises);
            resultsArray.push(...batchResults.filter(Boolean));
        }

        return resultsArray;
    } catch (err) {
        console.error("Error in GetCatalogResults Function:", err.message);
        return []; // Return an empty array to avoid crashing
    }
}


// Optimized function to get Einthusan ID by title
async function getEinthusanIdByTitle(title, lang, ttnumber) {
    if (!title || !lang) {
        //console.error("Error: Missing 'title' or 'lang' parameter.");
        return null;
    }

    const cacheKey = `einthusan_${normalizeTitle(title)}_${lang}`;
    const cached = await cache.get(cacheKey);
    if (cached) return decompressData(cached);

    try {
        const url = `/movie/results/?lang=${lang}&query=${encodeURIComponent(title)}`;
        const results = await getcatalogresults(url);
        if (!Array.isArray(results) || results.length === 0) {
            //console.warn(`No results found for "${title}" in language "${lang}".`);
            return null;
        }

        if (ttnumber) {
            const matchByTTNumber = results.find(movie => movie.id === ttnumber);
            if (matchByTTNumber) {
                await cache.set(cacheKey, compressData(matchByTTNumber.EinthusanID));
                return matchByTTNumber.EinthusanID;
            }
        }

        const normalizedSearchTitle = normalizeTitle(title);
        const match = results.find(movie => normalizeTitle(movie.name) === normalizedSearchTitle);
        if (match) {
            await cache.set(cacheKey, compressData(match.EinthusanID));
            return match.EinthusanID;
        }

        //console.warn(`No exact match found for "${title}" in language "${lang}".`);
        return null;
    } catch (err) {
        console.error(`Error in getEinthusanIdByTitle: ${err.message}`);
        return null;
    }
}

const pendingFetches = new Map();

// Optimized function to get all recent movies with parallel processing
async function getAllRecentMovies(maxPages, lang, logSummary = false, forceFetch = false) {
    const cacheKey = `recent_movies_${lang}_${maxPages}`;
    let cached = null;
    if (!forceFetch) cached = await cache.get(cacheKey); // Skip cache if forceFetch is true

    if (cached) {
        if (logSummary) {
            console.log(`${useColors ? '\x1b[32m' : ''}Cache Hit For Recent Movies:${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[36m' : ''}${capitalizeFirstLetter(lang)}${useColors ? '\x1b[0m' : ''}, ${useColors ? '\x1b[33m' : ''}Max Pages:${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[32m' : ''}${maxPages}${useColors ? '\x1b[0m' : ''}`);
        }
        return decompressData(cached);
    }

    if (!forceFetch && pendingFetches.has(cacheKey)) {
        console.info(`${useColors ? '\x1b[33m' : ''}Fetch already in progress for ${lang}, waiting for completion...${useColors ? '\x1b[0m' : ''}`);
        return pendingFetches.get(cacheKey);
    }

    const fetchPromise = (async () => {
        try {
            console.info(`${useColors ? '\x1b[33m' : ''}Fetching All Recent Movies For Language: ${useColors ? '\x1b[0m' : ''}${useColors ? '\x1b[36m' : ''}${capitalizeFirstLetter(lang)}${useColors ? '\x1b[0m' : ''}${useColors ? '\x1b[33m' : ''}, Max Pages: ${useColors ? '\x1b[0m' : ''}${useColors ? '\x1b[32m' : ''}${maxPages}${useColors ? '\x1b[0m' : ''}`);

        const fetchPage = async (page, retries = 10) => {
            const pageUrl = `/movie/results/?find=Recent&lang=${lang}&page=${page}`;

            try {
                const response = await requestQueue.add(() => client.get(pageUrl, { timeout: 10000 })); // Increased timeout to 10 seconds
                if (response.status === 200) {
                    const body = response.data;
                    if (body.includes('<title>Rate Limited - Einthusan</title>')) {
                        await sleep(5000); // Wait for 5 seconds
                        return fetchPage(page, lang, retries);
                    }
                }

                if (!response.data || response.data.trim().length === 0) {
                    console.warn(`Empty response data for page ${page}.`);
                    return [];
                }

                const html = parse(response.data);
                const searchResults = html.querySelector("#UIMovieSummary")?.querySelectorAll("li") || [];

                if (searchResults.length === 0) {
                    console.warn(`No movie results found on page ${page}.`);
                }

                const movies = [];
                const chunkSize = 2;
                const searchResultsArray = Array.from(searchResults);
                for (let i = 0; i < searchResultsArray.length; i += chunkSize) {
                    const chunk = searchResultsArray.slice(i, i + chunkSize);
                    const chunkResults = await Promise.all(
                        chunk.map(async (item) => {
                            try {
                                const imgElement = item.querySelector("div.block1 a img");
                                const infoElement = item.querySelector("div.info p");
                                const titleElement = item.querySelector("a.title h3");
                                const idElement = item.querySelector("a.title");
                                const ttElement = item.querySelectorAll("div.extras a")[0];
                                const synopsisElement = item.querySelector("p.synopsis");
                                const trailerElement = item.querySelectorAll("div.extras a")[1];
    
                                if (!imgElement || !infoElement || !titleElement || !idElement || !ttElement) return null;
    
                                const img = imgElement.rawAttributes?.src || null;
                                const year = infoElement.childNodes[0]?.rawText.trim() || null;
                                const title = titleElement.rawText ? decodeHtmlEntities(titleElement.rawText.trim()) : null;
                                const einthusanId = idElement.rawAttributes?.href?.split('/')[3] || null;
                                const ttNumber = ttElement?.rawAttributes['href']?.match(/tt\d+/)?.[0] || null;
    
                                if (!img || !year || !title || !einthusanId) return null;
    
                                let imdbId = ttNumber; // Default to ttNumber
                                if (!imdbId) {
                                    imdbId = await verifyImdbTitle(title, year).catch(() => null); // Fallback to verifyImdbTitle if ttNumber is not available
                                }
    
                                const finalId = imdbId || `einthusan_${einthusanId}`;
                                if (imdbId) await cache.set(`ttToEinthusan_${imdbId}`, einthusanId, 604800);
    
                                const description = synopsisElement ? decodeHtmlEntities(synopsisElement.rawText.trim()) : null;
                                const trailer = trailerElement?.rawAttributes['href']?.split("v=")[1] || null;
    
                                const castAndRoles = Array.from(item.querySelectorAll("div.prof")).map(prof => {
                                    const name = prof.querySelector("p")?.rawText.trim() || null;
                                    const role = prof.querySelector("label")?.rawText.trim() || null;
                                    return name && role ? { name, role } : null;
                                }).filter(Boolean);
    
                                const directors = castAndRoles.filter(item => item.role.toLowerCase() === "director").map(item => item.name) || [];
                                const actors = castAndRoles.filter(item => !["director", "writer"].includes(item.role.toLowerCase())).map(item => item.name) || [];
    
                                // Use the poster URL as is (no RPDB logic)
                                const posterUrl = img.startsWith('http') ? img : `https:${img}`;
    
                                return {
                                    id: finalId,
                                    EinthusanID: einthusanId,
                                    type: "movie",
                                    name: title,
                                    poster: posterUrl,
                                    releaseInfo: year,
                                    description,
                                    trailers: trailer ? [{ source: trailer, type: "Trailer" }] : [],
                                    links: [
                                        ...actors.map(actor => ({
                                            name: actor,
                                            category: "Cast",
                                            url: `stremio:///search?search=${encodeURIComponent(actor)}`
                                        })),
                                        ...directors.map(director => ({
                                            name: director,
                                            category: "Directors",
                                            url: `stremio:///search?search=${encodeURIComponent(director)}`
                                        }))
                                    ]
                                };
                            } catch (err) {
                                console.error(`Error processing movie on page ${page}:`, err.message);
                                return null; // Skip this movie and continue
                            }
                        })
                    );
                    movies.push(...chunkResults);
                    await sleep(200); // Give V8 Garbage Collector time to clear DOM objects from memory
                }

                const validMovies = movies.filter(Boolean);
                //console.info(`Fetched ${validMovies.length} Movies From Page: ${page} In Language: ${capitalizeFirstLetter(lang)}`);
                return validMovies;
            } catch (err) {
                if (retries > 0) {
                    console.warn(`Error fetching page ${page}, retrying... (${retries - 1} attempts left)`);
                    await sleep(2000); // Wait 2 seconds before retrying
                    return fetchPage(page, retries - 1);
                } else {
                    console.error(`Error fetching page ${page} after multiple attempts:`, err.message);
                    return []; // Return an empty array to continue fetching other pages
                }
            }
        };

        const allPages = [];
        for (let i = 1; i <= maxPages; i++) {
            const pageData = await fetchPage(i);
            allPages.push(pageData);
            console.log(`[${capitalizeFirstLetter(lang)}] Progress: ${i}/${maxPages} pages processed (${pageData.length} movies)`);
            if (i < maxPages) {
                await sleep(500); // 500ms delay between pages
            }
        }
        const uniqueMovies = new Map();

        allPages.flat().forEach(movie => {
            if (movie && !uniqueMovies.has(movie.EinthusanID)) {
                uniqueMovies.set(movie.EinthusanID, movie);
            }
        });

        const results = Array.from(uniqueMovies.values());
        if (logSummary) {
            console.info(`${useColors ? '\x1b[33m' : ''}Fetched A Total Of ${useColors ? '\x1b[0m' : ''}${useColors ? '\x1b[32m' : ''}${results.length}${useColors ? '\x1b[0m' : ''}${useColors ? '\x1b[33m' : ''} Unique Recent Movies In Language: ${useColors ? '\x1b[0m' : ''}${useColors ? '\x1b[36m' : ''}${capitalizeFirstLetter(lang)}${useColors ? '\x1b[0m' : ''}`);
        }

        await cache.set(cacheKey, compressData(results), 604800);
        return results;
        } catch (err) {
            console.error("Error in getAllRecentMovies:", err.message);
            throw err; // Propagate the error to the caller
        } finally {
            pendingFetches.delete(cacheKey);
        }
    })();

    pendingFetches.set(cacheKey, fetchPromise);
    return fetchPromise;
}

async function meta(einthusan_id, lang) {
    try {
        const originalId = einthusan_id;
        let mappedEinthusanId;

        if (einthusan_id.startsWith("tt")) {
            const cacheKeyForMovies = `recent_movies_${lang}_15`;
            const cachedMovies = await cache.get(cacheKeyForMovies);

            if (cachedMovies) {
                const movies = decompressData(cachedMovies);
                const movie = movies.find(m => m.id === einthusan_id);
                if (movie) {
                    mappedEinthusanId = movie.EinthusanID;
                }
            }

            if (mappedEinthusanId) {
                einthusan_id = mappedEinthusanId;
            } else {
                const imdbTitle = await ttnumberToTitle(einthusan_id).catch(() => null);
                if (!imdbTitle) return;
                einthusan_id = await getEinthusanIdByTitle(imdbTitle, lang, einthusan_id).catch(() => null);
                if (!einthusan_id) return;
                if (typeof einthusan_id === 'undefined') {
                    throw new Error(`Einthusan ID could not be retrieved for Title: ${imdbTitle} in Language: ${capitalizeFirstLetter(lang)}`);
                }
            }
        } else {
            einthusan_id = einthusan_id.replace("einthusan_", "");
        }

        const cacheKey = einthusan_id.startsWith("tt")
            ? `tt_${einthusan_id}`
            : `einthusan_${einthusan_id}`;
        
        const cachedMeta = await cache.get(cacheKey);

        if (cachedMeta) {
            const updatedMeta = { ...cachedMeta };
            updatedMeta.id = originalId.startsWith("tt") ? originalId : `einthusan_${einthusan_id}`;
            return updatedMeta;
        }
        if (!einthusan_id) return;
        const url = `${config.BaseURL}/movie/watch/${einthusan_id}/`;
        const response = await requestQueue.add(() => client.get(url)).catch((err) => {
            throw new Error(`Failed to fetch movie metadata: ${err.message}`);
        });
        const html = parse(response.data);

        const movieSummary = html.querySelector("#UIMovieSummary")?.querySelector("li");
        if (!movieSummary) throw new Error("Movie summary element not found");

        const imgElement = movieSummary.querySelector("div.block1 a img");
        const infoElement = movieSummary.querySelector("div.info p");
        const titleElement = movieSummary.querySelector("a.title h3");
        const synopsisElement = movieSummary.querySelector("p.synopsis");
        const idElement = movieSummary.querySelector("a.title");
        const trailerElement = html.querySelectorAll("div.extras a")[1];

        if (!imgElement || !infoElement || !titleElement || !idElement || !synopsisElement) {
            throw new Error("Incomplete metadata elements found");
        }

        const img = imgElement.rawAttributes?.src;
        const year = infoElement.childNodes[0]?.rawText.trim();
        const title = decodeHtmlEntities(titleElement.rawText.trim());
        const description = decodeHtmlEntities(synopsisElement.rawText.trim());
        const einthusanId = idElement.rawAttributes?.href.split('/')[3];
        const trailer = trailerElement?.rawAttributes['href']?.split("v=")[1] || null;

        const castAndRoles = Array.from(html.querySelectorAll("div.prof")).map(prof => {
            const name = prof.querySelector("p")?.rawText.trim();
            const role = prof.querySelector("label")?.rawText.trim();
            return name && role ? { name, role } : null;
        }).filter(Boolean);

        const directors = castAndRoles.filter(item => item.role.toLowerCase() === "director").map(item => item.name);
        const actors = castAndRoles.filter(item => !["director", "writer"].includes(item.role.toLowerCase())).map(item => item.name);

        const metaObj = {
            id: originalId,
            EinthusanID: einthusanId,
            name: title,
            description,
            poster: img.startsWith('http') ? img : `https:${img}`,
            background: img.startsWith('http') ? img : `https:${img}`,
            releaseInfo: year,
            trailers: trailer ? [{ source: trailer, type: "Trailer" }] : [],
            type: "movie",
            links: [
                ...actors.map(actor => ({
                    name: actor,
                    category: "Cast",
                    url: `stremio:///search?search=${encodeURIComponent(actor)}`
                })),
                ...directors.map(director => ({
                    name: director,
                    category: "Directors",
                    url: `stremio:///search?search=${encodeURIComponent(director)}`
                })),
            ]
        };

        await cache.set(cacheKey, metaObj);
        return metaObj;
    } catch (e) {
        //console.error("Error in meta function:", e.message);
        return []; // Return null to indicate failure
    }
}


module.exports = {
    cache,
    search,
    stream,
    getAllRecentMovies,
    fetchRecentMoviesForAllLanguages,
    meta,
    initializeClientWithSession
};