// @ts-nocheck
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const express = require('express');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const jsonc = require('jsonc-parser');

let app;
let server;
let io;
const envilEnvironmentContextKey = 'envil.environment.active';
let isLoadingCompleted = false;

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {

    console.log('Activating ENVIL Extension');

    const workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : null;

    const isEnvironmentActive = vscode.workspace.getConfiguration().get(envilEnvironmentContextKey) || false;
    if(isEnvironmentActive){
        showNotification('Loading ENVIL environment ...');
        startServersAndSockets(workspaceFolder);
    }

    const openEnvironmentCommand = vscode.commands.registerCommand('envil.start', async function () {
		try {
            showNotification('Loading ENVIL environment ...');
            
            await updateCustomPropertyInSettings(true);
            await updateContextKey();

            // Update workspace settings
            if (workspaceFolder) {
                const workspaceSettingsPath = path.join(workspaceFolder, '.vscode', 'settings.json');
                await createSettingsFileIfNotExist(workspaceSettingsPath);
                const newWorkspaceSettingsPath = path.join(__dirname, 'data', 'workspace_settings.json');
                const newWorkspaceSettings = readJsonWithComments(newWorkspaceSettingsPath).json;
                await updateUserSettings(newWorkspaceSettings, false, vscode.ConfigurationTarget.Workspace);
            }
            // Update user settings
            await delay(2000);
            const newGlobalSettingsPath = path.join(__dirname, 'data', 'global_settings.json');
            const newGlobalSettings = readJsonWithComments(newGlobalSettingsPath).json;
            await updateUserSettings(newGlobalSettings, false, vscode.ConfigurationTarget.Global);

            const isExtensionActive = context.globalState.get('isExtensionActive') || false;

            if (!isExtensionActive) {
                await delay(2000);
                context.globalState.update('isExtensionActive', true);
                console.log("Enabling APC Customize UI++");
                await vscode.commands.executeCommand('apc.extension.enable');
                console.log("APC Customize UI++ enabled successfully!");
            }

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load environment: ${error.message}`);
        } finally {
            isLoadingCompleted = true;
        }
    });

	const closeEnvironmentCommand = vscode.commands.registerCommand('envil.stop', async function () {
        try {
            showNotification('Closing ENVIL environment ...');

            closeServersAndSockets();

            await updateCustomPropertyInSettings(false);
            await updateContextKey();

            // Remove workspace settings
            if (workspaceFolder) {
                const newWorkspaceSettingsPath = path.join(__dirname, 'data', 'workspace_settings.json');
                const newWorkspaceSettings = readJsonWithComments(newWorkspaceSettingsPath).json;
                await updateUserSettings(newWorkspaceSettings, true, vscode.ConfigurationTarget.Workspace);
            }
            // Remove user settings
            await delay(2000);
            const newGlobalSettingsPath = path.join(__dirname, 'data', 'global_settings.json');
            const newGlobalSettings = readJsonWithComments(newGlobalSettingsPath).json;
            await updateUserSettings(newGlobalSettings, true, vscode.ConfigurationTarget.Global);

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to close the environment: ${error.message}`);
        } finally {
            isLoadingCompleted = true;
        }
    });

    const evaluateHydraCommand = vscode.commands.registerCommand('envil.evaluate.hydra', function () {
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

    closeServersAndSockets();

    await updateCustomPropertyInSettings(undefined);
    await updateContextKey();

    const currentWorkspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : null;
    // Remove workspace settings
    if (currentWorkspaceFolder) {
        const newWorkspaceSettingsPath = path.join(__dirname, 'data', 'workspace_settings.json');
        const newWorkspaceSettings = readJsonWithComments(newWorkspaceSettingsPath).json;
        await updateUserSettings(newWorkspaceSettings, true, vscode.ConfigurationTarget.Workspace);
    }
    // Remove user settings
    await delay(2000);
    const newGlobalSettingsPath = path.join(__dirname, 'data', 'global_settings.json');
    const newGlobalSettings = readJsonWithComments(newGlobalSettingsPath).json;
    await updateUserSettings(newGlobalSettings, true, vscode.ConfigurationTarget.Global);
	
    console.log("Disabling APC Customize UI++");
    await vscode.commands.executeCommand('apc.extension.disable');
    console.log("APC Customize UI++ disabled successfully!");
    
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

function startServersAndSockets(workspaceFolder) {
    // shut down servers if needed
    if (app || server || io) {
        closeServersAndSockets();
    }

    // create servers
    app = express();
    server = app.listen(3000, async () => {
        console.log('Express server is running at http://localhost:3000');
        // Open the URL in the default browser
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
    if (workspaceFolder) {
        app.use('/files', express.static(path.join(workspaceFolder, 'public')));
    } else {
        vscode.window.showErrorMessage("Can't serve static local files: No workspace folder is open.");
    }

    isLoadingCompleted = true;
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
        const errorMessage = `Failed to create settings file: ${err.message}`;
        console.error(errorMessage);
        vscode.window.showErrorMessage(errorMessage);
        throw errorMessage;
    }
}

function readJsonWithComments(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const errors = [];
    const json = jsonc.parse(content, errors);
    if (errors.length) {
        console.error('Error parsing JSON:', errors);
        return null;
    }
    return { json, content };
}

async function updateUserSettings(updates, deleteSettings, configurationTarget) {
    for (const [key, value] of Object.entries(updates)) {
        vscode.workspace.getConfiguration().update(key, deleteSettings ? undefined : value, configurationTarget);
    }
}

async function updateContextKey() {
    const config = vscode.workspace.getConfiguration();
    const mySetting = config.get<Boolean>(envilEnvironmentContextKey, false);
    vscode.commands.executeCommand('setContext', envilEnvironmentContextKey, mySetting);
}

async function updateCustomPropertyInSettings(value) {
    const config = vscode.workspace.getConfiguration();
    config.update(envilEnvironmentContextKey, value, vscode.ConfigurationTarget.Global);
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function checkLoadingCompletion() {
    return new Promise((resolve) => {
        const checkCondition = async () => {
            if (isLoadingCompleted) {
                await delay(9000);
                resolve();
            } else {
                // Check again after a delay
                setTimeout(checkCondition, 1000);
            }
        };
        checkCondition();
    });
}

function showNotification(message) {
    isLoadingCompleted = false;
    vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: message,
            cancellable: false,
        },
        async (progress, token) => {
            await checkLoadingCompletion();
        }
    );
}

module.exports = {
    activate,
    deactivate
}
