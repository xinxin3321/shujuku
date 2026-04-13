/**
 * presentation/triggers/auto-loop.ts — 自动化循环（Auto Loop）编排逻辑
 * 从 service/runtime/helpers-remaining.ts 搬出。
 * 这些函数涉及 UI 操作（写文本框、点发送按钮、更新循环状态 UI），属于 presentation 层。
 */

import { showToastr_ACU } from '../theme/toast';
import { DEFAULT_PLOT_SETTINGS_ACU } from '../../shared/defaults-json.js';
import { SillyTavern_API_ACU, loopState_ACU, planningGuard_ACU, settings_ACU } from '../../service/runtime/state-manager';
import { ensureLoopPromptsArray_ACU } from '../../service/plot/plot-logic';
import { logDebug_ACU, logError_ACU, logWarn_ACU } from '../../shared/utils';
import { clickSendButton_ACU, setSendTextareaValue_ACU } from '../components/status-display';
import { updateLoopTimerDisplay_ACU, updateLoopUIStatus_ACU } from './settings-ui-sync';

export async function startAutoLoop_ACU() {
    const plotSettings = settings_ACU.plotSettings;
    ensureLoopPromptsArray_ACU(plotSettings);
    const loopSettings = plotSettings.loopSettings;
    const loopDuration = (loopSettings.loopTotalDuration || 0) * 60 * 1000;

    if (!loopSettings.quickReplyContent || !Array.isArray(loopSettings.quickReplyContent) || loopSettings.quickReplyContent.length === 0) {
        showToastr_ACU('error', '请先添加至少一个循环提示词', '无法启动循环');
        stopAutoLoop_ACU();
        return;
    }
    loopSettings.currentPromptIndex = 0;

    if (loopDuration <= 0) {
        showToastr_ACU('error', '请设置有效的总倒计时 (大于0分钟)', '无法启动循环');
        stopAutoLoop_ACU();
        return;
    }

    loopState_ACU.isLooping = true;
    loopState_ACU.isRetrying = false;
    loopState_ACU.startTime = Date.now();
    loopState_ACU.totalDuration = loopDuration;
    loopState_ACU.retryCount = 0;

    logDebug_ACU('[剧情推进] Auto Loop Started. Duration: ' + loopDuration + 'ms');

    updateLoopUIStatus_ACU(true);

    loopState_ACU.tickInterval = setInterval(() => {
        const elapsed = Date.now() - loopState_ACU.startTime;
        const remaining = Math.max(0, loopState_ACU.totalDuration - elapsed);
        if (remaining <= 0) {
            stopAutoLoop_ACU();
            showToastr_ACU('info', '总倒计时结束，自动化循环已停止。', '循环结束');
            return;
        }
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        updateLoopTimerDisplay_ACU(formatted);
    }, 1000);

    triggerLoopGeneration_ACU();
}

export function stopAutoLoop_ACU() {
    loopState_ACU.isLooping = false;
    loopState_ACU.isRetrying = false;
    loopState_ACU.awaitingReply = false;
    if (loopState_ACU.timerId) {
        clearTimeout(loopState_ACU.timerId);
        loopState_ACU.timerId = null;
    }
    if (loopState_ACU.tickInterval) {
        clearInterval(loopState_ACU.tickInterval);
        loopState_ACU.tickInterval = null;
    }
    updateLoopUIStatus_ACU(false);
    logDebug_ACU('[剧情推进] Auto Loop Stopped.');
}

async function triggerLoopGeneration_ACU() {
    if (!loopState_ACU.isLooping) return;
    const plotSettings = settings_ACU.plotSettings;
    ensureLoopPromptsArray_ACU(plotSettings);
    const loopSettings = plotSettings.loopSettings;
    const prompts = loopSettings.quickReplyContent || [];

    if (!prompts || prompts.length === 0) {
        logWarn_ACU('[剧情推进] Loop prompts array is empty, stopping loop.');
        stopAutoLoop_ACU();
        return;
    }

    const currentIndex = loopSettings.currentPromptIndex || 0;
    const quickReplyContent = prompts[currentIndex] || prompts[0];
    if (!quickReplyContent || !quickReplyContent.trim()) {
        logWarn_ACU('[剧情推进] Current prompt is empty, stopping loop.');
        stopAutoLoop_ACU();
        return;
    }
    loopSettings.currentPromptIndex = (currentIndex + 1) % prompts.length;
    logDebug_ACU(`[剧情推进] 使用提示词 ${currentIndex + 1}/${prompts.length}: ${quickReplyContent.substring(0, 50)}...`);

    loopState_ACU.awaitingReply = true;
    setSendTextareaValue_ACU(quickReplyContent);

    setTimeout(() => {
        if (loopState_ACU.isLooping) {
            if (typeof clickSendButton_ACU === 'function') clickSendButton_ACU();
        }
    }, 100);
}

function validateLoopTags_ACU(content: any, tags: any) {
    if (!tags || !tags.trim()) return true;
    const tagList = tags.split(/[,，]/).map((t: string) => t.trim()).filter((t: string) => t);
    if (tagList.length === 0) return true;
    for (const tag of tagList) {
        if (!content.includes(tag)) {
            logDebug_ACU(`[剧情推进] Loop validation failed: missing tag "${tag}"`);
            return false;
        }
    }
    return true;
}

async function triggerDirectRegenerateForLoop_ACU(loopSettings: any) {
    loopState_ACU.awaitingReply = true;
    if ((window as any).TavernHelper?.triggerSlash) {
        await (window as any).TavernHelper.triggerSlash('/trigger await=true');
        return;
    }
    if ((window as any).original_TavernHelper_generate) {
        (window as any).original_TavernHelper_generate({ user_input: '' });
        return;
    }
    (window as any).TavernHelper?.generate?.({ user_input: '' });
}

export async function enterLoopRetryFlow_ACU({ loopSettings, shouldDeleteAiReply }: any) {
    loopState_ACU.isRetrying = true;
    loopState_ACU.retryCount++;
    const maxRetries = loopSettings.maxRetries ?? 3;

    logDebug_ACU(`[剧情推进] 进入重试流程: ${loopState_ACU.retryCount}/${maxRetries}.`);

    if (loopState_ACU.retryCount > maxRetries) {
        showToastr_ACU('error', `连续失败超过 ${maxRetries} 次，自动化循环已停止。`, '循环中止');
        stopAutoLoop_ACU();
        return;
    }

    if (shouldDeleteAiReply) {
        const chat = SillyTavern_API_ACU.chat;
        const last = chat?.length ? chat[chat.length - 1] : null;
        if (last && !last.is_user) {
            logDebug_ACU('[剧情推进] [重试] 删除缺失标签的AI楼层...');
            try {
                if (typeof SillyTavern_API_ACU.deleteLastMessage === 'function') {
                    await SillyTavern_API_ACU.deleteLastMessage();
                } else if ((window as any).SillyTavern?.deleteLastMessage) {
                    await (window as any).SillyTavern.deleteLastMessage();
                }
            } catch (e) {
                logError_ACU('[剧情推进] 删除楼层失败:', e);
            }
        } else {
            logDebug_ACU('[剧情推进] [重试] 不需要删除：最新楼层不是AI。');
        }
    }

    loopState_ACU.timerId = setTimeout(async () => {
        let busyWait = 0;
        while ((window as any).SillyTavern?.generating && busyWait < 20) {
            await new Promise(r => setTimeout(r, 500));
            busyWait++;
        }
        try {
            await triggerDirectRegenerateForLoop_ACU(loopSettings);
        } catch (err) {
            logError_ACU('[剧情推进] [重试] 触发生成失败:', err);
            if (loopState_ACU.isLooping) {
                await enterLoopRetryFlow_ACU({ loopSettings, shouldDeleteAiReply: false });
            }
        }
    }, (loopSettings.retryDelay || 3) * 1000);
}

export async function onLoopGenerationEnded_ACU() {
    if (!loopState_ACU.isLooping) return;
    if (!loopState_ACU.awaitingReply) return;

    if (planningGuard_ACU.inProgress) {
        logDebug_ACU('[剧情推进] [Loop] Planning in progress, ignoring GENERATION_ENDED.');
        return;
    }
    if (planningGuard_ACU.ignoreNextGenerationEndedCount > 0) {
        planningGuard_ACU.ignoreNextGenerationEndedCount--;
        logDebug_ACU(`[剧情推进] [Loop] Ignoring planning-triggered GENERATION_ENDED (${planningGuard_ACU.ignoreNextGenerationEndedCount} left).`);
        return;
    }

    await new Promise(resolve => setTimeout(resolve, 1500));
    if (!loopState_ACU.isLooping || !loopState_ACU.awaitingReply) return;

    const loopSettings = settings_ACU.plotSettings.loopSettings || DEFAULT_PLOT_SETTINGS_ACU.loopSettings;
    const chat = SillyTavern_API_ACU.chat;
    if (!chat || chat.length === 0) return;

    let lastMessage = chat[chat.length - 1];
    if (lastMessage.is_user && lastMessage._qrf_from_planning) {
        logDebug_ACU('[剧情推进] [Loop] 检测到规划层(user with _qrf_from_planning)，忽略，继续等待AI回复。');
        return;
    }

    if (lastMessage.is_user) {
        logWarn_ACU('[剧情推进] [Loop] 生成结束但最后一条是用户消息（无规划标记），等待2s后重试检测...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        const updatedChat = SillyTavern_API_ACU.chat;
        lastMessage = updatedChat?.length ? updatedChat[updatedChat.length - 1] : null;
    }

    if (!lastMessage || lastMessage.is_user) {
        logWarn_ACU('[剧情推进] [Loop] 未找到AI回复楼层，进入重试。');
        loopState_ACU.awaitingReply = false;
        await enterLoopRetryFlow_ACU({ loopSettings, shouldDeleteAiReply: false });
        return;
    }

    const activeChar = SillyTavern_API_ACU.characters?.[SillyTavern_API_ACU.this_chid];
    const activeCharName = activeChar?.name;
    if (activeCharName && lastMessage.name && lastMessage.name !== activeCharName) {
        logDebug_ACU(
            `[剧情推进] [Loop] 检测到来自其他角色/扩展的AI回复(name=${lastMessage.name})，与当前角色(${activeCharName})不符，忽略本次 GENERATION_ENDED。`
        );
        return;
    }

    const ok = validateLoopTags_ACU(lastMessage.mes, loopSettings.loopTags);
    if (ok) {
        logDebug_ACU('[剧情推进] 标签检测通过。继续循环。');
        loopState_ACU.isRetrying = false;
        loopState_ACU.retryCount = 0;
        loopState_ACU.awaitingReply = false;
        loopState_ACU.timerId = setTimeout(() => {
            triggerLoopGeneration_ACU();
        }, (loopSettings.loopDelay || 5) * 1000);
        return;
    }

    logDebug_ACU('[剧情推进] 标签检测未通过。进入重试。');
    loopState_ACU.awaitingReply = false;
    await enterLoopRetryFlow_ACU({ loopSettings, shouldDeleteAiReply: true });
}
