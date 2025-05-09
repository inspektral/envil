// @ts-nocheck
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const express = require('express');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const jsonc = require('jsonc-parser');
const SC = require('./supercollider/lang');
const { isEnvironmentActive, envilEnvironmentContextKey } = require('./supercollider/util');

const osc = require("osc");

let hyperScopes = null;

let app = null;
let server = null;
let io = null;
let isLoadingCompleted = false;
let oscPort = null;

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {

    console.log('Activating ENVIL Extension');

    const workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : null;

    const isEnvActive = vscode.workspace.getConfiguration().get(envilEnvironmentContextKey) || false;
    if(isEnvActive){
        showNotification('Loading ENVIL environment ...');
        startServersAndSockets(workspaceFolder);
        SC.initStatusBar();
        const hyperScopesExt = vscode.extensions.getExtension('draivin.hscopes');
        hyperScopes = await hyperScopesExt.activate();
    }
  
    // This refreshes the token scope, but I don't think this is optimized.. but I haven't run into issues yet.
    vscode.window.onDidChangeActiveTextEditor(
        () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const res = hyperScopes.reloadScope(editor.document);
            console.log(res);
        }
        },
        null,
        context.subscriptions
    );

    const startSCLang = vscode.commands.registerCommand('envil.supercollider.startSCLang', SC.startSCLang);
    const stopSCLang = vscode.commands.registerCommand('envil.supercollider.stopSCLang', SC.stopSCLang);
    const toggleSCLang = vscode.commands.registerCommand('envil.supercollider.toggleSCLang', SC.toggleSCLang);
    const startSCSynth = vscode.commands.registerCommand('envil.supercollider.startSCSynth', SC.startSCSynth);
    const stopSCSynth = vscode.commands.registerCommand('envil.supercollider.stopSCSynth', SC.stopSCSynth);
    const toggleSCSynth = vscode.commands.registerCommand('envil.supercollider.toggleSCSynth', SC.toggleSCSynth);
    const evaluate = vscode.commands.registerCommand('envil.supercollider.evaluate', () => SC.evaluate(hyperScopes));
    const hush = vscode.commands.registerCommand('envil.supercollider.hush', SC.hush);
    const openSupercolliderSearch = vscode.commands.registerCommand('envil.supercollider.search', SC.openSupercolliderSearch);

    context.subscriptions.push(startSCLang, stopSCLang, toggleSCLang, startSCSynth, stopSCSynth, toggleSCSynth, evaluate, hush, openSupercolliderSearch);

    const openEnvironmentCommand = vscode.commands.registerCommand('envil.start', async function () {
		try {
            showNotification('Loading ENVIL environment ...');
            
            await updateCustomPropertyInSettings(true);

            // Update workspace settings
            if (workspaceFolder) {
                const workspaceSettingsPath = path.join(workspaceFolder, '.vscode', 'settings.json');
                await createSettingsFileIfNotExist(workspaceSettingsPath);
                const newWorkspaceSettingsPath = path.join(__dirname, 'data', 'workspace_settings.json');
                const newWorkspaceSettings = readJsonWithComments(newWorkspaceSettingsPath).json;
                await updateUserSettings(newWorkspaceSettings, false, vscode.ConfigurationTarget.Workspace);
            }
            // Update user settings
            const newGlobalSettingsPath = path.join(__dirname, 'data', 'global_settings.json');
            const newGlobalSettings = readJsonWithComments(newGlobalSettingsPath).json;
            await updateUserSettings(newGlobalSettings, false, vscode.ConfigurationTarget.Global);

            const HasEnvilExtensionAlreadyBeenActivated = context.globalState.get('HasEnvilExtensionAlreadyBeenActivated') || false;

            if (!HasEnvilExtensionAlreadyBeenActivated) {
                context.globalState.update('HasEnvilExtensionAlreadyBeenActivated', true);
                const config = vscode.workspace.getConfiguration();
                config.update("custom-ui-style.reloadWithoutPrompting", true, vscode.ConfigurationTarget.Global);
            }

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load environment: ${error.message}`);
        } finally {
            isLoadingCompleted = true;
            // await vscode.commands.executeCommand('custom-ui-style.reload');
        }
    });

	const closeEnvironmentCommand = vscode.commands.registerCommand('envil.stop', async function () {
        try {
            showNotification('Closing ENVIL environment ...');

            closeServersAndSockets();

            await updateCustomPropertyInSettings(false);

            // Remove workspace settings
            if (workspaceFolder) {
                const newWorkspaceSettingsPath = path.join(__dirname, 'data', 'workspace_settings.json');
                const newWorkspaceSettings = readJsonWithComments(newWorkspaceSettingsPath).json;
                await updateUserSettings(newWorkspaceSettings, true, vscode.ConfigurationTarget.Workspace);
            }
            // Remove user settings
            const newGlobalSettingsPath = path.join(__dirname, 'data', 'global_settings.json');
            const newGlobalSettings = readJsonWithComments(newGlobalSettingsPath).json;
            await updateUserSettings(newGlobalSettings, true, vscode.ConfigurationTarget.Global);

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to close the environment: ${error.message}`);
        } finally {
            isLoadingCompleted = true;
            // await vscode.commands.executeCommand('custom-ui-style.reload');
        }
    });

    const evaluateHydraCommand = vscode.commands.registerCommand('envil.hydra.evaluate', function () {

        if(!isEnvironmentActive()){
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (editor) {
            let command = "";
            const document = editor.document;
            const selection = editor.selection;
            let text = document.getText(selection);
            text = text.length === 0 ? document.getText() : text;
            const lines = text.split('\n');
            for (const currentLine of lines) {
                let line = currentLine;
                if (line.trimStart().startsWith('//')) {
                    line = "";
                }
                // local files handling
                if (line.includes('local/files/')) {
                    line = line.replace("local/files/", "http://localhost:3000/files/");
                }
                if (line !== "") {
                    command = command + line;
                    if (line.trimEnd().endsWith(";")) {
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

    const currentWorkspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : null;
    // Remove workspace settings
    if (currentWorkspaceFolder) {
        const newWorkspaceSettingsPath = path.join(__dirname, 'data', 'workspace_settings.json');
        const newWorkspaceSettings = readJsonWithComments(newWorkspaceSettingsPath).json;
        await updateUserSettings(newWorkspaceSettings, true, vscode.ConfigurationTarget.Workspace);
    }
    // Remove user settings
    const newGlobalSettingsPath = path.join(__dirname, 'data', 'global_settings.json');
    const newGlobalSettings = readJsonWithComments(newGlobalSettingsPath).json;
    await updateUserSettings(newGlobalSettings, true, vscode.ConfigurationTarget.Global);

    await SC.stopSCLang();
	
    const config = vscode.workspace.getConfiguration();
    config.update("custom-ui-style.reloadWithoutPrompting", undefined, vscode.ConfigurationTarget.Global);
    console.log("Disabling Custom UI Style extension");
    await vscode.commands.executeCommand('custom-ui-style.rollback');
    console.log("Custom UI Style extension disabled successfully!");

    context.globalState.update('HasEnvilExtensionAlreadyBeenActivated', false);
    
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
    if (oscPort) {
        oscPort.close();
    }
}

function startServersAndSockets(workspaceFolder) {
    // shut down servers if needed
    if (app || server || io || oscPort) {
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
    oscPort = new osc.UDPPort({
        localAddress: "localhost",
        localPort: 3002
    });
    oscPort.open();
    oscPort.on("message", (oscMsg) => {
        console.debug("Received OSC message from Supercollider:", oscMsg);
        if (io) {
            io.sockets.emit('new-command', { data: oscMsg.args[0] });
        }
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
    var config = vscode.workspace.getConfiguration();
    for (const [key, value] of Object.entries(updates)) {
        config.update(key, deleteSettings ? undefined : value, configurationTarget);
    }
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
                await delay(3500);
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
