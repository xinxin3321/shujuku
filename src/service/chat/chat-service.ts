/**
 * service/chat/chat-service.ts — 聊天数据服务
 *
 * 中转 data/gateways/chat-gateway 的所有方法。
 * presentation 层通过本模块访问聊天数据，不再直接调用 gateway。
 * 后续可在此层统一添加日志、埋点、缓存等增值逻辑。
 */

export {
    getChatArray_ACU,
    getChatLength_ACU,
    getLastMessageIndex_ACU,
    saveChatToHost_ACU,
    stopGeneration_ACU,
    deleteLastMessage_ACU,
    setChatMessages_ACU,
    emitMessageUpdated_ACU,
} from '../../data/gateways/chat-gateway';

import { getChatArray_ACU, saveChatToHost_ACU, setChatMessages_ACU, emitMessageUpdated_ACU } from '../../data/gateways/chat-gateway';
import { logDebug_ACU, logError_ACU, logWarn_ACU, isSummaryOrOutlineTable_ACU } from '../../shared/utils';
import { getLastOptimizationBase_ACU, setLastOptimizationBase_ACU } from '../optimization/content-optimization';
import { settings_ACU, currentJsonTableData_ACU, getCurrentIsolationKey_ACU } from '../runtime/state-manager';
import { sanitizeSheetForStorage_ACU } from '../template/chat-scope';
import { clearTableFieldsForIsolation_ACU } from '../../data/repositories/chat-message-data-repo';
import { runTableUpdateCommit_ACU } from '../table/table-update-commit';
import { getLatestAiMessageIndexFromChat_ACU, resolveTableHistoryStateFromChat_ACU } from '../table/table-history';
import { deleteSummaryVectorIndexExternal_ACU } from '../vector/summary-vector-index-storage-service';
import { assignSummaryVectorIndexStateToTagData_ACU } from '../vector/summary-vector-index-state-service';
import { isV2TagData_ACU, resolveTableStorageStrategy_ACU } from '../table/storage-strategy-resolver';
import { collectScheduleSummaryFromFramesV2_ACU, loadTableStateFromFramesV2_ACU } from '../table/storage-frame-v2-replay';
import { runTableWriteTransaction_ACU } from '../table/table-write-transaction';
import type { TableMutationOperationV2_ACU, TableStorageFrameV2_ACU } from '../table/storage-frame-v2-types';

// ─── 业务逻辑函数（从 presentation 层搬迁） ───

const RETAIN_RECENT_CHECKPOINT_BUFFER_LAYERS_ACU = 20;

async function deleteVectorIndexManifestFromTagData_ACU(tagData: any): Promise<boolean> {
    if (!tagData || typeof tagData !== 'object') return false;
    const manifest = tagData.summaryVectorIndexManifest || tagData.summaryVectorIndexState?.manifest || null;
    if (manifest) {
        await deleteSummaryVectorIndexExternal_ACU(manifest);
    }
    const hadState = !!tagData.summaryVectorIndexState || !!tagData.summaryVectorIndexManifest;
    if (hadState) {
        assignSummaryVectorIndexStateToTagData_ACU(tagData, null);
    }
    return hadState || !!manifest;
}

function messageHasLocalLayerData_ACU(msg: any): boolean {
    if (!msg || typeof msg !== 'object') return false;
    return !!(
        msg.TavernDB_ACU_Data ||
        msg.TavernDB_ACU_SummaryData ||
        msg.TavernDB_ACU_IndependentData ||
        msg.TavernDB_ACU_ModifiedKeys ||
        msg.TavernDB_ACU_UpdateGroupKeys ||
        msg.TavernDB_ACU_IsolatedData ||
        msg.TavernDB_ACU_Identity ||
        msg.qrf_plot ||
        msg.qrf_plot_preset ||
        msg.qrf_plot_tasks
    );
}

async function deleteVectorIndexManifestsFromMessage_ACU(msg: any): Promise<number> {
    if (!msg || typeof msg !== 'object') return 0;
    const isolatedData = msg.TavernDB_ACU_IsolatedData;
    if (!isolatedData || typeof isolatedData !== 'object' || Array.isArray(isolatedData)) return 0;

    let deletedCount = 0;
    for (const isolationKey of Object.keys(isolatedData)) {
        try {
            if (await deleteVectorIndexManifestFromTagData_ACU(isolatedData[isolationKey])) {
                deletedCount++;
            }
        } catch (error) {
            logWarn_ACU(`[数据清理] 删除隔离标签 ${isolationKey} 的交火向量索引外置文件失败:`, error);
        }
    }
    return deletedCount;
}

function tableListContainsSummaryOrOutline_ACU(targetSheetKeys: string[]): boolean {
    if (!Array.isArray(targetSheetKeys) || targetSheetKeys.length === 0) return false;
    return targetSheetKeys.some((sheetKey) => {
        const table = currentJsonTableData_ACU?.[sheetKey];
        return !!table?.name && isSummaryOrOutlineTable_ACU(String(table.name || ''));
    });
}

function collectIsolationKeysWithV2Frames_ACU(chat: any[], options: { maxMessageIndex?: number } = {}): string[] {
    const keys = new Set<string>();
    const maxMessageIndex = Number.isInteger(options.maxMessageIndex) ? options.maxMessageIndex as number : Number.POSITIVE_INFINITY;
    for (let i = 0; i < chat.length && i <= maxMessageIndex; i++) {
        const msg = chat[i];
        if (!msg || msg.is_user) continue;
        const isolatedData = msg.TavernDB_ACU_IsolatedData;
        if (!isolatedData || typeof isolatedData !== 'object' || Array.isArray(isolatedData)) continue;
        for (const [isolationKey, tagData] of Object.entries(isolatedData)) {
            if (isV2TagData_ACU(tagData)) {
                keys.add(isolationKey);
            }
        }
    }
    return [...keys];
}

function hasV2FullCheckpointInRange_ACU(chat: any[], isolationKey: string, startIndex: number, endIndex: number): boolean {
    if (!Array.isArray(chat) || startIndex > endIndex) return false;
    const start = Math.max(0, startIndex);
    const end = Math.min(chat.length - 1, endIndex);
    for (let i = start; i <= end; i++) {
        const msg = chat[i];
        if (!msg || msg.is_user) continue;
        const tagData = msg.TavernDB_ACU_IsolatedData?.[isolationKey];
        if (isV2TagData_ACU(tagData) && tagData.storageFrame.checkpoint?.kind === 'full') {
            return true;
        }
    }
    return false;
}

function selectLastAiIndex_ACU(chat: any[], indices: number[]): number | undefined {
    for (let i = indices.length - 1; i >= 0; i--) {
        const idx = indices[i];
        if (idx >= 0 && chat[idx] && !chat[idx].is_user) return idx;
    }
    return undefined;
}

async function writeV2BoundaryCheckpointBeforePurge_ACU(
    chat: any[],
    anchorIndex: number,
    options: { retainedStartIndex?: number; retainedEndIndex?: number } = {},
): Promise<boolean> {
    if (anchorIndex < 0 || !chat[anchorIndex] || chat[anchorIndex].is_user) {
        throw new Error(`边界 checkpoint 写入失败：anchorIndex=${anchorIndex} 不是有效 AI 楼层。`);
    }

    let changed = false;
    const isolationConfig = {
        enabled: settings_ACU.dataIsolationEnabled,
        code: settings_ACU.dataIsolationCode,
    };

    const isolationKeys = collectIsolationKeysWithV2Frames_ACU(chat, { maxMessageIndex: anchorIndex });
    const retainedStartIndex = Number.isInteger(options.retainedStartIndex) ? options.retainedStartIndex as number : undefined;
    const retainedEndIndex = Number.isInteger(options.retainedEndIndex) ? options.retainedEndIndex as number : undefined;
    for (const isolationKey of isolationKeys) {
        const strategy = resolveTableStorageStrategy_ACU(chat, isolationKey, isolationConfig);
        if (strategy.mode !== 'v2') continue;

        if (retainedStartIndex !== undefined && retainedEndIndex !== undefined
            && hasV2FullCheckpointInRange_ACU(chat, isolationKey, retainedStartIndex, retainedEndIndex)) {
            logDebug_ACU(`[V2 Compaction] 保留窗口内已存在 isolationKey=[${isolationKey || '无标签'}] 的 full checkpoint，跳过重建。`);
            continue;
        }

        const data = await loadTableStateFromFramesV2_ACU(chat, isolationKey, { maxMessageIndex: anchorIndex });
        if (!data) {
            throw new Error(`边界 checkpoint 写入失败：无法在 anchorIndex=${anchorIndex} 前恢复 isolationKey=[${isolationKey || '无标签'}] 的 V2 数据。`);
        }

        const anchorMsg = chat[anchorIndex];
        if (!anchorMsg.TavernDB_ACU_IsolatedData || typeof anchorMsg.TavernDB_ACU_IsolatedData !== 'object' || Array.isArray(anchorMsg.TavernDB_ACU_IsolatedData)) {
            anchorMsg.TavernDB_ACU_IsolatedData = {};
        }

        const existingTagData = anchorMsg.TavernDB_ACU_IsolatedData[isolationKey];
        const frame: TableStorageFrameV2_ACU = {
            version: 2,
            checkpoint: {
                kind: 'full',
                createdAt: Date.now(),
                reason: 'compaction',
                data,
                scheduleSummary: collectScheduleSummaryFromFramesV2_ACU(chat, isolationKey, { maxMessageIndex: anchorIndex }),
            },
            logEntries: [],
        };

        anchorMsg.TavernDB_ACU_IsolatedData[isolationKey] = {
            ...(existingTagData?.summaryVectorIndexState !== undefined ? { summaryVectorIndexState: existingTagData.summaryVectorIndexState } : {}),
            ...(existingTagData?.summaryVectorIndexManifest !== undefined ? { summaryVectorIndexManifest: existingTagData.summaryVectorIndexManifest } : {}),
            storageFrame: frame,
            _acu_storage_version: 2,
        };
        changed = true;
        logDebug_ACU(`[V2 Compaction] 已在边界楼层 #${anchorIndex} 写入 isolationKey=[${isolationKey || '无标签'}] 的 full checkpoint。`);
    }

    return changed;
}

/**
 * 替换聊天消息内容（正文优化核心逻辑）
 * 从 presentation/components/optimization-ui/optimization-ui-exec.ts 搬迁
 */
export async function replaceChatMessage_ACU(messageIndex: number, newContent: string, options: any = {}) {
    try {
        logDebug_ACU(`[正文优化] replaceChatMessage_ACU 开始执行, messageIndex=${messageIndex}, newContent长度=${newContent?.length || 0}`);

        const chat = getChatArray_ACU();
        if (!chat || !chat[messageIndex]) {
            logError_ACU('[正文优化] 消息不存在, chat存在=', !!chat, 'messageIndex=', messageIndex);
            throw new Error('消息不存在');
        }

        const oldContent = chat[messageIndex].mes;
        logDebug_ACU(`[正文优化] 原内容长度: ${oldContent?.length || 0}, 新内容长度: ${newContent?.length || 0}`);

        // 保存原始内容到 extra 字段，用于"重新优化"功能
        // 只有当 extra._acu_original_content 不存在时才保存（避免覆盖最初的原始内容）
        const extra = chat[messageIndex].extra || {};
        if (!extra._acu_original_content) {
            extra._acu_original_content = options.originalContent ?? oldContent;
            logDebug_ACU(`[正文优化] 保存原始内容到 extra._acu_original_content，长度: ${extra._acu_original_content?.length || 0}`);
        }
        extra._acu_last_optimized_at = Date.now();
        extra._acu_last_optimized_message_id = chat[messageIndex].message_id;
        setLastOptimizationBase_ACU({
            messageIndex,
            messageId: chat[messageIndex].message_id,
            baseContent: extra._acu_original_content || options.originalContent || oldContent || ''
        });

        // 使用酒馆的 setChatMessages API 来更新消息内容，确保渲染及时生效
        const success = await setChatMessages_ACU(
            [{ message_id: chat[messageIndex].message_id, mes: newContent, extra: extra }],
            { refresh: 'affected' }
        );
        if (success) {
            logDebug_ACU('[正文优化] 消息已通过 setChatMessages API 更新');
        } else {
            // 降级方案：如果 setChatMessages 不可用，使用原有逻辑
            logDebug_ACU('[正文优化] setChatMessages API 不可用，使用降级方案...');

            chat[messageIndex].mes = newContent;
            chat[messageIndex].extra = extra;

            const verifyContent = chat[messageIndex].mes;
            logDebug_ACU(`[正文优化] 修改后验证 - 内容长度: ${verifyContent?.length || 0}, 是否匹配: ${verifyContent === newContent}`);

            await saveChatToHost_ACU();
            logDebug_ACU('[正文优化] 聊天已保存');

            emitMessageUpdated_ACU(messageIndex);
        }

        logDebug_ACU(`[正文优化] 消息 ${messageIndex} 已更新完成`);
        return true;

    } catch (error) {
        logError_ACU('[正文优化] 替换消息失败:', error);
        return false;
    }
}

/**
 * 获取消息的原始内容（用于重新优化）
 * 从 presentation/components/optimization-ui/optimization-ui-exec.ts 搬迁
 */
export function getOriginalContent_ACU(messageIndex: number) {
    const cachedBase = getLastOptimizationBase_ACU();
    if (cachedBase?.baseContent) {
        const chat = getChatArray_ACU();
        if (cachedBase.messageId != null) {
            const matchedIndex = chat.findIndex(msg => msg && !msg.is_user && msg.message_id === cachedBase.messageId);
            if (matchedIndex === messageIndex) {
                return cachedBase.baseContent;
            }
        }
        if (cachedBase.messageIndex === messageIndex) {
            return cachedBase.baseContent;
        }
    }

    const chat = getChatArray_ACU();
    if (!chat || !chat[messageIndex]) {
        return null;
    }
    const extra = chat[messageIndex].extra || {};
    return extra._acu_original_content || null;
}

/**
 * 保存当前表格数据到聊天记录
 * 从 presentation/triggers/update-process.ts 搬迁
 */
export async function saveCurrentDataForTable_ACU(sheetKey: string) {
    try {
        if (!currentJsonTableData_ACU || !currentJsonTableData_ACU[sheetKey]) {
            logWarn_ACU('saveCurrentDataForTable_ACU: No data to save.');
            return;
        }

        const chat = getChatArray_ACU();
        if (!chat || chat.length === 0) {
            logWarn_ACU('saveCurrentDataForTable_ACU: No chat history.');
            return;
        }

        const sheet = currentJsonTableData_ACU[sheetKey];
        const history = resolveTableHistoryStateFromChat_ACU(chat, {
            sheetKey,
            isSummaryTable: isSummaryOrOutlineTable_ACU(sheet.name),
            isolationKey: getCurrentIsolationKey_ACU(),
            settings: settings_ACU,
        });
        const fallbackLatestAiIndex = getLatestAiMessageIndexFromChat_ACU(chat);
        const targetMessageIndex = history.latestDataMessageIndex !== -1
            ? history.latestDataMessageIndex
            : fallbackLatestAiIndex;

        if (targetMessageIndex === -1) {
            logWarn_ACU('saveCurrentDataForTable_ACU: No AI message available for persistence.');
            return;
        }

        const commitResult = await runTableUpdateCommit_ACU<void>({
            source: 'system',
            reason: 'saveCurrentDataForTable',
            isolationKey: getCurrentIsolationKey_ACU(),
            writeSet: [{ kind: 'sheet', sheetKey }],
            revisionWriteSet: [{ kind: 'sheet', sheetKey }],
            initialData: currentJsonTableData_ACU,
            targetMessageIndex,
            targetSheetKeys: [sheetKey],
            updateGroupKeys: null,
            trackingSheetKeys: [sheetKey],
            trackAsUpdate: history.latestDataMessageIndex === -1,
            operations: [{ kind: 'sheet_replace', sheetKey, sheet: (currentJsonTableData_ACU as any)[sheetKey], reason: 'system' }],
        }, () => ({
            success: true,
            tableData: currentJsonTableData_ACU as any,
        }));
        if (!commitResult.success) {
            logWarn_ACU(`saveCurrentDataForTable_ACU: commit failed: ${commitResult.error || 'unknown error'}`);
        }
    } catch (e) {
        logError_ACU('saveCurrentDataForTable_ACU failed:', e);
    }
}

/**
 * 清理超出保留层数的旧本地数据（表格数据 + 剧情推进数据）
 * 从 presentation/triggers/settings-ui-sync/settings-ui-config.ts 搬迁
 * 
 * 按消息计数，用户可见语义保留最近N层有效数据；额外保留20层恢复缓冲区，确保清理后有可用 checkpoint。
 * 仅保护聊天第一层的"空白指导表"（TavernDB_ACU_InternalSheetGuide），不保护整层本地数据。
 */
async function purgeOldLayerDataCore_ACU() {
    const retainCount = settings_ACU.retainRecentLayers || 0;
    if (retainCount <= 0) {
        logDebug_ACU('[数据清理] retainRecentLayers 为 0 或未设置，跳过清理。');
        return;
    }

    const chat = getChatArray_ACU();
    if (!chat || !Array.isArray(chat) || chat.length === 0) {
        logDebug_ACU('[数据清理] 聊天记录为空，跳过清理。');
        return;
    }

    // 收集所有包含本地数据的消息索引。chat[0] 只保护指导表字段，不再整层保护 checkpoint/日志数据。
    const dataMessageIndices = [];
    for (let i = 0; i < chat.length; i++) {
        const msg = chat[i];
        if (messageHasLocalLayerData_ACU(msg)) {
            dataMessageIndices.push(i);
        }
    }

    const effectiveRetainCount = retainCount + RETAIN_RECENT_CHECKPOINT_BUFFER_LAYERS_ACU;
    if (dataMessageIndices.length <= effectiveRetainCount) {
        logDebug_ACU(`[数据清理] 含数据消息总数(${dataMessageIndices.length}) <= 实际保留层数(${effectiveRetainCount}=用户${retainCount}+缓冲${RETAIN_RECENT_CHECKPOINT_BUFFER_LAYERS_ACU})，无需清理。`);
        return;
    }

    const cutoffIndex = dataMessageIndices.length - effectiveRetainCount;
    const indicesToPurge = dataMessageIndices.slice(0, cutoffIndex);

    if (indicesToPurge.length === 0) {
        logDebug_ACU('[数据清理] 无需清理的楼层。');
        return;
    }

    logDebug_ACU(`[数据清理] 将清理 ${indicesToPurge.length} 层消息的本地数据（用户保留最近 ${retainCount} 层，额外保留 ${RETAIN_RECENT_CHECKPOINT_BUFFER_LAYERS_ACU} 层 checkpoint 缓冲）...`);

    // ── [V2 边界 checkpoint] 删除旧 frame 前，确保恢复缓冲区内有 full checkpoint ──
    const retainedDataIndices = dataMessageIndices.slice(cutoffIndex);
    const checkpointBufferIndices = retainedDataIndices.slice(0, Math.min(RETAIN_RECENT_CHECKPOINT_BUFFER_LAYERS_ACU, retainedDataIndices.length));
    const retainedStartIndex = retainedDataIndices[0];
    const retainedEndIndex = retainedDataIndices[retainedDataIndices.length - 1];
    const checkpointBufferStartIndex = checkpointBufferIndices[0];
    const checkpointBufferEndIndex = checkpointBufferIndices[checkpointBufferIndices.length - 1];
    const anchorIndex = selectLastAiIndex_ACU(chat, checkpointBufferIndices);
    if (anchorIndex !== undefined && anchorIndex >= 0 && chat[anchorIndex]) {
        try {
            if (await writeV2BoundaryCheckpointBeforePurge_ACU(chat, anchorIndex, {
                retainedStartIndex: checkpointBufferStartIndex ?? retainedStartIndex,
                retainedEndIndex: checkpointBufferEndIndex ?? retainedEndIndex,
            })) {
                await saveChatToHost_ACU();
            }
        } catch (error) {
            logError_ACU('[V2 Compaction] 写入边界 checkpoint 失败，已中止本次清理以避免恢复链断裂:', error);
            return;
        }
    } else if (collectIsolationKeysWithV2Frames_ACU(chat, { maxMessageIndex: indicesToPurge[indicesToPurge.length - 1] }).length > 0) {
        logError_ACU(`[V2 Compaction] checkpoint 缓冲区（额外 ${RETAIN_RECENT_CHECKPOINT_BUFFER_LAYERS_ACU} 层）内找不到可写入 checkpoint 的 AI 楼层，已中止本次清理以避免恢复链断裂。`);
        return;
    }

    // ── [兜底快照] 在删除旧楼层之前，迁移冷表数据到边界保留楼层 ──
    const retainedSet = new Set<number>(retainedDataIndices);

    // 确认边界楼层有效。chat[0] 只保护指导表字段，不再整层保护普通本地数据。
    if (anchorIndex !== undefined && anchorIndex >= 0 && chat[anchorIndex]) {
        const dataIsolationEnabled = settings_ACU.dataIsolationEnabled || false;
        const dataIsolationCode = settings_ACU.dataIsolationCode || null;

        // orphanedData: Map<isolationKey, Map<sheetKey, SheetData>>
        const orphanedData = new Map<string, Map<string, any>>();

        // 按索引从小到大遍历待清理楼层（从旧到新，后面的覆盖前面的 → 取最新版本）
        for (const idx of indicesToPurge) {
            const msg = chat[idx];
            if (!msg || msg.is_user) continue;

            const sheetDataMap = collectAllSheetDataFromMessage_ACU(msg, dataIsolationEnabled, dataIsolationCode);
            if (sheetDataMap.size === 0) continue;

            for (const [isoKey, sheetMap] of sheetDataMap) {
                for (const [sheetKey, sheetData] of sheetMap) {
                    // 检查该表是否在任何保留楼层中已有数据
                    if (isSheetRetainedInAnyFloor_ACU(sheetKey, isoKey, retainedSet, chat, dataIsolationEnabled, dataIsolationCode)) {
                        continue; // 已有保留数据，无需兜底
                    }

                    // 记录到 orphanedData（后面的覆盖前面的，实现取最新版本）
                    if (!orphanedData.has(isoKey)) {
                        orphanedData.set(isoKey, new Map<string, any>());
                    }
                    orphanedData.get(isoKey)!.set(sheetKey, sheetData);
                }
            }
        }

        // 将 orphaned 数据写入边界保留楼层
        if (orphanedData.size > 0) {
            let totalSheets = 0;
            for (const [, sheetMap] of orphanedData) {
                totalSheets += sheetMap.size;
            }

            logDebug_ACU(`[数据清理] 检测到 ${totalSheets} 张表（${orphanedData.size} 个隔离标签）仅存在于待清理楼层，将写入边界保留楼层 #${anchorIndex} 作为兜底...`);

            const anchorMsg = chat[anchorIndex];

            // 初始化 IsolatedData 容器
            if (!anchorMsg.TavernDB_ACU_IsolatedData || typeof anchorMsg.TavernDB_ACU_IsolatedData !== 'object' || Array.isArray(anchorMsg.TavernDB_ACU_IsolatedData)) {
                anchorMsg.TavernDB_ACU_IsolatedData = {};
            }

            for (const [isoKey, sheetMap] of orphanedData) {
                const strategy = resolveTableStorageStrategy_ACU(chat, isoKey, {
                    enabled: settings_ACU.dataIsolationEnabled,
                    code: settings_ACU.dataIsolationCode,
                });
                if (strategy.mode !== 'legacy-v1') {
                    logDebug_ACU(`[数据清理] isolationKey=[${isoKey || '无标签'}] 未确认为 legacy-v1，跳过 V1 兜底快照写入。`);
                    continue;
                }

                // 初始化该 isolationKey 槽（如果不存在）
                if (!anchorMsg.TavernDB_ACU_IsolatedData[isoKey]) {
                    anchorMsg.TavernDB_ACU_IsolatedData[isoKey] = {
                        independentData: {},
                        modifiedKeys: [],
                        updateGroupKeys: [],
                    };
                }

                const anchorTagData = anchorMsg.TavernDB_ACU_IsolatedData[isoKey];
                if (!anchorTagData.independentData || typeof anchorTagData.independentData !== 'object') {
                    anchorTagData.independentData = {};
                }

                // 写入表数据（不修改 modifiedKeys/updateGroupKeys，避免干扰自动更新门禁）
                for (const [sheetKey, sheetData] of sheetMap) {
                    anchorTagData.independentData[sheetKey] = JSON.parse(JSON.stringify(sheetData));
                }
                anchorTagData._acu_storage_mode = 'checkpoint';
                anchorTagData._acu_storage_version = 1;
            }

            // 立即持久化兜底数据，再继续删除循环
            try {
                await saveChatToHost_ACU();
                logDebug_ACU(`[数据清理] 已将 ${totalSheets} 张表（${orphanedData.size} 个隔离标签）的兜底数据写入楼层 #${anchorIndex}，聊天已保存。`);
            } catch (e) {
                logWarn_ACU('[数据清理] 写入兜底数据失败，继续清理流程:', e);
            }
        } else {
            logDebug_ACU('[数据清理] 未检测到需要兜底的表数据。');
        }
    } else {
        logWarn_ACU(`[数据清理] 边界保留楼层索引无效（anchorIndex=${anchorIndex}），跳过兜底快照。`);
    }

    let purgedCount = 0;
    const keysToDelete = [
        'TavernDB_ACU_Data',
        'TavernDB_ACU_SummaryData',
        'TavernDB_ACU_IndependentData',
        'TavernDB_ACU_ModifiedKeys',
        'TavernDB_ACU_UpdateGroupKeys',
        'TavernDB_ACU_IsolatedData',
        'TavernDB_ACU_Identity',
        'qrf_plot',
        'qrf_plot_preset',
        'qrf_plot_tasks'
    ];

    let purgedVectorManifestCount = 0;
    for (const idx of indicesToPurge) {
        const msg = chat[idx];
        if (!msg) continue;

        purgedVectorManifestCount += await deleteVectorIndexManifestsFromMessage_ACU(msg);

        let modified = false;
        for (const key of keysToDelete) {
            if (Object.prototype.hasOwnProperty.call(msg, key)) {
                delete msg[key];
                modified = true;
            }
        }

        if (modified) {
            purgedCount++;
        }
    }

    if (purgedCount > 0) {
        try {
            await saveChatToHost_ACU();
            logDebug_ACU(`[数据清理] 已清理 ${purgedCount} 层消息的本地数据，已删除 ${purgedVectorManifestCount} 组交火向量索引外置文件引用，聊天记录已保存。`);
        } catch (e) {
            logError_ACU('[数据清理] 保存聊天记录失败:', e);
        }
    } else {
        logDebug_ACU('[数据清理] 目标楼层中未发现需要清理的数据字段。');
    }
}

export async function purgeOldLayerData_ACU() {
    return runTableWriteTransaction_ACU({
        source: 'system_cleanup',
        reason: 'purgeOldLayerData',
        isolationKey: getCurrentIsolationKey_ACU(),
        writeSet: [{ kind: 'all' }],
        maintenanceMode: 'exclusive',
    }, () => purgeOldLayerDataCore_ACU());
}

/**
 * 检查指定表是否在任何保留楼层中存在数据。
 * 同时检查新版 IsolatedData 路径和旧版兼容路径。
 */
function isSheetRetainedInAnyFloor_ACU(
    sheetKey: string,
    isolationKey: string,
    retainedSet: Set<number>,
    chat: any[],
    dataIsolationEnabled: boolean,
    dataIsolationCode: string | null,
): boolean {
    for (const idx of retainedSet) {
        const msg = chat[idx];
        if (!msg || msg.is_user) continue;

        // 新版 IsolatedData 路径
        const tagData = msg?.TavernDB_ACU_IsolatedData?.[isolationKey];
        if (tagData?.independentData?.[sheetKey]) {
            return true;
        }

        // 旧版兼容路径：仅当 isolationKey 与当前隔离配置匹配时检查
        if (!dataIsolationEnabled) {
            // 无隔离模式：检查旧版字段中是否存在
            const legacyIdentity = msg?.TavernDB_ACU_Identity;
            if (!legacyIdentity && (msg?.TavernDB_ACU_IndependentData?.[sheetKey] || msg?.TavernDB_ACU_Data?.[sheetKey] || msg?.TavernDB_ACU_SummaryData?.[sheetKey])) {
                return true;
            }
        } else {
            // 隔离模式：检查 identity 是否匹配
            if (msg?.TavernDB_ACU_Identity === dataIsolationCode) {
                if (msg?.TavernDB_ACU_IndependentData?.[sheetKey] || msg?.TavernDB_ACU_Data?.[sheetKey] || msg?.TavernDB_ACU_SummaryData?.[sheetKey]) {
                    return true;
                }
            }
        }
    }
    return false;
}

/**
 * 从消息中收集所有表数据（新版 IsolatedData + 旧版兼容路径）。
 * 返回按 isolationKey 分组的 Map。
 *
 * @param msg 聊天消息对象
 * @param dataIsolationEnabled 当前隔离配置
 * @param dataIsolationCode 当前隔离码
 * @returns Map<isolationKey, Map<sheetKey, Sheet_ACU>>
 */
function collectAllSheetDataFromMessage_ACU(
    msg: any,
    dataIsolationEnabled: boolean,
    dataIsolationCode: string | null,
): Map<string, Map<string, any>> {
    const result = new Map<string, Map<string, any>>();

    // 新版 IsolatedData 路径：遍历所有 isolationKey
    const isolatedData = msg?.TavernDB_ACU_IsolatedData;
    if (isolatedData && typeof isolatedData === 'object' && !Array.isArray(isolatedData)) {
        for (const [isoKey, tagData] of Object.entries(isolatedData) as [string, any][]) {
            const independentData = tagData?.independentData;
            if (!independentData || typeof independentData !== 'object') continue;
            const sheetMap = new Map<string, any>();
            for (const [sheetKey, sheetData] of Object.entries(independentData)) {
                if (sheetKey.startsWith('sheet_') && sheetData && typeof sheetData === 'object') {
                    sheetMap.set(sheetKey, sheetData);
                }
            }
            if (sheetMap.size > 0) {
                result.set(isoKey, sheetMap);
            }
        }
    }

    // 旧版兼容路径：归入对应的 isolationKey
    const legacyIsoKey = dataIsolationEnabled ? (dataIsolationCode || '') : '';
    // 判断该消息的旧版数据是否属于当前隔离上下文
    const msgLegacyIdentity = msg?.TavernDB_ACU_Identity;
    let legacyBelongsHere = false;
    if (!dataIsolationEnabled) {
        legacyBelongsHere = !msgLegacyIdentity;
    } else {
        legacyBelongsHere = msgLegacyIdentity === dataIsolationCode;
    }

    if (legacyBelongsHere) {
        const legacySheets = new Map<string, any>();

        const legacyIndependent = msg?.TavernDB_ACU_IndependentData;
        if (legacyIndependent && typeof legacyIndependent === 'object') {
            for (const [sheetKey, sheetData] of Object.entries(legacyIndependent)) {
                if (sheetKey.startsWith('sheet_') && sheetData && typeof sheetData === 'object') {
                    legacySheets.set(sheetKey, sheetData);
                }
            }
        }

        const legacyStandard = msg?.TavernDB_ACU_Data;
        if (legacyStandard && typeof legacyStandard === 'object') {
            for (const [sheetKey, sheetData] of Object.entries(legacyStandard)) {
                if (sheetKey.startsWith('sheet_') && sheetData && typeof sheetData === 'object' && !legacySheets.has(sheetKey)) {
                    legacySheets.set(sheetKey, sheetData);
                }
            }
        }

        const legacySummary = msg?.TavernDB_ACU_SummaryData;
        if (legacySummary && typeof legacySummary === 'object') {
            for (const [sheetKey, sheetData] of Object.entries(legacySummary)) {
                if (sheetKey.startsWith('sheet_') && sheetData && typeof sheetData === 'object' && !legacySheets.has(sheetKey)) {
                    legacySheets.set(sheetKey, sheetData);
                }
            }
        }

        if (legacySheets.size > 0) {
            const existing = result.get(legacyIsoKey);
            if (existing) {
                for (const [k, v] of legacySheets) {
                    existing.set(k, v);
                }
            } else {
                result.set(legacyIsoKey, legacySheets);
            }
        }
    }

    return result;
}

/**
 * 删除聊天记录中的本地数据（核心业务逻辑）
 * 从 presentation/triggers/data-admin-ui.ts 的 deleteLocalDataInChat_ACU 中提取
 * 
 * 只负责数据操作（遍历 chat 删除字段 + saveChatToHost），不涉及 UI（toast/status display）。
 * @returns 删除的消息数量
 */
async function deleteLocalDataInChatCoreInner_ACU(
    mode: 'current' | 'all' = 'current',
    startFloor: number | null = null,
    endFloor: number | null = null
): Promise<number> {
    const chat = getChatArray_ACU();
    if (!chat || chat.length === 0) {
        return 0;
    }

    let deletedCount = 0;
    const targetIdentity = settings_ACU.dataIsolationEnabled ? settings_ACU.dataIsolationCode : null;
    const currentIsolationKey = getCurrentIsolationKey_ACU();

    // 计算AI消息索引列表（只计算AI楼层）
    const aiMessageIndices = chat
        .map((msg: any, index: number) => (!msg.is_user) ? index : -1)
        .filter((index: number) => index !== -1);

    if (aiMessageIndices.length === 0) {
        return 0;
    }

    // 转换AI楼层范围为AI消息索引范围
    const startAiIndex = startFloor ? Math.max(0, startFloor - 1) : 0;
    const endAiIndex = endFloor ? Math.min(aiMessageIndices.length - 1, endFloor - 1) : aiMessageIndices.length - 1;

    // 获取要处理的AI消息的物理索引
    const targetIndices = aiMessageIndices.slice(startAiIndex, endAiIndex + 1);

    for (const physicalIndex of targetIndices) {
        const msg = chat[physicalIndex];
        let shouldDelete = false;

        if (mode === 'all') {
            shouldDelete = true;
        } else {
            const isolatedData = msg.TavernDB_ACU_IsolatedData;
            if (isolatedData && typeof isolatedData === 'object' && !Array.isArray(isolatedData) && isolatedData[currentIsolationKey]) {
                shouldDelete = true;
            } else if (settings_ACU.dataIsolationEnabled) {
                if (msg.TavernDB_ACU_Identity === targetIdentity) {
                    shouldDelete = true;
                }
            } else {
                if (msg.TavernDB_ACU_Data || msg.TavernDB_ACU_SummaryData || msg.TavernDB_ACU_IndependentData || msg.TavernDB_ACU_IsolatedData) {
                    shouldDelete = true;
                }
            }
        }

        if (shouldDelete) {
            let modified = false;

            if (msg.TavernDB_ACU_Data) {
                delete msg.TavernDB_ACU_Data;
                modified = true;
            }
            if (msg.TavernDB_ACU_SummaryData) {
                delete msg.TavernDB_ACU_SummaryData;
                modified = true;
            }
            if (msg.TavernDB_ACU_IndependentData) {
                delete msg.TavernDB_ACU_IndependentData;
                modified = true;
            }
            if (msg.TavernDB_ACU_Identity !== undefined) {
                delete msg.TavernDB_ACU_Identity;
                modified = true;
            }
            if (msg.TavernDB_ACU_IsolatedData) {
                if (mode === 'all') {
                    const isolatedData = msg.TavernDB_ACU_IsolatedData;
                    for (const key of Object.keys(isolatedData)) {
                        await deleteVectorIndexManifestFromTagData_ACU(isolatedData[key]);
                    }
                    delete msg.TavernDB_ACU_IsolatedData;
                    modified = true;
                } else {
                    if (msg.TavernDB_ACU_IsolatedData[currentIsolationKey]) {
                        await deleteVectorIndexManifestFromTagData_ACU(msg.TavernDB_ACU_IsolatedData[currentIsolationKey]);
                        delete msg.TavernDB_ACU_IsolatedData[currentIsolationKey];
                        if (Object.keys(msg.TavernDB_ACU_IsolatedData).length === 0) {
                            delete msg.TavernDB_ACU_IsolatedData;
                        }
                        modified = true;
                    }
                }
            }
            if (msg.TavernDB_ACU_ModifiedKeys) {
                delete msg.TavernDB_ACU_ModifiedKeys;
            }
            if (msg.TavernDB_ACU_UpdateGroupKeys) {
                delete msg.TavernDB_ACU_UpdateGroupKeys;
            }

            if (modified) {
                deletedCount++;
            }
        }
    }

    if (deletedCount > 0) {
        await saveChatToHost_ACU();
    }

    return deletedCount;
}

export async function deleteLocalDataInChatCore_ACU(
    mode: 'current' | 'all' = 'current',
    startFloor: number | null = null,
    endFloor: number | null = null
): Promise<number> {
    return runTableWriteTransaction_ACU({
        source: 'system_cleanup',
        reason: 'deleteLocalDataInChat',
        isolationKey: getCurrentIsolationKey_ACU(),
        writeSet: [{ kind: 'all' }],
        maintenanceMode: 'exclusive',
    }, () => deleteLocalDataInChatCoreInner_ACU(mode, startFloor, endFloor));
}

/**
 * 使用模板覆盖最新层的表格数据（核心业务逻辑）
 * 从 presentation/triggers/data-admin-ui.ts 的 overrideLatestLayerWithTemplate_ACU 中提取
 * 
 * 只负责数据操作（遍历 chat 用模板覆盖 + saveChatToHost），不涉及 UI（confirm/toast）。
 * @param templateData 解析后的模板数据
 * @returns 覆盖的表格数量，0 表示没有修改
 */
export async function overrideLatestLayerWithTemplateCore_ACU(templateData: any): Promise<number> {
    const chat = getChatArray_ACU();
    if (!chat || chat.length === 0) {
        return 0;
    }

    const currentIsolationKey = getCurrentIsolationKey_ACU();

    // 找到最新的一条AI消息
    let latestAiIndex = -1;
    for (let i = chat.length - 1; i >= 0; i--) {
        if (!chat[i].is_user) {
            latestAiIndex = i;
            break;
        }
    }

    if (latestAiIndex === -1) {
        return 0;
    }

    const overrideSheets: Record<string, any> = {};

    // 遍历模板中的所有表格，使用模板数据覆盖本地数据
    Object.keys(templateData).forEach(sheetKey => {
        if (!sheetKey.startsWith('sheet_')) return;

        const templateTable = templateData[sheetKey];
        if (!templateTable || !templateTable.name) return;

        // 创建覆盖数据：保留表头，清空数据行
        const overrideTable = JSON.parse(JSON.stringify(templateTable));
        if (overrideTable.content && overrideTable.content.length > 1) {
            overrideTable.content = [overrideTable.content[0]]; // 只保留表头
        }

        overrideSheets[sheetKey] = sanitizeSheetForStorage_ACU(overrideTable);
        logDebug_ACU(`Overrode table "${templateTable.name}" (${sheetKey}) in latest layer with template data.`);
    });

    const modifiedSheetKeys = Object.keys(overrideSheets);
    if (modifiedSheetKeys.length === 0) {
        return 0;
    }

    const nextTableData = JSON.parse(JSON.stringify(currentJsonTableData_ACU || {}));
    if (!nextTableData.mate && templateData?.mate) {
        nextTableData.mate = JSON.parse(JSON.stringify(templateData.mate));
    }
    for (const sheetKey of modifiedSheetKeys) {
        nextTableData[sheetKey] = overrideSheets[sheetKey];
    }

    const operations: TableMutationOperationV2_ACU[] = modifiedSheetKeys.map(sheetKey => ({
        kind: 'sheet_replace',
        sheetKey,
        sheet: overrideSheets[sheetKey],
        reason: 'system',
    }));
    const commitResult = await runTableUpdateCommit_ACU<number>({
        source: 'system',
        reason: 'overrideLatestLayerWithTemplate',
        isolationKey: currentIsolationKey,
        writeSet: modifiedSheetKeys.map(sheetKey => ({ kind: 'sheet' as const, sheetKey })),
        revisionWriteSet: modifiedSheetKeys.map(sheetKey => ({ kind: 'sheet' as const, sheetKey })),
        initialData: currentJsonTableData_ACU,
        targetMessageIndex: latestAiIndex,
        targetSheetKeys: modifiedSheetKeys,
        updateGroupKeys: modifiedSheetKeys,
        trackingSheetKeys: modifiedSheetKeys,
        trackAsUpdate: true,
        operations,
    }, () => ({
        success: true,
        value: modifiedSheetKeys.length,
        tableData: nextTableData as any,
    }));
    if (!commitResult.success) {
        logWarn_ACU(`[模板覆盖] 公共提交失败：${commitResult.error || 'unknown error'}`);
        return 0;
    }

    return commitResult.value || 0;
}

/**
 * 按消息索引列表清空指定 AI 楼层上的当前隔离标签表格数据，并保存聊天。
 *
 * 用于手动填表前的"预清空"步骤：先清除目标楼层上的旧表格数据，
 * 再执行新的手动填表，防止 SQL 严格填表逻辑因旧数据残留导致写入失败。
 *
 * 清理范围：当前隔离标签下的新版 IsolatedData 槽 + 旧版兼容字段。
 * 不影响同一消息上其他隔离标签的数据。
 * 不删除消息正文或非表格业务字段。
 *
 * @param targetMessageIndices 需要清空的目标 AI 消息物理索引列表（已去重）
 * @returns 实际被清空的消息数量
 */
async function clearTableDataAtFloorsCore_ACU(targetMessageIndices: number[], targetSheetKeys: string[] | null = null): Promise<number> {
    if (!targetMessageIndices || targetMessageIndices.length === 0) return 0;

    const chat = getChatArray_ACU();
    if (!chat || chat.length === 0) return 0;

    const isolationKey = getCurrentIsolationKey_ACU();
    const isolationConfig = {
        enabled: settings_ACU.dataIsolationEnabled,
        code: settings_ACU.dataIsolationCode,
    };
    const clearsSummaryOrOutline = Array.isArray(targetSheetKeys) && targetSheetKeys.length > 0
        ? tableListContainsSummaryOrOutline_ACU(targetSheetKeys)
        : true;

    let clearedCount = 0;

    for (const idx of targetMessageIndices) {
        if (idx < 0 || idx >= chat.length) continue;
        const msg = chat[idx];
        // 只处理 AI 消息（跳过用户消息）
        if (!msg || msg.is_user) continue;

        const changed = Array.isArray(targetSheetKeys) && targetSheetKeys.length > 0
            ? purgeTargetSheetKeysFromMessage_ACU(msg, targetSheetKeys)
            : clearTableFieldsForIsolation_ACU(msg, isolationKey, isolationConfig);
        if (clearsSummaryOrOutline) {
            const tagData = msg?.TavernDB_ACU_IsolatedData?.[isolationKey];
            if (await deleteVectorIndexManifestFromTagData_ACU(tagData)) {
                logDebug_ACU(`[清空楼层] 已删除消息索引 ${idx} 上的交火向量索引外置文件引用。`);
            }
        }
        if (changed) {
            clearedCount++;
            logDebug_ACU(`[清空楼层] 已清空消息索引 ${idx} 上的表格数据 (标签: ${isolationKey || '无'})`);
        }
    }

    if (clearedCount > 0) {
        await saveChatToHost_ACU();
        logDebug_ACU(`[清空楼层] 共清空 ${clearedCount} 条消息的表格数据，聊天已保存。`);
    }

    return clearedCount;
}

export async function clearTableDataAtFloors_ACU(targetMessageIndices: number[], targetSheetKeys: string[] | null = null): Promise<number> {
    const writeSet = Array.isArray(targetSheetKeys) && targetSheetKeys.length > 0
        ? targetSheetKeys.map(sheetKey => ({ kind: 'sheet' as const, sheetKey }))
        : [{ kind: 'all' as const }];
    return runTableWriteTransaction_ACU({
        source: 'system_cleanup',
        reason: 'clearTableDataAtFloors',
        isolationKey: getCurrentIsolationKey_ACU(),
        writeSet,
        maintenanceMode: 'exclusive',
    }, () => clearTableDataAtFloorsCore_ACU(targetMessageIndices, targetSheetKeys));
}

function purgeTargetSheetKeysFromMessage_ACU(msg: any, targetSheetKeys: string[]): boolean {
    if (!msg || !Array.isArray(targetSheetKeys) || targetSheetKeys.length === 0) return false;

    let changed = false;
    const isolationKey = getCurrentIsolationKey_ACU();
    const tagData = msg?.TavernDB_ACU_IsolatedData?.[isolationKey];
    if (isV2TagData_ACU(tagData)) {
        delete msg.TavernDB_ACU_IsolatedData[isolationKey];
        if (Object.keys(msg.TavernDB_ACU_IsolatedData).length === 0) {
            delete msg.TavernDB_ACU_IsolatedData;
        }
        return true;
    }
    if (tagData && typeof tagData === 'object') {
        if (tagData.independentData && typeof tagData.independentData === 'object') {
            targetSheetKeys.forEach(sheetKey => {
                if (tagData.independentData[sheetKey]) {
                    delete tagData.independentData[sheetKey];
                    changed = true;
                }
            });
        }
        if (Array.isArray(tagData.modifiedKeys)) {
            tagData.modifiedKeys = tagData.modifiedKeys.filter((key: string) => !targetSheetKeys.includes(key));
        }
        if (Array.isArray(tagData.updateGroupKeys)) {
            tagData.updateGroupKeys = tagData.updateGroupKeys.filter((key: string) => !targetSheetKeys.includes(key));
        }
    }

    if (msg?.TavernDB_ACU_IndependentData && typeof msg.TavernDB_ACU_IndependentData === 'object') {
        targetSheetKeys.forEach(sheetKey => {
            if (msg.TavernDB_ACU_IndependentData[sheetKey]) {
                delete msg.TavernDB_ACU_IndependentData[sheetKey];
                changed = true;
            }
        });
    }

    if (msg?.TavernDB_ACU_Data && typeof msg.TavernDB_ACU_Data === 'object') {
        targetSheetKeys.forEach(sheetKey => {
            if (msg.TavernDB_ACU_Data[sheetKey]) {
                delete msg.TavernDB_ACU_Data[sheetKey];
                changed = true;
            }
        });
    }

    if (msg?.TavernDB_ACU_SummaryData && typeof msg.TavernDB_ACU_SummaryData === 'object') {
        targetSheetKeys.forEach(sheetKey => {
            if (msg.TavernDB_ACU_SummaryData[sheetKey]) {
                delete msg.TavernDB_ACU_SummaryData[sheetKey];
                changed = true;
            }
        });
    }

    if (Array.isArray(msg?.TavernDB_ACU_ModifiedKeys)) {
        msg.TavernDB_ACU_ModifiedKeys = msg.TavernDB_ACU_ModifiedKeys.filter((key: string) => !targetSheetKeys.includes(key));
    }
    if (Array.isArray(msg?.TavernDB_ACU_UpdateGroupKeys)) {
        msg.TavernDB_ACU_UpdateGroupKeys = msg.TavernDB_ACU_UpdateGroupKeys.filter((key: string) => !targetSheetKeys.includes(key));
    }

    return changed;
}
