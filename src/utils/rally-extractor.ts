// src/utils/rally-extractor.ts
export interface RallyDetail {
  path: string;                 // JSON 路径（定位用）
  collection_id?: string;
  display?: any;
  stamp_metadata?: any;
  reward_progress?: any;
  sourceMethodId?: number;
  sourceMethodName?: string;
}

function hasAnyKey(o: any, keys: string[]): boolean {
  return !!o && typeof o === "object" && keys.some(k => Object.prototype.hasOwnProperty.call(o, k));
}
function toPath(parent: string, key: string): string {
  return parent ? parent + "." + key : key;
}

// 递归扫描 root，凡是包含 display / stamp_metadata / reward_progress 的对象就收集
export function extractRallyDetails(root: any): RallyDetail[] {
  const results: RallyDetail[] = [];
  const KEYS = ["display", "stamp_metadata", "reward_progress"];
  const stack: Array<{ node: any; path: string }> = [{ node: root, path: "" }];

  while (stack.length) {
    const { node, path } = stack.pop()!;
    if (!node || typeof node !== "object") continue;

    if (hasAnyKey(node, KEYS)) {
      results.push({
        path,
        collection_id: typeof (node as any).collection_id === "string" ? (node as any).collection_id : undefined,
        display: (node as any).display,
        stamp_metadata: (node as any).stamp_metadata,
        reward_progress: (node as any).reward_progress,
      });
    }

    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) {
        stack.push({ node: node[i], path: toPath(path, String(i)) });
      }
    } else {
      for (const k of Object.keys(node)) {
        stack.push({ node: (node as any)[k], path: toPath(path, k) });
      }
    }
  }
  return results;
}
