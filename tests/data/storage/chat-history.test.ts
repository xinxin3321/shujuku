/**
 * tests/data/storage/chat-history.test.ts
 * 聊天消息自定义字段读写 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGetChatFirstLayerMessage,
  mockCloneScopedConfigData,
} = vi.hoisted(() => ({
  mockGetChatFirstLayerMessage: vi.fn(() => null),
  mockCloneScopedConfigData: vi.fn((data: any) => data ? JSON.parse(JSON.stringify(data)) : null),
}));

vi.mock('../../../src/shared/json-helpers', () => ({
  safeJsonParse_ACU: (json: string, fallback: any) => { try { return JSON.parse(json); } catch { return fallback; } },
}));

vi.mock('../../../src/shared/utils', () => ({
  getChatFirstLayerMessage_ACU: mockGetChatFirstLayerMessage,
  cloneScopedConfigData_ACU: mockCloneScopedConfigData,
}));

import {
  CHAT_SCOPED_CONFIG_FIELD_ACU,
  CHAT_SCOPED_CONFIG_VERSION_ACU,
  CHAT_SHEET_GUIDE_FIELD_ACU,
  CHAT_SHEET_GUIDE_VERSION_ACU,
  LEGACY_CHAT_TABLE_HEADER_GUIDE_FIELD_ACU,
  CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU,
  CHAT_TEMPLATE_ARCHIVE_OPTION_PREFIX_ACU,
  MAX_CHAT_TEMPLATE_ARCHIVES_PER_TAG_ACU,
  getChatScopedConfigContainer_ACU,
  normalizeChatScopedConfigContainer_ACU,
  getChatSheetGuideContainer_ACU,
} from '../../../src/data/storage/chat-history';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetChatFirstLayerMessage.mockReturnValue(null);
});

// ═══ 常量验证 ═══
describe('常量导出', () => {
  it('CHAT_SCOPED_CONFIG_FIELD_ACU 是字符串', () => {
    expect(typeof CHAT_SCOPED_CONFIG_FIELD_ACU).toBe('string');
    expect(CHAT_SCOPED_CONFIG_FIELD_ACU).toBe('TavernDB_ACU_ScopedConfig');
  });

  it('CHAT_SCOPED_CONFIG_VERSION_ACU 是数字', () => {
    expect(CHAT_SCOPED_CONFIG_VERSION_ACU).toBe(1);
  });

  it('CHAT_SHEET_GUIDE_FIELD_ACU 是字符串', () => {
    expect(typeof CHAT_SHEET_GUIDE_FIELD_ACU).toBe('string');
  });

  it('CHAT_SHEET_GUIDE_VERSION_ACU 是 2', () => {
    expect(CHAT_SHEET_GUIDE_VERSION_ACU).toBe(2);
  });

  it('LEGACY_CHAT_TABLE_HEADER_GUIDE_FIELD_ACU 是字符串', () => {
    expect(typeof LEGACY_CHAT_TABLE_HEADER_GUIDE_FIELD_ACU).toBe('string');
  });

  it('CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU 是字符串', () => {
    expect(typeof CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU).toBe('string');
  });

  it('CHAT_TEMPLATE_ARCHIVE_OPTION_PREFIX_ACU 是字符串', () => {
    expect(typeof CHAT_TEMPLATE_ARCHIVE_OPTION_PREFIX_ACU).toBe('string');
  });

  it('MAX_CHAT_TEMPLATE_ARCHIVES_PER_TAG_ACU 是正整数', () => {
    expect(MAX_CHAT_TEMPLATE_ARCHIVES_PER_TAG_ACU).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_CHAT_TEMPLATE_ARCHIVES_PER_TAG_ACU)).toBe(true);
  });
});

// ═══ getChatScopedConfigContainer_ACU ═══
describe('getChatScopedConfigContainer_ACU', () => {
  it('无 chat 首条消息返回 null', () => {
    mockGetChatFirstLayerMessage.mockReturnValue(null);
    expect(getChatScopedConfigContainer_ACU([])).toBeNull();
  });

  it('首条消息无 ScopedConfig 字段返回 null', () => {
    mockGetChatFirstLayerMessage.mockReturnValue({});
    expect(getChatScopedConfigContainer_ACU([{}])).toBeNull();
  });

  it('ScopedConfig 为 JSON 字符串时正确解析', () => {
    const config = { version: 1, template: {} };
    const result = getChatScopedConfigContainer_ACU([{
      [CHAT_SCOPED_CONFIG_FIELD_ACU]: JSON.stringify(config),
    }]);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
  });

  it('ScopedConfig 为对象时直接返回', () => {
    const config = { version: 1, plot: { mode: 'chat_override' } };
    const result = getChatScopedConfigContainer_ACU([{
      [CHAT_SCOPED_CONFIG_FIELD_ACU]: config,
    }]);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
  });

  it('ScopedConfig 为数组时返回 null', () => {
    mockGetChatFirstLayerMessage.mockReturnValue({
      [CHAT_SCOPED_CONFIG_FIELD_ACU]: [1, 2],
    });
    expect(getChatScopedConfigContainer_ACU([{}])).toBeNull();
  });
});

// ═══ normalizeChatScopedConfigContainer_ACU ═══
describe('normalizeChatScopedConfigContainer_ACU', () => {
  it('null 输入返回带 version 的空对象', () => {
    mockCloneScopedConfigData.mockReturnValue(null);
    const result = normalizeChatScopedConfigContainer_ACU(null);
    expect(result.version).toBe(CHAT_SCOPED_CONFIG_VERSION_ACU);
  });

  it('有效输入保留内容并确保 version', () => {
    const input = { version: 1, template: { '': { mode: 'chat_override' } } };
    mockCloneScopedConfigData.mockReturnValue(JSON.parse(JSON.stringify(input)));
    const result = normalizeChatScopedConfigContainer_ACU(input);
    expect(result.version).toBe(1);
    expect(result.template).toBeDefined();
  });

  it('version 缺失时补齐为默认版本', () => {
    mockCloneScopedConfigData.mockReturnValue({ template: {} });
    const result = normalizeChatScopedConfigContainer_ACU({ template: {} });
    expect(result.version).toBe(CHAT_SCOPED_CONFIG_VERSION_ACU);
  });

  it('version 小于默认版本时提升到默认版本', () => {
    mockCloneScopedConfigData.mockReturnValue({ version: 0 });
    const result = normalizeChatScopedConfigContainer_ACU({ version: 0 });
    expect(result.version).toBe(CHAT_SCOPED_CONFIG_VERSION_ACU);
  });
});

// ═══ getChatSheetGuideContainer_ACU ═══
describe('getChatSheetGuideContainer_ACU', () => {
  it('无首条消息返回 null', () => {
    mockGetChatFirstLayerMessage.mockReturnValue(null);
    expect(getChatSheetGuideContainer_ACU([])).toBeNull();
  });

  it('无 SheetGuide 字段返回 null', () => {
    mockGetChatFirstLayerMessage.mockReturnValue({});
    expect(getChatSheetGuideContainer_ACU([{}])).toBeNull();
  });

  it('SheetGuide 为 JSON 字符串时正确解析', () => {
    const guide = { version: 2, tags: {} };
    const result = getChatSheetGuideContainer_ACU([{
      [CHAT_SHEET_GUIDE_FIELD_ACU]: JSON.stringify(guide),
    }]);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(2);
  });

  it('SheetGuide 为对象时直接返回', () => {
    const guide = { version: 2, tags: { '': { data: {} } } };
    const result = getChatSheetGuideContainer_ACU([{
      [CHAT_SHEET_GUIDE_FIELD_ACU]: guide,
    }]);
    expect(result).not.toBeNull();
    expect(result!.tags).toBeDefined();
  });
});