const { parse } = require("node-html-parser");
const config = require('./config');
require('dotenv').config();
const cheerio = require('cheerio');
const axios = require('axios');
const nameToImdb = require("name-to-imdb");
const NodeCache = require("node-cache");
const { promisify } = require('util');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const zlib = require('zlib'); // Import zlib for compression
const useColors = process.env.USE_COLORS === 'true' || false;
// Enhanced caching configuration
const cache = new NodeCache({
    stdTTL: 30 * 60, // 30 minutes default TTL
    checkperiod: 60 * 60,
    useClones: false, // Disable cloning for better performance
    maxKeys: 10000 // Limit cache size
});

// Function to fetch recent movies for all languages
const fetchRecentMoviesForAllLanguages = async (maxPages = 15) => {
    try {
        const results = {};
        // Fetch movies for all languages in parallel
        await Promise.all(config.langs.map(async (lang) => {
            const movies = await getAllRecentMovies(maxPages, lang, false);
            results[lang] = movies;
        }));
        // Final summary log
            console.info(`\n${useColors ? '\x1b[1m\x1b[33m' : ''}=== Final Summary ===${useColors ? '\x1b[0m' : ''}`);
            for (const [lang, movies] of Object.entries(results)) {
            console.info(`${useColors ? '\x1b[33m' : ''}Fetched A Total Of ${useColors ? '\x1b[32m' : ''}${movies.length}${useColors ? '\x1b[33m' : ''} Unique Recent Movies In Language: ${useColors ? '\x1b[36m' : ''}${capitalizeFirstLetter(lang)}${useColors ? '\x1b[0m' : ''}`);
        }
        return results;
    } catch (error) {
        console.error("Error Fetching Movies For All Languages:", error);
    }
};

// Render Refresh Start
const renderUrl = 'https://einthusantv-k9mh.onrender.com/';
const interval = 10 * 60 * 1000; // 10 minutes in milliseconds
const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Karachi', timeZoneName: 'long' };

setInterval(() => {
  const date = new Date();
  axios.get(renderUrl)
    .then(res => console.info(`Reloaded at ${date.toLocaleString('en-US', options)}: Status ${res.status}`))
    .catch(err => console.error(`Error at ${date.toLocaleString('en-US', options)}: (${err.message})`));
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
const client = axios.create({
    baseURL: config.BaseURL,
    timeout: 1200000,
    headers: {
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
    },
    // Enable HTTP keep-alive
    httpAgent: new (require('http').Agent)({ keepAlive: true }),
    httpsAgent: new (require('https').Agent)({ keepAlive: true }),
    // Implement retry logic
    retries: 3,
    retryDelay: (retryCount) => retryCount * 1000
});

// Add retry interceptor
client.interceptors.response.use(undefined, async (err) => {
    const config = err.config;
    if (!config || !config.retries) return Promise.reject(err);

    config.retryCount = config.retryCount ?? 0;
    if (config.retryCount >= config.retries) {
        console.error(`Request Failed After ${config.retries} Retries:`, err);
        return Promise.reject(err);
    }

    config.retryCount += 1;
    const delay = config.retryDelay(config.retryCount);
    console.info(`Retrying Request... Attempt ${config.retryCount} After ${delay} ms`);
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
    constructor(concurrency = 50) {
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
        const imdbId = await getImdbId(title, year);
        if (!imdbId) return false;

        const fetchedTitle = await ttnumberToTitle(imdbId);
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
            console.warn(`Relaxed Match: The title "${title}" does not perfectly match the fetched title "${fetchedTitle}" but the first words align based on starting letter. Accepting as a match.`);
            return imdbId;// Adjusted to reject false positives more effectively
        }

        // If no match found
        return null;
    } catch (err) {
        console.error(`Error in verifyImdbTitle: ${err.message}`);
        return null; // Return null if there is an error
    }
}








const requestQueue = new RequestQueue();

// Optimized IMDb ID fetching
async function getImdbId(title, year) {
    // Validate the title
    if (typeof title !== 'string' || !title.trim()) {
        console.error('Invalid Title Provided.');
        return null;
    }
    // Remove the year and any additional text (e.g., "Film") after the year from the title
    const cleanedTitle = title.replace(/\s?\(.*?\)$/, '').replace(/#/g, '').trim();

    // Convert year to a number if it is provided
    if (year !== undefined) {
        year = Number(year); // Convert to number
        // Validate the year
        if (isNaN(year) || year < 1888 || year > new Date().getFullYear()) {
            console.error('Invalid Year Provided. Year Must Be A Number Between 1888 And The Current Year.');
            return null;
        }
    }
    // Create a cache key that includes both the cleaned title and year
    const cacheKey = `imdb_${normalizeTitle(cleanedTitle)}_${year || 'any'}`;
    const cached = cache.get(cacheKey);
    if (cached) {
        //console.log(`Cache Hit For IMDb ID: ${cleanedTitle} ${year ? `(${year})` : ''}`);
        return decompressData(cached);
    }
    try {
        // Call the promisified version of nameToImdb with both cleanedTitle and year
        const result = await getImdbIdAsync({ name: cleanedTitle, year: year });
        if (result) {
            //console.log(`Fetched IMDb ID: ${result} For Title: "${cleanedTitle}"${year ? ` (${year})` : ''}`);
            cache.set(cacheKey, compressData(result));
            return result;  // Return the result immediately after caching
        }
        console.warn(`${useColors ? '\x1b[33m' : ''}IMDB ID Not Found For Cleaned Title: ${useColors ? '\x1b[0m' : ''}${useColors ? '\x1b[36m' : ''}"${cleanedTitle}"${useColors ? '\x1b[0m' : ''}${cleanedTitle !== title ? `${useColors ? '\x1b[33m' : ''} Original Title: ${useColors ? '\x1b[36m' : ''}"${title}"${useColors ? '\x1b[0m' : ''}` : ''}${year ? ` ${useColors ? '\x1b[33m' : ''}(${year})${useColors ? '\x1b[0m' : ''}` : ''}`);
        return null;
    } catch (err) {
        console.error(`Error Fetching IMDb ID For "${cleanedTitle}":`, err.message);
        return null;
    }
}


// Create a promise cache
const promiseCache = new Map();

async function ttnumberToTitle(ttNumber) {
    const ttNumberRegex = /^tt\d{7,8}$/;

    if (!ttNumberRegex.test(ttNumber)) {
        throw new Error('Invalid IMDb ID format. It should be in the format "tt1234567" or "tt12345678".');
    }

    const cacheKey = `title_${ttNumber}`;

    // Check if a request for this `ttNumber` is already in progress
    if (promiseCache.has(ttNumber)) {
        return promiseCache.get(ttNumber); // Return the existing promise
    }

    // Check the cache for title information
    const cachedTitle = cache.get(cacheKey);
    if (cachedTitle) {
        const title = decompressData(cachedTitle);
        return title;
    }

    // Create a new promise for this `ttNumber` and store it in the promise cache
    const fetchPromise = (async () => {
        try {
            const omdbApiKey = process.env.OMDB_API_KEY;
            if (!omdbApiKey) {
                console.error('OMDB API Key is missing in environment variables.');
                return null;
            }

            const omdbUrl = `https://www.omdbapi.com/?i=${ttNumber}&apikey=${omdbApiKey}`;
            const response = await axios.get(omdbUrl, { timeout: 10000 });
            const movieTitle = response.data.Title;

            if (!movieTitle) {
                console.error(`No title found for IMDb ID: ${ttNumber}.`);
                return null;
            }

            // Cache the title
            cache.set(cacheKey, compressData(movieTitle));
            return movieTitle;
        } catch (err) {
            console.error(`Error fetching movie data from OMDB API for IMDb ID: ${ttNumber}. Error message: ${err.message}`);

            // Attempt fallback to IMDb suggestions API
            try {
                const imdbApiUrl = `https://v2.sg.media-imdb.com/suggestion/t/${ttNumber}.json`;
                const imdbResponse = await axios.get(imdbApiUrl, { timeout: 10000 });
                const movie = imdbResponse.data.d.find(item => item.id === ttNumber);
                const title = movie ? movie.l : null;

                if (title) {
                    cache.set(cacheKey, compressData(title));
                    return title;
                } else {
                    console.error(`No title found for IMDb ID: ${ttNumber} in IMDb Suggestions API.`);
                    return null;
                }
            } catch (imdbErr) {
                console.error(`Error fetching title from IMDb Suggestions API for IMDb ID: ${ttNumber}. Error message: ${imdbErr.message}`);
                return null;
            }
        }
    })();

    // Store the promise in the cache
    promiseCache.set(ttNumber, fetchPromise);

    // Remove the promise from the cache once it resolves or rejects
    fetchPromise.finally(() => {
        promiseCache.delete(ttNumber);
    });

    return fetchPromise;
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
    // Check if lang is undefined
    if (typeof lang === 'undefined') {
        console.error("Error: 'lang' Parameter Is Undefined.");
        return; // Exit the function early
    }

    const imdb = einthusan_id;
    const cacheKey = `stream_${einthusan_id}_${lang}`;
    const cached = cache.get(cacheKey);

    if (cached) {
        const cachedResult = decompressData(cached);
        const cachedTitle = cachedResult.streams[0].title;
        console.info(`${useColors ? '\x1b[32m' : ''}Cache Hit For Stream:${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[36m' : ''}${cachedTitle}${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[33m' : ''}(${einthusan_id})${useColors ? '\x1b[0m' : ''}`);
        return cachedResult;
    }

    try {
        let title;
        let validEinthusanId = false;

        // Handle the "einthusan_" prefixed ID directly
        if (einthusan_id.startsWith("einthusan_")) {
            const strippedId = einthusan_id.replace("einthusan_", ""); // Strip the prefix
            const url = `${config.BaseURL}/movie/watch/${strippedId}/`;

            const response = await requestQueue.add(() => client.get(url));
            const $ = cheerio.load(response.data);

            const videoSection = $('#UIVideoPlayer');
            if (!videoSection.length) throw new Error("Video player section not found");

            title = videoSection.attr("data-content-title");
            const year = $('#UIMovieSummary div.info p').contents().first().text().trim();
            const mp4Link = replaceIpInLink(videoSection.attr('data-mp4-link'));

            if (!mp4Link) throw new Error("No video source found");

            // Check if the language is actually valid for this einthusan_id
            const languageCheck = $('#UIMovieSummary div.info p span').text().toLowerCase();
            if (!languageCheck.includes(lang.toLowerCase())) {
                throw new Error(`The Einthusan ID: ${einthusan_id} is not valid for the language: ${lang}`);
            }

            validEinthusanId = true; // Set this to true if the language matches

            const capitalizedLang = capitalizeFirstLetter(lang);
            const result = {
                streams: [{
                    url: mp4Link,
                    name: `Einthusan ⚡️`,
                    title: `🍿 ${title} (${year})\n🌐 ${capitalizedLang}`
                }]
            };

            console.info(`${useColors ? '\x1b[32m' : ''}Stream Fetched Successfully For:${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[36m' : ''}${title}${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[33m' : ''}(${year})${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[31m' : ''}(EinthusanID: ${einthusan_id} and imdbID: ${imdb})${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[32m' : ''}In Language:${useColors ? '\x1b[0m' : ''} ${capitalizedLang}`);
            
            // Cache the result for the specific combination of einthusan_id and lang
            cache.set(cacheKey, compressData(result), 3600); // Cache for 1 hour with compressed data
            return result;
        }

        // Handle ttnumber (starting with "tt") only if the einthusan_id starts with "tt"
        if (einthusan_id.startsWith("tt")) {
            const imdbTitle = await ttnumberToTitle(einthusan_id);
            if (!imdbTitle) return;
            // Get Einthusan ID for this title and language
            einthusan_id = await getEinthusanIdByTitle(imdbTitle, lang, einthusan_id);
            // Check if einthusan_id is undefined
            if (typeof einthusan_id === 'undefined') {
                throw new Error(`Einthusan ID could not be retrieved for Title: ${imdbTitle} in Language: ${capitalizeFirstLetter(lang)}`);
            }

            const url = `${config.BaseURL}/movie/watch/${einthusan_id}/`;
            const response = await requestQueue.add(() => client.get(url));
            const $ = cheerio.load(response.data);

            const videoSection = $('#UIVideoPlayer');
            if (!videoSection.length) throw new Error("Video player section not found");

            title = videoSection.attr("data-content-title");
            const year = $('#UIMovieSummary div.info p').contents().first().text().trim();
            const mp4Link = replaceIpInLink(videoSection.attr('data-mp4-link'));

            if (!mp4Link) throw new Error("No video source found");

            // Check if the language is valid for the current einthusan_id
            const languageCheck = $('#UIMovieSummary div.info p').text().toLowerCase();
            if (!languageCheck.includes(lang.toLowerCase())) {
                throw new Error(`The Einthusan ID: ${einthusan_id} is not valid for the language: ${lang}`);
            }

            validEinthusanId = true; // Set this to true if the language matches

            const capitalizedLang = capitalizeFirstLetter(lang);
            const result = {
                streams: [{
                    url: mp4Link,
                    name: `Einthusan ⚡️`,
                    title: `🍿 ${title} (${year})\n🌐 ${capitalizedLang}`
                }]
            };

            // Log success with color
            console.info(`${useColors ? '\x1b[32m' : ''}Stream Fetched Successfully For:${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[36m' : ''}${title}${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[33m' : ''}(${year})${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[31m' : ''}(EinthusanID: ${einthusan_id} and imdbID: ${imdb})${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[32m' : ''}In Language:${useColors ? '\x1b[0m' : ''} ${capitalizedLang}`);

            // Cache result for the specific combination of einthusan_id and lang
            cache.set(cacheKey, compressData(result), 3600); // Cache for 1 hour with compressed data
            return result;
        }

    } catch (err) {
        // Handle specific and general errors
        if (err.message.includes("Einthusan ID could not be retrieved") || err.message.includes("is not valid for the language")) {
            // Handle specific case
        } else {
            console.error("Error in Stream Function:", err.message);
        }
    }
}



async function search(lang, slug) {
    if (!lang || !slug) {
        console.error("Error: Missing 'lang' or 'slug' parameter.");
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

        // Process results in batches for better performance
        const batchSize = 10;
        const resultsArray = [];

        for (let i = 0; i < searchResults.length; i += batchSize) {
            const batch = searchResults.slice(i, i + batchSize);
            const batchPromises = batch.map(async (item) => {
                const imgElement = item.querySelector("div.block1 a img");
                const infoElement = item.querySelector("div.info p");
                const titleElement = item.querySelector("a.title h3");
                const idElement = item.querySelector("a.title");

                if (!imgElement || !infoElement || !titleElement || !idElement) return null;

                const img = imgElement.rawAttributes?.src;
                const year = infoElement.childNodes[0]?.rawText.trim();
                const title = decodeHtmlEntities(titleElement.rawText.trim());
                const einthusanId = idElement.rawAttributes?.href.split('/')[3];

                if (!img || !year || !title || !einthusanId) return null;

                // Fetch IMDb ID and verify the match
                const imdbId = await verifyImdbTitle(title, year); 

                return {
                    id: imdbId || `einthusan_${einthusanId}`, // Use IMDb ID if verified, else fallback to Einthusan ID
                    EinthusanID: einthusanId,
                    type: "movie",
                    name: title,
                    poster: img.startsWith('http') ? img : `https:${img}`,
                    releaseInfo: year
                };
            });

            const batchResults = await Promise.all(batchPromises);
            resultsArray.push(...batchResults.filter(Boolean));
        }

        if (resultsArray.length) {
            console.info(`${useColors ? '\x1b[32m' : ''}Searching For:${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[36m' : ''}${new URL(`${config.BaseURL.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`).searchParams.get('query')}${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[33m' : ''}in Language:${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[35m' : ''}${capitalizeFirstLetter(new URL(`${config.BaseURL.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`).searchParams.get('lang'))}${useColors ? '\x1b[0m' : ''}`);
        }
        return resultsArray;
    } catch (err) {
        console.error("Error in GetCatalogResults Function:", err.message);
    }
}


// Optimized function to get Einthusan ID by title
async function getEinthusanIdByTitle(title, lang, ttnumber) {
    // Check if lang is undefined
    if (typeof lang === 'undefined') {
        console.error("Error: 'lang' parameter is undefined.");
        return; // Exit the function early
    }

    const cacheKey = `einthusan_${normalizeTitle(title)}_${lang}`;
    const cached = cache.get(cacheKey);
    
    try {
        const url = `/movie/results/?lang=${lang}&query=${encodeURIComponent(title)}`;
        const results = await getcatalogresults(url);

        // Check if results is an array
        if (!Array.isArray(results)) {
            throw new Error("Invalid results structure received from getcatalogresults.");
        }

        // If ttnumber is provided, search for it in the results
        if (ttnumber) {
            const matchByTTNumber = results.find(movie => movie.id === ttnumber);
            if (matchByTTNumber) {
                //console.log(`Found Einthusan ID: ${matchByTTNumber.EinthusanID} for Movie: ${title} (${ttnumber})`);
                cache.set(cacheKey, compressData(matchByTTNumber.EinthusanID)); // Cache compressed ID
                return matchByTTNumber.EinthusanID;
            }
            // Move the error throw outside of the if statement
            throw new Error(`No match found for for Movie: ${title} (${ttnumber}) in Language: ${capitalizeFirstLetter(lang)}`);
        }

        // If no ttnumber is provided, proceed with the title search
        const normalizedSearchTitle = normalizeTitle(title);
        const match = results.find(movie => normalizeTitle(movie.name) === normalizedSearchTitle);
        
        if (match) {
            //console.info(`Found Einthusan ID: ${match.EinthusanID} for Title: ${title}`);
            cache.set(cacheKey, compressData(match.EinthusanID)); // Cache compressed ID
            return match.EinthusanID;
        }
        
        //throw new Error(`No match found for Title: ${title}`);
    } catch (err) {
        // Log only the concise error message
        console.error(err.message); // Only log the error message
    }
}

// Optimized function to get all recent movies with parallel processing
async function getAllRecentMovies(maxPages, lang, logSummary = true) {
    const cacheKey = `recent_movies_${lang}_${maxPages}`;
    const cached = cache.get(cacheKey);
    if (cached) {
        if (logSummary) {
            console.log(`${useColors ? '\x1b[32m' : ''}Cache Hit For Recent Movies:${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[36m' : ''}${capitalizeFirstLetter(lang)}${useColors ? '\x1b[0m' : ''}, ${useColors ? '\x1b[33m' : ''}Max Pages:${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[32m' : ''}${maxPages}${useColors ? '\x1b[0m' : ''}`);
        }
        return decompressData(cached);
    }

    try {
        console.info(`${useColors ? '\x1b[33m' : ''}Fetching All Recent Movies For Language: ${useColors ? '\x1b[0m' : ''}${useColors ? '\x1b[36m' : ''}${capitalizeFirstLetter(lang)}${useColors ? '\x1b[0m' : ''}${useColors ? '\x1b[33m' : ''}, Max Pages: ${useColors ? '\x1b[0m' : ''}${useColors ? '\x1b[32m' : ''}${maxPages}${useColors ? '\x1b[0m' : ''}`);

        const fetchPage = async (page, retries = 10) => {
            const pageUrl = `/movie/results/?find=Recent&lang=${lang}&page=${page}`;

            try {
                const response = await requestQueue.add(() => client.get(pageUrl));
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

                const movies = await Promise.all(
                    searchResults.map(async (item) => {
                        const imgElement = item.querySelector("div.block1 a img");
                        const infoElement = item.querySelector("div.info p");
                        const titleElement = item.querySelector("a.title h3");
                        const idElement = item.querySelector("a.title");

                        if (!imgElement || !infoElement || !titleElement || !idElement) return null;

                        const img = imgElement.rawAttributes?.src;
                        const year = infoElement.childNodes[0]?.rawText.trim();
                        const title = decodeHtmlEntities(titleElement.rawText.trim());
                        const einthusanId = idElement.rawAttributes?.href.split('/')[3];

                        if (!img || !year || !title || !einthusanId) return null;

                        const imdbId = await verifyImdbTitle(title, year); 

                    return {
                            id: imdbId || `einthusan_${einthusanId}`, 
                            EinthusanID: einthusanId,
                            type: "movie",
                            name: title,
                            poster: img.startsWith('http') ? img : `https:${img}`,
                            releaseInfo: year
                        };
                    })
                );

                const validMovies = movies.filter(Boolean);
                console.info(`Fetched ${validMovies.length} Movies From Page: ${page} In Language: ${capitalizeFirstLetter(lang)}`);
                return validMovies;
            } catch (err) {
                if (retries > 0) {
                    console.warn(`Error fetching page ${page}, retrying... (${3 - retries} attempts left)`);
                    return fetchPage(page, retries - 1);
                } else {
                    console.error(`Error fetching page ${page} after multiple attempts in getAllRecentMovies:`, err.message);
                    return [];
                }
            } finally {
                await sleep(1000); // Delay between requests to avoid rate limiting
            }
        };

        const pagePromises = [];
        for (let i = 1; i <= maxPages; i++) {
            pagePromises.push(fetchPage(i));
        }

        const allPages = await Promise.all(pagePromises);
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

        cache.set(cacheKey, compressData(results), 43200);
        return results;
    } catch (err) {
        console.error("Error in getAllRecentMovies:", err.message);
    }
}

// Error handler for uncaught promises
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
});

async function meta(einthusan_id, lang) {
    try {
        const originalId = einthusan_id;
        if (einthusan_id.startsWith("tt")) {
            // Call the getEinthusanIdByTitle function to get the Einthusan ID
            try {
                const title = await ttnumberToTitle(einthusan_id);
                if (!title) { return; }
                const einthusanId = await getEinthusanIdByTitle(title, lang);
                if (einthusanId) {
                    einthusan_id = einthusanId;  // Update the einthusan_id with the retrieved value
                } else {
                   // console.error("Error: Unable to retrieve Einthusan ID for ttNumber:", einthusan_id);
                    return;
                }
            } catch (error) {
                //console.error("Error in getEinthusanIdByTitle:", error.message);
                return;
            }
        }
        if (einthusan_id.startsWith("einthusan_")) {
            einthusan_id = einthusan_id.replace("einthusan_", "");
        }
        const cacheKey = einthusan_id.startsWith("tt")
            ? `tt_${einthusan_id}` // For ttnumber, use tt_<ttnumber>
            : `einthusan_${einthusan_id}`;
        
            const cachedMeta = cache.get(cacheKey);

            if (cachedMeta) {
                // Dynamically set the ID based on the current input
                const updatedMeta = { ...cachedMeta };  // Clone the cached object to avoid mutation issues
                updatedMeta.id = originalId.startsWith("tt") ? originalId : `einthusan_${einthusan_id}`;
                return updatedMeta;
            }

        const url = `${config.BaseURL}/movie/watch/${einthusan_id}/`;
        const response = await requestQueue.add(() => client.get(url));
        const html = parse(response.data);

        const movieSummary = html.querySelector("#UIMovieSummary")?.querySelector("li");
        if (!movieSummary) throw new Error("Movie summary element not found");

        // Extract metadata elements
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

        // Extract cast and roles
        const castAndRoles = Array.from(html.querySelectorAll("div.prof")).map(prof => {
            const name = prof.querySelector("p")?.rawText.trim();
            const role = prof.querySelector("label")?.rawText.trim();
            return name && role ? { name, role } : null;
        }).filter(Boolean);

        const directors = castAndRoles.filter(item => item.role.toLowerCase() === "director").map(item => item.name);
        const actors = castAndRoles.filter(item => !["director", "writer"].includes(item.role.toLowerCase())).map(item => item.name);
        // Construct metadata object
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

        cache.set(cacheKey, metaObj);
        return metaObj;
    } catch (e) {
        console.error("Error in meta function:", e);
        throw e; // Re-throw the error for upstream handling
    }
}


module.exports = {
    search,
    stream,
    getAllRecentMovies,
    fetchRecentMoviesForAllLanguages,
    meta
};
