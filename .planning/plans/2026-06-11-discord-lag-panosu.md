# Discord Lag Panosu Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lag atıf "ilk 5" listelerini (Ortalama + Son Tarama) Discord'da botun tek-mesajlık canlı panosunda göstermek; her yeni taramada otomatik güncellenir.

**Architecture:** `discordBotService` JSON-gövdeli POST/PATCH + kanal listeleme + mesaj gönder/düzenle kazanır. Yeni `lagBoardService` ayarları `app_settings`'te tutar, saf `buildEmbed` üretir, `setup/refresh/remove` REST çağrılarını yapar; `probe._record` sonrası debounce'lu refresh tetiklenir. `routes/lagGuard` 5 board endpoint'i; panel Ayarlar sekmesine kurulum kartı.

**Tech Stack:** Node.js CommonJS, `node --test`, Express 5, Discord REST v10 (bot token, mevcut `https` kalıbı), React + react-query.

**Spec:** `.planning/specs/2026-06-11-discord-lag-panosu-tasarim.md`

**Çalışma dizini:** `node --test`/`npm test` → `server/` · lint/build → `client/`.

---

### Task 1: discordBotService — gövdeli istek + kanal/mesaj API'leri

**Files:**
- Modify: `server/services/discordBotService.js`

- [x] **Step 1:** `_discordApiPut(path)` metodunun ALTINA şu metodları ekle (aynı stil — sınıf içi):

```js
    /** JSON gövdeli istek (POST/PATCH) — mesaj gönderme/düzenleme için. */
    _discordApiBody(method, path, body) {
        const token = this.getDiscordToken();
        if (!token) return Promise.resolve(null);
        const payload = JSON.stringify(body || {});
        return new Promise((resolve) => {
            const opts = {
                hostname: 'discord.com',
                path: `/api/v10${path}`,
                method,
                headers: {
                    'Authorization': `Bot ${token}`,
                    'User-Agent': 'KnozyPanel (1.0)',
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                },
            };
            const req = https.request(opts, (res) => {
                let data = '';
                res.on('data', c => { data += c; });
                res.on('end', () => resolve({ statusCode: res.statusCode, data }));
            });
            req.on('error', () => resolve(null));
            req.setTimeout(8000, () => { req.destroy(); resolve(null); });
            req.write(payload);
            req.end();
        });
    }

    /** Bir guild'in METİN kanalları (lag panosu kanal seçici için). */
    async listGuildChannels(guildId) {
        if (!guildId) return [];
        const channels = await this._discordApiGet(`/guilds/${guildId}/channels`);
        if (!Array.isArray(channels)) return [];
        return channels
            .filter(c => c.type === 0)
            .map(c => ({ id: String(c.id), name: c.name, position: c.position ?? 0 }))
            .sort((a, b) => a.position - b.position);
    }

    /** Kanala mesaj gönder → { ok, id, statusCode }. */
    async sendChannelMessage(channelId, payload) {
        const r = await this._discordApiBody('POST', `/channels/${channelId}/messages`, payload);
        const ok = !!(r && r.statusCode >= 200 && r.statusCode < 300);
        let id = null;
        if (ok) { try { id = String(JSON.parse(r.data).id); } catch { /* ignore */ } }
        return { ok, id, statusCode: r?.statusCode ?? null };
    }

    /** Mevcut mesajı düzenle → { ok, statusCode } (404 = mesaj silinmiş). */
    async editChannelMessage(channelId, messageId, payload) {
        const r = await this._discordApiBody('PATCH', `/channels/${channelId}/messages/${messageId}`, payload);
        return { ok: !!(r && r.statusCode >= 200 && r.statusCode < 300), statusCode: r?.statusCode ?? null };
    }

    /** Mesajı sil (best-effort). */
    async deleteChannelMessage(channelId, messageId) {
        const r = await this._discordApiDelete(`/channels/${channelId}/messages/${messageId}`);
        return { ok: !!(r && r.statusCode >= 200 && r.statusCode < 300) };
    }
```

- [x] **Step 2: Smoke** — server/ dizininden: `node -e "const d=require('./services/discordBotService'); for (const m of ['_discordApiBody','listGuildChannels','sendChannelMessage','editChannelMessage','deleteChannelMessage']) if (typeof d[m] !== 'function') throw new Error(m); console.log('OK');"` → `OK`. Ayrıca `npm test` → 49 pass korunur.

- [x] **Step 3: Commit** (yalnızca bu dosya):

```
feat(discord): kanal/mesaj REST yardimcilari — gonder/duzenle/sil + kanal listesi

Lag panosu icin: JSON govdeli POST/PATCH (_discordApiBody), listGuildChannels
(metin kanallari), sendChannelMessage/editChannelMessage/deleteChannelMessage.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 2: lagBoardService (buildEmbed TDD) + tarama tetiği

**Files:**
- Create: `server/services/lagBoardService.js`
- Create: `server/services/lagBoardService.test.js`
- Modify: `server/services/lagGuard/attribution/probe.js` (`_record` sonuna hook)

- [x] **Step 1: Failing test** — `server/services/lagBoardService.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { buildEmbed } = require('./lagBoardService');

const EV = (over = {}) => ({
    insufficient: false, lagScanCount: 6, windowScans: 6, msptWarn: 52, minScans: 3,
    flagged: [], watch: [], wild: null, ...over,
});

test('buildEmbed: veri yokken iki bölüm de açıklayıcı', () => {
    const e = buildEmbed({ evidence: null, lastScan: null });
    assert.equal(e.title, '🛡️ Lag Sıralaması');
    assert.equal(e.fields.length, 2);
    assert.match(e.fields[0].value, /Yeterli veri yok/);
    assert.match(e.fields[1].value, /Henüz tarama yok/);
});

test('buildEmbed: yetersiz kanıt mesajı minScans içerir', () => {
    const e = buildEmbed({ evidence: EV({ insufficient: true, lagScanCount: 1 }), lastScan: null });
    assert.match(e.fields[0].value, /Yeterli veri yok/);
    assert.match(e.fields[0].value, /3/);
});

test('buildEmbed: Ortalama — flagged+watch birleşik, desc, ilk 5, >0 filtreli', () => {
    const evidence = EV({
        flagged: [{ owner: 'A', medianMs: 14 }, { owner: 'B', medianMs: 6.5 }],
        watch: [{ owner: 'C', medianMs: 3.2 }, { owner: 'D', medianMs: 20 }, { owner: 'E', medianMs: 1.1 },
                { owner: 'F', medianMs: 0 }, { owner: 'G', medianMs: 0.8 }],
    });
    const e = buildEmbed({ evidence, lastScan: null });
    const lines = e.fields[0].value.split('\n');
    assert.equal(lines.length, 5); // 7 satır → F (0) elenir, 6 aday → ilk 5
    assert.match(lines[0], /1\. \*\*D\*\* — 20 ms/);
    assert.match(lines[1], /2\. \*\*A\*\* — 14 ms/);
    assert.match(lines[4], /5\. \*\*E\*\* — 1\.1 ms/);
    assert.ok(!e.fields[0].value.includes('F'), 'medianMs=0 listeye girmemeli (>0 filtresi)');
    assert.ok(!e.fields[0].value.includes('G'), '6. aday (0.8ms) ilk-5 kesiminde elenmeli');
    assert.match(e.fields[0].name, /Ortalama/);
    assert.match(e.fields[0].name, /son 6/);
});

test('buildEmbed: Son Tarama v2 — totalMs desc ilk 5 + lag anında teşhis YOK', () => {
    const lastScan = {
        ts: Date.now(), mspt_at: 58,
        evidence: { v: 2, ok: true, owners: [
            { owner: 'X', totalMs: 3 }, { owner: 'Y', totalMs: 9 }, { owner: 'Z', totalMs: 0 },
        ] },
    };
    const e = buildEmbed({ evidence: EV(), lastScan });
    assert.match(e.fields[1].value, /1\. \*\*Y\*\* — 9 ms/);
    assert.match(e.fields[1].value, /2\. \*\*X\*\* — 3 ms/);
    assert.ok(!e.fields[1].value.includes('Z'));
    assert.match(e.fields[1].name, /MSPT 58/);
    assert.ok(!e.fields[1].name.includes('teşhis'), 'MSPT 58 ≥ 52 → teşhis etiketi olmamalı');
});

test('buildEmbed: Son Tarama eski format (ms anahtarı) + sağlıklıysa teşhis etiketi', () => {
    const lastScan = {
        ts: Date.now(), mspt_at: 30,
        evidence: { ok: true, owners: [{ owner: 'Eski', ms: 7, pct: 80 }] },
    };
    const e = buildEmbed({ evidence: EV(), lastScan });
    assert.match(e.fields[1].value, /1\. \*\*Eski\*\* — 7 ms/);
    assert.match(e.fields[1].name, /teşhis/, 'MSPT 30 < 52 → teşhis etiketi');
});
```

- [x] **Step 2: FAIL gör** — server/ dizininden `node --test services/lagBoardService.test.js` → `Cannot find module './lagBoardService'`.

- [x] **Step 3:** `server/services/lagBoardService.js` oluştur:

```js
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
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value ?? '');
    } catch { /* ignore */ }
}

// İlk-5 satırları: ms > 0, büyükten küçüğe (kullanıcı kararı: kişiler + ms, desc, ilk 5)
function top5Lines(rows, msKey) {
    const top = (rows || [])
        .filter(r => Number(r[msKey]) > 0)
        .sort((a, b) => Number(b[msKey]) - Number(a[msKey]))
        .slice(0, TOP_N);
    if (!top.length) return null;
    return top.map((r, i) => `${i + 1}. **${r.owner}** — ${r[msKey]} ms`).join('\n');
}

/** Saf embed üretici — { evidence, lastScan } → Discord embed objesi. */
function buildEmbed({ evidence, lastScan }) {
    // 📊 Ortalama (adil kanıt medyanları; etiket 'Ortalama')
    let avgText;
    if (!evidence || evidence.insufficient) {
        avgText = `Yeterli veri yok (en az ${evidence?.minScans ?? 3} lag-taraması gerekir).`;
    } else {
        avgText = top5Lines([...(evidence.flagged || []), ...(evidence.watch || [])], 'medianMs')
            || 'Kayda değer yük yok.';
    }

    // ⏱️ Son Tarama (v2: totalMs, eski kayıt: ms) — sağlıklı anda alındıysa 'teşhis'
    let lastTitle = '⏱️ Son Tarama';
    let lastText = 'Henüz tarama yok.';
    if (lastScan && lastScan.evidence && lastScan.evidence.ok !== false) {
        const ev = lastScan.evidence;
        const msKey = ev.v === 2 ? 'totalMs' : 'ms';
        lastText = top5Lines(ev.owners, msKey) || 'Sahipli yük yok.';
        const t = new Date(lastScan.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        const msptWarn = evidence?.msptWarn ?? 52;
        const healthy = lastScan.mspt_at == null || lastScan.mspt_at < msptWarn;
        lastTitle = `⏱️ Son Tarama (${t}${lastScan.mspt_at != null ? ` · MSPT ${Math.round(lastScan.mspt_at)}` : ''}${healthy ? ' · teşhis' : ''})`;
    }

    return {
        title: '🛡️ Lag Sıralaması',
        color: 0xe67e22,
        fields: [
            { name: `📊 Ortalama (son ${evidence?.windowScans ?? 6} lag-taraması)`, value: avgText },
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
```

- [x] **Step 4: PASS gör** — `node --test services/lagBoardService.test.js` → 5/5.

- [x] **Step 5: Tetik** — `server/services/lagGuard/attribution/probe.js` `_record` metodunda, `catch { /* ignore */ }` satırından SONRA (metodun sonuna, try/catch DIŞINA) ekle:

```js
        // Discord lag panosu — yeni kayıt sonrası tazele (kuruluysa; kayıt akışını asla bozmaz)
        try { require('../../lagBoardService').scheduleRefresh(); } catch { /* ignore */ }
```

- [x] **Step 6:** `npm test` → 54 pass (49 + 5), 0 fail. Smoke: `node -e "require('./services/lagBoardService'); require('./services/lagGuard/attribution/probe'); console.log('OK');"` → OK.

- [x] **Step 7: Commit** (3 dosya):

```
feat(lag-board): Discord lag panosu servisi — saf embed + kur/tazele/kaldir

buildEmbed: 'Ortalama' (adil kanit medyani, desc ilk 5, >0) + 'Son Tarama'
(v2 totalMs / eski ms, saglikli anda 'teshis' etiketi). setup/refresh/remove;
404'te mesaji yeniden olusturur; probe._record sonrasi 2sn debounce ile tazeler.
TDD: 5 birim test.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 3: API route'ları + panel kartı

**Files:**
- Modify: `server/routes/lagGuard.js`
- Modify: `client/src/pages/LagGuardPage.jsx`

- [x] **Step 1: Route'lar** — `server/routes/lagGuard.js`: en üstte `const lagGuard = require('../services/lagGuard');` satırının ALTINA ekle:

```js
const lagBoard = require('../services/lagBoardService');
const discordBotService = require('../services/discordBotService');
```

Dosyanın SONUNA, `module.exports = router;` satırından ÖNCE ekle:

```js
// ── Discord Lag Panosu ───────────────────────────────────────────────────────
router.get('/board', authMiddleware, (req, res) => {
    try { res.json(lagBoard.status()); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/board/channels', authMiddleware, async (req, res) => {
    try { res.json({ channels: await discordBotService.listGuildChannels(String(req.query.guildId || '')) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/board/setup', authMiddleware, requireRole('admin'), async (req, res) => {
    try { res.json({ message: 'Pano kuruldu', ...(await lagBoard.setup(String(req.body?.guildId || ''), String(req.body?.channelId || ''))) }); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/board/refresh', authMiddleware, requireRole('admin'), async (req, res) => {
    try { res.json(await lagBoard.refresh()); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/board', authMiddleware, requireRole('admin'), async (req, res) => {
    try { res.json(await lagBoard.remove()); } catch (e) { res.status(400).json({ error: e.message }); }
});
```

- [x] **Step 2: Panel kartı** — `client/src/pages/LagGuardPage.jsx`:

(a) Ayarlar sekmesinde, Restart-Config Kuyruğu `</Card>` kapanışı ile `{settings ? <SettingsPanel ...` arasına ekle:

```jsx
                    <LagBoardCard />
```

(b) `function EvidenceCard(...)` tanımının ALTINA yeni bileşen ekle (dosyadaki `selStyle` sabiti en altta tanımlı — kullanılabilir):

```jsx
// Discord Lag Panosu — kanal seç + kur; bot tek mesajı düzenleyerek günceller
function LagBoardCard() {
    const qc = useQueryClient();
    const [guildId, setGuildId] = useState('');
    const [channelId, setChannelId] = useState('');

    const { data: board } = useQuery({ queryKey: ['lagboard'], queryFn: () => api.get('/lag-guard/board').then(r => r.data) });
    const { data: guildsData } = useQuery({ queryKey: ['vip-guilds'], queryFn: () => api.get('/vip/guilds').then(r => r.data) });
    const { data: chData, isFetching: chLoading } = useQuery({
        queryKey: ['lagboard-channels', guildId],
        queryFn: () => api.get('/lag-guard/board/channels', { params: { guildId } }).then(r => r.data),
        enabled: !!guildId,
    });
    const guilds = guildsData?.guilds || [];
    const channels = chData?.channels || [];
    const inv = () => qc.invalidateQueries({ queryKey: ['lagboard'] });

    const setup = useMutation({
        mutationFn: () => api.post('/lag-guard/board/setup', { guildId, channelId }).then(r => r.data),
        onSuccess: () => { inv(); toast.success('Pano kuruldu — bot mesajı attı, artık otomatik güncellenecek'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Kurulamadı'),
    });
    const refresh = useMutation({
        mutationFn: () => api.post('/lag-guard/board/refresh').then(r => r.data),
        onSuccess: (d) => toast[d.ok ? 'success' : 'error'](d.ok ? 'Pano güncellendi' : (d.note || 'Güncellenemedi')),
        onError: (e) => toast.error(e.response?.data?.error || 'Güncellenemedi'),
    });
    const remove = useMutation({
        mutationFn: () => api.delete('/lag-guard/board').then(r => r.data),
        onSuccess: () => { inv(); toast.success('Pano kaldırıldı'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Kaldırılamadı'),
    });

    return (
        <Card title="Discord Lag Panosu" accent={board?.configured ? A.ok : A.faint}>
            <p style={{ fontSize: 11, color: A.faint, margin: '0 0 10px' }}>
                Bot seçilen kanala <strong style={{ color: A.dim }}>tek mesaj</strong> atar ve her yeni taramadan sonra
                <strong style={{ color: A.dim }}> aynı mesajı düzenler</strong> — Ortalama + Son Tarama ilk-5 ms listeleri.
            </p>
            {board?.configured ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <Pill color={A.ok}>KURULU</Pill>
                    <code style={{ fontSize: 11, color: A.faint, fontFamily: A.mono }}>kanal: {board.channelId} · mesaj: {board.messageId}</code>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        <button onClick={() => refresh.mutate()} disabled={refresh.isPending} style={{ ...btnGhost, color: 'var(--accent)' }}>Şimdi Yenile</button>
                        <button onClick={() => { if (confirm('Discord panosu kaldırılsın mı? (mesaj silinir)')) remove.mutate(); }} style={{ ...btnGhost, color: A.err }}>Kaldır</button>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                        <Cap style={{ display: 'block', marginBottom: 4 }}>Discord sunucusu</Cap>
                        <select value={guildId} onChange={e => { setGuildId(e.target.value); setChannelId(''); }} style={selStyle}>
                            <option value="">— sunucu seç ({guilds.length}) —</option>
                            {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: 1, minWidth: 180 }}>
                        <Cap style={{ display: 'block', marginBottom: 4 }}>Kanal</Cap>
                        <select value={channelId} onChange={e => setChannelId(e.target.value)} style={selStyle} disabled={!guildId}>
                            <option value="">{!guildId ? '— önce sunucu seç —' : (chLoading ? 'yükleniyor…' : `— kanal seç (${channels.length}) —`)}</option>
                            {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                        </select>
                    </div>
                    <button onClick={() => { if (!guildId || !channelId) return toast.error('Sunucu ve kanal seç'); setup.mutate(); }}
                        disabled={setup.isPending} style={btnPrimary}>{setup.isPending ? 'Kuruluyor…' : 'Panoyu Kur'}</button>
                </div>
            )}
        </Card>
    );
}
```

DİKKAT: dosyada `useState`, `useQuery`, `useMutation`, `useQueryClient`, `api`, `toast`, `Card`, `Cap`, `Pill`, `btnGhost`, `btnPrimary`, `A`, `selStyle` zaten import/tanımlı — yeni import GEREKMEZ (kontrol et; eksikse mevcut import satırına ekle).

- [x] **Step 3: Doğrula** — server/: `node -e "require('./routes/lagGuard'); console.log('OK');"` → OK; `npm test` → 54 pass. client/: `npx eslint src/pages/LagGuardPage.jsx` → exit 0; `npx vite build` → ✓ built.

- [x] **Step 4: Commit** (2 dosya):

```
feat(lag-board): board API'lari + panel kurulum karti (sunucu/kanal secici)

GET/POST/DELETE /lag-guard/board* uclari; LagGuard Ayarlar sekmesine
'Discord Lag Panosu' karti — guild→kanal sec, Panoyu Kur / Simdi Yenile / Kaldir.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 4: Uçtan uca doğrulama + dokümanlar

- [x] **Step 1:** server/: `npm test` → 54 pass. Smoke: `node -e "require('./services/lagBoardService'); require('./services/discordBotService'); require('./routes/lagGuard'); console.log('OK');"` → OK.
- [x] **Step 2:** client/: eslint + `npx vite build` temiz.
- [x] **Step 3:** `.planning/specs/2026-06-11-discord-lag-panosu-tasarim.md` `**Durum:**` satırını `**Durum:** ✅ Uygulandı (bkz. .planning/plans/2026-06-11-discord-lag-panosu.md).` yap; bu plan dosyasındaki tüm `- [ ]` → `- [x]`.
- [x] **Step 4: Commit** (2 .planning dosyası):

```
docs(lag-board): discord lag panosu spec + plan durumu guncellendi

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
