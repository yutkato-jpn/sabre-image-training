// ガイド付きイメトレのセッションプレイヤー
import { PRESET_SCENARIOS, CATEGORIES, personalize } from './data/scenarios.js';
import { store } from './storage.js';
import { tts } from './tts.js';
import { esc, navigate } from './util.js';

export function findScenario(id) {
  return (
    PRESET_SCENARIOS.find((s) => s.id === id) ||
    store.getCustomScenarios().find((s) => s.id === id) ||
    null
  );
}

export function allScenarios() {
  return [...PRESET_SCENARIOS, ...store.getCustomScenarios()];
}

// ---------------- シナリオ一覧 ----------------
export function renderTrainList(view) {
  const custom = store.getCustomScenarios();
  const order = ['quick', 'intro', 'skill', 'tactic', 'mental'];
  let html = `
    <h2>ガイド付きイメトレ</h2>
    <p class="lead">一人称・実速度でイメージするのが原則です。可能なら剣(または代用の棒)を持ち、軽く構えて行うとさらに効果が上がります。</p>
    <div class="btn-row" style="margin:0 0 16px">
      <a class="btn secondary small" href="#editor">+ シナリオを自作する</a>
    </div>`;

  for (const cat of order) {
    const items = PRESET_SCENARIOS.filter((s) => s.cat === cat);
    if (!items.length) continue;
    const c = CATEGORIES[cat];
    html += `<h3><span class="badge ${c.className}">${c.label}</span> <span style="font-weight:400;color:var(--text-faint);font-size:0.78rem">${c.desc}</span></h3>`;
    html += items.map((s) => scenarioCard(s)).join('');
  }

  if (custom.length) {
    const c = CATEGORIES.custom;
    html += `<h3><span class="badge ${c.className}">${c.label}</span></h3>`;
    html += custom.map((s) => scenarioCard(s, true)).join('');
  }
  view.innerHTML = html;
}

function scenarioCard(s, isCustom = false) {
  const c = CATEGORIES[s.cat] || CATEGORIES.custom;
  return `
    <div class="card tappable" onclick="location.hash='#session/${esc(s.id)}'">
      <div class="card-title">${esc(s.title)} <span class="badge ${c.className}">${c.label}</span></div>
      <div class="card-desc">${esc(s.desc || '')}</div>
      <div class="card-meta">
        <span>⏱ 約${s.minutes}分</span>
        <span>${esc(s.fn || '')}</span>
        ${isCustom ? `<a class="small-link" href="#editor/${esc(s.id)}" onclick="event.stopPropagation()">編集</a>` : ''}
      </div>
    </div>`;
}

// ---------------- プレイヤー ----------------
let timerId = null;
let cancelled = false;

export function cleanupSession() {
  cancelled = true;
  if (timerId) clearInterval(timerId);
  timerId = null;
  tts.stop();
}

export function renderSession(view, id) {
  const sc = findScenario(id);
  if (!sc) {
    view.innerHTML = '<div class="empty">シナリオが見つかりません。</div>';
    return;
  }
  const c = CATEGORIES[sc.cat] || CATEGORIES.custom;
  const settings = store.getSettings();
  view.innerHTML = `
    <div class="player">
      <div>
        <span class="badge ${c.className}">${c.label}</span>
        <h2 style="margin-top:8px">${esc(sc.title)}</h2>
        <p class="lead">${esc(sc.desc || '')}</p>
        <div class="card">
          <div class="card-desc">
            ⏱ 約${sc.minutes}分 ・ ${sc.steps.length}ステップ<br>
            🔊 音声ガイド: ${tts.available && settings.ttsEnabled ? 'ON(設定で変更可)' : 'OFF(テキスト+チャイムで進行)'}<br>
            🤺 可能なら立って軽く構え、剣か代用の棒を持って行うと効果的です(PETTLEPのP)。
          </div>
        </div>
      </div>
      <div style="flex:1"></div>
      <button id="btn-start" class="btn block">セッションを開始</button>
    </div>`;
  view.querySelector('#btn-start').addEventListener('click', () => {
    tts.prime(); // ユーザー操作起点でTTS/音をアンロック
    runSession(view, sc);
  });
}

async function runSession(view, sc) {
  cancelled = false;
  const startedAt = Date.now();
  const steps = sc.steps;
  const profile = store.getProfile();
  let paused = false;

  for (let i = 0; i < steps.length; i++) {
    if (cancelled) return;
    const step = steps[i];
    const text = personalize(step.text, profile);

    view.innerHTML = `
      <div class="player">
        <div class="player-phase">${esc(step.phase)} ・ ステップ ${i + 1}/${steps.length}</div>
        <div class="player-progress">
          ${steps.map((_, j) => `<div class="seg ${j < i ? 'done' : j === i ? 'now' : ''}"></div>`).join('')}
        </div>
        <div class="player-text">${esc(text)}</div>
        <div class="player-timer" id="timer">読み上げ中…</div>
        <div class="player-hint" id="hint">${step.wait > 3 ? 'このあと目を閉じてイメージ。チャイムで次へ進みます' : ''}</div>
        <div class="player-controls">
          <button class="btn ghost" id="btn-quit">中断</button>
          <button class="btn secondary" id="btn-pause">一時停止</button>
          <button class="btn" id="btn-skip">次へ ›</button>
        </div>
      </div>`;

    let skipResolve;
    const skipPromise = new Promise((r) => (skipResolve = r));
    view.querySelector('#btn-quit').addEventListener('click', () => {
      cleanupSession();
      navigate('#train');
    });
    view.querySelector('#btn-skip').addEventListener('click', () => {
      tts.stop();
      skipResolve('skip');
    });
    const pauseBtn = view.querySelector('#btn-pause');
    pauseBtn.addEventListener('click', () => {
      paused = !paused;
      pauseBtn.textContent = paused ? '再開する' : '一時停止';
      if (paused) tts.stop();
    });

    // 読み上げ (スキップで打ち切り可)
    await Promise.race([tts.speak(text), skipPromise]);
    if (cancelled) return;

    // 無音イメージ時間
    let remain = step.wait || 0;
    const timerEl = view.querySelector('#timer');
    if (remain > 0 && timerEl) {
      timerEl.classList.add('imaging');
      await Promise.race([
        new Promise((resolve) => {
          const tick = () => {
            if (cancelled) { clearInterval(timerId); resolve(); return; }
            if (paused) return;
            timerEl.textContent = format(remain);
            remain--;
            if (remain < 0) { clearInterval(timerId); resolve(); }
          };
          timerId = setInterval(tick, 1000);
          tick();
        }),
        skipPromise,
      ]);
      if (timerId) clearInterval(timerId);
      if (cancelled) return;
      tts.chime(i === steps.length - 1 ? 'end' : 'soft');
    }
  }

  const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
  renderRating(view, sc, minutes);
}

function format(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : String(s);
}

// ---------------- 事後評価 (VMIQ型自己評価) ----------------
function renderRating(view, sc, minutes) {
  let vividness = 0;
  let control = 0;
  view.innerHTML = `
    <h2>おつかれさまでした 🎉</h2>
    <p class="lead">${esc(sc.title)} ・ 約${minutes}分</p>
    <div class="card">
      <div class="rating-row">
        <div class="rating-label">鮮明度<small>映像・音・身体感覚はどれくらいリアルだったか</small></div>
        <div class="stars" id="stars-v">${starBtns()}</div>
      </div>
      <div class="rating-row" style="margin-bottom:0">
        <div class="rating-label">コントロール度<small>イメージを思い通りに動かせたか</small></div>
        <div class="stars" id="stars-c">${starBtns()}</div>
      </div>
    </div>
    <label class="field"><span class="label">メモ(鮮明だった場面・薄かった場面・気づき)</span>
      <textarea id="note" placeholder="例: パラード5だけ映像が飛ぶ。次回はスローで作り直す"></textarea>
    </label>
    <button class="btn block" id="btn-save">記録して終了</button>`;

  const wire = (boxId, set) => {
    const box = view.querySelector(boxId);
    box.querySelectorAll('button').forEach((b, idx) => {
      b.addEventListener('click', () => {
        set(idx + 1);
        box.querySelectorAll('button').forEach((x, j) => x.classList.toggle('on', j <= idx));
      });
    });
  };
  wire('#stars-v', (v) => (vividness = v));
  wire('#stars-c', (v) => (control = v));

  view.querySelector('#btn-save').addEventListener('click', () => {
    store.addLog({
      mode: 'session',
      title: sc.title,
      minutes,
      vividness: vividness || null,
      control: control || null,
      note: view.querySelector('#note').value.trim() || null,
    });
    navigate('#log');
  });
}

function starBtns() {
  return [1, 2, 3, 4, 5].map(() => '<button type="button">★</button>').join('');
}
