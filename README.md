# tokyo-tennis-checker
東京都テニスコートの空き状況を30分ごとにチェックして、空き状況に変化があるとメールでお知らせします。
比較的アクセスのよい人工芝10コートとハード3コートが対象です。
当月の土日祝が対象です。
tennis-checker.js（GitHubのメインのプログラム）
tennis-tracker.yml（GitHubの手動実行するプログラム）
Tennis-Court-Timer（ymlを実行するGASのスケジューラー）Googleドライブに保存
GitHub緊急停止方法
GitHubにログインし、今回のテニスのリポジトリを開きます。
画面上部にある [Actions]（アクションズ）タブをクリックします。
左側のメニューにある [All workflows] の下から、ご自身のワークフロー名をクリックします。
画面の右側（「Run workflow」ボタンの少し右あたり）にある、⚙️（歯車マーク） または ...（三点リーダー） のボタンをクリックします。
メニューが表示されるので、赤文字で書かれた [Disable workflow]（ワークフローを無効化する） をクリックします
GitHubの再開
[Disable workflow]を［Enable workflow］に。
GASの停止
GAS→トリガー→三点リーダー→削除
GASの再開
GAS→トリガーを追加→再設定
