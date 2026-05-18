const webhook = require('./webhookService');

function start() {
    // Lazy-require to avoid circular dep at module load time
    const mcService = require('./minecraftService');

    mcService.on('status', (status) => {
        if (status === 'running') {
            webhook.send('server_start', 'Sunucu başarıyla başlatıldı ve oyuncuları kabul etmeye hazır.');
        } else if (status === 'stopped') {
            webhook.send('server_stop', 'Sunucu durduruldu.');
        }
    });

    mcService.on('crash', ({ code, crashCount }) => {
        webhook.send('server_crash', `Sunucu beklenmedik şekilde kapandı.`, {
            fields: [
                { name: 'Exit Code', value: String(code ?? -1), inline: true },
                { name: 'Çöküm Sayısı (5dk)', value: String(crashCount || 1), inline: true },
            ],
        });
    });

    mcService.on('log', (line) => {
        // Oyuncu giriş/çıkış loglarını yakala
        const joinMatch = line.match(/(\w+) joined the game/);
        if (joinMatch) {
            webhook.send('player_join', `**${joinMatch[1]}** sunucuya katıldı.`);
        }
        const leaveMatch = line.match(/(\w+) left the game/);
        if (leaveMatch) {
            webhook.send('player_leave', `**${leaveMatch[1]}** sunucudan ayrıldı.`);
        }
    });
}

module.exports = { start };
