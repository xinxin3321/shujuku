// table-selector.ts
// 从 04_table_selectors.js 整体迁入

import { currentJsonTableData_ACU, settings_ACU } from '../../service/runtime/state-manager';
import { saveSettingsAndNotify_ACU } from './settings-ui-helpers';
import { escapeHtml_ACU } from '../../shared/html-helpers';
import { parseTableTemplateJson_ACU } from '../../shared/utils';
import { getSelectedManualSheetKeys_ACU } from '../triggers/settings-ui-sync';
import { getSortedSheetKeys_ACU } from '../../service/template/chat-scope';
import { jQuery_API_ACU } from '../../shared/host-api';
import { $manualTableSelector_ACU, $importTableSelector_ACU } from '../state/ui-refs';

  export function renderManualTableSelector_ACU() {
      if (!$manualTableSelector_ACU || !$manualTableSelector_ACU.length || !currentJsonTableData_ACU) return;
      const availableKeys = getSortedSheetKeys_ACU(currentJsonTableData_ACU);
      if (availableKeys.length === 0) {
          $manualTableSelector_ACU.html('<div class="notes">暂无表格可选。</div>');
          return;
      }
      const resolvedSelection = getSelectedManualSheetKeys_ACU();
      const selectedSet = new Set(resolvedSelection);
      if (!Array.isArray(settings_ACU.manualSelectedTables) || JSON.stringify(settings_ACU.manualSelectedTables) !== JSON.stringify(resolvedSelection)) {
          settings_ACU.manualSelectedTables = resolvedSelection;
          saveSettingsAndNotify_ACU();
      }
      let html = '<div class="acu-table-selector" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;max-height:240px;overflow:auto;padding:8px;border:1px solid var(--border-normal);border-radius:8px;background:var(--bg-secondary);">';
      availableKeys.forEach(key => {
          const name = currentJsonTableData_ACU[key]?.name || key;
          const checked = selectedSet.has(key) ? 'checked' : '';
          html += `<label style="display:flex;align-items:center;gap:8px;padding:10px;border:1px solid var(--border-normal);border-radius:6px;background:var(--bg-primary);">
              <input type="checkbox" data-key="${key}" ${checked} style="margin:0;width:14px;height:14px;flex-shrink:0;">
              <span style="flex:1;word-break:break-all;font-weight:600;">${escapeHtml_ACU(name)}</span>
          </label>`;
      });
      html += '</div>';
      $manualTableSelector_ACU.html(html);
    $manualTableSelector_ACU.off('change', 'input[type="checkbox"]').on('change', 'input[type="checkbox"]', function() {
          const checkedKeys: string[] = [];
          $manualTableSelector_ACU.find('input[type="checkbox"]:checked').each(function() {
              const key = jQuery_API_ACU(this).data('key');
              if (key) checkedKeys.push(key);
          });
          settings_ACU.manualSelectedTables = checkedKeys;
          settings_ACU.hasManualSelection = true;
          saveSettingsAndNotify_ACU();
      });
  }

  // 优先从当前UI读取勾选的表，若UI未渲染则回退到已保存选择
  export function getManualSelectionFromUI_ACU() {
      if ($manualTableSelector_ACU && $manualTableSelector_ACU.length) {
          const keys: string[] = [];
          $manualTableSelector_ACU.find('input[type="checkbox"]:checked').each(function() {
              const k = jQuery_API_ACU(this).data('key');
              if (k) keys.push(k);
          });
          if (keys.length > 0 || settings_ACU.hasManualSelection) {
              // 如果读取到选择，或曾经明确选择过，则同步到设置
              settings_ACU.manualSelectedTables = keys;
              settings_ACU.hasManualSelection = true;
              saveSettingsAndNotify_ACU();
              return keys;
          }
      }
      return getSelectedManualSheetKeys_ACU();
  }

  // =========================
  // [外部导入] 注入表格自选（与手动填表一致，但独立存储到 settings_ACU.importSelectedTables）
  // =========================
  export function getImportBaseTableData_ACU() {
      // 优先用“模板表结构”（外部导入的数据库就是从模板重建的）
      try {
          const templateData = parseTableTemplateJson_ACU({ stripSeedRows: true });
          if (templateData) return templateData;
      } catch (e) {
          // ignore
      }
      // 回退：如果模板解析失败，至少用当前内存数据渲染列表
      return currentJsonTableData_ACU || null;
  }

  export function getSelectedImportSheetKeys_ACU() {
      const base = getImportBaseTableData_ACU();
      if (!base) return [];
      const availableKeys = getSortedSheetKeys_ACU(base);
      const saved = Array.isArray(settings_ACU.importSelectedTables) ? settings_ACU.importSelectedTables : [];

      // 未曾手动选择过：默认全选
      if (!settings_ACU.hasImportTableSelection) return availableKeys;

      const validSaved = saved.filter((k: string) => availableKeys.includes(k));
      return validSaved;
  }

  export function renderImportTableSelector_ACU() {
      if (!$importTableSelector_ACU || !$importTableSelector_ACU.length) return;
      const base = getImportBaseTableData_ACU();
      if (!base) {
          $importTableSelector_ACU.html('<div class="notes">尚未加载表格结构。</div>');
          return;
      }
      const availableKeys = getSortedSheetKeys_ACU(base);
      if (availableKeys.length === 0) {
          $importTableSelector_ACU.html('<div class="notes">暂无表格可选。</div>');
          return;
      }

      const resolvedSelection = getSelectedImportSheetKeys_ACU();
      const selectedSet = new Set(resolvedSelection);
      if (!Array.isArray(settings_ACU.importSelectedTables) || JSON.stringify(settings_ACU.importSelectedTables) !== JSON.stringify(resolvedSelection)) {
          settings_ACU.importSelectedTables = resolvedSelection;
          saveSettingsAndNotify_ACU();
      }

      let html = '<div class="acu-table-selector" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;max-height:240px;overflow:auto;padding:8px;border:1px solid var(--border-normal);border-radius:8px;background:var(--bg-secondary);">';
      availableKeys.forEach(key => {
          const name = base[key]?.name || key;
          const checked = selectedSet.has(key) ? 'checked' : '';
          html += `<label style="display:flex;align-items:center;gap:8px;padding:10px;border:1px solid var(--border-normal);border-radius:6px;background:var(--bg-primary);">
              <input type="checkbox" data-key="${key}" ${checked} style="margin:0;width:14px;height:14px;flex-shrink:0;">
              <span style="flex:1;word-break:break-all;font-weight:600;">${escapeHtml_ACU(name)}</span>
          </label>`;
      });
      html += '</div>';
      $importTableSelector_ACU.html(html);
      $importTableSelector_ACU.off('change', 'input[type="checkbox"]').on('change', 'input[type="checkbox"]', function() {
          const checkedKeys: string[] = [];
          $importTableSelector_ACU.find('input[type="checkbox"]:checked').each(function() {
              const key = jQuery_API_ACU(this).data('key');
              if (key) checkedKeys.push(key);
          });
          settings_ACU.importSelectedTables = checkedKeys;
          settings_ACU.hasImportTableSelection = true;
          saveSettingsAndNotify_ACU();
      });
  }

  export function getImportSelectionFromUI_ACU() {
      if ($importTableSelector_ACU && $importTableSelector_ACU.length) {
          const keys: string[] = [];
          $importTableSelector_ACU.find('input[type="checkbox"]:checked').each(function() {
              const k = jQuery_API_ACU(this).data('key');
              if (k) keys.push(k);
          });
          if (keys.length > 0 || settings_ACU.hasImportTableSelection) {
              settings_ACU.importSelectedTables = keys;
              settings_ACU.hasImportTableSelection = true;
              saveSettingsAndNotify_ACU();
              return keys;
          }
      }
      return getSelectedImportSheetKeys_ACU();
  }

  export function handleImportSelectAll_ACU() {
      const base = getImportBaseTableData_ACU();
      if (!base) return;
      const keys = getSortedSheetKeys_ACU(base);
      settings_ACU.importSelectedTables = keys;
      settings_ACU.hasImportTableSelection = true;
      saveSettingsAndNotify_ACU();
      renderImportTableSelector_ACU();
  }

  export function handleImportSelectNone_ACU() {
      settings_ACU.importSelectedTables = [];
      settings_ACU.hasImportTableSelection = true;
      saveSettingsAndNotify_ACU();
      renderImportTableSelector_ACU();
  }

  export function handleManualSelectAll_ACU() {
      if (!currentJsonTableData_ACU) return;
      const keys = getSortedSheetKeys_ACU(currentJsonTableData_ACU);
      settings_ACU.manualSelectedTables = keys;
      settings_ACU.hasManualSelection = true;
      saveSettingsAndNotify_ACU();
      renderManualTableSelector_ACU();
  }

  export function handleManualSelectNone_ACU() {
      settings_ACU.manualSelectedTables = [];
      settings_ACU.hasManualSelection = true;
      saveSettingsAndNotify_ACU();
      renderManualTableSelector_ACU();
  }

  // [新增] 统一的手动更新函数（支持按表选择，优先使用模板参数）