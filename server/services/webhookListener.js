const webhook = require('./webhookService');

/**
 * Tüm kayıtlı (ve sonradan eklenen) sunucu instance'larına webhook event listener bağlar.
 * Çoklu sunucu mimarisini destekler.
 */
function start() {
    const serverRegistry = require('./serverRegistry');

    const attached = new WeakSet();

    function attach(inst) {
        if (!inst || attached.has(inst)) return;
        attached.add(inst);

        const serverName = inst._serverConfig?.name || `Sunucu #${inst._serverConfig?.id || '?'}`;

        inst.on('status', (status) => {
            if (status === 'running') {
                webhook.send('server_start', `**${serverName}** başlatıldı ve oyuncuları kabul etmeye hazır.`);
            } else if (status === 'stopped') {
                webhook.send('server_stop', `**${serverName}** durduruldu.`);
            }
        });

        inst.on('crash', ({ code, crashCount }) => {
            webhook.send('server_crash', `**${serverName}** beklenmedik şekilde kapandı.`, {
                fields: [
                    { name: 'Exit Code',           value: String(code ?? -1),     inline: true },
                    { name: 'Çöküm Sayısı (5dk)',  value: String(crashCount || 1), inline: true },
                    { name: 'Sunucu',              value: serverName,              inline: true },
                ],
            });
        });

        inst.on('log', (line) => {
            // Log önekine (]:) sabitlenmiş + 1-16 karakter nick: chat ile sahte
            // katılma/ayrılma bildirimi gönderilmesini engeller.
            const joinMatch  = line.match(/\]:\s+(\w{1,16}) joined the game/);
            if (joinMatch)  webhook.send('player_join',  `👋 **${joinMatch[1]}** **${serverName}**'a katıldı.`);
            const leaveMatch = line.match(/\]:\s+(\w{1,16}) left the game/);
            if (leaveMatch) webhook.send('player_leave', `🚶 **${leaveMatch[1]}** **${serverName}**'dan ayrıldı.`);
        });
    }

    // 1) Var olan tüm sunucu instance'larına bağlan
    try {
        for (const inst of serverRegistry._instances.values()) attach(inst);
    } catch { /* ignore */ }

    // 2) Sonradan oluşturulan instance'ları yakalamak için _create'i sarmala (monkey-patch)
    const origCreate = serverRegistry._create.bind(serverRegistry);
    serverRegistry._create = function (serverRecord) {
        const inst = origCreate(serverRecord);
        try { attach(inst); } catch { /* ignore */ }
        return inst;
    };
}

module.exports = { start };
