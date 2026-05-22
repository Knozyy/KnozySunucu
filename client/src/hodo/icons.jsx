// Hodo icon seti — inline SVG, stroke based, 18px default

const baseProps = (size, sw) => ({
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', strokeWidth: sw,
    strokeLinecap: 'round', strokeLinejoin: 'round',
});

const makeIcon = (paths) => ({ size = 16, className, style, strokeWidth = 1.5 }) => (
    <svg {...baseProps(size, strokeWidth)} className={className} style={style}>{paths}</svg>
);

export const I = {
    Dashboard:  makeIcon(<><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></>),
    Terminal:   makeIcon(<><polyline points="4 7 9 12 4 17"/><line x1="12" y1="19" x2="20" y2="19"/></>),
    Console:    makeIcon(<><rect x="3" y="4" width="18" height="16" rx="1"/><polyline points="7 9 10 12 7 15"/><line x1="13" y1="15" x2="17" y2="15"/></>),
    World:      makeIcon(<><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18"/></>),
    Folder:     makeIcon(<><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></>),
    Cube:       makeIcon(<><path d="M12 3l8 4v10l-8 4-8-4V7z"/><path d="M4 7l8 4 8-4"/><path d="M12 11v10"/></>),
    Stack:      makeIcon(<><path d="M12 3l9 4.5L12 12 3 7.5z"/><path d="M3 12l9 4.5L21 12"/><path d="M3 16.5l9 4.5l9-4.5"/></>),
    Clock:      makeIcon(<><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></>),
    Archive:    makeIcon(<><rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><line x1="10" y1="12" x2="14" y2="12"/></>),
    Cog:        makeIcon(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.7l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.7-.3a1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5a1.6 1.6 0 0 0-1.7.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.7a1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1a1.6 1.6 0 0 0-.3-1.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.7.3a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5a1.6 1.6 0 0 0 1.7-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.7a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></>),
    Play:       makeIcon(<><polygon points="7 4 19 12 7 20 7 4"/></>),
    Stop:       makeIcon(<><rect x="6" y="6" width="12" height="12" rx="1"/></>),
    Restart:    makeIcon(<><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><polyline points="21 3 21 8 16 8"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><polyline points="3 21 3 16 8 16"/></>),
    Wrench:     makeIcon(<><path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8a2.8 2.8 0 0 1-4-4l8-8z"/></>),
    Users:      makeIcon(<><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15 14a5 5 0 0 1 6 5"/></>),
    Search:     makeIcon(<><circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="17" y2="17"/></>),
    Plus:       makeIcon(<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>),
    Minus:      makeIcon(<><line x1="5" y1="12" x2="19" y2="12"/></>),
    Chevron:    makeIcon(<><polyline points="9 6 15 12 9 18"/></>),
    ChevronDown:makeIcon(<><polyline points="6 9 12 15 18 9"/></>),
    CPU:        makeIcon(<><rect x="6" y="6" width="12" height="12" rx="1"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="3" x2="9" y2="6"/><line x1="12" y1="3" x2="12" y2="6"/><line x1="15" y1="3" x2="15" y2="6"/><line x1="9" y1="18" x2="9" y2="21"/><line x1="12" y1="18" x2="12" y2="21"/><line x1="15" y1="18" x2="15" y2="21"/><line x1="3" y1="9" x2="6" y2="9"/><line x1="3" y1="12" x2="6" y2="12"/><line x1="3" y1="15" x2="6" y2="15"/><line x1="18" y1="9" x2="21" y2="9"/><line x1="18" y1="12" x2="21" y2="12"/><line x1="18" y1="15" x2="21" y2="15"/></>),
    RAM:        makeIcon(<><rect x="2" y="8" width="20" height="9" rx="1"/><line x1="6" y1="11" x2="6" y2="14"/><line x1="10" y1="11" x2="10" y2="14"/><line x1="14" y1="11" x2="14" y2="14"/><line x1="18" y1="11" x2="18" y2="14"/></>),
    Disk:       makeIcon(<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></>),
    Signal:     makeIcon(<><path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8 15.5a6 6 0 0 1 8 0"/><circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none"/></>),
    Power:      makeIcon(<><path d="M12 3v9"/><path d="M5.6 6.6a8 8 0 1 0 12.8 0"/></>),
    Globe:      makeIcon(<><circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a14 14 0 0 1 4 9a14 14 0 0 1-4 9a14 14 0 0 1-4-9a14 14 0 0 1 4-9z"/></>),
    Upload:     makeIcon(<><path d="M12 20V8"/><polyline points="6 12 12 6 18 12"/><line x1="4" y1="20" x2="20" y2="20"/></>),
    Download:   makeIcon(<><path d="M12 4v12"/><polyline points="6 12 12 18 18 12"/><line x1="4" y1="20" x2="20" y2="20"/></>),
    Trash:      makeIcon(<><polyline points="3 6 21 6"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14"/></>),
    X:          makeIcon(<><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></>),
    Check:      makeIcon(<><polyline points="5 12 10 17 19 7"/></>),
    Alert:      makeIcon(<><path d="M12 3l10 18H2z"/><line x1="12" y1="10" x2="12" y2="15"/><line x1="12" y1="18" x2="12" y2="18.5"/></>),
    Logout:     makeIcon(<><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><polyline points="9 17 14 12 9 7"/><line x1="14" y1="12" x2="4" y2="12"/></>),
    ArrowUpRight: makeIcon(<><line x1="6" y1="18" x2="18" y2="6"/><polyline points="9 6 18 6 18 15"/></>),
    Filter:     makeIcon(<><polyline points="3 5 10 13 10 19 14 21 14 13 21 5"/></>),
    Calendar:   makeIcon(<><rect x="3" y="5" width="18" height="16" rx="1"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></>),
    Send:       makeIcon(<><line x1="3" y1="12" x2="20" y2="12"/><polyline points="13 5 20 12 13 19"/></>),
    Chat:       makeIcon(<><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></>),
    Server:     makeIcon(<><rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/><line x1="7" y1="7" x2="7" y2="7"/><line x1="7" y1="17" x2="7" y2="17"/></>),
};

export default I;
