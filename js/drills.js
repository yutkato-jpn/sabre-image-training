// 予測(先読み)ドリル
import { PRESET_DRILLS, DRILL_CATEGORIES, BASIS_TYPES } from './data/drills.js';
import { store } from './storage.js';
import { esc, navigate, uid } from './util.js';

function allDrills() {
  return [...PRESET_DRILLS, ...store.getCustomDrills()];
}

// ---------------- 設定画面 ----------------
export function renderDrills(view) {
  const cats = Object.keys(DRILL_CATEGORIES);
  const customCount = store.getCustomDrills().length;
  view.innerHTML = `
    <h2>予測(先読み)ドリル</h2>
    <p class="lead">「相手がこう動いたら次は何が来るか」のパターン辞書を作るクイズです。0.2秒の反応限界は、反射ではなく<b>予測</b>で超えます。</p>
    <div class="notice">⚠ 戦術判断には流派・スタイルによる差があります。各問題の解説には根拠の種別(📖競技規則 / 🔬研究 / 🎓コーチング文献 / 🎥動画 / 💭一般セオリー)を表示します。🎥は出典動画に直接飛べます。所属コーチの指導と異なる場合はコーチを優先してください。</div>
    <h3>出題カテゴリ</h3>
    <div class="chip-row" id="cat-chips">
      ${cats.map((c) => `<button class="chip on" data-cat="${c}">${DRILL_CATEGORIES[c]}</button>`).join('')}
    </div>
    <h3>出題数</h3>
    <div class="chip-row" id="count-chips">
      <button class="chip" data-n="5">5問</button>
      <button class="chip on" data-n="10">10問</button>
      <button class="chip" data-n="0">全問</button>
    </div>
    <button class="btn block" id="btn-start">ドリル開始</button>
    <hr class="divider">
    <div class="card-meta" style="justify-content:space-between">
      <span>自作問題: ${customCount}問</span>
      <a class="small-link" href="#drill-editor">+ 問題を自作する</a>
    </div>`;

  view.querySelectorAll('#cat-chips .chip').forEach((chip) =>
    chip.addEventListener('click', () => chip.classList.toggle('on'))
  );
  view.querySelectorAll('#count-chips .chip').forEach((chip) =>
    chip.addEventListener('click', () => {
      view.querySelectorAll('#count-chips .chip').forEach((c) => c.classList.remove('on'));
      chip.classList.add('on');
    })
  );

  view.querySelector('#btn-start').addEventListener('click', () => {
    const selectedCats = [...view.querySelectorAll('#cat-chips .chip.on')].map((c) => c.dataset.cat);
    const n = Number(view.querySelector('#count-chips .chip.on').dataset.n);
    let pool = allDrills().filter((d) => selectedCats.includes(d.cat));
    if (!pool.length) {
      alert('カテゴリを1つ以上選んでください');
      return;
    }
    pool = shuffle(pool);
    if (n > 0) pool = pool.slice(0, n);
    runQuiz(view, pool);
  });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------- 出題ループ ----------------
function runQuiz(view, questions) {
  const startedAt = Date.now();
  const queue = [...questions];
  const total = questions.length;
  let firstTryCorrect = 0;
  let answeredFirst = new Set();
  let index = 0;

  const next = () => {
    if (!queue.length) {
      finish();
      return;
    }
    index++;
    const q = queue.shift();
    showQuestion(q);
  };

  const showQuestion = (q) => {
    // 表示順をシャッフルしつつ正解位置を追跡
    const order = shuffle(q.opts.map((_, i) => i));
    view.innerHTML = `
      <div class="player-phase">${esc(DRILL_CATEGORIES[q.cat] || 'ドリル')} ・ 残り${queue.length + 1}問</div>
      <div class="drill-q">${esc(q.q)}</div>
      <div class="drill-opts">
        ${order.map((oi) => `<button class="drill-opt" data-oi="${oi}">${esc(q.opts[oi])}</button>`).join('')}
      </div>
      <div id="explain-box"></div>`;

    view.querySelectorAll('.drill-opt').forEach((btn) => {
      btn.addEventListener('click', () => {
        const chosen = Number(btn.dataset.oi);
        const correct = chosen === q.answer;
        view.querySelectorAll('.drill-opt').forEach((b) => {
          b.disabled = true;
          const oi = Number(b.dataset.oi);
          if (oi === q.answer) b.classList.add('correct');
          else if (oi === chosen) b.classList.add('wrong');
        });
        if (!answeredFirst.has(q.id)) {
          answeredFirst.add(q.id);
          if (correct) firstTryCorrect++;
        }
        if (!correct) queue.push(q); // 間違いは後で再出題
        const b = q.basis && BASIS_TYPES[q.basis.type];
        const basisHtml = b
          ? `<div class="drill-basis">根拠: ${b.icon} ${b.label}${q.basis.note ? ` — ${esc(q.basis.note)}` : ''}${
              q.basis.link ? ` <a href="${esc(q.basis.link)}" target="_blank" rel="noopener">出典を見る ↗</a>` : ''
            }</div>`
          : '';
        view.querySelector('#explain-box').innerHTML = `
          <div class="drill-explain"><b>${correct ? '⭕ 正解' : '❌ 不正解' + (queue.length ? '(あとでもう一度出ます)' : '')}</b>\n${esc(q.explain)}${basisHtml}</div>
          <button class="btn block" id="btn-next" style="margin-top:14px">${queue.length ? '次の問題 ›' : '結果を見る'}</button>`;
        view.querySelector('#btn-next').addEventListener('click', next);
        view.querySelector('#btn-next').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });
  };

  const finish = () => {
    const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    store.addLog({ mode: 'drill', title: '予測ドリル', minutes, score: firstTryCorrect, total });
    const pct = Math.round((firstTryCorrect / total) * 100);
    view.innerHTML = `
      <div class="drill-score">
        <div class="big">${firstTryCorrect} / ${total}</div>
        <p class="lead">初回正答率 ${pct}%</p>
        <p class="lead">間違えた場面は、次にピストで同じ前兆を見たときに思い出せるかが勝負です。</p>
      </div>
      <div class="btn-row">
        <button class="btn secondary" id="btn-again">もう一度</button>
        <a class="btn" href="#log">記録を見る</a>
      </div>`;
    view.querySelector('#btn-again').addEventListener('click', () => renderDrills(view));
  };

  next();
}

// ---------------- 問題の自作 ----------------
export function renderDrillEditor(view) {
  const customs = store.getCustomDrills();
  view.innerHTML = `
    <h2>問題を自作する</h2>
    <p class="lead">試合で実際にやられたパターン、コーチに言われた読み筋を問題にしておくと、自分専用の予測辞書になります。</p>
    <label class="field"><span class="label">カテゴリ</span>
      <select id="f-cat">${Object.entries(DRILL_CATEGORIES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
    </label>
    <label class="field"><span class="label">場面(問題文)</span>
      <textarea id="f-q" placeholder="例: 相手が◯◯した。次に来る展開は?"></textarea>
    </label>
    <label class="field"><span class="label">選択肢1(これを正解にする)</span><input type="text" id="f-o1"></label>
    <label class="field"><span class="label">選択肢2</span><input type="text" id="f-o2"></label>
    <label class="field"><span class="label">選択肢3(任意)</span><input type="text" id="f-o3"></label>
    <label class="field"><span class="label">解説</span><textarea id="f-ex" placeholder="なぜそれが正解か。前兆の読み方"></textarea></label>
    <button class="btn block" id="btn-save">保存する</button>
    ${customs.length ? `<h3>自作した問題</h3>${customs
      .map(
        (d) => `<div class="card"><div class="card-desc">${esc(d.q)}</div>
          <div class="card-meta"><span>${DRILL_CATEGORIES[d.cat] || ''}</span>
          <a class="small-link" href="#" data-del="${d.id}">削除</a></div></div>`
      )
      .join('')}` : ''}`;

  view.querySelector('#btn-save').addEventListener('click', () => {
    const q = view.querySelector('#f-q').value.trim();
    const o1 = view.querySelector('#f-o1').value.trim();
    const o2 = view.querySelector('#f-o2').value.trim();
    const o3 = view.querySelector('#f-o3').value.trim();
    const ex = view.querySelector('#f-ex').value.trim();
    if (!q || !o1 || !o2) {
      alert('問題文と選択肢1・2は必須です');
      return;
    }
    const opts = [o1, o2];
    if (o3) opts.push(o3);
    store.saveCustomDrill({
      id: uid('cd'),
      cat: view.querySelector('#f-cat').value,
      q,
      opts,
      answer: 0, // 選択肢1が正解 (表示時にシャッフルされる)
      explain: ex || '(解説なし)',
    });
    renderDrillEditor(view);
  });

  view.querySelectorAll('[data-del]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm('この問題を削除しますか?')) {
        store.deleteCustomDrill(a.dataset.del);
        renderDrillEditor(view);
      }
    })
  );
}
