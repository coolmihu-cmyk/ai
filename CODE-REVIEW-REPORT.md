# MIHU DESIGN OS — 代码审查报告

> 审查日期：2026-07-22 ~ 2026-07-23  
> 审查范围：全项目前端代码（HTML / CSS / JavaScript）

---

## 一、项目概况

| 指标 | 数值 |
|------|------|
| HTML 文件 | 1（index.html，约 378 行） |
| CSS 文件 | 4（base / layout / components / canvas） |
| JS 文件 | 7（shared / core / model-ui / history-canvas / workspace-ui / generation / app） |
| 内联 JS | 已全部迁出，零残留 |
| DOM ID 数量 | 81 个，全部唯一 |
| 支持模型 | GPT Image 2 / NB2 / Grok / Midjourney |
| 存储 | localStorage（API Key）+ IndexedDB（历史，最多 20 条） |
| API | APIMart（https://api.apimart.ai/v1） |

---

## 二、架构评估

### 2.1 优势

1. **职责拆分已完成**：HTML 仅保留结构，CSS 按 base/layout/components/canvas 拆分，JS 按 core/model-ui/history-canvas/workspace-ui/generation/app 拆分，整体架构清晰。
2. **单页 Tab 应用设计合理**：四个模型共用一套结果面板和历史记录，切换不丢失状态。
3. **异步任务流程完整**：POST 提交 → 轮询 → 获取结果 URL → 写入历史，流程覆盖正常/超时/取消路径。
4. **多图画布独立图层**：每张图片拥有独立坐标、层级和缩放，Pointer Events 支持鼠标/触屏。
5. **极简设计原则贯彻**：无登录、支付、套餐，纯本地存储。

### 2.2 风险

1. **CSS 历史覆盖已清理但未做最终浏览器回归验证**：shared.css 从 1,203 行降至约 1,024 行后拆分为 4 个文件，多文件加载后的整页 visual regression 测试尚未完成。
2. **JS 全局命名空间**：所有函数/变量挂载在全局作用域，无模块化封装，存在命名冲突风险。
3. **错误处理不均衡**：部分 catch 块为空，静默吞噬异常（详见第四节）。

---

## 三、代码规模

| 文件 | 行数（约） | 职责 |
|------|-----------|------|
| index.html | 378 | 页面结构 + CSS/JS 引用 |
| css/base.css | ~230 | CSS 变量、重置、排版 |
| css/layout.css | ~260 | 侧栏、主区域、弹层布局 |
| css/components.css | ~320 | 按钮、卡片、输入、弹窗组件 |
| css/canvas.css | ~210 | 画布、图层、工具栏 |
| shared.js | 213 | API 调用、IndexedDB、进度、通知 |
| core.js | ~180 | 配置、状态、DOM 引用、基础弹层 |
| model-ui.js | ~260 | 模型/输出/参考图/提示词 UI |
| history-canvas.js | ~310 | 历史记录 + 多图画布 |
| workspace-ui.js | ~200 | 结果恢复、参考图管理器、MJ 绑定 |
| generation.js | ~140 | 生成/取消/轮询衔接 |
| app.js | ~90 | 事件绑定与初始化 |

---

## 四、历史异步流程专项审计（#30）

### 4.1 IndexedDB 操作

**严重问题：**

| ID | 严重程度 | 问题 |
|----|---------|------|
| #47 | 🔴 高 | `History.clear()` 空 catch 块，所有 DB 错误被静默忽略 |
| #48 | 🔴 高 | `History.load()` 内层清理死链接失败被静默忽略 |
| #49 | 🔴 高 | `History.load()` 外层 catch 返回 `[]`，调用者无法区分"空历史"与"加载失败" |
| #59 | 🔴 高 | 所有 DB 事务缺少 `tx.onabort` 处理器，事务被浏览器中止时 Promise 永久挂起 |
| #37 | 🔴 高 | `addHistory()` 先更新内存数组再异步写 DB，写入失败导致内存与持久化不一致 |
| #39 | 🔴 高 | `History.load()` 异步加载期间用户操作可能覆盖 `sharedHistory`，造成数据重复或丢失 |
| #5 | 🟡 中 | `save()` + `trim()` 各自独立打开 DB 连接，无原子性保证 |
| #6 | 🟡 中 | 两次快速 save 的并发 trim 可能对同一批 stale 数据重复删除 |
| #17 | 🟡 中 | 所有读写事务缺少 `tx.onabort` 处理器 |

### 4.2 URL 可用性探测

| ID | 严重程度 | 问题 |
|----|---------|------|
| #11 | 🔴 高 | `load()` 一次性并发加载 20 张图片检查可用性，最坏情况 240 秒（20×12s） |
| #19 | 🔴 高 | `isAvailable()` 12 秒超时过长，失效 URL 需等 12 秒才能确认 |
| #20 | 🔴 高 | Image 对象在 onload/onerror 分支中未清理 `img.src`，可能内存泄漏 |
| #22 | 🟡 中 | 每次 load 都重新检查所有 URL，无本地缓存/TTL |

### 4.3 轮询与状态

| ID | 严重程度 | 问题 |
|----|---------|------|
| #27 | 🟡 中 | 固定 2.5 秒轮询间隔，无指数退避 |
| #35 | 🟡 中 | 双重超时竞争（外部 setTimeout + pollTask 内部 maxWait） |
| #31 | 🟡 中 | `Progress.show()` 的 interval 中 `this.render()` 无 try/catch 保护 |
| #33 | 🟡 中 | 状态计时器 `refresh()` 中 `progressStartedAt` 可能为 undefined |

### 4.4 竞态条件

| ID | 严重程度 | 问题 |
|----|---------|------|
| #42 | 🟡 中 | 切换模型时旧模型轮询继续运行直到超时 |
| #43 | 🟡 中 | 快速连续画布编辑可能覆盖 `pendingCanvasEditSource` |
| #45 | 🟡 中 | 用户取消与硬超时竞态，`cancelledByUser` 标记可能被超时覆盖 |

### 4.5 错误处理整体评估

- **静默异常吞噬**：5 处空 catch 块（#47-#51），错误完全不可见
- **调用者无感知**：`save()` 只 toast 不返回值，`load()` 失败返回 `[]`
- **回调无保护**：`onProgress` 回调无 try/catch，异常会中断轮询循环

---

## 五、改进建议（按优先级）

### 🔴 立即修复

1. **所有空 catch 块添加 `console.error`**（#47-#51）
2. **`History.load()` 并发限制**：从 20 并发降至 5，超时从 12s 降至 5s（#11, #19）
3. **所有 IndexedDB 事务添加 `tx.onabort`**（#59）
4. **`addHistory()` 改为先写 DB 再更新内存**（#37）
5. **`History.load()` 添加加载锁**，防止与用户操作竞态（#39）

### 🟡 近期改进

6. **save() + trim() 合并为同一事务**（#5）
7. **并发 trim 添加互斥锁**（#6）
8. **轮询改为指数退避**：2.5s → 5s → 10s（#27）
9. **统一超时管理**，使用单一 AbortController（#35）
10. **`isAvailable` 结果缓存到 sessionStorage**（#22）

### 🔵 长期优化

11. IndexedDB 操作添加重试机制（QuotaExceededError）
12. 添加 `navigator.storage.estimate()` 存储配额监控
13. JS 模块化封装（ES Modules 或 IIFE）
14. `modelFilter` 死代码清理（#14）
15. Image 对象清理完善（#20）

---

## 六、CSS 拆分状态

| 文件 | 行数 | 状态 |
|------|------|------|
| css/base.css | ~230 | ✅ 已创建 |
| css/layout.css | ~260 | ✅ 已创建 |
| css/components.css | ~320 | ✅ 已创建 |
| css/canvas.css | ~210 | ✅ 已创建 |
| shared.css | ~1,024 | ⚠️ 已拆分为以上 4 文件，原文件仍保留 |

- index.html 已更新为引用 4 个 CSS 文件
- 字节等价和大括号平衡验证已通过
- ⚠️ **最终浏览器回归验证尚未执行**（多文件加载后的整页 visual regression）

---

## 七、结论

项目整体架构健康，职责拆分已完成，CSS 历史覆盖层已清理。主要技术债务集中在历史异步流程的错误处理和并发控制上。建议优先修复 5 项高优先级问题，再逐步推进中优先级改进。

---

*报告生成时间：2026-07-23*
