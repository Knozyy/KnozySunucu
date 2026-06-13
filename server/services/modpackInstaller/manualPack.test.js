const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mp = require('./manualPack');

test('classifyJar: loader/sunucu/installer jar → kök', () => {
    assert.strictEqual(mp.classifyJar('forge-1.20.1-47.2.0-installer.jar'), 'root');
    assert.strictEqual(mp.classifyJar('neoforge-21.1.77-installer.jar'), 'root');
    assert.strictEqual(mp.classifyJar('fabric-server-launch.jar'), 'root');
    assert.strictEqual(mp.classifyJar('server.jar'), 'root');
    assert.strictEqual(mp.classifyJar('minecraft_server.1.20.1.jar'), 'root');
});

test('classifyJar: normal mod jar → mod', () => {
    assert.strictEqual(mp.classifyJar('jei-1.20.1-15.2.0.jar'), 'mod');
    assert.strictEqual(mp.classifyJar('create-1.20.1.jar'), 'mod');
    assert.strictEqual(mp.classifyJar('sodium-fabric-0.5.8.jar'), 'mod');
});

test('slugify: türkçe/boşluk/özel karakter → güvenli slug', () => {
    assert.strictEqual(mp.slugify('Benim Modpaketim 2!'), 'benim-modpaketim-2');
    assert.strictEqual(mp.slugify('  AllTheMods 9  '), 'allthemods-9');
    assert.strictEqual(mp.slugify('---'), 'modpack');
    assert.strictEqual(mp.slugify(''), 'modpack');
});

test('placeFile: zip kök dosyası, jar mod → mods/, jar server → kök, config → kök', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'knozy-manual-'));
    fs.mkdirSync(path.join(dir, 'mods'), { recursive: true });

    // Geçici kaynak dosyalar (multer'ın diske yazdığını taklit)
    const src = (name, content) => {
        const p = path.join(os.tmpdir(), `src-${Date.now()}-${name}`);
        fs.writeFileSync(p, content);
        return p;
    };

    const modSrc = src('jei.jar', 'modjar');
    let r = mp.placeFile(dir, 'jei-1.20.1.jar', modSrc);
    assert.strictEqual(r.target, 'mods/');
    assert.ok(fs.existsSync(path.join(dir, 'mods', 'jei-1.20.1.jar')));

    const serverSrc = src('server.jar', 'serverjar');
    r = mp.placeFile(dir, 'server.jar', serverSrc);
    assert.strictEqual(r.target, 'kök');
    assert.ok(fs.existsSync(path.join(dir, 'server.jar')));

    const cfgSrc = src('cfg.toml', 'x=1');
    r = mp.placeFile(dir, 'server.properties', cfgSrc);
    assert.ok(fs.existsSync(path.join(dir, 'server.properties')));

    [modSrc, serverSrc, cfgSrc].forEach(p => { try { fs.unlinkSync(p); } catch {} });
});

test('placeFile: olmayan profil hata fırlatır', () => {
    const p = path.join(os.tmpdir(), `src-${Date.now()}.jar`);
    fs.writeFileSync(p, 'x');
    assert.throws(() => mp.placeFile(path.join(os.tmpdir(), 'yok-xyz'), 'a.jar', p), /profili bulunamadı/);
    try { fs.unlinkSync(p); } catch {}
});

test('listFiles: kök ve mods ayrı listelenir, gizli dosyalar atlanır', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'knozy-manual-'));
    fs.mkdirSync(path.join(dir, 'mods'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'server.jar'), '');
    fs.writeFileSync(path.join(dir, '.gizli'), '');
    fs.writeFileSync(path.join(dir, 'mods', 'a.jar'), '');
    fs.writeFileSync(path.join(dir, 'mods', 'notes.txt'), '');

    const r = mp.listFiles(dir);
    assert.ok(r.root.includes('server.jar'));
    assert.ok(!r.root.includes('.gizli'));
    assert.deepStrictEqual(r.mods, ['a.jar']); // sadece .jar
});
