import { useState, useEffect, useRef, useCallback } from 'react';

export function useWebSocket(token) {
    const [logs, setLogs] = useState([]);
    const [status, setStatus] = useState(null);
    const [connected, setConnected] = useState(false);
    const wsRef = useRef(null);
    const reconnectRef = useRef(null);

    const connect = useCallback(() => {
        if (!token) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws/console?token=${token}`;

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
                        if (newLogs.length > 500) {
                            return newLogs.slice(-500);
                        }
                        return newLogs;
                    });
                } else if (message.type === 'status') {
                    setStatus(message.data);
                }
            } catch {
                // Ignore malformed messages
            }
        };

        ws.onclose = () => {
            setConnected(false);
            // Reconnect after 3 seconds
            reconnectRef.current = setTimeout(() => {
                connect();
            }, 3000);
        };

        ws.onerror = () => {
            ws.close();
        };
    }, [token]);

    const sendCommand = useCallback((command) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'command', data: command }));
        }
    }, []);

    const clearLogs = useCallback(() => {
        setLogs([]);
    }, []);

    useEffect(() => {
        connect();

        return () => {
            if (reconnectRef.current) {
                clearTimeout(reconnectRef.current);
            }
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [connect]);

    return { logs, status, connected, sendCommand, clearLogs };
}
