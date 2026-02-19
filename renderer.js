const btnAction = document.getElementById('btn-action');
const statusText = document.getElementById('status');
const progressBar = document.getElementById('progress-bar');

let downloadUrl = "";
let latestVersion = "";

async function init() {
    console.log("Checking for updates on GitHub...");
    statusText.innerText = "Controllo aggiornamenti...";
    
    const info = await window.launcherAPI.checkUpdate();

    if (info.error) {
        console.error("Error during API check:", info.message);
        statusText.innerText = info.message;
        return;
    }

    if (info.isUpToDate) {
        console.log(`The game is already up to date at version ${info.localVersion}.`);
        statusText.innerText = `Pronto per giocare (Versione: ${info.localVersion})`;
        progressBar.style.width = "100%";
        
        // Set up the button to launch the game
        btnAction.innerText = "Gioca";
        btnAction.disabled = false;
        btnAction.onclick = () => window.launcherAPI.launchGame();
        
    } else if (info.assetUrl) {
        console.log(`Found a new version: ${info.latestVersion}`);
        downloadUrl = info.assetUrl;
        latestVersion = info.latestVersion;
        
        // Change text depending on whether it's an update or a fresh install
        if (info.localVersion) {
            statusText.innerText = `Aggiornamento disponibile: ${latestVersion}`;
            btnAction.innerText = "Aggiorna";
        } else {
            statusText.innerText = `Nuova installazione: ${latestVersion}`;
            btnAction.innerText = "Scarica Gioco";
        }
        
        btnAction.disabled = false;
        btnAction.onclick = startDownload;
        
    } else {
        console.warn("Release found, but the .zip file for this OS is missing.");
        statusText.innerText = "Nessun asset compatibile trovato per questa piattaforma.";
    }
}

// Handles the click on the Download/Update button
async function startDownload() {
    console.log(`Starting download from: ${downloadUrl}`);
    btnAction.disabled = true;
    statusText.innerText = "Download in corso...";
    progressBar.style.width = "0%";
    
    // Update the UI as the file downloads
    window.launcherAPI.onProgress((percent) => {
        progressBar.style.width = percent + "%";
        statusText.innerText = `Scaricamento: ${percent}%`;
    });

    try {
        await window.launcherAPI.downloadGame(downloadUrl, latestVersion);
        
        console.log("Download and installation completed successfully!");
        statusText.innerText = "Installazione completata!";
        
        // Prepare the button for playing
        btnAction.innerText = "Gioca Ora";
        btnAction.disabled = false;
        btnAction.onclick = () => window.launcherAPI.launchGame();
        
    } catch (err) {
        console.error("The download failed:", err);
        statusText.innerText = "Errore durante il download o l'installazione.";
        
        // Allow the user to try again
        btnAction.disabled = false;
        btnAction.innerText = "Riprova";
    }
}

init();