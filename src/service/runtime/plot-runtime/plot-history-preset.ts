/**
 * service/runtime/plot-runtime/plot-history-preset.ts
 * 剧情推进 — 预设加载/迁移 + 历史记录读写
 * 从 helpers-plot-runtime.ts 拆出（L1024-L1400）
 */
import { currentPlotTaskEditorId_ACU, _set_currentPlotTaskEditorId_ACU } from '../../plot/plot-state';
import { currentChatFileIdentifier_ACU, planningGuard_ACU, settings_ACU, tempPlotToSave_ACU, _set_tempPlotToSave_ACU } from '../state-manager';
import { getChatArray_ACU, saveChatToHost_ACU } from '../../../data/gateways/chat-gateway';
import { saveSettings_ACU } from '../../settings/settings-service';
import { buildChatPlotScopeStateFromSettings_ACU, getCurrentChatPlotScopeState_ACU, setCurrentChatPlotScopeState_ACU } from '../../template/chat-scope';
import { hashUserInput_ACU, logDebug_ACU, logWarn_ACU } from '../../../shared/utils';
import { applyPlotPresetToSettings_ACU, clearPlotPresetBindingForChat_ACU, ensurePlotPresetBindingsStore_ACU, ensurePlotTasksCompat_ACU, findPlotPresetByName_ACU, getCurrentRuntimePlotPresetName_ACU, getPlotGlobalRevision_ACU, getPlotPresetBindingForChat_ACU, isDefaultPlotPresetSelection_ACU, normalizePlotPresetSelectionValue_ACU, replaceCurrentPlotSettingsWithSnapshot_ACU, resetPlotSettingsToDefault_ACU, syncCurrentEditablePlotPresetState_ACU } from '../../plot/plot-logic';

  /**
   * 加载上次使用的预设到全局设置，并清除当前角色卡上冲突的陈旧设置。
   */
  export async function loadPresetAndCleanCharacterData_ACU() {
    const plotSettings = settings_ACU.plotSettings;
    if (!plotSettings) return;

    ensurePlotTasksCompat_ACU(plotSettings, { syncLegacy: true });
    ensurePlotPresetBindingsStore_ACU();

    const chatScopeState = getCurrentChatPlotScopeState_ACU();
    if (chatScopeState?.snapshot) {
      logDebug_ACU(`[剧情推进] Applying chat override snapshot for chat "${currentChatFileIdentifier_ACU || 'unknown'}".`);
      replaceCurrentPlotSettingsWithSnapshot_ACU(plotSettings, chatScopeState.snapshot);
      _set_currentPlotTaskEditorId_ACU('');
      syncCurrentEditablePlotPresetState_ACU({ source: 'load_chat_override' });

      if (clearPlotPresetBindingForChat_ACU(currentChatFileIdentifier_ACU)) {
        logDebug_ACU('[剧情推进] Cleared legacy plotPresetBindings entry because chat metadata override is authoritative.');
      }

      saveSettings_ACU();
      logDebug_ACU('[剧情推进] Chat override snapshot restored from chat history.');
      return;
    }

    let globalPresetName = normalizePlotPresetSelectionValue_ACU(plotSettings.lastUsedPresetName || '');
    let globalPresetToLoad = findPlotPresetByName_ACU(globalPresetName);
    if (globalPresetName && !globalPresetToLoad) {
      logWarn_ACU(`[剧情推进] Global preset "${globalPresetName}" no longer exists. Falling back to default preset.`);
      globalPresetName = '';
      plotSettings.lastUsedPresetName = '';
    }

    const legacyBinding = getPlotPresetBindingForChat_ACU();
    if (legacyBinding) {
      const legacyPresetName = normalizePlotPresetSelectionValue_ACU(legacyBinding.presetName || '');
      const bindingMatchesGlobal = legacyPresetName === globalPresetName;
      const bindingIsImplicitInherit = legacyBinding.isExplicit !== true || legacyBinding.source === 'inherit';

      if (bindingIsImplicitInherit || bindingMatchesGlobal) {
        if (clearPlotPresetBindingForChat_ACU(currentChatFileIdentifier_ACU)) {
          logDebug_ACU('[剧情推进] Cleared legacy inherit-style plot preset binding for current chat.');
        }
      } else {
        const legacyPresetToLoad = findPlotPresetByName_ACU(legacyPresetName);
        const canMigrateToChatSnapshot = isDefaultPlotPresetSelection_ACU(legacyPresetName) || !!legacyPresetToLoad;

        if (canMigrateToChatSnapshot) {
          if (legacyPresetToLoad) {
            logDebug_ACU(`[剧情推进] Migrating legacy binding to chat snapshot for chat "${currentChatFileIdentifier_ACU || 'unknown'}": "${legacyPresetName}"`);
            applyPlotPresetToSettings_ACU(plotSettings, legacyPresetToLoad);
          } else {
            logDebug_ACU(`[剧情推进] Migrating legacy default binding to chat snapshot for chat "${currentChatFileIdentifier_ACU || 'unknown'}".`);
            resetPlotSettingsToDefault_ACU(plotSettings);
          }

          _set_currentPlotTaskEditorId_ACU('');
          const migratedScopeState = buildChatPlotScopeStateFromSettings_ACU(plotSettings, {
            presetName: legacyPresetName,
            source: `legacy_binding_${legacyBinding.source || 'inherit'}`,
            originGlobalName: globalPresetName,
            originGlobalRevision: getPlotGlobalRevision_ACU(),
            updatedAt: legacyBinding.updatedAt || Date.now(),
          });

          if (migratedScopeState) {
            setCurrentChatPlotScopeState_ACU(migratedScopeState, { reason: 'migrate_legacy_plot_binding' });
            clearPlotPresetBindingForChat_ACU(currentChatFileIdentifier_ACU);
            syncCurrentEditablePlotPresetState_ACU({ source: 'migrate_legacy_plot_binding' });
            saveSettings_ACU();

            try {
                await saveChatToHost_ACU();
              } catch (error) {
                logWarn_ACU('[剧情推进] 保存迁移后的聊天级剧情推进快照失败:', error);
              }

            logDebug_ACU('[剧情推进] Legacy plotPresetBindings entry migrated to chat metadata snapshot.');
            return;
          }
        }

        logWarn_ACU(`[剧情推进] Legacy binding preset "${legacyPresetName}" could not be migrated. Falling back to inherit global/default.`);
        clearPlotPresetBindingForChat_ACU(currentChatFileIdentifier_ACU);
      }
    }

    if (globalPresetToLoad) {
      logDebug_ACU(`[剧情推进] Applying inherited global preset for chat "${currentChatFileIdentifier_ACU || 'unknown'}": "${globalPresetName}"`);
      applyPlotPresetToSettings_ACU(plotSettings, globalPresetToLoad);
    } else {
      logDebug_ACU(`[剧情推进] Applying inherited default preset for chat "${currentChatFileIdentifier_ACU || 'unknown'}".`);
      resetPlotSettingsToDefault_ACU(plotSettings);
    }

    _set_currentPlotTaskEditorId_ACU('');
    syncCurrentEditablePlotPresetState_ACU({ source: globalPresetToLoad ? 'load_inherit_global' : 'load_inherit_default' });
    saveSettings_ACU();

    logDebug_ACU('[剧情推进] Current chat is inheriting the active global plot preset state.');
  }

  // ═══ 历史记录读写 ═══

  function findPlotHistoryAnchorIndex_ACU(chat: any[], options: any = {}) {
    if (!Array.isArray(chat) || chat.length === 0) return -1;
    const beforeUserInputHash = String(options?.beforeUserInputHash || '').trim();
    const beforeUserInputText = String(options?.beforeUserInputText || '');
    if (!beforeUserInputHash && !beforeUserInputText.trim()) return -1;

    for (let i = chat.length - 1; i >= 0; i--) {
      const message = chat[i];
      if (!message?.is_user) continue;
      if (beforeUserInputHash && message._qrf_plot_pending_hash === beforeUserInputHash) {
        return i;
      }
      const messageText = String(message.mes || '');
      if (beforeUserInputHash && hashUserInput_ACU(messageText) === beforeUserInputHash) {
        return i;
      }
      if (!beforeUserInputHash && beforeUserInputText && messageText === beforeUserInputText) {
        return i;
      }
    }

    return -1;
  }

  function getPlotHistorySearchUpperBound_ACU(chat: any[], options: any = {}) {
    if (!Array.isArray(chat) || chat.length === 0) return -1;

    if (Number.isFinite(options?.beforeIndex)) {
      return Math.min(chat.length - 1, Math.floor(options.beforeIndex) - 1);
    }

    const anchorIndex = findPlotHistoryAnchorIndex_ACU(chat, options);
    if (anchorIndex >= 0) {
      return anchorIndex - 1;
    }

    return chat.length - 1;
  }

  export function getPlotFromHistory_ACU(options: any = {}) {
    const chat = getChatArray_ACU();
    logDebug_ACU('[剧情推进] [Plot] getPlotFromHistory_ACU 被调用，聊天记录长度:', chat?.length || 0, '，检索选项:', options || {});
    if (!chat || chat.length === 0) {
      logDebug_ACU('[剧情推进] [Plot] 聊天记录为空');
      return '';
    }

    const currentPresetName = getCurrentRuntimePlotPresetName_ACU({ fallbackToGlobal: true });
    logDebug_ACU('[剧情推进] [Plot] 当前聊天实际预设名称:', currentPresetName || '(默认预设)');

    const upperBound = getPlotHistorySearchUpperBound_ACU(chat, options);
    if (upperBound < 0) {
      logDebug_ACU('[剧情推进] [Plot] 当前楼层之前没有更早的用户消息或可检索范围为空，返回空字符串');
      return '';
    }

    let latestPlotContent = '';
    let latestPlotIndex = -1;

    for (let i = upperBound; i >= 0; i--) {
      const message = chat[i];
      if (message && message.qrf_plot) {
        const plotPresetName = message.qrf_plot_preset || '';

        if (currentPresetName === '') {
          latestPlotContent = message.qrf_plot;
          latestPlotIndex = i;
          logDebug_ACU(`[剧情推进] [Plot] (无预设模式) ✓ 在消息 ${i} 找到最新的plot数据，检索上界: ${upperBound}`);
          break;
        }

        if (plotPresetName === currentPresetName) {
          latestPlotContent = message.qrf_plot;
          latestPlotIndex = i;
          logDebug_ACU(`[剧情推进] [Plot] ✓ 在消息 ${i} (is_user=${message.is_user}) 找到精确匹配预设 "${currentPresetName}" 的plot数据，检索上界: ${upperBound}`);
          break;
        }
      }
    }

    if (!latestPlotContent && currentPresetName !== '') {
      logDebug_ACU(`[剧情推进] [Plot] 未找到精确匹配预设 "${currentPresetName}" 的数据，尝试在上界 ${upperBound} 之前寻找无标签旧数据...`);
      for (let i = upperBound; i >= 0; i--) {
        const message = chat[i];
        if (message && message.qrf_plot) {
          const plotPresetName = message.qrf_plot_preset || '';
          if (plotPresetName === '') {
            latestPlotContent = message.qrf_plot;
            latestPlotIndex = i;
            logDebug_ACU(`[剧情推进] [Plot] (兼容模式) ✓ 在消息 ${i} 找到无标签的旧plot数据作为回退，检索上界: ${upperBound}`);
            break;
          }
        }
      }
    }

    if (latestPlotContent) {
      logDebug_ACU(`[剧情推进] [Plot] 返回匹配预设 "${currentPresetName || '(无)'}" 的最新剧情规划数据，消息索引: ${latestPlotIndex}, 检索上界: ${upperBound}, 长度: ${latestPlotContent.length}`);
      return latestPlotContent;
    }

    logDebug_ACU(`[剧情推进] [Plot] 未找到匹配预设 "${currentPresetName || '(无)'}" 的plot数据，检索上界: ${upperBound}`);
    return '';
  }

  /**
   * 将plot附加到对应的用户消息上。
   * 使用用户输入文本哈希精确匹配，避免保存到错误的楼层。
   */
  export async function savePlotToLatestMessage_ACU(force = false) {
    logDebug_ACU('[剧情推进] [Plot] savePlotToLatestMessage_ACU 被调用');
    logDebug_ACU('[剧情推进] [Plot] planningGuard_ACU.inProgress:', planningGuard_ACU.inProgress);
    logDebug_ACU('[剧情推进] [Plot] planningGuard_ACU.ignoreNextGenerationEndedCount:', planningGuard_ACU.ignoreNextGenerationEndedCount);
    logDebug_ACU('[剧情推进] [Plot] tempPlotToSave_ACU:', tempPlotToSave_ACU ? (typeof tempPlotToSave_ACU === 'string' ? `长度=${tempPlotToSave_ACU.length}` : `content长度=${tempPlotToSave_ACU.content?.length}, hash=${tempPlotToSave_ACU.userInputHash}`) : '(空)');

    if (!force && planningGuard_ACU.inProgress) {
      logDebug_ACU('[剧情推进] [Plot] Planning in progress, ignoring GENERATION_ENDED.');
      return;
    }
    if (planningGuard_ACU.ignoreNextGenerationEndedCount > 0) {
      planningGuard_ACU.ignoreNextGenerationEndedCount--;
      logDebug_ACU(`[剧情推进] [Plot] Ignoring planning-triggered GENERATION_ENDED (${planningGuard_ACU.ignoreNextGenerationEndedCount} left).`);
      return;
    }

    if (!tempPlotToSave_ACU) {
      logDebug_ACU('[剧情推进] [Plot] tempPlotToSave_ACU 为空，无需保存');
      return;
    }

    let plotContent, userInputHash, userInputText;
    if (typeof tempPlotToSave_ACU === 'string') {
      plotContent = tempPlotToSave_ACU;
      userInputHash = null;
      userInputText = null;
      logDebug_ACU('[剧情推进] [Plot] 检测到旧格式数据，使用回退匹配逻辑');
    } else {
      plotContent = tempPlotToSave_ACU.content;
      userInputHash = tempPlotToSave_ACU.userInputHash;
      userInputText = tempPlotToSave_ACU.userInputText;
      logDebug_ACU('[剧情推进] [Plot] 使用新格式，用户输入哈希:', userInputHash, '，原始文本长度:', userInputText?.length || 0);
    }

    if (!plotContent) {
      logWarn_ACU('[剧情推进] [Plot] plotContent 为空，无法保存');
      _set_tempPlotToSave_ACU(null);
      return;
    }

    const MAX_POLL_ATTEMPTS = 20;
    const POLL_INTERVAL_MS = 100;
    let pollAttempts = 0;
    let target = null;

    const tryFindTarget = () => {
      const chat = getChatArray_ACU();
      if (!chat || chat.length === 0) {
        return null;
      }

      if (userInputHash) {
        for (let i = chat.length - 1; i >= 0; i--) {
          const msg = chat[i];
          if (msg && msg.is_user) {
            if (msg._qrf_plot_pending_hash === userInputHash) {
              delete msg._qrf_plot_pending_hash;
              if (!msg.qrf_plot) {
                logDebug_ACU(`[剧情推进] [Plot] ✓ 通过消息对象上的哈希标记找到目标用户消息（索引 ${i}，哈希: ${userInputHash}）`);
                return { msg, index: i };
              } else {
                logDebug_ACU(`[剧情推进] [Plot] 索引 ${i} 的消息哈希标记匹配但已有plot，继续查找`);
              }
            }
            
            const msgText = msg.mes || '';
            const msgHash = hashUserInput_ACU(msgText);
            
            if (msgHash === userInputHash) {
              if (!msg.qrf_plot) {
                logDebug_ACU(`[剧情推进] [Plot] ✓ 通过消息文本哈希精确匹配找到目标用户消息（索引 ${i}，哈希: ${userInputHash}）`);
                return { msg, index: i };
              } else {
                logDebug_ACU(`[剧情推进] [Plot] 索引 ${i} 的消息哈希匹配但已有plot，继续查找`);
              }
            }
          }
        }
      }

      for (let i = chat.length - 1; i >= 0; i--) {
        const msg = chat[i];
        if (msg && msg.is_user && !msg.qrf_plot) {
          logDebug_ACU(`[剧情推进] [Plot] 使用回退逻辑找到目标用户消息于索引 ${i}`);
          return { msg, index: i };
        }
      }

      return null;
    };

    const pollForTarget = () => {
      pollAttempts++;
      const result = tryFindTarget();
      
      if (result) {
        target = result.msg;
        logDebug_ACU(`[剧情推进] [Plot] 在第 ${pollAttempts} 次轮询中找到目标消息`);
        
        target.qrf_plot = plotContent;
        const currentPresetName = getCurrentRuntimePlotPresetName_ACU({ fallbackToGlobal: true });
        target.qrf_plot_preset = currentPresetName;
        logDebug_ACU('[剧情推进] [Plot] ✓ Plot数据已精确附加到目标用户消息，长度:', plotContent.length, '，预设:', currentPresetName || '(默认预设)');
        
        _set_tempPlotToSave_ACU(null);
        return true;
      }

      if (pollAttempts >= MAX_POLL_ATTEMPTS) {
        logWarn_ACU(`[剧情推进] [Plot] 轮询 ${MAX_POLL_ATTEMPTS} 次后仍未找到目标用户消息。用户输入哈希: ${userInputHash || '(无)'}，原始文本: ${userInputText ? `长度=${userInputText.length}` : '(无)'}。将在下一次事件中重试。`);
        return false;
      }

      setTimeout(pollForTarget, POLL_INTERVAL_MS);
      return null;
    };

    setTimeout(() => {
      pollForTarget();
    }, 100);
  }
