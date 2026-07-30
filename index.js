const express = require('express');
const app = express();

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const API_KEY = process.env.API_KEY || 'shenyu2026';
const MEMORY_DB = process.env.MEMORY_DB || '3adf4213146880a98f62c8c28197cb4e';
const DIARY_DB = process.env.DIARY_DB || '';

function auth(req, res, next) {
  const key = req.query.key || req.headers['x-api-key'];
  if (key !== API_KEY) return res.status(401).json({ error: 'unauthorized' });
  next();
}

async function notion(endpoint, method, body) {
  const r = await fetch(`https://api.notion.com/v1${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return r.json();
}

// ===== 长期记忆 =====
app.get('/api/memory/list', auth, async (req, res) => {
  const result = await notion(`/databases/${MEMORY_DB}/query`, 'POST', { page_size: 100 });
  const items = (result.results || []).map(p => ({
    id: p.id,
    名称: p.properties['名称']?.title?.[0]?.plain_text || '',
    内容摘要: p.properties['内容摘要']?.rich_text?.[0]?.plain_text || '',
    类别: p.properties['类别']?.select?.name || '',
    状态: p.properties['状态']?.select?.name || '',
    依据: p.properties['依据']?.rich_text?.[0]?.plain_text || '',
    最后更新: p.properties['最后更新']?.date?.start || ''
  }));
  res.json({ count: items.length, items });
});

app.get('/api/memory/create', auth, async (req, res) => {
  const { 名称, 内容摘要, 类别, 状态, 依据, 最后更新 } = req.query;
  if (!名称) return res.status(400).json({ error: 'missing 名称' });

  const properties = {
    '名称': { title: [{ text: { content: 名称 } }] },
    '内容摘要': { rich_text: [{ text: { content: 内容摘要 || '' } }] },
    '依据': { rich_text: [{ text: { content: 依据 || '' } }] }
  };
  if (类别) properties['类别'] = { select: { name: 类别 } };
  if (状态) properties['状态'] = { select: { name: 状态 || '确认' } };
  if (最后更新) properties['最后更新'] = { date: { start: 最后更新 } };

  const result = await notion('/pages', 'POST', { parent: { database_id: MEMORY_DB }, properties });
  res.json({ ok: true, id: result.id });
});

app.get('/api/memory/update', auth, async (req, res) => {
  const { id, 名称, 内容摘要, 类别, 状态, 依据, 最后更新 } = req.query;
  if (!id) return res.status(400).json({ error: 'missing id' });

  const properties = {};
  if (名称) properties['名称'] = { title: [{ text: { content: 名称 } }] };
  if (内容摘要) properties['内容摘要'] = { rich_text: [{ text: { content: 内容摘要 } }] };
  if (依据) properties['依据'] = { rich_text: [{ text: { content: 依据 } }] };
  if (类别) properties['类别'] = { select: { name: 类别 } };
  if (状态) properties['状态'] = { select: { name: 状态 } };
  if (最后更新) properties['最后更新'] = { date: { start: 最后更新 } };

  const result = await notion(`/pages/${id}`, 'PATCH', { properties });
  res.json({ ok: true, id: result.id });
});

app.get('/api/memory/archive', auth, async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'missing id' });
  const result = await notion(`/pages/${id}`, 'PATCH', { archived: true });
  res.json({ ok: true, archived: true });
});

// ===== 日记本 =====
app.get('/api/diary/list', auth, async (req, res) => {
  if (!DIARY_DB) return res.status(400).json({ error: 'DIARY_DB not set' });
  const result = await notion(`/databases/${DIARY_DB}/query`, 'POST', {
    page_size: 100,
    sorts: [{ property: '日期', direction: 'descending' }]
  });
  const items = (result.results || []).map(p => ({
    id: p.id,
    名称: p.properties['名称']?.title?.[0]?.plain_text || '',
    日期: p.properties['日期']?.date?.start || '',
    类型: p.properties['类型']?.select?.name || '',
    心情: p.properties['心情']?.select?.name || '',
    摘要: p.properties['摘要']?.rich_text?.[0]?.plain_text || '',
    未完话题: p.properties['未完话题']?.rich_text?.[0]?.plain_text || '',
    已复核: p.properties['已复核']?.checkbox || false
  }));
  res.json({ count: items.length, items });
});

app.get('/api/diary/create', auth, async (req, res) => {
  if (!DIARY_DB) return res.status(400).json({ error: 'DIARY_DB not set' });
  const { 名称, 日期, 类型, 心情, 摘要, 未完话题 } = req.query;
  if (!名称) return res.status(400).json({ error: 'missing 名称' });

  const properties = {
    '名称': { title: [{ text: { content: 名称 } }] },
    '摘要': { rich_text: [{ text: { content: 摘要 || '' } }] },
    '未完话题': { rich_text: [{ text: { content: 未完话题 || '' } }] },
    '已复核': { checkbox: true }
  };
  if (日期) properties['日期'] = { date: { start: 日期 } };
  if (类型) properties['类型'] = { select: { name: 类型 } };
  if (心情) properties['心情'] = { select: { name: 心情 } };

  const result = await notion('/pages', 'POST', { parent: { database_id: DIARY_DB }, properties });
  res.json({ ok: true, id: result.id });
});

app.get('/api/diary/update', auth, async (req, res) => {
  if (!DIARY_DB) return res.status(400).json({ error: 'DIARY_DB not set' });
  const { id, 名称, 日期, 类型, 心情, 摘要, 未完话题 } = req.query;
  if (!id) return res.status(400).json({ error: 'missing id' });

  const properties = {};
  if (名称) properties['名称'] = { title: [{ text: { content: 名称 } }] };
  if (摘要) properties['摘要'] = { rich_text: [{ text: { content: 摘要 } }] };
  if (未完话题) properties['未完话题'] = { rich_text: [{ text: { content: 未完话题 } }] };
  if (日期) properties['日期'] = { date: { start: 日期 } };
  if (类型) properties['类型'] = { select: { name: 类型 } };
  if (心情) properties['心情'] = { select: { name: 心情 } };

  const result = await notion(`/pages/${id}`, 'PATCH', { properties });
  res.json({ ok: true, id: result.id });
});

// ===== 通用 =====
app.get('/api/search', auth, async (req, res) => {
  const { q } = req.query;
  const result = await notion('/search', 'POST', { query: q || '' });
  res.json({ count: result.results?.length || 0, results: result.results?.map(r => ({ id: r.id, title: r.properties?.['名称']?.title?.[0]?.plain_text || r.properties?.['名称']?.title?.[0]?.text?.content || '' })) });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Notion proxy running on ${PORT}`));
