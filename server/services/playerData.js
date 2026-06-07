const fs = require('fs');
const path = require('path');

const ARMOR_SLOTS = { 103: 'head', 102: 'chest', 101: 'legs', 100: 'feet' };
const OFFHAND_SLOT = -106;

function _enchants(components) {
  const e = components?.['minecraft:enchantments'];
  const levels = e?.levels || (e && typeof e === 'object' && !e.levels ? e : null);
  if (!levels || typeof levels !== 'object') return [];
  return Object.entries(levels).map(([id, lvl]) => ({ id, lvl: Number(lvl) }));
}

function _normalizeItem(entry) {
  const c = entry.components || {};
  return {
    slot: entry.Slot,
    id: entry.id || 'minecraft:air',
    count: entry.count ?? entry.Count ?? 1,
    enchants: _enchants(c),
    damage: c['minecraft:damage'] ?? null,
    maxDamage: c['minecraft:max_damage'] ?? null,
    customName: c['minecraft:custom_name'] ?? null,
    lore: c['minecraft:lore'] ?? null,
  };
}

/** Sadeleştirilmiş NBT (nbt.simplify çıktısı) → normalize profil objesi. Saf fonksiyon. */
function normalizePlayerNbt(s) {
  s = s || {};
  const inv = Array.isArray(s.Inventory) ? s.Inventory : [];
  const armor = { head: null, chest: null, legs: null, feet: null };
  let offhand = null;
  const inventory = [];

  for (const raw of inv) {
    const item = _normalizeItem(raw);
    if (ARMOR_SLOTS[raw.Slot]) armor[ARMOR_SLOTS[raw.Slot]] = item;
    else if (raw.Slot === OFFHAND_SLOT) offhand = item;
    else inventory.push(item);
  }

  const ender = (Array.isArray(s.EnderItems) ? s.EnderItems : []).map(_normalizeItem);
  const pos = Array.isArray(s.Pos) && s.Pos.length === 3
    ? { x: s.Pos[0], y: s.Pos[1], z: s.Pos[2] } : null;

  return {
    inventory, enderItems: ender, armor, offhand,
    health: s.Health ?? null,
    foodLevel: s.foodLevel ?? null,
    xpLevel: s.XpLevel ?? null,
    xpTotal: s.XpTotal ?? null,
    pos,
    dimension: s.Dimension ?? null,
    gameType: s.playerGameType ?? null,
  };
}

/** world/playerdata/<uuid>.dat oku → gunzip+parse → normalize. */
async function readPlayerData(serverPath, uuid) {
  const nbt = require('prismarine-nbt');
  const file = path.join(serverPath, 'world', 'playerdata', `${uuid}.dat`);
  if (!fs.existsSync(file)) return null;
  const buf = fs.readFileSync(file);
  const { parsed } = await nbt.parse(buf);
  return normalizePlayerNbt(nbt.simplify(parsed));
}

module.exports = { normalizePlayerNbt, readPlayerData };
