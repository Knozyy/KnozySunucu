// client/src/components/CommandPalette/CommandPalette.jsx
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Fuse from 'fuse.js';
import api from '@/services/api';
import { A } from '@/hodo/tokens';
import { I } from '@/hodo/icons';
import { CommandItem } from './CommandItem';
import { PAGES, ACTIONS, COMMON_FILES } from './commandRegistry';

export function CommandPalette({ open, onClose, query, setQuery, selectedIndex, setSelectedIndex }) {
    const navigate = useNavigate();
    const inputRef = useRef(null);
    const listRef = useRef(null);
    const debounceRef = useRef(null);

    const [players, setPlayers] = useState([]);
    const [loadingPlayers, setLoadingPlayers] = useState(false);
    const [confirmAction, setConfirmAction] = useState(null); // ACTIONS elemanı | null

    // Açılınca inputu focus'la, state'i sıfırla
    useEffect(() => {
        if (open) {
            setConfirmAction(null);
            setPlayers([]);
            setTimeout(() => inputRef.current?.focus(), 10);
        }
    }, [open]);

    // Canlı oyuncu araması (300ms debounce)
    useEffect(() => {
        if (!open || !query.trim()) {
            setPlayers([]);
            return;
        }
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setLoadingPlayers(true);
            try {
                const res = await api.get('/players', { params: { search: query } });
                const list = res.data?.players || res.data?.onlinePlayers || [];
                setPlayers(
                    list.slice(0, 5).map(p => ({
                        id: `player-${p.name || p.uuid}`,
                        label: p.name || p.uuid,
                        description: p.uuid ? `UUID: ${p.uuid.slice(0, 8)}…` : 'Oyuncu',
                        icon: 'Users',
                        category: 'Oyuncu',
                        path: '/players',
                    }))
                );
            } catch {
                setPlayers([]);
            } finally {
                setLoadingPlayers(false);
            }
        }, 300);
        return () => clearTimeout(debounceRef.current);
    }, [query, open]);

    // Statik öğeler (kategoriyle)
    const allStatic = useMemo(() => [
        ...PAGES.map(p => ({ ...p, category: 'Sayfa' })),
        ...ACTIONS.map(a => ({ ...a, category: 'Eylem' })),
        ...COMMON_FILES.map(f => ({ ...f, category: 'Dosya' })),
    ], []);

    // Fuzzy search instance
    const fuse = useMemo(() => new Fuse(allStatic, {
        keys: ['label', 'description'],
        threshold: 0.4,
    }), [allStatic]);

    const staticResults = query.trim()
        ? fuse.search(query).map(r => r.item)
        : allStatic.slice(0, 9);

    const results = [...staticResults, ...players];

    // selectedIndex sınırla
    useEffect(() => {
        setSelectedIndex(i => Math.min(i, Math.max(results.length - 1, 0)));
    }, [results.length, setSelectedIndex]);

    // Seçili öğeyi görünür kıl
    useEffect(() => {
        const el = listRef.current?.children[selectedIndex];
        el?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    // Öğeyi çalıştır
    const execute = useCallback(async (item) => {
        if (item.category === 'Eylem') {
            const action = ACTIONS.find(a => a.id === item.id);
            if (!action) return;
            if (action.confirm) {
                setConfirmAction(action);
                return;
            }
            try { await api[action.apiMethod](action.apiPath); } catch { /* sunucu yanıtsız */ }
            onClose();
            return;
        }
        navigate(item.path);
        onClose();
    }, [navigate, onClose]);

    // Klavye navigasyonu
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(i => Math.min(i + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (!confirmAction && results[selectedIndex]) execute(results[selectedIndex]);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            if (confirmAction) setConfirmAction(null);
            else onClose();
        }
    }, [results, selectedIndex, execute, onClose, confirmAction, setSelectedIndex]);

    if (!open) return null;

    const content = (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.65)',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                paddingTop: '15vh',
            }}
            onClick={onClose}
        >
            <style>{`@keyframes hodo-spin { to { transform: rotate(360deg); } }`}</style>

            <div
                onClick={e => e.stopPropagation()}
                onKeyDown={handleKeyDown}
                style={{
                    width: '100%', maxWidth: 600, margin: '0 16px',
                    background: A.panel, border: `1px solid ${A.borderHi}`,
                    borderRadius: 6, overflow: 'hidden',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
                }}
            >
                {/* ── Arama inputu ── */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 16px', borderBottom: `1px solid ${A.border}`,
                }}>
                    <I.Search size={15} style={{ color: A.faint, flexShrink: 0 }} />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
                        placeholder="Sayfa, eylem veya oyuncu ara…"
                        style={{
                            flex: 1, background: 'transparent', border: 'none',
                            outline: 'none', color: A.text, fontSize: 14,
                            fontFamily: A.sans,
                        }}
                    />
                    {loadingPlayers && (
                        <div style={{
                            width: 13, height: 13, flexShrink: 0,
                            border: `2px solid ${A.border}`, borderTopColor: 'var(--accent)',
                            borderRadius: '50%', animation: 'hodo-spin 0.8s linear infinite',
                        }} />
                    )}
                    <kbd style={{
                        fontSize: 10, color: A.faint, fontFamily: A.mono,
                        background: A.bgDeeper, border: `1px solid ${A.border}`,
                        padding: '2px 6px', borderRadius: 2, flexShrink: 0,
                    }}>ESC</kbd>
                </div>

                {/* ── Onay kutusu (tehlikeli eylemler) ── */}
                {confirmAction && (
                    <div style={{
                        padding: '14px 16px', borderBottom: `1px solid ${A.border}`,
                        background: 'rgba(248,113,113,0.04)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <I.Alert size={14} style={{ color: A.warn }} />
                            <span style={{ fontSize: 13, color: A.text }}>{confirmAction.confirmMsg}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                onClick={async () => {
                                    try { await api[confirmAction.apiMethod](confirmAction.apiPath); } catch { /* ignore */ }
                                    setConfirmAction(null);
                                    onClose();
                                }}
                                style={{
                                    background: A.err, border: 'none', color: '#fff',
                                    padding: '6px 16px', borderRadius: 2, cursor: 'pointer',
                                    fontSize: 11, fontFamily: A.mono, fontWeight: 600,
                                    letterSpacing: '0.06em', textTransform: 'uppercase',
                                }}
                            >
                                Onayla
                            </button>
                            <button
                                onClick={() => setConfirmAction(null)}
                                style={{
                                    background: 'transparent', border: `1px solid ${A.border}`,
                                    color: A.dim, padding: '6px 16px', borderRadius: 2, cursor: 'pointer',
                                    fontSize: 11, fontFamily: A.mono, letterSpacing: '0.06em',
                                    textTransform: 'uppercase',
                                }}
                            >
                                İptal
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Sonuç listesi ── */}
                <div ref={listRef} style={{ maxHeight: 360, overflowY: 'auto' }}>
                    {results.length === 0 ? (
                        <div style={{
                            padding: '32px 16px', textAlign: 'center',
                            color: A.faint, fontSize: 13, fontFamily: A.sans,
                        }}>
                            Sonuç bulunamadı
                        </div>
                    ) : (
                        results.map((item, i) => (
                            <CommandItem
                                key={item.id}
                                item={item}
                                selected={i === selectedIndex && !confirmAction}
                                onMouseEnter={() => setSelectedIndex(i)}
                                onSelect={() => execute(item)}
                            />
                        ))
                    )}
                </div>

                {/* ── Footer kısayol ipuçları ── */}
                <div style={{
                    padding: '8px 16px', borderTop: `1px solid ${A.border}`,
                    display: 'flex', gap: 16,
                }}>
                    {[['↑↓', 'Gezin'], ['↵', 'Seç'], ['ESC', 'Kapat']].map(([key, label]) => (
                        <span key={key} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                            <kbd style={{
                                fontSize: 10, color: A.faint, fontFamily: A.mono,
                                background: A.bgDeeper, border: `1px solid ${A.border}`,
                                padding: '1px 5px', borderRadius: 2,
                            }}>{key}</kbd>
                            <span style={{ fontSize: 10, color: A.faintest }}>{label}</span>
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );

    return createPortal(content, document.body);
}
