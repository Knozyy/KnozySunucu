// client/src/components/Dashboard/useWidgetLayout.js
import { useState, useEffect, useCallback } from 'react';
import api from '@/services/api';
import { DEFAULT_LAYOUT } from './defaultLayout';

export function useWidgetLayout() {
    const [layout, setLayout] = useState(DEFAULT_LAYOUT);
    const [savedLayout, setSavedLayout] = useState(DEFAULT_LAYOUT);
    const [editMode, setEditMode] = useState(false);
    const [loading, setLoading] = useState(true);

    // Mount'ta layout yükle
    useEffect(() => {
        api.get('/dashboard/layout')
            .then(r => {
                if (r.data?.layout && Array.isArray(r.data.layout) && r.data.layout.length > 0) {
                    setLayout(r.data.layout);
                    setSavedLayout(r.data.layout);
                }
            })
            .catch(() => { /* varsayılan layout kullan */ })
            .finally(() => setLoading(false));
    }, []);

    const save = useCallback(async (currentLayout) => {
        const toSave = currentLayout || layout;
        await api.put('/dashboard/layout', { layout: toSave });
        setSavedLayout(toSave);
        setEditMode(false);
    }, [layout]);

    const cancel = useCallback(() => {
        setLayout(savedLayout);
        setEditMode(false);
    }, [savedLayout]);

    const reset = useCallback(async () => {
        setLayout(DEFAULT_LAYOUT);
        await api.put('/dashboard/layout', { layout: DEFAULT_LAYOUT });
        setSavedLayout(DEFAULT_LAYOUT);
        setEditMode(false);
    }, []);

    const toggleEditMode = useCallback(() => setEditMode(prev => !prev), []);

    const deleteWidget = useCallback((widgetId) => {
        setLayout(prev => prev.filter(item => item.i !== widgetId));
    }, []);

    const addWidget = useCallback((widgetId) => {
        const defaultItem = DEFAULT_LAYOUT.find(item => item.i === widgetId);
        if (!defaultItem) return;
        // Mevcut en alt y konumunu bul
        setLayout(prev => {
            const maxY = prev.reduce((acc, item) => Math.max(acc, item.y + item.h), 0);
            return [...prev, { ...defaultItem, y: maxY }];
        });
    }, []);

    const hiddenWidgets = DEFAULT_LAYOUT.filter(d => !layout.find(l => l.i === d.i));

    return {
        layout, setLayout,
        editMode, toggleEditMode,
        loading,
        save, cancel, reset,
        deleteWidget, addWidget,
        hiddenWidgets,
    };
}
