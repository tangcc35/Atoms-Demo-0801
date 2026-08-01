# FindIt - Lost Item Tracker (Atoms Demo Challenge)

## 1. 项目简介 (Project Overview)
这是一个基于 AI Native 工作流快速构建的全栈网页应用。项目旨在帮助用户记录日常遗失的物品，并通过数据分析（SQL 聚合）智能推荐最常遗失物品的替代购买链接（例如亚马逊检索页）。

## 2. 实现思路与关键取舍 (Implementation Thoughts & Trade-offs)
在有限的时间内，为了最大化开发效率和最终交付质量，我做出了以下架构与技术栈取舍：

- **后端选型 (FastAPI vs Flask/Django)**：选择了 **FastAPI**。它轻量、天然支持数据验证（Pydantic），并且配合 Vercel 的 Serverless 环境拥有极快的冷启动速度。
- **前端选型 (Vanilla JS/CSS vs React/Vue)**：为了避免繁重的打包流程拖慢早期原型（PoC）的迭代节奏，前端采用了 **Vanilla JS + 现代原生 CSS**。通过 CSS Variables 和 Glassmorphism（毛玻璃特效），在零框架依赖的前提下，依然实现了高质感、现代化的 UI 交互体验。
- **部署架构 (Vercel Zero-Config)**：摒弃了传统的 Docker 容器部署，采用了 Vercel 的 Zero-Config 特性。将 `public` 文件夹映射为静态托管，`api/` 映射为 Serverless Functions，大幅降低运维复杂度，实现了 Push-to-Deploy。
- **数据库设计 (ORM Abstraction)**：本地开发使用 SQLite 保证极速热启动，但通过 SQLAlchemy ORM 进行了底层抽象，只需注入环境变量 `DATABASE_URL`，即可无缝切换至线上的 PostgreSQL (如 Neon)。
- **安全依赖取舍**：在开发过程中发现 `passlib` 库与最新版 `bcrypt` (4.0+) 存在兼容性 Bug 导致服务崩溃，果断舍弃 `passlib`，直接使用原生 `bcrypt` 模块完成密码加密与验证，保证了部署稳定性。

## 3. 当前完成程度 (Current Completion Status)
**已完成的核心闭环：**
- [x] **安全鉴权**：基于 JWT (JSON Web Tokens) 的安全登录与注册系统。
- [x] **数据持久化**：使用 SQLAlchemy 管理关系型数据模型 (User, LostItem)。
- [x] **核心交互**：流畅的前端 Dashboard 面板，支持状态管理和数据的即时展示。
- [x] **衍生能力 (Highlights)**：智能购买建议功能。后端通过 SQL 聚合逻辑，计算用户历史最高频遗失物，并动态生成电商平台的快捷重购链接。
- [x] **线上部署**：完成了生产环境的 Vercel + PostgreSQL 部署配置。

**暂未完成（出于时间限制的裁剪）：**
- [ ] 找回状态标记（将记录标记为已找回）。
- [ ] 密码重置流程。

## 4. 后续演进路线与优先级 (Future Expansion & Priorities)
如果继续投入资源，我将按照以下优先级扩展此系统：

1. **[P0] 接入 AI Agent 能力 (AI Integration)**：这作为核心升级点。允许用户用自然语言输入（“我今天早上在地铁上把黑色的 AirPods 弄丢了”），后端调用 LLM 自动提取物品名称（AirPods）、特征（黑色）、遗失场景，从而替代繁琐的表单填写。
2. **[P1] 前端工程化升级**：随着业务复杂度上升，将 Vanilla JS 前端迁移至 Next.js，建立标准化的设计系统 (Design System)，并接入更强大的可视化图表库以展示遗失习惯数据。
3. **[P2] 多模态交互体验**：结合 Vision 视觉大模型，允许用户上传平时随身携带的物品清单照片，AI 自动对比建立个人物品库，遗失时只需点击勾选。
