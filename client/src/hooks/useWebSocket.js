import { useState, useEffect, useRef, useCallback } from 'react';

export function useWebSocket(token, serverId = null) {
    const [logs, setLogs] = useState([]);
    const [status, setStatus] = useState(null);
    const [connected, setConnected] = useState(false);
    const wsRef = useRef(null);
    const reconnectRef = useRef(null);

    const connect = useCallback(() => {
        if (!token) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const serverParam = serverId ? `&serverId=${serverId}` : '';
        const wsUrl = `${protocol}//${host}/ws/console?token=${token}${serverParam}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setConnected(true);
        };

        ws.onmessage = (event) => {
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
            setConnected(false);
            reconnectRef.current = setTimeout(() => connect(), 3000);
        };

        ws.onerror = () => { ws.close(); };
    }, [token, serverId]);

    const sendCommand = useCallback((command) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'command', data: command }));
        }
    }, []);

    const clearLogs = useCallback(() => setLogs([]), []);

    useEffect(() => {
        connect();
        return () => {
            if (reconnectRef.current) clearTimeout(reconnectRef.current);
            if (wsRef.current) wsRef.current.close();
        };
    }, [connect]);

    return { logs, status, connected, sendCommand, clearLogs };
}
