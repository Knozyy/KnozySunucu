/**
 * LagGuard · Observable Probe (Faz 0)
 * ───────────────────────────────────
 * Observable modu (tasgon/observable) sunucu tarafında `observable run N` komutuyla
 * N saniyelik bir profil çalıştırır ve sonuç URL'sini konsola/sohbete basar.
 *
 * Faz 0'da amaç YALNIZCA: komutu tetiklemek ve dönen URL'yi yakalamak.
 * Dönen URL'nin makine-okunur (JSON) mı yoksa HTML rapor mu olduğu Faz 2'de
 * (atıf tasarımı) belirlenecek; bu probe o kararı vermek için veri toplar.
 */

// Observable sonuç URL'sini yakalamak için olası kalıplar.
// Sürüme göre "observ.tas.sh", "spark"-benzeri ya da yerel bir adres olabilir;
// genel bir http(s) URL yakalayıcı + observable bağlamı arıyoruz.
const URL_REGEX = /(https?:\/\/\S+)/i;
const OBSERVABLE_HINT = /observ|profil|result|rapor/i;

class ObservableProbe {
    constructor() {
        this._mc = null;
        this._pending = null; // { resolve, timer, onLine, startedAt }
    }

    attach(mcService) {
        this._mc = mcService;
    }

    isBusy() {
        return !!this._pending;
    }

    /** Sonuç URL'sinden profil id'sini çıkar: ".../p/8Vs5u" → "8Vs5u". */
    extractId(url) {
        const m = String(url || '').match(/\/p\/([A-Za-z0-9_-]+)/);
        return m ? m[1] : null;
    }

    /**
     * Observable makine-okunur veri endpoint'i: /v1/get/<id> → düz JSON
     * { data: { entities:{dim:[…]}, blocks:{dim:[…]}, ticks }, diagnostics:{duration,modLoader,…} }
     * Her entity/block: { position:{x,y,z}, type, rate (ns/tick), ticks }.
     */
    async fetchProfile(id) {
        if (!id) throw new Error('Observable id yok');
        if (typeof fetch !== 'function') throw new Error('global fetch yok (Node 18+ gerekli)');
        const url = `https://observable.tas.sh/v1/get/${id}`;
        const r = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'KnozyPanel-LagGuard' } });
        if (!r.ok) throw new Error(`Observable veri HTTP ${r.status}`);
        return r.json();
    }

    /**
     * Profili çalıştır ve sonuç URL'sini yakalamaya çalış.
     * @param {number} seconds — profil süresi
     * @returns {Promise<{ ok, url|null, lines, note }>}
     */
    runProfile(seconds = 20) {
        const mc = this._mc;
        if (!mc) return Promise.resolve({ ok: false, url: null, lines: [], note: 'Minecraft servisi bağlı değil.' });
        if (typeof mc.sendCommand !== 'function') {
            return Promise.resolve({ ok: false, url: null, lines: [], note: 'sendCommand kullanılamıyor.' });
        }
        if (this._pending) {
            return Promise.resolve({ ok: false, url: null, lines: [], note: 'Zaten çalışan bir profil var.' });
        }

        const dur = Math.max(5, Math.min(120, Number(seconds) || 20));

        return new Promise((resolve) => {
            const captured = [];
            let settled = false;

            const finish = (result) => {
                if (settled) return;
                settled = true;
                try { mc.off('log', onLine); } catch { /* ignore */ }
                clearTimeout(timer);
                this._pending = null;
                resolve(result);
            };

            const onLine = (line) => {
                const text = typeof line === 'string' ? line : (line?.data || line?.message || '');
                if (!text) return;
                if (OBSERVABLE_HINT.test(text) || URL_REGEX.test(text)) {
                    captured.push(text);
                    const m = text.match(URL_REGEX);
                    if (m && OBSERVABLE_HINT.test(text)) {
                        finish({ ok: true, url: m[1], lines: captured, note: 'Sonuç URL\'si yakalandı.' });
                    }
                }
            };

            // minecraftService 'log' event'i yayıyorsa dinle; yoksa sadece komut gönder.
            try { mc.on('log', onLine); } catch { /* ignore */ }

            // Komutu gönder
            try {
                mc.sendCommand(`observable run ${dur}`);
            } catch (e) {
                return finish({ ok: false, url: null, lines: [], note: `Komut gönderilemedi: ${e.message}` });
            }

            // Profil süresi + tampon kadar bekle
            const timer = setTimeout(() => {
                const anyUrl = captured.map(l => l.match(URL_REGEX)?.[1]).filter(Boolean)[0] || null;
                finish({
                    ok: !!anyUrl,
                    url: anyUrl,
                    lines: captured,
                    note: anyUrl
                        ? 'URL yakalandı (gecikmeli).'
                        : 'Süre doldu, URL yakalanamadı. Observable kurulu/etkin mi kontrol edin.',
                });
            }, (dur + 8) * 1000);
            if (timer.unref) timer.unref();

            this._pending = { startedAt: Date.now() };
        });
    }
}

module.exports = new ObservableProbe();
