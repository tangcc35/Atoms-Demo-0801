# Atoms Agent Workspace

## 1. 项目简介 (Project Overview)
这是一个基于 **Google ADK (Agent Development Kit)** 与 **FastAPI** 快速构建的 AI Native 多智能体 Web 应用生成工作台。用户只需提供自然语言需求，系统将调度专业化的 Multi-Agent 团队（设计师 Agent -> 程序员 Agent -> QA 质量检测 Agent）协同完成 UX 蓝图规划、单文件 HTML/CSS/JS 代码生成、质量审核与实时渲染，并通过 SSE（Server-Sent Events）实现流畅的打字机流式交互。

## 2. 实现思路与关键取舍 (Implementation Thoughts & Trade-offs)
在有限的时间内，为了最大化 Multi-Agent 体验与交付质量，我做出了以下架构与技术栈取舍：

- **Multi-Agent 协同架构 (Google ADK Framework)**：
  采用了 Google 官方 Agent 框架 Google ADK (`google-adk`) 构建三阶段智能体合作流：
  - `Designer Agent`：分析用户意图，规划布局结构、色彩体系、交互细节与 CDN 框架选型（如 Tailwind CSS）。
  - `Coder Agent`：接收设计方案，实时编写自包含（Self-contained）的单文件 HTML 网页。
  - `QA Agent`：对代码草稿进行语法审查、闭合标签校验及 CDN 可用性检测，输出最终精修后的生产级代码。
- **流式响应与打字机打磨 (Google ADK SSE Streaming)**：
  为了解决大模型输出完整代码时长时间无响应的尴尬等待，配置了 ADK `StreamingMode.SSE` 模式与 FastAPI 的 `StreamingResponse` (NDJSON 格式)。结合前端 ReadableStream，实现了设计方案 Markdown 与代码字符级的实时流式打字机渲染。
- **前端轻量化与高质感 UI (Vanilla JS + Glassmorphism)**：
  避免了繁重的 Node/React 打包构建流程，前端采用 **Vanilla JS + 现代原生 CSS**。引入 Google Fonts (Outfit, Inter)、深色毛玻璃拟态 (Glassmorphism) 以及自研的可拖拽分栏手柄 (Split Window Resizer)，零依赖前提下实现了桌面级 Web 应用的交互质感。
- **双视角即时预览 (Live Preview & Code View)**：
  提供可实时切换的 **Live Preview** (Iframe 隔离渲染) 与 **Code View** (代码增量查看与自动滚动)，保障安全隔离的同时给用户带来极佳的生成过程透明度。
- **部署架构 (Vercel Serverless Zero-Config)**：
  结合 Vercel 的 `@vercel/python` (Python 3.12) 和 `@vercel/static` 配置，实现了前端静态资源与后端 Serverless Functions 的无缝一键部署。

## 3. 当前完成程度 (Current Completion Status)
**已完成的核心闭环：**
- [x] **Multi-Agent 协作链**：Designer Agent -> Coder Agent -> QA Agent 完整自动化与迭代微调机制。
- [x] **实时 SSE 流式输出 (Streaming)**：基于 ADK SSE 的字符级 real-time 输出，告别大模型等待卡顿。
- [x] **人机协同确认 (Human-in-the-loop)**：用户可先审阅 Designer 设计蓝图，确认后再选择 `Approve & Build` 或继续打磨设计。
- [x] **交互式分栏与双视角**：支持自定义拖拽调节侧边栏宽度的 Split View，以及 Live Preview / Code View 切换。
- [x] **线上部署**：提供了支持 Vercel Python 3.12 环境与 `GEMINI_API_KEY` 环境变量的完整的部署支持。

**暂未完成（出于时间限制的裁剪）：**
- [ ] Session 历史记录持久化与多轮项目管理。
- [ ] 多文件应用生成与 Zip / GitHub 导出能力。

## 4. 后续演进路线与优先级 (Future Expansion & Priorities)
如果继续投入资源，我将按照以下优先级扩展此系统：

1. **[P0] 多模态草图/设计图输入 (Multimodal Prompting)**：允许用户上传 UI 截图或手绘草图，结合 Gemini 3.6 Flash 视觉能力直接转化为结构化设计蓝图与代码。
2. **[P1] Session 历史管理与增量对话修改 (Session Persistence & Incremental Edits)**：接入 ADK Session Service 保持长对话上下文，支持用户对已生成的 App 进行增量修改（如：“把登录按钮改成悬浮渐变样式”）。
3. **[P2] 代码增量 Diff 预览与热更新 (Live WebContainer HMR)**：在 Coder/QA Agent 流式输出时，针对 Iframe 实现 DOM 层的即时补丁 (Patching) 更新，提供更加震撼的实时建造体验。
