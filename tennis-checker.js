// 1. 月表示テーブル（#month-info）が現れるのを最大30秒間じっと待つ
// 30秒経っても出なければタイムアウト（エラー）になり、安全に処理をストップします
await page.waitForSelector('#month-info', { timeout: 30000 });

// 2. テーブル内にあるすべてのマス（td）を順番通りにすべて取得（28〜42マス）
const cells = await page.$$('#month-info td');

// 3. 最初のマスから最後のマスまで、1マスずつ順番にループ処理
for (const cell of cells) {
    
    // マスに刻まれているID（日付スタンプ、例: "month_20260602"）を読み取る
    const id = await cell.getAttribute('id');
    
    // もしIDが無いマス（カレンダーの端にある空白マスなど）なら、何もせず次のマスへ進む
    if (!id || !id.startsWith('month_')) {
        continue;
    }
    
    // IDから日付の数字だけを引っこ抜く（例: "month_20260602" ➔ "20260602"）
    const dateStr = id.replace('month_', '');
    
    // 4. マスの内部にある画像（imgタグ）を探す
    const img = await cell.$('img');
    
    // 画像が無いマス（過去の日付などの空白）なら、何もせず次のマスへ進む
    if (!img) {
        continue;
    }
    
    // 5. 画像の裏側に書き込まれている「ALT（代替テキスト）」の文字を読み取る
    const altText = await img.getAttribute('alt');
    
    // 6. ALTの文字が「空き」または「一部空き」であるかどうかの最終判定
    if (altText === '空き' || altText === '一部空き') {
        
        // -------------------------------------------------------------
        // 【空きを発見したときの行動エリア】（後でここに通知処理などを書きます）
        // -------------------------------------------------------------
        console.log(`【空き発見】日付: ${dateStr} / 状態: ${altText}`);
        
    }
}
