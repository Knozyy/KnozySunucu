// client/src/hooks/usePushSubscription.js
import { useState, useEffect, useCallback } from 'react';
import api from '@/services/api';

// VAPID public key'i URL-safe base64'ten Uint8Array'e çevirir
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export function usePushSubscription() {
    const [subscribed,  setSubscribed]  = useState(false);
    const [permission,  setPermission]  = useState('default');
    const [loading,     setLoading]     = useState(true);
    const [vapidKey,    setVapidKey]    = useState(null);
    const [error,       setError]       = useState(null);

    const supported = 'serviceWorker' in navigator && 'PushManager' in window;

    useEffect(() => {
        if (!supported) { setLoading(false); return; }

        setPermission(Notification.permission);

        let cancelled = false;
        (async () => {
            try {
                const [keyRes, reg] = await Promise.all([
                    api.get('/push/vapid-public-key'),
                    navigator.serviceWorker.register('/sw.js'),
                ]);
                if (cancelled) return;
                setVapidKey(keyRes.data.publicKey);
                const sub = await reg.pushManager.getSubscription();
                if (!cancelled) setSubscribed(!!sub);
            } catch (err) {
                if (!cancelled) setError(err.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [supported]);

    const subscribe = useCallback(async () => {
        if (!vapidKey) return;
        try {
            const perm = await Notification.requestPermission();
            setPermission(perm);
            if (perm !== 'granted') return;

            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidKey),
            });
            await api.post('/push/subscribe', { subscription: sub.toJSON() });
            setSubscribed(true);
        } catch (err) {
            setError(err.message);
        }
    }, [vapidKey]);

    const unsubscribe = useCallback(async () => {
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (!sub) return;
            const endpoint = sub.endpoint;
            await sub.unsubscribe();
            await api.delete('/push/unsubscribe', { data: { endpoint } });
            setSubscribed(false);
        } catch (err) {
            setError(err.message);
        }
    }, []);

    return { subscribed, permission, loading, supported, vapidKey, error, subscribe, unsubscribe };
}
