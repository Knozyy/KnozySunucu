// client/src/components/Dashboard/widgets/ConnectionWidget.jsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { A } from '@/knozy/tokens';
import { Card, Cap } from '@/knozy/primitives';

function Row({ label, value, valueColor, copy, mono = true }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, padding: '7px 0',
        }}>
            <Cap style={{ textTransform: 'lowercase', fontSize: 11 }}>{label}</Cap>
            <span style={{
                fontFamily: mono ? A.mono : A.sans,
                fontSize: 12.5, color: valueColor || A.text,
                display: 'flex', alignItems: 'center', gap: 6,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                maxWidth: '70%',
            }}>
                {value}
                {copy && (
                    <button onClick={() => { navigator.clipboard.writeText(copy); toast.success('Kopyalandı'); }}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: A.faint, fontSize: 9, fontFamily: A.mono,
                            padding: '0 4px', letterSpacing: '0.08em',
                        }} title="Kopyala">copy</button>
                )}
            </span>
        </div>
    );
}

export function ConnectionWidget({ server }) {
    const conn = server?.connection || {};

    const { data: sysConn } = useQuery({
        queryKey: ['system-connection'],
        queryFn: () => api.get('/system/connection-info').then(r => r.data),
        staleTime: 60000,
    });

    const host = sysConn?.externalIp || sysConn?.localIp || '—';
    const port = conn.port || server?.port || 25565;
    const motd = (conn.motd || '').replace(/§./g, '').trim() || '—';
    const whitelist = conn.whitelist;
    const mcVer = conn.mcVersion || '—';
    const loader = conn.loader || '—';
    const versionLine = (mcVer !== '—' && loader !== '—') ? `${mcVer} / ${loader}` :
                        (mcVer !== '—' ? mcVer : (loader !== '—' ? loader : '—'));
    const connectStr = port === 25565 ? host : `${host}:${port}`;
    const hostnameLine = sysConn?.hostname || host;

    return (
        <Card title="bağlantı" accent={A.warn} style={{ height: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <Row label="IP"          value={hostnameLine} copy={hostnameLine}/>
                <Row label="ipv4"        value={host}/>
                <Row label="port"        value={port}/>
                <Row label="motd"        value={`"${motd}"`}/>
                <Row label="beyaz liste" value={whitelist ? 'ON' : 'OFF'}
                    valueColor={whitelist ? A.ok : A.faint}/>
                <Row label="sürüm"       value={versionLine}/>

                <div style={{
                    marginTop: 10, padding: '10px 12px',
                    background: A.bgDeeper, border: `1px solid ${A.border}`,
                    borderRadius: 4, fontFamily: A.mono, fontSize: 12, color: A.text,
                    display: 'flex', alignItems: 'center', gap: 6,
                    overflow: 'hidden',
                }}>
                    <span style={{ color: A.faint }}>$</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        connect {connectStr}
                    </span>
                    <button onClick={() => { navigator.clipboard.writeText(connectStr); toast.success('Kopyalandı'); }}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: A.faint, padding: 0,
                        }} title="Kopyala">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                    </button>
                </div>
            </div>
        </Card>
    );
}
