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
const _zipCache = new Map(); // jarPath → AdmZip (LRU: en fazla ZIP_CACHE_MAX jar bellekte)
const ZIP_CACHE_MAX = 6;     // her AdmZip tüm jar'ı RAM'de tutar; sınırsız cache RAM'i şişirir

async function _init(serverPath) {
  if (_ready) return _ready;
  _ready = (async () => {
    _modIndex = buildModIndex(path.join(serverPath, 'mods'));
    _vanillaAssets = await ensureVanilla(serverPath, CACHE_ROOT);
  })();
  return _ready;
}

/** Sunucu açılışında çağrılır: vanilla jar'ı arka planda önceden indirir (ilk açılış beklemesini önler). */
function warmUp(serverPath) {
  if (!serverPath) return;
  _init(serverPath).catch(() => { /* sessizce geç */ });
}

// Jar'ı aç ve LRU cache'te tut (en fazla ZIP_CACHE_MAX; eskiyi at → RAM kontrollü)
function _getZip(jarPath) {
  let zip = _zipCache.get(jarPath);
  if (zip) {
    // LRU dokunuşu: en sona taşı (en yeni kullanılan)
    _zipCache.delete(jarPath);
    _zipCache.set(jarPath, zip);
    return zip;
  }
  zip = new AdmZip(jarPath);
  _zipCache.set(jarPath, zip);
  // Sınır aşıldıysa en eski jar'ı düşür (GC belleği geri alır)
  while (_zipCache.size > ZIP_CACHE_MAX) {
    _zipCache.delete(_zipCache.keys().next().value);
  }
  return zip;
}

// Belirli ns için model okuyucu (vanilla dir veya cache'li jar)
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
  const zip = _getZip(jar);
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
  const entry = _getZip(jar).getEntry(assetPath);
  return entry ? entry.getData() : null;
}

/** itemId ("modid:name") → cache'li PNG yolu | null. Çözülen PNG diske yazılır, tekrar çözülmez. */
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

module.exports = { getItemTexturePath, warmUp };
