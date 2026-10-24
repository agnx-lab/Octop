# Octop · Agnx 子应用接入记录（EMBED.md）

> appId `octop`｜独占端口 **8123**｜接入日期 2026-10-20｜接入方式：**原样嵌入 + 受管 sidecar**

## 上游嵌入

- **上游**：`TencentCloud/Octop` @ `main`（tarball 快照，版本 `1.0.2`，`pyproject.toml` version = 1.0.2）
  - 许可证：**MIT**（`LICENSE`：`MIT License / Copyright (c) 2026 Octop`）
  - 形态：**Python 3.12+ FastAPI 单端口服务**（`octop run --host --port`），FastAPI 同源托管 React SPA 控制台
    （`src/octop/api/app.py:317` → `dashboard_dir = Path(__file__).parent.parent / "dashboard"`），
    所以 **UI 与 API 天然同源同端口**，无需再加反代。
- 上游原生平台：
  - **桌面 ✅**：上游自带 Electron 壳（`desktop/`，release 有 dmg/exe/tar.gz），但**本项目不消费它的桌面壳**，用的是它的 Web 控制台；
  - **网页 ✅**：控制台就是 Web SPA，本地/服务器都以浏览器形态使用（README「打开 http://127.0.0.1:8088」）；
  - **移动 ❌**：无原生移动端（有 PWA manifest，不算原生移动形态）→ `manifest.platforms.mobile = "unsupported"`。
- **工作方式**：**原样嵌入（首选）** + 受管 sidecar。上游代码零修改。
- **上游改动清单**：
  1. **源码零改动**（`src/octop/`、`dashboard/src/` 未动一个字节）。
  2. 仅**生成构建产物** `src/octop/dashboard/`——这是上游官方 `make build-frontend`（`vite.config.ts` `outDir = ../src/octop/dashboard`）的既定输出目录，不是手改代码。
  3. 交互全部走**启动参数 / 环境变量**：`--host/--port`、`OCTOP_HOME`、`OCTOP_BIND_HOST`、`OCTOP_PORT`。
- **挂载**：`guest.kind="web"` / `guest.auth="none"` / `preferStrategy="auto"` → 桌面走 **direct-iframe**，网页走 proxied-iframe。
  - 上游不发 `X-Frame-Options` / `frame-ancestors`（全仓 grep 仅 `workspace.py:462` 一处给「文件预览」加 `CSP: sandbox`，与首页无关），所以 iframe 不会被禁嵌。
- **面板与 Tab**：

| panelId | 名字 | 加载路径 | 说明 |
| --- | --- | --- | --- |
| `octop.main` | Octop | `ensureTool: .agnx/tools/ensure-octop.mjs` | 起本机 Octop 控制台 :8123，加载 `http://127.0.0.1:8123` |

- **端口**：`defaultPort = 8123`。已核对：`apps/*/.agnx/manifest.json` 里没有任何 app 用 8123；本机 8100/8101/8103–8108 已被 openhands/openbot/bytebot/omnigent/antfarm/forge/tabtin/staffdeck 占用，8123 独占无冲突。
- **数据/配置根**：`$AGNX_HOME/apps/data/octop/`（宿主注入 `AGNX_APP_DATA_ROOT` → 传给上游 `OCTOP_HOME`）。
  - 位置：`octop.db`（SQLite 控制面）、`config.json`、`plugins/`、`security/`、`memory-slim-control.json`、`octop.json`（ensure 指纹）、`octop-run.log`（stdout）。
  - **没有把用户数据写进 `apps/octop/`**（那里是代码树）。
- **桌面验收截图**：
  - `logs/octop-desktop-01-main.png` — 登录后首屏（Tab 高亮 + 上游完整侧栏与对话页）
  - `logs/octop-desktop-02-after-open-experts.png` — 真实操作后（点侧栏「专家」进入 `/experts`）
- `logs/octop-desktop-02-after-open-models.png` — 真实操作后（点侧栏「模型」进入 `/admin/models`）
- `logs/octop-desktop-03-after-create-expert.png` — 点「新建专家」打开的创建抽屉
  - 过程留证：`logs/octop-desktop-step1.png`（首次挂载的登录页）

## Docker / Agent 沙箱能力结论（⚠️ 部分交付，如实答）

**结论：Web 管理台完整可用；Agent 执行不依赖 Docker（上游默认 `local_shell` 本机 shell）；Docker 沙箱模式未启用、也不建议在本机启用。**

按用户要求，**接入过程中未启动任何 Octop 沙箱容器、未拉取任何镜像**（此前的探测只用已有镜像跑过一次 `--version` 即退出，未留容器）。

| 判断项 | 实测结果 | 判定 |
| --- | --- | --- |
| Docker daemon 是否活着 | `docker info` → `29.2.1 / overlayfs / cgroupfs` | ✅ daemon 在 |
| 能否**拉取新镜像** | `docker run alpine:3.20` → `TLS handshake timeout`（镜像源 `docker.1ms.run`） | ❌ 拉不下来 |
| Octop Agent 执行后端 | `execute_env.py:30` `_EXECUTE_BACKEND_KINDS = {"local_shell","docker"}`，默认 `local_shell` | ✅ 默认后端可用 |
| Octop 沙箱是否**必需** | 否。不配 Docker 也能建专家、开会话、跑 Agent | ✅ 主路径不阻塞 |

- **⚠️ 部分交付项**：Octop 的「Docker 沙箱隔离工作区」能力在 Agnx 里**未提供**（上游可选后端，需要可用的镜像源 + 用户显式在 Agent 配置里切到 `docker`）。
- **主路径**：Agent 走 `local_shell`，工作区落在 `$AGNX_HOME/apps/data/octop/`，功能完整。
- 若日后要开沙箱：先让本机 `docker pull` 恢复可用，再把 Agent 的 execute backend 改成 `docker`；**不改上游代码、不改宿主**。



| 步骤 | 耗时（本机实测） | 一次性？ |
| --- | --- | --- |
| `uv venv --python 3.12 .agent-venv` | ~10s | 是 |
| `uv pip install -e .`（含 octop-harness/playwright/psycopg 等全量依赖） | **207s** | 是 |
| `cd dashboard && npm ci` | 69s | 是 |
| `npm run build`（Vite 生产构建 → `src/octop/dashboard`） | 93s | 是 |
| `octop init --yes`（建 SQLite + 管理员） | 12s | 是（ensure 检测到无 `octop.db` 时自动补跑） |
| `octop run` 冷启动到 `/api/health` 200 | **~8–12s** | 每次起服 |

`ensure-octop.mjs` **不做全量 bootstrap**：venv 或 dashboard 产物缺失时直接报 `ENSURE_MISSING_VENV` / `ENSURE_MISSING_DASHBOARD`，并在报错文案里给出可执行命令，避免 Tab 静默挂 5 分钟。

## 首次启动成本（为什么要等）

| 步骤 | 耗时（本机实测） | 一次性？ |
| --- | --- | --- |
| `uv venv --python 3.12 .agent-venv` | ~10s | 是 |
| `uv pip install -e .`（含 octop-harness/playwright/psycopg 等全量依赖） | **207s** | 是 |
| `cd dashboard && npm ci` | 69s | 是 |
| `npm run build`（Vite 生产构建 → `src/octop/dashboard`） | 93s | 是 |
| `octop init --yes`（建 SQLite + 管理员） | 12s | 是（ensure 检测到无 `octop.db` 时自动补跑） |
| `octop run` 冷启动到 `/api/health` 200 | **~8–12s** | 每次起服 |

`ensure-octop.mjs` **不做全量 bootstrap**：venv 或 dashboard 产物缺失时直接报 `ENSURE_MISSING_VENV` / `ENSURE_MISSING_DASHBOARD`，并在报错文案里给出可执行命令，避免 Tab 静默挂 5 分钟。

## 初始化与登录（未改上游）

- `octop init --yes --admin-username admin --admin-password <env|默认>` 建首个管理员；
- 上游登录页是 **JWT + 滑块验证**（`/api/auth/login`，token 存 localStorage `auth_token`，不走 cookie）。
- 因为 `guest.auth="none"` 且 token 存 localStorage（同源 iframe 内持久），**iframe 内登录一次即长期有效**，不触发 `url-token-then-cookie`。
- 验收时的管理员：`admin` / `octopdev2026`（可用 `OCTOP_ADMIN_PASSWORD` 覆盖；**生产请改**）。

## 嵌页宿主能力缺口

| 上游能力 | 信号位置 | 嵌后风险 | 处置 (A–E) | 主路径 | 备注 |
| --- | --- | --- | --- | --- | --- |
| **Docker 沙箱**（Agent 执行后端 `type:"docker"`）⚠️ 部分交付 | `infra/agents/workspace/execute_env.py:30` `_EXECUTE_BACKEND_KINDS={"local_shell","docker"}`；`infra/backend/docker_spec.py` | **未启用**：本机拉新镜像失败（`TLS handshake timeout`），且按用户要求**不跑 Docker 沙箱** | **E**（不启用） | `local_shell`（上游默认） | Agent 执行走本机 shell，工作区在 `apps/data/octop/`；想开沙箱需先恢复 `docker pull` 再改 Agent execute backend |
| Playwright 浏览器自动化（`octop-browser`） | `pyproject` 依赖 `playwright` | 未执行 `playwright install chromium`，首次用浏览器工具会提示缺内核 | **C**（用户按需补装） | 手动触发 | 补齐：`.agent-venv/bin/python -m playwright install chromium` |
| **系统通知**（桌面通知/托盘） | 上游 `desktop/` Electron 壳内置 | iframe 内拿不到系统通知与托盘 | **D**（降级为站内提示） | 站内消息 | 上游 Web 形态本身也如此，不是嵌入造成 |
| **本地 ONNX Embedding** | `pip install "octop[local-embedding]"` | 未装，设置里的「本地模型」会不可用 | **B**（按需安装） | 云端 embedding | 装法：`uv pip install --python .agent-venv/bin/python "fastembed>=0.4"` |
| 知识库 OCR | `pip install "octop[knowledge-ocr]"` | 未装 PDF OCR 不可用 | **B** | 纯文本解析 | 按需装 |
| **纯单键快捷键**（xterm 终端 / Monaco） | 上游控制台含 xterm 5.5 + Monaco | iframe 收不到无修饰键按键 | **A**（已处置） | 面板已开 `iframeShortcutCapture: true` | 带 `Cmd/Ctrl` 的组合键仍归壳层（宿主既定规则） |
| 文件上传/下载（知识库、插件包） | `/api/uploads`、下载链接 | 无系统「另存为」对话框；走浏览器下载语义 | **D** | 站内预览 | 上游 Web 形态同此 |
| 上游自带 Electron 桌面壳（`desktop/`） | release dmg/exe | 未启用 | **E**（不接入） | Web 控制台 | 本任务只需控制台 Tab；桌面壳会变成「外置另开应用」，违反合同 §二.6 |
| 移动端 | 无原生形态 | — | **E** | 不提供 | `platforms.mobile="unsupported"` |

## 关键实现要点（给后续维护者）

1. **`main` 相对 `.agnx/`，`icon` 相对仓根**：`"main": "./dist/index.js"` ⇒ `.agnx/dist/index.js`；`"icon": "./.agnx/assets/octop-icon.svg"`。
2. **入口不能放仓根 `src/index.ts`**：上游根 `src/` 已被 `src/octop/` 占用；构建器按「仓根 `src/index.ts` → `.agnx/src/index.ts`」查找，本 app 走后者，**故意不建仓根 `src/index.ts`**。
3. **不用脚手架**：`scaffold-agnx-app.mjs` 会往仓根写 `package.json`，覆盖上游同名文件。故 `.agnx/` 全部手写。
4. **ensure 复用判定**：`/api/health` 200 + `stateFile(octop.json)` 指纹一致 → `reused:true`；端口被**别的**进程占着且指纹不符 → 报 `ENSURE_PORT_TAKEN`，不硬抢。
5. **子进程 stdio 一律落文件**（`--supervised` 时交 daemon，日志在 daemon 侧；非 supervised 落 `octop-run.log`），不 pipe。
6. **验收时的干扰**：本机同时有其它 app 在开发，抢前台会让非激活 Tab 的 iframe 被压成 0 宽（DOM 里 `w=0`）。截图脚本必须「聚焦 Octop → 校验 `aria-selected==="true"` 且 iframe 宽 > 200 → 立刻截」，否则会拍到别的 Tab。
7. **Octop 的 iframe 是 OOPIF**：`http://127.0.0.1:9333/json/list` 里是独立 `type:"iframe"` target，Playwright `page.frames()` 找不到它；要在 iframe 内操作/拖滑块，需直连该 target 的 WebSocket（见 `scripts/runtime-devtools/lib/cdp-native-session.mjs`），并用 `Input.dispatchMouseEvent` 派发滑块拖拽（上游滑块只监听 `mousedown/mousemove/mouseup`，无键盘路径）。

## 侧栏标题与图标（主管必查项）

| 检查项 | 结果 |
| --- | --- |
| `manifest.contributes.commands[0].title` | ✅ `"Octop"`（不是「打开 Octop」） |
| `registerCommand({ title })`（`.agnx/src/index.ts:58`） | ✅ `"Octop"` |
| `sidebarAction.label`（`.agnx/src/index.ts:62`） | ✅ `"Octop"` |
| 侧栏格子实际渲染文本 | ✅ `innerText === "Octop"`，`aria-label === "Octop"` |
| 侧栏格子有真实图标 | ✅ `<img src="blob:http://localhost:8083/...">`（不是占位圆） |
| `manifest.icon` | ✅ `./.agnx/assets/octop-icon.svg`（3528B，相对仓根） |
| `manifest.iconDark` | ✅ `./.agnx/assets/octop-icon-dark.svg`（3528B，与 icon 不同文件） |
| `assert-icon.mjs --paths=…/octop` | ✅ `PASS 1 / 1` |
| `assert-guest-panel-edge-to-edge.mjs` | ✅ `PASS 1 files` |

## 自验结论

| 项 | 结果 |
| --- | --- |
| A1 目录名 = manifest.id = config.appId | ✅ 三个都是 `octop` |
| A2/A3 `main` 存在且产物含新符号 | ✅ `.agnx/dist/index.js`，`grep -c` = 12（`octop.main` / `ensure-octop.mjs` / `OCTOP_APP_ID`） |
| A3' 产物 peer 白名单 | ✅ 只 `require("react")` 与 `require("react/jsx-runtime")` |
| A5 图标门闩 | ✅ `PASS 1 / 1`（`icon` 3528B + `iconDark` 3528B，两文件不同） |
| A6 贴边门闩 | ✅ `PASS 1 files` |
| B1/B2 重扫发现 | ✅ `installed` / `packaged` / `packaged-main` / `failures: []` / `iconPath` 非空 |
| B3 侧栏格子 | ✅ `sidebar-mini-app-grid-octop` 存在（整盘 58） |
| C1–C5 Tab 与面板 | ✅ Tab 出现、面板根存在、iframe `http://127.0.0.1:8123` 满铺 1174×850、面板内无 `GUEST_`/`ENSURE_`/`403` |
| D1 真实操作 | ✅ ① Guest 内真实登录（填账号密码 + **鼠标拖滑块**过验证 + 点登录）→ `/chat`；② 侧栏点「专家」→ `/experts`；③ 点「新建专家」→ 创建抽屉打开（含名称/描述/头像/配色）；④ 侧栏点「模型」→ `/admin/models` 模型配置页 |
| D2 操作后截图 | ✅ `logs/octop-desktop-02-after-open-experts.png` |
| D3 `gate error` | ✅ exit 0（无红屏） |
| D4 sidecar 复用 | ✅ 第二次 ensure 输出 `reused:true, pid:51104` |
| E1 翻态 packaged | ✅ 全程 `packaged` + `installed` |
