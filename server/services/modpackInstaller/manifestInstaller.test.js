const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mi = require('./manifestInstaller');

function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'knozy-manifest-'));
}

function writeManifest(dir, manifest) {
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest), 'utf8');
}

const SAMPLE = {
    name: 'Test Pack',
    minecraft: {
        version: '1.20.1',
        modLoaders: [{ id: 'forge-47.2.0', primary: true }],
    },
    overrides: 'overrides',
    files: [
        { projectID: 100, fileID: 1001, required: true },
        { projectID: 200, fileID: 2001, required: true },
        { projectID: 300, fileID: 3001, required: false },
    ],
};

test('parseLoaderId tüm loader tiplerini ayrıştırır', () => {
    assert.deepStrictEqual(mi.parseLoaderId('forge-47.2.0'), { type: 'forge', version: '47.2.0' });
    assert.deepStrictEqual(mi.parseLoaderId('neoforge-21.1.77'), { type: 'neoforge', version: '21.1.77' });
    assert.deepStrictEqual(mi.parseLoaderId('fabric-0.16.9'), { type: 'fabric', version: '0.16.9' });
    assert.deepStrictEqual(mi.parseLoaderId('quilt-0.27.0'), { type: 'quilt', version: '0.27.0' });
    assert.strictEqual(mi.parseLoaderId('bilinmeyen').type, 'unknown');
    assert.strictEqual(mi.parseLoaderId(null).type, 'unknown');
});

test('parseManifest geçerli manifest okur', () => {
    const dir = tmpDir();
    writeManifest(dir, SAMPLE);
    const m = mi.parseManifest(dir);
    assert.strictEqual(m.mcVersion, '1.20.1');
    assert.deepStrictEqual(m.loader, { type: 'forge', version: '47.2.0' });
    assert.strictEqual(m.files.length, 3);
    assert.strictEqual(m.files[2].required, false);
    assert.strictEqual(m.overridesDir, 'overrides');
});

test('isManifestPack: manifest yoksa veya bozuksa false', () => {
    const dir = tmpDir();
    assert.strictEqual(mi.isManifestPack(dir), false);
    fs.writeFileSync(path.join(dir, 'manifest.json'), 'bozuk json', 'utf8');
    assert.strictEqual(mi.isManifestPack(dir), false);
    writeManifest(dir, SAMPLE);
    assert.strictEqual(mi.isManifestPack(dir), true);
});

test('modsLookInstalled: yeterli jar varsa true, yoksa false', () => {
    const dir = tmpDir();
    writeManifest(dir, SAMPLE);
    const manifest = mi.parseManifest(dir);

    assert.strictEqual(mi.modsLookInstalled(dir, manifest), false, 'mods klasörü yokken');

    fs.mkdirSync(path.join(dir, 'mods'));
    assert.strictEqual(mi.modsLookInstalled(dir, manifest), false, 'mods boşken');

    // 2 zorunlu mod var; %50 eşik → 1 jar yeterli
    fs.writeFileSync(path.join(dir, 'mods', 'a.jar'), '');
    assert.strictEqual(mi.modsLookInstalled(dir, manifest), true);
});

test('applyOverrides içeriği köke kopyalar ve overrides klasörünü siler', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'overrides', 'config'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'overrides', 'config', 'a.toml'), 'x=1', 'utf8');
    fs.writeFileSync(path.join(dir, 'overrides', 'options.txt'), 'y', 'utf8');

    const count = mi.applyOverrides(dir, 'overrides');
    assert.strictEqual(count, 2);
    assert.strictEqual(fs.readFileSync(path.join(dir, 'config', 'a.toml'), 'utf8'), 'x=1');
    assert.ok(fs.existsSync(path.join(dir, 'options.txt')));
    assert.ok(!fs.existsSync(path.join(dir, 'overrides')));
});

test('downloadMods: batch detaylarla indirir, eksikleri raporlar', async () => {
    const dir = tmpDir();
    writeManifest(dir, SAMPLE);
    const manifest = mi.parseManifest(dir);

    const downloadedTo = [];
    const cf = {
        // Batch: 1001 indirilebilir, 2001 dağıtım kapalı (downloadUrl null); 3001 required=false → istenmez
        apiRequestPost: async (endpoint, body) => {
            assert.strictEqual(endpoint, '/v1/mods/files');
            assert.deepStrictEqual(body.fileIds, [1001, 2001]);
            return {
                data: [
                    { id: 1001, fileName: 'modA.jar', downloadUrl: 'https://cdn/modA.jar' },
                    { id: 2001, fileName: 'modB.jar', downloadUrl: null },
                ],
            };
        },
        apiRequest: async () => { throw new Error('tekli GET beklenmiyordu'); },
        downloadFile: async (url, dest) => {
            downloadedTo.push(dest);
            fs.writeFileSync(dest, 'jar');
        },
    };

    const res = await mi.downloadMods(dir, manifest, { cf });

    assert.strictEqual(res.downloaded, 1);
    assert.strictEqual(res.failed.length, 1);
    assert.strictEqual(res.failed[0].fileID, 2001);
    assert.match(res.failed[0].reason, /Dağıtım kapalı/);
    assert.ok(downloadedTo[0].endsWith(path.join('mods', 'modA.jar')));

    // Eksik raporu yazılmış ve CurseForge linki içeriyor
    const report = fs.readFileSync(path.join(dir, 'eksik-modlar.txt'), 'utf8');
    assert.match(report, /modB\.jar/);
    assert.match(report, /curseforge\.com\/projects\/200/);
});

test('downloadMods: batch düşerse tekli GET fallback çalışır', async () => {
    const dir = tmpDir();
    writeManifest(dir, { ...SAMPLE, files: [{ projectID: 100, fileID: 1001, required: true }] });
    const manifest = mi.parseManifest(dir);

    const cf = {
        apiRequestPost: async () => { throw new Error('batch kapalı'); },
        apiRequest: async (endpoint) => {
            assert.strictEqual(endpoint, '/v1/mods/100/files/1001');
            return { data: { id: 1001, fileName: 'modA.jar', downloadUrl: 'https://cdn/modA.jar' } };
        },
        downloadFile: async (url, dest) => fs.writeFileSync(dest, 'jar'),
    };

    const res = await mi.downloadMods(dir, manifest, { cf });
    assert.strictEqual(res.downloaded, 1);
    assert.strictEqual(res.failed.length, 0);
});

test('downloadMods: indirme hatasında retry sonrası eksik olarak raporlar', async () => {
    const dir = tmpDir();
    writeManifest(dir, { ...SAMPLE, files: [{ projectID: 100, fileID: 1001, required: true }] });
    const manifest = mi.parseManifest(dir);

    let attempts = 0;
    const cf = {
        apiRequestPost: async () => ({ data: [{ id: 1001, fileName: 'modA.jar', downloadUrl: 'https://cdn/a.jar' }] }),
        apiRequest: async () => ({ data: null }),
        downloadFile: async () => { attempts++; throw new Error('bağlantı koptu'); },
    };

    const res = await mi.downloadMods(dir, manifest, { cf });
    assert.strictEqual(attempts, 3, '1 deneme + 2 retry');
    assert.strictEqual(res.failed.length, 1);
    assert.match(res.failed[0].reason, /İndirme hatası/);
});
