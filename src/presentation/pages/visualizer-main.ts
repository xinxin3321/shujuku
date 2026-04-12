/**
 * presentation/pages/visualizer-main.ts — 可视化编辑器主区域 + 保存
 * 从 visualizer.ts 拆出
 */
import { TABLE_TEMPLATE_ACU } from '../../data/models/defaults-json.js';
import { isDefaultTemplatePresetSelection_ACU, normalizeTemplatePresetSelectionValue_ACU } from '../../data/repositories/template-preset-repo';
import { getOrderedSheetKeys_ACU } from './visualizer-sidebar';
import { showToastr_ACU } from '../theme/toast';
import { SillyTavern_API_ACU, TABLE_ORDER_FIELD_ACU, currentJsonTableData_ACU, getCurrentIsolationKey_ACU, settings_ACU, _set_currentJsonTableData_ACU} from '../../service/runtime/state-manager';
import { buildChatSheetGuideDataFromData_ACU, getChatSheetGuideDataForIsolationKey_ACU, sanitizeTemplateSnapshotForChat_ACU, setChatSheetGuideDataForIsolationKey_ACU } from '../../service/template/chat-scope';
import { refreshMergedDataAndNotify_ACU, updateReadableLorebookEntry_ACU } from '../../service/worldbook/pipeline';
import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';
import { topLevelWindow_ACU } from '../../shared/env';
import { escapeHtml_ACU } from '../../shared/html-helpers';
import { safeJsonStringify_ACU } from '../../shared/json-helpers';
import { applySheetOrderNumbers_ACU, ensureSheetOrderNumbers_ACU, isSummaryOrOutlineTable_ACU, logDebug_ACU, logError_ACU, logWarn_ACU, parseTableTemplateJson_ACU } from '../../shared/utils';
import { saveIndependentTableToChatHistory_ACU } from '../../data/repositories/table-repo';
import { applyTemplatePresetToCurrent_ACU, loadTemplatePresetSelect_ACU, resolveActiveTemplatePresetName_ACU, upsertTemplatePreset_ACU } from '../components/template-preset-ui';
import { updateCardUpdateStatusDisplay_ACU } from '../components/update-status-display';
import { applySpecialIndexSequenceToSummaryTables_ACU, getSummaryIndexColumnIndex_ACU, getTableLocksForSheet_ACU, isSpecialIndexLockEnabled_ACU, setSpecialIndexLockEnabled_ACU, toggleCellLock_ACU, toggleColLock_ACU, toggleRowLock_ACU } from '../../service/runtime/helpers-remaining';
import { getSortedSheetKeys_ACU, materializeDataFromSheetGuide_ACU } from '../../service/template/chat-scope';
import { DEFAULT_ENTRY_PLACEMENT_ACU, DEFAULT_EXTRA_INDEX_PLACEMENT_ACU, buildDefaultGlobalInjectionConfig_ACU, ensureSheetExportConfigDefaults_ACU, getFixedPlacementDefaultsForTable_ACU, getGlobalInjectionConfigFromData_ACU, isImportantPersonsTableName_ACU, isOutlineTableName_ACU, isSummaryTableName_ACU, normalizeLorebookPosition_ACU, normalizePlacementConfig_ACU, purgeSheetKeysFromChatHistoryHard_ACU } from '../../service/worldbook/injection-engine';

  export function renderVisualizerMain_ACU() {
      const $main = jQuery_API_ACU('#acu-vis-main-area');
      $main.empty();

      if (_acuVisState.mode === 'globalConfig') {
          renderVisualizerGlobalConfigMode_ACU($main);
          return;
      }
      
      if (!_acuVisState.currentSheetKey) {
          $main.html('<div style="text-align:center; padding:50px; color:#888;">请选择一个表格</div>');
          return;
      }
      
      const sheet = _acuVisState.tempData[_acuVisState.currentSheetKey];
      if (!sheet) return;

      if (_acuVisState.mode === 'data') {
          renderVisualizerDataMode_ACU($main, sheet);
      } else {
          renderVisualizerConfigMode_ACU($main, sheet);
      }
  }

  export function renderVisualizerGlobalConfigMode_ACU($container) {
      const cfg = getGlobalInjectionConfigFromData_ACU(_acuVisState.tempData, { ensureWriteBack: true });
      const readablePlacement = normalizePlacementConfig_ACU(cfg.readableEntryPlacement, buildDefaultGlobalInjectionConfig_ACU().readableEntryPlacement);
      const wrapperPlacement = normalizePlacementConfig_ACU(cfg.wrapperPlacement, buildDefaultGlobalInjectionConfig_ACU().wrapperPlacement);

      const html = `
          <div class="acu-config-panel">
              <div class="acu-config-section">
                  <h4>全局条目注入配置（跨表）</h4>
                  <div class="acu-hint" style="margin-bottom:10px;">该配置独立于单表，跟随当前模板预设保存。</div>
                  <div class="acu-form-group">
                      <label>全局可读条目位置:</label>
                      <select class="acu-form-input" id="cfg-global-readable-position">
                          <option value="at_depth_as_system" ${readablePlacement.position === 'at_depth_as_system' ? 'selected' : ''}>系统</option>
                          <option value="before_character_definition" ${readablePlacement.position === 'before_character_definition' ? 'selected' : ''}>角色定义前</option>
                          <option value="after_character_definition" ${readablePlacement.position === 'after_character_definition' ? 'selected' : ''}>角色定义后</option>
                      </select>
                  </div>
                  <div class="acu-form-group">
                      <label>全局可读条目插入深度 (Depth):</label>
                      <input type="number" class="acu-form-input" id="cfg-global-readable-depth" step="1" value="${readablePlacement.depth}">
                  </div>
                  <div class="acu-form-group">
                      <label>全局可读条目插入顺序 (Order):</label>
                      <input type="number" class="acu-form-input" id="cfg-global-readable-order" min="1" step="1" value="${readablePlacement.order}">
                  </div>

                  <div class="acu-form-group" style="margin-top:12px; padding-top:10px; border-top:1px dashed #ddd;">
                      <label>全局包裹条目位置:</label>
                      <select class="acu-form-input" id="cfg-global-wrapper-position">
                          <option value="at_depth_as_system" ${wrapperPlacement.position === 'at_depth_as_system' ? 'selected' : ''}>系统</option>
                          <option value="before_character_definition" ${wrapperPlacement.position === 'before_character_definition' ? 'selected' : ''}>角色定义前</option>
                          <option value="after_character_definition" ${wrapperPlacement.position === 'after_character_definition' ? 'selected' : ''}>角色定义后</option>
                      </select>
                  </div>
                  <div class="acu-form-group">
                      <label>全局包裹条目插入深度 (Depth):</label>
                      <input type="number" class="acu-form-input" id="cfg-global-wrapper-depth" step="1" value="${wrapperPlacement.depth}">
                  </div>
                  <div class="acu-form-group">
                      <label>全局包裹条目插入顺序 (Order):</label>
                      <input type="number" class="acu-form-input" id="cfg-global-wrapper-order" min="1" step="1" value="${wrapperPlacement.order}">
                  </div>
              </div>
          </div>
      `;
      $container.html(html);

      const parseIntOrDefault_ACU = (val, defVal) => {
          const n = parseInt(val, 10);
          return Number.isFinite(n) ? n : defVal;
      };
      const readPlacementFromInputs_ACU = (prefix, fallbackPlacement) => {
          const position = normalizeLorebookPosition_ACU(jQuery_API_ACU(`#${prefix}-position`).val(), fallbackPlacement.position);
          const depth = parseIntOrDefault_ACU(jQuery_API_ACU(`#${prefix}-depth`).val(), fallbackPlacement.depth);
          const order = parseIntOrDefault_ACU(jQuery_API_ACU(`#${prefix}-order`).val(), fallbackPlacement.order);
          return normalizePlacementConfig_ACU({ position, depth, order }, fallbackPlacement);
      };

      const syncGlobalInjectionConfigFromUi_ACU = () => {
          const nextCfg = getGlobalInjectionConfigFromData_ACU(_acuVisState.tempData, { ensureWriteBack: true });
          nextCfg.readableEntryPlacement = readPlacementFromInputs_ACU('cfg-global-readable', buildDefaultGlobalInjectionConfig_ACU().readableEntryPlacement);
          nextCfg.wrapperPlacement = readPlacementFromInputs_ACU('cfg-global-wrapper', buildDefaultGlobalInjectionConfig_ACU().wrapperPlacement);
          _acuVisState.tempData.mate.globalInjectionConfig = nextCfg;
      };

      jQuery_API_ACU('#cfg-global-readable-position, #cfg-global-readable-depth, #cfg-global-readable-order').on('input change', function() {
          syncGlobalInjectionConfigFromUi_ACU();
      });
      jQuery_API_ACU('#cfg-global-wrapper-position, #cfg-global-wrapper-depth, #cfg-global-wrapper-order').on('input change', function() {
          syncGlobalInjectionConfigFromUi_ACU();
      });
  }

  export function renderVisualizerDataMode_ACU($container, sheet) {
      // Headers
      const headers = sheet.content[0] || [];
      const dataHeaders = headers.slice(1);
      const rows = sheet.content.slice(1);
      const sheetKey = _acuVisState.currentSheetKey;
      const lockState = sheetKey ? getTableLocksForSheet_ACU(sheetKey) : { rows: new Set(), cols: new Set(), cells: new Set() };
      const isSummaryTable = isSummaryOrOutlineTable_ACU(sheet.name);
      const specialIndexCol = (isSummaryTable ? getSummaryIndexColumnIndex_ACU(sheet) : -1);
      const specialIndexLocked = (isSummaryTable && sheetKey) ? isSpecialIndexLockEnabled_ACU(sheetKey) : false;
      
      let html = `<div class="acu-card-grid">`;
      
      // Add "Add Row" card
      html += `
          <div class="acu-data-card" style="justify-content:center; align-items:center; cursor:pointer; background:#f0f6ff; border:2px dashed #4a90e2;" id="acu-vis-add-row">
              <i class="fa-solid fa-plus" style="font-size:30px; color:#4a90e2;"></i>
              <div style="margin-top:10px; color:#4a90e2; font-weight:bold;">添加新行</div>
          </div>
      `;

      rows.forEach((row, rIdx) => {
          const rowLocked = lockState.rows.has(rIdx);
          html += `<div class="acu-data-card">
                      <div class="acu-card-header">
                          <span>#${rIdx + 1}</span>
                          <div style="display:flex; align-items:center; gap:8px;">
                              <button class="acu-lock-btn acu-vis-lock-row ${rowLocked ? 'active' : ''}" data-idx="${rIdx}" title="锁定行（仅update）">
                                  <i class="fa-solid ${rowLocked ? 'fa-lock' : 'fa-unlock'}"></i>
                              </button>
                              <button class="acu-vis-del-row" data-idx="${rIdx}" style="background:none; border:none; color:#e95e5e; cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
                          </div>
                      </div>
                      <div class="acu-card-body">`;
          
          // Render fields (Skip index 0 usually internal ID or null)
          dataHeaders.forEach((header, colIdx) => {
              const val = row[colIdx + 1] || '';
              const colLocked = lockState.cols.has(colIdx);
              const cellLocked = lockState.cells.has(`${rIdx}:${colIdx}`);
              const isSpecialIndex = (isSummaryTable && colIdx === specialIndexCol);
              const lockedClass = (rowLocked || colLocked || cellLocked || (isSpecialIndex && specialIndexLocked)) ? 'acu-locked-field' : '';
              const colLockButton = isSpecialIndex
                  ? `<button class="acu-lock-btn special acu-vis-lock-special ${specialIndexLocked ? 'active' : ''}" data-col="${colIdx}" title="编码索引列特殊锁定">
                         <i class="fa-solid ${specialIndexLocked ? 'fa-lock' : 'fa-unlock'}"></i>
                         <span>特锁</span>
                     </button>`
                  : `<button class="acu-lock-btn acu-vis-lock-col ${colLocked ? 'active' : ''}" data-col="${colIdx}" title="锁定列（仅update）">
                         <i class="fa-solid ${colLocked ? 'fa-lock' : 'fa-unlock'}"></i>
                     </button>`;
              const cellLockButton = isSpecialIndex
                  ? ''
                  : `<button class="acu-lock-btn acu-vis-lock-cell ${cellLocked ? 'active' : ''}" data-row="${rIdx}" data-col="${colIdx}" title="锁定单元格（仅update）">
                         <i class="fa-solid ${cellLocked ? 'fa-lock' : 'fa-unlock'}"></i>
                     </button>`;
              html += `
                  <div class="acu-field-row ${lockedClass}">
                      <div class="acu-field-label" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                          <span>${escapeHtml_ACU(header)}</span>
                          ${colLockButton}
                      </div>
                      <div class="acu-field-value-wrap">
                          <div class="acu-field-value" contenteditable="true" data-row="${rIdx}" data-col="${colIdx}">${escapeHtml_ACU(String(val))}</div>
                          ${cellLockButton}
                      </div>
                  </div>
              `;
          });
          
          html += `</div></div>`;
      });
      
      html += `</div>`;
      $container.html(html);
      
      // Bind Data Events
      $container.find('.acu-field-value').on('input', function() {
          const rIdx = parseInt(jQuery_API_ACU(this).data('row'));
          const cIdx = parseInt(jQuery_API_ACU(this).data('col'));
          const val = jQuery_API_ACU(this).text(); // Use text() to avoid HTML injection
          
          // Update temp data (rIdx + 1 because row 0 is header)
          if (sheet.content[rIdx + 1]) {
              sheet.content[rIdx + 1][cIdx + 1] = val;
          }
      });
      
      $container.find('#acu-vis-add-row').on('click', () => {
          const newRow = new Array(headers.length).fill('');
          newRow[0] = null; // convention
          sheet.content.push(newRow);
          if (isSummaryTable && sheetKey && isSpecialIndexLockEnabled_ACU(sheetKey)) {
              applySpecialIndexSequenceToSummaryTables_ACU(_acuVisState.tempData);
          }
          renderVisualizerDataMode_ACU($container, sheet);
      });
      
      $container.find('.acu-vis-del-row').on('click', function() {
          const rIdx = parseInt(jQuery_API_ACU(this).data('idx'));
          if (confirm('确定删除此行吗？')) {
              sheet.content.splice(rIdx + 1, 1);
              if (isSummaryTable && sheetKey && isSpecialIndexLockEnabled_ACU(sheetKey)) {
                  applySpecialIndexSequenceToSummaryTables_ACU(_acuVisState.tempData);
              }
              renderVisualizerDataMode_ACU($container, sheet);
          }
      });

      // 行锁定
      $container.find('.acu-vis-lock-row').on('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          const rIdx = parseInt(jQuery_API_ACU(this).data('idx'));
          if (!sheetKey || Number.isNaN(rIdx)) return;
          toggleRowLock_ACU(sheetKey, rIdx);
          renderVisualizerDataMode_ACU($container, sheet);
      });

      // 列锁定
      $container.find('.acu-vis-lock-col').on('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          const cIdx = parseInt(jQuery_API_ACU(this).data('col'));
          if (!sheetKey || Number.isNaN(cIdx)) return;
          toggleColLock_ACU(sheetKey, cIdx);
          renderVisualizerDataMode_ACU($container, sheet);
      });

      // 单元格锁定
      $container.find('.acu-vis-lock-cell').on('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          const rIdx = parseInt(jQuery_API_ACU(this).data('row'));
          const cIdx = parseInt(jQuery_API_ACU(this).data('col'));
          if (!sheetKey || Number.isNaN(rIdx) || Number.isNaN(cIdx)) return;
          toggleCellLock_ACU(sheetKey, rIdx, cIdx);
          renderVisualizerDataMode_ACU($container, sheet);
      });

      // 编码索引列特殊锁定
      $container.find('.acu-vis-lock-special').on('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          if (!sheetKey) return;
          const next = !isSpecialIndexLockEnabled_ACU(sheetKey);
          setSpecialIndexLockEnabled_ACU(sheetKey, next);
          if (next) {
              applySpecialIndexSequenceToSummaryTables_ACU(_acuVisState.tempData);
          }
          renderVisualizerDataMode_ACU($container, sheet);
      });
  }

  export function renderVisualizerConfigMode_ACU($container, sheet) {
      const config = ensureSheetExportConfigDefaults_ACU(sheet);
      const updateConfig = sheet.updateConfig || {};
      const sourceData = sheet.sourceData || {};
      const ucVal = (v) => (Number.isFinite(v) ? v : -1);
      const entryPlacement = normalizePlacementConfig_ACU(config.entryPlacement, DEFAULT_ENTRY_PLACEMENT_ACU);
      const extraIndexPlacement = normalizePlacementConfig_ACU(config.extraIndexPlacement, DEFAULT_EXTRA_INDEX_PLACEMENT_ACU);
      const fixedDefaults = getFixedPlacementDefaultsForTable_ACU(sheet.name);
      const fixedEntryPlacement = normalizePlacementConfig_ACU(config.fixedEntryPlacement, fixedDefaults.entry);
      const fixedIndexPlacement = normalizePlacementConfig_ACU(config.fixedIndexPlacement, fixedDefaults.index);
      const dataHeaders = Array.isArray(sheet?.content?.[0]) ? sheet.content[0].slice(1) : [];
      const selectedExtraIndexColumns = Array.isArray(config.extraIndexColumns)
          ? [...new Set(config.extraIndexColumns.filter(col => dataHeaders.includes(col)))]
          : [];
      const extraIndexColumnModes = (config.extraIndexColumnModes && typeof config.extraIndexColumnModes === 'object')
          ? config.extraIndexColumnModes
          : {};
      const extraIndexColumnsHtml = dataHeaders.length > 0
          ? dataHeaders.map((header, colIdx) => {
                const checked = selectedExtraIndexColumns.includes(header);
                const modeVal = extraIndexColumnModes[header] === 'index_only' ? 'index_only' : 'both';
                return `
                    <div class="acu-extra-index-col-row" style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                        <label style="display:flex; align-items:center; gap:6px; margin:0; min-width: 220px;">
                            <input type="checkbox" class="cfg-extra-index-col-check" data-col-idx="${colIdx}" ${checked ? 'checked' : ''}>
                            <span>${escapeHtml_ACU(header)}</span>
                        </label>
                        <select class="acu-form-input cfg-extra-index-col-mode" data-col-idx="${colIdx}" style="max-width: 260px;" ${checked ? '' : 'disabled'}>
                            <option value="both" ${modeVal === 'both' ? 'selected' : ''}>该列在原条目和索引条目都保留</option>
                            <option value="index_only" ${modeVal === 'index_only' ? 'selected' : ''}>该列仅放到索引条目</option>
                        </select>
                    </div>
                `;
            }).join('')
          : '<div class="acu-hint">当前表格没有可选列。</div>';
      const isSummaryTable = isSummaryOrOutlineTable_ACU(sheet.name);
      const sheetKey = _acuVisState.currentSheetKey;
      const specialIndexCol = isSummaryTable ? getSummaryIndexColumnIndex_ACU(sheet) : -1;
      const specialIndexHeader = (specialIndexCol >= 0 && Array.isArray(sheet.content?.[0]))
          ? sheet.content[0][specialIndexCol + 1]
          : '';
      const specialIndexLocked = (isSummaryTable && sheetKey) ? isSpecialIndexLockEnabled_ACU(sheetKey) : false;
      const isFixedConfigTable =
          isSummaryTableName_ACU(sheet.name) ||
          isOutlineTableName_ACU(sheet.name) ||
          isImportantPersonsTableName_ACU(sheet.name);
      const specialLockHtml = isSummaryTable ? `
              <div class="acu-config-section">
                  <h4>编码索引列锁定</h4>
                  <div class="acu-form-group">
                      <label>
                          <input type="checkbox" id="cfg-special-index-lock" ${specialIndexLocked ? 'checked' : ''}>
                          启用编码索引列特殊锁定
                      </label>
                      <div class="acu-hint">锁定时该列由系统按 AM0001、AM0002... 自动生成，仅对AI更新生效。</div>
                      ${specialIndexCol >= 0
                          ? `<div class="acu-hint">当前识别列: [${specialIndexCol}] ${escapeHtml_ACU(String(specialIndexHeader || ''))}</div>`
                          : `<div class="acu-hint" style="color:#f6c177;">未识别到编码索引列，将默认使用最后一列。</div>`}
                  </div>
              </div>
      ` : '';
      const fixedPlacementHtml = isFixedConfigTable ? `
              <div class="acu-config-section">
                  <h4>固定条目注入配置（本表专用）</h4>
                  <div class="acu-form-group">
                      <label>主条目位置:</label>
                      <select class="acu-form-input" id="cfg-fixed-entry-position">
                          <option value="at_depth_as_system" ${fixedEntryPlacement.position === 'at_depth_as_system' ? 'selected' : ''}>系统</option>
                          <option value="before_character_definition" ${fixedEntryPlacement.position === 'before_character_definition' ? 'selected' : ''}>角色定义前</option>
                          <option value="after_character_definition" ${fixedEntryPlacement.position === 'after_character_definition' ? 'selected' : ''}>角色定义后</option>
                      </select>
                  </div>
                  <div class="acu-form-group">
                      <label>主条目插入深度 (Depth):</label>
                      <input type="number" class="acu-form-input" id="cfg-fixed-entry-depth" step="1" value="${fixedEntryPlacement.depth}">
                  </div>
                  <div class="acu-form-group">
                      <label>主条目插入顺序 (Order):</label>
                      <input type="number" class="acu-form-input" id="cfg-fixed-entry-order" min="1" step="1" value="${fixedEntryPlacement.order}">
                  </div>
                  ${isImportantPersonsTableName_ACU(sheet.name) ? `
                  <div class="acu-form-group" style="margin-top:10px; padding-top:10px; border-top: 1px dashed #ddd;">
                      <label>索引条目位置:</label>
                      <select class="acu-form-input" id="cfg-fixed-index-position">
                          <option value="at_depth_as_system" ${fixedIndexPlacement.position === 'at_depth_as_system' ? 'selected' : ''}>系统</option>
                          <option value="before_character_definition" ${fixedIndexPlacement.position === 'before_character_definition' ? 'selected' : ''}>角色定义前</option>
                          <option value="after_character_definition" ${fixedIndexPlacement.position === 'after_character_definition' ? 'selected' : ''}>角色定义后</option>
                      </select>
                  </div>
                  <div class="acu-form-group">
                      <label>索引条目插入深度 (Depth):</label>
                      <input type="number" class="acu-form-input" id="cfg-fixed-index-depth" step="1" value="${fixedIndexPlacement.depth}">
                  </div>
                  <div class="acu-form-group">
                      <label>索引条目插入顺序 (Order):</label>
                      <input type="number" class="acu-form-input" id="cfg-fixed-index-order" min="1" step="1" value="${fixedIndexPlacement.order}">
                  </div>` : ''}
              </div>
      ` : '';
      
      const html = `
          <div class="acu-config-panel">
              <div class="acu-config-section">
                  <h4>基本信息</h4>
                  <div class="acu-form-group">
                      <label>表格名称:</label>
                      <input type="text" class="acu-form-input" id="cfg-name" value="${escapeHtml_ACU(sheet.name)}">
                  </div>
              </div>

              <div class="acu-config-section">
                  <h4>表头/列定义</h4>
                  <div class="acu-col-list" id="cfg-col-list"></div>
                  <button id="cfg-add-col" class="acu-btn-secondary" style="margin-top:10px; width:100%;"><i class="fa-solid fa-plus"></i> 添加列</button>
              </div>
              ${specialLockHtml}

              <div class="acu-config-section">
                  <h4>自动化更新参数</h4>
                  <div class="acu-form-group">
                      <label>AI读取上下文层数 (Context Depth): <span class="acu-hint">(-1 = 沿用UI全局, 1+ = 生效；0 会被视为沿用UI)</span></label>
                      <input type="number" class="acu-form-input" id="cfg-depth" min="-1" step="1" value="${ucVal(updateConfig.contextDepth)}">
                  </div>
                  <div class="acu-form-group">
                      <label>更新频率 (Update Frequency): <span class="acu-hint">(-1 = 沿用UI全局, 0 = 禁用该表自动更新)</span></label>
                      <input type="number" class="acu-form-input" id="cfg-freq" min="-1" step="1" value="${ucVal(updateConfig.updateFrequency)}">
                  </div>
                  <div class="acu-form-group">
                      <label>批处理大小 (Batch Size): <span class="acu-hint">(-1 = 沿用UI全局, 1+ = 生效；0 会被视为沿用UI)</span></label>
                      <input type="number" class="acu-form-input" id="cfg-batch" min="-1" step="1" value="${ucVal(updateConfig.batchSize)}">
                  </div>
                  <div class="acu-form-group">
                      <label>分组编号 (groupId): <span class="acu-hint">(-1 = 默认同组；不同编号的表会拆分并发；相同编号仍会继续按上下文与 Batch Size 分组)</span></label>
                      <input type="number" class="acu-form-input" id="cfg-group-id" min="-1" step="1" value="${ucVal(updateConfig.groupId)}">
                  </div>
                  <div class="acu-form-group">
                      <label>跳过更新楼层 (Skip Floors): <span class="acu-hint">(-1 = 沿用UI全局, 0+ = 生效)</span></label>
                      <input type="number" class="acu-form-input" id="cfg-skip" min="-1" step="1" value="${ucVal(updateConfig.skipFloors)}">
                  </div>
                  <div class="acu-form-group">
                      <label>发送最新N行 (Send Latest Rows): <span class="acu-hint">(-1 = 全部发送, 0 = 沿用UI全局, 1+ = 仅发送最新N条；纪要表固定使用10条)</span></label>
                      <input type="number" class="acu-form-input" id="cfg-send-rows" min="-1" step="1" value="${ucVal(updateConfig.sendLatestRows)}">
                  </div>
              </div>

              <div class="acu-config-section">
                  <h4>AI提示词指令 (Source Data)</h4>
                  <div class="acu-form-group">
                      <label>表格说明 (Note):</label>
                      <textarea class="acu-form-textarea" id="cfg-note">${escapeHtml_ACU(sourceData.note || '')}</textarea>
                  </div>
                  <div class="acu-form-group">
                      <label>初始化触发 (Init):</label>
                      <textarea class="acu-form-textarea" id="cfg-init">${escapeHtml_ACU(sourceData.initNode || '')}</textarea>
                  </div>
                  <div class="acu-form-group">
                      <label>新增触发 (Insert):</label>
                      <textarea class="acu-form-textarea" id="cfg-insert">${escapeHtml_ACU(sourceData.insertNode || '')}</textarea>
                  </div>
                  <div class="acu-form-group">
                      <label>更新触发 (Update):</label>
                      <textarea class="acu-form-textarea" id="cfg-update">${escapeHtml_ACU(sourceData.updateNode || '')}</textarea>
                  </div>
                  <div class="acu-form-group">
                      <label>删除触发 (Delete):</label>
                      <textarea class="acu-form-textarea" id="cfg-delete">${escapeHtml_ACU(sourceData.deleteNode || '')}</textarea>
                  </div>
              </div>
              
              <div class="acu-config-section">
                  <h4>世界书注入配置</h4>
                  <div class="acu-form-group">
                      <label>
                          <input type="checkbox" id="cfg-inject" ${config.injectIntoWorldbook !== false ? 'checked' : ''}>
                          是否注入到世界书条目
                      </label>
                      <div class="acu-hint">勾选后，该表格会注入到世界书条目中；关闭后不会注入到任何世界书条目。</div>
                  </div>
                  
                  <div style="border-top: 1px dashed #ddd; margin: 10px 0; padding-top: 10px;">
                      <div class="acu-form-group">
                          <label>
                              <input type="checkbox" id="cfg-export-enabled" ${config.enabled ? 'checked' : ''}>
                              启用独立导出 (Custom Export)
                          </label>
                          <div class="acu-hint">勾选后，该表格将额外导出为独立的世界书条目。</div>
                      </div>

                      <div id="cfg-export-options" style="display: ${config.enabled ? 'block' : 'none'}; padding-left: 20px; border-left: 2px solid #eee;">
                          <div class="acu-form-group">
                              <label>
                                  <input type="checkbox" id="cfg-split" ${config.splitByRow ? 'checked' : ''}>
                                  按行拆分 (Split by Row)
                              </label>
                              <div class="acu-hint">勾选后，每一行数据将生成一个单独的条目。</div>
                          </div>
                          
                          <div class="acu-form-group">
                              <label>条目名称 (Entry Name):</label>
                              <input type="text" class="acu-form-input" id="cfg-entry-name" value="${escapeHtml_ACU(config.entryName || sheet.name || '')}" placeholder="例如: ${escapeHtml_ACU(sheet.name)}">
                              <div class="acu-hint">如果不拆分，此为条目名；如果拆分，自动命名为 "名称-1", "名称-2" 等。</div>
                          </div>

                          <div class="acu-form-group">
                              <label>条目类型 (Entry Type):</label>
                              <select class="acu-form-input" id="cfg-entry-type">
                                  <option value="constant" ${(!config.entryType || config.entryType === 'constant') ? 'selected' : ''}>常量条目 (Constant/Blue)</option>
                                  <option value="keyword" ${config.entryType === 'keyword' ? 'selected' : ''}>关键词条目 (Keyword/Green)</option>
                              </select>
                          </div>

                          <div class="acu-form-group">
                              <label>关键词 (Keywords):</label>
                              <input type="text" class="acu-form-input" id="cfg-keywords" value="${escapeHtml_ACU(config.keywords || '')}" placeholder="关键词1, 关键词2">
                              <div class="acu-hint">
                                  如果未拆分，填写的词就是关键词。<br>
                                  如果拆分且关键词与列名相同，则使用该行对应列的内容作为关键词。
                              </div>
                          </div>
                          
                          <div class="acu-form-group">
                              <label>
                                  <input type="checkbox" id="cfg-recursion" ${config.preventRecursion !== false ? 'checked' : ''}>
                                  防止递归 (Prevent Recursion)
                              </label>
                          </div>

                          <div class="acu-form-group">
                              <label>自定义注入模板 (可选):</label>
                              <textarea class="acu-form-textarea" id="cfg-template" placeholder="使用 $1 代表本表导出的蓝灯/绿灯条目列表，$1 上下的内容会分别生成独立的常量条目，插入到该表注入区块的最前与最后。">${escapeHtml_ACU(config.injectionTemplate || '')}</textarea>
                              <div class="acu-hint">注入词现在以独立的常量条目进行包裹。填写模板后，$1 保留为条目本身，$1 之前和之后的内容会各自成为前/后包裹条目。</div>
                          </div>
                          <div class="acu-form-group" style="margin-top:10px; padding-top:10px; border-top: 1px dashed #ddd;">
                              <label>主条目位置:</label>
                              <select class="acu-form-input" id="cfg-entry-position">
                                  <option value="at_depth_as_system" ${entryPlacement.position === 'at_depth_as_system' ? 'selected' : ''}>系统</option>
                                  <option value="before_character_definition" ${entryPlacement.position === 'before_character_definition' ? 'selected' : ''}>角色定义前</option>
                                  <option value="after_character_definition" ${entryPlacement.position === 'after_character_definition' ? 'selected' : ''}>角色定义后</option>
                              </select>
                          </div>
                          <div class="acu-form-group">
                              <label>主条目插入深度 (Depth):</label>
                              <input type="number" class="acu-form-input" id="cfg-entry-depth" step="1" value="${entryPlacement.depth}">
                          </div>
                          <div class="acu-form-group">
                              <label>主条目插入顺序 (Order):</label>
                              <input type="number" class="acu-form-input" id="cfg-entry-order" min="1" step="1" value="${entryPlacement.order}">
                              <div class="acu-hint">只需设置主条目的顺序；若存在上/下包裹条目，会自动占用前后顺序位。</div>
                          </div>

                          <div class="acu-form-group" style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed #ddd;">
                              <label>
                                  <input type="checkbox" id="cfg-extra-index-enabled" ${config.extraIndexEnabled ? 'checked' : ''}>
                                  额外增加索引条目
                              </label>
                              <div class="acu-hint">启用后会在该表导出区块额外注入 1 条“索引条目”（常量条目）。</div>
                          </div>
                          <div id="cfg-extra-index-options" style="display: ${config.extraIndexEnabled ? 'block' : 'none'}; padding-left: 12px; border-left: 2px solid #eee;">
                              <div class="acu-form-group">
                                  <label>索引条目名称:</label>
                                  <input type="text" class="acu-form-input" id="cfg-extra-index-entry-name" value="${escapeHtml_ACU(config.extraIndexEntryName || `${config.entryName || sheet.name || ''}-索引`)}" placeholder="例如: ${escapeHtml_ACU((config.entryName || sheet.name || '表格') + '-索引')}">
                                  <div class="acu-hint">将作为额外注入世界书条目的名称。</div>
                              </div>
                              <div class="acu-form-group">
                                  <label>索引条目列选择（可多选）:</label>
                                  <div id="cfg-extra-index-columns-list">
                                      ${extraIndexColumnsHtml}
                                  </div>
                                  <div class="acu-hint">每列可独立设置：仅放索引条目，或原条目与索引条目都保留。</div>
                              </div>
                              <div class="acu-form-group">
                                  <label>索引条目自定义注入模板 (可选):</label>
                                  <textarea class="acu-form-textarea" id="cfg-extra-index-template" placeholder="使用 $1 代表索引条目内容；$1 上下内容会分别生成独立常量条目并放在索引条目之前/之后。">${escapeHtml_ACU(config.extraIndexInjectionTemplate || '')}</textarea>
                                  <div class="acu-hint">逻辑与独立导出条目的自定义注入模板一致。</div>
                              </div>
                              <div class="acu-form-group" style="margin-top:10px; padding-top:10px; border-top: 1px dashed #ddd;">
                                  <label>索引条目位置:</label>
                                  <select class="acu-form-input" id="cfg-extra-index-position">
                                      <option value="at_depth_as_system" ${extraIndexPlacement.position === 'at_depth_as_system' ? 'selected' : ''}>系统</option>
                                      <option value="before_character_definition" ${extraIndexPlacement.position === 'before_character_definition' ? 'selected' : ''}>角色定义前</option>
                                      <option value="after_character_definition" ${extraIndexPlacement.position === 'after_character_definition' ? 'selected' : ''}>角色定义后</option>
                                  </select>
                              </div>
                              <div class="acu-form-group">
                                  <label>索引条目插入深度 (Depth):</label>
                                  <input type="number" class="acu-form-input" id="cfg-extra-index-depth" step="1" value="${extraIndexPlacement.depth}">
                              </div>
                              <div class="acu-form-group">
                                  <label>索引条目插入顺序 (Order):</label>
                                  <input type="number" class="acu-form-input" id="cfg-extra-index-order" min="1" step="1" value="${extraIndexPlacement.order}">
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
              ${fixedPlacementHtml}
          </div>
      `;
      
      $container.html(html);
      
      // Render Columns
      const headers = sheet.content[0] || [];
      const $colList = jQuery_API_ACU('#cfg-col-list');
      
      function renderCols() {
          $colList.empty();
          headers.forEach((h, idx) => {
              if (idx === 0) return; // Skip ID
              const $item = jQuery_API_ACU(`
                  <div class="acu-col-item">
                      <span style="width:30px; text-align:center;">#${idx}</span>
                      <input type="text" class="acu-col-input" value="${escapeHtml_ACU(h)}" data-idx="${idx}">
                      <button class="acu-col-btn" style="color:#e95e5e;" data-idx="${idx}"><i class="fa-solid fa-times"></i></button>
                  </div>
              `);
              $colList.append($item);
          });
      }
      renderCols();
      
      // Bind Config Events
      $colList.on('input', '.acu-col-input', function() {
          const idx = parseInt(jQuery_API_ACU(this).data('idx'));
          headers[idx] = jQuery_API_ACU(this).val();
      });
      
      $colList.on('click', '.acu-col-btn', function() {
          const idx = parseInt(jQuery_API_ACU(this).data('idx'));
          if (confirm('删除列将同时删除该列的所有数据，确定吗？')) {
              // [修复] headers 是 sheet.content[0] 的引用，只需对数据行执行splice，避免双重删除
              headers.splice(idx, 1);
              sheet.content.slice(1).forEach(row => row.splice(idx, 1));
              renderCols();
          }
      });
      
      jQuery_API_ACU('#cfg-add-col').on('click', () => {
          const newName = prompt('输入新列名:');
          if (newName) {
              headers.push(newName);
              // Update all rows
              sheet.content.forEach((row, i) => {
                  if (i > 0) row.push('');
              });
              renderCols();
          }
      });
      
      // Inputs bindings
      jQuery_API_ACU('#cfg-name').on('input', function() { sheet.name = jQuery_API_ACU(this).val(); });
      if (isSummaryTable && sheetKey) {
          jQuery_API_ACU('#cfg-special-index-lock').on('change', function() {
              const enabled = jQuery_API_ACU(this).is(':checked');
              setSpecialIndexLockEnabled_ACU(sheetKey, enabled);
              if (enabled) {
                  applySpecialIndexSequenceToSummaryTables_ACU(_acuVisState.tempData);
              }
              renderVisualizerMain_ACU();
          });
      }
      const parseIntOrDefault_ACU = (val, defVal) => {
          const n = parseInt(val, 10);
          return Number.isFinite(n) ? n : defVal;
      };
      jQuery_API_ACU('#cfg-depth').on('input', function() { if (!sheet.updateConfig) sheet.updateConfig = {}; sheet.updateConfig.uiSentinel = -1; sheet.updateConfig.contextDepth = parseIntOrDefault_ACU(jQuery_API_ACU(this).val(), -1); });
      jQuery_API_ACU('#cfg-freq').on('input', function() { if (!sheet.updateConfig) sheet.updateConfig = {}; sheet.updateConfig.uiSentinel = -1; sheet.updateConfig.updateFrequency = parseIntOrDefault_ACU(jQuery_API_ACU(this).val(), -1); });
      jQuery_API_ACU('#cfg-batch').on('input', function() { if (!sheet.updateConfig) sheet.updateConfig = {}; sheet.updateConfig.uiSentinel = -1; sheet.updateConfig.batchSize = parseIntOrDefault_ACU(jQuery_API_ACU(this).val(), -1); });
      jQuery_API_ACU('#cfg-group-id').on('input', function() { if (!sheet.updateConfig) sheet.updateConfig = {}; sheet.updateConfig.uiSentinel = -1; sheet.updateConfig.groupId = parseIntOrDefault_ACU(jQuery_API_ACU(this).val(), -1); });
      jQuery_API_ACU('#cfg-skip').on('input', function() { if (!sheet.updateConfig) sheet.updateConfig = {}; sheet.updateConfig.uiSentinel = -1; sheet.updateConfig.skipFloors = parseIntOrDefault_ACU(jQuery_API_ACU(this).val(), -1); });
      jQuery_API_ACU('#cfg-send-rows').on('input', function() { if (!sheet.updateConfig) sheet.updateConfig = {}; sheet.updateConfig.uiSentinel = -1; sheet.updateConfig.sendLatestRows = parseIntOrDefault_ACU(jQuery_API_ACU(this).val(), -1); });
      
      jQuery_API_ACU('#cfg-note').on('input', function() { if (!sheet.sourceData) sheet.sourceData = {}; sheet.sourceData.note = jQuery_API_ACU(this).val(); });
      jQuery_API_ACU('#cfg-init').on('input', function() { if (!sheet.sourceData) sheet.sourceData = {}; sheet.sourceData.initNode = jQuery_API_ACU(this).val(); });
      jQuery_API_ACU('#cfg-insert').on('input', function() { if (!sheet.sourceData) sheet.sourceData = {}; sheet.sourceData.insertNode = jQuery_API_ACU(this).val(); });
      jQuery_API_ACU('#cfg-update').on('input', function() { if (!sheet.sourceData) sheet.sourceData = {}; sheet.sourceData.updateNode = jQuery_API_ACU(this).val(); });
      jQuery_API_ACU('#cfg-delete').on('input', function() { if (!sheet.sourceData) sheet.sourceData = {}; sheet.sourceData.deleteNode = jQuery_API_ACU(this).val(); });
      
      // Worldbook Config Bindings
      const ensureExportConfig = () => { if (!sheet.exportConfig) sheet.exportConfig = {}; };

      jQuery_API_ACU('#cfg-inject').on('change', function() {
          ensureExportConfig();
          sheet.exportConfig.injectIntoWorldbook = jQuery_API_ACU(this).is(':checked');
      });

      jQuery_API_ACU('#cfg-export-enabled').on('change', function() {
          ensureExportConfig();
          const isEnabled = jQuery_API_ACU(this).is(':checked');
          sheet.exportConfig.enabled = isEnabled;
          jQuery_API_ACU('#cfg-export-options').slideToggle(isEnabled);
      });

      jQuery_API_ACU('#cfg-split').on('change', function() {
          ensureExportConfig();
          sheet.exportConfig.splitByRow = jQuery_API_ACU(this).is(':checked');
      });

      jQuery_API_ACU('#cfg-entry-name').on('input', function() {
          ensureExportConfig();
          sheet.exportConfig.entryName = jQuery_API_ACU(this).val();
      });

      jQuery_API_ACU('#cfg-entry-type').on('change', function() {
          ensureExportConfig();
          sheet.exportConfig.entryType = jQuery_API_ACU(this).val();
      });

      jQuery_API_ACU('#cfg-keywords').on('input', function() {
          ensureExportConfig();
          sheet.exportConfig.keywords = jQuery_API_ACU(this).val();
      });

      jQuery_API_ACU('#cfg-recursion').on('change', function() {
          ensureExportConfig();
          sheet.exportConfig.preventRecursion = jQuery_API_ACU(this).is(':checked');
      });

      jQuery_API_ACU('#cfg-template').on('input', function() {
          ensureExportConfig();
          sheet.exportConfig.injectionTemplate = jQuery_API_ACU(this).val();
      });

      const readPlacementFromInputs_ACU = (prefix, fallbackPlacement) => {
          const position = normalizeLorebookPosition_ACU(jQuery_API_ACU(`#${prefix}-position`).val(), fallbackPlacement.position);
          const depth = parseIntOrDefault_ACU(jQuery_API_ACU(`#${prefix}-depth`).val(), fallbackPlacement.depth);
          const order = parseIntOrDefault_ACU(jQuery_API_ACU(`#${prefix}-order`).val(), fallbackPlacement.order);
          return normalizePlacementConfig_ACU({ position, depth, order }, fallbackPlacement);
      };

      const syncEntryPlacementFromUi_ACU = () => {
          ensureExportConfig();
          sheet.exportConfig.entryPlacement = readPlacementFromInputs_ACU('cfg-entry', DEFAULT_ENTRY_PLACEMENT_ACU);
      };
      jQuery_API_ACU('#cfg-entry-position, #cfg-entry-depth, #cfg-entry-order').on('input change', function() {
          syncEntryPlacementFromUi_ACU();
      });

      const syncExtraIndexConfigFromUi = () => {
          ensureExportConfig();
          const enabled = jQuery_API_ACU('#cfg-extra-index-enabled').is(':checked');
          sheet.exportConfig.extraIndexEnabled = enabled;
          const selectedColumns = [];
          const modeMap = {};
          jQuery_API_ACU('.cfg-extra-index-col-check').each(function() {
              const colIdx = parseInt(jQuery_API_ACU(this).attr('data-col-idx'), 10);
              const colName = dataHeaders[colIdx];
              if (!colName) return;
              const isChecked = jQuery_API_ACU(this).is(':checked');
              const $mode = jQuery_API_ACU(`.cfg-extra-index-col-mode[data-col-idx="${colIdx}"]`);
              $mode.prop('disabled', !isChecked);
              if (!isChecked) return;
              selectedColumns.push(colName);
              const modeVal = $mode.val() === 'index_only' ? 'index_only' : 'both';
              modeMap[colName] = modeVal;
          });
          sheet.exportConfig.extraIndexColumns = selectedColumns;
          sheet.exportConfig.extraIndexColumnModes = modeMap;
          sheet.exportConfig.extraIndexPlacement = readPlacementFromInputs_ACU('cfg-extra-index', DEFAULT_EXTRA_INDEX_PLACEMENT_ACU);
      };

      jQuery_API_ACU('#cfg-extra-index-enabled').on('change', function() {
          ensureExportConfig();
          const enabled = jQuery_API_ACU(this).is(':checked');
          sheet.exportConfig.extraIndexEnabled = enabled;
          jQuery_API_ACU('#cfg-extra-index-options').slideToggle(enabled);
          syncExtraIndexConfigFromUi();
      });

      jQuery_API_ACU('#cfg-extra-index-entry-name').on('input', function() {
          ensureExportConfig();
          sheet.exportConfig.extraIndexEntryName = jQuery_API_ACU(this).val();
      });

      jQuery_API_ACU('#cfg-extra-index-template').on('input', function() {
          ensureExportConfig();
          sheet.exportConfig.extraIndexInjectionTemplate = jQuery_API_ACU(this).val();
      });
      jQuery_API_ACU('#cfg-extra-index-position, #cfg-extra-index-depth, #cfg-extra-index-order').on('input change', function() {
          syncExtraIndexConfigFromUi();
      });

      jQuery_API_ACU('.cfg-extra-index-col-check').on('change', function() {
          syncExtraIndexConfigFromUi();
      });

      jQuery_API_ACU('.cfg-extra-index-col-mode').on('change', function() {
          syncExtraIndexConfigFromUi();
      });

      if (isFixedConfigTable) {
          const syncFixedEntryPlacementFromUi_ACU = () => {
              ensureExportConfig();
              const fallback = getFixedPlacementDefaultsForTable_ACU(sheet.name).entry;
              sheet.exportConfig.fixedEntryPlacement = readPlacementFromInputs_ACU('cfg-fixed-entry', fallback);
          };
          jQuery_API_ACU('#cfg-fixed-entry-position, #cfg-fixed-entry-depth, #cfg-fixed-entry-order').on('input change', function() {
              syncFixedEntryPlacementFromUi_ACU();
          });

          if (isImportantPersonsTableName_ACU(sheet.name)) {
              const syncFixedIndexPlacementFromUi_ACU = () => {
                  ensureExportConfig();
                  const fallback = getFixedPlacementDefaultsForTable_ACU(sheet.name).index;
                  sheet.exportConfig.fixedIndexPlacement = readPlacementFromInputs_ACU('cfg-fixed-index', fallback);
              };
              jQuery_API_ACU('#cfg-fixed-index-position, #cfg-fixed-index-depth, #cfg-fixed-index-order').on('input change', function() {
                  syncFixedIndexPlacementFromUi_ACU();
              });
          }
      }

  }

  export async function saveVisualizerChanges_ACU(saveToTemplate = false) {
      // 1. Check for Inheritance (Structure Mismatch)
      // Compare _acuVisState.tempData with original TABLE_TEMPLATE_ACU
      // But user might have just edited tempData to be different from template.
      // The requirement says: "check mismatch between new current table data and the CURRENTLY USED TEMPLATE".
      // If mismatch, prompt inheritance.
      
      // [新增] 按照用户调整的顺序重新组织数据
      const orderedData = {};
      const orderedKeys = getOrderedSheetKeys_ACU();
      
      // 先添加非表格数据（如 mate）
      Object.keys(_acuVisState.tempData).forEach(key => {
          if (!key.startsWith('sheet_')) {
              orderedData[key] = _acuVisState.tempData[key];
          }
      });
      
      // 按顺序添加表格数据
      orderedKeys.forEach(key => {
          if (_acuVisState.tempData[key]) {
              orderedData[key] = _acuVisState.tempData[key];
          }
      });

      // [新机制] 保存前统一重编号：编号随当前顺序变化，并写入当前数据（可随导出/导入迁移）
      applySheetOrderNumbers_ACU(orderedData, orderedKeys);
      
      // [新增] 若开启“编码索引列特殊锁定”，保存时强制按 AM 序列重排
      applySpecialIndexSequenceToSummaryTables_ACU(orderedData);
      
      // First, apply changes to local variable (使用排序后的数据)
      _set_currentJsonTableData_ACU(JSON.parse(JSON.stringify(orderedData)));

      // [新增] 可视化编辑器属于“用户显式修改表结构/表名/顺序”的入口：
      // 覆盖式更新聊天第一层的“空白指导表”（仅表头+参数，无数据行），让后续合并/显示/填表参数都以此为准。
      // 仅“保存到当前聊天”会把这次修改沉淀为当前聊天模板预设；“保存到全局”只更新全局预设与当前全局选择，不会自动清除当前聊天本地预设。
      if (!saveToTemplate) {
          try {
              const isolationKey = getCurrentIsolationKey_ACU();
              // 需求4（澄清版）：可视化编辑器触发指导表更新时，只更新表名/表头/表格参数，不修改指导表基础数据（seedRows）。
              // - 若当前聊天/标签已存在指导表：必须继承其 seedRows
              // - 若不存在指导表：从当前模板提取预置数据作为 seedRows（需求1）
              const existingGuide = getChatSheetGuideDataForIsolationKey_ACU(isolationKey);
              const templateObjForSeed = parseTableTemplateJson_ACU({ stripSeedRows: false });
              const guideData = buildChatSheetGuideDataFromData_ACU(currentJsonTableData_ACU, {
                  preserveSeedRowsFromGuideData: existingGuide,
                  seedRowsFromTemplateObj: templateObjForSeed,
              });
              if (guideData && Object.keys(guideData).some(k => k.startsWith('sheet_'))) {
                  const syncTemplateScope = true;
                  const templateScopeSource = materializeDataFromSheetGuide_ACU(guideData, { includeSeedRows: true });
                  setChatSheetGuideDataForIsolationKey_ACU(isolationKey, guideData, {
                      reason: 'visualizer_save',
                      syncTemplateScope,
                      templateSource: templateScopeSource,
                      presetName: resolveActiveTemplatePresetName_ACU({ fallbackToGlobal: true, isolationKey }),
                      source: 'visualizer_save',
                  });
                  logDebug_ACU(`[SheetGuide] Overwrote chat sheet guide from visualizer for tag [${isolationKey || '无标签'}] (tables=${Object.keys(guideData).filter(k => k.startsWith('sheet_')).length}).`);
              }
          } catch (e) {
              logWarn_ACU('[SheetGuide] Failed to overwrite sheet guide from visualizer:', e);
          }
      }

      // [新机制] 不再使用 settings_ACU.tableKeyOrder 强制固定顺序（顺序由每张表的 orderNo 决定）
      // 记录本次需要彻底清理的 key（真正清理会在“写回所有楼层”之后执行，防止后续写回把旧表带回）
      const deletedKeysToPurge_ACU = Array.isArray(_acuVisState.deletedSheetKeys) ? [..._acuVisState.deletedSheetKeys] : [];
      
      // Update template only if saveToTemplate is true
      // “保存到全局”会把当前编辑结果同步进全局模板预设；“保存到当前聊天”只沉淀聊天级预设/数据
      if (saveToTemplate) {
          let templateObj = null;
          try {
              templateObj = JSON.parse(TABLE_TEMPLATE_ACU);
              if (!templateObj || typeof templateObj !== 'object') templateObj = {};
              // 同步全局注入配置（存入模板 mate，不走 settings）
              const tempGlobalCfg = getGlobalInjectionConfigFromData_ACU(currentJsonTableData_ACU, { ensureWriteBack: true });
              const prevGlobalCfgStr = safeJsonStringify_ACU(templateObj?.mate?.globalInjectionConfig || {}, '{}');
              const nextGlobalCfgStr = safeJsonStringify_ACU(tempGlobalCfg || {}, '{}');
              if (!templateObj.mate || typeof templateObj.mate !== 'object') templateObj.mate = { type: 'chatSheets', version: 1 };
              if (!templateObj.mate.type) templateObj.mate.type = 'chatSheets';
              if (!Number.isFinite(templateObj.mate.version)) templateObj.mate.version = 1;
              templateObj.mate.globalInjectionConfig = tempGlobalCfg;
              let templateChanged = false;
              if (prevGlobalCfgStr !== nextGlobalCfgStr) templateChanged = true;

              // [优化] 全量同步：不仅更新现有表，也处理新增和删除的表
              // 1. 同步 currentJsonTableData_ACU 中的所有表到 templateObj
              Object.keys(currentJsonTableData_ACU).forEach(key => {
                  if (!key.startsWith('sheet_')) return;

                  const currentTable = currentJsonTableData_ACU[key];

                  // 如果模板中没有这个表，或者有这个key但名字变了(虽然key是唯一标识，但为了保险起见)，则新建/覆盖
                  // 这里的逻辑是：以 currentJsonTableData_ACU 为准

                  if (!templateObj[key]) {
                      // 新增表格：克隆整个结构，但清空数据行（保留表头）
                      const newTemplateTable = JSON.parse(JSON.stringify(currentTable));
                      if (newTemplateTable.content && newTemplateTable.content.length > 1) {
                          newTemplateTable.content = [newTemplateTable.content[0]]; // 只保留表头
                      }
                      // [新机制] 同步顺序编号
                      newTemplateTable[TABLE_ORDER_FIELD_ACU] = currentTable[TABLE_ORDER_FIELD_ACU];
                      templateObj[key] = newTemplateTable;
                      templateChanged = true;
                      logDebug_ACU(`Added new table "${currentTable.name}" to template.`);
                  } else {
                      // 更新现有表格
                      const templateTable = templateObj[key];

                      // 检查是否有实质性变更 (参数、表头、名称)
                      let hasChanges = false;

                      if (templateTable.name !== currentTable.name) {
                          templateTable.name = currentTable.name;
                          hasChanges = true;
                      }

                      // Deep compare and update sourceData
                      if (JSON.stringify(templateTable.sourceData) !== JSON.stringify(currentTable.sourceData)) {
                          templateTable.sourceData = currentTable.sourceData ? JSON.parse(JSON.stringify(currentTable.sourceData)) : {};
                          hasChanges = true;
                      }

                      // Deep compare and update updateConfig
                      if (JSON.stringify(templateTable.updateConfig) !== JSON.stringify(currentTable.updateConfig)) {
                          templateTable.updateConfig = currentTable.updateConfig ? JSON.parse(JSON.stringify(currentTable.updateConfig)) : {};
                          hasChanges = true;
                      }

                      // Deep compare and update exportConfig
                      if (JSON.stringify(templateTable.exportConfig) !== JSON.stringify(currentTable.exportConfig)) {
                          templateTable.exportConfig = currentTable.exportConfig ? JSON.parse(JSON.stringify(currentTable.exportConfig)) : {};
                          hasChanges = true;
                      }

                      // [新机制] 同步顺序编号（顺序变化也属于模板变更）
                      if (templateTable[TABLE_ORDER_FIELD_ACU] !== currentTable[TABLE_ORDER_FIELD_ACU]) {
                          templateTable[TABLE_ORDER_FIELD_ACU] = currentTable[TABLE_ORDER_FIELD_ACU];
                          hasChanges = true;
                      }

                      // Update headers (content[0])
                      if (currentTable.content && Array.isArray(currentTable.content) && currentTable.content.length > 0) {
                          const currentHeaders = currentTable.content[0];
                          const templateHeaders = templateTable.content[0];
                          if (JSON.stringify(currentHeaders) !== JSON.stringify(templateHeaders)) {
                              templateTable.content[0] = JSON.parse(JSON.stringify(currentHeaders));
                              hasChanges = true;
                          }
                      }

                      if (hasChanges) {
                          templateChanged = true;
                      }
                  }
              });

              // 2. 删除模板中存在但在 currentJsonTableData_ACU 中已不存在的表
              Object.keys(templateObj).forEach(key => {
                  if (key.startsWith('sheet_') && !currentJsonTableData_ACU[key]) {
                      delete templateObj[key];
                      templateChanged = true;
                      logDebug_ACU(`Removed table key "${key}" from template.`);
                  }
              });

              // [新机制] 再做一次兜底：按当前顺序补齐/重建模板编号（避免极端情况下编号缺失/重复）
              ensureSheetOrderNumbers_ACU(templateObj, { baseOrderKeys: orderedKeys, forceRebuild: false });

              if (templateChanged) {
                  const isolationKey = getCurrentIsolationKey_ACU();
                  const activePresetName = normalizeTemplatePresetSelectionValue_ACU(
                      resolveActiveTemplatePresetName_ACU({ fallbackToGlobal: true, isolationKey }),
                  );
                  let finalGlobalPresetName = activePresetName;
                  if (isDefaultTemplatePresetSelection_ACU(finalGlobalPresetName)) {
                      const promptedName = prompt('请输入要保存到全局的模板预设名称：', '新模板预设');
                      if (!promptedName) return;
                      finalGlobalPresetName = normalizeTemplatePresetSelectionValue_ACU(String(promptedName).trim());
                  } else if (!confirm(`确定要用当前编辑结果覆盖全局预设 "${finalGlobalPresetName}" 吗？`)) {
                      return;
                  }
                  if (!finalGlobalPresetName) return;

                  const preparedSnapshot = sanitizeTemplateSnapshotForChat_ACU(templateObj);
                  if (!preparedSnapshot?.templateStr) {
                      throw new Error('可视化编辑器保存到全局失败：无法生成模板快照。');
                  }
                  const presetSaved = upsertTemplatePreset_ACU(finalGlobalPresetName, preparedSnapshot.templateStr);
                  if (!presetSaved) {
                      throw new Error('可视化编辑器保存到全局失败：无法写入全局预设库。');
                  }

                  const appliedGlobalTemplate = await applyTemplatePresetToCurrent_ACU(finalGlobalPresetName, {
                      source: 'visualizer_save_to_global',
                      updateGlobal: true,
                      refreshUi: !!$popupInstance_ACU,
                      save: true,
                      persistChatScope: false,
                  });
                  if (!appliedGlobalTemplate) {
                      throw new Error('可视化编辑器保存到全局失败：模板快照应用失败。');
                  }
                  logDebug_ACU('Template fully synchronized via Visualizer.');
                  showToastr_ACU('success', `更改已保存到全局预设：${finalGlobalPresetName}；当前聊天的本地预设不会被自动清除。`);
              } else {
                  showToastr_ACU('info', '模板无变化，无需保存。');
              }
          } catch (e) {
              logError_ACU('Error updating template from visualizer:', e);
          }
      }

      // 2. Save to Chat History (per table, back to its original floor)
      const chat = SillyTavern_API_ACU.chat || [];
      if (!chat.length) {
          showToastr_ACU('warning', '聊天记录为空，更改仅保存在内存，未持久化。');
      } else {
          // 2.1 预先获取当前隔离标签与所有表
          const isolationKey = getCurrentIsolationKey_ACU();
          const allSheetKeys = getSortedSheetKeys_ACU(currentJsonTableData_ACU);
          
          // 2.2 计算最新一条 AI 楼层索引，作为兜底
          const latestAiIndex = (() => {
              for (let i = chat.length - 1; i >= 0; i--) {
                  if (!chat[i].is_user) return i;
              }
              return -1;
          })();
          
          // 2.3 查找每张表当前最新数据所在的原楼层
          const bucketByIndex = {};
          const resolveTargetIndexForSheet = (sheetKey) => {
              const table = currentJsonTableData_ACU[sheetKey];
              const isSummaryTable = table ? isSummaryOrOutlineTable_ACU(table.name) : false;
              
              for (let i = chat.length - 1; i >= 0; i--) {
                  const msg = chat[i];
                  if (msg.is_user) continue;
                  
                  let wasUpdated = false;
                  
                  // 优先：新格式（按标签分组）
                  if (msg.TavernDB_ACU_IsolatedData && msg.TavernDB_ACU_IsolatedData[isolationKey]) {
                      const tagData = msg.TavernDB_ACU_IsolatedData[isolationKey];
                      const modifiedKeys = tagData.modifiedKeys || [];
                      const updateGroupKeys = tagData.updateGroupKeys || [];
                      const independentData = tagData.independentData || {};
                      
                      if (updateGroupKeys.length > 0 && modifiedKeys.length > 0) {
                          wasUpdated = updateGroupKeys.includes(sheetKey);
                      } else if (modifiedKeys.length > 0) {
                          wasUpdated = modifiedKeys.includes(sheetKey);
                      } else if (independentData[sheetKey]) {
                          wasUpdated = true;
                      }
                  }
                  
                  // 兼容：旧格式（同样遵循隔离标签）
                  if (!wasUpdated) {
                      const msgIdentity = msg.TavernDB_ACU_Identity;
                      const isLegacyMatch = settings_ACU.dataIsolationEnabled
                          ? msgIdentity === settings_ACU.dataIsolationCode
                          : !msgIdentity;
                      
                      if (isLegacyMatch) {
                          const modifiedKeys = msg.TavernDB_ACU_ModifiedKeys || [];
                          const updateGroupKeys = msg.TavernDB_ACU_UpdateGroupKeys || [];
                          
                          if (updateGroupKeys.length > 0 && modifiedKeys.length > 0) {
                              wasUpdated = updateGroupKeys.includes(sheetKey);
                          } else if (modifiedKeys.length > 0) {
                              wasUpdated = modifiedKeys.includes(sheetKey);
                          } else {
                              const hasLegacyData =
                                  (msg.TavernDB_ACU_IndependentData && msg.TavernDB_ACU_IndependentData[sheetKey]) ||
                                  (isSummaryTable
                                      ? (msg.TavernDB_ACU_SummaryData && msg.TavernDB_ACU_SummaryData[sheetKey])
                                      : (msg.TavernDB_ACU_Data && msg.TavernDB_ACU_Data[sheetKey]));
                              wasUpdated = !!hasLegacyData;
                          }
                      }
                  }
                  
                  if (wasUpdated) return i; // 找到最新的原始楼层
              }
              
              return latestAiIndex; // 未找到时回退到最新楼层
          };
          
          allSheetKeys.forEach(key => {
              const idx = resolveTargetIndexForSheet(key);
              if (idx === -1) return; // 没有可保存的AI楼层
              
              if (!bucketByIndex[idx]) bucketByIndex[idx] = [];
              bucketByIndex[idx].push(key);
          });
          
          // 如果一个都没匹配到，但存在AI消息，则全部落在最新楼层以避免数据丢失
          if (Object.keys(bucketByIndex).length === 0 && latestAiIndex !== -1) {
              bucketByIndex[latestAiIndex] = [...allSheetKeys];
          }
          
          if (Object.keys(bucketByIndex).length === 0) {
              showToastr_ACU('warning', '找不到AI消息，更改仅保存到内存，未持久化到聊天记录。');
          } else {
              // 2.4 分楼层保存，每层只保存属于该层的表
              for (const [indexStr, keys] of Object.entries(bucketByIndex)) {
                  const idx = parseInt(indexStr, 10);
                  if (Number.isNaN(idx)) continue;
                  await saveIndependentTableToChatHistory_ACU(idx, keys, keys, true);
              }

              // 2.4.5 [关键] 如果本次在可视化编辑器删除了表格，则此处追溯整个聊天记录做“硬删除”
              // 说明：saveIndependentTableToChatHistory_ACU 只会覆盖/追加 keys，不会自动移除旧 keys，因此必须额外做一次全局清理。
              if (typeof purgeSheetKeysFromChatHistoryHard_ACU === 'function' && deletedKeysToPurge_ACU.length > 0) {
                  try {
                      const r = await purgeSheetKeysFromChatHistoryHard_ACU(deletedKeysToPurge_ACU);
                      if (r?.changed) {
                          logDebug_ACU(`[VisualizerDelete] Hard-purged ${deletedKeysToPurge_ACU.length} keys from ${r.changedCount} AI messages.`);
                      }
                      _acuVisState.deletedSheetKeys = [];
                  } catch (e) {
                      logWarn_ACU('[VisualizerDelete] Hard purge failed:', e);
                      // 不清空队列，让用户再次保存时有机会重试
                  }
              }

              // 2.5 所有保存完成后再统一刷新，确保读取最新数据再进行后续操作
              await refreshMergedDataAndNotify_ACU();
              if ($popupInstance_ACU && $popupInstance_ACU.length) {
                  loadTemplatePresetSelect_ACU({ keepGlobalValue: false });
              }
              showToastr_ACU('success', '更改已按原楼层保存到聊天记录！');
          }
      }

      // 3. Trigger UI Update & Worldbook Injection
      await updateReadableLorebookEntry_ACU(true);
      topLevelWindow_ACU.AutoCardUpdaterAPI._notifyTableUpdate();
      if (typeof updateCardUpdateStatusDisplay_ACU === 'function') updateCardUpdateStatusDisplay_ACU();

      // 4. Inheritance Check (已移除旧逻辑)
      // await checkAndPerformInheritance_ACU(templateObj);

      // Close
      closeACUWindow(`${SCRIPT_ID_PREFIX_ACU}-visualizer-window`);
  }

  // --- [Inheritance Logic (Legacy Removed)] ---

