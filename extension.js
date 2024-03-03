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
		// vscode.window.showInformationMessage('Hello World from envil!');
		
		app.use(express.static(path.join(__dirname, 'hydrascripts')));

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
		console.log('terminal server : Client connected');
		socket.on('disconnect', () => {
			console.log('terminal server : Client disconnected');
		});
		});
	});

	let evaluate = vscode.commands.registerCommand('envil.evaluate', function () {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			const document = editor.document;
			const selection = editor.selection;
			let text = document.getText(selection);
			if (text.length === 0) {
				let lineNumber = selection.active.line;
				text = editor.document.lineAt(lineNumber).text.trim();
			}
			console.log(text);
			io.emit('new-command', {data:text});
		}
	});

	let evaluateAll = vscode.commands.registerCommand('envil.evaluateAll', function () {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			const document = editor.document;
			let text = document.getText();
			console.log(text);
			io.emit('new-command', {data:text});
		}
	});

	context.subscriptions.push(helloWorld);
	context.subscriptions.push(evaluate);
	context.subscriptions.push(evaluateAll);
}

// This method is called when your extension is deactivated
function deactivate() {
	console.log('Deactivated');
}

module.exports = {
	activate,
	deactivate
}
