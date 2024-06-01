// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const express = require('express');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');

let app;
let server;
let io;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Activating ENVIL Extension');

    let openEnvironmentCommand = vscode.commands.registerCommand('envil.start', async function () {
		try {
            // Update workspace settings
            const workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : null;
            if (workspaceFolder) {
                const workspaceSettingsPath = path.join(workspaceFolder, '.vscode', 'settings.json');
                await createSettingsFileIfNotExist(workspaceSettingsPath);
                const newWorkspaceSettingsPath = path.join(__dirname, 'data', 'workspace_settings.json');
                const newWorkspaceSettings = JSON.parse(fs.readFileSync(newWorkspaceSettingsPath, 'utf8'));
                updateSettingsWithPlaceholders(workspaceSettingsPath, newWorkspaceSettings);
            }

            // TODO : test
            // Update user settings
            const globalSettingsPath = getGlobalSettingsPath();
            const newGlobalSettingsPath = path.join(__dirname, 'data', 'global_settings.json');
            const newGlobalSettings = JSON.parse(fs.readFileSync(newGlobalSettingsPath, 'utf8'));
            updateSettingsWithPlaceholders(globalSettingsPath, newGlobalSettings);

            vscode.window.showInformationMessage('Configuration settings updated!');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to update settings: ${error.message}`);
        }

        if (app || server || io) {
            closeServersAndSockets();
        }

        // create servers
        app = express();
        server = app.listen(3000, () => {
            console.log('Express server is running at http://localhost:3000');
            vscode.env.openExternal(vscode.Uri.parse('http://localhost:3000'));
        });
        io = new Server(3001, {
            cors: {
                origin: '*',
            }
        });
        io.on('connection', (socket) => {
            console.log('Socket.io: Client connected');
            socket.on('disconnect', () => {
                console.log('Socket.io: Client disconnected');
            });
        });

        // serve static files
        app.use(express.static(path.join(__dirname, 'hydra')));
        const workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : null;
        if (workspaceFolder) {
            app.use('/files', express.static(path.join(workspaceFolder, 'public')));
        } else {
            console.log("Can't serve static local files: No workspace folder is open.");
        }
    });

	let closeEnvironmentCommand = vscode.commands.registerCommand('envil.stop', async function () {
        try {
            // remove workspace settings
            const workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : null;
            if (workspaceFolder) {
                const workspaceSettingsPath = path.join(workspaceFolder, '.vscode', 'settings.json');
                removeSettingsWithPlaceholders(workspaceSettingsPath);
            }

            // remove user settings
            const globalSettingsPath = getGlobalSettingsPath();
            removeSettingsWithPlaceholders(globalSettingsPath);

            vscode.window.showInformationMessage('Configuration settings removed!');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to remove settings: ${error.message}`);
        }
        
        closeServersAndSockets();
    });

    let evaluateHydraCommand = vscode.commands.registerCommand('envil.evaluate.hydra', function () {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            let command = "";
            const document = editor.document;
            const selection = editor.selection;
            let text = document.getText(selection);
            text = text.length === 0 ? document.getText() : text;
            const lines = text.split('\n');
            for (let line of lines) {
                if (!line.includes('://') && line.includes('//')) {
                    line = "";
                }
                // local files handling
                if (line.includes('local/files/')) {
                    line = line.replace("local/files/", "http://localhost:3000/files/");
                }
                else if (line !== "") {
                    command = command + line;
                    if (line.endsWith(';')) {
                        // send command to client
                        console.log("\n\n");
                        io.sockets.emit('new-command', { data: command });
                        command = "";
                    }
                }
            }
        }
    });

    context.subscriptions.push(openEnvironmentCommand);
    context.subscriptions.push(closeEnvironmentCommand);
    context.subscriptions.push(evaluateHydraCommand);

    console.log('ENVIL Extension activated successfully!');
}

// This method is called when your extension is deactivated
async function deactivate() {
    console.log('Deactivating ENVIL Extension');
	await vscode.commands.executeCommand('apc.extension.disable');
    closeServersAndSockets();
    console.log('ENVIL Extension deactivated successfully!');
}

function closeServersAndSockets() {
    if (io) {
        io.close(() => {
            console.log('Socket.io server closed');
        });
        io = null;
    }
    if (server) {
        server.close(() => {
            console.log('Express server closed');
        });
        server = null;
    }
}

async function createSettingsFileIfNotExist(settingsPath) {
    try {
        const dir = path.dirname(settingsPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        if (!fs.existsSync(settingsPath)) {
            fs.writeFileSync(settingsPath, JSON.stringify({}, null, 4));
        }
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to create settings file: ${err.message}`);
    }
}

function getGlobalSettingsPath() {
    const vscodeSettingsFolder = process.platform === 'win32' ? 'AppData/Roaming/Code/User' : '.config/Code/User';
    const homeDir = os.homedir();
    return path.join(homeDir, vscodeSettingsFolder, 'settings.json');
}

async function updateSettingsWithPlaceholders(settingsPath, newSettings) {
    try {
        let existingSettings = {};
        let settingsContent = '';
        const newSettingsString = JSON.stringify(newSettings, null, "\t");

        // Check if the settings file exists
        if (fs.existsSync(settingsPath)) {
            // Read existing settings from the file
            settingsContent = fs.readFileSync(settingsPath, 'utf-8');
            existingSettings = extractSettingsFromPlaceholders(settingsContent);
        }

        const wrappedNewSettings = wrapSettingsWithPlaceholders(newSettingsString.substring(1, newSettingsString.length - 1));

        const existingSettingsContent = isEmpty(existingSettings) ? "{ " : JSON.stringify(existingSettings, null, "\t");

        // Merge existing settings with new settings
        const mergedSettings = existingSettingsContent.substring(0, existingSettingsContent.length - 1)
            .concat(isEmpty(existingSettings) ? '' : ',')
            .concat(wrappedNewSettings + '}');

        // Write updated settings to the file
        fs.writeFileSync(settingsPath, mergedSettings);

        vscode.window.showInformationMessage('Configuration settings updated!');
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to update settings file: ${err.message}`);
    }
}

function extractSettingsFromPlaceholders(settingsContent) {
    const regex = /\/\/ BEGIN: ENVIL Extension Settings[\s\S]*?\/\/ END: ENVIL Extension Settings/;
    const parts = settingsContent.split(regex);
    const outsidePlaceholders = removeLastComma(parts[0]) + parts[1];
    return JSON.parse(outsidePlaceholders);
}

function wrapSettingsWithPlaceholders(settingsContent) {
    // Replace settings between placeholders with new settings
    // return settingsContent.replace(/\/\/ BEGIN: ENVIL Extension Settings\n[\s\S]*?\/\/ END: ENVIL Extension Settings\n/, `// BEGIN: ENVIL Extension Settings\n${newSettingsContent}\n// END: ENVIL Extension Settings\n`);
    const settingsContentString = settingsContent.substring(1, settingsContent.length - 1);
    return `\n\t// BEGIN: ENVIL Extension Settings\n ${settingsContentString} \n\t// END: ENVIL Extension Settings\n`;
}

function isEmpty(obj) {
    return JSON.stringify(obj) === '{}' && obj.constructor === Object;
}

function removeLastComma(str) {
    const lastCommaIndex = str.lastIndexOf(',');
    if (lastCommaIndex === -1) {
        return str;
    }
    return str.slice(0, lastCommaIndex) + str.slice(lastCommaIndex + 1);
}

async function removeSettingsWithPlaceholders(settingsPath) {
    try {
        const settingsContent = fs.readFileSync(settingsPath, 'utf-8');
        // Remove custom settings between placeholders
        const updatedContent = settingsContent.replace(/\/\/ BEGIN: ENVIL Extension Settings[\s\S]*?\/\/ END: ENVIL Extension Settings/, '');
        // Write updated settings
        fs.writeFileSync(settingsPath, updatedContent.trim());
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to remove settings file: ${err.message}`);
    }
}

module.exports = {
    activate,
    deactivate
}
