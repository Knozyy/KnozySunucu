import { useState, useEffect, useRef, useCallback } from 'react';

export function useWebSocket(token, serverId = null) {
    const [logs, setLogs] = useState([]);
    const [status, setStatus] = useState(null);
    const [connected, setConnected] = useState(false);
    const wsRef = useRef(null);
    const reconnectRef = useRef(null);
    // Her bağlantı için artan sayaç — eski bağlantıların state'e yazmasını engeller
    const connIdRef = useRef(0);

    const sendCommand = useCallback((command) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'command', data: command }));
        }
    }, []);

    const clearLogs = useCallback(() => setLogs([]), []);

    useEffect(() => {
        if (!token) return;

        // Yeni bağlantı: id artır, state'i sıfırla — eski sunucunun kalıntıları kalmasın
        const myConnId = ++connIdRef.current;
        setLogs([]);
        setStatus(null);
        setConnected(false);

        // Önceki reconnect timer'ını iptal et
        if (reconnectRef.current) {
            clearTimeout(reconnectRef.current);
            reconnectRef.current = null;
        }

        // Önceki ws varsa handler'larını sök, sonra kapat (onclose reconnect tetiklemesin)
        if (wsRef.current) {
            try {
                wsRef.current.onopen = null;
                wsRef.current.onmessage = null;
                wsRef.current.onclose = null;
                wsRef.current.onerror = null;
                wsRef.current.close();
            } catch { /* ignore */ }
            wsRef.current = null;
        }

        let cancelled = false;

        const open = () => {
            if (cancelled || myConnId !== connIdRef.current) return;

            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host;
            const serverParam = serverId ? `&serverId=${serverId}` : '';
            const wsUrl = `${protocol}//${host}/ws/console?token=${token}${serverParam}`;

            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                // Bağlantı kuruldu ama bu arada sunucu değiştiyse hemen kapat
                if (myConnId !== connIdRef.current) {
                    try { ws.close(); } catch { /* */ }
                    return;
                }
                setConnected(true);
            };

            ws.onmessage = (event) => {
                // Eski bir bağlantıdan gelen mesajları görmezden gel
                if (myConnId !== connIdRef.current) return;
                try {
                    const message = JSON.parse(event.data);
                    if (message.type === 'log') {
                        setLogs(prev => {
                            const newLogs = [...prev, message.data];
                            return newLogs.length > 500 ? newLogs.slice(-500) : newLogs;
                        });
                    } else if (message.type === 'status') {
                        setStatus(message.data);
                    }
                } catch { /* ignore */ }
            };

            ws.onclose = () => {
                // Sadece bu bağlantı hâlâ aktif olansa yeniden bağlanmayı dene
                if (myConnId !== connIdRef.current || cancelled) return;
                setConnected(false);
                reconnectRef.current = setTimeout(() => {
                    if (myConnId === connIdRef.current && !cancelled) open();
                }, 3000);
            };

            ws.onerror = () => { try { ws.close(); } catch { /* */ } };
        };

        open();

        return () => {
            cancelled = true;
            if (reconnectRef.current) {
                clearTimeout(reconnectRef.current);
                reconnectRef.current = null;
            }
            if (wsRef.current) {
                try {
                    wsRef.current.onopen = null;
                    wsRef.current.onmessage = null;
                    wsRef.current.onclose = null;
                    wsRef.current.onerror = null;
                    wsRef.current.close();
                } catch { /* ignore */ }
                wsRef.current = null;
            }
        };
    }, [token, serverId]);

    return { logs, status, connected, sendCommand, clearLogs };
}
