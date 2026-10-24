/**
 * 场景：Octop 面板 — 满铺 host + 首帧品牌遮罩 + 失败可见（照验收手册 §1.6 硬约束）。
 * 上游本身是 FastAPI 单端口同源托管 dashboard，故走 ensureTool 轨（不是 targetUrl）。
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
  type ReactElement,
} from "react";
import type {
  WorkspaceAppBrandLogoLoaderPanelProps,
  WorkspaceAppHostApi,
} from "@agnx-lab/app-sdk";
import {
  OCTOP_APP_ID,
  OCTOP_DEFAULT_PORT,
  OCTOP_ENSURE_TOOL_REL,
} from "./constants";

const WEB_ROOT_STYLE: CSSProperties = {
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
  backgroundColor: "transparent",
};

const GUEST_HOST_STYLE: CSSProperties = {
  flex: "1 1 auto",
  minHeight: 0,
  minWidth: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  position: "relative",
};

const BOOT_LAYER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 2,
  display: "flex",
  flexDirection: "column",
  background: "rgb(9, 9, 11)",
};

const ERROR_LAYER_STYLE: CSSProperties = {
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
  lineHeight: 1.6,
};

const RETAIN_REASON = "octop-open";
const ENSURE_TIMEOUT_MS = 300_000;
const SURFACE_READY_TIMEOUT_MS = 120_000;

let boundHost: WorkspaceAppHostApi | null = null;

export function bindOctopPanelHost(host: WorkspaceAppHostApi): void {
  boundHost = host;
}

function requireBoundHost(): WorkspaceAppHostApi {
  if (!boundHost) throw new Error("Octop host 未绑定");
  return boundHost;
}

function canUseGuestSurface(): boolean {
  return typeof document !== "undefined" && requireBoundHost().platform.isWeb;
}

export function OctopPanel(_props: {
  appId?: string;
  panelId?: string;
  entityId?: string;
}): ReactElement {
  const guestHostRef = useRef<HTMLDivElement | null>(null);
  // 首帧即 true：在 await mount 之前盖住空 host，避免黑屏一闪。
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = requireBoundHost();
    host.background?.requestRetain?.({
      appId: OCTOP_APP_ID,
      active: true,
      reason: RETAIN_REASON,
    });
    return () => {
      host.background?.requestRetain?.({
        appId: OCTOP_APP_ID,
        active: false,
        reason: RETAIN_REASON,
      });
    };
  }, []);

  useEffect(() => {
    const host = requireBoundHost();
    if (!canUseGuestSurface()) {
      setBooting(false);
      setError("Octop 控制台只在支持嵌页的端可用（桌面 / 网页）。");
      return;
    }
    if (!host.guest?.mount || !guestHostRef.current) {
      setBooting(false);
      setError("宿主未提供 host.guest.mount（需升级 Agnx 并重新扫描子应用）。");
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
      bootTitle: "正在启动 Octop…",
      onReady: () => {
        if (cancelled) return;
        window.setTimeout(() => {
          if (!cancelled) setBooting(false);
        }, 320);
      },
      onError: (detail) => {
        if (cancelled) return;
        setBooting(false);
        setError(`${detail?.code ?? "GUEST_MOUNT_FAILED"}: ${detail?.message ?? "未知错误"}`);
      },
    });
    return () => {
      cancelled = true;
      unmount?.();
    };
  }, []);

  const BrandPanel = requireBoundHost().ui?.BrandLogoLoaderPanel as
    | ComponentType<WorkspaceAppBrandLogoLoaderPanelProps>
    | undefined;

  return (
    <div style={WEB_ROOT_STYLE} data-testid={`workspace-mini-app-${OCTOP_APP_ID}-root`}>
      <div ref={guestHostRef} data-agnx-guest-surface-host="true" style={GUEST_HOST_STYLE} />
      {booting && !error && BrandPanel ? (
        <div data-agnx-guest-boot-overlay="true" style={BOOT_LAYER_STYLE} role="status">
          <BrandPanel title="正在启动 Octop…" testID="octop-boot-overlay" />
        </div>
      ) : null}
      {error ? (
        <div style={ERROR_LAYER_STYLE} role="alert">
          <div>Octop 未能打开</div>
          <div>{error}</div>
        </div>
      ) : null}
    </div>
  );
}
