// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

const express = require('express');
const app = express();
const path = require('path');

const { createServer } = require('node:http');
const { Server } = require('socket.io');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	console.log('envil activated!');
	let io;

	let helloWorld = vscode.commands.registerCommand('envil.helloWorld', function () {

		app.use(express.static(path.join(__dirname, 'hydrascripts')));

		// Serve static files from the 'public' directory
		app.use('/images', express.static(path.join(__dirname, 'public')));

		app.listen(3000, () => {
			console.log('Server is running at http://localhost:3000');
			vscode.env.openExternal(vscode.Uri.parse('http://localhost:3000'));
		});

		io = new Server(3001, {
		cors: {
			origin: '*',
		}
		});

		io.on('connection', (socket) => {
		console.log('socket : Client connected');
		socket.on('disconnect', () => {
			console.log('socket : Client disconnected');
		});
		});
	});

	let evaluate = vscode.commands.registerCommand('envil.evaluate.hydra', function () {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			let command = "";
			const document = editor.document;
			const selection = editor.selection;
			let text = document.getText(selection);
			text = text.length === 0 ? document.getText() : text;
			const lines = text.split('\n');
			for (let line of lines) {
				if(!line.includes('://') && line.includes('//')) {
					line = "";
				}
				// local images handling
				if(line.includes('local/images/')) {
					line = line.replace("local/images/", "http://localhost:3000/images/");
				}
				if(line == "cls") {
					console.clear();
				} else if(line != ""){
					command = command + line;
					if(line.endsWith(';')) {
						// send command to client
						console.log("\n\n");
						io.sockets.emit('new-command', { data: command});
						command = "";
					}
				}
			}
		}
	});

	context.subscriptions.push(helloWorld);
	context.subscriptions.push(evaluate);
}

// This method is called when your extension is deactivated
function deactivate() {
	console.log('Deactivated');
}

module.exports = {
	activate,
	deactivate
}
