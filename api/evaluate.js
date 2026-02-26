import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载 5 个 JSON
const cat1 = JSON.parse(fs.readFileSync(path.join(__dirname, 'standards_cat1.json'), 'utf-8'));
const cat2 = JSON.parse(fs.readFileSync(path.join(__dirname, 'standards_cat2.json'), 'utf-8'));
const cat3 = JSON.parse(fs.readFileSync(path.join(__dirname, 'standards_cat3.json'), 'utf-8'));
const cat4 = JSON.parse(fs.readFileSync(path.join(__dirname, 'standards_cat4.json'), 'utf-8'));
const cat5 = JSON.parse(fs.readFileSync(path.join(__dirname, 'standards_cat5.json'), 'utf-8'));

const categories = [
  { ...cat1.PersonalStrengths, key: 'PersonalStrengths' },
  { ...cat2.LogicalConsistency, key: 'LogicalConsistency' },
  { ...cat3.LogicalConsistency, key: 'LogicalConsistency2' },
  { ...cat4.Readability, key: 'Readability' },
  { ...cat5.LanguageQuality, key: 'LanguageQuality' }
];

export default async function handler(req, res) {
  // 添加 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只支持 POST 请求' });
  }

  try {
    const { essay } = req.body;
    if (!essay) {
      return res.status(400).json({ error: '缺少 essay 参数' });
    }
    
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

      // 检查 HTTP 状态
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API HTTP 错误 (${cat.category}):`, response.status, errorText.substring(0, 500));
        throw new Error(`DeepSeek API 错误: ${response.status}`);
      }

      const data = await response.json();
      
      // 检查 API 返回结构
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error('意外的 API 响应:', JSON.stringify(data).substring(0, 500));
        throw new Error('API 响应格式异常');
      }
      
      let content = data.choices[0].message.content;
      
      // 清理 markdown 代码块标记
      content = content.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
      
      // 如果内容被引号包裹，去掉外层引号
      if ((content.startsWith('"') && content.endsWith('"')) || 
          (content.startsWith("'") && content.endsWith("'"))) {
        content = content.slice(1, -1);
      }
      
      try {
        const result = JSON.parse(content);
        results.push(result);
      } catch (parseError) {
        console.error(`JSON 解析失败 (${cat.category}):`, parseError.message);
        console.error('原始内容前500字符:', content.substring(0, 500));
        
        // 尝试提取 JSON 部分（如果 LLM 返回了额外文本）
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const result = JSON.parse(jsonMatch[0]);
            results.push(result);
            continue;
          } catch (e) {
            console.error('提取 JSON 也失败了');
          }
        }
        
        // 解析失败时添加占位结果
        results.push({
          categoryName: cat.category,
          score: 0,
          maxScore: cat.items.length * 5,
          standards: [],
          error: '解析失败',
          rawContent: content.substring(0, 200)
        });
      }
    }
    
    const totalScore = results.reduce((sum, cat) => sum + (cat.score || 0), 0);
    
    res.json({
      totalScore,
      deductPoints: 90 - totalScore,
      overallSummary: "综合评估完成",
      categories: results
    });

  } catch (error) {
    console.error('服务器错误:', error);
    res.status(500).json({ 
      error: '评估失败', 
      details: error.message,
      stack: error.stack
    });
  }
}