const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

/** level.dat → Data.Version.Name; bulunamazsa null. */
async function detectMcVersion(serverPath) {
  try {
    const nbt = require('prismarine-nbt');
    const file = path.join(serverPath, 'world', 'level.dat');
    if (!fs.existsSync(file)) return null;
    const { parsed } = await nbt.parse(fs.readFileSync(file));
    return nbt.simplify(parsed)?.Data?.Version?.Name || null;
  } catch { return null; }
}

/** Mojang piston-meta'dan sürüm için client jar URL'i. */
async function _clientJarUrl(version) {
  const man = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', {
    signal: AbortSignal.timeout(8000),
  }).then(r => r.json());
  const entry = man.versions.find(v => v.id === version);
  if (!entry) return null;
  const pkg = await fetch(entry.url, { signal: AbortSignal.timeout(8000) }).then(r => r.json());
  return pkg?.downloads?.client?.url || null;
}

/**
 * Vanilla assets'i cache'e indirir/çıkarır. cacheRoot/vanilla-assets/<ver>/assets/minecraft/...
 * Döner: assets dizini yolu | null (internet yok / sürüm yok).
 */
async function ensureVanilla(serverPath, cacheRoot, versionOverride) {
  const version = versionOverride || await detectMcVersion(serverPath);
  if (!version) return null;
  const dest = path.join(cacheRoot, 'vanilla-assets', version);
  const marker = path.join(dest, '.done');
  if (fs.existsSync(marker)) return path.join(dest, 'assets');
  try {
    const url = await _clientJarUrl(version);
    if (!url) return null;
    const buf = Buffer.from(await fetch(url, { signal: AbortSignal.timeout(60000) }).then(r => r.arrayBuffer()));
    const zip = new AdmZip(buf);
    fs.mkdirSync(dest, { recursive: true });
    for (const e of zip.getEntries()) {
      if (e.entryName.startsWith('assets/minecraft/textures/') ||
          e.entryName.startsWith('assets/minecraft/models/')) {
        const out = path.join(dest, e.entryName);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, e.getData());
      }
    }
    fs.writeFileSync(marker, version);
    return path.join(dest, 'assets');
  } catch { return null; }
}

module.exports = { detectMcVersion, ensureVanilla };
