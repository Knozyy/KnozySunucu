// client/src/components/CommandPalette/useCommandPalette.js
import { useState, useEffect, useCallback } from 'react';

export function useCommandPalette() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);

    const openPalette = useCallback(() => {
        setOpen(true);
        setQuery('');
        setSelectedIndex(0);
    }, []);

    const closePalette = useCallback(() => {
        setOpen(false);
        setQuery('');
        setSelectedIndex(0);
    }, []);

    // Global Ctrl+K / Cmd+K kısayolu
    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setOpen(prev => {
                    if (!prev) {
                        setQuery('');
                        setSelectedIndex(0);
                    }
                    return !prev;
                });
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    return { open, query, setQuery, selectedIndex, setSelectedIndex, openPalette, closePalette };
}
