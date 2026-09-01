require('dotenv').config();
const sources = require('../sources.js');
const axios = require('axios');

async function verifyKV(lang) {
    const key = `einthusan_catalog_movies_${lang}`;
    const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/storage/kv/namespaces/${process.env.CF_KV_NAMESPACE_ID}/values/${encodeURIComponent(key)}`;
    try {
        const res = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${process.env.CF_API_TOKEN}` },
            responseType: 'arraybuffer',
            timeout: 8000
        });
        if (res.data && res.data.byteLength > 100) {
            return { ok: true, bytes: res.data.byteLength };
        }
        return { ok: false, reason: 'Empty or missing data in KV' };
    } catch (err) {
        const status = err.response?.status;
        if (status === 404) return { ok: false, reason: 'Key not found in KV (404)' };
        if (status === 429) return { ok: false, reason: 'KV rate limited (429) — daily limit exhausted!' };
        return { ok: false, reason: err.message };
    }
}

async function main() {
    try {
        console.log("Starting GitHub Actions Scraping Job...");

        // Ensure REDIS_URL or Cloudflare KV is present, otherwise scraping will just go to local memory and die with the action
        const hasRedis = !!process.env.REDIS_URL;
        const hasCFKV = !!(process.env.CF_ACCOUNT_ID && process.env.CF_KV_NAMESPACE_ID && process.env.CF_API_TOKEN);

        if (!hasRedis && !hasCFKV) {
            console.error("FATAL: Neither REDIS_URL nor Cloudflare KV environment variables (CF_ACCOUNT_ID, CF_KV_NAMESPACE_ID, CF_API_TOKEN) are set. The scraped data will be lost when the action completes.");
            process.exit(1);
        }

        if (process.env.LOGIN_EMAIL && process.env.LOGIN_PASSWORD) {
            await sources.initializeClientWithSession();
            console.log("Login successful.");
        } else {
            console.warn("No login credentials provided. Scraping public pages only.");
        }

        if (hasCFKV) {
            console.log("Performing early check on Cloudflare KV limits...");
            const earlyCheck = await verifyKV("hindi");
            if (earlyCheck.ok === false && earlyCheck.reason.includes('429')) {
                console.error(`\nFATAL: ${earlyCheck.reason}`);
                console.error("Aborting scrape immediately to save GitHub Actions compute time and avoid needlessly hammering Einthusan.");
                process.exit(1);
            }
            console.log("Cloudflare KV is available and within limits.");
        }

        console.log("Starting full catalog fetch...");
        
        // Ensure cache is connected (ioredis connects automatically, but we might want to wait a split second)
        await new Promise(resolve => setTimeout(resolve, 500));

        const scrapeOutput = await sources.fetchRecentMoviesForAllLanguages();
        
        console.log("Scrape completely finished. Flushing pending KV writes...");
        
        await sources.forceFlushIdMaps();
        await new Promise(resolve => setTimeout(resolve, 3000)); // Give network one last moment

        if (scrapeOutput && scrapeOutput.newMoviesAdded) {
            console.log("Triggering Cloudflare Edge Purge for all catalogs...");
            await sources.triggerCloudflarePurge("all updated catalogs");
            
            console.log("Sending Webhook to Live Render Server to drop its RAM Caches...");
            try {
                const webhookUrl = 'https://einthusan.asaddon.com/api/drop-cache';
                const webhookRes = await axios.get(webhookUrl, {
                    headers: { 'Authorization': `Bearer ${process.env.CF_API_TOKEN}` },
                    timeout: 10000
                });
                if (webhookRes.data && webhookRes.data.success) {
                    console.log("✅ Render Server RAM Cache Dropped successfully.");
                } else {
                    console.warn("⚠️ Webhook succeeded, but returned unexpected response:", webhookRes.data);
                }
            } catch (webhookErr) {
                console.error("❌ Failed to send Webhook to Render Server:", webhookErr.message);
            }
        } else {
            console.log("No new movies found. Skipping Webhook to Live Render Server.");
        }

        // ============================================================
        // VERIFICATION: Check that each language catalog is in KV
        // ============================================================
        if (hasCFKV) {
            const { langs } = require('../config');
            console.log("\n=== KV Verification Report ===");
            let allPassed = true;

            for (const lang of langs) {
                const result = await verifyKV(lang);
                if (result.ok) {
                    console.log(`  ✅ ${lang.padEnd(12)} → ${(result.bytes / 1024).toFixed(1)} KB stored in KV`);
                } else {
                    console.error(`  ❌ ${lang.padEnd(12)} → FAILED: ${result.reason}`);
                    allPassed = false;
                }
            }

            console.log("==============================\n");

            if (!allPassed) {
                console.error("VERIFICATION FAILED: One or more language catalogs were not confirmed in KV.");
                process.exit(1);
            }

            console.log("All catalogs verified in Cloudflare KV successfully!");
        } else {
            console.log("Skipping KV verification (Redis mode or no KV credentials).");
        }

        process.exit(0);

    } catch (err) {
        console.error("Scraping failed:", err);
        process.exit(1);
    }
}

main();
