// localStorage ラッパ。全データは "sit." プレフィクスで保存する。
const PREFIX = 'sit.';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.warn('storage write failed', e);
  }
}

export const store = {
  // トレーニングログ: {id, ts, mode, title, minutes, vividness?, control?, score?, total?, note?}
  getLogs: () => read('logs', []),
  addLog(entry) {
    const logs = read('logs', []);
    logs.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), ts: Date.now(), ...entry });
    write('logs', logs);
  },
  deleteLog(id) {
    write('logs', read('logs', []).filter((l) => l.id !== id));
  },

  // 自作シナリオ
  getCustomScenarios: () => read('scenarios', []),
  saveCustomScenario(sc) {
    const list = read('scenarios', []);
    const i = list.findIndex((s) => s.id === sc.id);
    if (i >= 0) list[i] = sc;
    else list.push(sc);
    write('scenarios', list);
  },
  deleteCustomScenario(id) {
    write('scenarios', read('scenarios', []).filter((s) => s.id !== id));
  },

  // 動画ライブラリ: {id, videoId, title, tags, memo, start, end, occlusion}
  getVideos: () => read('videos', []),
  saveVideo(v) {
    const list = read('videos', []);
    const i = list.findIndex((x) => x.id === v.id);
    if (i >= 0) list[i] = v;
    else list.push(v);
    write('videos', list);
  },
  deleteVideo(id) {
    write('videos', read('videos', []).filter((v) => v.id !== id));
  },

  // 自作ドリル問題
  getCustomDrills: () => read('drills', []),
  saveCustomDrill(d) {
    const list = read('drills', []);
    const i = list.findIndex((x) => x.id === d.id);
    if (i >= 0) list[i] = d;
    else list.push(d);
    write('drills', list);
  },
  deleteCustomDrill(id) {
    write('drills', read('drills', []).filter((d) => d.id !== id));
  },

  // パーソナライズ (スクリプト差し込み用)
  getProfile: () =>
    read('profile', {
      weapon: '',      // 例: 自分の剣・グリップの特徴
      homeGym: '',     // ホームの練習場
      venue: '',       // よく出る会場
      bestMove: '',    // 得意技
      selfTalk: '',    // セルフトーク
    }),
  saveProfile: (p) => write('profile', p),

  // 設定
  getSettings: () => read('settings', { ttsEnabled: true, ttsRate: 1.0, weeklyGoal: 3 }),
  saveSettings: (s) => write('settings', s),

  // バックアップ
  exportAll() {
    return JSON.stringify(
      {
        app: 'sabre-mind',
        version: 1,
        exportedAt: new Date().toISOString(),
        logs: read('logs', []),
        scenarios: read('scenarios', []),
        videos: read('videos', []),
        drills: read('drills', []),
        profile: this.getProfile(),
        settings: this.getSettings(),
      },
      null,
      2
    );
  },
  importAll(json) {
    const data = JSON.parse(json);
    if (data.app !== 'sabre-mind') throw new Error('このアプリのバックアップファイルではありません');
    if (Array.isArray(data.logs)) write('logs', data.logs);
    if (Array.isArray(data.scenarios)) write('scenarios', data.scenarios);
    if (Array.isArray(data.videos)) write('videos', data.videos);
    if (Array.isArray(data.drills)) write('drills', data.drills);
    if (data.profile) write('profile', data.profile);
    if (data.settings) write('settings', data.settings);
  },
};
