const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const jvmSync = require('./jvmSync');
const scriptGenerator = require('./scriptGenerator');

function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'knozy-jvm-'));
}

function makeNewModePack(dir) {
    // Modern Forge görünümü: manifest + libraries/net/minecraftforge
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
        minecraft: { version: '1.20.1', modLoaders: [{ id: 'forge-47.2.0', primary: true }] },
        files: [],
    }), 'utf8');
}

test('new modda user_jvm_args.txt panel değerleriyle yeniden yazılır', () => {
    const dir = tmpDir();
    makeNewModePack(dir);
    // Kurulumdan kalan eski değerli dosya
    fs.writeFileSync(path.join(dir, 'user_jvm_args.txt'), '-Xmx4G\n-Xms2G\n', 'utf8');

    const res = jvmSync.sync(dir, { maxRam: '12G', minRam: '6G' });

    const content = fs.readFileSync(path.join(dir, 'user_jvm_args.txt'), 'utf8');
    assert.match(content, /-Xmx12G/);
    assert.match(content, /-Xms6G/);
    assert.ok(!content.includes('-Xmx4G'));
    assert.ok(res.applied.some(a => a.includes('user_jvm_args')));
});

test('özel jvm argümanları dosyaya satır satır eklenir', () => {
    const dir = tmpDir();
    makeNewModePack(dir);

    jvmSync.sync(dir, { maxRam: '8G', minRam: '4G', jvmArgs: '-XX:+UseZGC -Dfml.readTimeout=180' });

    const content = fs.readFileSync(path.join(dir, 'user_jvm_args.txt'), 'utf8');
    assert.match(content, /-XX:\+UseZGC/);
    assert.match(content, /-Dfml\.readTimeout=180/);
    assert.match(content, /-Xmx8G/, 'özel argümanlarda bellek yoksa panel değerleri yazılır');
});

test('özel argümanlarda -Xmx varsa panel bellek satırları yazılmaz (çakışma olmasın)', () => {
    const out = scriptGenerator.generateUserJvmArgs('8G', '4G', '-Xmx10G -Xms5G');
    assert.ok(!out.includes('-Xmx8G'));
    assert.match(out, /-Xmx10G/);
});

test('panel imzalı start.sh güncel RAM ile yeniden üretilir', () => {
    const dir = tmpDir();
    // Eski mod forge: jar adından tespit (libraries yok, run.sh yok)
    fs.writeFileSync(path.join(dir, 'forge-1.16.5-36.2.39.jar'), '', 'utf8');
    fs.writeFileSync(path.join(dir, 'start.sh'),
        scriptGenerator.generateStartSh('forge', 'old', { maxRam: '4G', minRam: '2G', jarName: 'forge-1.16.5-36.2.39.jar' }), 'utf8');

    const res = jvmSync.sync(dir, { maxRam: '10G', minRam: '5G' });

    const content = fs.readFileSync(path.join(dir, 'start.sh'), 'utf8');
    assert.match(content, /-Xmx10G/);
    assert.ok(res.applied.some(a => a.includes('script')));
});

test('paketin kendi scriptine dokunulmaz, uyarı döner', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'forge-1.16.5-36.2.39.jar'), '', 'utf8');
    const packScript = '#!/bin/bash\njava -Xmx3G -jar forge-1.16.5-36.2.39.jar nogui\n';
    fs.writeFileSync(path.join(dir, 'startserver.sh'), packScript, 'utf8');

    const res = jvmSync.sync(dir, { maxRam: '10G', minRam: '5G' });

    assert.strictEqual(fs.readFileSync(path.join(dir, 'startserver.sh'), 'utf8'), packScript, 'paket scripti değişmemeli');
    assert.ok(res.warnings.length > 0);
    assert.match(res.warnings[0], /startserver\.sh/);
});

test('geçersiz yol kibarca uyarı döner', () => {
    const res = jvmSync.sync(path.join(os.tmpdir(), 'olmayan-dizin-xyz'), { maxRam: '4G' });
    assert.strictEqual(res.applied.length, 0);
    assert.ok(res.warnings.length > 0);
});
