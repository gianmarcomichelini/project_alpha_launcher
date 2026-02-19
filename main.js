const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { exec, execSync } = require('child_process');
const AdmZip = require('adm-zip');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

const GITHUB_REPO = "J3YCEN/project_alpha_releases"; 
const GAME_DIR = path.join(app.getPath('userData'), 'Game');
const VERSION_FILE = path.join(GAME_DIR, 'version.json');

// Read local game version
function getLocalVersion() {
    if (fs.existsSync(VERSION_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8')).version;
        } catch (e) {
            return null;
        }
    }
    return null;
}

// Recursively find the game executable (.exe or .app)
function findGameExecutable(baseDir, extension) {
    if (!fs.existsSync(baseDir)) return null;
    
    for (const file of fs.readdirSync(baseDir)) {
        const fullPath = path.join(baseDir, file);
        const stat = fs.statSync(fullPath);
        
        if (file.endsWith(extension)) {
            // Ignore crash handlers
            if (extension === '.exe' && file.toLowerCase().includes('crash')) continue; 
            return fullPath; 
        }
        
        // Dig into subdirectories (ignore macOS .app bundles)
        if (stat.isDirectory() && !file.endsWith('.app')) {
            const found = findGameExecutable(fullPath, extension);
            if (found) return found;
        }
    }
    return null;
}

// Check for updates on GitHub
ipcMain.handle('check-update', async () => {
    try {
        const response = await axios.get(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
            headers: { 'Accept': 'application/vnd.github.v3+json' }
        });
        
        const latestVersion = response.data.tag_name;
        const localVersion = getLocalVersion();
        const isUpToDate = localVersion === latestVersion;
        
        // Match asset to OS
        const targetKeyword = process.platform === 'win32' ? 'win' : 'mac';
        const asset = response.data.assets.find(a => a.name.toLowerCase().includes(targetKeyword));

        return {
            isUpToDate,
            latestVersion,
            localVersion,
            assetUrl: asset ? asset.browser_download_url : null 
        };
    } catch (error) {
        return { error: true, message: "Server connection failed. Check your network or GitHub release." };
    }
});

// Download and extract the game
ipcMain.handle('download-game', async (event, { url, version }) => {
    if (!fs.existsSync(GAME_DIR)) fs.mkdirSync(GAME_DIR, { recursive: true });

    const zipPath = path.join(GAME_DIR, 'update.zip');
    const writer = fs.createWriteStream(zipPath);

    try {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream'
        });

        const totalLength = response.headers['content-length'];
        let downloadedLength = 0;

        // Send progress to frontend
        response.data.on('data', (chunk) => {
            downloadedLength += chunk.length;
            if (totalLength && mainWindow) {
                const progress = Math.round((downloadedLength / totalLength) * 100);
                mainWindow.webContents.send('download-progress', progress);
            }
        });

        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                try {
                    const zip = new AdmZip(zipPath);
                    zip.extractAllTo(GAME_DIR, true);
                    fs.unlinkSync(zipPath); 
                    
                    fs.writeFileSync(VERSION_FILE, JSON.stringify({ version }));
                    
                    // macOS specific permissions fix
                    if (process.platform === 'darwin') {
                        const appPath = findGameExecutable(GAME_DIR, '.app');
                        if (appPath) {
                            try { execSync(`xattr -rc "${appPath}"`); } catch (e) {}
                            
                            const macosDirPath = path.join(appPath, 'Contents', 'MacOS');
                            if (fs.existsSync(macosDirPath)) {
                                const macFiles = fs.readdirSync(macosDirPath);
                                if (macFiles.length > 0) {
                                    fs.chmodSync(path.join(macosDirPath, macFiles[0]), '755');
                                }
                            }
                        }
                    }
                    resolve(true); 
                } catch (e) {
                    reject(e);
                }
            });
            writer.on('error', reject);
        });
    } catch (error) {
        throw error;
    }
});

// Find and launch the executable
ipcMain.handle('launch-game', async () => {
    const platform = process.platform;
    let command = "";

    try {
        if (platform === 'win32') {
            const exePath = findGameExecutable(GAME_DIR, '.exe');
            if (exePath) command = `"${exePath}"`;
        } else if (platform === 'darwin') {
            const appPath = findGameExecutable(GAME_DIR, '.app');
            if (appPath) command = `open "${appPath}"`;
        }

        if (command) {
            exec(command, () => app.quit());
        }
    } catch (e) {
        console.error("Launch failed.", e);
    }
});