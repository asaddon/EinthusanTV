require('dotenv').config();
const sources = require('../sources.js');

async function main() {
    try {
        console.log("Starting GitHub Actions Scraping Job...");

        // Ensure REDIS_URL is present, otherwise scraping will just go to local memory and die with the action
        if (!process.env.REDIS_URL) {
            console.error("FATAL: REDIS_URL is not set. The scraped data will be lost when the action completes.");
            process.exit(1);
        }

        if (process.env.LOGIN_EMAIL && process.env.LOGIN_PASSWORD) {
            await sources.initializeClientWithSession();
            console.log("Login successful.");
        } else {
            console.warn("No login credentials provided. Scraping public pages only.");
        }

        console.log("Starting full catalog fetch...");
        
        // Ensure cache is connected (ioredis connects automatically, but we might want to wait a split second)
        await new Promise(resolve => setTimeout(resolve, 500));

        await sources.fetchRecentMoviesForAllLanguages();
        
        console.log("Scrape completely finished successfully!");
        
        // Let Redis flush any pending writes and exit gracefully
        await new Promise(resolve => setTimeout(resolve, 2000));
        process.exit(0);

    } catch (err) {
        console.error("Scraping failed:", err);
        process.exit(1);
    }
}

main();
