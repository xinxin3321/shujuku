/**
 * service/table/table-storage-strategy.ts — 表格存储策略选择器
 *
 * 根据用户设置选择 native 或 sqlite 模式的 Provider。
 * 提供全局单例访问点，是上层代码获取 Provider 的唯一入口。
 */

import type { ITableStorageProvider, StorageMode } from '../../shared/table-storage-provider';
import { getCurrentStorageMode } from './storage-mode';
import { NativeTableServiceAdapter } from './native-table-service-adapter';
import { SqlTableService } from './sql-table-service';
import { logDebug_ACU, logError_ACU } from '../../shared/utils';

/** 当前活跃的 Provider 实例 */
let currentProvider: ITableStorageProvider | null = null;

/**
 * 获取当前存储提供者
 * 如果尚未初始化，会根据当前设置自动创建
 */
export function getStorageProvider(): ITableStorageProvider {
  if (!currentProvider) {
    // 懒初始化：根据当前模式创建 Provider
    const mode = getCurrentStorageMode();
    currentProvider = createProvider(mode);
    logDebug_ACU(`[StorageStrategy] 懒初始化 Provider: ${mode}`);
  }
  return currentProvider;
}

/**
 * 初始化存储提供者（应用启动时调用）
 * 根据当前设置创建 Provider 并执行 loadFromChat
 */
export async function initStorageProvider(): Promise<void> {
  const mode = getCurrentStorageMode();

  // 销毁旧实例
  if (currentProvider) {
    currentProvider.dispose();
    currentProvider = null;
  }

  // 创建新实例
  currentProvider = createProvider(mode);
  logDebug_ACU(`[StorageStrategy] 初始化 Provider: ${mode}`);

  // 加载数据
  try {
    const result = await currentProvider.loadFromChat();
    logDebug_ACU(`[StorageStrategy] 数据加载完成: loaded=${result.loaded}, source=${result.source}`);

    // SQLite 模式加载失败时自动 fallback 到原生模式
    if (mode === 'sqlite' && !result.loaded && result.error) {
      logError_ACU(`[StorageStrategy] SQLite 加载失败，自动 fallback 到原生模式: ${result.error}`);
      currentProvider.dispose();
      currentProvider = createProvider('native');
      await currentProvider.loadFromChat();
    }
  } catch (e: any) {
    logError_ACU(`[StorageStrategy] 初始化失败: ${e?.message}`);
    // 确保至少有一个可用的 Provider
    if (mode === 'sqlite') {
      logError_ACU('[StorageStrategy] SQLite 初始化异常，fallback 到原生模式');
      if (currentProvider) currentProvider.dispose();
      currentProvider = createProvider('native');
      await currentProvider.loadFromChat();
    }
  }
}

/**
 * 切换存储模式（用户在设置中切换时调用）
 * 1. 销毁旧 Provider
 * 2. 创建新 Provider
 * 3. 重新加载数据
 *
 * @param mode 目标模式
 */
export async function switchStorageMode(mode: StorageMode): Promise<void> {
  const currentMode = currentProvider?.mode;
  if (currentMode === mode) {
    logDebug_ACU(`[StorageStrategy] 已经是 ${mode} 模式，无需切换`);
    return;
  }

  logDebug_ACU(`[StorageStrategy] 切换模式: ${currentMode || 'none'} → ${mode}`);

  // 销毁旧实例
  if (currentProvider) {
    currentProvider.dispose();
    currentProvider = null;
  }

  // 创建新实例并加载数据
  currentProvider = createProvider(mode);

  try {
    const result = await currentProvider.loadFromChat();
    logDebug_ACU(`[StorageStrategy] 切换完成: loaded=${result.loaded}, source=${result.source}`);

    // SQLite 模式加载失败时 fallback
    if (mode === 'sqlite' && !result.loaded && result.error) {
      logError_ACU(`[StorageStrategy] SQLite 切换失败，fallback 到原生模式: ${result.error}`);
      currentProvider.dispose();
      currentProvider = createProvider('native');
      await currentProvider.loadFromChat();
      throw new Error(`SQLite 模式切换失败: ${result.error}。已自动回退到原生模式。`);
    }
  } catch (e: any) {
    // 如果是我们自己抛出的 fallback 错误，重新抛出
    if (e.message?.includes('已自动回退')) throw e;

    logError_ACU(`[StorageStrategy] 切换异常: ${e?.message}`);
    // 确保有可用的 Provider
    if (!currentProvider || !currentProvider.getCurrentData()) {
      currentProvider?.dispose();
      currentProvider = createProvider('native');
      await currentProvider.loadFromChat();
    }
    throw e;
  }
}

/**
 * 立即销毁当前 Provider 实例，释放内存数据库资源
 * 用于换卡/换聊天时在状态重置之前立即清理旧数据库，
 * 避免 1200ms 延迟窗口内的数据不一致问题。
 *
 * 销毁后 getStorageProvider() 会触发懒初始化创建新实例。
 * 调用方应在适当时机调用 reloadStorageProvider() 重建并加载数据。
 */
export function disposeStorageProvider(): void {
  if (currentProvider) {
    logDebug_ACU(`[StorageStrategy] 销毁当前 Provider: ${currentProvider.mode}`);
    currentProvider.dispose();
    currentProvider = null;
  }
}

/**
 * 重新加载数据（楼层删除、回滚等场景）
 * 不切换模式，只重新从聊天消息加载
 */
export async function reloadStorageProvider(): Promise<void> {
  if (!currentProvider) {
    await initStorageProvider();
    return;
  }

  const mode = currentProvider.mode;
  logDebug_ACU(`[StorageStrategy] 重新加载数据: ${mode}`);

  // SQLite 模式需要重建数据库
  if (mode === 'sqlite') {
    currentProvider.dispose();
    currentProvider = createProvider('sqlite');
  }

  try {
    await currentProvider.loadFromChat();
  } catch (e: any) {
    logError_ACU(`[StorageStrategy] 重新加载失败: ${e?.message}`);
    // SQLite 失败时 fallback
    if (mode === 'sqlite') {
      currentProvider.dispose();
      currentProvider = createProvider('native');
      await currentProvider.loadFromChat();
    }
  }
}

/**
 * 获取当前 Provider 的模式
 * 如果未初始化返回 null
 */
export function getCurrentProviderMode(): StorageMode | null {
  return currentProvider?.mode ?? null;
}

// ═══════════════════════════════════════════════════════════════
// 内部工具函数
// ═══════════════════════════════════════════════════════════════

/** 根据模式创建 Provider 实例 */
function createProvider(mode: StorageMode): ITableStorageProvider {
  switch (mode) {
    case 'sqlite':
      return new SqlTableService();
    case 'native':
    default:
      return new NativeTableServiceAdapter();
  }
}
