require('dotenv').config();
const axios = require('axios');

async function cleanKV() {
    const accountId = process.env.CF_ACCOUNT_ID;
    const namespaceId = process.env.CF_KV_NAMESPACE_ID;
    const apiToken = process.env.CF_API_TOKEN;

    if (!accountId || !namespaceId || !apiToken) {
        console.error("Missing Cloudflare KV credentials in .env");
        return;
    }

    const prefixes = ['tmdb_meta_tt', 'tmdb_is_indian_tt'];

    for (const prefix of prefixes) {
        console.log(`\nSearching for keys with prefix: ${prefix}`);
        let cursor = '';
        let totalDeleted = 0;

        do {
            try {
                // Fetch up to 1,000 keys at a time
                const listUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/keys?prefix=${prefix}${cursor ? `&cursor=${cursor}` : ''}`;
                const listRes = await axios.get(listUrl, {
                    headers: { 'Authorization': `Bearer ${apiToken}` }
                });

                if (!listRes.data || !listRes.data.success) {
                    console.error("Failed to list keys.");
                    break;
                }

                const keys = listRes.data.result.map(k => k.name);
                cursor = listRes.data.result_info.cursor;

                if (keys.length === 0) {
                    console.log(`No keys found for prefix: ${prefix}`);
                    break;
                }

                console.log(`Found ${keys.length} keys to delete...`);

                // Bulk delete up to 1,000 keys in a single network request
                const deleteUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/bulk`;
                const deleteRes = await axios.delete(deleteUrl, {
                    headers: { 
                        'Authorization': `Bearer ${apiToken}`,
                        'Content-Type': 'application/json'
                    },
                    data: keys
                });

                if (deleteRes.data && deleteRes.data.success) {
                    totalDeleted += keys.length;
                    console.log(`Successfully bulk-deleted ${keys.length} keys.`);
                } else {
                    console.error("Failed to delete keys.");
                    break;
                }

            } catch (err) {
                console.error("Error during KV cleanup:", err.response ? err.response.data : err.message);
                break;
            }
        } while (cursor);

        console.log(`Total deleted for ${prefix}: ${totalDeleted}`);
    }
    console.log("\n✅ KV Cleanup Complete! Your database is spotless.");
}

cleanKV();
