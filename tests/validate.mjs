// ポケなぞ！ データ＆盤面生成の自動検証
// 使い方: node tests/validate.mjs
// index.html のインラインスクリプトを Node 上で読み込み、
// 全ポケモン名の整合性と、全件×複数回の盤面生成が壊れないことを確認する。
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf-8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: script not found'); process.exit(1); }

// ブラウザAPIの最小スタブ
const storageData = {};
const sandbox = {
  console,
  localStorage: {
    getItem: (k) => (k in storageData ? storageData[k] : null),
    setItem: (k, v) => { storageData[k] = String(v); },
    removeItem: (k) => { delete storageData[k]; },
  },
  document: {
    addEventListener: () => {},
    getElementById: () => ({ innerText: '', style: {}, classList: { add() {}, remove() {}, toggle() {} } }),
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add() {} } }),
  },
  window: {},
  setInterval: () => 0,
  clearInterval: () => {},
  setTimeout: () => 0,
  clearTimeout: () => {},
};
sandbox.window.localStorage = sandbox.localStorage;
vm.createContext(sandbox);
vm.runInContext(m[1], sandbox);
const get = (expr) => vm.runInContext(expr, sandbox);

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
};

// ===== データ検証 =====
const list = get('POKEMON_LIST');
const names = get('PokemonData.NAMES');
const legendary = get('PokemonData.LEGENDARY');
check('収録数 300以上', list.length >= 300, `POKEMON_LIST=${list.length} (NAMES=${names.length}, LEGENDARY=${legendary.length})`);
check('重複なし', new Set(list).size === list.length);
check('全件カタカナのみ', list.every(n => /^[ァ-ヶー]+$/.test(n)),
  list.filter(n => !/^[ァ-ヶー]+$/.test(n)).slice(0, 5).join(','));
check('全件5文字以内', list.every(n => n.length <= 5),
  list.filter(n => n.length > 5).slice(0, 5).join(','));
check('元データにも5文字超・非カタカナなし', names.every(n => n.length <= 5 && /^[ァ-ヶー]+$/.test(n)),
  names.filter(n => n.length > 5 || !/^[ァ-ヶー]+$/.test(n)).slice(0, 8).join(','));
check('伝説は全て収録対象', legendary.every(n => list.includes(n)));

// ===== 盤面生成: 全件 × 30回 =====
get(`__rngState = 42`);
const rngSetup = `
  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
  __testRandom = mulberry32(1234);
`;
vm.runInContext(rngSetup, sandbox);
const boardTest = get(`(() => {
  let bad = [];
  for (const w of POKEMON_LIST) {
    for (let t = 0; t < 30; t++) {
      const { board, targetIndices } = BoardFactory.generate(w, 5, CHARS, __testRandom);
      if (board.length !== 25 || board.some(c => !c)) { bad.push(w + ':board'); break; }
      if (targetIndices.map(i => board[i]).join('') !== w) { bad.push(w + ':spell'); break; }
      if (new Set(targetIndices).size !== targetIndices.length) { bad.push(w + ':dup'); break; }
      const rows = targetIndices.map(i => Math.floor(i / 5)), cols = targetIndices.map(i => i % 5);
      const straight = rows.every(r => r === rows[0]) || cols.every(c => c === cols[0]);
      if (!straight) { bad.push(w + ':line'); break; }
    }
  }
  return bad;
})()`);
check('盤面生成 全件×30回', boardTest.length === 0, boardTest.slice(0, 5).join(','));

// ===== 保存の往復 =====
const saveTest = get(`(() => {
  state.pokedex = new Set(['ピカチュウ', 'ミュウ']);
  SaveData.saveBest(300);
  SaveData.saveMuted(true);
  SaveData.save();
  state.pokedex = new Set();
  SaveData.data.best = 0;
  SaveData.load();
  return {
    dex: Array.from(state.pokedex).sort().join(','),
    best: SaveData.data.best,
    muted: AudioEngine.isMuted,
  };
})()`);
check('保存の往復（ずかん・ベスト・ミュート）',
  saveTest.dex === 'ピカチュウ,ミュウ' && saveTest.best === 300 && saveTest.muted === true,
  JSON.stringify(saveTest));

console.log(failures ? `\n${failures}件 失敗` : '\n全て合格');
process.exit(failures ? 1 : 0);
