// @ts-nocheck
const vscode = require('vscode');
const { flashHighlight, stringifyError, getDefaultSCLangExecutable, isEnvironmentActive } = require('./util');
const Lang = require('supercolliderjs').lang.default;

const postWindow = vscode.window.createOutputChannel('ENVIL - SC PostWindow');

let lang = null;
let server = null;

const sclangStatusBar = vscode.window.createStatusBarItem('sclangStatus', 2);

const SCLANG_STATUS_BAR = 'sclang';
const SCLANG_STATUS_BAR_OFF = `${SCLANG_STATUS_BAR} ⭕`;
const SCLANG_STATUS_BAR_ON = `${SCLANG_STATUS_BAR} 🟢`;
sclangStatusBar.text = SCLANG_STATUS_BAR_OFF;
sclangStatusBar.command = 'envil.supercollider.toggleSCLang';
sclangStatusBar.tooltip = 'Click to boot or quit the SuperCollider interpreter';

const scsynthStatusBar = vscode.window.createStatusBarItem('scsynthStatus', 2);

const SCSYNTH_STATUS_BAR = 'scsynth';
const SCSYNTH_STATUS_BAR_OFF = `${SCSYNTH_STATUS_BAR} ⭕`;
const SCSYNTH_STATUS_BAR_ON = `${SCSYNTH_STATUS_BAR} 🟢`;
scsynthStatusBar.text = SCSYNTH_STATUS_BAR_OFF;
scsynthStatusBar.command = 'envil.supercollider.toggleSCSynth';
scsynthStatusBar.tooltip = 'Click to boot or quit the SuperCollider server';

function initStatusBar() {
  sclangStatusBar.show();
  scsynthStatusBar.show();
}

function closeStatusBar() {
  sclangStatusBar.hide();
  scsynthStatusBar.hide();
}

async function startSCLang() {

  if(!isEnvironmentActive()){
    return;
  }
  
  const configuration = vscode.workspace.getConfiguration();
  const scLangPath = configuration.get('envil.supercollider.sclang.cmd');
  const confFile = configuration.get('envil.supercollider.sclang.sclang_conf');

  if (lang) {
    postWindow.appendLine('there is already an instance of sclang running');
    return;
  }

  postWindow.appendLine('Booting sclang');

  try {
    lang = new Lang({
      sclang: scLangPath || getDefaultSCLangExecutable(),
      sclang_conf: confFile || undefined,
      failIfSclangConfIsMissing: confFile ? true : false,
    });

    lang.on('stdout', (message) => {
      if (message == '\n') return;
      postWindow.append(message);
    });

    lang.on('stderr', (message) => postWindow.append(message.trim()));

    // Could probably conditional this based on a user config
    postWindow.show();

    await lang.boot();

    postWindow.appendLine('Successfully booted sclang');

    sclangStatusBar.text = SCLANG_STATUS_BAR_ON;
    sclangStatusBar.show();

    await startSCSynth();

  } catch (err) {
    lang = null;
    postWindow.appendLine('Error booting sclang');
    postWindow.appendLine(err);
    console.error(err);
  }
}

async function stopSCLang() {

  if(!isEnvironmentActive()){
    return;
  }
  
  await stopSCSynth();
  try {
    await lang.quit();
    lang = null;
    sclangStatusBar.text = SCLANG_STATUS_BAR_OFF;
  } catch (err) {
    postWindow.appendLine(err);
    console.error(err);
  }
  sclangStatusBar.show();
}

async function toggleSCLang() {

  if (lang === null) {
    startSCLang();
  } else {
    stopSCLang();
  }
}

async function startSCSynth() {

  if(!isEnvironmentActive()){
    return;
  }
    
  if(!lang) {
    postWindow.appendLine('sclang not started, cannot boot scsynth');
    return;
  }
  if(server) {
    postWindow.appendLine('there is already an instance of scsynth running');
    return;
  }
  try {
    postWindow.appendLine('Booting scsynth');
    server = await lang.interpret('s.boot', null, true, false);
    console.log(server);
    postWindow.appendLine(server);

    scsynthStatusBar.text = SCSYNTH_STATUS_BAR_ON;
    postWindow.appendLine('Successfully booted scsynth');
  } catch (err) {
    postWindow.appendLine('Error booting scsynth');
    postWindow.appendLine(err);
    console.error(err);

    scsynthStatusBar.text = SCSYNTH_STATUS_BAR_OFF;
  } finally {
    scsynthStatusBar.show();
  }
}

async function stopSCSynth() {

  if(!isEnvironmentActive()){
    return;
  }

  try {
    await lang.interpret('Server.killAll');
    server = null;
    scsynthStatusBar.text = SCSYNTH_STATUS_BAR_OFF;
  } catch (err) {
    postWindow.appendLine(err);
    console.error(err);
  }
  scsynthStatusBar.show();
}

async function toggleSCSynth() {

  if (server === null) {
    startSCSynth();
  } else {
    stopSCSynth();
  }
}

async function evaluate(hyperScopes) {

  if(!isEnvironmentActive()){
    return;
  }

  if (!lang) {
    const error = 'sclang not started, cannot evaluate supercollider code';
    console.error(error);
    postWindow.appendLine(error);
    return;
  }

  const editor = vscode.window.activeTextEditor;
  const selection = editor.selection;

  if (selection && !selection.isEmpty) {
    evaluateSelection(selection);
  } else {
    evaluateRegion(hyperScopes);
  }
}

async function hush() {

  if(!isEnvironmentActive()){
    return;
  }

  if (!lang) {
    const error = 'sclang not started, cannot hush';
    postWindow.appendLine(error);
    console.error(error);
    return;
  }
  try {
    const result = await lang.interpret('CmdPeriod.run', null, true, false);
    postWindow.appendLine(result.trim());
  } catch (err) {
    postWindow.appendLine(err);
    console.error(err);
  }
}

async function evaluateSelection(selection) {
  const selectionRange = new vscode.Range(
    selection.start.line,
    selection.start.character,
    selection.end.line,
    selection.end.character
  );

  const editor = vscode.window.activeTextEditor;
  const highlighted = editor.document.getText(selectionRange);

  try {
    const result = await lang.interpret(highlighted, null, true, false);
    postWindow.appendLine(result.trim());
    flashHighlight(vscode.window.activeTextEditor, selectionRange);
  } catch (err) {
    postWindow.appendLine(err);
    console.error(err);
  }
}

async function evaluateRegion(hyperScopes) {
  const editor = vscode.window.activeTextEditor;
  const ranges = []
  let brackets = 0;

  // Get the total line count of the open script
  const lineCount = vscode.window.activeTextEditor.document.lineCount;

  // For every line, get the text of that line as a string.
  for (let i = 0; i < lineCount; i++) {
      const { text } = vscode.window.activeTextEditor.document.lineAt(i);

      // for every character on the line, check to see if it's a parent
      for (let j = 0; j < text.length; j++) {
          const char = text.charAt(j);

          // not totally sure about this --
          // it has been hastily ported it from hadron editor so I still gotta learn how it works.
          const { scopes } = hyperScopes.getScopeAt(editor.document, new vscode.Position(i, j));
          const scopesLength = scopes.length - 1;
          const lastScope = scopes[scopesLength];
          if (
              lastScope === 'comment.single.supercollider' ||
              lastScope === 'comment.multiline.supercollider' ||
              lastScope === 'string.quoted.double.supercollider' ||
              lastScope === 'entity.name.symbol.supercollider' ||
              lastScope === 'constant.character.escape.supercollider'
          ) {
              continue;
          }

          // gather the bracket ranges
          if (char === '(' && brackets++ === 0) {
              ranges.push([i])
          } else if (char === ')' && --brackets === 0) {
              ranges[ranges.length - 1].push(i)
          }
      }
  }
  // Get where the current cursor is
  const position = vscode.window.activeTextEditor.selection.active;

  // not totally sure about this --
  // it has been hastily ported it from hadron editor so I still gotta learn how it works.
  const range = ranges.find((range) => {
      return range[0] <= position.c && position.c <= range[1]
  });

  const { text } = vscode.window.activeTextEditor.document.lineAt(range[1]);
  const lastLineLength = text.length;

  const selectionRange = new vscode.Range(
      range[0],
      0, // will need to calculate ... because what if the paren is not the first char on the line? does that matter?
      range[1],
      lastLineLength
  );
  const highlighted = editor.document.getText(selectionRange);


  try {
      const result = await lang.interpret(highlighted, null, true, true, true);
      console.log(result);
      postWindow.appendLine(result.trim());
      flashHighlight(vscode.window.activeTextEditor, selectionRange);
  }
  catch (err) {
      const errString = stringifyError(err);
      postWindow.appendLine(errString);
      console.error(errString);
  }
}

async function openSupercolliderSearch() {
  if (!isEnvironmentActive()) {
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'supercolliderSearch',
    'SuperCollider Search',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true
    }
  );

  panel.webview.html = getWebviewContent();
}

function getWebviewContent() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>SuperCollider Search</title>
      <style>
        body, html {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
        }
        iframe {
          width: 100%;
          height: 100%;
          border: none;
        }
      </style>
    </head>
    <body>
      <iframe id="searchFrame" src="https://docs.supercollider.online/Search.html"></iframe>
    </body>
    </html>
  `;
}

module.exports = {
  initStatusBar,
  closeStatusBar,
  startSCLang,
  stopSCLang,
  toggleSCLang,
  startSCSynth,
  stopSCSynth,
  toggleSCSynth,
  evaluate,
  hush,
  openSupercolliderSearch
};
