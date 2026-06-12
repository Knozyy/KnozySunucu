const test = require('node:test');
const assert = require('node:assert');
const { getInstallerInfo, FABRIC_INSTALLER_FALLBACK } = require('./loaderInstaller');

test('forge: manifest sürümü (47.2.0) mc ile birleştirilir', () => {
    const info = getInstallerInfo('forge', '1.20.1', '47.2.0');
    assert.strictEqual(info.jarName, 'forge-1.20.1-47.2.0-installer.jar');
    assert.strictEqual(
        info.url,
        'https://maven.minecraftforge.net/net/minecraftforge/forge/1.20.1-47.2.0/forge-1.20.1-47.2.0-installer.jar'
    );
});

test('forge: zaten birleşik sürüm (1.20.1-47.2.0) tekrar birleştirilmez', () => {
    const info = getInstallerInfo('forge', '1.20.1', '1.20.1-47.2.0');
    assert.strictEqual(info.jarName, 'forge-1.20.1-47.2.0-installer.jar');
});

test('neoforge: modern sürüm (21.1.77) kendi koordinatında', () => {
    const info = getInstallerInfo('neoforge', '1.21.1', '21.1.77');
    assert.strictEqual(
        info.url,
        'https://maven.neoforged.net/releases/net/neoforged/neoforge/21.1.77/neoforge-21.1.77-installer.jar'
    );
});

test('neoforge: 1.20.1 dönemi (47.x) eski forge koordinatında', () => {
    const info = getInstallerInfo('neoforge', '1.20.1', '47.1.106');
    assert.strictEqual(
        info.url,
        'https://maven.neoforged.net/releases/net/neoforged/forge/1.20.1-47.1.106/forge-1.20.1-47.1.106-installer.jar'
    );
});

test('fabric: installer sürümü verilmezse fallback kullanılır', () => {
    const info = getInstallerInfo('fabric', '1.20.1', '0.16.9');
    assert.ok(info.url.includes(`fabric-installer-${FABRIC_INSTALLER_FALLBACK}.jar`));
});

test('fabric: verilen installer sürümü kullanılır', () => {
    const info = getInstallerInfo('fabric', '1.20.1', '0.16.9', '1.1.0');
    assert.strictEqual(
        info.url,
        'https://maven.fabricmc.net/net/fabricmc/fabric-installer/1.1.0/fabric-installer-1.1.0.jar'
    );
});

test('bilinmeyen loader hata fırlatır', () => {
    assert.throws(() => getInstallerInfo('quilt', '1.20.1', '1.0.0'), /Desteklenmeyen loader/);
});
