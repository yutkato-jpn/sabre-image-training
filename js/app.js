// Sabre Mind — エントリポイント / ルーター
import { store } from './storage.js';
import { tts } from './tts.js';
import { esc } from './util.js';
import { PRESET_SCENARIOS, CATEGORIES } from './data/scenarios.js';
import { renderTrainList, renderSession, cleanupSession } from './session.js';
import { renderDrills, renderDrillEditor } from './drills.js';
import { renderVideos, renderVideoEdit, renderVideoPlay, cleanupVideos } from './videos.js';
import { renderEditor } from './editor.js';
import { renderLog } from './log.js';

const view = document.getElementById('view');

function route() {
  cleanupSession();
  cleanupVideos();
  window.scrollTo(0, 0);

  const hash = location.hash.replace(/^#/, '') || 'home';
  const [name, ...args] = hash.split('/');

  document.querySelectorAll('.tabbar a').forEach((a) => {
    const tab = a.dataset.tab;
    const active =
      tab === name ||
      (tab === 'train' && ['session', 'editor'].includes(name)) ||
      (tab === 'drills' && name === 'drill-editor') ||
      (tab === 'videos' && ['video-edit', 'video-play'].includes(name));
    a.classList.toggle('active', active);
  });

  switch (name) {
    case 'home': renderHome(view); break;
    case 'train': renderTrainList(view); break;
    case 'session': renderSession(view, args[0]); break;
    case 'drills': renderDrills(view); break;
    case 'drill-editor': renderDrillEditor(view); break;
    case 'videos': renderVideos(view); break;
    case 'video-edit': renderVideoEdit(view, args[0]); break;
    case 'video-play': renderVideoPlay(view, args[0], args[1] || 'occlusion'); break;
    case 'editor': renderEditor(view, args[0]); break;
    case 'log': renderLog(view); break;
    case 'settings': renderSettings(view); break;
    case 'about': renderAbout(view); break;
    default: renderHome(view);
  }
}

// ---------------- ホーム ----------------
function renderHome(v) {
  const logs = store.getLogs();
  const goal = store.getSettings().weeklyGoal || 3;

  // 今週 (月曜始まり) の実施日
  const now = new Date();
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const doneDays = new Set(
    logs
      .filter((l) => l.ts >= monday.getTime())
      .map((l) => Math.floor((l.ts - monday.getTime()) / 86400000))
  );
  const weekCount = logs.filter((l) => l.ts >= monday.getTime()).length;
  const todayIdx = (now.getDay() + 6) % 7;
  const dayNames = ['月', '火', '水', '木', '金', '土', '日'];

  const rec = recommend(logs);
  const recCat = CATEGORIES[rec.cat];

  v.innerHTML = `
    <div class="hero">
      <div class="greeting">サーブルは、頭の中で強くなれる。</div>
      <div class="week-status">${weekCount >= goal ? '今週の目標達成 💪' : `今週 ${weekCount} / ${goal} セッション`}</div>
      <div class="week-sub">研究上の目安: 週3〜4回 × 10〜15分。短くても続けることが効きます。</div>
      <div class="week-dots">
        ${dayNames.map((d, i) => `<div class="dot ${doneDays.has(i) ? 'done' : ''} ${i === todayIdx ? 'today' : ''}">${doneDays.has(i) ? '✓' : d}</div>`).join('')}
      </div>
    </div>

    <h3>クイックスタート</h3>
    <div class="quick-grid">
      <div class="card tappable" onclick="location.hash='#session/preset-1min'">
        <div class="card-title">⏱ 直前1分</div>
        <div class="card-desc">練習・試合の直前に</div>
      </div>
      <div class="card tappable" onclick="location.hash='#session/preset-3min'">
        <div class="card-title">🎯 3分ルーティン</div>
        <div class="card-desc">試合の合間に</div>
      </div>
      <div class="card tappable" onclick="location.hash='#drills'">
        <div class="card-title">⚡ 先読みドリル</div>
        <div class="card-desc">パターン辞書を作る</div>
      </div>
      <div class="card tappable" onclick="location.hash='#session/preset-commute'">
        <div class="card-title">🎧 移動中15分</div>
        <div class="card-desc">1試合まるごと再生</div>
      </div>
    </div>

    <h3>今日のおすすめ</h3>
    <div class="card tappable" onclick="location.hash='#session/${esc(rec.id)}'">
      <div class="card-title">${esc(rec.title)} <span class="badge ${recCat.className}">${recCat.label}</span></div>
      <div class="card-desc">${esc(rec.desc)}</div>
      <div class="card-meta"><span>⏱ 約${rec.minutes}分</span><span>${esc(rec.reason)}</span></div>
    </div>

    <div class="card tappable" onclick="location.hash='#about'">
      <div class="card-title">🔬 なぜイメトレで強くなれるのか</div>
      <div class="card-desc">0.2秒の壁・PETTLEP・時間遮蔽訓練 — このアプリの科学的根拠</div>
    </div>`;
}

// 直近のセッション履歴から、最も手薄なカテゴリのシナリオを提案する
function recommend(logs) {
  const cats = ['intro', 'skill', 'tactic', 'mental'];
  const sessions = logs.filter((l) => l.mode === 'session');

  // 初回〜3回目までは入門を薦める
  const introDone = sessions.filter((l) => PRESET_SCENARIOS.some((s) => s.cat === 'intro' && s.title === l.title)).length;
  if (sessions.length < 3 && introDone < 3) {
    const next = PRESET_SCENARIOS.filter((s) => s.cat === 'intro')[Math.min(introDone, 2)];
    return { ...next, reason: 'まずはイメージ力の土台づくりから' };
  }

  const lastByCat = {};
  for (const l of sessions) {
    const sc = PRESET_SCENARIOS.find((s) => s.title === l.title);
    if (sc) lastByCat[sc.cat] = Math.max(lastByCat[sc.cat] || 0, l.ts);
  }
  const target = cats.filter((c) => c !== 'intro').sort((a, b) => (lastByCat[a] || 0) - (lastByCat[b] || 0))[0];
  const pool = PRESET_SCENARIOS.filter((s) => s.cat === target);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return { ...pick, reason: 'しばらくやっていないカテゴリです' };
}

// ---------------- 設定 ----------------
function renderSettings(v) {
  const p = store.getProfile();
  const s = store.getSettings();
  v.innerHTML = `
    <h2>設定</h2>
    <h3>音声ガイド</h3>
    <div class="card">
      <label class="field" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span>読み上げを使う ${tts.available ? '' : '(この端末では利用不可)'}</span>
        <input type="checkbox" id="s-tts" ${s.ttsEnabled ? 'checked' : ''} style="width:22px;height:22px">
      </label>
      <label class="field" style="margin-bottom:0"><span class="label">読み上げ速度: <span id="rate-val">${s.ttsRate.toFixed(1)}</span>x</span>
        <input type="range" id="s-rate" min="0.6" max="1.6" step="0.1" value="${s.ttsRate}" style="width:100%">
      </label>
    </div>

    <h3>週間目標</h3>
    <div class="card">
      <label class="field" style="margin-bottom:0"><span class="label">1週間のセッション目標(研究上の推奨は3〜4回)</span>
        <select id="s-goal">${[2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}" ${s.weeklyGoal === n ? 'selected' : ''}>週${n}回</option>`).join('')}</select>
      </label>
    </div>

    <h3>パーソナライズ</h3>
    <p class="lead">ここに書いた内容がガイド文に差し込まれます。<b>自分の現実を使ったスクリプトは既製品より効果が高い</b>ことが研究で示されています。</p>
    <label class="field"><span class="label">自分の剣・グリップ(例: ベルギアングリップの◯◯)</span><input type="text" id="p-weapon" value="${esc(p.weapon)}"></label>
    <label class="field"><span class="label">ホームの練習場(例: ◯◯体育館)</span><input type="text" id="p-homeGym" value="${esc(p.homeGym)}"></label>
    <label class="field"><span class="label">よく出る試合会場(例: 駒沢体育館)</span><input type="text" id="p-venue" value="${esc(p.venue)}"></label>
    <label class="field"><span class="label">得意技(例: 出鼻を捉えるプレパラシオンへのアタック)</span><input type="text" id="p-bestMove" value="${esc(p.bestMove)}"></label>
    <label class="field"><span class="label">セルフトーク(例: 足から。先に仕掛ける)</span><input type="text" id="p-selfTalk" value="${esc(p.selfTalk)}"></label>
    <button class="btn block" id="btn-save">保存する</button>

    <h3>データのバックアップ</h3>
    <p class="lead">データはこの端末のブラウザ内にのみ保存されます。機種変更やブラウザのデータ削除に備えて、ときどき書き出しておいてください。</p>
    <div class="btn-row">
      <button class="btn secondary" id="btn-export">書き出し (JSON)</button>
      <button class="btn secondary" id="btn-import">読み込み</button>
    </div>
    <input type="file" id="import-file" accept=".json,application/json" style="display:none">
    <hr class="divider">
    <a class="small-link" href="#about">🔬 このアプリの科学的根拠について</a>`;

  v.querySelector('#s-rate').addEventListener('input', (e) => {
    v.querySelector('#rate-val').textContent = Number(e.target.value).toFixed(1);
  });

  v.querySelector('#btn-save').addEventListener('click', () => {
    store.saveSettings({
      ttsEnabled: v.querySelector('#s-tts').checked,
      ttsRate: Number(v.querySelector('#s-rate').value),
      weeklyGoal: Number(v.querySelector('#s-goal').value),
    });
    store.saveProfile({
      weapon: v.querySelector('#p-weapon').value.trim(),
      homeGym: v.querySelector('#p-homeGym').value.trim(),
      venue: v.querySelector('#p-venue').value.trim(),
      bestMove: v.querySelector('#p-bestMove').value.trim(),
      selfTalk: v.querySelector('#p-selfTalk').value.trim(),
    });
    location.hash = '#home';
  });

  v.querySelector('#btn-export').addEventListener('click', () => {
    const blob = new Blob([store.exportAll()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sabre-mind-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  const fileInput = v.querySelector('#import-file');
  v.querySelector('#btn-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    if (!f) return;
    try {
      store.importAll(await f.text());
      alert('読み込みました');
      location.hash = '#home';
    } catch (e) {
      alert('読み込めませんでした: ' + e.message);
    }
  });
}

// ---------------- 科学的根拠 ----------------
function renderAbout(v) {
  v.innerHTML = `
    <div class="about">
    <h2>🔬 なぜイメトレで強くなれるのか</h2>
    <p><strong>脳は、リアルにイメージしている間、実際に動いているときとほぼ同じ領域を働かせています。</strong>作戦を練る領域や運動をプログラムする領域はイメージ中も活動し、筋肉への最終出力だけが止まっている。だから身体を疲れさせずに、技術と戦術の回路だけを鍛えられます。</p>

    <h3>0.2秒の壁と「予測」</h3>
    <p>人間が相手の動きを見てから反応するには約0.2秒かかり、これは訓練してもほぼ縮みません。上位選手が「速く見える」のは、反射が速いのではなく<strong>予測で動き出しを前倒し</strong>しているから。研究では、熟練フェンサーは相手の剣先ではなく<strong>体幹と武器腕の早期の動き</strong>から意図を読んでいることが分かっています。このアプリの先読みドリルと動画のオクルージョンモードは、その予測辞書を作るための機能です。</p>

    <h3>エビデンスの要点</h3>
    <ul>
      <li><strong>フェンシング選手19名の実験(2025)</strong>: 1分のガイド付きイメージ直後に、突きの的中+25.5%、ファント(ランジ)距離+11.1%。経験者ほどファントの距離に効果</li>
      <li><strong>最適な量(メタ分析)</strong>: 1回10〜15分・週3〜4回。30分超は精神的疲労で逆効果になり得る。4週間以上で効果蓄積</li>
      <li><strong>時間遮蔽訓練(メタ分析 2024)</strong>: 「動作の途中で映像を止めて続きを予測する」訓練は予測力を向上させ、実際のプレーに転移する</li>
      <li><strong>PETTLEP原則</strong>: 一人称視点・実速度・実際の会場・感情込みなど、実演技に近いイメージほど効果が高い</li>
      <li><strong>スクリプトの質</strong>: 見えるものだけでなく<strong>身体の反応(心拍・グリップ・脚の張り)</strong>を含み、<strong>自分で作り込んだ</strong>スクリプトほど効果が高い(設定のパーソナライズはこのため)</li>
      <li><strong>イメージ力は伸びる</strong>: 苦手でも「層を1枚ずつ足す」LSRT訓練で鮮明度・コントロール度は向上する(入門ブートキャンプはこの方式)</li>
    </ul>

    <h3>効果的な使い方</h3>
    <ul>
      <li>週3〜4回、寝る前や練習後に10〜15分。<strong>記録タブの連続週数を切らさない</strong>ことを最優先に</li>
      <li>できれば立って構え、剣(または棒)を持って行う</li>
      <li>毎回、実速度で。スローは「作る」ため、実速度は「刻む」ため</li>
      <li>セッション後の鮮明度・コントロール度の自己評価を正直に。数字が伸びていくのがイメージ能力の成長です</li>
      <li>練習・試合の直前に「直前1分」を習慣化する</li>
    </ul>

    <h3>主な出典</h3>
    <ul>
      <li><a href="https://www.mdpi.com/2076-3425/15/12/1338" target="_blank" rel="noopener">Mental Imagery in Fencing (Brain Sciences, 2025)</a></li>
      <li><a href="https://link.springer.com/article/10.1007/s40279-018-0874-8" target="_blank" rel="noopener">Motor Imagery Dose–Response Meta-analysis (Sports Medicine, 2018)</a></li>
      <li><a href="https://link.springer.com/article/10.1007/s40279-024-02073-6" target="_blank" rel="noopener">Temporal Occlusion Training Meta-analysis (Sports Medicine, 2024)</a></li>
      <li><a href="https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1387013/full" target="_blank" rel="noopener">Anticipation in Fencing (Frontiers, 2024)</a></li>
      <li><a href="https://www.mdpi.com/2076-3417/12/19/9753" target="_blank" rel="noopener">PETTLEP Systematic Review (Applied Sciences, 2022)</a></li>
      <li><a href="https://pubmed.ncbi.nlm.nih.gov/23404880/" target="_blank" rel="noopener">Layered Stimulus Response Training (2013)</a></li>
    </ul>
    <p style="font-size:0.78rem;color:var(--text-faint)">※ 本アプリは研究知見に基づくトレーニング補助ツールであり、効果を保証するものではありません。戦術の「正解」は一般論です。所属コーチの指導を優先してください。</p>
    </div>`;
}

// ---------------- 起動 ----------------
document.getElementById('btn-settings').addEventListener('click', () => {
  location.hash = '#settings';
});
window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e));
}
