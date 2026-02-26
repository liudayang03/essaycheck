import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import handler from './evaluate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());

// 托管前端 HTML 文件
app.use(express.static(path.join(__dirname, '../')));

// 路由接口，对应前端 fetch('/api/evaluate')
app.post('/api/evaluate', handler);

// Zeabur 会自动分配 PORT 环境变量
const PORT = process.env.PORT || 7860;
app.listen(PORT, () => {
  console.log(`服务器已在端口 ${PORT} 启动`);
});