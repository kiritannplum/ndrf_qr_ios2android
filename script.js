// script.js (変更なし、提供されたコードのまま)

// --- DOM要素の取得 ---
const qrInput = document.getElementById('qrInput');
const qrImagePreview = document.getElementById('qrImagePreview');
const qrCanvas = document.getElementById('qrCanvas');
const decodeStatus = document.getElementById('decodeStatus');
const decodedHexData = document.getElementById('decodedHexData');
const editableHexData = document.getElementById('editableHexData');
const editStatus = document.getElementById('editStatus');
const generateBtn = document.getElementById('generateBtn');
const newQrCanvas = document.getElementById('newQrCanvas');
const generateStatus = document.getElementById('generateStatus');
const copyDecodedBtn = document.getElementById('copyDecodedBtn');
const copyEditableBtn = document.getElementById('copyEditableBtn');
const copyDecodedRawBtn = document.getElementById('copyDecodedRawBtn');
const i2aCheckbox = document.getElementById('i2aCheckbox');
const largeSizeCheckbox = document.getElementById('largeSizeCheckbox'); // 修正対象

const ctx = qrCanvas.getContext('2d', { willReadFrequently: true });

// --- 状態管理用変数 ---
let originalDecodedBytes = null;
let processedI2aBytes = null;

// --- ヘルパー関数 ---
function bytesToFormattedHexForDisplay(bytes) {
    if (!bytes) return '';
    let hexString = '';
    for (let i = 0; i < bytes.length; i++) {
        hexString += bytes[i].toString(16).padStart(2, '0').toUpperCase();
        const byteNumber = i + 1;
        if (byteNumber < bytes.length) {
            if (byteNumber % 128 === 0) { hexString += '\n\n'; }
            else if (byteNumber % 16 === 0) { hexString += '\n'; }
            else { hexString += ' '; }
        }
    }
    return hexString;
}
function bytesToFormattedHexForEdit(bytes) {
    if (!bytes) return '';
    let hexString = '';
    for (let i = 0; i < bytes.length; i++) {
        hexString += bytes[i].toString(16).padStart(2, '0').toUpperCase();
        const byteNumber = i + 1;
        if (byteNumber < bytes.length) {
            if (byteNumber % 128 === 0) { hexString += '\n\n'; }
            else if (byteNumber % 16 === 0) { hexString += '\n'; }
        }
    }
    return hexString;
}
function formattedHexToBytes(formattedHex) {
    const pureHex = formattedHex.replace(/\s+/g, '');
    if (pureHex.length === 0) {
        return new Uint8Array(0);
    }
    if (pureHex.length % 2 !== 0) { throw new Error("不正なHex文字列です。長さが奇数です。"); }
    if (!/^[0-9a-fA-F]*$/.test(pureHex)) { throw new Error("不正なHex文字列です。0-9, a-f, A-F 以外の文字が含まれています。"); }
    const bytes = new Uint8Array(pureHex.length / 2);
    for (let i = 0; i < pureHex.length; i += 2) {
        const byte = parseInt(pureHex.substring(i, i + 2), 16);
        if (isNaN(byte)) { throw new Error(`不正なHex文字列の解析中にエラーが発生しました: "${pureHex.substring(i, i + 2)}"`); }
        bytes[i / 2] = byte;
    }
    return bytes;
}
async function copyToClipboard(text, buttonElement) {
    if (!text) return;
    if (!navigator.clipboard) { alert('お使いのブラウザはクリップボードAPIに対応していません。'); return; }
    const originalText = buttonElement.textContent;
    try {
        await navigator.clipboard.writeText(text.toUpperCase());
        buttonElement.textContent = 'コピー!';
        buttonElement.disabled = true;
    } catch (err) { console.error('クリップボードへのコピーに失敗しました:', err); buttonElement.textContent = '失敗'; }
    finally { setTimeout(() => { buttonElement.textContent = originalText; buttonElement.disabled = false; }, 1500); }
}
function autoResizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    const minHeight = parseInt(window.getComputedStyle(textarea).getPropertyValue('min-height'), 10) || 0;
    textarea.style.height = Math.max(minHeight, textarea.scrollHeight) + 'px';
}

// --- i2a 処理関数 (ビッグエンディアン修正) ---
/**
 * 元のバイト配列にi2a処理を適用する
 * @param {Uint8Array} originalBytes - 元のバイト配列
 * @returns {Uint8Array|null} - 処理後のバイト配列、またはエラー/入力なしの場合はnull
 */
function applyI2aProcessing(originalBytes, qrVersion = 0) {
    if (!originalBytes || originalBytes.length === 0) {
        return null;
    }
    const processedBytes = new Uint8Array(originalBytes);
    const byteLength = originalBytes.length;

    let isLarge;
    if (byteLength >= 256 || qrVersion >= 10) {
        isLarge = true;
    } else if (byteLength >= 128) {
        isLarge = largeSizeCheckbox.checked;
    } else {
        isLarge = false;
    }

    // --- バイト長書き込み (ビッグエンディアン対応) ---
    if (byteLength >= 128) { // index 127 (128バイト目) が存在する場合
        if (isLarge) {
            // ★★★ ビッグエンディアン修正 ★★★
            // 大サイズ処理: 127バイト目(index 126)に上位、128バイト目(index 127)に下位
            if (byteLength >= 127) { // index 126 (127バイト目) が存在する場合のみ上位バイトを書き込む
                processedBytes[126] = (byteLength >> 8) & 0xFF; // 上位8bit
            }
            // index 127 (128バイト目) に下位バイトを書き込む
            processedBytes[127] = byteLength & 0xFF;       // 下位8bit
            // ★★★ /ビッグエンディアン修正 ★★★
        } else {
            // 通常サイズ処理: 128バイト目(index 127)にバイト長 (1バイトなのでエンディアン関係なし)
            processedBytes[127] = byteLength & 0xFF;
        }
    } else if (byteLength === 127 && isLarge) {
        // 特殊ケース: 127バイトちょうどで、ユーザーが大サイズを選択した場合
        // ビッグエンディアンに従い、index 126 (127バイト目) に上位バイトを書き込む (この場合 0 になる)
        // 下位バイトを書き込む場所(index 127)は存在しない
        processedBytes[126] = (byteLength >> 8) & 0xFF; // 上位バイト (0) を書き込む
    }
    // else if (byteLength < 127): バイト長書き込み処理は不要

    // --- 129バイト目以降の置き換え ---
    for (let i = 128; i < byteLength; i++) {
        processedBytes[i] = processedBytes[i % 128];
    }

    return processedBytes;
}

// --- デコード結果表示エリア更新関数 ---
function updateDecodedDisplay() {
    const displayBytes = i2aCheckbox.checked ? processedI2aBytes : originalDecodedBytes;
    decodedHexData.value = bytesToFormattedHexForDisplay(displayBytes);
    // デコード結果表示エリアの高さも自動調整（広い画面でmax-heightを超えた場合用）
    // autoResizeTextarea(decodedHexData); // readonly なので不要かも
}

// --- 状態リセット関数 ---
function resetState() {
    originalDecodedBytes = null;
    processedI2aBytes = null;
    decodedHexData.value = '';
    editableHexData.value = '';
    largeSizeCheckbox.checked = false;
    largeSizeCheckbox.disabled = true;
    i2aCheckbox.checked = true; // 初期状態に戻す
    decodeStatus.textContent = '';
    editStatus.textContent = '(生成時、スペースや改行は無視されます)';
    generateStatus.textContent = '';
    qrImagePreview.style.display = 'none';
    qrImagePreview.src = '#';
    const newCtx = newQrCanvas.getContext('2d');
    if (newCtx) { newCtx.clearRect(0, 0, newQrCanvas.width, newQrCanvas.height); }
    autoResizeTextarea(editableHexData);
    // decodedHexData も初期高さにリセット
    decodedHexData.style.height = 'auto';
    decodedHexData.style.height = getComputedStyle(decodedHexData).getPropertyValue('min-height');
}

// --- 大サイズチェックボックス状態更新関数 ---
/**
 * データ長に基づいて largeSizeCheckbox の checked と disabled を設定する
 * @param {number} byteLength - データのバイト長
 * @param {boolean} isInitialDecode - QRデコード直後かどうか (trueなら128-255範囲でchecked=falseにする)
 */
function updateLargeSizeCheckboxState(byteLength, isInitialDecode = false) {
    if (byteLength >= 256) {
        largeSizeCheckbox.checked = true;
        largeSizeCheckbox.disabled = true;
    } else if (byteLength >= 128) {
        // 128-255 バイト: ユーザーが変更可能
        largeSizeCheckbox.disabled = false;
        if (isInitialDecode) {
            // QRデコード直後など、初期状態ではチェックを外す
            largeSizeCheckbox.checked = false;
        }
        // isInitialDecode=false (手動編集時など) の場合は、
        // ユーザーが設定した checked 状態を維持する (ここでは変更しない)
    } else { // byteLength < 128
        largeSizeCheckbox.checked = false;
        largeSizeCheckbox.disabled = true;
    }
}

// --- QRコードのデコード処理 (バージョン情報表示を追加) ---
function decodeQrCode(imageDataUrl) {
    decodeStatus.textContent = 'デコード処理中...';

    const img = new Image();
    img.onload = () => {
        qrCanvas.width = img.width;
        qrCanvas.height = img.height;
        ctx.drawImage(img, 0, 0, img.width, img.height);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);

        try {
            // jsQRの実行と結果の受け取り
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
            });

            if (code) { // デコード成功
                originalDecodedBytes = new Uint8Array(code.binaryData);

                // ▼▼▼ バージョン情報を取得してステータスに追加 ▼▼▼
                const qrVersion = code.version; // バージョン番号を取得
                decodeStatus.textContent = `デコード成功！ (${originalDecodedBytes.length} バイト, Ver: ${qrVersion})`;
                // ▲▲▲ バージョン情報を取得してステータスに追加 ▲▲▲

                updateLargeSizeCheckboxState(originalDecodedBytes.length, true);
                processedI2aBytes = applyI2aProcessing(originalDecodedBytes, qrVersion);

                updateDecodedDisplay();
                editableHexData.value = bytesToFormattedHexForEdit(originalDecodedBytes);

                autoResizeTextarea(editableHexData);
                // decodedHexData もリサイズ（初回表示時）
                // autoResizeTextarea(decodedHexData); // readonly なので不要かも

            } else { // デコード失敗
                decodeStatus.textContent = 'QRコードが見つからないか、有効なデータを含んでいません。';
                // resetState(); // 必要ならリセット処理
            }
        } catch (error) {
            console.error("jsQR デコードエラー:", error);
            decodeStatus.textContent = 'デコード中にエラーが発生しました。';
            // resetState(); // 必要ならリセット処理
        }
    };
    img.onerror = () => {
        decodeStatus.textContent = '画像の読み込みに失敗しました。';
        // resetState(); // 必要ならリセット処理
    }
    img.src = imageDataUrl;
}

// --- イベントリスナーの設定 ---

// 1. ファイル選択時の処理
qrInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) {
        // resetState(); // ファイル選択がキャンセルされたらリセット
        return;
    }
    // 状態をリセットしてから読み込み開始
    resetState();
    const reader = new FileReader();
    reader.onload = (e) => {
        const imageDataUrl = e.target.result;
        qrImagePreview.src = imageDataUrl;
        qrImagePreview.style.display = 'block';
        decodeStatus.textContent = '画像を読み込みました。デコードを開始します...';
        decodeQrCode(imageDataUrl);
    }
    reader.onerror = () => {
        decodeStatus.textContent = 'ファイルの読み込みに失敗しました。';
        qrImagePreview.style.display = 'none';
        qrImagePreview.src = '#';
    }
    reader.readAsDataURL(file);
    // generateStatus.textContent = ''; // resetState内で処理
    // const newCtx = newQrCanvas.getContext('2d'); // resetState内で処理
    // if (newCtx) { newCtx.clearRect(0, 0, newQrCanvas.width, newQrCanvas.height); } // resetState内で処理
});

// 2a. デコード結果 (フォーマット済み) コピーボタン
copyDecodedBtn.addEventListener('click', () => {
    copyToClipboard(decodedHexData.value, copyDecodedBtn);
});

// 2b. デコード結果 (Raw) コピーボタン
copyDecodedRawBtn.addEventListener('click', () => {
    const rawHex = decodedHexData.value.replace(/\s+/g, '');
    copyToClipboard(rawHex, copyDecodedRawBtn);
});

// 3. 編集データコピーボタン
copyEditableBtn.addEventListener('click', () => {
    copyToClipboard(editableHexData.value, copyEditableBtn);
});

// 4. 編集用Textareaの入力イベント (リアルタイム反映)
editableHexData.addEventListener('input', () => {
    autoResizeTextarea(editableHexData);
    try {
        const currentEditableHex = editableHexData.value;
        originalDecodedBytes = formattedHexToBytes(currentEditableHex);

        // ▼▼▼ 大サイズチェックボックスの状態更新 (手動編集なので第2引数false) ▼▼▼
        updateLargeSizeCheckboxState(originalDecodedBytes.length, false);
        // ▲▲▲ 大サイズチェックボックスの状態更新 ▲▲▲

        // i2a処理 (更新されたチェックボックス状態を applyI2aProcessing が参照する)
        processedI2aBytes = applyI2aProcessing(originalDecodedBytes);

        // デコード結果表示エリアを更新
        updateDecodedDisplay();
        editStatus.textContent = '(生成時、スペースや改行は無視されます)';

        // 編集したら生成済みQRはクリア
        generateStatus.textContent = '';
        const newCtx = newQrCanvas.getContext('2d');
        if (newCtx) { newCtx.clearRect(0, 0, newQrCanvas.width, newQrCanvas.height); }

    } catch (error) {
        editStatus.textContent = `エラー: ${error.message}`;
        // エラー時はデコード表示エリアをクリア
        decodedHexData.value = '';
        originalDecodedBytes = null; // 元データも無効化
        processedI2aBytes = null;
        // エラー時は大サイズチェックボックスも無効化
        largeSizeCheckbox.checked = false;
        largeSizeCheckbox.disabled = true;
        // エラー時は生成済みQRもクリア
        generateStatus.textContent = '';
        const newCtx = newQrCanvas.getContext('2d');
        if (newCtx) { newCtx.clearRect(0, 0, newQrCanvas.width, newQrCanvas.height); }
    }
});

// 5. QRコード生成ボタンクリック時 (デコード結果から生成)
generateBtn.addEventListener('click', () => {
    const formattedHexToEncode = decodedHexData.value;
    generateStatus.textContent = 'QRコード生成中...';

    const newCtx = newQrCanvas.getContext('2d');
    if (newCtx) { newCtx.clearRect(0, 0, newQrCanvas.width, newQrCanvas.height); }
    else { console.error("生成用Canvasのコンテキストが取得できません。"); generateStatus.textContent = '生成エラー: Canvasの準備ができませんでした。'; return; }

    // 表示中のデータを使うので、originalBytes や processedBytes が null でも動作するはず
    // ただし、編集エリアのエラーで decodedHexData が空の場合がある
    if (!formattedHexToEncode) {
        // 編集エリアにエラーがあるか、まだ何も読み込んでいない場合
        generateStatus.textContent = '生成エラー: 元となる有効なデータがありません。';
        return;
    }

    try {
        const bytesToEncode = formattedHexToBytes(formattedHexToEncode);

        if (bytesToEncode.length === 0) {
            generateStatus.textContent = '生成エラー: データが空です。';
            return;
        }

        if (bytesToEncode.length > 2953) { // QRコードVersion 40 (L) の最大バイト数
             console.warn(`データサイズが非常に大きい (${bytesToEncode.length} バイト) ため、生成に失敗する可能性があります。QRコードの最大容量は約2953バイトです。`);
             generateStatus.textContent = `警告: データ (${bytesToEncode.length} バイト) が大きすぎます。QRコードの最大容量を超えている可能性があります。`;
             // ここで処理を中断してもよい
             // return;
        } else if (bytesToEncode.length > 1000) { // ある程度大きい場合の警告
            console.warn(`データサイズが大きい (${bytesToEncode.length} バイト) ため、生成に時間がかかるか、モバイルで読みにくくなる可能性があります。`);
        }

        const segments = [ { data: bytesToEncode, mode: 'byte' } ];
        // scaleを調整してサイズをコントロール (ここでは8のまま)
        // canvas要素のスタイル (`max-width: 100%`, `height: auto`) で表示サイズは調整される
        QRCode.toCanvas(newQrCanvas, segments, { errorCorrectionLevel: 'L', margin: 4, scale: 8, color: { dark: "#000000", light: "#ffffff" } }, function (error, canvas) {
            if (error) {
                console.error("QRコード生成エラー:", error);
                generateStatus.textContent = `QRコード生成エラー: ${error.message}`;
                if (error.message.includes('Data too long')) {
                    generateStatus.textContent += ` (データが${bytesToEncode.length}バイトと大きすぎる可能性があります)`;
                } else if (error.message.includes('Could not find')) {
                     generateStatus.textContent += ` (データ長に適したバージョンが見つからない可能性があります)`;
                }
                // エラー時にCanvasをクリア
                 const errCtx = newQrCanvas.getContext('2d');
                 if(errCtx) errCtx.clearRect(0, 0, newQrCanvas.width, newQrCanvas.height);
            } else {
                generateStatus.textContent = `QRコードを生成しました (${bytesToEncode.length} バイト)。`;
                console.log('QRコード生成成功！');
                // 生成成功時にCanvasのサイズを調整（ライブラリが設定したwidth/heightをCSSに反映させるため）
                // newQrCanvas.style.width = canvas.width + 'px'; // CSSでmax-width 100%とheight autoがあるので不要かも
                // newQrCanvas.style.height = canvas.height + 'px';
            }
        });
    } catch (error) {
        // formattedHexToBytes でのエラー
        console.error("Hex解析エラー (生成時):", error);
        generateStatus.textContent = `生成エラー: 表示中のHexデータが不正です (${error.message})。`;
         // エラー時にCanvasをクリア
         const errCtx = newQrCanvas.getContext('2d');
         if(errCtx) errCtx.clearRect(0, 0, newQrCanvas.width, newQrCanvas.height);
    }
});

// 6. i2aチェックボックス変更イベント
i2aCheckbox.addEventListener('change', () => {
    updateDecodedDisplay();
    // 表示が変わるので生成済みQRはクリア
    generateStatus.textContent = '';
    const newCtx = newQrCanvas.getContext('2d');
    if (newCtx) { newCtx.clearRect(0, 0, newQrCanvas.width, newQrCanvas.height); }
});

// 7. 大サイズチェックボックス変更イベント
largeSizeCheckbox.addEventListener('change', () => {
    // チェック状態が変わったので、i2a処理結果を再計算
    if (originalDecodedBytes) { // 元データがある場合のみ
        processedI2aBytes = applyI2aProcessing(originalDecodedBytes);
        // i2aチェックが入っている場合のみ表示を更新
        if (i2aCheckbox.checked) {
            updateDecodedDisplay();
        }
        // 表示中のデータが変わった可能性があるので、生成QRはクリア
        generateStatus.textContent = '';
        const newCtx = newQrCanvas.getContext('2d');
        if (newCtx) { newCtx.clearRect(0, 0, newQrCanvas.width, newQrCanvas.height); }
    }
});


// --- 初期化処理 ---
document.addEventListener('DOMContentLoaded', () => {
    resetState(); // 状態を初期化
    console.log("QRコードリーダー＆ジェネレーター初期化完了 (i2a・大サイズ変更対応、スクロール修正)");
});
