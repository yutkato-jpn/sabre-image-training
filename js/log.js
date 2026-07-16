// トレーニングログ・統計・グラフ
import { store } from './storage.js';
import { esc } from './util.js';

// グラフ色 (dataviz validator 検証済み: dark surface #1c2330 で全チェックPASS)
const C_VIVID = '#3d87dd';
const C_CONTROL = '#bd8a28';
const INK_MUTED = '#6b7686';
const INK_DIM = '#9aa7b5';
const GRID = '#2d3848';

const MODE_LABEL = { session: '🧠 イメトレ', drill: '⚡ ドリル', video: '🎬 動画' };

export function renderLog(view) {
  const logs = store.getLogs().sort((a, b) => a.ts - b.ts);
  const goal = store.getSettings().weeklyGoal || 3;

  const weekCount = countThisWeek(logs);
  const streak = streakWeeks(logs, goal);
  const totalMin = logs.reduce((a, l) => a + (l.minutes || 0), 0);

  view.innerHTML = `
    <h2>トレーニング記録</h2>
    <p class="lead">研究上の目安は<b>週3〜4回・1回10〜15分</b>。効果は4週間以上の継続で蓄積されます。</p>
    <div class="stat-grid">
      <div class="stat-tile"><div class="num" style="color:${weekCount >= goal ? 'var(--green)' : 'var(--text)'}">${weekCount}<span style="font-size:0.9rem;color:var(--text-faint)">/${goal}</span></div><div class="cap">今週</div></div>
      <div class="stat-tile"><div class="num">${streak}</div><div class="cap">連続達成週</div></div>
      <div class="stat-tile"><div class="num">${totalMin}</div><div class="cap">累計 分</div></div>
    </div>
    ${vividnessChart(logs)}
    ${weeklyChart(logs)}
    <h3>履歴</h3>
    ${logs.length ? '<div class="card">' + [...logs].reverse().slice(0, 30).map(logRow).join('') + '</div>'
      : '<div class="empty">まだ記録がありません。<br>イメトレ・ドリル・動画のどれかを1本やると、ここに記録されます。</div>'}
    `;

  view.querySelectorAll('[data-dellog]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm('この記録を削除しますか?')) {
        store.deleteLog(a.dataset.dellog);
        renderLog(view);
      }
    })
  );
}

function logRow(l) {
  const d = new Date(l.ts);
  const when = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  let detail = `${l.minutes || 0}分`;
  if (l.vividness) detail += ` ・ 鮮明度${l.vividness} コントロール${l.control || '-'}`;
  if (l.score != null && l.total) detail += ` ・ ${l.score}/${l.total}`;
  return `
    <div class="log-item">
      <div>
        <div>${MODE_LABEL[l.mode] || l.mode} <b>${esc(l.title)}</b></div>
        <div style="color:var(--text-faint);font-size:0.76rem">${detail}${l.note ? ' ・ 📝' + esc(l.note) : ''}</div>
      </div>
      <div class="when">${when}<br><a class="small-link" style="color:var(--text-faint)" href="#" data-dellog="${l.id}">削除</a></div>
    </div>`;
}

// ---------- 今週・連続週 ----------
function weekStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // 月曜始まり
  d.setDate(d.getDate() - day);
  return d.getTime();
}

function countThisWeek(logs) {
  const ws = weekStart(Date.now());
  return logs.filter((l) => l.ts >= ws).length;
}

function streakWeeks(logs, goal) {
  if (!logs.length) return 0;
  const counts = new Map();
  for (const l of logs) {
    const w = weekStart(l.ts);
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  const WEEK = 7 * 24 * 3600 * 1000;
  let streak = 0;
  let w = weekStart(Date.now());
  // 今週は目標達成済みなら数える。未達成でも streak は先週から数える
  if ((counts.get(w) || 0) >= goal) streak++;
  w -= WEEK;
  while ((counts.get(w) || 0) >= goal) {
    streak++;
    w -= WEEK;
  }
  return streak;
}

// ---------- 鮮明度・コントロール度の推移 (2系列ライン) ----------
function vividnessChart(logs) {
  const pts = logs.filter((l) => l.mode === 'session' && l.vividness);
  if (pts.length < 2) {
    return `<div class="card chart-card"><div class="card-title">イメージ能力の推移</div>
      <div class="card-desc">ガイド付きイメトレを2回以上記録すると、鮮明度とコントロール度の推移がここに表示されます。イメージ能力は訓練で伸びる能力です。</div></div>`;
  }
  const last = pts.slice(-20); // 直近20セッション
  const W = 560, H = 220, PL = 30, PR = 74, PT = 16, PB = 28;
  const iw = W - PL - PR, ih = H - PT - PB;
  const x = (i) => PL + (last.length === 1 ? iw / 2 : (i / (last.length - 1)) * iw);
  const y = (v) => PT + ih - ((v - 1) / 4) * ih;

  const line = (key) => last.map((p, i) => `${x(i).toFixed(1)},${y(p[key] || 1).toFixed(1)}`).join(' ');
  const dots = (key, color) =>
    last
      .map((p, i) => {
        const d = new Date(p.ts);
        return `<circle cx="${x(i).toFixed(1)}" cy="${y(p[key] || 1).toFixed(1)}" r="4" fill="${color}" stroke="#1c2330" stroke-width="2"><title>${d.getMonth() + 1}/${d.getDate()} ${key === 'vividness' ? '鮮明度' : 'コントロール度'}: ${p[key] || '-'}</title></circle>`;
      })
      .join('');

  const gridLines = [1, 2, 3, 4, 5]
    .map((v) => `<line x1="${PL}" y1="${y(v)}" x2="${W - PR}" y2="${y(v)}" stroke="${GRID}" stroke-width="1"/><text x="${PL - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="${INK_MUTED}">${v}</text>`)
    .join('');

  const lastV = last[last.length - 1];
  return `
    <div class="card chart-card">
      <div class="card-title">イメージ能力の推移 <span style="font-weight:400;color:var(--text-faint);font-size:0.72rem">直近${last.length}セッション</span></div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="鮮明度とコントロール度の推移グラフ">
        ${gridLines}
        <polyline points="${line('vividness')}" fill="none" stroke="${C_VIVID}" stroke-width="2" stroke-linejoin="round"/>
        <polyline points="${line('control')}" fill="none" stroke="${C_CONTROL}" stroke-width="2" stroke-linejoin="round"/>
        ${dots('vividness', C_VIVID)}
        ${dots('control', C_CONTROL)}
        <text x="${W - PR + 10}" y="${y(lastV.vividness || 1) + 4}" font-size="11" fill="${INK_DIM}">鮮明度</text>
        <text x="${W - PR + 10}" y="${y(lastV.control || 1) + 4 + (Math.abs(y(lastV.control || 1) - y(lastV.vividness || 1)) < 14 ? 14 : 0)}" font-size="11" fill="${INK_DIM}">ｺﾝﾄﾛｰﾙ</text>
      </svg>
      <div class="card-meta">
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${C_VIVID};vertical-align:-1px"></span> 鮮明度</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${C_CONTROL};vertical-align:-1px"></span> コントロール度</span>
      </div>
    </div>`;
}

// ---------- 週間実施分数 (バー) ----------
function weeklyChart(logs) {
  if (!logs.length) return '';
  const WEEK = 7 * 24 * 3600 * 1000;
  const thisW = weekStart(Date.now());
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const w = thisW - i * WEEK;
    const min = logs.filter((l) => weekStart(l.ts) === w).reduce((a, l) => a + (l.minutes || 0), 0);
    const d = new Date(w);
    weeks.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, min });
  }
  const max = Math.max(...weeks.map((w) => w.min), 30);
  const W = 560, H = 170, PL = 30, PR = 10, PT = 18, PB = 26;
  const iw = W - PL - PR, ih = H - PT - PB;
  const bw = Math.min(40, (iw / weeks.length) * 0.62);
  const maxIdx = weeks.reduce((mi, w, i) => (w.min > weeks[mi].min ? i : mi), 0);

  const bars = weeks
    .map((w, i) => {
      const cx = PL + ((i + 0.5) / weeks.length) * iw;
      const h = (w.min / max) * ih;
      const yTop = PT + ih - h;
      const showLabel = w.min > 0 && (i === weeks.length - 1 || i === maxIdx);
      return `
        <rect x="${(cx - bw / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h, w.min > 0 ? 3 : 0).toFixed(1)}" rx="4" fill="${C_VIVID}"><title>${w.label}週: ${w.min}分</title></rect>
        ${showLabel ? `<text x="${cx}" y="${yTop - 6}" text-anchor="middle" font-size="11" fill="${INK_DIM}">${w.min}分</text>` : ''}
        <text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="10" fill="${INK_MUTED}">${w.label}</text>`;
    })
    .join('');

  return `
    <div class="card chart-card">
      <div class="card-title">週間トレーニング時間 <span style="font-weight:400;color:var(--text-faint);font-size:0.72rem">直近8週</span></div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="週ごとのトレーニング分数">
        <line x1="${PL}" y1="${PT + ih}" x2="${W - PR}" y2="${PT + ih}" stroke="${GRID}" stroke-width="1"/>
        ${bars}
      </svg>
    </div>`;
}
