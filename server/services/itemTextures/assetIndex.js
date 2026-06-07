const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

/** mods/*.jar tarayıp modid → jarPath haritası kurar (assets/<modid>/ öneklerinden). */
function buildModIndex(modsDir) {
  const map = new Map();
  if (!fs.existsSync(modsDir)) return map;
  const jars = fs.readdirSync(modsDir).filter(f => f.toLowerCase().endsWith('.jar'));
  for (const jar of jars) {
    const full = path.join(modsDir, jar);
    try {
      const entries = new AdmZip(full).getEntries();
      for (const e of entries) {
        const m = e.entryName.match(/^assets\/([^/]+)\//);
        if (m && !map.has(m[1])) map.set(m[1], full);
      }
    } catch { /* bozuk jar atla */ }
  }
  return map;
}

module.exports = { buildModIndex };
