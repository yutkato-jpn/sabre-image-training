// 動画ライブラリ + オクルージョン(時間遮蔽)先読みトレ + 観察イメトレ
import { store } from './storage.js';
import { tts } from './tts.js';
import { esc, navigate, uid, parseYouTubeId } from './util.js';
import { PRESET_VIDEOS } from './data/videos.js';

function findAnyVideo(id) {
  return store.getVideos().find((v) => v.id === id) || PRESET_VIDEOS.find((v) => v.id === id) || null;
}

let ytReadyPromise = null;
let player = null;
let pollId = null;
let countdownId = null;

export function cleanupVideos() {
  if (pollId) clearInterval(pollId);
  if (countdownId) clearInterval(countdownId);
  pollId = countdownId = null;
  if (player && player.destroy) {
    try { player.destroy(); } catch { /* noop */ }
  }
  player = null;
  tts.stop();
}

function loadYT() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (!ytReadyPromise) {
    ytReadyPromise = new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.onerror = () => reject(new Error('YouTube APIを読み込めませんでした(オフライン?)'));
      window.onYouTubeIframeAPIReady = () => resolve();
      document.head.appendChild(tag);
      setTimeout(() => reject(new Error('YouTube APIの読み込みがタイムアウトしました')), 15000);
    });
  }
  return ytReadyPromise;
}

// ---------------- ライブラリ一覧 ----------------
export function renderVideos(view) {
  const vids = store.getVideos();
  view.innerHTML = `
    <h2>動画で先読みトレ</h2>
    <p class="lead">研究で効果が実証されている<b>時間遮蔽(オクルージョン)訓練</b>: 動作の直前で映像を止め、「次に何が起こるか」を予測してから答え合わせします。上位選手の試合動画を登録して使ってください。</p>
    <a class="btn block" href="#video-edit">+ YouTube動画を登録</a>
    <div style="height:14px"></div>
    ${vids.length ? vids.map((v) => videoCard(v, true)).join('') : `
      <div class="empty" style="padding:16px 12px">自分の動画はまだありません。<br>
        YouTubeで「<b>FIE sabre final</b>」等を検索してURLを登録するか、下の教材プリセットから始めてください。<br>
        <a class="small-link" href="https://www.youtube.com/results?search_query=FIE+sabre+final" target="_blank" rel="noopener">YouTubeで検索 ↗</a>
      </div>`}
    <h3>📚 教材プリセット <span style="font-weight:400;color:var(--text-faint);font-size:0.72rem">アプリの戦術コンテンツの出典動画</span></h3>
    ${PRESET_VIDEOS.map((v) => videoCard(v, false)).join('')}
    <div class="card" style="margin-top:14px">
      <div class="card-title">💡 使い方のコツ</div>
      <div class="card-desc">
        1. 「アレ!」の直後〜トゥッシュ直前の数秒がある動画を選ぶ<br>
        2. <b>停止秒</b>には「両者が動き出した直後、決着の1歩前」の時刻を入れる<br>
        3. 予測は「どちらが取るか」だけでなく「<b>どうやって</b>取るか」まで宣言すると効果的<br>
        4. 相手の<b>体幹と武器腕</b>を見る癖をつける(剣先は最後に動く末端)
      </div>
    </div>`;
}

function videoCard(v, editable) {
  return `
    <div class="card">
      <div class="card-title">${esc(v.title)}</div>
      <div class="card-desc">${esc(v.memo || '')}</div>
      <div class="card-meta">
        ${editable ? `<span>▶ ${v.start || 0}s${v.occlusion ? ` → 停止 ${v.occlusion}s` : ''}${v.end ? ` → ${v.end}s` : ''}</span>` : ''}
        ${v.tags ? `<span>🏷 ${esc(v.tags)}</span>` : ''}
      </div>
      <div class="btn-row">
        ${v.bout || editable ? `<button class="btn small" onclick="location.hash='#video-play/${esc(v.id)}/occlusion'">⚡ 先読みモード</button>` : ''}
        <button class="btn secondary small" onclick="location.hash='#video-play/${esc(v.id)}/observe'">🧠 観察イメトレ</button>
        ${editable ? `<a class="btn ghost small" href="#video-edit/${esc(v.id)}">編集</a>` : `<a class="btn ghost small" href="https://youtu.be/${esc(v.videoId)}" target="_blank" rel="noopener">元動画 ↗</a>`}
      </div>
    </div>`;
}

// ---------------- 登録・編集 ----------------
export function renderVideoEdit(view, id) {
  const existing = id ? store.getVideos().find((v) => v.id === id) : null;
  const v = existing || { title: '', tags: '', memo: '', start: 0, occlusion: '', end: '' };
  view.innerHTML = `
    <h2>${existing ? '動画を編集' : '動画を登録'}</h2>
    <label class="field"><span class="label">YouTube URL ${existing ? '(変更する場合のみ)' : ''}</span>
      <input type="url" id="f-url" placeholder="https://www.youtube.com/watch?v=..." value="${existing ? 'https://www.youtube.com/watch?v=' + esc(v.videoId) : ''}">
    </label>
    <label class="field"><span class="label">タイトル(自分用メモ)</span>
      <input type="text" id="f-title" placeholder="例: 五輪決勝 3本目のボックス" value="${esc(v.title)}">
    </label>
    <label class="field"><span class="label">タグ(任意)</span>
      <input type="text" id="f-tags" placeholder="例: 左利き, ボックス" value="${esc(v.tags)}">
    </label>
    <label class="field"><span class="label">見る区間の開始(秒)</span>
      <input type="number" id="f-start" min="0" value="${v.start ?? 0}">
    </label>
    <label class="field"><span class="label">先読み用の停止秒(決着の1歩前で止める時刻)</span>
      <input type="number" id="f-occ" min="0" value="${v.occlusion ?? ''}" placeholder="例: 開始+3">
    </label>
    <label class="field"><span class="label">区間の終了(秒・答え合わせはここまで再生)</span>
      <input type="number" id="f-end" min="0" value="${v.end ?? ''}" placeholder="未入力なら停止秒+8秒">
    </label>
    <label class="field"><span class="label">観察ポイントのメモ(任意)</span>
      <textarea id="f-memo" placeholder="例: 右選手のマーチの足継ぎに注目">${esc(v.memo)}</textarea>
    </label>
    <div class="btn-row">
      <button class="btn block" id="btn-save">保存</button>
      ${existing ? '<button class="btn danger" id="btn-del">削除</button>' : ''}
    </div>`;

  view.querySelector('#btn-save').addEventListener('click', () => {
    const videoId = parseYouTubeId(view.querySelector('#f-url').value);
    if (!videoId) {
      alert('YouTubeのURLを正しく入力してください');
      return;
    }
    const title = view.querySelector('#f-title').value.trim() || 'サーブル動画';
    const num = (sel) => {
      const raw = view.querySelector(sel).value;
      return raw === '' ? null : Math.max(0, Number(raw));
    };
    store.saveVideo({
      id: existing ? existing.id : uid('v'),
      videoId,
      title,
      tags: view.querySelector('#f-tags').value.trim(),
      memo: view.querySelector('#f-memo').value.trim(),
      start: num('#f-start') ?? 0,
      occlusion: num('#f-occ'),
      end: num('#f-end'),
    });
    navigate('#videos');
  });

  const del = view.querySelector('#btn-del');
  if (del)
    del.addEventListener('click', () => {
      if (confirm('この動画を削除しますか?')) {
        store.deleteVideo(existing.id);
        navigate('#videos');
      }
    });
}

// ---------------- 再生 (先読み / 観察) ----------------
export async function renderVideoPlay(view, id, mode) {
  const v = findAnyVideo(id);
  if (!v) {
    view.innerHTML = '<div class="empty">動画が見つかりません。</div>';
    return;
  }
  const isOcclusion = mode === 'occlusion';
  const start = v.start || 0;
  const occ = v.occlusion ?? start + 3;
  const end = v.end ?? occ + 8;

  view.innerHTML = `
    <h2 style="font-size:1.05rem">${isOcclusion ? '⚡ 先読みモード' : '🧠 観察イメトレ'}</h2>
    <p class="lead">${esc(v.title)}${v.memo ? ' — ' + esc(v.memo) : ''}</p>
    <div class="video-frame-wrap">
      <div id="yt-player"></div>
      <div class="occlusion-cover" id="cover">
        <div class="q">読み込み中…</div>
      </div>
    </div>
    <div id="video-ui"></div>`;

  const cover = view.querySelector('#cover');
  const ui = view.querySelector('#video-ui');

  try {
    await loadYT();
  } catch (e) {
    cover.innerHTML = `<div class="q">動画を読み込めません</div><div class="sub">${esc(e.message)} — 通信環境を確認してください。</div>`;
    return;
  }

  const startedAt = Date.now();
  let rounds = 0;
  let hits = 0;

  const stopPoll = () => { if (pollId) clearInterval(pollId); pollId = null; };
  const playSegment = (from, to, onDone) => {
    stopPoll();
    player.seekTo(from, true);
    player.playVideo();
    pollId = setInterval(() => {
      if (!player || !player.getCurrentTime) return;
      if (player.getCurrentTime() >= to) {
        stopPoll();
        player.pauseVideo();
        onDone();
      }
    }, 200);
  };
  const showCover = (html) => { cover.innerHTML = html; cover.style.display = 'flex'; };
  const hideCover = () => { cover.style.display = 'none'; };

  const finish = () => {
    cleanupVideos();
    const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    if (isOcclusion) {
      store.addLog({ mode: 'video', title: `先読み: ${v.title}`, minutes, score: hits, total: rounds });
    } else {
      store.addLog({ mode: 'video', title: `観察イメトレ: ${v.title}`, minutes });
    }
    navigate('#log');
  };

  // ---- 先読み(オクルージョン)フロー ----
  const occlusionRound = () => {
    hideCover();
    ui.innerHTML = '<p class="lead">▶ 再生中… 相手の体幹と武器腕を見る</p>';
    playSegment(start, occ, () => {
      showCover(`
        <div class="q">この後どうなる?</div>
        <div class="sub">どちらが・どうやって取るかを、口に出して宣言してから答え合わせ。</div>
        <button class="btn" id="btn-reveal">宣言した — 続きを見る</button>`);
      cover.querySelector('#btn-reveal').addEventListener('click', () => {
        hideCover();
        ui.innerHTML = '<p class="lead">▶ 答え合わせ中…</p>';
        playSegment(occ, end, () => {
          rounds++;
          ui.innerHTML = `
            <p class="lead">予測は当たった?</p>
            <div class="btn-row">
              <button class="btn" id="btn-hit">⭕ 当たった</button>
              <button class="btn secondary" id="btn-miss">❌ 外れた</button>
            </div>
            <div class="btn-row">
              <button class="btn ghost" id="btn-again">もう一度この区間</button>
              <button class="btn ghost" id="btn-done">終了して記録</button>
            </div>`;
          const after = (hit) => {
            if (hit) hits++;
            ui.innerHTML = `
              <p class="lead">記録: ${hits}/${rounds} 的中。続けますか?</p>
              <div class="btn-row">
                <button class="btn" id="btn-again2">もう一度</button>
                <button class="btn secondary" id="btn-done2">終了して記録</button>
              </div>`;
            ui.querySelector('#btn-again2').addEventListener('click', occlusionRound);
            ui.querySelector('#btn-done2').addEventListener('click', finish);
          };
          ui.querySelector('#btn-hit').addEventListener('click', () => after(true));
          ui.querySelector('#btn-miss').addEventListener('click', () => after(false));
          ui.querySelector('#btn-again').addEventListener('click', occlusionRound);
          ui.querySelector('#btn-done').addEventListener('click', finish);
        });
      });
    });
  };

  // ---- 観察イメトレフロー ----
  const observeRound = () => {
    hideCover();
    ui.innerHTML = '<p class="lead">▶ 再生中… 身体の使い方・タイミングを観察</p>';
    playSegment(start, end, () => {
      const imgSec = Math.max(15, Math.round(end - start) + 8);
      let remain = imgSec;
      showCover(`
        <div class="q">目を閉じて、今の動きを脳内再生</div>
        <div class="sub">映像を見返すのではなく、<b>自分の身体でやっている感覚</b>(一人称)で再生してください。</div>
        <div class="player-timer imaging" id="obs-timer">${remain}</div>`);
      tts.speak('目を閉じて、今の動きを自分の身体の感覚で再生してください。');
      countdownId = setInterval(() => {
        remain--;
        const t = cover.querySelector('#obs-timer');
        if (t) t.textContent = remain;
        if (remain <= 0) {
          clearInterval(countdownId);
          tts.chime('soft');
          showCover(`
            <div class="q">もう一度見て、自分のイメージと照合</div>
            <button class="btn" id="btn-check">▶ 見比べる</button>`);
          cover.querySelector('#btn-check').addEventListener('click', () => {
            hideCover();
            ui.innerHTML = '<p class="lead">▶ 照合中… イメージとズレていた所はどこ?</p>';
            playSegment(start, end, () => {
              ui.innerHTML = `
                <div class="btn-row">
                  <button class="btn" id="btn-again">もう1セット</button>
                  <button class="btn secondary" id="btn-done">終了して記録</button>
                </div>`;
              ui.querySelector('#btn-again').addEventListener('click', observeRound);
              ui.querySelector('#btn-done').addEventListener('click', finish);
            });
          });
        }
      }, 1000);
    });
  };

  player = new YT.Player('yt-player', {
    videoId: v.videoId,
    playerVars: { rel: 0, playsinline: 1, modestbranding: 1 },
    events: {
      onReady: () => {
        tts.prime();
        showCover(`
          <div class="q">${isOcclusion ? '決着の1歩前で映像が止まります' : '区間を観察 → 目を閉じて脳内再生 → 照合'}</div>
          <button class="btn" id="btn-go">スタート</button>`);
        cover.querySelector('#btn-go').addEventListener('click', isOcclusion ? occlusionRound : observeRound);
      },
      onError: () => {
        showCover('<div class="q">この動画は再生できません</div><div class="sub">埋め込みが許可されていない動画の可能性があります。別の動画を試してください。</div>');
      },
    },
  });
}
