const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const detector = require('./detector');
const scriptGenerator = require('./scriptGenerator');
const validator = require('./validator');

function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'knozy-detect-'));
}

// ── Detector: Fabric ─────────────────────────────────────────────────────────

test('fabric: manifest modLoaders kimliğinden tespit edilir', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
        minecraft: { version: '1.20.1', modLoaders: [{ id: 'fabric-0.16.9', primary: true }] },
        files: [],
    }), 'utf8');

    const det = detector.detect(dir);
    assert.strictEqual(det.loader, 'fabric');
    assert.strictEqual(det.loaderVersion, '0.16.9');
    assert.strictEqual(det.startupMode, 'fabric');
    assert.strictEqual(det.mcVersion, '1.20.1');
});

test('fabric: launcher jar varlığından tespit edilir', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'fabric-server-launch.jar'), '', 'utf8');
    const det = detector.detect(dir);
    assert.strictEqual(det.loader, 'fabric');
    assert.strictEqual(det.startupMode, 'fabric');
});

test('forge tespiti fabric eklemesinden etkilenmez', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
        minecraft: { version: '1.20.1', modLoaders: [{ id: 'forge-47.2.0', primary: true }] },
        files: [],
    }), 'utf8');

    const det = detector.detect(dir);
    assert.strictEqual(det.loader, 'forge');
    assert.strictEqual(det.loaderVersion, '47.2.0');
    assert.strictEqual(det.startupMode, 'new');
});

test('yerel forge installer jar adından loader tespit edilir (elle paket)', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'forge-1.20.1-47.2.0-installer.jar'), '', 'utf8');
    const det = detector.detect(dir);
    assert.strictEqual(det.loader, 'forge');
    assert.strictEqual(det.loaderVersion, '1.20.1-47.2.0');
    assert.strictEqual(det.startupMode, 'new');
});

test('yerel neoforge installer jar adından loader tespit edilir', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'neoforge-21.1.77-installer.jar'), '', 'utf8');
    const det = detector.detect(dir);
    assert.strictEqual(det.loader, 'neoforge');
    assert.strictEqual(det.loaderVersion, '21.1.77');
});

// ── ScriptGenerator: Fabric ──────────────────────────────────────────────────

test('fabric start.sh launcher jar ile üretilir', () => {
    const sh = scriptGenerator.generateStartSh('fabric', 'fabric', { maxRam: '6G', minRam: '3G' });
    assert.match(sh, /-Xmx6G -Xms3G -jar fabric-server-launch\.jar nogui/);

    const bat = scriptGenerator.generateStartBat('fabric', 'fabric', {});
    assert.match(bat, /fabric-server-launch\.jar nogui/);
});

// ── Validator: indirilebilir installer + fabric ─────────────────────────────

test('validator: loader sürümü biliniyorsa missing_libraries yerine installer_not_run', () => {
    const dir = tmpDir();
    const issues = validator._checkLibraries(dir, [], { loader: 'forge', loaderVersion: '47.2.0' });
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].id, 'installer_not_run');
    assert.strictEqual(issues[0].canSkip, false);
});

test('validator: loader sürümü bilinmiyorsa missing_libraries kalır', () => {
    const dir = tmpDir();
    const issues = validator._checkLibraries(dir, [], { loader: 'forge', loaderVersion: null });
    assert.strictEqual(issues[0].id, 'missing_libraries');
});

test('validator: fabric launcher yoksa installer_not_run, varsa sorun yok', () => {
    const dir = tmpDir();
    let issues = validator._checkLibraries(dir, [], { loader: 'fabric', loaderVersion: '0.16.9' });
    assert.strictEqual(issues[0].id, 'installer_not_run');
    assert.strictEqual(issues[0].meta.loader, 'fabric');

    issues = validator._checkLibraries(dir, ['fabric-server-launch.jar'], { loader: 'fabric', loaderVersion: '0.16.9' });
    assert.strictEqual(issues.length, 0);
});
