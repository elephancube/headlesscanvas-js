# サンプルアプリ

[デモ](/ja/demos)が機能をひとつずつ取り上げるのに対して、こちらは小さいながらも完結したアプリケーションです。部品どうしが噛み合う必要があるのはこちらで、「ライブラリが対応している」と「実際に出せる」の差が出るのもこちらです。

各ページでライブラリのソースを直接実行しており、その下に全ソースを掲載しています。どれも数百行程度で、いちばん長いのはたいていツールバーです。

<div class="hc-gallery">
  <a class="hc-gallery-card" href="./sketchpad">
    <svg viewBox="0 0 120 60" aria-hidden="true">
      <path d="M8 42 C 24 8, 40 8, 52 34 S 78 56, 92 20" fill="none" stroke="#2563eb" stroke-width="5" stroke-linecap="round" />
      <path d="M84 46 l10 -12 8 8 -10 12 z" fill="none" stroke="#f59e0b" stroke-width="4" stroke-linejoin="round" />
    </svg>
    <strong>お絵描き</strong>
    <span>フリーハンドで描いて、PNG と SVG で書き出し、共有シートに渡します。</span>
  </a>
  <a class="hc-gallery-card" href="./graph-paper">
    <svg viewBox="0 0 120 60" aria-hidden="true">
      <g fill="#cbd5e1">
        <circle cx="20" cy="14" r="2" /><circle cx="45" cy="14" r="2" /><circle cx="70" cy="14" r="2" /><circle cx="95" cy="14" r="2" />
        <circle cx="20" cy="32" r="2" /><circle cx="45" cy="32" r="2" /><circle cx="70" cy="32" r="2" /><circle cx="95" cy="32" r="2" />
        <circle cx="20" cy="50" r="2" /><circle cx="45" cy="50" r="2" /><circle cx="70" cy="50" r="2" /><circle cx="95" cy="50" r="2" />
      </g>
      <path d="M20 50 L45 14 L70 32 L95 32" fill="none" stroke="#1d4ed8" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
      <circle cx="45" cy="14" r="4.5" fill="#fff" stroke="#2563eb" stroke-width="2.5" />
    </svg>
    <strong>方眼紙作図</strong>
    <span>格子の点から点へ線を引きます。頂点を動かすと、そこに集まる線がすべて追従します。元に戻すのは1回です。</span>
  </a>
  <a class="hc-gallery-card" href="./pixel-art">
    <svg viewBox="0 0 120 60" aria-hidden="true">
      <rect x="24" y="6" width="72" height="48" fill="#fff" stroke="#e2e8f0" />
      <g fill="#22c55e">
        <rect x="36" y="6" width="12" height="12" /><rect x="72" y="6" width="12" height="12" />
        <rect x="36" y="18" width="12" height="12" /><rect x="48" y="18" width="12" height="12" />
        <rect x="60" y="18" width="12" height="12" /><rect x="72" y="18" width="12" height="12" />
        <rect x="24" y="30" width="12" height="12" /><rect x="36" y="30" width="12" height="12" />
        <rect x="72" y="30" width="12" height="12" /><rect x="84" y="30" width="12" height="12" />
        <rect x="24" y="42" width="12" height="12" /><rect x="48" y="42" width="12" height="12" />
        <rect x="60" y="42" width="12" height="12" /><rect x="84" y="42" width="12" height="12" />
      </g>
    </svg>
    <strong>ドット絵</strong>
    <span>32×32 の盤面。1マスが1シェイプなので、元に戻すも消しゴムも書き出しも最初から動いています。</span>
  </a>
  <a class="hc-gallery-card" href="./tangram">
    <svg viewBox="0 0 120 60" aria-hidden="true">
      <g stroke="#fff" stroke-width="1.2">
        <path d="M32,2 L88,2 L60,30 Z" fill="#ef4444" />
        <path d="M32,2 L60,30 L32,58 Z" fill="#3b82f6" />
        <path d="M88,30 L88,58 L60,58 Z" fill="#22c55e" />
        <path d="M88,2 L88,30 L74,16 Z" fill="#f59e0b" />
        <path d="M74,16 L88,30 L74,44 L60,30 Z" fill="#14b8a6" />
        <path d="M60,30 L74,44 L46,44 Z" fill="#a855f7" />
        <path d="M32,58 L60,58 L74,44 L46,44 Z" fill="#ec4899" />
      </g>
    </svg>
    <strong>タングラム</strong>
    <span>7つのピースと1つのシルエット。そして「できてはいけない操作」を到達不能にするツール。</span>
  </a>
  <a class="hc-gallery-card" href="./amidakuji">
    <svg viewBox="0 0 120 60" aria-hidden="true">
      <g stroke="#334155" stroke-width="2" stroke-linecap="round">
        <path d="M20 8 V52" /><path d="M45 8 V52" /><path d="M70 8 V52" /><path d="M95 8 V52" />
      </g>
      <g stroke="#0f766e" stroke-width="2.5" stroke-linecap="round">
        <path d="M20 20 H45" /><path d="M70 28 H95" /><path d="M45 38 H70" />
      </g>
      <path d="M20 8 V20 H45 V38 H70 V52" fill="none" stroke="#e11d48" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="70" cy="52" r="4" fill="#e11d48" stroke="#fff" stroke-width="1.5" />
    </svg>
    <strong>あみだくじ</strong>
    <span>はしごを玉が転がります。はしごは絵で、玉は絵ではありません。</span>
  </a>
  <a class="hc-gallery-card" href="./polaroid">
    <svg viewBox="0 0 120 60" aria-hidden="true">
      <g stroke="#e2e8f0">
        <g transform="rotate(-7 30 30)">
          <rect x="14" y="10" width="32" height="40" fill="#fff" />
          <rect x="17" y="13" width="26" height="26" fill="#fb923c" stroke="none" />
        </g>
        <g transform="rotate(4 60 30)">
          <rect x="44" y="8" width="32" height="40" fill="#fff" />
          <rect x="47" y="11" width="26" height="26" fill="#2dd4bf" stroke="none" />
        </g>
        <g transform="rotate(-3 92 32)">
          <rect x="74" y="12" width="32" height="40" fill="#fff" />
          <rect x="77" y="15" width="26" height="26" fill="#a3e635" stroke="none" />
        </g>
      </g>
    </svg>
    <strong>写真コラージュ</strong>
    <span>写真を落とすと傾いたプリントになります。写真ごと1ファイルで保存できます。</span>
  </a>
</div>

## 見どころ

| | ソースを読む価値がある部分 |
|---|---|
| [お絵描き](./sketchpad) | ストロークはただの `path` シェイプ。だからアプリ側に「描画のためのコード」がほとんどありません。 |
| [方眼紙作図](./graph-paper) | 頂点を1つ動かすと、そこに触れている線が全部書き換わります。それでも履歴は1件です。 |
| [ドット絵](./pixel-art) | 書き込みを1つも遅らせずに、ドラッグ全体を Undo 1回にしています。 |
| [タングラム](./tangram) | ピースを動かしたのと同じ確定の中で、吸い付きまで済ませています。 |
| [あみだくじ](./amidakuji) | 毎秒60フレームのアニメーション。そのどれも文書に触れていません。 |
| [写真コラージュ](./polaroid) | 写真はシェイプの「横」に保存されます。上書きではありません。 |

6つとも素の TypeScript モジュールです。フレームワークも専用のビルド手順もありません。同じコードが React でも Vue でも、何もなくても動きます。
