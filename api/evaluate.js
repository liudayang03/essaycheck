import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载 5 个 JSON
const cat1 = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/standards_cat1.json'), 'utf-8'));
const cat2 = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/standards_cat2.json'), 'utf-8'));
const cat3 = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/standards_cat3.json'), 'utf-8'));
const cat4 = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/standards_cat4.json'), 'utf-8'));
const cat5 = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/standards_cat5.json'), 'utf-8'));

// 提取每个类别的主对象
const categories = [
  { ...cat1.PersonalStrengths, key: 'PersonalStrengths' },
  { ...cat2.LogicalConsistency, key: 'LogicalConsistency' },
  { ...cat3.LogicalConsistency, key: 'LogicalConsistency2' },
  { ...cat4.Readability, key: 'Readability' },
  { ...cat5.LanguageQuality, key: 'LanguageQuality' }
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只支持 POST 请求' });
  }

  try {
    const { essay } = req.body;
    
    const results = [];
    
    for (const cat of categories) {
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

      const data = await response.json();
      
      try {
        const result = JSON.parse(data.choices[0].message.content);
        results.push(result);
      } catch (e) {
        console.error('解析失败', cat.category);
        // 如果解析失败，加一个空结果占位
        results.push({
          categoryName: cat.category,
          score: 0,
          maxScore: cat.items.length * 5,
          standards: []
        });
      }
    }
    
    // 计算总分（假设满分90）
    const totalScore = results.reduce((sum, cat) => sum + (cat.score || 0), 0);
    
    res.json({
      totalScore,
      deductPoints: 90 - totalScore,
      overallSummary: "综合评估完成",
      categories: results
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '评估失败' });
  }
}