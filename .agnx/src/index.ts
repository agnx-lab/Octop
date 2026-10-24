/**
 * 场景：Octop Sub App 入口 — Guest（auth:none）+ ensure sidecar :8123。
 */
import type { WorkspaceAppHostApi, WorkspaceAppModule } from "@agnx-lab/app-sdk";
import {
  OCTOP_APP_ID,
  OCTOP_DEFAULT_PORT,
  OCTOP_ENSURE_TOOL_REL,
  OCTOP_OPEN_COMMAND_ID,
  OCTOP_PANEL_ID,
} from "./constants";
import { bindOctopPanelHost, OctopPanel } from "./panel";

export const appId = OCTOP_APP_ID;

function openOctopTab(
  host: WorkspaceAppHostApi,
  context?: {
    serverId?: string;
    workspaceId?: string;
    currentPathname?: string | null;
  },
): void {
  host.openSubAppTab({
    appId: OCTOP_APP_ID,
    panelId: OCTOP_PANEL_ID,
    serverId: context?.serverId,
    workspaceId: context?.workspaceId,
    currentPathname: context?.currentPathname,
  });
}

export function activate(host: WorkspaceAppHostApi): () => void {
  bindOctopPanelHost(host);
  const disposers: Array<() => void> = [];

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
        note: `Tab Guest 加载本机 Octop 控制台（FastAPI 单端口同源托管 dashboard）；ensure 起 127.0.0.1:${OCTOP_DEFAULT_PORT}`,
      },
    }),
  );

  disposers.push(
    host.registerCommand({
      id: OCTOP_OPEN_COMMAND_ID,
      appId: OCTOP_APP_ID,
      title: "Octop",
      keywords: ["octop", "腾讯云", "ai assistant", "多用户", "多agent", "微信", "飞书", "钉钉"],
      sidebarAction: {
        defaultVisible: true,
        label: "Octop",
        order: 67,
      },
      run: (context) => {
        openOctopTab(host, context);
      },
    }),
  );

  return () => {
    for (const dispose of disposers.toReversed()) dispose();
  };
}

const moduleExport: WorkspaceAppModule = {
  appId: OCTOP_APP_ID,
  activate,
};

export default moduleExport;

export {
  OCTOP_APP_ID,
  OCTOP_DEFAULT_PORT,
  OCTOP_ENSURE_TOOL_REL,
  OCTOP_OPEN_COMMAND_ID,
  OCTOP_PANEL_ID,
} from "./constants";
export { OctopPanel } from "./panel";
