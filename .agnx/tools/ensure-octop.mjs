#!/usr/bin/env node
/**
 * 场景：Octop sidecar — 确保本机 Octop 控制台（FastAPI + 已构建 dashboard）在 :8123 loopback 起好。
 * 用法：node .agnx/tools/ensure-octop.mjs [--port 8123] [--work-dir <dataRoot>] [--supervised] [--force-restart]
 * stdout：最后一行 JSON
 *   - --supervised：{"ok":true,"plan":{command,args,cwd,env,fingerprint,healthUrl,port}}（daemon 托管）
 *   - 复用已起服务：{"ok":true,"reused":true,"origin":"http://127.0.0.1:8123","pid":N}
 *
 * 设计要点（对应验收手册 §2.2）：
 *   1. 数据根 = --work-dir（宿主注入 AGNX_APP_DATA_ROOT）→ 传给上游 OCTOP_HOME；
 *      绝不写进 apps/octop/（那里是代码树）。
 *   2. Python 环境用仓库根 .agent-venv（uv 建的 3.12），不用系统 3.14。
 *      venv 不存在时拒绝启动并给出可执行指引，不偷偷全量 bootstrap。
 *   3. 首次启动前如果数据库还没建（无 octop.db），跑一次 `octop init --yes` 建管理员，
 *      凭据写在该步骤 stdout 里；不改上游任何代码。
 *   4. 子进程 stdio 一律重定向文件，绝不 pipe（tabtin 坑 #1）。
 */
import { spawn, spawnSync } from "node:child_process";
import { access, constants as fsConstants, mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const APP_ID = "octop";
const ENSURE_ID = "ensure-octop";
const STATE_FILE = "octop.json";
const DEFAULT_PORT = 8123;
const VENV_PYTHON = path.join(repoRoot, ".agent-venv", "bin", "python");
const FALLBACK_WORK_DIR = path.join(repoRoot, "logs");

function parseArgs(argv) {
  let port = DEFAULT_PORT;
  let supervised = false;
  let forceRestart = false;
  let workDir = process.env.AGNX_APP_DATA_ROOT || "";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--port" && next) {
      const n = Number(next);
      if (Number.isFinite(n) && n > 0) port = n;
      i += 1;
    } else if ((arg === "--work-dir" || arg === "--workDir") && next) {
      workDir = String(next).trim();
      i += 1;
    } else if (arg === "--supervised") {
      supervised = true;
    } else if (arg === "--force-restart") {
      forceRestart = true;
    }
  }
  return {
    port,
    supervised,
    forceRestart,
    // supervised 必须拿到宿主注入的数据根；非 supervised 兜底到 logs/ 便于本地手跑。
    workDir: workDir || (supervised ? "" : FALLBACK_WORK_DIR),
  };
}

/** 失败一律按宿主能识别的形状输出（ENSURE_* 前缀会在面板上可见）。 */
function fail(code, message, extra = {}) {
  console.log(
    JSON.stringify({ ok: false, appId: APP_ID, ensureId: ENSURE_ID, error: code, message, ...extra }),
  );
  process.exit(1);
}

async function exists(p) {
  try {
    await access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function httpOk(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode != null && res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForHealth(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await httpOk(`http://127.0.0.1:${port}/api/health`)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function readState(statePath) {
  try {
    return JSON.parse(await readFile(statePath, "utf8"));
  } catch {
    return null;
  }
}

async function writeState(statePath, payload) {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify(payload, null, 2), "utf8");
}

function stopPid(pid) {
  const n = Number(pid);
  if (!Number.isFinite(n) || n <= 0) return;
  try {
    process.kill(n, "SIGTERM");
  } catch {
    // 已退出
  }
}

/** 启动环境：数据根 + 模型/机器人 token 等用户配置全部留在 data 根。 */
function launchEnv(cfg) {
  return {
    OCTOP_HOME: cfg.workDir,
    OCTOP_BIND_HOST: "127.0.0.1",
    OCTOP_PORT: String(cfg.port),
    PYTHONUNBUFFERED: "1",
    // venv 里的解释器无需这两个，但显式清掉可避免宿主环境串味。
    PYTHONHOME: "",
  };
}

function fingerprint(cfg) {
  return JSON.stringify({ repoRoot, port: cfg.port, workDir: cfg.workDir, v: 1 });
}

/** 数据库还没建时跑一次官方 init（幂等，不改代码）。 */
async function ensureBootstrapped(cfg) {
  const dbPath = path.join(cfg.workDir, "octop.db");
  if (await exists(dbPath)) return { bootstrapped: false };
  const r = spawnSync(
    VENV_PYTHON,
    [
      "-m",
      "octop",
      "init",
      "--admin-username",
      process.env.OCTOP_ADMIN_USERNAME || "admin",
      "--admin-password",
      process.env.OCTOP_ADMIN_PASSWORD || "octopdev2026",
      "--admin-display-name",
      process.env.OCTOP_ADMIN_DISPLAY_NAME || "Agnx Admin",
      "--yes",
    ],
    {
      cwd: repoRoot,
      env: { ...process.env, ...launchEnv(cfg) },
      encoding: "utf8",
      timeout: 300_000,
    },
  );
  const tail = `${r.stdout || ""}${r.stderr || ""}`.trim().split("\n").slice(-4).join(" | ");
  if (r.status !== 0) {
    fail("ENSURE_OCTOP_INIT_FAILED", `octop init 失败（status=${r.status}）：${tail}`, {
      port: cfg.port,
    });
  }
  return { bootstrapped: true, initTail: tail };
}

function buildPlan(cfg, extra) {
  return {
    command: VENV_PYTHON,
    args: ["-m", "octop", "run", "--host", "127.0.0.1", "--port", String(cfg.port)],
    cwd: repoRoot,
    env: launchEnv(cfg),
    fingerprint: fingerprint(cfg),
    healthUrl: `http://127.0.0.1:${cfg.port}/api/health`,
    port: cfg.port,
    ...extra,
  };
}

async function main() {
  const cfg = parseArgs(process.argv.slice(2));

  if (!cfg.workDir) {
    fail("ENSURE_MISSING_DATA_ROOT", "supervised 须由 daemon 注入 AGNX_APP_DATA_ROOT / --work-dir。");
  }
  if (!(await exists(VENV_PYTHON))) {
    fail(
      "ENSURE_MISSING_VENV",
      `缺少 Python 环境 ${VENV_PYTHON}。请在该目录执行：uv venv --python 3.12 .agent-venv && uv pip install --python .agent-venv/bin/python -e .（详见 EMBED.md「首次成本」）`,
      { repoRoot },
    );
  }
  if (!(await exists(path.join(repoRoot, "src", "octop", "dashboard", "index.html")))) {
    fail(
      "ENSURE_MISSING_DASHBOARD",
      "缺少已构建的 Web 控制台 src/octop/dashboard/index.html。请执行：cd dashboard && npm ci && npm run build（详见 EMBED.md）。",
      { repoRoot },
    );
  }

  await mkdir(cfg.workDir, { recursive: true });
  const statePath = path.join(cfg.workDir, STATE_FILE);
  const wantedFp = fingerprint(cfg);
  const healthy = await httpOk(`http://127.0.0.1:${cfg.port}/api/health`);

  // 复用判定：端口已经健康 + state 记录的指纹一致（且不是强制重启）
  if (!cfg.forceRestart && healthy) {
    const state = await readState(statePath);
    if (!state || state.fingerprint === wantedFp) {
      console.log(
        JSON.stringify({
          ok: true,
          reused: true,
          appId: APP_ID,
          ensureId: ENSURE_ID,
          port: cfg.port,
          pid: state?.pid ?? null,
          origin: `http://127.0.0.1:${cfg.port}`,
          workDir: cfg.workDir,
        }),
      );
      return;
    }
    fail(
      "ENSURE_PORT_TAKEN",
      `端口 ${cfg.port} 已被别的进程占用（指纹不符），不下手抢占。请 lsof -nP -iTCP:${cfg.port} -sTCP:LISTEN 核对。`,
      { port: cfg.port, state },
    );
  }

  const bootstrap = await ensureBootstrapped(cfg);

  if (cfg.supervised) {
    console.log(
      JSON.stringify({
        ok: true,
        appId: APP_ID,
        ensureId: ENSURE_ID,
        origin: `http://127.0.0.1:${cfg.port}`,
        port: cfg.port,
        reused: false,
        workDir: cfg.workDir,
        bootstrap,
        plan: buildPlan(cfg, {}),
      }),
    );
    return;
  }

  // 非 supervised：自己 spawn（stdio 落日志文件），等健康后输出 origin。
  const logFile = path.join(cfg.workDir, "octop-run.log");
  const out = (await import("node:fs")).openSync(logFile, "a");
  const child = spawn(VENV_PYTHON, ["-m", "octop", "run", "--host", "127.0.0.1", "--port", String(cfg.port)], {
    cwd: repoRoot,
    env: { ...process.env, ...launchEnv(cfg) },
    detached: true,
    stdio: ["ignore", out, out],
  });
  child.unref();
  const ready = await waitForHealth(cfg.port, 180_000);
  if (!ready) {
    stopPid(child.pid);
    fail(`ENSURE_OCTOP_START_TIMEOUT`, `Octop 180s 未就绪（port=${cfg.port}），见日志 ${logFile}`, {
      port: cfg.port,
    });
  }
  await writeState(statePath, {
    fingerprint: wantedFp,
    port: cfg.port,
    pid: child.pid ?? null,
    origin: `http://127.0.0.1:${cfg.port}`,
    workDir: cfg.workDir,
    updatedAt: Date.now(),
  });
  console.log(
    JSON.stringify({
      ok: true,
      reused: false,
      appId: APP_ID,
      ensureId: ENSURE_ID,
      port: cfg.port,
      pid: child.pid ?? null,
      origin: `http://127.0.0.1:${cfg.port}`,
      workDir: cfg.workDir,
      bootstrap,
    }),
  );
}

main().catch((error) => {
  fail("ENSURE_OCTOP_UNEXPECTED", String(error?.stack || error));
});
