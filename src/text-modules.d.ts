/**
 * wrangler.jsonc の `rules` で HTML を Text モジュールとして扱う設定を入れているため、
 * `import doc from '../docs/foo.html'` が文字列として解決される。
 * TypeScript にはその型を知る術がないので、ここで宣言しておく。
 */
declare module '*.html' {
  const content: string;
  export default content;
}
