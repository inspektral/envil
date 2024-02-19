// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

const express = require('express');
const app = express();
const path = require('path');

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('envil activated!');
	
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	let helloWorld = vscode.commands.registerCommand('envil.helloWorld', function () {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from envil!');
		
		app.use(express.static(path.join(__dirname, 'hydrascripts')));

		app.listen(3000, () => {
			console.log('Server is running at http://localhost:3000');
		});
	});

	let evaluate = vscode.commands.registerCommand('envil.evaluate', function () {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			const document = editor.document;
			const selection = editor.selection;
			let text = document.getText(selection);
			if (text.length === 0) {
				text = document.getText();
			}
			console.log(text);
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
