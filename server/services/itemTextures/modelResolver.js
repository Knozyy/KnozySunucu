const FACE_PRIORITY = ['all', 'side', 'north', 'top', 'particle', 'texture', '0'];

function _normRef(ref, ns) {
  // "modid:path" veya "path" → "modid:path"
  if (ref.includes(':')) { const [n, p] = ref.split(':'); return `${n}:${p}`; }
  return `${ns}:${ref}`;
}

function _parentNsPath(parent, ns) {
  const full = parent.includes(':') ? parent : `${ns}:${parent}`;
  const [n, p] = full.split(':');
  return { ns: n, path: p };
}

/**
 * readModel(ns, path) -> json|null soyutlamasıyla item modelinden doku ref'i çözer.
 * Düz item → layer0; blok → yüz önceliği. Bulunamazsa null.
 */
function resolveTextureRef(readModel, modid, name) {
  let cur = { ns: modid, path: `item/${name}` };
  const textures = {};
  let depth = 0;
  let sawBlock = false;

  while (cur && depth < 12) {
    const model = readModel(cur.ns, cur.path);
    if (!model) break;
    // Çocuk modelin texture'ları önce yazıldı; parent'ınkiler yalnızca eksikleri doldurur
    for (const [k, v] of Object.entries(model.textures || {})) {
      if (!(k in textures)) textures[k] = v;
    }
    if (cur.path.startsWith('block/')) sawBlock = true;

    const parent = model.parent;
    // generated/handheld → düz item, layer0 kullan
    const isGenerated = parent && /(?:^|\/)(generated|handheld)$/.test(parent);
    if (textures.layer0 && (isGenerated || !parent)) {
      return _normRef(textures.layer0, cur.ns);
    }
    if (!parent) break;
    cur = _parentNsPath(parent, cur.ns);
    depth++;
  }

  // Blok yolu: yüz önceliğine göre doku seç (değişken referansları "#..." atlanır)
  if (sawBlock || Object.keys(textures).length) {
    for (const key of FACE_PRIORITY) {
      if (textures[key] && !textures[key].startsWith('#')) return _normRef(textures[key], modid);
    }
    const first = Object.values(textures).find(v => !v.startsWith('#'));
    if (first) return _normRef(first, modid);
  }
  if (textures.layer0) return _normRef(textures.layer0, modid);
  return null;
}

/** "ns:block/dirt" → "assets/ns/textures/block/dirt.png" */
function textureRefToPath(ref) {
  const [ns, p] = ref.split(':');
  return `assets/${ns}/textures/${p}.png`;
}

module.exports = { resolveTextureRef, textureRefToPath };
