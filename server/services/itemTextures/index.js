const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { buildModIndex } = require('./assetIndex');
const { ensureVanilla } = require('./vanillaAssets');
const { resolveTextureRef, textureRefToPath } = require('./modelResolver');

const CACHE_ROOT = path.join(__dirname, '..', '..', 'cache');
const TEX_DIR = path.join(CACHE_ROOT, 'item-textures');

let _modIndex = null;       // Map<modid, jarPath>
let _vanillaAssets = null;  // assets dir yolu | null
let _ready = null;

async function _init(serverPath) {
  if (_ready) return _ready;
  _ready = (async () => {
    _modIndex = buildModIndex(path.join(serverPath, 'mods'));
    _vanillaAssets = await ensureVanilla(serverPath, CACHE_ROOT);
  })();
  return _ready;
}

// Belirli ns için model okuyucu (jar veya vanilla dir)
function _readerFor(ns) {
  if (ns === 'minecraft' && _vanillaAssets) {
    return (n, p) => {
      // p zaten "item/x" veya "block/x" formatında
      const file = path.join(_vanillaAssets, n, 'models', `${p}.json`);
      if (!fs.existsSync(file)) return null;
      try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; }
    };
  }
  const jar = _modIndex?.get(ns);
  if (!jar) return () => null;
  const zip = new AdmZip(jar);
  return (n, p) => {
    const entry = zip.getEntry(`assets/${n}/models/${p}.json`);
    if (!entry) return null;
    try { return JSON.parse(entry.getData().toString('utf-8')); } catch { return null; }
  };
}

function _readTextureBytes(ns, assetPath) {
  if (ns === 'minecraft' && _vanillaAssets) {
    const file = path.join(_vanillaAssets, assetPath.replace(/^assets\//, ''));
    return fs.existsSync(file) ? fs.readFileSync(file) : null;
  }
  const jar = _modIndex?.get(ns);
  if (!jar) return null;
  const entry = new AdmZip(jar).getEntry(assetPath);
  return entry ? entry.getData() : null;
}

/** itemId ("modid:name") → cache'li PNG yolu | null. */
async function getItemTexturePath(serverPath, itemId) {
  await _init(serverPath);
  const [ns, name] = itemId.includes(':') ? itemId.split(':') : ['minecraft', itemId];
  const safe = `${ns}__${name}`.replace(/[^a-z0-9_]/gi, '_');
  const cached = path.join(TEX_DIR, `${safe}.png`);
  if (fs.existsSync(cached)) return cached;

  const reader = _readerFor(ns);
  const ref = resolveTextureRef(reader, ns, name);
  if (!ref) return null;
  const refNs = ref.split(':')[0];
  const bytes = _readTextureBytes(refNs, textureRefToPath(ref));
  if (!bytes) return null;
  fs.mkdirSync(TEX_DIR, { recursive: true });
  fs.writeFileSync(cached, bytes);
  return cached;
}

module.exports = { getItemTexturePath };
