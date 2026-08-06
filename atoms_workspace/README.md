# Atoms Agent Workspace

## 1. 项目简介 (Project Overview)
这是一个基于 **Google ADK (Agent Development Kit)** 与 **FastAPI** 快速构建的 AI Native 多智能体 Web 应用生成工作台。用户只需提供自然语言需求，系统将调度专业化的 Multi-Agent 团队协同完成 UX 蓝图规划、单文件 HTML/CSS/JS 代码生成、质量审核与实时渲染，并通过 SSE（Server-Sent Events）实现流畅的打字机流式交互。

## 2. 实现思路与关键取舍 (Implementation Thoughts & Trade-offs)
在有限的时间内，为了最大化 Multi-Agent 体验与交付质量，我做出了以下架构与技术栈取舍：

- **Multi-Agent 协同架构 (Google ADK Framework)**：
  采用了 Google 官方 Agent 框架 Google ADK 构建三阶段智能体合作流：
  - `Designer Agent`：分析用户意图，规划布局结构、色彩体系、交互细节。
  - `Coder Agent`：接收设计方案与**上下文旧代码**，通过增量修改 (Incremental Generation) 实时编写自包含的单文件网页。配置 `ThinkingLevel.HIGH` 与 `BuiltInPlanner` 增强推理逻辑。
  - `QA Agent`：对代码草稿进行严格的语法审查、闭合标签校验，输出最终精修后的生产级代码。
- **多用户与工作区隔离 (Auth & Workspace Isolation)**：
  引入了高质感拟物化 (Glassmorphism) 的登录/注册系统，前端基于 `localStorage` 命名空间实现了严密的多用户状态隔离，彻底保障对话历史与代码版本的持久化。
- **流式响应与打字机打磨 (Google ADK SSE Streaming)**：
  配置了 ADK `StreamingMode.SSE` 模式与 FastAPI 的 `StreamingResponse` (NDJSON 格式)，结合前端 ReadableStream 实现了极低延迟的打字机渲染体验。
- **Monaco 工业级代码管理 (Monaco Editor & Diff Viewer)**：
  废除基础文本框，全量接入微软 VS Code 内核 Monaco Editor，提供专业语法高亮。深度集成原生 `DiffEditor`，支持即时比对任意历史版本变更。
- **部署架构 (Vercel Serverless Zero-Config)**：
  结合 Vercel 的 `@vercel/python` (Python 3.12) 和 `@vercel/static` 配置，实现了前端静态资源与后端 Serverless Functions 的无缝一键部署。

## 3. 核心架构亮点 (Core Architectural Highlights)
针对 LLM/Agent 系统常见的痛点，本项目在产品体验与底层架构层面进行了针对性的加固：

1. **出色的 Agent 交互与防遗忘机制 (Agent Interaction & Context)**：
   大模型在多次迭代中极易发生“灾难性遗忘”。本系统在每次请求时会将活跃代码块作为 Context 传入，并在 Prompt 中设立防御性指令，完美解决了增量开发中的覆盖问题，保障了流畅的多轮 Agent 交互。
2. **安全隔离的 Preview 交互 (Sandboxed Preview Interaction)**：
   生成的代码直接注入到 `<iframe srcdoc="...">` 中执行，天然阻断了 LLM 幻觉代码污染父层 DOM 的风险，确保了计算器、计数器等复杂 JS 应用的独立、安全运行。
3. **完善的登录注册与数据持久化 (Auth & Data Persistence)**：
   摆脱了单机无状态的 demo 形式，系统具备完整的 Glassmorphism 登录注册模块。所有对话记录、代码快照版本树均与具体 User 的命名空间绑定，刷新页面数据无损恢复，实现了企业级的数据持久化。
4. **极致的产品页面美观度与代码展示管理 (Aesthetics & Code Management)**：
   在前端摒弃繁重的构建工具，采用纯粹的 Vanilla JS 与现代原生 CSS。结合可拖拽分栏 (Split View) 确保了高级的产品页面与美观度；同时通过异步接入工业级 Monaco Editor，实现了历史快照回滚、双向 Diff 源码比对、一键编辑与导出的全面代码展示与管理能力。
5. **高度容错性 (Error Handling)**：
   后端拦截了底层的 Rate Limit 或各类不可用异常，转化为对用户友好的提示，避免暴露出栈跟踪。同时禁止 Agent 引入生产环境不稳定的 CDN（如导致 MutationObserver 崩溃的 Tailwind CDN）。

## 4. 当前完成程度与后续演进 (Current Status & Future Roadmap)
**已完成：** 
- [x] Multi-Agent 协作链与 SSE 实时流式输出
- [x] Human-in-the-loop 人机协同设计确认
- [x] 连续增量构建能力与防遗忘机制
- [x] 多用户 Session 隔离与持久化存储
- [x] 交互式分栏、Monaco 编辑器与原生版本 Diff

**待规划演进 (P0-P2)：**
1. **[P0] 多模态输入 (Multimodal Prompting)**：结合 Gemini Flash Vision 支持草图/UI截图直出代码。
2. **[P1] 即时热更新 (Live WebContainer HMR)**：通过 DOM Patching 实现局部刷新，代替全局 Iframe 重载。
3. **[P2] 多文件架构 (Multi-file Export)**：引入虚拟文件系统，支持 React/Vue 脚手架多文件生成与 Zip/GitHub 导出。
