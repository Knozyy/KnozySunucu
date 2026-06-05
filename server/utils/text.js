/**
 * Konsol/log metin temizligi.
 * screen oturumu + Minecraft, log dosyasina renk ve terminal kontrol kodlari
 * (ANSI escape) yazar; ayrica screen prompt'u satir basina "> " ekleyebilir.
 * Bu kodlar panel konsolunda "[m> [K" gibi cop olarak gorunur ve TPS regex'lerini
 * bozar. Bu yardimci, satirlari gostermeden/parse etmeden once temizler.
 */

// chalk/ansi-regex tabanli kapsamli ANSI escape yakalayici
// (renk, imlec, mod-set: ESC[m, ESC[K, ESC[?2004h, ESC=, vb.)
const ANSI_PATTERN = [
    '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d/#&.:=?%@~_]*)*)?\\u0007)',
    '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))',
].join('|');
const ANSI_REGEX = new RegExp(ANSI_PATTERN, 'g');

// Kalan tek tuk kontrol karakterleri (\t \n \r haric)
const CTRL_REGEX = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g');

function stripAnsi(s) {
    if (typeof s !== 'string') return s;
    return s.replace(ANSI_REGEX, '').replace(CTRL_REGEX, '');
}

/**
 * Bir konsol satirini gosterim/parse icin temizler:
 *  - ANSI escape kodlarini kaldirir
 *  - screen prompt artigi bastaki "> " tekrarlarini kaldirir
 */
function cleanConsoleLine(s) {
    if (typeof s !== 'string') return s;
    let out = stripAnsi(s);
    out = out.replace(/^(?:\s*>\s?)+/, ''); // bastaki "> " / "> > " prompt artiklari
    return out;
}

module.exports = { stripAnsi, cleanConsoleLine };
