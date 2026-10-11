import type { ItemKind } from "./clipbox-core";
import { SECRET_WORD } from "./platform";
import { Icon, VaultMark } from "./ui-atoms";

// The "nothing here" panel of the list: first-run onboarding or a plain empty folder / no search result
// (moved out of page.tsx unchanged).
export function ListEmptyState({ firstRun, activeKind, activeFolder, query, searchAllFolders, isMini, onAdd, onImportSheet, onImportBackup }: {
  firstRun: boolean;
  activeKind: ItemKind;
  activeFolder: string;
  query: string;
  searchAllFolders: boolean;
  isMini: boolean;
  onAdd: () => void;
  onImportSheet: () => void;
  onImportBackup: () => void;
}) {
  if (firstRun) {
    return (
      <div className="native-empty onboarding">
        <VaultMark />
        <strong>{activeKind === "snippet" ? "还没有话术，先添加第一条" : `还没有${SECRET_WORD}，先添加第一条`}</strong>
        <span>{activeKind === "snippet" ? "把常回复的话存进来，一键复制。正文里用 [名字] 标出要替换的内容。" : "密码和密钥加密保存在本机，默认只复制引用，不暴露明文。"}</span>
        <div className="onboarding-actions">
          <button type="button" className="primary-button" onClick={onAdd}><Icon name="plus" />新增第一条</button>
          {activeKind === "snippet" && <button type="button" className="secondary-button" onClick={onImportSheet}>导入话术表格</button>}
          <button type="button" className="secondary-button" onClick={onImportBackup}>导入备份</button>
        </div>
        {activeKind === "snippet" && <small>内容用 AES-256 加密，只保存在这台设备上</small>}
      </div>
    );
  }
  return (
    <div className="native-empty"><strong>{query ? "没有匹配的内容" : activeFolder === "trash" ? "回收站是空的" : activeFolder === "pinned" ? "还没有收藏内容" : activeFolder === "recent" ? "还没有使用记录" : "这个目录还是空的"}</strong><span>{query ? (searchAllFolders || activeFolder === "all" ? "换个词搜索试试" : "换个词，或改为搜索全部目录") : activeFolder === "trash" ? "删除的内容会加密保留在这里" : activeFolder === "pinned" ? "点条目右侧的星标添加收藏" : activeFolder === "recent" ? "复制过的内容会出现在这里" : isMini ? "回到完整窗口添加第一条" : "点右上角的「新增」添加第一条"}</span></div>
  );
}
