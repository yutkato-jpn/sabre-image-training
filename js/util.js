// 共通ユーティリティ
export function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function navigate(hash) {
  location.hash = hash;
}

export function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// YouTube URL から videoId を抽出 (watch / youtu.be / shorts / embed / live 形式に対応)
export function parseYouTubeId(url) {
  const s = String(url || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m =
    s.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/) || null;
  return m ? m[1] : null;
}
