// 日本語TTS + チャイム。speechSynthesis 不可の環境ではチャイムのみにフォールバック。
// iOS Safari では発話がユーザー操作起点である必要があるため、
// セッション開始ボタンのハンドラ内から speak/prime を呼ぶこと。
import { store } from './storage.js';

let audioCtx = null;
let jaVoice = null;

export const tts = {
  get available() {
    return 'speechSynthesis' in window;
  },

  // ユーザー操作起点で一度呼ぶと、以降の発話・チャイムがモバイルでも許可される
  prime() {
    if (this.available) {
      // 空発話で発話キューをアンロックする (iOS対策)
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      speechSynthesis.speak(u);
    }
    this.getCtx();
  },

  getCtx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  },

  pickVoice() {
    if (!this.available) return null;
    if (jaVoice) return jaVoice;
    const voices = speechSynthesis.getVoices();
    jaVoice =
      voices.find((v) => v.lang === 'ja-JP' && v.localService) ||
      voices.find((v) => v.lang === 'ja-JP') ||
      voices.find((v) => v.lang.startsWith('ja')) ||
      null;
    return jaVoice;
  },

  // 読み上げる。完了(またはTTS不可)で resolve する Promise を返す。
  speak(text) {
    const settings = store.getSettings();
    if (!this.available || !settings.ttsEnabled || !text) {
      return Promise.resolve({ spoken: false });
    }
    return new Promise((resolve) => {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = this.pickVoice();
      if (v) u.voice = v;
      u.lang = 'ja-JP';
      u.rate = settings.ttsRate || 1.0;
      u.onend = () => resolve({ spoken: true });
      u.onerror = () => resolve({ spoken: false });
      speechSynthesis.speak(u);
      // 一部ブラウザで onend が発火しない場合の保険
      const estMs = Math.max(2000, text.length * 220 / (settings.ttsRate || 1));
      setTimeout(() => resolve({ spoken: true }), estMs + 4000);
    });
  },

  stop() {
    if (this.available) speechSynthesis.cancel();
  },

  // 柔らかいチャイム音 (イメージ時間の終了合図)
  chime(kind = 'soft') {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = kind === 'end' ? [523.25, 659.25, 783.99] : [659.25, 783.99];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      const t = now + i * 0.18;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1);
    });
  },
};

if ('speechSynthesis' in window) {
  // 声リストは非同期ロードされるため先読みしておく
  speechSynthesis.onvoiceschanged = () => tts.pickVoice();
}
