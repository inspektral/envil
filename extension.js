// @ts-nocheck
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const express = require('express');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');
const jsonc = require('jsonc-parser');

let app;
let server;
let io;
const envilEnvironmentContextKey = 'envil.environment.active';

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {

    console.log('Activating ENVIL Extension');

    const openEnvironmentCommand = vscode.commands.registerCommand('envil.start', async function () {
		try {
            updateCustomPropertyInSettings(undefined);
            const workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : null;
            // Update workspace settings
            if (workspaceFolder) {
                const workspaceSettingsPath = path.join(workspaceFolder, '.vscode', 'settings.json');
                await createSettingsFileIfNotExist(workspaceSettingsPath);
                const newWorkspaceSettingsPath = path.join(__dirname, 'data', 'workspace_settings.json');
                const newWorkspaceSettings = readJsonWithComments(newWorkspaceSettingsPath).json;
                if (fs.existsSync(workspaceSettingsPath) && 
                    areEnvironmentSettingsNotPresent(fs.readFileSync(workspaceSettingsPath, 'utf-8'))) {
                        addSettingsWithPlaceholders(workspaceSettingsPath, newWorkspaceSettings);
                }
            }
            // Update user settings
            const globalSettingsPath = getGlobalSettingsPath();
            const newGlobalSettingsPath = path.join(__dirname, 'data', 'global_settings.json');
            const newGlobalSettings = readJsonWithComments(newGlobalSettingsPath).json;
            if (fs.existsSync(globalSettingsPath) && 
                areEnvironmentSettingsNotPresent(fs.readFileSync(globalSettingsPath, 'utf-8'))) {
                    addSettingsWithPlaceholders(globalSettingsPath, newGlobalSettings);
            }

            await delay(2000);

            updateCustomPropertyInSettings(true);
            updateContextKey();

            // shut down servers if needed
            if (app || server || io) {
                closeServersAndSockets();
            }

            // create servers
            app = express();
            server = app.listen(3000, async () => {
                console.log('Express server is running at http://localhost:3000');
                // Open the URL in the default browser
                // vscode.env.openExternal(vscode.Uri.parse('http://localhost:3000'));
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

            await delay(7000);

            console.log("Enabling APC Customize UI++");

            await vscode.commands.executeCommand('apc.extension.enable');

            console.log("APC Customize UI++ enabled successfully!");

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load environment: ${error.message}`);
        }
    });

	const closeEnvironmentCommand = vscode.commands.registerCommand('envil.stop', async function () {
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
            closeServersAndSockets();

            await delay(2000);

            updateCustomPropertyInSettings(undefined);
            updateContextKey();

            await delay(7000);

            console.log("Disabling APC Customize UI++");

            await vscode.commands.executeCommand('apc.extension.disable');

            console.log("APC Customize UI++ disabled successfully!");

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to close the environment: ${error.message}`);
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

    const config = vscode.workspace.getConfiguration();
    await config.update(envilEnvironmentContextKey, undefined, vscode.ConfigurationTarget.Global);
    closeServersAndSockets();

    await delay(3000);
	
    vscode.commands.executeCommand('apc.extension.disable');
    
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
        const errorMessage = `Failed to create settings file: ${err.message}`;
        console.error(errorMessage);
        vscode.window.showErrorMessage(errorMessage);
        throw errorMessage;
    }
}

function getGlobalSettingsPath() {
    const vscodeSettingsFolder = process.platform === 'win32' ? 'AppData/Roaming/Code/User' : '.config/Code/User';
    const homeDir = os.homedir();
    return path.join(homeDir, vscodeSettingsFolder, 'settings.json');
}

function addSettingsWithPlaceholders(settingsPath, newSettings) {
    try {
        updateJsonWithComments(settingsPath, newSettings);
    } catch (err) {
        const errorMessage = `Failed to add settings to ${settingsPath} file: ${err.message}`;
        console.error(errorMessage);
        vscode.window.showErrorMessage(errorMessage);
        throw err;
    }
}

async function removeSettingsWithPlaceholders(settingsPath) {
    try {
        const settingsContent = fs.readFileSync(settingsPath, 'utf-8');
        // Remove custom settings between placeholders
        const updatedContent = settingsContent.replace(/\/\/ BEGIN: ENVIL Extension Settings[\s\S]*?\/\/ END: ENVIL Extension Settings/, '');
        // Remove the comma after the last property inside the root of the JSON content
        const cleanedContent = updatedContent.replace(/,(?=\s*[\r\n]*\})/, '');
        // Remove the empty line after the last property
        const finalContent = cleanedContent.replace(/\n\s*\n\s*(?=\})/, '\n');
        // Write updated settings
        fs.writeFileSync(settingsPath, finalContent.trim());
    } catch (err) {
        const errorMessage = `Failed to remove settings from ${settingsPath} file: ${err.message}`;
        console.error(errorMessage);
        vscode.window.showErrorMessage(errorMessage);
        throw err;
    }
}

function areEnvironmentSettingsNotPresent(settingsContent) {
    const regex = /\/\/ BEGIN: ENVIL Extension Settings[\s\S]*?\/\/ END: ENVIL Extension Settings/;
    return !regex.test(settingsContent);
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

function addPlaceholdersAndSettings(content, updates, startComment, endComment) {
    // Check if the last character before the closing bracket is a comma
    const needsComma = content.match(/"[^"]+"\s*:\s*"[^"]+"(?:\s*,\s*)?(\n*\s*\})/);

    // Insert start comment before the closing bracket
    let updatedContent = content.replace(/(\s*\})$/, `${needsComma ? ',' : ''}\n\t${startComment}\n$1`);

    // Add each key-value pair from updates
    const updateEntries = Object.entries(updates);
    updateEntries.forEach(([key, value], index) => {
        // Add a comma if not the last entry in updates
        const comma = index === updateEntries.length - 1 ? '' : ',';
        // Convert key-value pair to string
        const entryString = `    "${key}": ${JSON.stringify(value, null, 4).replace(/\n/g, '\n    ')}${comma}`;
        // Insert the entry before the closing bracket
        updatedContent = updatedContent.replace(/(\n*\s*\})$/, `\n${entryString}$1`);
    });

    // Insert end comment after the last update and before the closing bracket
    updatedContent = updatedContent.replace(/(\n*\s*\})$/, `\n\t${endComment}\n$1`);

    // Remove empty lines between the last comment and the closing bracket
    updatedContent = updatedContent.replace(/\n*(\s*\})$/, '\n$1');

    return updatedContent;
}

function updateJsonWithComments(filePath, updates) {
    const startComment = "// BEGIN: ENVIL Extension Settings";
    const endComment = "// END: ENVIL Extension Settings"
    let { json, content } = readJsonWithComments(filePath);
    if (json === null || content === '') {
        content = '{}';
    }
    const updatedContent = addPlaceholdersAndSettings(content, updates, startComment, endComment);
    fs.writeFileSync(filePath, updatedContent, 'utf-8');
}

async function updateContextKey() {
    const config = vscode.workspace.getConfiguration();
    const mySetting = config.get<Boolean>(envilEnvironmentContextKey, false);
    await vscode.commands.executeCommand('setContext', envilEnvironmentContextKey, mySetting);
}

async function updateCustomPropertyInSettings(value) {
    const config = vscode.workspace.getConfiguration();
    await config.update(envilEnvironmentContextKey, value, vscode.ConfigurationTarget.Global);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    activate,
    deactivate
}
