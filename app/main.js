require('v8-compile-cache');
// electron本体
const { app, BrowserWindow, ipcMain, shell } = require('electron');
// 設定を保存するやつ
const store = require('electron-store');
const config = new store();
// ログを書き出すやつ
const log = require('electron-log');
// ショートカットを登録するやつ
const localShortcut = require('electron-localshortcut');
// 自動アップデートに使うやつ
const { autoUpdater } = require('electron-updater');
// パスをアレコレするやつ
const path = require('path');
// アプリの情報
const appInfo = require('../package.json');
const { info } = require('console');

// 同じアプリを同時起動するとキャッシュ関係が狂うのでそれを防いでいる
if (!app.requestSingleInstanceLock()) {
    log.error('Other process(es) has been alredy runnning. Please restart after killing all process(es).');
    app.quit();
}

// 必要な変数の初期化
let gameWindow = null;
let splashWindow = null;

log.info(`Katatsumuri v${appInfo.version}\n    - Electron ${process.versions.electron}\n    - Node.js ${process.versions.node}\n    - Chrome ${process.versions.chrome}`);

// Chromeのオプションを追加する
const initFlags = () => {
    // フレームレート解放
    app.commandLine.appendSwitch('disable-frame-rate-limit');
    // 垂直同期オフ
    app.commandLine.appendSwitch('disable-gpu-vsync');
    // WebGL2 Context(ハードウェアアクセラレーション)
    app.commandLine.appendSwitch('enable-webgl2-compute-context');
    // 2Dのレンダリングにハードウェアアクセラレーションを適用するかどうか
    app.commandLine.appendSwitch('disable-accelerated-2d-canvas', true);
    // ウィンドウキャプチャのために必要(Windows以外では動かない)
    app.commandLine.appendSwitch('in-process-gpu', process.platform === 'win32' ? true : false);
    // メディアの自動再生
    app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
    // ANGLE Backend
    app.commandLine.appendSwitch('use-angle', 'gl');
};

initFlags();


// ゲーム開始処理
const launchGame = () => {
    initGameWindow();
};

// スプラッシュウィンドウを表示&アップデートの確認
const initSplashWindow = () => {
    splashWindow = new BrowserWindow({
        width: 640,
        height: 320,
        frame: false,
        resizable: false,
        movable: false,
        center: true,
        show: false,
        alwaysOnTop: true,
        title: 'Katatsumuri',
        roundedCorners: false,
        webPreferences: {
            contextIsolation: false,
            nativeWindowOpen: true,
            preload: path.join(__dirname, 'scripts/splash.js'),
        },
    });
    const initUpdater = () => {
        autoUpdater.logger = log;
        let updateTimeout = null;
        autoUpdater.on('checking-for-update', (info) => {
            splashWindow.webContents.send('status', 'Checking for update...');
            updateTimeout = setTimeout(() => {
                splashWindow.webContents.send('status', 'Error: Update failed');
                setTimeout(() => {
                    launchGame();
                }, 1000);
            }, 15000);
        });
        autoUpdater.on('update-available', (info) => {
            if (updateTimeout) clearTimeout(updateTimeout);
            splashWindow.webContents.send('status', `New version available: ${info.version}`);
        });
        autoUpdater.on('update-not-available', (info) => {
            if (updateTimeout) clearTimeout(updateTimeout);
            splashWindow.webContents.send('status', 'This is the latest version');
            setTimeout(() => {
                launchGame();
            }, 2000);
        });
        autoUpdater.on('download-progress', (info) => {
            if (updateTimeout) clearTimeout(updateTimeout);
            splashWindow.webContents.send('status', `Downloading: ${Math.floor(info.percent)}% / ${Math.floor(info.bytesPerSecond / 1000)}KB/s`);
        });
        autoUpdater.on('update-downloaded', (info) => {
            if (updateTimeout) clearTimeout(updateTimeout);
            splashWindow.webContents.send('status', 'Installing...');
            setTimeout(() => {
                autoUpdater.quitAndInstall();
            }, 2000);
        });
        autoUpdater.on('error', (e) => {
            if (updateTimeout) clearTimeout(updateTimeout);
            splashWindow.webContents.send('status', 'Error: Update failed');
            setTimeout(() => {
                launchGame();
            }, 2000);
        });
        autoUpdater.autoDownload = true;
        autoUpdater.allowDowngrade = false;
        autoUpdater.allowPrerelease = false;
        autoUpdater.checkForUpdates();
    };
    splashWindow.removeMenu();
    splashWindow.loadURL(path.join(__dirname, 'html/splash.html'));
    splashWindow.webContents.once('did-finish-load', () => {
        splashWindow.show();
        initUpdater();
    });
};

// メインのウィンドウを表示する処理
const initGameWindow = () => {
    gameWindow = new BrowserWindow({
        width: 900,
        height: 600,
        show: false,
        title: 'Katatsumuri',
        roundedCorners: false,
        webPreferences: {
            contextIsolation: false,
            preload: path.join(__dirname, 'scripts/preload.js'),
        },
    });
    gameWindow.removeMenu();
    gameWindow.once('ready-to-show', () => {
        splashWindow.destroy();
        if (config.get('isMaximized', false)) gameWindow.maximize();
        if (config.get('isFullScreen', false)) gameWindow.setFullScreen(true);
        gameWindow.show();
    });
    gameWindow.on('page-title-updated', (e) => e.preventDefault());
    gameWindow.webContents.on('will-prevent-unload', (e) => {
        e.preventDefault();
    });
    gameWindow.on('close', () => {
        config.set('isMaximized', gameWindow.isMaximized());
        config.set('isFullScreen', gameWindow.isFullScreen());
    });
    gameWindow.webContents.on('new-window', (e, url) => {
        e.preventDefault();
        shell.openExternal(url);
    });
    const sKey = [
        ['Escape', () => {
            // ゲーム内でのESCキーの有効化
            gameWindow.webContents.send('ESC');
        }],
        ['F5', () => {
            // リ↓ロ↑ードする
            gameWindow.reload();
        }],
        ['F11', () => {
            // フルスクリーン切り替え
            const isFullScreen = gameWindow.isFullScreen();
            config.set('Fullscreen', !isFullScreen);
            gameWindow.setFullScreen(!isFullScreen);
        }],
        ['Ctrl+Shift+F1', () => {
            // クライアントの再起動
            app.relaunch();
            app.quit();
        }],
        [['Ctrl+F1', 'F12'], () => {
            // 開発者ツールの起動
            gameWindow.webContents.openDevTools();
        }],
    ];
    sKey.forEach((k) => {
        localShortcut.register(gameWindow, k[0], k[1]);
    });
    gameWindow.loadURL('https://voxiom.io');
};

ipcMain.handle('getAppVersion', (e) => {
    return appInfo.version;
});

// 準備完了したら処理を開始する
app.on('ready', () => {
    initSplashWindow();
});