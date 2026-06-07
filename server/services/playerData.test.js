const { test } = require('node:test');
const assert = require('node:assert');
const { normalizePlayerNbt } = require('./playerData');

// 1.20.5+ data-component formatını taklit eden sadeleştirilmiş NBT
const sample = {
  Inventory: [
    { Slot: 0, id: 'minecraft:diamond_sword', count: 1,
      components: { 'minecraft:enchantments': { levels: { 'minecraft:sharpness': 5 } }, 'minecraft:damage': 120, 'minecraft:max_damage': 1561 } },
    { Slot: 8, id: 'minecraft:cooked_beef', count: 32 },
    { Slot: 103, id: 'minecraft:diamond_helmet', count: 1 },   // head
    { Slot: 100, id: 'minecraft:diamond_boots', count: 1 },    // feet
    { Slot: -106, id: 'minecraft:shield', count: 1 },          // offhand
  ],
  EnderItems: [ { Slot: 0, id: 'minecraft:dirt', count: 64 } ],
  Health: 18.5, foodLevel: 17, XpLevel: 30, XpTotal: 1395,
  Pos: [123.5, 64.0, -88.2], Dimension: 'minecraft:overworld', playerGameType: 0,
};

test('normalizePlayerNbt envanteri ve hotbar slotlarini ayristirir', () => {
  const r = normalizePlayerNbt(sample);
  const sword = r.inventory.find(i => i.slot === 0);
  assert.strictEqual(sword.id, 'minecraft:diamond_sword');
  assert.strictEqual(sword.count, 1);
  assert.deepStrictEqual(sword.enchants, [{ id: 'minecraft:sharpness', lvl: 5 }]);
  assert.strictEqual(sword.damage, 120);
  assert.strictEqual(sword.maxDamage, 1561);
  // 100-103 ve -106 envanterde DEĞİL, zırh/offhand'da
  assert.ok(!r.inventory.some(i => i.slot === 100 || i.slot === 103 || i.slot === -106));
});

test('normalizePlayerNbt zirh ve offhand slotlarini ayirir', () => {
  const r = normalizePlayerNbt(sample);
  assert.strictEqual(r.armor.head.id, 'minecraft:diamond_helmet');
  assert.strictEqual(r.armor.feet.id, 'minecraft:diamond_boots');
  assert.strictEqual(r.armor.chest, null);
  assert.strictEqual(r.offhand.id, 'minecraft:shield');
});

test('normalizePlayerNbt ender chest ve durum verisini cikarir', () => {
  const r = normalizePlayerNbt(sample);
  assert.strictEqual(r.enderItems[0].id, 'minecraft:dirt');
  assert.strictEqual(r.enderItems[0].count, 64);
  assert.strictEqual(r.health, 18.5);
  assert.strictEqual(r.foodLevel, 17);
  assert.strictEqual(r.xpLevel, 30);
  assert.deepStrictEqual(r.pos, { x: 123.5, y: 64.0, z: -88.2 });
  assert.strictEqual(r.dimension, 'minecraft:overworld');
});

test('normalizePlayerNbt bos/eksik veride cokmemeli', () => {
  const r = normalizePlayerNbt({});
  assert.deepStrictEqual(r.inventory, []);
  assert.deepStrictEqual(r.enderItems, []);
  assert.strictEqual(r.offhand, null);
});
