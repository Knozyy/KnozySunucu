/**
 * Discord Lag Panosu
 * ──────────────────
 * Seçilen Discord kanalında TEK mesaj tutar ve her yeni atıf taramasından sonra
 * aynı mesajı DÜZENLER (spam yok). İçerik: "Ortalama" (adil kanıt medyanları —
 * etiket kullanıcı tercihiyle 'Ortalama') ve "Son Tarama" ilk-5 ms listeleri.
 * Ayarlar app_settings: lagboard_guild_id / lagboard_channel_id / lagboard_message_id.
 * buildEmbed saf ve birim testlidir; REST çağrıları discordBotService üzerinden.
 */
const { getDb } = require('../db/database');

const KEYS = { guild: 'lagboard_guild_id', channel: 'lagboard_channel_id', message: 'lagboard_message_id' };
const TOP_N = 5;
const DEBOUNCE_MS = 2000;

function getSetting(key) {
    try { const r = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key); return r?.value || null; }
    catch { return null; }
}
function setSetting(key, value) {
    try {
        getDb().prepare(`INSERT INTO app_settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`).run(key, value ?? '');
    } catch { /* ignore */ }
}

// Stil A görsel sabitleri: madalya sırası + lidere oranlı 10'luk bar
const RANK_EMOJI = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
const BAR_LEN = 10;
const COLOR = { healthy: 0x2ecc71, lagging: 0xe74c3c, unknown: 0x95a5a6 };

// İlk-5 bloğu: ms > 0, büyükten küçüğe; her giriş 2 satır —
// "🥇 **isim**" + "　▰▰▰▱… `11.2 ms`" (bar lidere oranlı, en az 1 dolu blok)
function top5Block(rows, msKey) {
    const top = (rows || [])
        .filter(r => Number(r[msKey]) > 0)
        .sort((a, b) => Number(b[msKey]) - Number(a[msKey]))
        .slice(0, TOP_N);
    if (!top.length) return null;
    const leader = Number(top[0][msKey]);
    return top.map((r, i) => {
        const v = Number(r[msKey]);
        const filled = Math.max(1, Math.round(BAR_LEN * v / leader));
        const bar = '▰'.repeat(filled) + '▱'.repeat(BAR_LEN - filled);
        return `${RANK_EMOJI[i]} **${r.owner}**\n　${bar} \`${v.toFixed(1)} ms\``;
    }).join('\n');
}

/** Saf embed üretici — { evidence, lastScan } → Discord embed objesi (Stil A). */
function buildEmbed({ evidence, lastScan }) {
    // 📊 Ortalama (adil kanıt medyanları; etiket 'Ortalama')
    let avgText;
    if (!evidence || evidence.insufficient) {
        avgText = `⏳ Yeterli veri yok (en az ${evidence?.minScans ?? 3} lag-taraması gerekir).`;
    } else {
        avgText = top5Block([...(evidence.flagged || []), ...(evidence.watch || [])], 'medianMs')
            || '✅ Kayda değer yük yok — sunucu temiz.';
    }

    // ⏱️ Son Tarama (v2: totalMs, eski kayıt: ms) — sağlıklı anda alındıysa 'teşhis'
    // + durum satırı ve embed rengi son taramanın MSPT'sinden türetilir
    let lastTitle = '⏱️ Son Tarama';
    let lastText = '📭 Henüz tarama yok.';
    let statusLine = 'durum: ⚪ bilinmiyor';
    let color = COLOR.unknown;
    if (lastScan && lastScan.evidence && lastScan.evidence.ok !== false) {
        const ev = lastScan.evidence;
        const msKey = ev.v === 2 ? 'totalMs' : 'ms';
        lastText = top5Block(ev.owners, msKey) || '✅ Sahipli yük yok (yük claimsiz/wild).';
        const t = new Date(lastScan.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        const msptWarn = evidence?.msptWarn ?? 52;
        const healthy = lastScan.mspt_at == null || lastScan.mspt_at < msptWarn;
        const msptTxt = lastScan.mspt_at != null ? ` · MSPT ${Math.round(lastScan.mspt_at)}` : '';
        lastTitle = `⏱️ Son Tarama — ${t}${msptTxt}${healthy ? ' · teşhis' : ''}`;
        color = healthy ? COLOR.healthy : COLOR.lagging;
        statusLine = healthy
            ? `durum: 🟢 sağlıklı${msptTxt}`
            : `durum: 🔴 zorlanıyor${msptTxt}`;
    }

    return {
        title: '🛡️ Lag Sıralaması',
        color,
        description: `${statusLine}\nson güncelleme: <t:${Math.floor(Date.now() / 1000)}:R>`,
        fields: [
            { name: `📊 Ortalama — son ${evidence?.windowScans ?? 6} lag-taraması`, value: avgText },
            { name: lastTitle, value: lastText },
        ],
        footer: { text: 'Knozy Sunucu Paneli' },
        timestamp: new Date().toISOString(),
    };
}

class LagBoardService {
    constructor() { this._timer = null; }

    status() {
        const guildId = getSetting(KEYS.guild), channelId = getSetting(KEYS.channel), messageId = getSetting(KEYS.message);
        return { configured: !!(channelId && messageId), guildId, channelId, messageId };
    }

    _payload() {
        // Lazy require — lagGuard → probe → lagBoardService döngüsünü kırar
        let evidence = null, lastScan = null;
        try { evidence = require('./lagGuard').getAttributionEvidence(); } catch { /* ignore */ }
        try { lastScan = require('./lagGuard/attribution/probe').list(1)[0] || null; } catch { /* ignore */ }
        return { embeds: [buildEmbed({ evidence, lastScan })] };
    }

    /** Panoyu kur: kanala mesaj at + ID'leri kaydet. */
    async setup(guildId, channelId) {
        if (!guildId || !channelId) throw new Error('Sunucu ve kanal seçimi gerekli.');
        const discord = require('./discordBotService');
        const r = await discord.sendChannelMessage(channelId, this._payload());
        if (!r.ok || !r.id) {
            if (r.statusCode === 403) throw new Error('Bot bu kanala yazamıyor — kanal izinlerini kontrol et (Mesaj Gönder).');
            throw new Error(`Mesaj gönderilemedi (HTTP ${r.statusCode ?? 'bağlantı yok'}). Bot token/kanal doğru mu?`);
        }
        setSetting(KEYS.guild, guildId);
        setSetting(KEYS.channel, channelId);
        setSetting(KEYS.message, r.id);
        return { ok: true, messageId: r.id };
    }

    /** Panoyu tazele: mesajı düzenle; silinmişse (404) yenisini at. */
    async refresh() {
        const { configured, channelId, messageId } = this.status();
        if (!configured) return { ok: false, note: 'Pano kurulmamış.' };
        const discord = require('./discordBotService');
        const payload = this._payload();
        const r = await discord.editChannelMessage(channelId, messageId, payload);
        if (r.ok) return { ok: true, edited: true };
        if (r.statusCode === 404) {
            // Mesaj elle silinmiş — yenisini at
            const s = await discord.sendChannelMessage(channelId, payload);
            if (s.ok && s.id) { setSetting(KEYS.message, s.id); return { ok: true, recreated: true }; }
        }
        return { ok: false, note: `Güncellenemedi (HTTP ${r.statusCode ?? 'bağlantı yok'}).` };
    }

    /** Tarama kaydı sonrası debounce'lu tazeleme (fire-and-forget). */
    scheduleRefresh() {
        if (!this.status().configured) return;
        if (this._timer) clearTimeout(this._timer);
        this._timer = setTimeout(() => {
            this._timer = null;
            this.refresh().catch(() => { /* sessiz — pano tarama akışını asla bozmaz */ });
        }, DEBOUNCE_MS);
        if (this._timer.unref) this._timer.unref();
    }

    /** Panoyu kaldır: mesajı sil (best-effort) + ayarları temizle. */
    async remove() {
        const { channelId, messageId } = this.status();
        if (channelId && messageId) {
            try { await require('./discordBotService').deleteChannelMessage(channelId, messageId); } catch { /* ignore */ }
        }
        setSetting(KEYS.guild, ''); setSetting(KEYS.channel, ''); setSetting(KEYS.message, '');
        return { ok: true };
    }
}

const instance = new LagBoardService();
instance.buildEmbed = buildEmbed; // test + dış kullanım
module.exports = instance;
module.exports.buildEmbed = buildEmbed;
