# ポイ活ナビ

現在地や選んだカテゴリから、登録したカード・決済アプリの中で一番お得なものを教えてくれる個人用ツールです。外部APIは使わず、すべてブラウザの中だけで完結します(データは端末のlocalStorageに保存)。

## ローカルで試す

```bash
npx serve .
```

表示されたURL(`http://localhost:...`)をブラウザで開いてください。`http://localhost` は位置情報APIが使える例外的なアドレスなので、この状態でもGPSの動作確認ができます。

## GitHub Pagesで公開する(スマホからも使うために必須)

スマホでGPSを使うには、httpsで配信される必要があります。GitHub Pagesを使うと無料でhttpsのURLが手に入ります。

1. https://github.com で新しいリポジトリを作成(例: `poikatsu-navi`)
2. このフォルダの中身をそのリポジトリにpush
3. リポジトリの Settings → Pages → Source を「Deploy from a branch」、Branchを`main`(root)に設定して保存
4. 数分後に `https://<ユーザー名>.github.io/poikatsu-navi/` でアクセス可能になります
5. スマホでそのURLを開き、共有メニューから「ホーム画面に追加」するとアプリのように使えます

## データについて

カード・場所・カテゴリの設定はブラウザのlocalStorageに保存されます。**同じ端末・同じブラウザでのみ**保持され、PCとスマホなど別端末間では自動で同期されません。それぞれの端末で設定してください。
