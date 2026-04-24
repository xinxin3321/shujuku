/**
 * data/models/chat-message-data.ts — 消息级表格数据结构定义
 *
 * 定义聊天消息上挂载的 TavernDB_ACU_* 字段的 TypeScript 接口。
 * 这些类型描述了每条消息上存储的表格数据结构。
 */

import type { Sheet_ACU } from '../../shared/models/table-data';

// ── 新版按标签分组存储 ──

export interface ChatVectorRemoteMemoryChunk_ACU {
    chunkId: string;
    text: string;
    vector: number[];
    sequence: number;
}

export interface ChatVectorRemoteMemoryBatch_ACU {
    batchId: string;
    snapshotMessageId: string;
    sourceMessageId: string;
    sourceRowKeys: string[];
    sourceRowCount: number;
    summaryText: string;
    summaryHash: string;
    chunks: ChatVectorRemoteMemoryChunk_ACU[];
    promptGroupVersion: string;
    createdAt: string;
    archivedRange?: {
        firstRowKey: string;
        lastRowKey: string;
    };
}

export interface ChatVectorState_ACU {
    snapshotMessageId: string;
    remoteMemoryBatches: ChatVectorRemoteMemoryBatch_ACU[];
    lastIndexedAt?: string;
    lastArchiveAt?: string;
}

/** 单个隔离标签下的数据槽 */
export interface IsolationTagData_ACU {
    independentData: Record<string, Sheet_ACU>;
    modifiedKeys: string[];
    updateGroupKeys: string[];
    vectorMemoryState?: ChatVectorState_ACU;
    /** 基底状态标记（首楼初始化时写入） */
    _acu_base_state?: string;
}

/** 按标签分组的容器（TavernDB_ACU_IsolatedData 的类型） */
export interface IsolatedDataContainer_ACU {
    [isolationKey: string]: IsolationTagData_ACU;
}

// ── 旧版兼容格式 ──

/** 旧版标准表/摘要表容器（TavernDB_ACU_Data / TavernDB_ACU_SummaryData 的类型） */
export interface LegacyTableContainer_ACU {
    mate?: { type: string; version: number };
    [sheetKey: string]: Sheet_ACU | { type: string; version: number } | undefined;
}

// ── 消息上所有 TavernDB_ACU_* 字段的完整类型 ──

/** 消息对象上所有 TavernDB_ACU_* 字段的类型描述 */
export interface MessageTableFields_ACU {
    /** 新版按标签分组的表格数据（可能是 object 或 JSON 字符串） */
    TavernDB_ACU_IsolatedData?: IsolatedDataContainer_ACU | string;
    /** 旧版独立表格数据 */
    TavernDB_ACU_IndependentData?: Record<string, Sheet_ACU>;
    /** 旧版标准表数据 */
    TavernDB_ACU_Data?: LegacyTableContainer_ACU;
    /** 旧版摘要/大纲表数据 */
    TavernDB_ACU_SummaryData?: LegacyTableContainer_ACU;
    /** 隔离标识代码 */
    TavernDB_ACU_Identity?: string;
    /** 本地消息锚点（用于宿主 message_id 缺失时的稳定回退） */
    TavernDB_ACU_LocalMessageAnchor?: string;
    /** 本次修改的表格键列表 */
    TavernDB_ACU_ModifiedKeys?: string[];
    /** 本次更新组的表格键列表 */
    TavernDB_ACU_UpdateGroupKeys?: string[];
    /** 首楼模板基底状态标记（幂等用） */
    _acu_local_template_base_state_seeded?: string;
}

// ── 隔离配置（作为参数传入 repository，不引用 service 层） ──

/** 隔离配置，由 service 层从 settings_ACU 中提取后传入 */
export interface IsolationConfig_ACU {
    /** 是否启用数据隔离 */
    enabled: boolean;
    /** 隔离标识代码 */
    code: string;
}
