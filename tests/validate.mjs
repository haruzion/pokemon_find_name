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

// ===== モード定義（Phase 1） =====
const modes = get('MODES');
check('モード定義 4種', ['easy', 'normal', 'hard', 'relax'].every(k => !!modes[k]),
  Object.keys(modes).join(','));
check('モード項目がそろっている', Object.values(modes).every(md =>
  md.label && 'timeLimit' in md && typeof md.bonus === 'number' &&
  typeof md.legendBonus === 'number' && Array.isArray(md.hintDelays) &&
  md.hintDelays.length === 3 && typeof md.scoreMul === 'number' && md.desc));
check('のんびりは時間無制限', modes.relax.timeLimit === Infinity);
check('むずかしいはスコア2倍', modes.hard.scoreMul === 2);

// ===== 保存の往復（モード別ベスト） =====
const saveTest = get(`(() => {
  state.pokedex = new Set(['ピカチュウ', 'ミュウ']);
  state.mode = 'normal'; state.settings = MODES.normal;
  SaveData.saveBest(300);
  SaveData.saveMuted(true);
  SaveData.saveMode('hard');
  SaveData.save();
  state.pokedex = new Set();
  SaveData.data.bests = {};
  SaveData.load();
  return {
    dex: Array.from(state.pokedex).sort().join(','),
    bestNormal: SaveData.bestFor('normal'),
    muted: AudioEngine.isMuted,
    mode: state.mode,
  };
})()`);
check('保存の往復（ずかん・モード別ベスト・ミュート・モード）',
  saveTest.dex === 'ピカチュウ,ミュウ' && saveTest.bestNormal === 300 &&
  saveTest.muted === true && saveTest.mode === 'hard',
  JSON.stringify(saveTest));

// ===== モード別ベストの分離 =====
const sepTest = get(`(() => {
  state.mode = 'easy'; SaveData.saveBest(111);
  state.mode = 'hard'; SaveData.saveBest(50);
  return {
    easy: SaveData.bestFor('easy'),
    normal: SaveData.bestFor('normal'),
    hard: SaveData.bestFor('hard'),
    relax: SaveData.bestFor('relax'),
  };
})()`);
check('ベストはモードごとに別々に残る',
  sepTest.easy === 111 && sepTest.normal === 300 && sepTest.hard === 50 && sepTest.relax === 0,
  JSON.stringify(sepTest));

// ===== 旧形式セーブ（best単体）からの移行 =====
const migTest = get(`(() => {
  localStorage.setItem(SaveData.KEY, JSON.stringify({ pokedex: ['ミュウ'], best: 250, muted: false }));
  SaveData.data = { pokedex: [], best: 0, bests: {}, muted: false, mode: 'normal' };
  state.pokedex = new Set();
  SaveData.load();
  return {
    bestNormal: SaveData.bestFor('normal'),
    mode: state.mode,
    dex: Array.from(state.pokedex).join(','),
  };
})()`);
check('旧セーブのベストはふつうのベストへ移行',
  migTest.bestNormal === 250 && migTest.mode === 'normal' && migTest.dex === 'ミュウ',
  JSON.stringify(migTest));

// ===== 地方データ（Phase 2） =====
const regions = get('PokemonData.REGIONS');
const regionOrder = get('REGION_ORDER');
const regionOf = get('REGION_OF');
const allRegionNames = regionOrder.flatMap(r => regions[r] || []);
check('地方は10グループ', regionOrder.length === 10, regionOrder.join(','));
check('地方の合計が全収録数と一致', allRegionNames.length === list.length,
  `regions=${allRegionNames.length} list=${list.length}`);
check('地方に重複なし・漏れなし',
  new Set(allRegionNames).size === allRegionNames.length &&
  list.every(n => allRegionNames.includes(n)));
const expectedCounts = { 'カントー': 118, 'ジョウト': 80, 'ホウエン': 120, 'シンオウ': 97, 'イッシュ': 152, 'カロス': 66, 'アローラ': 71, 'ガラル': 53, 'パルデア': 35, 'そのほか': 3 };
check('地方別の件数', regionOrder.every(r => (regions[r] || []).length === expectedCounts[r]),
  regionOrder.map(r => `${r}:${(regions[r] || []).length}`).join(' '));
check('カプ系はアローラ', ['カプコケコ', 'カプテテフ', 'カプブルル', 'カプレヒレ'].every(n => regionOf[n] === 'アローラ'));
check('そのほかは由来不明の3匹だけ',
  JSON.stringify(regions['そのほか']) === JSON.stringify(['モコココ', 'パイン', 'ドランチ']),
  (regions['そのほか'] || []).join(','));
check('REGION_OFが全件をカバー', list.every(n => regionOf[n]));

// ===== バッジ（Phase 2） =====
const badges = get('BADGES');
check('バッジ定義10種', badges.length === 10 && new Set(badges.map(b => b.id)).size === 10,
  badges.map(b => b.id).join(','));
check('バッジに判定関数がある', badges.every(b => typeof b.test === 'function' && b.name && b.desc));
const badgeFlow = get(`(() => {
  SaveData.data = { pokedex: [], best: 0, bests: {}, muted: false, mode: 'normal', badges: [], plays: 0 };
  state.pokedex = new Set(POKEMON_LIST.slice(0, 10)); // 先頭10匹は全て伝説
  const first = SaveData.awardBadges().map(b => b.id);
  SaveData.addPlay();
  const second = SaveData.awardBadges().map(b => b.id);
  const third = SaveData.awardBadges().map(b => b.id);
  return { first, second, third, plays: SaveData.data.plays };
})()`);
check('バッジ獲得フロー（伝説10匹→3種、初プレイ→1種、再判定→0種）',
  badgeFlow.first.includes('dex-10') && badgeFlow.first.includes('first-legend') &&
  badgeFlow.first.includes('legend-10') && badgeFlow.first.length === 3 &&
  JSON.stringify(badgeFlow.second) === JSON.stringify(['first-play']) &&
  badgeFlow.third.length === 0 && badgeFlow.plays === 1,
  JSON.stringify(badgeFlow));

console.log(failures ? `\n${failures}件 失敗` : '\n全て合格');
process.exit(failures ? 1 : 0);
