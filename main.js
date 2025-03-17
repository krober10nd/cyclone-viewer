// main.js - Electron Main Process
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true
        }
    });
    
    win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// package.json - Electron Package Configuration
const packageJson = {
    "name": "cyclone_viewer",
    "version": "1.0.0",
    "description": "Cyclone Track Editor/Visualizer",
    "main": "main.js",
    "scripts": {
        "start": "electron .",
        "package": "electron-packager . CycloneTracker --platform=darwin,linux --arch=x64 --out=release-builds --overwrite"
    },
    "dependencies": {
        "electron": "^26.0.0"
    },
    "devDependencies": {
        "electron-packager": "^17.1.1"
    }
};

module.exports = packageJson;