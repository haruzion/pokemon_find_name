# pokemon_find_name（devブランチ＝開発版）

**ポケなぞ！** の開発ブランチです。安定版は `main` ブランチにそのまま残してあります。

## 🎮 あそぶ

- **安定版（main）**: https://haruzion.github.io/pokemon_find_name/
- **開発版（dev）プレビュー**: https://cdn.statically.io/gh/haruzion/pokemon_find_name/dev/index.html
  （CDN経由のため、反映に数分かかることがあります）

## ロードマップ

開発の進め方は [ROADMAP.md](ROADMAP.md) を参照。

## 開発メモ

- 単一HTML（`index.html`）で動作します
- 構成: データ（`PokemonData`）／盤面生成（`BoardFactory`、純粋関数）／保存（`SaveData`）／音（`AudioEngine`）／モード定義（`MODES`）に分離し、`Game` は `Deps` 経由で依存を使う作りです
- ポケモンを追加するときは `PokemonData.NAMES`（伝説は `PokemonData.LEGENDARY`）に名前を足すだけ。条件は「5文字以内・カタカナのみ」
- 追加したら必ず検証を実行してください: `node tests/validate.mjs`
- 安定版への反映は、相談のうえで dev → main のPRで行います
