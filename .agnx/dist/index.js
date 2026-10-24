var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// .agnx/src/index.ts
var index_exports = {};
__export(index_exports, {
  OCTOP_APP_ID: () => OCTOP_APP_ID,
  OCTOP_DEFAULT_PORT: () => OCTOP_DEFAULT_PORT,
  OCTOP_ENSURE_TOOL_REL: () => OCTOP_ENSURE_TOOL_REL,
  OCTOP_OPEN_COMMAND_ID: () => OCTOP_OPEN_COMMAND_ID,
  OCTOP_PANEL_ID: () => OCTOP_PANEL_ID,
  OctopPanel: () => OctopPanel,
  activate: () => activate,
  appId: () => appId,
  default: () => index_default
});
module.exports = __toCommonJS(index_exports);

// .agnx/src/constants.ts
var OCTOP_APP_ID = "octop";
var OCTOP_PANEL_ID = "octop.main";
var OCTOP_OPEN_COMMAND_ID = "octop.open";
var OCTOP_ENSURE_TOOL_REL = ".agnx/tools/ensure-octop.mjs";
var OCTOP_DEFAULT_PORT = 8123;

// .agnx/src/panel.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var WEB_ROOT_STYLE = {
  flex: "1 1 0%",
  alignSelf: "stretch",
  minHeight: 0,
  minWidth: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  position: "relative",
  backgroundColor: "transparent"
};
var GUEST_HOST_STYLE = {
  flex: "1 1 auto",
  minHeight: 0,
  minWidth: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  position: "relative"
};
var BOOT_LAYER_STYLE = {
  position: "absolute",
  inset: 0,
  zIndex: 2,
  display: "flex",
  flexDirection: "column",
  background: "rgb(9, 9, 11)"
};
var ERROR_LAYER_STYLE = {
  position: "absolute",
  inset: 0,
  zIndex: 3,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: 24,
  textAlign: "center",
  color: "#a1a1aa",
  background: "rgba(9,9,11,0.94)",
  fontSize: 13,
  lineHeight: 1.6
};
var RETAIN_REASON = "octop-open";
var ENSURE_TIMEOUT_MS = 3e5;
var SURFACE_READY_TIMEOUT_MS = 12e4;
var boundHost = null;
function bindOctopPanelHost(host) {
  boundHost = host;
}
function requireBoundHost() {
  if (!boundHost) throw new Error("Octop host \u672A\u7ED1\u5B9A");
  return boundHost;
}
function canUseGuestSurface() {
  return typeof document !== "undefined" && requireBoundHost().platform.isWeb;
}
function OctopPanel(_props) {
  const guestHostRef = (0, import_react.useRef)(null);
  const [booting, setBooting] = (0, import_react.useState)(true);
  const [error, setError] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
    const host = requireBoundHost();
    host.background?.requestRetain?.({
      appId: OCTOP_APP_ID,
      active: true,
      reason: RETAIN_REASON
    });
    return () => {
      host.background?.requestRetain?.({
        appId: OCTOP_APP_ID,
        active: false,
        reason: RETAIN_REASON
      });
    };
  }, []);
  (0, import_react.useEffect)(() => {
    const host = requireBoundHost();
    if (!canUseGuestSurface()) {
      setBooting(false);
      setError("Octop \u63A7\u5236\u53F0\u53EA\u5728\u652F\u6301\u5D4C\u9875\u7684\u7AEF\u53EF\u7528\uFF08\u684C\u9762 / \u7F51\u9875\uFF09\u3002");
      return;
    }
    if (!host.guest?.mount || !guestHostRef.current) {
      setBooting(false);
      setError("\u5BBF\u4E3B\u672A\u63D0\u4F9B host.guest.mount\uFF08\u9700\u5347\u7EA7 Agnx \u5E76\u91CD\u65B0\u626B\u63CF\u5B50\u5E94\u7528\uFF09\u3002");
      return;
    }
    let cancelled = false;
    const unmount = host.guest.mount({
      container: guestHostRef.current,
      ensureTool: OCTOP_ENSURE_TOOL_REL,
      ensureArgs: ["--port", String(OCTOP_DEFAULT_PORT)],
      timeoutMs: ENSURE_TIMEOUT_MS,
      surfaceReadyTimeoutMs: SURFACE_READY_TIMEOUT_MS,
      bootOverlay: false,
      bootTitle: "\u6B63\u5728\u542F\u52A8 Octop\u2026",
      onReady: () => {
        if (cancelled) return;
        window.setTimeout(() => {
          if (!cancelled) setBooting(false);
        }, 320);
      },
      onError: (detail) => {
        if (cancelled) return;
        setBooting(false);
        setError(`${detail?.code ?? "GUEST_MOUNT_FAILED"}: ${detail?.message ?? "\u672A\u77E5\u9519\u8BEF"}`);
      }
    });
    return () => {
      cancelled = true;
      unmount?.();
    };
  }, []);
  const BrandPanel = requireBoundHost().ui?.BrandLogoLoaderPanel;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: WEB_ROOT_STYLE, "data-testid": `workspace-mini-app-${OCTOP_APP_ID}-root`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { ref: guestHostRef, "data-agnx-guest-surface-host": "true", style: GUEST_HOST_STYLE }),
    booting && !error && BrandPanel ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { "data-agnx-guest-boot-overlay": "true", style: BOOT_LAYER_STYLE, role: "status", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BrandPanel, { title: "\u6B63\u5728\u542F\u52A8 Octop\u2026", testID: "octop-boot-overlay" }) }) : null,
    error ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: ERROR_LAYER_STYLE, role: "alert", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: "Octop \u672A\u80FD\u6253\u5F00" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: error })
    ] }) : null
  ] });
}

// .agnx/src/index.ts
var appId = OCTOP_APP_ID;
function openOctopTab(host, context) {
  host.openSubAppTab({
    appId: OCTOP_APP_ID,
    panelId: OCTOP_PANEL_ID,
    serverId: context?.serverId,
    workspaceId: context?.workspaceId,
    currentPathname: context?.currentPathname
  });
}
function activate(host) {
  bindOctopPanelHost(host);
  const disposers = [];
  disposers.push(
    host.registerMiniApp({
      id: OCTOP_PANEL_ID,
      appId: OCTOP_APP_ID,
      title: "Octop",
      component: OctopPanel,
      primaryPanel: true,
      // 上游 dashboard 有 xterm 终端 / Monaco 编辑器，需要单键快捷键落进 iframe。
      iframeShortcutCapture: true,
      isolation: {
        mode: "iframe",
        sidecarTools: [OCTOP_ENSURE_TOOL_REL],
        note: `Tab Guest \u52A0\u8F7D\u672C\u673A Octop \u63A7\u5236\u53F0\uFF08FastAPI \u5355\u7AEF\u53E3\u540C\u6E90\u6258\u7BA1 dashboard\uFF09\uFF1Bensure \u8D77 127.0.0.1:${OCTOP_DEFAULT_PORT}`
      }
    })
  );
  disposers.push(
    host.registerCommand({
      id: OCTOP_OPEN_COMMAND_ID,
      appId: OCTOP_APP_ID,
      title: "Octop",
      keywords: ["octop", "\u817E\u8BAF\u4E91", "ai assistant", "\u591A\u7528\u6237", "\u591Aagent", "\u5FAE\u4FE1", "\u98DE\u4E66", "\u9489\u9489"],
      sidebarAction: {
        defaultVisible: true,
        label: "Octop",
        order: 67
      },
      run: (context) => {
        openOctopTab(host, context);
      }
    })
  );
  return () => {
    for (const dispose of disposers.toReversed()) dispose();
  };
}
var moduleExport = {
  appId: OCTOP_APP_ID,
  activate
};
var index_default = moduleExport;
