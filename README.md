# 間取りレイアウト

マンションの間取り図画像に、実寸サイズの家具を置いてレイアウトを検討する Web アプリ。
HTML / CSS / JavaScript のみ（ビルド不要）、描画は [Konva.js](https://konvajs.org/)（CDN）。

## 使い方

1. **画像を選ぶ** … 写真ライブラリ・カメラ・ファイルから間取り図を選ぶ（長辺3000pxに自動縮小）
2. **縮尺** … 横→縦の順に、長さが分かっている区間の両端を2点タップ → 実寸(mm)を入力
   - ピンチで拡大して置くと正確。端点はドラッグで微調整でき、ドラッグ中は左上/右上にルーペが出る
   - 横は水平・縦は垂直に自動でそろう
   - 縦横の縮尺が3%以上ずれたら警告（やり直す／平均値で使う）
3. **＋家具** … プリセットから選ぶか、名前・幅・奥行(mm)・色を入力
4. **家具の操作**
   - 家具の上を1本指ドラッグ … 移動 ／ 何もない所をドラッグ … 画面の移動
   - 2本指ピンチ … 拡大縮小
   - 家具をタップで選択 → 下のボタンで 90°回転・複製・編集・削除
5. **グリッド** … 1mグリッドの表示ON/OFF（縮尺を測った端点が原点）
6. **メニュー** … PNG保存・JSONバックアップの書き出し/読み込み・画像差し替え・全消去

## 保存について

- 画像・縮尺・家具配置は変更のたびにブラウザ内（IndexedDB）へ自動保存され、次に開いたとき復元される
- **Safari は、しばらく開かないサイトのデータを消すことがある**（約7日）。
  - 大事なレイアウトは「メニュー → バックアップ(JSON)を書き出す」で「ファイル」アプリに保存しておく
  - 共有ボタン →「ホーム画面に追加」してアプリとして使うと消されにくい
- iPhone/iPad での PNG/JSON 保存は共有メニューが開く。PNG は「画像を保存」で写真へ、JSON は「"ファイル"に保存」

## PC で動かす

公開版は https://sogaryo0411-droid.github.io/madori/ 。手元で動かすときは、ES モジュールを使っているので `index.html` のダブルクリック（file://）では動かない。このリポジトリのフォルダで簡易サーバーを立てる。

```sh
python -m http.server 8000     # Mac は python3
```

ブラウザで http://localhost:8000 を開く。PC ではドラッグでパン、ホイールで拡大縮小。

## iPhone 実機で確認する

1. PC で上の簡易サーバーを起動したままにする
2. PC の IP アドレスを調べる
   - Windows: コマンドプロンプトで `ipconfig` →「IPv4 アドレス」（例 192.168.1.23）
   - Mac: システム設定 → Wi-Fi → 接続中のネットワークの「詳細」→ IP アドレス
3. iPhone を PC と **同じ Wi-Fi** につなぎ、Safari で `http://<PCのIP>:8000` を開く
   - 開けないとき（Windows）: 初回に出る「Windows セキュリティの重要な警告」で Python の通信を「プライベート ネットワーク」で許可する
4. エラーが出たら画面下に赤いトーストで表示される
5. Mac があれば詳しいデバッグも可能: iPhone の「設定 → アプリ → Safari → 詳細 → Web インスペクタ」を ON → ケーブルで Mac に接続 → Mac の Safari「開発」メニューから iPhone のページを選ぶとコンソールが見られる

※ http（LAN）だと iPhone の共有メニューが使えずダウンロード保存になることがある。本番の GitHub Pages（https）では共有メニューで保存できる。

## GitHub Pages の設定

Settings → Pages → Source を「Deploy from a branch」、Branch を `main` / `/(root)` にして Save。
`main` に push すると数分で https://sogaryo0411-droid.github.io/madori/ に反映される。

## ファイル構成

```
index.html              画面の骨格・ツールバー・ダイアログ
css/style.css           レイアウト（safe-area 対応、ボタン44px以上）
js/app.js               状態管理・画面の配線
js/viewport.js          Konva Stage、パン・ピンチ・ホイール
js/image-loader.js      画像の読み込みと縮小
js/calibration.js       縮尺設定
js/grid.js              1mグリッド
js/furniture.js         家具の描画・選択・ドラッグ
js/furniture-dialog.js  家具の追加・編集ダイアログ
js/storage.js           IndexedDB 自動保存
js/io.js                JSON/PNG の書き出し・読み込み
```
