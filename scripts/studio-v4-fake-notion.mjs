// ENG-160 v4 local-only notion-read fixture. No real Notion host, credential or ticket is used.
import { createServer } from 'node:http';

const rt = (value = '') => ({ type: 'rich_text', rich_text: value ? [{ plain_text: value }] : [] });
const page = (id, status, title) => ({
  object: 'page', id, url: `http://127.0.0.1:4320/pages/${id}`, last_edited_time: '2026-11-08T00:00:00.000Z', archived: false, in_trash: false,
  properties: {
    编号: { type: 'rich_text', rich_text: [{ plain_text: id }] },
    工单: { type: 'title', title: [{ plain_text: title }] },
    状态: { type: 'select', select: { name: status } },
    优先级: { type: 'select', select: { name: 'P1' } },
    提出人: { type: 'select', select: { name: 'COO' } },
    被挡在哪: rt(status === '被挡住' ? '本地只读阻塞样例' : ''),
    'Engineer 回报': rt(status === '待验收' ? '本地只读验收样例' : ''),
    工作室锁: rt(''),
    期限: { type: 'date', date: { start: '2026-11-09' } },
  },
});
const fixture = [
  page('SIM-READ-901', '进行中', '只读｜进行中的本地工单'),
  page('SIM-READ-902', '被挡住', '只读｜被挡住的本地工单'),
  page('SIM-READ-903', '待验收', '只读｜待验收的本地工单'),
];
const server = createServer(async (req, res) => {
  for await (const chunk of req) void chunk;
  const isQuery = req.method === 'POST' && (req.url?.startsWith('/v1/data_sources/') || req.url?.startsWith('/v1/databases/')) && req.url.endsWith('/query');
  res.writeHead(isQuery ? 200 : 405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(isQuery
    ? { object: 'list', results: fixture, has_more: false, next_cursor: null }
    : { object: 'error', code: 'local_fixture_only', message: 'Only local query fixtures are allowed' }));
});
server.listen(4320, '127.0.0.1', () => console.log('Local notion-read fixture: http://127.0.0.1:4320 (synthetic data only)'));
