const { test } = require('node:test');
const assert = require('node:assert');
const { resolveTextureRef, textureRefToPath } = require('./modelResolver');

// readModel(ns, path) -> model json | null  (jar/dir soyutlaması)
function fakeReader(models) {
  return (ns, p) => models[`${ns}:${p}`] || null;
}

test('duz item layer0 dokusunu cozer', () => {
  const read = fakeReader({
    'minecraft:item/diamond': { parent: 'minecraft:item/generated', textures: { layer0: 'minecraft:item/diamond' } },
  });
  assert.strictEqual(resolveTextureRef(read, 'minecraft', 'diamond'), 'minecraft:item/diamond');
});

test('parent zinciri uzerinden generated cozer', () => {
  const read = fakeReader({
    'create:item/cogwheel': { parent: 'item/generated', textures: { layer0: 'create:item/cogwheel' } },
  });
  assert.strictEqual(resolveTextureRef(read, 'create', 'cogwheel'), 'create:item/cogwheel');
});

test('blok itemda yuz dokusunu (all/side/top) secer', () => {
  const read = fakeReader({
    'minecraft:item/dirt': { parent: 'minecraft:block/dirt' },
    'minecraft:block/dirt': { parent: 'block/cube_all', textures: { all: 'minecraft:block/dirt' } },
  });
  assert.strictEqual(resolveTextureRef(read, 'minecraft', 'dirt'), 'minecraft:block/dirt');
});

test('cozulemezse null', () => {
  assert.strictEqual(resolveTextureRef(fakeReader({}), 'x', 'yok'), null);
});

test('textureRefToPath asset yolunu uretir', () => {
  assert.strictEqual(textureRefToPath('minecraft:block/dirt'), 'assets/minecraft/textures/block/dirt.png');
  assert.strictEqual(textureRefToPath('create:item/cogwheel'), 'assets/create/textures/item/cogwheel.png');
});
