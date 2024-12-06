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

const requestQueue = new RequestQueue();

// Optimized IMDb ID fetching
async function getImdbId(title, year) {
    // Validate the title
    if (typeof title !== 'string' || !title.trim()) {
        console.error('Invalid Title Provided.');
        return null;
    }

    // Convert year to a number if it is provided
    if (year !== undefined) {
        year = Number(year); // Convert to number

        // Validate the year
        if (isNaN(year) || year < 1888 || year > new Date().getFullYear()) {
            console.error('Invalid Year Provided. Year Must Be A Number Between 1888 And The Current Year.');
            return null;
        }
    }

    // Create a cache key that includes both title and year
    const cacheKey = `imdb_${normalizeTitle(title)}_${year || 'any'}`;
    const cached = cache.get(cacheKey);
    if (cached) {
        //console.log(`Cache Hit For IMDb ID: ${title} ${year ? `(${year})` : ''}`);
        return decompressData(cached);
    }

    try {
        
        // Call the promisified version of nameToImdb
        const result = await getImdbIdAsync({ name: title, year: year });

        if (result) {
            //console.log(`Fetched IMDb ID: ${result} For Title: "${title}"${year ? ` (${year})` : ''}`);
            cache.set(cacheKey, compressData(result));
            return result;  // Return the result immediately after caching
        }

        console.warn(`${useColors ? '\x1b[33m' : ''}IMDB ID Not Found For Title: ${useColors ? '\x1b[0m' : ''}${useColors ? '\x1b[36m' : ''}"${title}"${useColors ? '\x1b[0m' : ''}${year ? ` ${useColors ? '\x1b[33m' : ''}(${year})${useColors ? '\x1b[0m' : ''}` : ''}`);
        return null;
    } catch (err) {
        console.error(`Error Fetching IMDb ID For "${title}":`, err.message);
        return null;
    }
}

// Optimized title fetching from IMDb
async function ttnumberToTitle(ttNumber) {
    // Validate ttNumber format
    const imdbIdPattern = /^tt\d{7,8}$/;
    if (!imdbIdPattern.test(ttNumber)) {
        console.error(`Invalid IMDb ID format: ${ttNumber}`);
        return null;
    }

    // Step 1: Generate cache keys for the IMDb ID and country check
    const cacheKey = `title_${ttNumber}`;
    const countryCacheKey = `country_${ttNumber}`;
    
    // Check if the title is already cached
    const cachedTitle = cache.get(cacheKey);
    const cachedCountry = cache.get(countryCacheKey);
    
    if (cachedTitle) {
        const title = decompressData(cachedTitle); // Decompress the cached title
        //console.log(`Cache hit for title "${title}" of IMDb ID: ${ttNumber}`);
        return title; // Return cached title
    }

    // If the country check is cached, use it
    if (cachedCountry) {
        
        const { isIndian, title } = decompressData(cachedCountry);
        //console.log(`Cache hit for country check of IMDb ID: ${ttNumber} Title: ${title}`);
        if (isIndian) {
            console.info(`Returning Cached Title for Indian movie: "${title}"`);
            return title;
        } else {
            console.info(`Cached Result: Movie: ${title} (IMDb ID: ${ttNumber}) Is Not From India. Skipping.`);
            return null; // If the country is not India, return null
        }
    }

    let title = null; // Initialize title variable

    try {
        // Step 2: Fetch movie details from the OMDB API using the IMDb ID (ttNumber)
        const omdbApiKey = process.env.OMDB_API_KEY; // Access the API key from environment variables
        if (!omdbApiKey) {
            console.error("OMDB API Key Is Missing In Environment Variable.");
            return null; // If API key is not found, return null
        }

        const omdbUrl = `https://www.omdbapi.com/?i=${ttNumber}&apikey=${omdbApiKey}`;
        const response = await axios.get(omdbUrl, { timeout: 5000 });

        // Step 3: Check if the Country is "India"
        const movieData = response.data;
        const countryOfOrigin = movieData.Country; // The country of origin is in the 'Country' field
        const movieTitle = movieData.Title; // Movie title from OMDB response
        
        // Determine if the movie is from India
        const isIndian = countryOfOrigin && countryOfOrigin.includes('India');
        const countryCheckResult = { isIndian, title: movieTitle };

        // Cache the country check result
        cache.set(countryCacheKey, compressData(countryCheckResult));

        if (!isIndian) {
            console.info(`Movie "${useColors ? '\x1b[36m' : ''}${movieTitle}${useColors ? '\x1b[0m' : ''}" (IMDb ID: ${useColors ? '\x1b[32m' : ''}${ttNumber}${useColors ? '\x1b[0m' : ''}) Is Not From India. Skipping.`);
            return null; // If the country is not India, return null or handle it as needed
        }

        // Step 4: Country is India, return the title from OMDB
        console.info(`Movie "${useColors ? '\x1b[36m' : ''}${movieTitle}${useColors ? '\x1b[0m' : ''}" (IMDb ID: ${useColors ? '\x1b[32m' : ''}${ttNumber}${useColors ? '\x1b[0m' : ''}) Is From India. Continuing.`);
        
        // Step 5: Cache the title
        cache.set(cacheKey, compressData(movieTitle));
        return movieTitle; // Return the title directly from OMDB response

    } catch (err) {
        // Step 6: Error handling for OMDB API
        console.error(`Error Fetching Movie Data For IMDb ID: ${ttNumber} From OMDB API`, err.message);
        
        // Failsafe logic: Fetch title from IMDb suggestions API
        console.info(`${useColors ? '\x1b[33m' : ''}Attempting To Fetch Title From IMDb Suggestions API For IMDb ID: \x1b[0m${useColors ? '\x1b[32m' : ''}${ttNumber}${useColors ? '\x1b[0m' : ''}.`);
        
        try {
            const imdbApiUrl = `https://v2.sg.media-imdb.com/suggestion/t/${ttNumber}.json`;
            const imdbResponse = await axios.get(imdbApiUrl, { timeout: 5000 });
            
            // Extract the title from the response
            const movie = imdbResponse.data.d.find(item => item.id === ttNumber);
            title = movie ? movie.l : null;
            
            if (title) {
                console.info(`${useColors ? '\x1b[33m' : ''}Fetched Title: "\x1b[0m${useColors ? '\x1b[36m' : ''}${title}${useColors ? '\x1b[0m' : ''}${useColors ? '\x1b[33m' : ''}" For IMDb ID: \x1b[0m${useColors ? '\x1b[32m' : ''}${ttNumber}${useColors ? '\x1b[0m' : ''}`);
                // Step 5: Cache the title
                cache.set(cacheKey, compressData(title));
            } else {
                console.info(`No Title Found For IMDb ID: ${ttNumber} In IMDb Suggestions API.`);
            }
            return title; // Return the title or null if not found
        } catch (imdbErr) {
            console.error(`Error Fetching Title From IMDb Suggestions API For IMDb ID: ${ttNumber}`, imdbErr.message);
            return null; // Return null if both API calls fail
        }
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
     // Check if lang is undefined
     if (typeof lang === 'undefined') {
        console.error("Error: 'lang' Parameter Is Undefined.");
        return; // Exit the function early
    }
    const cacheKey = `stream_${einthusan_id}_${lang}`;
    const cached = cache.get(cacheKey);
    if (cached) {
        const cachedResult = decompressData(cached);
        const cachedTitle = cachedResult.streams[0].title;
        console.info(`${useColors ? '\x1b[32m' : ''}Cache Hit For Stream: ${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[36m' : ''}${cachedTitle}${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[33m' : ''}(${einthusan_id})${useColors ? '\x1b[0m' : ''}`);
        return cachedResult;
    }

    try {
        if (einthusan_id.startsWith("tt")) {
        const title = await ttnumberToTitle(einthusan_id);
        if (!title) return;
        einthusan_id = await getEinthusanIdByTitle(title, lang, einthusan_id);
        // Check if einthusan_id is undefined after the function call
        if (typeof einthusan_id === 'undefined') {
        throw new Error(`Einthusan ID could not be retrieved for Title: ${title} in Language: ${capitalizeFirstLetter(lang)}`);}}
            
        const url = `${config.BaseURL}/movie/watch/${einthusan_id}/`;
        //console.log(`Fetching stream from URL: ${url}`);
        const response = await requestQueue.add(() => client.get(url));
        const $ = cheerio.load(response.data);
        
        const videoSection = $('#UIVideoPlayer');
        if (!videoSection.length) throw new Error("Video player section not found");

        const title = videoSection.attr("data-content-title");
        const year = $('#UIMovieSummary div.info p').contents().first().text().trim();
        const mp4Link = replaceIpInLink(videoSection.attr('data-mp4-link'));
        
        if (!mp4Link) throw new Error("No video source found");
        const capitalizedLang = capitalizeFirstLetter(lang);
        const result = {
            streams: [{
                url: mp4Link,
                name: `Einthusan ⚡️`,
                title: `🍿${title} (${year})\n 🌐 ${capitalizedLang}`
            }]
        };

        console.info(`${useColors ? '\x1b[32m' : ''}Stream Fetched Successfully For:${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[36m' : ''}${title}${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[33m' : ''}(${year})${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[31m' : ''}(EinthusanID: ${einthusan_id})${useColors ? '\x1b[0m' : ''} ${useColors ? '\x1b[32m' : ''}In Language:${useColors ? '\x1b[0m' : ''} ${capitalizeFirstLetter(lang)}`);
        cache.set(cacheKey, compressData(result), 3600); // Cache for 1 hour with compressed data
        return result;
    } catch (err) {
        // Check if the error is the specific one you want to ignore
        if (err.message.includes("Einthusan ID could not be retrieved")) {
            // Handle the specific error silently (do nothing or set a flag)
        } else {
            // Log other errors
            console.error("Error in Stream Function:", err.message);
        }
}
}
// Optimized search function with batch processing
async function search(lang, slug) {
    // Check if lang is undefined
    if (typeof lang === 'undefined') {
        console.error("Error: 'lang' parameter is undefined.");
        return; // Exit the function early
    }

    try {
        //console.info(`Searching For: ${slug} In Language: ${lang}`);
        const url = `/movie/results/?lang=${lang}&query=${encodeURIComponent(slug)}`;
        const results = await getcatalogresults(url);
        return results; // Return the search results directly without caching
    } catch (err) {
        console.error("Error in Search Function:", err.message);
    }
}

// Optimized catalog results fetching
async function getcatalogresults(url) {
    try {
        const response = await requestQueue.add(() => client.get(url));
        const html = parse(response.data);
        const searchResults = html.querySelector("#UIMovieSummary")?.querySelectorAll("li") || [];

        // Process results in batches for better performance
        const batchSize = 5;
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

                const imdbId = await getImdbId(title, year);
                return {
                    id: imdbId,
                    EinthusanID: einthusanId,
                    type: "movie",
                    name: title,
                    poster: img.startsWith('http') ? img : `https:${img}`,
                    releaseInfo: year,
                    posterShape: 'poster'
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
        
        throw new Error(`No match found for Title: ${title}`);
    } catch (err) {
        // Log only the concise error message
        console.error("Error in GetEinthusanIdByTitle Function:", err.message); // Only log the error message
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
        
            const fetchPage = async (page, retries = 3) => {
            const pageUrl = `/movie/results/?find=Recent&lang=${lang}&page=${page}`;

            try {
                //console.info(`Fetching Page: ${pageUrl}`);
                const response = await requestQueue.add(() => client.get(pageUrl));
                
                if (response.status === 200) {
                    const body = response.data; // Adjust based on your response format
                    if (body.includes('<title>Rate Limited - Einthusan</title>')) {
                        //console.error(`Rate limited on page ${page}. Waiting for 5 seconds before retrying...`);
                        await sleep(5000); // Wait for 5 seconds
                        return fetchPage(page, lang, retries); // Retry the same page
                    }
                }

                // Check if response data is empty
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

                        const imdbId = await getImdbId(title, year);
                        return {
                            id: imdbId,
                            EinthusanID: einthusanId,
                            type: "movie",
                            name: title,
                            poster: img.startsWith('http') ? img : `https:${img}`,
                            releaseInfo: year,
                            posterShape: 'poster'
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

        // Fetch all pages
        const pagePromises = [];
        for (let i = 1; i <= maxPages; i++) {
            pagePromises.push(fetchPage(i));
        }

        const allPages = await Promise.all(pagePromises);
        const uniqueMovies = new Map();

        // Merge results and remove duplicates
        allPages.flat().forEach(movie => {
            if (movie && !uniqueMovies.has(movie.EinthusanID)) {
                uniqueMovies.set(movie.EinthusanID, movie);
            }
        });

        const results = Array.from(uniqueMovies.values());
        if (logSummary) {
            console.info(`${useColors ? '\x1b[33m' : ''}Fetched A Total Of ${useColors ? '\x1b[0m' : ''}${useColors ? '\x1b[32m' : ''}${results.length}${useColors ? '\x1b[0m' : ''}${useColors ? '\x1b[33m' : ''} Unique Recent Movies In Language: ${useColors ? '\x1b[0m' : ''}${useColors ? '\x1b[36m' : ''}${capitalizeFirstLetter(lang)}${useColors ? '\x1b[0m' : ''}`);
        }


        // Cache final results for 12 hours with compression
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

module.exports = {
    search,
    stream,
    getAllRecentMovies,
    fetchRecentMoviesForAllLanguages
};
