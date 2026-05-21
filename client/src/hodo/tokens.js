// Hodo design tokens — koyu kömür gri, mor aksan, yüksek yoğunluk
// Variant A "Console" palette

export const A = {
    bg:        '#0a0b0d',
    bgDeeper:  '#070809',
    bgTop:     '#0c0d10',
    panel:     '#101216',
    panelHi:   '#16191e',
    border:    '#1f2228',
    borderHi:  '#2a2e36',
    text:      '#e8eaed',
    dim:       '#9aa0a6',
    faint:     '#5f6368',
    faintest:  '#3c4046',
    ok:        '#4ade80',
    warn:      '#fbbf24',
    err:       '#f87171',
    accent:    'var(--accent)', // CSS değişkeni — varsayılan #a78bfa
    mono:      'ui-monospace, "JetBrains Mono", "SF Mono", monospace',
    sans:      '"Inter", system-ui, sans-serif',
};

export const ACCENT_OPTIONS = [
    { value: '#a78bfa', label: 'Violet' },
    { value: '#7c5cff', label: 'Indigo' },
    { value: '#22d3ee', label: 'Cyan'   },
    { value: '#4ade80', label: 'Mint'   },
    { value: '#fb923c', label: 'Ember'  },
];

// Ghost button stili — topbar / inline butonlar için
export const btnGhost = {
    background: 'transparent',
    border: `1px solid ${A.border}`,
    color: A.dim,
    fontSize: 11,
    padding: '5px 10px',
    borderRadius: 2,
    cursor: 'pointer',
    fontFamily: A.mono,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
};

export const btnPrimary = {
    background: 'var(--accent)',
    border: 'none',
    color: '#0a0b0d',
    fontSize: 11,
    padding: '6px 12px',
    borderRadius: 2,
    cursor: 'pointer',
    fontFamily: A.mono,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    fontWeight: 600,
};
