/**
 * IP → coğrafi konum. Anahtarsız ücretsiz sağlayıcı (ipwho.is) + DB cache.
 * Her IP yalnız bir kez sorgulanır (ip_geo tablosu). Özel/yerel IP'ler atlanır.
 * Oyuncuların IP'leri yalnız admin tarafından çözülür (mahremiyet).
 */

function isPrivateIp(ip) {
  if (!ip) return true;
  if (ip === '127.0.0.1' || ip === '::1') return true;
  if (ip.startsWith('::ffff:')) ip = ip.slice(7); // IPv4-mapped IPv6
  if (ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (ip.startsWith('169.254.')) return true;
  // IPv6 yerel/ULA
  const low = ip.toLowerCase();
  if (low.startsWith('fc') || low.startsWith('fd') || low.startsWith('fe80')) return true;
  return false;
}

/**
 * Varsayılan sağlayıcı: freeipapi.com (HTTPS, anahtarsız) birincil,
 * ip-api.com (HTTP) yedek. İkisi de başarısızsa null.
 */
async function _fetchProvider(ip) {
  // 1) freeipapi.com — HTTPS, anahtarsız
  try {
    const r = await fetch(`https://freeipapi.com/api/json/${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (r.ok) {
      const j = await r.json();
      if (j && (j.countryName || j.cityName)) {
        return {
          country: j.countryName || null,
          countryCode: j.countryCode || null,
          city: j.cityName || null,
          region: j.regionName || null,
          isp: j.asnOrganization || null,
          isProxy: !!j.isProxy,
        };
      }
    }
  } catch { /* yedeğe geç */ }

  // 2) ip-api.com — HTTP yedek (free tier HTTPS desteklemez; proxy/hosting alanları ücretsiz)
  try {
    const r = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city,isp,proxy,hosting`, {
      signal: AbortSignal.timeout(4000),
    });
    const j = await r.json();
    if (j && j.status === 'success') {
      return {
        country: j.country || null,
        countryCode: j.countryCode || null,
        city: j.city || null,
        region: j.regionName || null,
        isp: j.isp || null,
        isProxy: !!(j.proxy || j.hosting),
      };
    }
  } catch { /* ignore */ }

  return null;
}

/**
 * IP konumunu çöz (cache öncelikli). fetchProvider test için enjekte edilebilir.
 * @returns {Promise<{country,countryCode,city,region,isp}|null>}
 */
async function lookup(db, ip, fetchProvider = _fetchProvider) {
  if (isPrivateIp(ip)) return null;
  try {
    const cached = db.prepare('SELECT * FROM ip_geo WHERE ip = ?').get(ip);
    if (cached) {
      return {
        country: cached.country, countryCode: cached.country_code,
        city: cached.city, region: cached.region, isp: cached.isp,
        isProxy: !!cached.is_proxy,
      };
    }
  } catch { /* tablo yoksa devam */ }

  const geo = await fetchProvider(ip);
  if (!geo) return null;
  try {
    db.prepare('INSERT OR REPLACE INTO ip_geo (ip, country, country_code, city, region, isp, is_proxy, lookedup_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(ip, geo.country, geo.countryCode, geo.city, geo.region, geo.isp, geo.isProxy ? 1 : 0, Date.now());
  } catch { /* yazılamadıysa sorun değil */ }
  return { ...geo, isProxy: !!geo.isProxy };
}

/** "Şehir, Ülke" biçimi. */
function formatLocation(geo) {
  if (!geo) return null;
  return [geo.city, geo.country].filter(Boolean).join(', ') || null;
}

module.exports = { isPrivateIp, lookup, formatLocation, _fetchProvider };
