# AI 精读服务配置

网页前端使用 OpenAI Responses API，由 Cloudflare Worker 在服务端持有密钥。不要把 API 密钥写进 `index.html`、GitHub 文件或聊天消息。

## 使用模型

默认使用 `gpt-6.2-sol`，适合逐段翻译、论证关系分析和结构化输出。网页只接受粘贴的论文文本；单次最多 50,000 个字符、40 段。Worker 对每个来源 IP 限制为每分钟 8 次请求。API 调用会按 OpenAI Platform 当前价格计费，和 ChatGPT 订阅分开。

## 一次性部署

1. 在 Cloudflare 创建 API Token，授予 Workers Scripts 编辑权限；记录 Cloudflare Account ID。
2. 在 OpenAI Platform 创建一个专用于此服务的 API key。
3. 打开 GitHub 仓库 `Settings → Secrets and variables → Actions`，新增以下 repository secrets：
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `OPENAI_API_KEY`
4. 打开仓库 `Actions → Deploy AI Worker → Run workflow`。
5. 从工作流日志复制 Worker URL（格式类似 `https://paper-reading-ai.<account-subdomain>.workers.dev`），打开 GitHub Pages 网页的“AI 论文精读”面板，将 URL 填入“AI 安全后端地址”。

## 数据与使用提示

粘贴的论文文本会发送到你自己的 Worker 和 OpenAI API。Worker 只返回分析结果，不保存请求正文。正式论文或未公开稿件上传前，请先确认你有权分享这些内容。模型结果需要逐段核对，不能直接当作论文事实或最终引用依据。

若怀疑密钥泄露，请在 OpenAI Platform 撤销并轮换该 key，同时更新 GitHub Actions secret。可在 OpenAI Platform 为项目设置预算或用量告警。

