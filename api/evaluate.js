// Cloudflare Pages 函数版，使用 fetch 读取 JSON 文件

export async function onRequest(context) {
  const { request, env } = context;
  
  // 只允许 POST 请求
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: '只支持 POST 请求' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // 读取请求体
    const { essay } = await request.json();
    
    if (!essay || typeof essay !== 'string') {
      return new Response(JSON.stringify({ error: '无效的文书内容' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 获取当前请求的 URL 基础路径
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    // 并行加载 5 个 JSON 标准文件
    const [cat1, cat2, cat3, cat4, cat5] = await Promise.all([
      fetch(`${baseUrl}/data/standards_cat1.json`).then(r => r.json()),
      fetch(`${baseUrl}/data/standards_cat2.json`).then(r => r.json()),
      fetch(`${baseUrl}/data/standards_cat3.json`).then(r => r.json()),
      fetch(`${baseUrl}/data/standards_cat4.json`).then(r => r.json()),
      fetch(`${baseUrl}/data/standards_cat5.json`).then(r => r.json())
    ]);

    // 提取每个类别的主对象
    const categories = [
      { ...cat1.PersonalStrengths, key: 'PersonalStrengths' },
      { ...cat2.LogicalConsistency, key: 'LogicalConsistency' },
      { ...cat3.LogicalConsistency, key: 'LogicalConsistency2' },
      { ...cat4.Readability, key: 'Readability' },
      { ...cat5.LanguageQuality, key: 'LanguageQuality' }
    ];

    // 并行调用 DeepSeek API 评估所有类别
    const results = await Promise.all(categories.map(async (cat) => {
      if (!cat.items || cat.items.length === 0) {
        return {
          categoryName: cat.category,
          score: 0,
          maxScore: 0,
          standards: []
        };
      }

      const prompt = `
你是一位严格的美国大学申请文书评估专家。

请只评估以下类别：${cat.category}

评分标准（每个标准有 1-5 分的详细描述和例子）：
${JSON.stringify(cat, null, 2)}

待评估文书：
${essay}

请返回 JSON 格式：
{
  "categoryName": "${cat.category}",
  "score": 该类别的总分,
  "maxScore": ${cat.items.length * 5},
  "standards": [
    {
      "name": "标准名称",
      "score": 1-5 的分数,
      "maxScore": 5,
      "problem": "问题描述",
      "examples": [
        {
          "original": "原文引用",
          "issue": "具体问题说明",
          "suggestion": "修改建议",
          "reason": "修改原因",
          "comparison": "效果对比"
        }
      ]
    }
  ]
}

注意：只列不足，不说优点。没有问题的标准不要包含。
`;

      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: "system", content: "你是一个严格的美国大学申请文书评估专家，只列不足，不说优点。" },
            { role: "user", content: prompt }
          ],
          temperature: 0.2,
          max_tokens: 8192
        })
      });

      if (!response.ok) {
        throw new Error(`DeepSeek API 调用失败: ${response.status}`);
      }

      const data = await response.json();
      
      try {
        let content = data.choices[0].message.content;
        // 去掉 Markdown 代码块标记
        content = content.replace(/^```json\s*/, '').replace(/^```\s*/, '');
        content = content.replace(/\s*```$/, '');
        content = content.trim();
        
        return JSON.parse(content);
      } catch (e) {
        console.error(`解析 ${cat.category} 结果失败:`, e.message);
        return {
          categoryName: cat.category,
          score: 0,
          maxScore: cat.items.length * 5,
          standards: []
        };
      }
    }));

    // 计算总分
    const totalScore = results.reduce((sum, cat) => sum + (cat.score || 0), 0);

    // 返回结果
    return new Response(JSON.stringify({
      totalScore,
      deductPoints: 90 - totalScore,
      overallSummary: "综合评估完成",
      categories: results
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('评估过程出错:', error);
    return new Response(JSON.stringify({ error: '评估失败: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}