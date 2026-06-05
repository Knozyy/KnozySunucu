import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { A, btnPrimary, btnGhost } from '@/hoodoo/tokens';
import { Cap, Num, Dot, Pill, Card, KV, KPI, Input, Toggle } from '@/hoodoo/primitives';
import { I } from '@/hoodoo/icons';

export default function AutoThrottlePage() {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState('profiles');
    const [selectedProfile, setSelectedProfile] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);

    // Form states for profile creation/editing
    const [profileName, setProfileName] = useState('');
    const [profilePriority, setProfilePriority] = useState(1);
    const [profileConfigPath, setProfileConfigPath] = useState('');
    const [profileConfigFormat, setProfileConfigFormat] = useState('toml');
    const [profileReloadCommand, setProfileReloadCommand] = useState('');
    const [profileRules, setProfileRules] = useState([]);

    // ── Queries ──
    const { data: status, isLoading: statusLoading } = useQuery({
        queryKey: ['autothrottle-status'],
        queryFn: () => api.get('/auto-throttle/status').then(r => r.data),
        refetchInterval: 3000,
    });

    const { data: profilesData, isLoading: profilesLoading } = useQuery({
        queryKey: ['autothrottle-profiles'],
        queryFn: () => api.get('/auto-throttle/profiles').then(r => r.data),
    });

    const { data: settingsData } = useQuery({
        queryKey: ['autothrottle-settings'],
        queryFn: () => api.get('/auto-throttle/settings').then(r => r.data),
    });

    const { data: historyData } = useQuery({
        queryKey: ['autothrottle-history'],
        queryFn: () => api.get('/auto-throttle/history').then(r => r.data),
        refetchInterval: 10000,
    });

    const { data: logData } = useQuery({
        queryKey: ['autothrottle-log'],
        queryFn: () => api.get('/auto-throttle/log').then(r => r.data),
        refetchInterval: 3000,
    });

    // ── Mutations ──
    const toggleSystem = useMutation({
        mutationFn: (enabled) => api.post('/auto-throttle/toggle', { enabled }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['autothrottle-status'] });
            toast.success('Sistem durumu güncellendi');
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Güncellenemedi'),
    });

    const updateSettings = useMutation({
        mutationFn: (settings) => api.put('/auto-throttle/settings', settings),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['autothrottle-status'] });
            queryClient.invalidateQueries({ queryKey: ['autothrottle-settings'] });
            toast.success('Ayarlar kaydedildi');
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Ayarlar kaydedilemedi'),
    });

    const createProfile = useMutation({
        mutationFn: (profile) => api.post('/auto-throttle/profiles', profile),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['autothrottle-profiles'] });
            queryClient.invalidateQueries({ queryKey: ['autothrottle-status'] });
            setShowCreateModal(false);
            resetForm();
            toast.success('Profil oluşturuldu');
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Profil oluşturulamadı'),
    });

    const updateProfile = useMutation({
        mutationFn: ({ id, profile }) => api.put(`/auto-throttle/profiles/${id}`, profile),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['autothrottle-profiles'] });
            queryClient.invalidateQueries({ queryKey: ['autothrottle-status'] });
            setIsEditing(false);
            setSelectedProfile(null);
            toast.success('Profil güncellendi');
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Profil güncellenemedi'),
    });

    const deleteProfile = useMutation({
        mutationFn: (id) => api.delete(`/auto-throttle/profiles/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['autothrottle-profiles'] });
            queryClient.invalidateQueries({ queryKey: ['autothrottle-status'] });
            setSelectedProfile(null);
            setIsEditing(false);
            toast.success('Profil silindi');
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Profil silinemedi'),
    });

    const toggleProfile = useMutation({
        mutationFn: (id) => api.post(`/auto-throttle/profiles/${id}/toggle`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['autothrottle-profiles'] });
            queryClient.invalidateQueries({ queryKey: ['autothrottle-status'] });
            toast.success('Profil durumu değiştirildi');
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Durum değiştirilemedi'),
    });

    const resetAll = useMutation({
        mutationFn: () => api.post('/auto-throttle/reset'),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ['autothrottle-profiles'] });
            queryClient.invalidateQueries({ queryKey: ['autothrottle-status'] });
            toast.success(res.data.message || 'Tüm değerler varsayılana sıfırlandı');
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Sıfırlanamadı'),
    });

    // ── Form Helpers ──
    const resetForm = () => {
        setProfileName('');
        setProfilePriority(1);
        setProfileConfigPath('');
        setProfileConfigFormat('toml');
        setProfileReloadCommand('');
        setProfileRules([]);
    };

    const startCreate = () => {
        resetForm();
        setShowCreateModal(true);
    };

    const startEdit = (profile) => {
        setSelectedProfile(profile);
        setProfileName(profile.name);
        setProfilePriority(profile.priority);
        setProfileConfigPath(profile.config_path);
        setProfileConfigFormat(profile.config_format);
        setProfileReloadCommand(profile.reload_command || '');
        // Rules is a JSON in the profile
        setProfileRules(profile.rules || []);
        setIsEditing(true);
    };

    const handleSaveProfile = (e) => {
        e.preventDefault();
        const payload = {
            name: profileName,
            priority: Number(profilePriority),
            configPath: profileConfigPath,
            configFormat: profileConfigFormat,
            reloadCommand: profileReloadCommand,
            rules: profileRules,
        };

        if (isEditing && selectedProfile) {
            updateProfile.mutate({ id: selectedProfile.id, profile: payload });
        } else {
            createProfile.mutate(payload);
        }
    };

    const addRule = () => {
        setProfileRules([
            ...profileRules,
            {
                configKey: '',
                description: '',
                valueType: 'number',
                defaultValue: '100',
                minValue: '10',
                stepDown: 10,
                stepUp: 5,
            }
        ]);
    };

    const updateRuleField = (index, field, value) => {
        const next = [...profileRules];
        next[index] = { ...next[index], [field]: value };
        setProfileRules(next);
    };

    const removeRule = (index) => {
        setProfileRules(profileRules.filter((_, i) => i !== index));
    };

    // ── Render ──
    const profiles = profilesData?.profiles || [];
    const settings = settingsData?.settings || {};
    const history = historyData?.history || [];
    const logs = logData?.log || [];

    const stateColors = {
        idle: '#5f6368',
        normal: '#4ade80',
        throttling: '#fbbf24',
        cooldown: '#3c4046',
        recovering: '#a78bfa',
    };

    const stateLabels = {
        idle: 'PASİF / DEVRE DIŞI',
        normal: 'STABİL / NORMAL',
        throttling: 'KISILIYOR (THROTTLE)',
        cooldown: 'BEKLEME SÜRESİ (COOLDOWN)',
        recovering: 'GERİ AÇILIYOR (RECOVERY)',
    };

    return (
        <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24, fontFamily: A.sans, color: A.text }}>
            
            {/* Başlık */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'between' }}>
                <div style={{ flex: 1 }}>
                    <Cap>Akıllı Performans Yönetimi</Cap>
                    <h1 style={{ fontSize: 22, fontWeight: 600, color: A.text, margin: '4px 0 2px', letterSpacing: '-0.01em' }}>
                        Auto-Throttle
                    </h1>
                    <p style={{ fontSize: 12, color: A.dim, margin: 0 }}>
                        Sunucu kasmaya başladığında otomatik kısıtlamalar uygular, lag geçince kademeli olarak geri açar.
                    </p>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: A.panel, border: `1px solid ${A.border}`, padding: '8px 16px', borderRadius: 4 }}>
                        <Cap style={{ color: status?.enabled ? A.ok : A.faint }}>SİSTEM DURUMU:</Cap>
                        <Toggle value={status?.enabled || false} onChange={(val) => toggleSystem.mutate(val)} />
                    </div>

                    <button onClick={() => { if(confirm('Tüm aktif kısıtlamaları kaldırıp varsayılan mod config değerlerine dönmek istiyor musunuz?')) resetAll.mutate(); }} disabled={resetAll.isPending} style={{ ...btnGhost, color: A.warn, borderColor: 'rgba(251,191,36,0.2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <I.Restart size={13} /> Değerleri Sıfırla
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                <Card title="Sistem Modu" accent={stateColors[status?.state || 'idle']}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: stateColors[status?.state || 'idle'], fontFamily: A.mono, margin: '4px 0' }}>
                        {stateLabels[status?.state || 'idle']}
                    </div>
                    <Cap style={{ display: 'block', marginTop: 8 }}>
                        {status?.state === 'cooldown' ? 'Kısıntı sonrası bekleme aşaması.' : 
                         status?.state === 'throttling' ? 'Lag tespiti yapıldı, config değerleri düşürülüyor.' :
                         status?.state === 'recovering' ? 'TPS stabil, değerler kademeli yükseltiliyor.' : 'Aktif izleme modunda.'}
                    </Cap>
                </Card>

                <KPI 
                    label="Ortalama TPS" 
                    value={status?.avgTps != null ? status.avgTps.toFixed(2) : '—'} 
                    spark={status?.tpsHistory?.map(h => h.tps) || []}
                    sparkMin={10}
                    sparkMax={20}
                    sparkColor={status?.avgTps >= 19 ? A.ok : status?.avgTps >= 15 ? A.warn : A.err}
                    sub="Son 5 dakikanın ortalaması"
                />

                <Card title="Aktif Kısıtlamalar">
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <Num size={24} color={status?.totalThrottled > 0 ? A.warn : A.text}>
                            {status?.totalThrottled ?? 0}
                        </Num>
                        <span style={{ fontSize: 12, color: A.faint, fontFamily: A.mono }}>
                            / {status?.totalRules ?? 0} kural kısık durumda
                        </span>
                    </div>
                    <Cap style={{ display: 'block', marginTop: 8 }}>
                        {status?.totalThrottled > 0 ? 'Bazı mod configleri şu an düşürülmüş durumda.' : 'Bütün config değerleri maksimum seviyede.'}
                    </Cap>
                </Card>

                <Card title="Can't Keep Up Uyarısı">
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <Num size={24} color={status?.cantKeepUpCount > 0 ? A.err : A.text}>
                            {status?.cantKeepUpCount ?? 0}
                        </Num>
                        <span style={{ fontSize: 12, color: A.faint, fontFamily: A.mono }}>kez tetiklendi</span>
                    </div>
                    <Cap style={{ display: 'block', marginTop: 8 }}>
                        Son 5 dakika içerisinde konsolda yakalanan lag uyarısı sayısı.
                    </Cap>
                </Card>
            </div>

            {/* Main Tabs */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${A.border}`, gap: 4 }}>
                {[
                    { id: 'profiles', label: 'Throttle Profilleri', icon: I.Wrench },
                    { id: 'settings', label: 'Eşik & Gelişmiş Ayarlar', icon: I.Cog },
                    { id: 'history', label: 'Aksiyon Geçmişi', icon: I.Clock },
                    { id: 'logs', label: 'Sistem Logu', icon: I.Console },
                ].map(tab => (
                    <button 
                        key={tab.id} 
                        onClick={() => { setActiveTab(tab.id); setIsEditing(false); setSelectedProfile(null); }}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            borderBottom: `2px solid ${activeTab === tab.id ? 'var(--accent)' : 'transparent'}`,
                            color: activeTab === tab.id ? '#fff' : A.dim,
                            fontSize: 12,
                            fontWeight: 500,
                            padding: '10px 16px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            transition: 'all 150ms'
                        }}
                    >
                        <tab.icon size={14} style={{ color: activeTab === tab.id ? 'var(--accent)' : A.faint }} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* TAB CONTENT: PROFILES */}
            {activeTab === 'profiles' && !isEditing && !showCreateModal && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Cap>{profiles.length} Profil Tanımlı</Cap>
                        <button onClick={startCreate} style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <I.Plus size={13} /> Profil Ekle
                        </button>
                    </div>

                    {profilesLoading ? (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: A.faint }}>Profiller yükleniyor...</div>
                    ) : profiles.length === 0 ? (
                        <div style={{ background: A.panel, border: `1px solid ${A.border}`, padding: '48px', borderRadius: 4, textAlign: 'center' }}>
                            <I.Wrench size={32} style={{ color: A.faintest, margin: '0 auto 12px', display: 'block' }} />
                            <div style={{ fontSize: 13, color: A.dim, marginBottom: 8 }}>Kayıtlı Throttle Profili Bulunamadı</div>
                            <p style={{ fontSize: 11, color: A.faint, maxWidth: 360, margin: '0 auto 16px' }}>
                                Sunucunun kasmaya başladığında otomatik müdahale edeceği mod config değerlerini tanımlamak için yeni bir profil oluşturun.
                            </p>
                            <button onClick={startCreate} style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <I.Plus size={13} /> İlk Profili Ekle
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                            {profiles.map(profile => (
                                <div key={profile.id} style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: 14, fontWeight: 600, color: A.text }}>{profile.name}</span>
                                            <Pill color={profile.enabled ? A.ok : A.faint}>
                                                {profile.enabled ? 'AKTİF' : 'DEVRE DIŞI'}
                                            </Pill>
                                            <Pill color="var(--accent)">
                                                ÖNCELİK: {profile.priority}
                                            </Pill>
                                            <code style={{ fontSize: 11, color: A.faint, fontFamily: A.mono }}>
                                                {profile.config_path} ({profile.config_format})
                                            </code>
                                        </div>

                                        {profile.reload_command && (
                                            <div style={{ fontSize: 11, color: A.dim }}>
                                                <span style={{ color: A.faint }}>Reload Komutu:</span> <code style={{ fontFamily: A.mono, color: A.warn }}>{profile.reload_command}</code>
                                            </div>
                                        )}

                                        {/* Rules Preview */}
                                        <div style={{ marginTop: 8, borderTop: `1px solid ${A.border}`, paddingTop: 8 }}>
                                            <Cap style={{ display: 'block', marginBottom: 6 }}>Kurallar & Değişken Durumları</Cap>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                                {(profile.rules || []).map((rule, ri) => {
                                                    const cur = rule.current_value != null ? parseFloat(rule.current_value) : parseFloat(rule.default_value);
                                                    const def = parseFloat(rule.default_value);
                                                    const isThrottled = cur < def;
                                                    return (
                                                        <div key={ri} style={{ background: A.bg, border: `1px solid ${A.border}`, borderRadius: 2, padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                            <code style={{ fontSize: 11, fontFamily: A.mono, color: isThrottled ? A.warn : A.text }}>
                                                                {rule.config_key}
                                                            </code>
                                                            <div style={{ fontSize: 10, color: A.faint }}>
                                                                Değer: <span style={{ color: isThrottled ? A.warn : A.ok, fontWeight: 600 }}>{cur}</span> (Varsayılan: {def}, Min: {rule.min_value})
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                        <button onClick={() => toggleProfile.mutate(profile.id)} style={{ ...btnGhost, color: profile.enabled ? A.dim : A.ok }}>
                                            {profile.enabled ? 'Durdur' : 'Etkinleştir'}
                                        </button>
                                        <button onClick={() => startEdit(profile)} style={btnGhost}>
                                            Düzenle
                                        </button>
                                        <button onClick={() => { if(confirm('Bu profili silmek istediğinize emin misiniz?')) deleteProfile.mutate(profile.id); }} style={{ ...btnGhost, color: A.err, borderColor: 'rgba(248,113,113,0.2)' }}>
                                            Sil
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* TAB CONTENT: CREATE / EDIT PROFILE FORM */}
            {(showCreateModal || isEditing) && (
                <Card title={isEditing ? 'Profili Düzenle' : 'Yeni Profil Ekle'}>
                    <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <Cap style={{ display: 'block', marginBottom: 4 }}>Profil Adı</Cap>
                                <Input value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="Örn: Create Mod Kinetics" required />
                            </div>
                            <div>
                                <Cap style={{ display: 'block', marginBottom: 4 }}>Öncelik Sırası (Düşük = Önce Kısılır)</Cap>
                                <Input type="number" value={profilePriority} onChange={e => setProfilePriority(e.target.value)} placeholder="1" required />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                            <div>
                                <Cap style={{ display: 'block', marginBottom: 4 }}>Config Dosya Yolu</Cap>
                                <Input value={profileConfigPath} onChange={e => setProfileConfigPath(e.target.value)} placeholder="Örn: config/create-common.toml" required />
                            </div>
                            <div>
                                <Cap style={{ display: 'block', marginBottom: 4 }}>Dosya Formatı</Cap>
                                <select 
                                    value={profileConfigFormat} 
                                    onChange={e => setProfileConfigFormat(e.target.value)}
                                    style={{
                                        background: A.bg, border: `1px solid ${A.border}`,
                                        color: A.text, fontFamily: A.sans,
                                        fontSize: 12, padding: '7px 10px', borderRadius: 2,
                                        width: '100%', outline: 'none'
                                    }}
                                >
                                    <option value="toml">TOML (Forge/NeoForge)</option>
                                    <option value="json">JSON</option>
                                    <option value="properties">Properties</option>
                                </select>
                            </div>
                            <div>
                                <Cap style={{ display: 'block', marginBottom: 4 }}>Reload Komutu (İsteğe Bağlı)</Cap>
                                <Input value={profileReloadCommand} onChange={e => setProfileReloadCommand(e.target.value)} placeholder="Örn: /create reload" />
                            </div>
                        </div>

                        {/* Rules Section */}
                        <div style={{ borderTop: `1px solid ${A.border}`, paddingTop: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <Cap style={{ color: '#fff' }}>Limit Kuralları</Cap>
                                <button type="button" onClick={addRule} style={btnGhost}>
                                    + Kural Ekle
                                </button>
                            </div>

                            {profileRules.length === 0 ? (
                                <div style={{ color: A.faint, fontSize: 11, textAlign: 'center', padding: '16px 0', border: `1px dashed ${A.border}`, borderRadius: 4 }}>
                                    Lütfen bu profile en az 1 limit kuralı ekleyin.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {profileRules.map((rule, idx) => (
                                        <div key={idx} style={{ background: A.bg, border: `1px solid ${A.border}`, borderRadius: 4, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 8 }}>
                                                <div>
                                                    <Cap style={{ display: 'block', marginBottom: 2 }}>Config Anahtarı (Dot-Notation)</Cap>
                                                    <Input value={rule.configKey} onChange={e => updateRuleField(idx, 'configKey', e.target.value)} placeholder="kinetics.maxStressCapacity" required />
                                                </div>
                                                <div>
                                                    <Cap style={{ display: 'block', marginBottom: 2 }}>Açıklama</Cap>
                                                    <Input value={rule.description} onChange={e => updateRuleField(idx, 'description', e.target.value)} placeholder="Stress limitini düşürür" />
                                                </div>
                                                <div>
                                                    <Cap style={{ display: 'block', marginBottom: 2 }}>Veri Tipi</Cap>
                                                    <select 
                                                        value={rule.valueType} 
                                                        onChange={e => updateRuleField(idx, 'valueType', e.target.value)}
                                                        style={{
                                                            background: A.bg, border: `1px solid ${A.border}`,
                                                            color: A.text, fontFamily: A.sans,
                                                            fontSize: 12, padding: '7px 10px', borderRadius: 2,
                                                            width: '100%', outline: 'none'
                                                        }}
                                                    >
                                                        <option value="number">Sayısal (Number)</option>
                                                        <option value="boolean">Mantıksal (Boolean)</option>
                                                        <option value="string">Metin (String)</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {rule.valueType === 'number' && (
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                                                    <div>
                                                        <Cap style={{ display: 'block', marginBottom: 2 }}>Maksimum (Varsayılan)</Cap>
                                                        <Input type="number" value={rule.defaultValue} onChange={e => updateRuleField(idx, 'defaultValue', e.target.value)} placeholder="256" required />
                                                    </div>
                                                    <div>
                                                        <Cap style={{ display: 'block', marginBottom: 2 }}>Minimum Limit</Cap>
                                                        <Input type="number" value={rule.minValue} onChange={e => updateRuleField(idx, 'minValue', e.target.value)} placeholder="64" required />
                                                    </div>
                                                    <div>
                                                        <Cap style={{ display: 'block', marginBottom: 2 }}>Kısma Adımı (Step Down)</Cap>
                                                        <Input type="number" value={rule.stepDown} onChange={e => updateRuleField(idx, 'stepDown', Number(e.target.value))} placeholder="32" required />
                                                    </div>
                                                    <div>
                                                        <Cap style={{ display: 'block', marginBottom: 2 }}>Açma Adımı (Step Up)</Cap>
                                                        <Input type="number" value={rule.stepUp} onChange={e => updateRuleField(idx, 'stepUp', Number(e.target.value))} placeholder="16" required />
                                                    </div>
                                                </div>
                                            )}

                                            {rule.valueType !== 'number' && (
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                                    <div>
                                                        <Cap style={{ display: 'block', marginBottom: 2 }}>Varsayılan Değer</Cap>
                                                        <Input value={rule.defaultValue} onChange={e => updateRuleField(idx, 'defaultValue', e.target.value)} placeholder="true" required />
                                                    </div>
                                                    <div>
                                                        <Cap style={{ display: 'block', marginBottom: 2 }}>Kısma Değeri (Minimum)</Cap>
                                                        <Input value={rule.minValue} onChange={e => updateRuleField(idx, 'minValue', e.target.value)} placeholder="false" required />
                                                    </div>
                                                </div>
                                            )}

                                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                <button type="button" onClick={() => removeRule(idx)} style={{ ...btnGhost, color: A.err, borderColor: 'rgba(248,113,113,0.1)' }}>
                                                    Kuralı Sil
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Form Buttons */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: `1px solid ${A.border}`, paddingTop: 16 }}>
                            <button type="button" onClick={() => { setShowCreateModal(false); setIsEditing(false); setSelectedProfile(null); }} style={btnGhost}>
                                İptal
                            </button>
                            <button type="submit" style={btnPrimary}>
                                Kaydet
                            </button>
                        </div>
                    </form>
                </Card>
            )}

            {/* TAB CONTENT: SETTINGS */}
            {activeTab === 'settings' && (
                <Card title="Gelişmiş Auto-Throttle Eşikleri">
                    <form 
                        onSubmit={(e) => {
                            e.preventDefault();
                            const formData = new FormData(e.target);
                            const updated = {};
                            for (const [k, v] of formData.entries()) {
                                updated[k] = Number(v);
                            }
                            updateSettings.mutate(updated);
                        }}
                        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
                    >
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                            <div>
                                <Cap style={{ display: 'block', marginBottom: 4 }}>Normal TPS Eşiği (Recovery Modu)</Cap>
                                <Input type="number" name="tpsNormal" defaultValue={settings.tpsNormal ?? 19.0} step="0.1" required />
                                <span style={{ fontSize: 10, color: A.faint }}>TPS bu değerin üzerine çıkınca recovery (eski değerlere geri dönme) başlar.</span>
                            </div>
                            <div>
                                <Cap style={{ display: 'block', marginBottom: 4 }}>Hafif Lag Eşiği (Throttle)</Cap>
                                <Input type="number" name="tpsWarn" defaultValue={settings.tpsWarn ?? 16.0} step="0.1" required />
                                <span style={{ fontSize: 10, color: A.faint }}>TPS bu değerin altına düşerse throttle (kısıtlama) süreci başlar.</span>
                            </div>
                            <div>
                                <Cap style={{ display: 'block', marginBottom: 4 }}>Aşırı Lag Eşiği (Kritik Throttle)</Cap>
                                <Input type="number" name="tpsCritical" defaultValue={settings.tpsCritical ?? 12.0} step="0.1" required />
                                <span style={{ fontSize: 10, color: A.faint }}>TPS bu kritik seviyenin altına inerse daha hızlı ve agresif kısıtlama uygulanır.</span>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <Cap style={{ display: 'block', marginBottom: 4 }}>Kontrol Aralığı (Saniye)</Cap>
                                <Input type="number" name="checkInterval" defaultValue={settings.checkInterval ?? 30} required />
                                <span style={{ fontSize: 10, color: A.faint }}>Sistem kaç saniyede bir TPS değerlerini kontrol etsin.</span>
                            </div>
                            <div>
                                <Cap style={{ display: 'block', marginBottom: 4 }}>TPS Geçmişi Boyutu</Cap>
                                <Input type="number" name="tpsHistorySize" defaultValue={settings.tpsHistorySize ?? 20} required />
                                <span style={{ fontSize: 10, color: A.faint }}>Ortalama hesaplamak için kaç adet TPS ölçümü bellekte tutulsun.</span>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                            <div>
                                <Cap style={{ display: 'block', marginBottom: 4 }}>Throttle Cooldown (Saniye)</Cap>
                                <Input type="number" name="cooldownAfterThrottle" defaultValue={settings.cooldownAfterThrottle ?? 120} required />
                                <span style={{ fontSize: 10, color: A.faint }}>Bir config kısıldıktan sonra etkiyi görmek için ne kadar beklensin.</span>
                            </div>
                            <div>
                                <Cap style={{ display: 'block', marginBottom: 4 }}>Recovery Cooldown (Saniye)</Cap>
                                <Input type="number" name="cooldownAfterRecovery" defaultValue={settings.cooldownAfterRecovery ?? 180} required />
                                <span style={{ fontSize: 10, color: A.faint }}>Kısılan bir değer arttırıldıktan sonra ne kadar beklensin.</span>
                            </div>
                            <div>
                                <Cap style={{ display: 'block', marginBottom: 4 }}>Stabil Kalma Süresi (Saniye)</Cap>
                                <Input type="number" name="stableTimeForRecovery" defaultValue={settings.stableTimeForRecovery ?? 300} required />
                                <span style={{ fontSize: 10, color: A.faint }}>Recovery başlamadan önce TPS en az kaç saniye boyunca stabil (Normal seviye üzerinde) kalmalıdır.</span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid ${A.border}`, paddingTop: 16 }}>
                            <button type="submit" style={btnPrimary}>
                                Ayarları Kaydet
                            </button>
                        </div>
                    </form>
                </Card>
            )}

            {/* TAB CONTENT: HISTORY */}
            {activeTab === 'history' && (
                <Card title="Throttle Değişiklik Günlüğü">
                    {history.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '24px 0', color: A.faint }}>Kayıtlı performans eylemi bulunamadı.</div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ borderBottom: `1px solid ${A.border}` }}>
                                        <th style={{ padding: '8px 12px' }}><Cap>Tarih</Cap></th>
                                        <th style={{ padding: '8px 12px' }}><Cap>Profil</Cap></th>
                                        <th style={{ padding: '8px 12px' }}><Cap>Kural / Key</Cap></th>
                                        <th style={{ padding: '8px 12px' }}><Cap>Eylem</Cap></th>
                                        <th style={{ padding: '8px 12px' }}><Cap>Eski Değer</Cap></th>
                                        <th style={{ padding: '8px 12px' }}><Cap>Yeni Değer</Cap></th>
                                        <th style={{ padding: '8px 12px' }}><Cap>TPS</Cap></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map((item) => (
                                        <tr key={item.id} style={{ borderBottom: `1px solid ${A.border}`, background: 'transparent' }}>
                                            <td style={{ padding: '10px 12px', fontFamily: A.mono, color: A.dim }}>
                                                {new Date(item.occurred_at || item.time).toLocaleString('tr-TR')}
                                            </td>
                                            <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                                                {item.profile_name || 'Bilinmeyen'}
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <code style={{ fontFamily: A.mono, color: A.dim }}>{item.config_key}</code>
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <Pill color={item.action === 'throttle' ? A.warn : item.action === 'recover' ? A.ok : A.accent}>
                                                    {item.action === 'throttle' ? '⬇ KISILDI' : item.action === 'recover' ? '⬆ AÇILDI' : 'Sıfırlandı'}
                                                </Pill>
                                            </td>
                                            <td style={{ padding: '10px 12px', fontFamily: A.mono }}>{item.old_value}</td>
                                            <td style={{ padding: '10px 12px', fontFamily: A.mono, color: item.action === 'throttle' ? A.warn : A.ok }}>
                                                {item.new_value}
                                            </td>
                                            <td style={{ padding: '10px 12px', fontFamily: A.mono, color: item.tps_at_time < 15 ? A.err : A.text }}>
                                                {item.tps_at_time ? item.tps_at_time.toFixed(1) : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            )}

            {/* TAB CONTENT: LOGS */}
            {activeTab === 'logs' && (
                <Card title="Canlı İzleyici & Teşhis Logları" action={
                    <button onClick={() => queryClient.invalidateQueries({ queryKey: ['autothrottle-log'] })} style={btnGhost}>
                        Yenile
                    </button>
                }>
                    <div style={{
                        background: A.bgDeeper, border: `1px solid ${A.border}`,
                        borderRadius: 4, padding: '12px 16px', maxHeight: '400px',
                        overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4,
                        fontFamily: A.mono, fontSize: 11
                    }}>
                        {logs.length === 0 ? (
                            <div style={{ color: A.faint, textAlign: 'center', padding: '16px 0' }}>Log girdisi bulunamadı.</div>
                        ) : (
                            logs.map((log, index) => (
                                <div key={index} style={{ lineBreak: 'anywhere' }}>
                                    <span style={{ color: A.faint }}>[{new Date(log.time).toLocaleTimeString()}]</span>{' '}
                                    <span style={{ color: log.source === 'system' ? 'var(--accent)' : A.warn }}>[{log.source.toUpperCase()}]</span>{' '}
                                    <span style={{ color: log.message.includes('HATA') ? A.err : A.text }}>{log.message}</span>
                                </div>
                            ))
                        )}
                    </div>
                </Card>
            )}

        </div>
    );
}
