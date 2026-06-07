const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
const { buildModIndex } = require('./assetIndex');

test('jar icindeki assets/<modid>/ oneklerini indeksler', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mods-'));
  const zip = new AdmZip();
  zip.addFile('assets/create/models/item/cogwheel.json', Buffer.from('{}'));
  zip.addFile('assets/create/textures/item/cogwheel.png', Buffer.from('x'));
  zip.addFile('META-INF/MANIFEST.MF', Buffer.from('x'));
  zip.writeZip(path.join(dir, 'create.jar'));

  const idx = buildModIndex(dir);
  assert.strictEqual(idx.get('create'), path.join(dir, 'create.jar'));
  assert.strictEqual(idx.has('minecraft'), false);
});

test('mods klasoru yoksa bos map', () => {
  const idx = buildModIndex(path.join(os.tmpdir(), 'yok-' + Date.now()));
  assert.strictEqual(idx.size, 0);
});
