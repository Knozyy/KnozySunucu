const https = require('https');
const http = require('http');
const { getDb } = require('../db/database');

const EVENT_LABELS = {
    server_start:  { label: 'Sunucu Başladı',   color: 0x10b981, emoji: '🟢' },
    server_stop:   { label: 'Sunucu Durdu',      color: 0x6b7280, emoji: '🔴' },
    server_crash:  { label: 'Sunucu Çöktü',      color: 0xef4444, emoji: '💥' },
    player_join:   { label: 'Oyuncu Girdi',       color: 0x3b82f6, emoji: '👋' },
    player_leave:  { label: 'Oyuncu Ayrıldı',    color: 0x8b5cf6, emoji: '👋' },
};

function getConfig() {
    try {
        const db = getDb();
        const urlRow = db.prepare("SELECT value FROM app_settings WHERE key = 'discord_webhook_url'").get();
        const evtRow = db.prepare("SELECT value FROM app_settings WHERE key = 'discord_webhook_events'").get();
        return {
            url: urlRow?.value || '',
            events: evtRow ? JSON.parse(evtRow.value) : Object.keys(EVENT_LABELS),
        };
    } catch { return { url: '', events: [] }; }
}

function setConfig({ url, events }) {
    const db = getDb();
    const upsert = db.prepare(`
        INSERT INTO app_settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);
    upsert.run('discord_webhook_url', url || '');
    upsert.run('discord_webhook_events', JSON.stringify(events || []));
}

function send(eventType, description, extra = {}) {
    const cfg = getConfig();
    if (!cfg.url) return;
    if (!cfg.events.includes(eventType)) return;

    const meta = EVENT_LABELS[eventType] || { label: eventType, color: 0x6b7280, emoji: '📢' };
    const payload = JSON.stringify({
        embeds: [{
            title: `${meta.emoji} ${meta.label}`,
            description,
            color: meta.color,
            timestamp: new Date().toISOString(),
            footer: { text: 'Knozy Sunucu Paneli' },
            ...(extra.fields ? { fields: extra.fields } : {}),
        }],
    });

    try {
        const url = new URL(cfg.url);
        const mod = url.protocol === 'https:' ? https : http;
        const req = mod.request({
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        });
        req.on('error', () => { /* silent */ });
        req.write(payload);
        req.end();
    } catch { /* ignore bad URL */ }
}

module.exports = { send, getConfig, setConfig, EVENT_LABELS };
