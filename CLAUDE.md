# pokecard-hands — 作業ルール

## git 操作は必ずユーザーの許可を得る

**ユーザーがそのターンで明示的に指示するまで、git の書き込み操作を実行しない。**

対象: `commit` / `push` / `merge` / `rebase` / `reset` / `revert` / `cherry-pick` /
`checkout` / `switch` / `restore` / `clean` / `tag` / `remote` / `config`、
および `gh pr create` `gh pr merge` `gh release`。

読み取り専用の `status` `log` `diff` `show` `branch --show-current` `rev-parse` は
確認のために自由に使ってよい。

### 守るべき進め方

1. 変更を書く
2. 型チェック・構文チェック・動作確認まで済ませる
3. **何を変更したかを報告し、「コミット・プッシュしてよろしいですか？」と尋ねて止まる**
4. ユーザーが許可したら初めて `git commit` / `git push` を実行する

### 補足

- **過去のターンでの承認は次の変更には引き継がれない。** 変更のたびに許可を取り直す。
- 「〇〇を修正して」という依頼は、コミットの指示を含まない。修正だけして報告する。
- ユーザーが「コミットして」とだけ言った場合、push までは含まない。push も必要か確認する。
  ただし「コミットとプッシュをお願いします」のように両方指示された場合は両方実行してよい。
- 既にコミット・プッシュ済みの内容を重ねて実行しない。まず `git status` と
  `git log` で状態を確認し、済んでいればその旨を伝える。

このルールは [.claude/settings.json](.claude/settings.json) でも強制している
（`permissions.ask` と `PreToolUse` フック）。設定はあくまで安全網で、
第一に守るべきはこのドキュメントの内容。

## このプロジェクトについて

構成・設計方針・API 仕様は [README.md](README.md) を参照。
ホロ効果の実装解説は [docs/holographic-css.md](docs/holographic-css.md) にある。

### 開発時の確認

```bash
npm run dev        # http://localhost:8787
npm run typecheck  # 型チェック
```

- フロントの JS は素の ES モジュール（ビルド無し）。変更後は `node --check` で構文を見る
- 作業が終わったらローカルサーバーを停止する（`lsof -ti:8787 | xargs kill`）
