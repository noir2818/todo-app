// Vercel Serverless Function - DeepSeek API Proxy
// 部署前在 Vercel 环境变量中设置 DEEPSEEK_API_KEY

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, isPlanMode = false } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Missing messages array' });
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

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Server: DEEPSEEK_API_KEY not configured' });
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
      return res.status(response.status).json({ error: `DeepSeek API error: ${errText}` });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    return res.status(200).json({ content });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(499).json({ error: 'aborted' });
    }
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
