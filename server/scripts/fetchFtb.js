const https = require('https');
const fs = require('fs');
const path = require('path');

const fetchJson = (url) => new Promise((resolve, reject) => {
    https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
    }).on('error', reject);
});

async function run() {
    try {
        console.log('Fetching all FTB modpack IDs...');
        const allPacks = await fetchJson('https://api.modpacks.ch/public/modpack/all');
        const packIds = allPacks.packs;

        console.log(`Found ${packIds.length} packs. Fetching details...`);
        const result = [];

        for (let i = 0; i < packIds.length; i++) {
            const id = packIds[i];
            console.log(`[${i + 1}/${packIds.length}] Fetching pack ${id}...`);
            try {
                const packData = await fetchJson(`https://api.modpacks.ch/public/modpack/${id}`);
                result.push({
                    id: packData.id,
                    name: packData.name,
                    description: packData.synopsis,
                    installs: packData.installs,
                    plays: packData.plays,
                    updated: packData.updated,
                    versions: packData.versions.map(v => ({
                        id: v.id,
                        name: v.name,
                        updated: v.updated
                    }))
                });
            } catch (err) {
                console.error(`Failed to fetch pack ${id}:`, err.message);
            }
            // Small delay to prevent rate limiting
            await new Promise(r => setTimeout(r, 200));
        }

        const dataDir = path.join(__dirname, '../data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

        const file = path.join(dataDir, 'ftb_modpacks.json');
        fs.writeFileSync(file, JSON.stringify(result, null, 2));
        console.log(`Successfully saved ${result.length} modpacks to ${file}`);
    } catch (err) {
        console.error('Error:', err);
    }
}

run();
