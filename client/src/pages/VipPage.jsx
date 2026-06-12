import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { A, btnPrimary, btnGhost } from '@/hoodoo/tokens';
import { Cap, Num, Pill, Card, Input } from '@/hoodoo/primitives';
import { I } from '@/hoodoo/icons';

const selStyle = { background: A.bg, border: `1px solid ${A.border}`, color: A.text, fontSize: 12, padding: '7px 10px', borderRadius: 3, width: '100%', outline: 'none' };
const EMPTY_PKG = { name: '', color: '#f1c40f', discord_role_id: '', discord_guild_id: '', duration_days: 30, grant_commands: '', revoke_commands: '', join_message: '', leave_message: '', enabled: true };

// Hazır perk kataloğu — seçilince grant/revoke komutlarını otomatik üretir ({nick} oyuncu adı)
const PERK_CATALOG = [
    {
        id: 'ftb_rank', label: 'FTB Ranks rütbesi', fields: [{ key: 'rank', ph: 'vip' }],
        build: v => ({ grant: [`ftbranks add {nick} ${v.rank}`], revoke: [`ftbranks remove {nick} ${v.rank}`] }),
        note: 'FTB Ranks. Renkli chat / home / claim gibi perkler rütbenin config/ftbranks/ranks.snbt tanımında olmalı.',
    },
    {
        id: 'lp_group', label: 'LuckPerms grubu', fields: [{ key: 'group', ph: 'vip' }],
        build: v => ({ grant: [`lp user {nick} parent add ${v.group}`], revoke: [`lp user {nick} parent remove ${v.group}`] }),
        note: 'LuckPerms gerekir.',
    },
    {
        id: 'lp_prefix', label: 'Renkli isim / prefix (LuckPerms)', fields: [{ key: 'prefix', ph: '&b[VIP] ' }, { key: 'prio', ph: '100' }],
        build: v => ({ grant: [`lp user {nick} meta addprefix ${v.prio || 100} "${v.prefix}"`], revoke: [`lp user {nick} meta removeprefix ${v.prio || 100} "${v.prefix}"`] }),
        note: 'LuckPerms gerekir. Renk kodu: &b mavi, &6 altın, &a yeşil…',
    },
    {
        id: 'lp_perm', label: 'LuckPerms izni', fields: [{ key: 'node', ph: 'ftbessentials.home.count.5' }],
        build: v => ({ grant: [`lp user {nick} permission set ${v.node} true`], revoke: [`lp user {nick} permission unset ${v.node}`] }),
        note: 'LuckPerms gerekir. Ör. fazladan ev/komut izni.',
    },
    {
        id: 'gradient', label: 'Gradient isim (renk geçişli)', fields: [{ key: 'c1', ph: '#55ffff' }, { key: 'c2', ph: '#ff55ff' }],
        build: v => ({
            grant: [`nickname {nick} {gradient:${v.c1 || '#55ffff'}:${v.c2 || '#ff55ff'}}`],
            revoke: [`nickname {nick} reset`],
        }),
        note: 'Verme anında {gradient:...} oyuncunun adını karakter karakter &#RRGGBB ile boyar. Komut FTB Essentials /nickname içindir — sunucundaki nick komutuna göre düzenle (hex desteği gerekir).',
    },
    {
        id: 'afk', label: 'AFK süresi / muafiyeti (rütbe izni)', fields: [{ key: 'rank', ph: 'vip' }, { key: 'node', ph: 'ftbessentials.afk_timeout' }, { key: 'value', ph: '60' }],
        build: v => ({ grant: v.rank && v.node ? [`ftbranks set ${v.rank} ${v.node} ${v.value || 'true'}`] : [], revoke: [] }),
        note: 'RÜTBEYE yazılır (oyuncuya değil; bir kez yeter). Node adı FTB Essentials sürümüne göre değişir — yanlış node sessizce etkisizdir, sunucunda doğrula.',
    },
    {
        id: 'broadcast', label: 'Duyuru mesajı (verince)', fields: [{ key: 'msg', ph: '{nick} VIP oldu!' }],
        build: v => ({ grant: [`say ${v.msg}`], revoke: [] }),
        note: 'Yalnızca verme anında bir kez çalışır.',
    },
    {
        id: 'custom', label: 'Özel komut', fields: [{ key: 'grant', ph: 'verme komutu' }, { key: 'revoke', ph: 'bitiş komutu (ops.)' }],
        build: v => ({ grant: v.grant ? [v.grant] : [], revoke: v.revoke ? [v.revoke] : [] }),
        note: '{nick} ve {discord} yer tutucularını kullanabilirsin.',
    },
];

// Hazır kademeler — .planning/2026-06-08-vip-perk-rehberi.md ile birebir.
// Perkler sunucudaki config/ftbranks/ranks.snbt'de tanımlı; panel sadece 'ftbranks add/remove' çalıştırır.
const TIER_PRESETS = [
    {
        rank: 'vip', name: 'VIP', color: '#3498db', duration_days: 30,
        perks: ['Renkli isim [VIP]', '10 home', 'Home bekleme: 30', '/back', 'Claim: 750', 'Force-load: 80'],
        grant: ['ftbranks add {nick} vip', 'say {nick} sunucuya VIP olarak katildi!'],
        revoke: ['ftbranks remove {nick} vip'],
    },
    {
        rank: 'vip_plus', name: 'VIP+', color: '#2ecc71', duration_days: 30,
        perks: ['Renkli isim [VIP+]', '20 home', 'Home bekleme: 10', '/back', '/rtp', 'Claim: 1200', 'Force-load: 120'],
        grant: ['ftbranks add {nick} vip_plus', 'say {nick} artik VIP+ oldu!'],
        revoke: ['ftbranks remove {nick} vip_plus'],
    },
    {
        rank: 'mvp', name: 'MVP', color: '#f1c40f', duration_days: 30,
        perks: ['Renkli isim [MVP]', '35 home', 'Home bekleme: 0', '/back', '/rtp', '/enderchest', 'Claim: 2000', 'Force-load: 200'],
        grant: ['ftbranks add {nick} mvp', 'say {nick} artik MVP oldu!'],
        revoke: ['ftbranks remove {nick} mvp'],
    },
];

// Paket komutları DB'de JSON dizi olarak saklanır; modal/önizleme newline metin ister.
function parseCmdsText(v) {
    if (Array.isArray(v)) return v.join('\n');
    try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a.join('\n') : String(v || ''); }
    catch { return String(v || ''); }
}

// Bir paketin grant komutlarındaki 'ftbranks add {nick} <rütbe>' satırından kademeyi bul (tam eşleşme — vip ≠ vip_plus).
function presetByGrant(grantCommands) {
    const lines = String(grantCommands || '').split('\n');
    for (const ln of lines) {
        const m = ln.trim().match(/^ftbranks\s+add\s+\{nick\}\s+(\S+)/i);
        if (m) return TIER_PRESETS.find(t => t.rank === m[1]) || null;
    }
    return null;
}

// "Perkler" sekmesi form varsayılanları (blok YOKsa ön-doldurma; rehberle birebir).
const TIER_PERK_DEFAULTS = {
    vip:      { nameFormat: '&b[VIP] {name}&r',  homeMax: 10, homeCooldown: 30, back: true, rtp: false, enderchest: false, maxClaimed: 750,  maxForceLoaded: 80 },
    vip_plus: { nameFormat: '&a[VIP+] {name}&r', homeMax: 20, homeCooldown: 10, back: true, rtp: true,  enderchest: false, maxClaimed: 1200, maxForceLoaded: 120 },
    mvp:      { nameFormat: '&6[MVP] {name}&r',  homeMax: 35, homeCooldown: 0,  back: true, rtp: true,  enderchest: true,  maxClaimed: 2000, maxForceLoaded: 200 },
};

function fmtExpiry(sec) {
    if (!sec) return 'Süresiz';
    const left = sec - Math.floor(Date.now() / 1000);
    const d = new Date(sec * 1000).toLocaleDateString('tr-TR');
    if (left <= 0) return `${d} (doldu)`;
    const days = Math.floor(left / 86400), hrs = Math.floor((left % 86400) / 3600);
    return `${d} · ${days > 0 ? `${days}g ` : ''}${hrs}s kaldı`;
}

export default function VipPage() {
    const qc = useQueryClient();
    const [tab, setTab] = useState('grants');
    const [editPkg, setEditPkg] = useState(null);
    // grant form
    const [gPkg, setGPkg] = useState('');
    const [gPlayer, setGPlayer] = useState(null); // {userId, mcNick, label}
    const [gSearch, setGSearch] = useState('');
    const [gDays, setGDays] = useState('');
    const [gNote, setGNote] = useState('');

    const { data: stats } = useQuery({ queryKey: ['vip-stats'], queryFn: () => api.get('/vip/stats').then(r => r.data), refetchInterval: 10000 });
    const { data: pkgData } = useQuery({ queryKey: ['vip-packages'], queryFn: () => api.get('/vip/packages').then(r => r.data) });
    const { data: grantData } = useQuery({ queryKey: ['vip-grants'], queryFn: () => api.get('/vip/grants?status=active').then(r => r.data), refetchInterval: 15000 });
    const { data: logData } = useQuery({ queryKey: ['vip-log'], queryFn: () => api.get('/vip/log').then(r => r.data), refetchInterval: 15000, enabled: tab === 'log' });
    const { data: settingsData } = useQuery({ queryKey: ['vip-settings'], queryFn: () => api.get('/vip/settings').then(r => r.data) });
    const { data: wlData } = useQuery({ queryKey: ['vip-whitelist'], queryFn: () => api.get('/discord/whitelist').then(r => r.data) });

    const packages = pkgData?.packages || [];
    const grants = grantData?.grants || [];
    const wl = wlData?.entries || [];
    const logs = logData?.log || [];

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ['vip-stats'] });
        qc.invalidateQueries({ queryKey: ['vip-packages'] });
        qc.invalidateQueries({ queryKey: ['vip-grants'] });
        qc.invalidateQueries({ queryKey: ['vip-log'] });
    };

    const savePkg = useMutation({
        mutationFn: (p) => {
            const body = {
                name: p.name, color: p.color, discord_role_id: p.discord_role_id || null, discord_guild_id: p.discord_guild_id || null,
                duration_days: Number(p.duration_days) || 0, enabled: p.enabled,
                grant_commands: (p.grant_commands || '').split('\n').map(s => s.trim()).filter(Boolean),
                revoke_commands: (p.revoke_commands || '').split('\n').map(s => s.trim()).filter(Boolean),
                join_message: p.join_message || null,
                leave_message: p.leave_message || null,
            };
            return p.id ? api.put(`/vip/packages/${p.id}`, body) : api.post('/vip/packages', body);
        },
        onSuccess: () => { invalidate(); setEditPkg(null); toast.success('Paket kaydedildi'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Kaydedilemedi'),
    });
    const delPkg = useMutation({
        mutationFn: (id) => api.delete(`/vip/packages/${id}`),
        onSuccess: () => { invalidate(); toast.success('Paket silindi'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Silinemedi'),
    });
    const grant = useMutation({
        mutationFn: (b) => api.post('/vip/grants', b).then(r => r.data),
        onSuccess: (d) => { invalidate(); setGPlayer(null); setGSearch(''); setGNote(''); setGDays(''); toast.success(`VIP verildi → ${d.grant?.applyDetail || ''}`, { duration: 6000 }); },
        onError: (e) => toast.error(e.response?.data?.error || 'Verilemedi'),
    });
    const revoke = useMutation({
        mutationFn: (id) => api.post(`/vip/grants/${id}/revoke`),
        onSuccess: () => { invalidate(); toast.success('VIP geri alındı'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Geri alınamadı'),
    });
    const extend = useMutation({
        mutationFn: ({ id, days }) => api.post(`/vip/grants/${id}/extend`, { days }),
        onSuccess: () => { invalidate(); toast.success('Süre uzatıldı'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Uzatılamadı'),
    });

    const wlFiltered = wl.filter(e => {
        const q = gSearch.toLowerCase();
        return !q || (e.mcNick || '').toLowerCase().includes(q) || (e.discordName || e.username || '').toLowerCase().includes(q);
    });

    const doGrant = () => {
        if (!gPkg) return toast.error('Paket seç');
        if (!gPlayer) return toast.error('Oyuncu seç');
        grant.mutate({ packageId: Number(gPkg), userId: gPlayer.userId, mcNick: gPlayer.mcNick, durationDays: gDays === '' ? undefined : Number(gDays), note: gNote });
    };

    // Mevcut paketi düzenleme için aç (JSON komutları → modalın beklediği newline metne çevir).
    const openPackage = (p) => setEditPkg({ ...p, grant_commands: parseCmdsText(p.grant_commands), revoke_commands: parseCmdsText(p.revoke_commands), enabled: !!p.enabled });

    return (
        <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20, fontFamily: A.sans, color: A.text }}>
            {/* Başlık */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                    <Cap>Üyelik Yönetimi</Cap>
                    <h1 style={{ fontSize: 22, fontWeight: 600, margin: '4px 0 2px' }}>VIP Sistemi</h1>
                    <p style={{ fontSize: 12, color: A.dim, margin: 0 }}>Çoklu paket · Discord rolü + Minecraft komutları · süreli, otomatik bitiş.</p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <Card title="Aktif VIP"><Num size={22}>{stats?.activeGrants ?? 0}</Num></Card>
                    <Card title="Paket"><Num size={22}>{stats?.packages ?? 0}</Num></Card>
                </div>
            </div>

            {/* Sekmeler */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${A.border}`, gap: 4 }}>
                {[{ id: 'grants', label: 'VIP Ver & Aktif', icon: I.Crown }, { id: 'packages', label: 'Paketler', icon: I.Stack }, { id: 'perks', label: 'Perkler', icon: I.Wrench }, { id: 'settings', label: 'Ayarlar', icon: I.Cog }, { id: 'log', label: 'Log', icon: I.Clock }].map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} style={{
                        background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
                        color: tab === t.id ? '#fff' : A.dim, fontSize: 12, fontWeight: 500, padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                    }}><t.icon size={14} style={{ color: tab === t.id ? 'var(--accent)' : A.faint }} /> {t.label}</button>
                ))}
            </div>

            {/* VIP VER & AKTİF */}
            {tab === 'grants' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <Card title="VIP Ver">
                        {packages.length === 0 ? (
                            <p style={{ fontSize: 12, color: A.faint }}>Önce "Paketler" sekmesinden bir VIP paketi oluştur.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div><Cap style={{ display: 'block', marginBottom: 4 }}>Paket</Cap>
                                        <select value={gPkg} onChange={e => setGPkg(e.target.value)} style={selStyle}>
                                            <option value="">— Paket seç —</option>
                                            {packages.filter(p => p.enabled).map(p => <option key={p.id} value={p.id}>{p.name} ({p.duration_days > 0 ? `${p.duration_days}g` : 'süresiz'})</option>)}
                                        </select>
                                    </div>
                                    <div><Cap style={{ display: 'block', marginBottom: 4 }}>Süre (gün, boş = paket varsayılanı)</Cap>
                                        <Input type="number" value={gDays} onChange={e => setGDays(e.target.value)} placeholder="varsayılan" /></div>
                                </div>
                                <div>
                                    <Cap style={{ display: 'block', marginBottom: 4 }}>Oyuncu (whitelist'ten)</Cap>
                                    {gPlayer ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: A.bg, border: `1px solid ${A.border}`, borderRadius: 3 }}>
                                            <span style={{ fontFamily: A.mono, fontSize: 12, color: A.ok }}>{gPlayer.mcNick}</span>
                                            <span style={{ fontSize: 11, color: A.faint }}>{gPlayer.discordName ? `· ${gPlayer.discordName}` : ''}</span>
                                            <button onClick={() => setGPlayer(null)} style={{ ...btnGhost, marginLeft: 'auto', padding: '2px 8px' }}>değiştir</button>
                                        </div>
                                    ) : (
                                        <>
                                            <Input value={gSearch} onChange={e => setGSearch(e.target.value)} placeholder="oyuncu ara (nick / discord)…" />
                                            <div style={{ marginTop: 6, maxHeight: 160, overflowY: 'auto', border: `1px solid ${A.border}`, borderRadius: 3 }}>
                                                {wlFiltered.slice(0, 60).map(e => (
                                                    <button key={e.userId} onClick={() => setGPlayer({ userId: e.userId, mcNick: e.mcNick, discordName: e.discordName || e.username })}
                                                        style={{ display: 'flex', justifyContent: 'space-between', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: `1px solid ${A.border}`, padding: '6px 10px', cursor: 'pointer', color: A.text, fontFamily: A.mono, fontSize: 11 }}>
                                                        <span>{e.mcNick}</span><span style={{ color: A.faint }}>{e.discordName || e.username || ''}</span>
                                                    </button>
                                                ))}
                                                {wlFiltered.length === 0 && <div style={{ padding: 10, fontSize: 11, color: A.faint }}>Whitelist'te oyuncu yok / eşleşme yok.</div>}
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div><Cap style={{ display: 'block', marginBottom: 4 }}>Not (opsiyonel)</Cap>
                                    <Input value={gNote} onChange={e => setGNote(e.target.value)} placeholder="örn. bağış / ödül" /></div>
                                <div><button onClick={doGrant} disabled={grant.isPending} style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 6 }}><I.Crown size={14} /> VIP Ver</button></div>
                            </div>
                        )}
                    </Card>

                    <Card title={`Aktif VIP'ler (${grants.length})`}>
                        {grants.length === 0 ? <p style={{ fontSize: 12, color: A.faint }}>Aktif VIP yok.</p> : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {grants.map(g => (
                                    <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: A.bg, border: `1px solid ${A.border}`, borderRadius: 4, padding: '8px 12px' }}>
                                        <Pill color={packages.find(p => p.id === g.package_id)?.color || 'var(--accent)'}>{g.package_name}</Pill>
                                        <span style={{ fontFamily: A.mono, fontSize: 12, color: A.text }}>{g.mc_nick || '—'}</span>
                                        <span style={{ fontSize: 11, color: A.faint }}>{g.user_id ? `<@${g.user_id}>` : ''}</span>
                                        <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: A.mono, color: A.dim }}>{fmtExpiry(g.expires_at)}</span>
                                        {g.expires_at != null && (
                                            <button onClick={() => {
                                                const d = prompt(`${g.mc_nick || g.user_id} · ${g.package_name} kaç gün uzatılsın?`, '30');
                                                if (d && Number(d) > 0) extend.mutate({ id: g.id, days: Number(d) });
                                            }} style={{ ...btnGhost, color: A.ok, padding: '4px 10px' }} title="Süre uzat">+ Uzat</button>
                                        )}
                                        <button onClick={() => { if (confirm(`${g.mc_nick || g.user_id} için ${g.package_name} VIP geri alınsın mı?`)) revoke.mutate(g.id); }} style={{ ...btnGhost, color: A.err, padding: '4px 10px' }}>Geri Al</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            )}

            {/* PAKETLER */}
            {tab === 'packages' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Hazır kademeler — perkler ranks.snbt'de tanımlı, panel sadece rütbe ekler/çıkarır */}
                    <Card title="Hazır Kademeler">
                        <p style={{ fontSize: 11, color: A.faint, margin: '0 0 12px' }}>
                            Tek tıkla VIP / VIP+ / MVP paketini oluştur. Perkler sunucudaki <code style={{ fontFamily: A.mono, color: A.dim }}>config/ftbranks/ranks.snbt</code> dosyasında tanımlıdır — kurulum için bkz. <code style={{ fontFamily: A.mono, color: A.dim }}>.planning/2026-06-08-vip-perk-rehberi.md</code>. (ranks.snbt'yi panelden düzenleme yakında.)
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
                            {TIER_PRESETS.map(t => {
                                const ex = packages.find(p => presetByGrant(parseCmdsText(p.grant_commands))?.rank === t.rank);
                                return (
                                    <div key={t.rank} style={{ background: A.bg, border: `1px solid ${A.border}`, borderRadius: 4, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ width: 12, height: 12, borderRadius: 3, background: t.color, display: 'inline-block' }} />
                                            <span style={{ fontWeight: 600 }}>{t.name}</span>
                                            <span style={{ marginLeft: 'auto', fontSize: 10, color: A.faint, fontFamily: A.mono }}>{t.duration_days}g</span>
                                        </div>
                                        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                            {t.perks.map(pk => (
                                                <li key={pk} style={{ fontSize: 11, color: A.dim, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span style={{ color: t.color }}>•</span>{pk}
                                                </li>
                                            ))}
                                        </ul>
                                        {ex ? (
                                            <button onClick={() => openPackage(ex)} style={{ ...btnGhost, marginTop: 'auto' }}>Düzenle (var)</button>
                                        ) : (
                                            <button onClick={() => setEditPkg({ ...EMPTY_PKG, name: t.name, color: t.color, duration_days: t.duration_days, grant_commands: t.grant.join('\n'), revoke_commands: t.revoke.join('\n') })}
                                                style={{ ...btnPrimary, marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><I.Plus size={12} /> Oluştur</button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </Card>

                    <div><button onClick={() => setEditPkg({ ...EMPTY_PKG })} style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 6 }}><I.Plus size={13} /> Boş Paket Ekle</button></div>
                    {packages.length === 0 ? <p style={{ fontSize: 12, color: A.faint }}>Henüz paket yok.</p> : packages.map(p => {
                        const gc = (() => { try { return JSON.parse(p.grant_commands || '[]'); } catch { return []; } })();
                        const rc = (() => { try { return JSON.parse(p.revoke_commands || '[]'); } catch { return []; } })();
                        return (
                            <div key={p.id} style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ width: 12, height: 12, borderRadius: 3, background: p.color, display: 'inline-block' }} />
                                        <span style={{ fontWeight: 600 }}>{p.name}</span>
                                        <Pill color={p.enabled ? A.ok : A.faint}>{p.enabled ? 'AKTİF' : 'KAPALI'}</Pill>
                                        <Pill color={A.faint}>{p.duration_days > 0 ? `${p.duration_days} gün` : 'süresiz'}</Pill>
                                        {p.discord_role_id ? <Pill color="var(--accent)">Discord rolü</Pill> : null}
                                    </div>
                                    <div style={{ marginTop: 6, fontSize: 11, color: A.faint, fontFamily: A.mono }}>
                                        verme: {gc.length} komut · bitiş: {rc.length} komut
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                                    <button onClick={() => openPackage(p)} style={btnGhost}>Düzenle</button>
                                    <button onClick={() => { if (confirm(`"${p.name}" paketi silinsin mi?`)) delPkg.mutate(p.id); }} style={{ ...btnGhost, color: A.err }}>Sil</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* PERKLER (ranks.snbt editörü) */}
            {tab === 'perks' && <PerksTab />}

            {/* AYARLAR */}
            {tab === 'settings' && <VipSettingsTab settings={settingsData?.settings} />}

            {/* LOG */}
            {tab === 'log' && (
                <Card title="VIP Günlüğü">
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                            <thead><tr style={{ borderBottom: `1px solid ${A.border}` }}>{['Zaman', 'Aksiyon', 'Paket', 'Oyuncu', 'Detay'].map(h => <th key={h} style={{ padding: '6px 10px' }}><Cap>{h}</Cap></th>)}</tr></thead>
                            <tbody>
                                {logs.length === 0 ? <tr><td colSpan={5} style={{ padding: 16, color: A.faint, textAlign: 'center' }}>Kayıt yok.</td></tr> :
                                    logs.map(l => (
                                        <tr key={l.id} style={{ borderBottom: `1px solid ${A.border}` }}>
                                            <td style={{ padding: '8px 10px', fontFamily: A.mono, color: A.dim }}>{new Date(l.created_at).toLocaleString('tr-TR')}</td>
                                            <td style={{ padding: '8px 10px' }}><Pill color={l.action === 'grant' ? A.ok : l.action === 'error' ? A.err : A.warn}>{l.action}</Pill></td>
                                            <td style={{ padding: '8px 10px' }}>{l.package_name}</td>
                                            <td style={{ padding: '8px 10px', fontFamily: A.mono }}>{l.mc_nick || l.user_id || '—'}</td>
                                            <td style={{ padding: '8px 10px', color: A.faint, fontSize: 11 }}>{l.detail}</td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {editPkg && <PackageModal pkg={editPkg} onClose={() => setEditPkg(null)} onSave={(p) => savePkg.mutate(p)} saving={savePkg.isPending} />}
        </div>
    );
}

function PackageModal({ pkg, onClose, onSave, saving }) {
    const [f, setF] = useState(pkg);
    const set = (k, v) => setF(p => ({ ...p, [k]: v }));
    const [guildId, setGuildId] = useState(pkg.discord_guild_id || '');
    const { data: guildsData } = useQuery({ queryKey: ['vip-guilds'], queryFn: () => api.get('/vip/guilds').then(r => r.data) });
    const guilds = guildsData?.guilds || [];
    const { data: rolesData, isFetching: rolesLoading } = useQuery({
        queryKey: ['vip-roles', guildId],
        queryFn: () => api.get('/vip/roles', { params: guildId ? { guildId } : {} }).then(r => r.data),
        enabled: !!guildId,
    });
    const roles = rolesData?.roles || [];

    const [perkType, setPerkType] = useState('ftb_rank');
    const [perkVals, setPerkVals] = useState({});
    const perkDef = PERK_CATALOG.find(p => p.id === perkType);
    const addPerk = () => {
        if (!perkDef) return;
        const { grant, revoke } = perkDef.build(perkVals);
        if (!grant.length && !revoke.length) return;
        setF(p => ({
            ...p,
            grant_commands: [p.grant_commands, ...grant].filter(Boolean).join('\n'),
            revoke_commands: [p.revoke_commands, ...revoke].filter(Boolean).join('\n'),
        }));
        setPerkVals({});
    };

    const presetMatch = presetByGrant(f.grant_commands); // grant komutu bir kademeye uyuyorsa perklerini göster

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 6, width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto', padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>{f.id ? 'Paketi Düzenle' : 'Yeni VIP Paketi'}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.faint }}><I.X size={16} /></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div><Cap style={{ display: 'block', marginBottom: 4 }}>Paket adı</Cap><Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="VIP+" /></div>
                    <div><Cap style={{ display: 'block', marginBottom: 4 }}>Renk</Cap><Input type="color" value={f.color} onChange={e => set('color', e.target.value)} /></div>
                    <div><Cap style={{ display: 'block', marginBottom: 4 }}>Süre (gün, 0 = süresiz)</Cap><Input type="number" value={f.duration_days} onChange={e => set('duration_days', e.target.value)} /></div>
                    <div><Cap style={{ display: 'block', marginBottom: 4 }}>Discord sunucusu</Cap>
                        <select value={guildId} onChange={e => { setGuildId(e.target.value); set('discord_guild_id', e.target.value); set('discord_role_id', ''); }} style={selStyle}>
                            <option value="">— sunucu seç ({guilds.length}) —</option>
                            {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                    </div>
                    <div><Cap style={{ display: 'block', marginBottom: 4 }}>Discord rolü</Cap>
                        <select value={f.discord_role_id || ''} onChange={e => set('discord_role_id', e.target.value)} style={selStyle} disabled={!guildId}>
                            <option value="">{!guildId ? '— önce sunucu seç —' : (rolesLoading ? 'yükleniyor…' : '— rol yok —')}</option>
                            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </div>
                    {/* Kademe perkleri — grant komutu bir hazır kademeye uyuyorsa (salt-bilgi, ranks.snbt'de tanımlı) */}
                    {presetMatch && (
                        <div style={{ gridColumn: '1 / -1', background: A.bg, border: `1px solid ${presetMatch.color}`, borderRadius: 4, padding: 10 }}>
                            <Cap style={{ display: 'block', marginBottom: 6 }}>{presetMatch.name} perkleri · <span style={{ color: A.faint, fontWeight: 400 }}>ranks.snbt'de tanımlı</span></Cap>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {presetMatch.perks.map(pk => (
                                    <span key={pk} style={{ fontSize: 11, color: A.dim, background: A.panel, border: `1px solid ${A.border}`, borderRadius: 3, padding: '3px 8px' }}>{pk}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Hazır perk kataloğu — seçilince komutları otomatik üretir */}
                    <div style={{ gridColumn: '1 / -1', background: A.bg, border: `1px solid ${A.border}`, borderRadius: 4, padding: 10 }}>
                        <Cap style={{ display: 'block', marginBottom: 6 }}>Hazır perk ekle (komutları otomatik üretir)</Cap>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div style={{ minWidth: 200 }}>
                                <select value={perkType} onChange={e => { setPerkType(e.target.value); setPerkVals({}); }} style={selStyle}>
                                    {PERK_CATALOG.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                                </select>
                            </div>
                            {(perkDef?.fields || []).map(fl => (
                                <div key={fl.key} style={{ flex: 1, minWidth: 110 }}>
                                    <Input value={perkVals[fl.key] || ''} onChange={e => setPerkVals(v => ({ ...v, [fl.key]: e.target.value }))} placeholder={fl.ph} />
                                </div>
                            ))}
                            <button type="button" onClick={addPerk} style={{ ...btnPrimary, padding: '7px 12px' }}>+ Ekle</button>
                        </div>
                        {perkDef?.note && <div style={{ fontSize: 10, color: A.faint, marginTop: 6 }}>{perkDef.note}</div>}
                    </div>

                    <div style={{ gridColumn: '1 / -1' }}>
                        <Cap style={{ display: 'block', marginBottom: 4 }}>Verme komutları (her satır bir MC komutu · {'{nick}'} {'{discord}'} yer tutucu)</Cap>
                        <textarea value={f.grant_commands} onChange={e => set('grant_commands', e.target.value)} rows={3} placeholder={'lp user {nick} parent add vip\nbroadcast {nick} VIP oldu!'} style={{ ...selStyle, fontFamily: A.mono, resize: 'vertical' }} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <Cap style={{ display: 'block', marginBottom: 4 }}>Bitiş/iptal komutları</Cap>
                        <textarea value={f.revoke_commands} onChange={e => set('revoke_commands', e.target.value)} rows={2} placeholder={'lp user {nick} parent remove vip'} style={{ ...selStyle, fontFamily: A.mono, resize: 'vertical' }} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <Cap style={{ display: 'block', marginBottom: 4 }}>Giriş duyurusu ({'{nick}'} {'{package}'} · boş = duyuru yok)</Cap>
                        <Input value={f.join_message || ''} onChange={e => set('join_message', e.target.value)} placeholder="👑 {package} üyesi {nick} sunucuya katıldı!" />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <Cap style={{ display: 'block', marginBottom: 4 }}>Çıkış duyurusu (boş = duyuru yok)</Cap>
                        <Input value={f.leave_message || ''} onChange={e => set('leave_message', e.target.value)} placeholder="{package} üyesi {nick} ayrıldı." />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" checked={!!f.enabled} onChange={e => set('enabled', e.target.checked)} /> <Cap>Aktif</Cap>
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                    <button onClick={onClose} style={btnGhost}>İptal</button>
                    <button onClick={() => { if (!f.name) return toast.error('Paket adı gerekli'); onSave(f); }} disabled={saving} style={btnPrimary}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
                </div>
            </div>
        </div>
    );
}

// ── PERKLER sekmesi — ranks.snbt'yi panelden yapılandırılmış düzenleme ──
function PerksTab() {
    const { data, isLoading } = useQuery({ queryKey: ['vip-ranks-perks'], queryFn: () => api.get('/vip/ranks-perks').then(r => r.data) });
    if (isLoading) return <p style={{ fontSize: 12, color: A.faint }}>Yükleniyor…</p>;
    const tiers = data?.tiers || [];
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Card title="Kademe Perkleri (ranks.snbt)">
                <p style={{ fontSize: 11, color: A.faint, margin: 0 }}>
                    Perkleri buradan düzenle → Kaydet → sunucudaki <code style={{ fontFamily: A.mono, color: A.dim }}>config/ftbranks/ranks.snbt</code>'ye yazılır{data?.serverRunning ? ' + otomatik ftbranks reload' : ' (sunucu kapalı — açılınca uygulanır)'}. Her kayıttan önce <code style={{ fontFamily: A.mono, color: A.dim }}>.vipbak</code> yedeği alınır.
                </p>
                {data && !data.fileFound && (
                    <div style={{ marginTop: 10, padding: 10, background: A.bg, border: `1px solid ${A.warn}`, borderRadius: 4, fontSize: 12, color: A.warn }}>
                        ranks.snbt bulunamadı{data.path ? ` (${data.path})` : ''}. Sunucuda FTB Ranks kurulu/çalışmış olmalı; kurulum için bkz. <code style={{ fontFamily: A.mono }}>.planning/2026-06-08-vip-perk-rehberi.md</code>.
                    </div>
                )}
            </Card>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
                {tiers.map(t => <TierPerkCard key={t.rank} tier={t} />)}
            </div>
        </div>
    );
}

function TierPerkCard({ tier }) {
    const qc = useQueryClient();
    const preset = TIER_PRESETS.find(t => t.rank === tier.rank);
    // Blok varsa dosyadaki gerçek durumu göster; yoksa preset varsayılanlarıyla ön-doldur.
    const seed = tier.exists && tier.perks ? {
        nameFormat: tier.perks.nameFormat ?? '',
        homeMax: tier.perks.homeMax ?? '', homeCooldown: tier.perks.homeCooldown ?? '',
        back: !!tier.perks.back, rtp: !!tier.perks.rtp, enderchest: !!tier.perks.enderchest,
        maxClaimed: tier.perks.maxClaimed ?? '', maxForceLoaded: tier.perks.maxForceLoaded ?? '',
    } : { ...(TIER_PERK_DEFAULTS[tier.rank] || {}) };
    const [f, setF] = useState(seed);
    const set = (k, v) => setF(p => ({ ...p, [k]: v }));
    const numOrNull = (v) => (v === '' || v == null ? null : Number(v));

    const save = useMutation({
        mutationFn: () => api.put(`/vip/ranks-perks/${tier.rank}`, {
            perks: {
                nameFormat: f.nameFormat || null,
                homeMax: numOrNull(f.homeMax), homeCooldown: numOrNull(f.homeCooldown),
                back: !!f.back, rtp: !!f.rtp, enderchest: !!f.enderchest,
                maxClaimed: numOrNull(f.maxClaimed), maxForceLoaded: numOrNull(f.maxForceLoaded),
            },
        }).then(r => r.data),
        onSuccess: (d) => { qc.invalidateQueries({ queryKey: ['vip-ranks-perks'] }); toast.success(d.reloaded ? 'Kaydedildi + reload' : 'Kaydedildi (sunucu açılınca uygulanır)'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Kaydedilemedi'),
    });

    return (
        <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: preset?.color || 'var(--accent)' }} />
                <span style={{ fontWeight: 600 }}>{tier.label || tier.rank}</span>
                <Pill color={tier.exists ? A.ok : A.faint}>{tier.exists ? 'tanımlı' : 'yok — kaydedince oluşturulur'}</Pill>
                <code style={{ marginLeft: 'auto', fontSize: 10, color: A.faint, fontFamily: A.mono }}>{tier.rank}</code>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div><Cap style={{ display: 'block', marginBottom: 4 }}>İsim formatı ({'{name}'} yer tutucu · &amp;b renk)</Cap>
                    <Input value={f.nameFormat || ''} onChange={e => set('nameFormat', e.target.value)} placeholder="&b[VIP] {name}&r" /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div><Cap style={{ display: 'block', marginBottom: 4 }}>Home sayısı</Cap><Input type="number" value={f.homeMax ?? ''} onChange={e => set('homeMax', e.target.value)} /></div>
                    <div><Cap style={{ display: 'block', marginBottom: 4 }}>Home bekleme (sn)</Cap><Input type="number" value={f.homeCooldown ?? ''} onChange={e => set('homeCooldown', e.target.value)} /></div>
                    <div><Cap style={{ display: 'block', marginBottom: 4 }}>Claim chunk</Cap><Input type="number" value={f.maxClaimed ?? ''} onChange={e => set('maxClaimed', e.target.value)} /></div>
                    <div><Cap style={{ display: 'block', marginBottom: 4 }}>Force-load chunk</Cap><Input type="number" value={f.maxForceLoaded ?? ''} onChange={e => set('maxForceLoaded', e.target.value)} /></div>
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 2 }}>
                    {[['back', '/back'], ['rtp', '/rtp'], ['enderchest', '/enderchest']].map(([k, lbl]) => (
                        <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: A.text, cursor: 'pointer' }}>
                            <input type="checkbox" checked={!!f[k]} onChange={e => set(k, e.target.checked)} /> {lbl}
                        </label>
                    ))}
                </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button onClick={() => save.mutate()} disabled={save.isPending} style={btnPrimary}>{save.isPending ? 'Kaydediliyor…' : 'Kaydet'}</button>
            </div>
        </div>
    );
}

// ── VIP Ayarları sekmesi ───────────────────────────────────────────────────
function VipSettingsTab({ settings }) {
    const qc = useQueryClient();
    const [f, setF] = useState(null);
    const cur = f || settings || { lagExemptPct: 50, reservedSlots: 0, joinLeaveEnabled: 1, reminderDays: 3 };
    const set = (k, v) => setF({ ...cur, [k]: v });
    const save = useMutation({
        mutationFn: () => api.put('/vip/settings', {
            lagExemptPct: Number(cur.lagExemptPct) || 0,
            reservedSlots: Number(cur.reservedSlots) || 0,
            joinLeaveEnabled: cur.joinLeaveEnabled ? 1 : 0,
            reminderDays: Number(cur.reminderDays) || 0,
        }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['vip-settings'] }); toast.success('Ayarlar kaydedildi'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Kaydedilemedi'),
    });
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
            <Card title="Lag Cezası Muafiyeti">
                <Cap style={{ display: 'block', marginBottom: 4 }}>VIP işaretleme eşiği artışı (%)</Cap>
                <Input type="number" value={cur.lagExemptPct} onChange={e => set('lagExemptPct', e.target.value)} min={0} max={500} style={{ maxWidth: 140 }} />
                <p style={{ fontSize: 11, color: A.faint, margin: '8px 0 0' }}>
                    Lag atıfında normal oyuncu örn. <b style={{ color: A.dim }}>5ms</b>'te işaretlenirken, %50 muafiyetle VIP ancak{' '}
                    <b style={{ color: A.dim }}>7.5ms</b>'te işaretlenir. 0 = muafiyet yok. (Gelecek ceza sistemi de bu eşiği kullanacak.)
                </p>
            </Card>
            <Card title="Rezerve Slot (Queue Priority)">
                <Cap style={{ display: 'block', marginBottom: 4 }}>VIP'lere ayrılan slot sayısı (0 = kapalı)</Cap>
                <Input type="number" value={cur.reservedSlots} onChange={e => set('reservedSlots', e.target.value)} min={0} max={50} style={{ maxWidth: 140 }} />
                <p style={{ fontSize: 11, color: A.faint, margin: '8px 0 0' }}>
                    Sunucu dolunca VIP olmayan yeni girenler kibarca kicklenir, son N slot VIP'lere kalır.{' '}
                    <b style={{ color: A.warn }}>Önemli:</b> server.properties'te <code style={{ fontFamily: A.mono }}>max-players</code>'ı
                    normal kapasite + rezerve kadar artırın (örn. 20 oyunculuk sunucu, 3 rezerve → max-players=23).
                </p>
            </Card>
            <Card title="Bitiş Hatırlatması (Discord DM)">
                <Cap style={{ display: 'block', marginBottom: 4 }}>Bitişe kaç gün kala DM gönderilsin? (0 = kapalı)</Cap>
                <Input type="number" value={cur.reminderDays} onChange={e => set('reminderDays', e.target.value)} min={0} max={30} style={{ maxWidth: 140 }} />
                <p style={{ fontSize: 11, color: A.faint, margin: '8px 0 0' }}>
                    Süresi yaklaşan VIP'e <b style={{ color: A.dim }}>bir kez</b> özel mesaj (DM) atılır: paket adı, bitiş tarihi, kalan gün.
                    Kullanıcının DM'leri kapalıysa gönderilemez (Log sekmesinde görünür). Süre uzatılınca yeni bitiş için tekrar hatırlatılır.
                </p>
            </Card>
            <Card title="Giriş/Çıkış Duyuruları">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!cur.joinLeaveEnabled} onChange={e => set('joinLeaveEnabled', e.target.checked ? 1 : 0)} />
                    <span style={{ fontSize: 12 }}>VIP giriş/çıkış duyuruları aktif</span>
                </label>
                <p style={{ fontSize: 11, color: A.faint, margin: '8px 0 0' }}>
                    Mesaj metinleri paket başına ayarlanır (Paketler → Düzenle → Giriş/Çıkış mesajı). Boş bırakılan paket duyuru yapmaz.
                </p>
            </Card>
            <div><button onClick={() => save.mutate()} disabled={save.isPending} style={btnPrimary}>{save.isPending ? 'Kaydediliyor…' : 'Ayarları Kaydet'}</button></div>
        </div>
    );
}
