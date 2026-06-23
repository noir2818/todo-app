// Cloudflare Pages Function - DeepSeek API Proxy
// 部署后在 Cloudflare Dashboard → Workers & Pages → 项目 → Settings → Environment Variables 中设置 DEEPSEEK_API_KEY

export async function onRequest(context) {
  const { request, env } = context;

  // CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const body = await request.json();
    const { messages, isPlanMode = false } = body;

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Missing messages array' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    let systemPrompt = '你是 Todo 工作台的 AI 助手，帮助用户管理任务、笔记和时间。回答应简洁、结构化、有价值。';

    if (isPlanMode) {
      systemPrompt = `你是 Todo 工作台的 AI 助手。用户的计划需要拆解为每日/每周任务。
请在回复的最后，用一个 JSON 代码块输出结构化的任务列表，格式如下：
\`\`\`json
[{"name":"任务名","type":"normal|timed|recurring","priority":"P0|P1|P2|P3","dueDate":"YYYY-MM-DD","remark":"备注"},...]
\`\`\`
dueDate 根据计划时间线推算。每个任务的 priority 要合理分配。先给出自然语言的分析说明，再附上 JSON。`;
    }

    const allMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content })),
    ];

    const apiKey = env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Server: DEEPSEEK_API_KEY not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: allMessages,
        temperature: 0.7,
        max_tokens: 2048,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: `DeepSeek API error: ${errText}` }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    return new Response(JSON.stringify({ content }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return new Response(JSON.stringify({ error: 'aborted' }), {
        status: 499,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
