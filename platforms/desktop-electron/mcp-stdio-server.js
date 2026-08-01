#!/usr/bin/env node
const net = require('node:net');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const PROTOCOL_VERSION = '2025-11-25';
const SERVER_INFO = { name: 'timewhere-desktop-mcp', version: '0.1.0' };

function defaultBridgePath() {
  if (process.env.TIMEWHERE_MCP_BRIDGE_PATH) return process.env.TIMEWHERE_MCP_BRIDGE_PATH;
  const seed = process.env.TIMEWHERE_MCP_BRIDGE_SEED || path.resolve(__dirname, '..', '..');
  const hash = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
  if (process.platform === 'win32') return `\\\\.\\pipe\\timewhere-mcp-${hash}`;
  return path.join(os.tmpdir(), `timewhere-mcp-${hash}.sock`);
}

const TASK_SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    plan_id: {},
    bucket_id: {},
    start_date: { type: ['string', 'null'] },
    due_date: { type: ['string', 'null'] },
    schedule_time: { type: ['string', 'null'] },
    duration: { type: 'number' },
    priority: { type: 'string' },
    progress: { type: 'string' },
    source: { type: 'string' },
    readonly: { type: 'boolean' },
    notes: { type: 'string' }
  }
};

const TOOLS = [
  {
    name: 'timewhere_tasks_list',
    description: 'List tasks in the current TimeWhere Desktop active profile.',
    inputSchema: {
      type: 'object',
      properties: {
        progress: { type: 'string', enum: ['not_started', 'in_progress', 'completed'] },
        date_from: { type: 'string' },
        date_to: { type: 'string' },
        plan_id: {},
        source: { type: 'string' },
        limit: { type: 'number' }
      }
    }
  },
  {
    name: 'timewhere_task_get',
    description: 'Get one task from the current TimeWhere Desktop active profile.',
    inputSchema: { type: 'object', required: ['task_id'], properties: { task_id: { type: 'string' } } }
  },
  {
    name: 'timewhere_task_create',
    description: 'Create a manual task in the current TimeWhere Desktop active profile.',
    inputSchema: {
      type: 'object',
      required: ['title', 'due_date', 'idempotency_key'],
      properties: {
        title: { type: 'string' },
        due_date: { type: 'string' },
        start_date: { type: 'string' },
        plan_id: {},
        bucket_id: {},
        schedule_time: { type: 'string' },
        duration: { type: 'number' },
        priority: { type: 'string', enum: ['urgent', 'important', 'medium', 'low', 'P1', 'P2', 'P3', 'P4'] },
        notes: { type: 'string' },
        description: { type: 'string' },
        checklist: { type: 'array' },
        labels: { type: 'array' },
        idempotency_key: { type: 'string' }
      }
    }
  },
  {
    name: 'timewhere_task_update',
    description: 'Update allowed local task fields in the current TimeWhere Desktop active profile.',
    inputSchema: {
      type: 'object',
      required: ['task_id', 'patch', 'idempotency_key'],
      properties: { task_id: { type: 'string' }, patch: { type: 'object' }, idempotency_key: { type: 'string' } }
    }
  },
  {
    name: 'timewhere_task_delete',
    description: 'Delete a task after explicit user confirmation.',
    inputSchema: {
      type: 'object',
      required: ['task_id', 'user_confirmed', 'idempotency_key'],
      properties: { task_id: { type: 'string' }, user_confirmed: { type: 'boolean' }, idempotency_key: { type: 'string' } }
    }
  },
  {
    name: 'timewhere_task_start',
    description: 'Mark a task in progress.',
    inputSchema: { type: 'object', required: ['task_id', 'idempotency_key'], properties: { task_id: { type: 'string' }, idempotency_key: { type: 'string' } } }
  },
  {
    name: 'timewhere_task_complete',
    description: 'Mark a task completed.',
    inputSchema: { type: 'object', required: ['task_id', 'idempotency_key'], properties: { task_id: { type: 'string' }, idempotency_key: { type: 'string' } } }
  },
  {
    name: 'timewhere_task_reopen',
    description: 'Reopen a task as not started.',
    inputSchema: { type: 'object', required: ['task_id', 'idempotency_key'], properties: { task_id: { type: 'string' }, idempotency_key: { type: 'string' } } }
  }
];

let boundProfileId = null;

function encodeMessage(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'), body]);
}

function writeMessage(message) {
  process.stdout.write(encodeMessage(message));
}

function parseFrames() {
  let buffer = Buffer.alloc(0);
  return chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    const messages = [];
    while (true) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) break;
      const header = buffer.slice(0, headerEnd).toString('ascii');
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) throw new Error('Missing Content-Length header');
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (buffer.length < bodyEnd) break;
      messages.push(JSON.parse(buffer.slice(bodyStart, bodyEnd).toString('utf8')));
      buffer = buffer.slice(bodyEnd);
    }
    return messages;
  };
}

function bridgeRequest(payload, timeoutMs = 15000) {
  const bridgePath = defaultBridgePath();
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(bridgePath);
    let data = '';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('TimeWhere Desktop MCP bridge timed out'));
    }, timeoutMs);
    socket.on('connect', () => socket.write(`${JSON.stringify(payload)}\n`));
    socket.on('data', chunk => {
      data += chunk.toString('utf8');
      const index = data.indexOf('\n');
      if (index < 0) return;
      clearTimeout(timer);
      socket.end();
      const message = JSON.parse(data.slice(0, index));
      if (message.error) {
        const error = new Error(message.error.message || 'TimeWhere Desktop MCP bridge failed');
        error.code = message.error.code;
        error.data = message.error.data;
        reject(error);
      } else {
        resolve(message.result);
      }
    });
    socket.on('error', error => {
      clearTimeout(timer);
      const next = new Error(`TimeWhere Desktop is not available: ${error.message}`);
      next.code = 'desktop_not_ready';
      reject(next);
    });
  });
}

function toolContent(result) {
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result };
}

async function handleRequest(message) {
  const { id, method, params = {} } = message;
  if (method === 'initialize') {
    const profile = await bridgeRequest({ type: 'profile' }).catch(() => null);
    boundProfileId = profile?.profile_id || null;
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: params.protocolVersion || PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions: 'Use TimeWhere task tools only for the current TimeWhere Desktop active profile.'
      }
    };
  }
  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  }
  if (method === 'tools/call') {
    const result = await bridgeRequest({
      type: 'tool_call',
      tool: params.name,
      arguments: params.arguments || {},
      profile_id: boundProfileId
    });
    return { jsonrpc: '2.0', id, result: toolContent(result) };
  }
  if (method?.startsWith('notifications/')) return null;
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unsupported MCP method: ${method}` } };
}

function startStdioServer() {
  const parse = parseFrames();
  process.stdin.on('data', chunk => {
    let messages;
    try {
      messages = parse(chunk);
    } catch (error) {
      writeMessage({ jsonrpc: '2.0', id: null, error: { code: -32700, message: error.message } });
      return;
    }
    for (const message of messages) {
      handleRequest(message)
        .then(response => { if (response) writeMessage(response); })
        .catch(error => writeMessage({
          jsonrpc: '2.0',
          id: message.id ?? null,
          error: {
            code: -32000,
            message: error.message || 'TimeWhere MCP request failed',
            data: {
              reason: error.code || 'timewhere_mcp_error',
              ...(error.data || {})
            }
          }
        }));
    }
  });
}

if (require.main === module) {
  startStdioServer();
}

module.exports = { TOOLS, TASK_SUMMARY_SCHEMA, defaultBridgePath, encodeMessage, parseFrames, startStdioServer };