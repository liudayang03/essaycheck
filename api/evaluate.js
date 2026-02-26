const fs = require('fs');
const path = require('path');

// 在 Vercel 的 Serverless 环境中，process.cwd() 指向项目根目录
const dataDir = path.join(process.cwd(), 'data');

// 加载 5 个 JSON 标准文件
let cat1, cat2, cat3, cat4, cat5;
try {
  cat1 = JSON.parse(fs.readFileSync(path.join(dataDir, 'standards_cat1.json'), 'utf-8'));
  cat2 = JSON.parse(fs.readFileSync(path.join(dataDir, 'standards_cat2.json'), 'utf-8'));
  cat3 = JSON.parse(fs.readFileSync(path.join(dataDir, 'standards_cat3.json'), 'utf-8'));
  cat4 = JSON.parse(fs.readFileSync(path.join(dataDir, 'standards_cat4.json'), 'utf-8'));
  cat5 = JSON.parse(fs.readFileSync(path.join(dataDir, 'standards_cat5.json'), 'utf-8'));
  console.log('✅ 所有 JSON 标准文件加载成功');
} catch (error) {
  console.error('❌ JSON 标准文件加载失败:', error.message);
  // 如果文件加载失败，提供空数据防止完全崩溃
  cat1 = { PersonalStrengths: { category: 'Personal Strengths', items: [] } };
  cat2 = { LogicalConsistency: { category: 'Logical Consistency', items: [] } };
  cat3 = { LogicalConsistency: { category: 'Logical Consistency', items: [] } };
  cat4 = { Readability: { category: 'Readability', items: [] } };
  cat5 = { LanguageQuality: { category: 'Language Quality', items: [] } };
}

// 提取每个类别的主对象
const categories = [
  { ...cat1.PersonalStrengths, key: 'PersonalStrengths' },
  { ...cat2.LogicalConsistency, key: 'LogicalConsistency' },
  { ...cat3.LogicalConsistency, key: 'LogicalConsistency2' },
  { ...cat4.Readability, key: 'Readability' },
  { ...cat5.LanguageQuality, key: 'LanguageQuality' }
];

// 使用 CommonJS 的导出方式
module.exports = async (req, res) => {
  // 只允许 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只支持 POST 请求' });
  }

  try {
    const { essay } = req.body;
    
    // 验证输入
    if (!essay || typeof essay !== 'string') {
      return res.status(400).json({ error: '无效的文书内容' });
    }

    const results = [];
    
    // 循环评估每个类别
    for (const cat of categories) {
      // 确保类别有 items
      if (!cat.items || cat.items.length === 0) {
        console.warn(`类别 ${cat.category} 没有定义 items，跳过`);
        continue;
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

      // 调用 DeepSeek API
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
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
        
        // 【关键修复】去掉 Markdown 代码块标记
        // 去掉开头的 ```json 或 ```（可能带空格）
        content = content.replace(/^```json\s*/, '').replace(/^```\s*/, '');
        // 去掉结尾的 ```
        content = content.replace(/\s*```$/, '');
        
        const result = JSON.parse(content);
        results.push(result);
      } catch (e) {
        console.error(`解析 ${cat.category} 结果失败:`, e.message);
        console.error('原始内容:', data.choices[0].message.content); // 打印出来看看
        // 如果解析失败，加一个空结果占位
        results.push({
          categoryName: cat.category,
          score: 0,
          maxScore: cat.items.length * 5,
          standards: []
        });
      }
    }
    
    // 计算总分
    const totalScore = results.reduce((sum, cat) => sum + (cat.score || 0), 0);
    
    // 返回最终结果
    res.status(200).json({
      totalScore,
      deductPoints: 90 - totalScore,
      overallSummary: "综合评估完成",
      categories: results
    });

  } catch (error) {
    console.error('评估过程出错:', error);
    res.status(500).json({ error: '评估失败: ' + error.message });
  }
};