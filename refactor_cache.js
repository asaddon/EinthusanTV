const fs = require('fs');

let sources = fs.readFileSync('sources.js', 'utf8');

// 1. Replace the cache definition
const cacheDefOld = `const cache = new NodeCache({
    stdTTL: 30 * 60, // 30 minutes default TTL
    checkperiod: 60 * 60,
    useClones: false, // Disable cloning for better performance
    maxKeys: 10000 // Limit cache size
});`;

const cacheDefNew = `const Redis = require("ioredis");

class CacheWrapper {
    constructor() {
        this.useRedis = !!process.env.REDIS_URL;
        if (this.useRedis) {
            this.redis = new Redis(process.env.REDIS_URL);
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
const cache = new CacheWrapper();`;

sources = sources.replace(cacheDefOld, cacheDefNew);

// 2. Export cache at the end of sources.js
sources = sources.replace('module.exports = {', 'module.exports = {\n    cache,');

// 3. Replace cache.get/set with await cache.get/set
sources = sources.replace(/const cached = cache\.get\(cacheKey\);/g, 'const cached = await cache.get(cacheKey);');
sources = sources.replace(/cache\.set\(cacheKey, compressData\(updatedCache\), 604800\);/g, 'await cache.set(cacheKey, compressData(updatedCache), 604800);');
sources = sources.replace(/cache\.set\(cacheKey, compressData\(results\[lang\]\), 604800\);/g, 'await cache.set(cacheKey, compressData(results[lang]), 604800);');
sources = sources.replace(/cache\.set\(cacheKey, compressData\(result\)\);/g, 'await cache.set(cacheKey, compressData(result));');
sources = sources.replace(/let mappedEinthusanId = cache\.get\(\`ttToEinthusan_\$\{einthusan_id\}\`\);/g, 'let mappedEinthusanId = await cache.get(`ttToEinthusan_${einthusan_id}`);');
sources = sources.replace(/const cachedMovies = cache\.get\(cacheKeyForMovies\);/g, 'const cachedMovies = await cache.get(cacheKeyForMovies);');
sources = sources.replace(/cache\.set\(\`ttToEinthusan_\$\{einthusan_id\}\`, mappedEinthusanId, 604800\);/g, 'await cache.set(`ttToEinthusan_${einthusan_id}`, mappedEinthusanId, 604800);');
sources = sources.replace(/cache\.set\(cacheKey, compressData\(result\), 3600\);/g, 'await cache.set(cacheKey, compressData(result), 3600);');
sources = sources.replace(/if \(imdbId\) cache\.set\(\`ttToEinthusan_\$\{imdbId\}\`, einthusanId, 604800\);/g, 'if (imdbId) await cache.set(`ttToEinthusan_${imdbId}`, einthusanId, 604800);');
sources = sources.replace(/cache\.set\(cacheKey, compressData\(matchByTTNumber\.EinthusanID\)\);/g, 'await cache.set(cacheKey, compressData(matchByTTNumber.EinthusanID));');
sources = sources.replace(/cache\.set\(cacheKey, compressData\(match\.EinthusanID\)\);/g, 'await cache.set(cacheKey, compressData(match.EinthusanID));');
sources = sources.replace(/const cached = !forceFetch && cache\.get\(cacheKey\); \/\/ Skip cache if forceFetch is true/g, 'let cached = null;\n    if (!forceFetch) cached = await cache.get(cacheKey); // Skip cache if forceFetch is true');
sources = sources.replace(/cache\.set\(cacheKey, compressData\(results\), 604800\);/g, 'await cache.set(cacheKey, compressData(results), 604800);');
sources = sources.replace(/const cachedMeta = cache\.get\(cacheKey\);/g, 'const cachedMeta = await cache.get(cacheKey);');
sources = sources.replace(/cache\.set\(cacheKey, metaObj\);/g, 'await cache.set(cacheKey, metaObj);');

fs.writeFileSync('sources.js', sources);

let index = fs.readFileSync('index.js', 'utf8');

// Replace cache usages in index.js
index = index.replace(/let metas = cache\.get\(\`recent_movies_\$\{configuration\}_15\`\);/g, 'let metas = await sources.cache.get(`recent_movies_${configuration}_15`);');
index = index.replace(/metas = cache\.get\(\`recent_movies_\$\{configuration\}_15\`\);/g, 'metas = await sources.cache.get(`recent_movies_${configuration}_15`);');

fs.writeFileSync('index.js', index);
console.log("Refactoring complete");
