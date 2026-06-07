// "Nick[/IP:port] logged in" — IPv4 ve IPv6 (köşeli parantezli) destekli.
// Önek "]: " ile sabit; chat satırları "<Nick>" içerdiği için eşleşmez.
const LOGIN_RE = /\]:\s+(\w{1,16})\[\/(?:\[([0-9a-fA-F:]+)\]|([0-9.]+)):\d+\] logged in/;

function parseLoginIp(line) {
  const m = line.match(LOGIN_RE);
  if (!m) return null;
  return { username: m[1], ip: m[2] || m[3] };
}

module.exports = { parseLoginIp };
