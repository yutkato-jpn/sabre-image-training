// シナリオエディタ (自作・プリセット複製)
import { CATEGORIES, PRESET_SCENARIOS } from './data/scenarios.js';
import { store } from './storage.js';
import { esc, navigate, uid } from './util.js';

const PHASES = ['準備', '環境', 'イメージ', '振り返り'];

// 編集中の一時状態 (画面再描画をまたいで保持)
let draft = null;

export function renderEditor(view, id) {
  if (!draft || draft.__editingId !== (id || 'new')) {
    const existing = id ? store.getCustomScenarios().find((s) => s.id === id) : null;
    draft = existing
      ? JSON.parse(JSON.stringify(existing))
      : {
          id: uid('cs'),
          title: '',
          cat: 'tactic',
          fn: '自作',
          desc: '',
          minutes: 10,
          steps: [
            { phase: '準備', text: '楽な姿勢で目を閉じ、4秒吸って6秒吐く呼吸で肩の力を抜いていきます。', wait: 20 },
            { phase: '環境', text: '', wait: 25 },
            { phase: 'イメージ', text: '', wait: 40 },
            { phase: '振り返り', text: '目を開けてください。鮮明だった場面と薄かった場面を確認しましょう。', wait: 5 },
          ],
        };
    draft.__editingId = id || 'new';
  }
  paint(view, !!id);
}

function paint(view, isEdit) {
  view.innerHTML = `
    <h2>${isEdit ? 'シナリオを編集' : 'シナリオを自作'}</h2>
    <p class="lead">効果を上げるコツ: ①一人称・実速度 ②見えるもの・聞こえるものだけでなく<b>身体の感覚</b>(グリップの握り、脚の張り、心拍)を文に入れる ③実際の対戦相手・会場など自分の現実を使う。</p>
    <label class="field"><span class="label">タイトル</span>
      <input type="text" id="f-title" value="${esc(draft.title)}" placeholder="例: ◯◯選手対策 セカンドインテンション"></label>
    <label class="field"><span class="label">カテゴリ</span>
      <select id="f-cat">${Object.entries(CATEGORIES)
        .filter(([k]) => k !== 'custom')
        .map(([k, v]) => `<option value="${k}" ${draft.cat === k ? 'selected' : ''}>${v.label}</option>`)
        .join('')}</select></label>
    <label class="field"><span class="label">説明(任意)</span>
      <input type="text" id="f-desc" value="${esc(draft.desc)}"></label>

    <h3>ステップ</h3>
    <div id="steps">
      ${draft.steps.map((st, i) => stepRow(st, i)).join('')}
    </div>
    <button class="btn secondary block" id="btn-add-step">+ ステップを追加</button>
    <div class="btn-row">
      <button class="btn block" id="btn-save">保存する</button>
      ${isEdit ? '<button class="btn danger" id="btn-del">削除</button>' : ''}
    </div>
    <hr class="divider">
    <h3>プリセットから複製して作る</h3>
    <p class="lead">プリセットを土台に、自分の言葉に書き換えるのが一番速くて効果的です。</p>
    <div class="chip-row">
      ${PRESET_SCENARIOS.map((s) => `<button class="chip" data-dup="${s.id}">${esc(s.title)}</button>`).join('')}
    </div>`;

  const syncDraft = () => {
    draft.title = view.querySelector('#f-title').value;
    draft.cat = view.querySelector('#f-cat').value;
    draft.desc = view.querySelector('#f-desc').value;
    view.querySelectorAll('[data-step]').forEach((row) => {
      const i = Number(row.dataset.step);
      draft.steps[i].phase = row.querySelector('.st-phase').value;
      draft.steps[i].text = row.querySelector('.st-text').value;
      draft.steps[i].wait = Math.max(0, Number(row.querySelector('.st-wait').value) || 0);
    });
  };

  view.querySelector('#btn-add-step').addEventListener('click', () => {
    syncDraft();
    draft.steps.push({ phase: 'イメージ', text: '', wait: 40 });
    paint(view, isEdit);
  });

  view.querySelectorAll('[data-remove]').forEach((b) =>
    b.addEventListener('click', () => {
      syncDraft();
      draft.steps.splice(Number(b.dataset.remove), 1);
      paint(view, isEdit);
    })
  );
  view.querySelectorAll('[data-up]').forEach((b) =>
    b.addEventListener('click', () => {
      syncDraft();
      const i = Number(b.dataset.up);
      if (i > 0) [draft.steps[i - 1], draft.steps[i]] = [draft.steps[i], draft.steps[i - 1]];
      paint(view, isEdit);
    })
  );

  view.querySelector('#btn-save').addEventListener('click', () => {
    syncDraft();
    if (!draft.title.trim()) { alert('タイトルを入力してください'); return; }
    if (!draft.steps.length || draft.steps.every((s) => !s.text.trim())) { alert('ステップの本文を入力してください'); return; }
    draft.steps = draft.steps.filter((s) => s.text.trim());
    const totalSec = draft.steps.reduce((a, s) => a + (s.wait || 0) + Math.round(s.text.length / 6), 0);
    draft.minutes = Math.max(1, Math.round(totalSec / 60));
    const { __editingId, ...clean } = draft;
    store.saveCustomScenario(clean);
    draft = null;
    navigate('#train');
  });

  const del = view.querySelector('#btn-del');
  if (del)
    del.addEventListener('click', () => {
      if (confirm('このシナリオを削除しますか?')) {
        store.deleteCustomScenario(draft.id);
        draft = null;
        navigate('#train');
      }
    });

  view.querySelectorAll('[data-dup]').forEach((chip) =>
    chip.addEventListener('click', () => {
      const src = PRESET_SCENARIOS.find((s) => s.id === chip.dataset.dup);
      if (!src) return;
      draft = JSON.parse(JSON.stringify(src));
      draft.id = uid('cs');
      draft.title = src.title + '(自分用)';
      draft.__editingId = 'new';
      paint(view, false);
      window.scrollTo(0, 0);
    })
  );
}

function stepRow(st, i) {
  return `
    <div class="card" data-step="${i}">
      <div class="card-meta" style="justify-content:space-between;margin:0 0 8px">
        <span>ステップ ${i + 1}</span>
        <span>
          <a class="small-link" href="javascript:void(0)" data-up="${i}">↑上へ</a>&nbsp;&nbsp;
          <a class="small-link" href="javascript:void(0)" data-remove="${i}" style="color:var(--red)">削除</a>
        </span>
      </div>
      <label class="field"><span class="label">フェーズ</span>
        <select class="st-phase">${PHASES.map((p) => `<option ${st.phase === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
      </label>
      <label class="field"><span class="label">ガイド文(読み上げられます)</span>
        <textarea class="st-text">${esc(st.text)}</textarea>
      </label>
      <label class="field" style="margin-bottom:0"><span class="label">読み上げ後の無音イメージ時間(秒)</span>
        <input type="number" class="st-wait" min="0" value="${st.wait}">
      </label>
    </div>`;
}
