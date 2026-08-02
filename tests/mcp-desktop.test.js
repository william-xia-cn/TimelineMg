/**
 * TimeWhere Desktop MCP contract tests.
 * Run: node tests/mcp-desktop.test.js
 */

const fs = require('fs');
const path = require('path');
const McpServer = require('../platforms/desktop-electron/mcp-stdio-server.js');

const root = path.join(__dirname, '..');
let passed = 0;
let failed = 0;

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

function assert(desc, condition) {
    if (condition) {
        passed++;
        console.log(`  PASS ${desc}`);
    } else {
        failed++;
        console.log(`  FAIL ${desc}`);
    }
}

function assertEqual(desc, got, expected) {
    assert(`${desc} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(expected));
}

console.log('\nTimeWhere Desktop MCP contract tests\n' + '='.repeat(44));

const toolNames = McpServer.TOOLS.map(tool => tool.name).sort();
assertEqual('MCP exposes expected task CRUD tools', toolNames, [
    'timewhere_task_complete',
    'timewhere_task_create',
    'timewhere_task_delete',
    'timewhere_task_get',
    'timewhere_task_reopen',
    'timewhere_task_start',
    'timewhere_task_update',
    'timewhere_tasks_list'
]);

const createTool = McpServer.TOOLS.find(tool => tool.name === 'timewhere_task_create');
const deleteTool = McpServer.TOOLS.find(tool => tool.name === 'timewhere_task_delete');
assert('create tool requires title due_date and idempotency', ['title', 'due_date', 'idempotency_key'].every(key => createTool.inputSchema.required.includes(key)));
assert('delete tool requires confirmation and idempotency', ['task_id', 'user_confirmed', 'idempotency_key'].every(key => deleteTool.inputSchema.required.includes(key)));
assert('stdio adapter uses Content-Length framing', McpServer.encodeMessage({ jsonrpc: '2.0', id: 1, result: {} }).toString('utf8').startsWith('Content-Length:'));

const parser = McpServer.parseFrames();
const encoded = McpServer.encodeMessage({ jsonrpc: '2.0', id: 7, method: 'tools/list' });
assertEqual('stdio parser decodes one framed message', parser(encoded)[0].id, 7);
assert('bridge path is local pipe or unix socket', /timewhere-mcp/.test(McpServer.defaultBridgePath()));

const electronMain = read('platforms/desktop-electron/main.js');
const preload = read('platforms/desktop-electron/preload.js');
const electronPackage = JSON.parse(read('platforms/desktop-electron/package.json'));
const registerScript = read('tools/register-timewhere-mcp.ps1');
const mdpDoc = read('docs/MDP_AGENT_INTERFACE.md');
const desktopReadme = read('platforms/desktop-electron/README.md');
assert('Electron main starts a local MCP bridge socket', electronMain.includes('startMcpBridgeServer()') && electronMain.includes('net.createServer'));
assert('Electron main routes MCP tool calls to renderer and checks profile changes', electronMain.includes("message.type === 'tool_call'") && electronMain.includes('profile_changed'));
assert('Electron main returns desktop_not_ready when renderer bridge is unavailable', electronMain.includes('desktop_not_ready') && electronMain.includes('mcpRendererReady'));
assert('Electron preload exposes MCP request response bridge only through contextBridge', preload.includes('onMcpRequest(callback)') && preload.includes('replyMcpRequest(payload') && preload.includes('markMcpRendererReady'));
assert('Electron package ships stdio MCP server and script', electronPackage.scripts['mcp:stdio'] === 'node mcp-stdio-server.js' && electronPackage.build.files.includes('mcp-stdio-server.js'));
assert('Codex registration script registers standard TimeWhere MCP server', registerScript.includes('mcp add') && registerScript.includes('timewhere_desktop_mcp') && registerScript.includes('D:\\Codex\\ThmeWhere-Master') && registerScript.includes('mcp-stdio-server.js'));
assert('MCP documentation explains global registration and standard read call', mdpDoc.includes('timewhere-desktop-mcp') && mdpDoc.includes('timewhere_desktop_mcp') && mdpDoc.includes('tools/register-timewhere-mcp.ps1') && mdpDoc.includes('timewhere_tasks_list'));
assert('Desktop README points agent access to registered MCP server', desktopReadme.includes('register the Desktop MCP server once') && desktopReadme.includes('timewhere-desktop-mcp'));

for (const html of [
    'extension/pages/focus/focus.html',
    'extension/pages/tasks/tasks.html',
    'extension/pages/calendar/calendar.html',
    'extension/pages/settings/settings.html'
]) {
    const source = read(html);
    assert(`${html} loads MDP and renderer MCP bridge`, source.includes('mdp-agent-interface.js') && source.includes('mcp-renderer-bridge.js'));
}

console.log('\n' + '='.repeat(44));
console.log(`Total: ${passed + failed} checks   PASS ${passed}   ${failed > 0 ? 'FAIL' : 'PASS'} ${failed}`);
if (failed > 0) process.exit(1);