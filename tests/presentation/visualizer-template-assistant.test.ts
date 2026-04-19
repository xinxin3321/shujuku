import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockShowToastr, mockGenerate, mockApply, state } = vi.hoisted(() => ({
  mockShowToastr: vi.fn(),
  mockGenerate: vi.fn(),
  mockApply: vi.fn(() => true),
  state: {
    tempData: {
      sheet_a: { name: 'A表' },
    } as any,
    currentSheetKey: 'sheet_a',
    sheetOrder: ['sheet_a'],
    deletedSheetKeys: [],
  },
}));

function jqueryStub_ACU(selectorOrElement: any) {
  let elements: HTMLElement[] = [];
  if (typeof selectorOrElement === 'string') {
    elements = Array.from(document.querySelectorAll(selectorOrElement)) as HTMLElement[];
  } else if (selectorOrElement instanceof HTMLElement || (selectorOrElement && typeof selectorOrElement === 'object')) {
    elements = [selectorOrElement];
  }
  const api: any = {
    length: elements.length,
    html(value?: string) {
      if (value === undefined) return elements[0]?.innerHTML || '';
      elements.forEach((el) => { el.innerHTML = value; });
      return api;
    },
    find(selector: string) {
      const found = elements.flatMap((el) => Array.from(el.querySelectorAll(selector)) as HTMLElement[]);
      return jqueryStub_ACU(found[0] ?? { __elements: found });
    },
    on(event: string, handler: any) {
      elements.forEach((el) => el.addEventListener(event, handler));
      return api;
    },
    val(value?: string) {
      const el = elements[0] as HTMLInputElement | HTMLTextAreaElement | undefined;
      if (!el) return value === undefined ? '' : api;
      if (value === undefined) return el.value;
      el.value = value;
      return api;
    },
    data(name: string) {
      return elements[0]?.getAttribute(`data-${name}`);
    },
    prop(name: string) {
      return (elements[0] as any)?.[name];
    },
  };
  if ((selectorOrElement as any)?.__elements) {
    elements = (selectorOrElement as any).__elements;
    api.length = elements.length;
  }
  return api;
}

type ListenerMap_ACU = Record<string, Array<(event?: any) => any>>;

class FakeHTMLElement_ACU {
  private _innerHTML = '';
  style: Record<string, string> = {};
  value = '';
  disabled = false;
  checked = false;
  listeners: ListenerMap_ACU = {};
  attributes: Record<string, string> = {};

  constructor(private readonly selector: string, private readonly owner: FakeDocument_ACU) {}

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value: string) {
    this._innerHTML = String(value || '');
    this.owner.invalidateCache();
  }

  addEventListener(event: string, handler: any) {
    this.listeners[event] ||= [];
    this.listeners[event].push(handler);
  }

  dispatchEvent(event: any) {
    const type = String(event?.type || '');
    const handlers = this.listeners[type] || [];
    handlers.forEach((handler) => handler.call(this, event));
  }

  click() {
    this.dispatchEvent({ type: 'click' });
  }

  getAttribute(name: string) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  querySelectorAll(selector: string) {
    return this.owner.querySelectorAll(selector);
  }

  syncFromHtml(html: string) {
    if (this.selector === '#acu-vis-assistant-host') {
      this._innerHTML = html;
      return;
    }

    if (this.selector === '.acu-vis-assistant-panel') {
      const styleMatch = html.match(/class="acu-vis-assistant-panel"[^>]*style="([^"]*)"/);
      const displayMatch = styleMatch?.[1]?.match(/display\s*:\s*([^;]+)/);
      this.style.display = displayMatch ? displayMatch[1].trim() : '';
      return;
    }

    if (this.selector.startsWith('#')) {
      const id = this.selector.slice(1);
      const match = html.match(new RegExp(`<([a-zA-Z0-9-]+)[^>]*id="${id}"([^>]*)>`, 'i'));
      const attrs = match?.[2] || '';
      this.disabled = /disabled/.test(attrs);
      const dataRiskKeyMatch = attrs.match(/data-risk-key="([^"]+)"/);
      this.attributes = dataRiskKeyMatch ? { 'data-risk-key': dataRiskKeyMatch[1] } : {};
      return;
    }

    if (this.selector === '.acu-assistant-risk-confirm') {
      const match = html.match(/class="acu-assistant-risk-confirm"[^>]*data-risk-key="([^"]+)"([^>]*)/);
      if (match) {
        this.attributes = { 'data-risk-key': match[1] };
        this.checked = /checked/.test(match[2] || '');
      }
    }
  }
}

class FakeDocument_ACU {
  private elementCache = new Map<string, FakeHTMLElement_ACU[]>();
  body = new FakeHTMLElement_ACU('#acu-vis-assistant-host', this);

  invalidateCache() {
    this.elementCache.clear();
  }

  private buildElements(selector: string) {
    const html = this.body.innerHTML;
    if (selector === '#acu-vis-assistant-host') {
      this.body.syncFromHtml(html);
      return [this.body];
    }
    if (selector === '.acu-vis-assistant-panel') {
      if (!html.includes('acu-vis-assistant-panel')) return [];
      const el = new FakeHTMLElement_ACU(selector, this);
      el.syncFromHtml(html);
      return [el];
    }
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (!new RegExp(`id="${id}"`, 'i').test(html)) return [];
      const el = new FakeHTMLElement_ACU(selector, this);
      el.syncFromHtml(html);
      return [el];
    }
    if (selector === '.acu-assistant-risk-confirm') {
      if (!html.includes('acu-assistant-risk-confirm')) return [];
      const matches = Array.from(html.matchAll(/class="acu-assistant-risk-confirm"[^>]*data-risk-key="([^"]+)"([^>]*)/g));
      return matches.map((match) => {
        const el = new FakeHTMLElement_ACU(selector, this);
        el.attributes = { 'data-risk-key': match[1] };
        el.checked = /checked/.test(match[2] || '');
        return el;
      });
    }
    return [];
  }

  querySelector(selector: string) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector: string) {
    if (!this.elementCache.has(selector)) {
      this.elementCache.set(selector, this.buildElements(selector));
    }
    return this.elementCache.get(selector) || [];
  }
}

class FakeEvent_ACU {
  type: string;
  constructor(type: string) {
    this.type = type;
  }
}

const fakeDocument_ACU = new FakeDocument_ACU();

(globalThis as any).document = fakeDocument_ACU;
(globalThis as any).window = { Event: FakeEvent_ACU };
(globalThis as any).HTMLElement = FakeHTMLElement_ACU;
(globalThis as any).Event = FakeEvent_ACU;

vi.mock('../../src/presentation/theme/toast', () => ({
  showToastr_ACU: mockShowToastr,
}));

vi.mock('../../src/service/template-assistant/service', () => ({
  generateTemplateAssistantDraft_ACU: mockGenerate,
}));

vi.mock('../../src/presentation/pages/visualizer-template-assistant-apply', () => ({
  applyTemplateAssistantDraftToVisualizer_ACU: mockApply,
}));

vi.mock('../../src/presentation/pages/visualizer', () => ({
  _acuVisState: state,
}));

vi.mock('../../src/presentation/dom-utils', () => ({
  jQuery_API_ACU: jqueryStub_ACU,
}));

vi.mock('../../src/shared/html-helpers', () => ({
  escapeHtml_ACU: (v: string) => v,
}));

import {
  handleVisualizerTemplateAssistantSheetChange_ACU,
  renderVisualizerTemplateAssistantPanel_ACU,
  setVisualizerTemplateAssistantOpen_ACU,
} from '../../src/presentation/pages/visualizer-template-assistant';

describe('visualizer template assistant panel', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="acu-vis-assistant-host"></div>';
    fakeDocument_ACU.invalidateCache();
    mockShowToastr.mockReset();
    mockGenerate.mockReset();
    mockApply.mockReset();
    mockApply.mockReturnValue(true);
    state.tempData = { sheet_a: { name: 'A表' } } as any;
    state.currentSheetKey = 'sheet_a';
    state.sheetOrder = ['sheet_a'];
    state.deletedSheetKeys = [];
  });

  it('panel 能打开和关闭', () => {
    setVisualizerTemplateAssistantOpen_ACU(true);
    expect(document.querySelector('.acu-vis-assistant-panel')).toBeTruthy();

    const closeBtn = document.querySelector('#acu-vis-assistant-close') as HTMLButtonElement;
    closeBtn.click();
    expect((document.querySelector('.acu-vis-assistant-panel') as HTMLElement).style.display).toBe('none');
  });

  it('生成时读取 _acuVisState.tempData 最新快照', async () => {
    setVisualizerTemplateAssistantOpen_ACU(true);
    renderVisualizerTemplateAssistantPanel_ACU();
    state.tempData.sheet_b = { name: 'B表' } as any;
    mockGenerate.mockResolvedValue({ draft: { warnings: [] }, compileResult: { diff: { addedSheets: [], deletedSheets: [], renamedSheets: [], movedSheets: [], patchedSourceDataSheets: [], patchedUpdateConfigSheets: [], patchedExportConfigSheets: [], globalInjectionChanged: false }, highRiskItems: [] } });

    const textarea = document.querySelector('#acu-vis-assistant-input') as HTMLTextAreaElement;
    textarea.value = '新增';
    textarea.dispatchEvent(new Event('input'));
    const btn = document.querySelector('#acu-vis-assistant-generate') as HTMLButtonElement;
    btn.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockGenerate.mock.calls[0][0].tempData.sheet_b.name).toBe('B表');
  });

  it('draft 能展示 diff', async () => {
    setVisualizerTemplateAssistantOpen_ACU(true);
    renderVisualizerTemplateAssistantPanel_ACU();
    mockGenerate.mockResolvedValue({
      draft: { summary: '新增战利品表', warnings: ['注意命名一致性'] },
      compileResult: {
        diff: {
          addedSheets: [{ sheetKey: 'sheet_new', name: '战利品表' }],
          deletedSheets: [],
          renamedSheets: [{ sheetKey: 'sheet_a', beforeName: 'A表', afterName: '新A表' }],
          movedSheets: [],
          patchedSourceDataSheets: [],
          patchedUpdateConfigSheets: [{ sheetKey: 'sheet_a', name: 'A表', keys: ['contextDepth'] }],
          patchedExportConfigSheets: [],
          globalInjectionChanged: false,
        },
        highRiskItems: [],
      },
    });

    const textarea = document.querySelector('#acu-vis-assistant-input') as HTMLTextAreaElement;
    textarea.value = '新增战利品表';
    textarea.dispatchEvent(new Event('input'));
    (document.querySelector('#acu-vis-assistant-generate') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(document.body.innerHTML).toContain('战利品表 [sheet_new]');
    expect(document.body.innerHTML).toContain('A表: contextDepth');
    expect(document.body.innerHTML).toContain('A表 -> 新A表');
  });

  it('存在高风险项时未确认前应用按钮不可用', async () => {
    setVisualizerTemplateAssistantOpen_ACU(true);
    renderVisualizerTemplateAssistantPanel_ACU();
    mockGenerate.mockResolvedValue({
      draft: { summary: '删除旧表', warnings: [] },
      compileResult: {
        diff: {
          addedSheets: [],
          deletedSheets: [{ sheetKey: 'sheet_a', name: 'A表' }],
          renamedSheets: [],
          movedSheets: [],
          patchedSourceDataSheets: [],
          patchedUpdateConfigSheets: [],
          patchedExportConfigSheets: [],
          globalInjectionChanged: false,
        },
        highRiskItems: [{ type: 'delete_sheet', label: '删除表: A表' }],
      },
    });

    const textarea = document.querySelector('#acu-vis-assistant-input') as HTMLTextAreaElement;
    textarea.value = '删除旧表';
    textarea.dispatchEvent(new Event('input'));
    (document.querySelector('#acu-vis-assistant-generate') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();

    expect((document.querySelector('#acu-vis-assistant-apply') as HTMLButtonElement).disabled).toBe(true);
  });

  it('切换当前表时会刷新标题并清空旧草稿', async () => {
    setVisualizerTemplateAssistantOpen_ACU(true);
    renderVisualizerTemplateAssistantPanel_ACU();
    mockGenerate.mockResolvedValue({
      draft: { selectedSheetKey: 'sheet_a', summary: '新增战利品表', warnings: [] },
      compileResult: {
        diff: {
          addedSheets: [{ sheetKey: 'sheet_new', name: '战利品表' }],
          deletedSheets: [],
          renamedSheets: [],
          movedSheets: [],
          patchedSourceDataSheets: [],
          patchedUpdateConfigSheets: [],
          patchedExportConfigSheets: [],
          globalInjectionChanged: false,
        },
        highRiskItems: [],
      },
    });

    const textarea = document.querySelector('#acu-vis-assistant-input') as HTMLTextAreaElement;
    textarea.value = '新增战利品表';
    textarea.dispatchEvent(new Event('input'));
    (document.querySelector('#acu-vis-assistant-generate') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(document.body.innerHTML).toContain('当前表：A表 (sheet_a)');
    expect(document.body.innerHTML).toContain('战利品表 [sheet_new]');

    state.tempData.sheet_b = { name: 'B表' } as any;
    state.currentSheetKey = 'sheet_b';
    handleVisualizerTemplateAssistantSheetChange_ACU();

    expect(document.body.innerHTML).toContain('当前表：B表 (sheet_b)');
    expect(document.body.innerHTML).not.toContain('战利品表 [sheet_new]');
  });

  it('多条高风险操作需要逐项确认', async () => {
    setVisualizerTemplateAssistantOpen_ACU(true);
    renderVisualizerTemplateAssistantPanel_ACU();
    mockGenerate.mockResolvedValue({
      draft: { summary: '删除多张旧表', warnings: [] },
      compileResult: {
        diff: {
          addedSheets: [],
          deletedSheets: [{ sheetKey: 'sheet_a', name: 'A表' }, { sheetKey: 'sheet_b', name: 'B表' }],
          renamedSheets: [],
          movedSheets: [],
          patchedSourceDataSheets: [],
          patchedUpdateConfigSheets: [],
          patchedExportConfigSheets: [],
          globalInjectionChanged: false,
        },
        highRiskItems: [
          { type: 'delete_sheet', label: '删除表: A表' },
          { type: 'delete_sheet', label: '删除表: B表' },
        ],
      },
    });

    const textarea = document.querySelector('#acu-vis-assistant-input') as HTMLTextAreaElement;
    textarea.value = '删除两张旧表';
    textarea.dispatchEvent(new Event('input'));
    (document.querySelector('#acu-vis-assistant-generate') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();

    const checkboxes = document.querySelectorAll('.acu-assistant-risk-confirm') as unknown as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    expect((document.querySelector('#acu-vis-assistant-apply') as HTMLButtonElement).disabled).toBe(true);

    checkboxes[0].checked = true;
    checkboxes[0].dispatchEvent(new Event('change'));

    expect((document.querySelector('#acu-vis-assistant-apply') as HTMLButtonElement).disabled).toBe(true);
  });
});
