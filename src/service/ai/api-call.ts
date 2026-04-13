// service/ai/api-call.ts — AI 调用编排（剧情推进用）
// 从 04_shared_helpers.js 迁入

import { handleApiResponse_ACU } from './prompt-builder';
import { SillyTavern_API_ACU, TavernHelper_API_ACU, settings_ACU } from '../runtime/state-manager';
import { logDebug_ACU, logWarn_ACU } from '../../shared/utils';

export   async function callApi_ACU(messages, apiSettings, abortSignal = null) {
    // [新增] 获取剧情推进使用的API配置（支持API预设）
    const apiPresetConfig = getApiConfigByPreset_ACU(settings_ACU.plotApiPreset);
    const effectiveApiMode = apiPresetConfig.apiMode;
    const effectiveApiConfig = apiPresetConfig.apiConfig;
    
    logDebug_ACU(`[剧情推进] 使用API预设: ${settings_ACU.plotApiPreset || '当前配置'}, 模式: ${effectiveApiMode}`);

    if (effectiveApiMode === 'tavern' || effectiveApiConfig.useMainApi) {
      // 使用主API或酒馆预设（流式传输）
      logDebug_ACU('[剧情推进] 通过酒馆主API发送请求（流式传输）...');
      if (typeof TavernHelper_API_ACU.generateRaw !== 'function') {
        throw new Error('TavernHelper.generateRaw 函数不存在。请检查酒馆版本。');
      }
      const response = await TavernHelper_API_ACU.generateRaw({
        ordered_prompts: messages,
        should_stream: settings_ACU.streamingEnabled || false,
      });
      if (typeof response !== 'string') {
        throw new Error('主API调用未返回预期的文本响应。');
      }
      return response.trim();
    } else {
      // 使用自定义API（流式传输）
      if (!effectiveApiConfig.url || !effectiveApiConfig.model) {
        throw new Error('自定义API的URL或模型未配置。');
      }

      const requestBody = {
        messages: messages,
        model: effectiveApiConfig.model.replace(/^models\//, ''),
        max_tokens: effectiveApiConfig.maxTokens || effectiveApiConfig.max_tokens || 20000,
        temperature: effectiveApiConfig.temperature || 0.7,
        top_p: effectiveApiConfig.topP || effectiveApiConfig.top_p || 0.95,
        stream: settings_ACU.streamingEnabled || false,
        chat_completion_source: 'custom',
        group_names: [],
        include_reasoning: false,
        reasoning_effort: 'medium',
        enable_web_search: false,
        request_images: false,
        custom_prompt_post_processing: 'strict',
        reverse_proxy: effectiveApiConfig.url,
        proxy_password: '',
        custom_url: effectiveApiConfig.url,
        custom_include_headers: effectiveApiConfig.apiKey ? `Authorization: Bearer ${effectiveApiConfig.apiKey}` : '',
      };

      const response = await fetch('/api/backends/chat-completions/generate', {
        method: 'POST',
        headers: { ...SillyTavern.getRequestHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: abortSignal,
      });

      if (!response.ok) {
        const errTxt = await response.text();
        throw new Error(`API请求失败: ${response.status} ${errTxt}`);
      }

      // 根据streamingEnabled设置选择响应处理方式
      const content = await handleApiResponse_ACU(response, abortSignal);
      if (content) {
        return content.trim();
      }

      throw new Error(`API调用返回无效响应`);
    }
  }


export   function getApiConfigByPreset_ACU(presetName) {
    if (!presetName) {
      // 使用当前配置
      return {
        apiMode: settings_ACU.apiMode,
        apiConfig: settings_ACU.apiConfig,
        tavernProfile: settings_ACU.tavernProfile
      };
    }
    
    const preset = settings_ACU.apiPresets.find(p => p.name === presetName);
    if (preset) {
      return {
        apiMode: preset.apiMode,
        apiConfig: preset.apiConfig,
        tavernProfile: preset.tavernProfile
      };
    }
    
    // 预设不存在，回退到当前配置
    logWarn_ACU(`API预设 "${presetName}" 不存在，使用当前配置。`);
    return {
      apiMode: settings_ACU.apiMode,
      apiConfig: settings_ACU.apiConfig,
      tavernProfile: settings_ACU.tavernProfile
    };
  }


export   async function callCustomOpenAI_ACU_Direct(messages) {
      // Reuse the logic from callCustomOpenAI_ACU but bypass the prompt replacement part
      // ... For brevity, I will just call callCustomOpenAI_ACU with a hacked dynamicContent?
      // No, callCustomOpenAI_ACU relies on settings_ACU.charCardPrompt.
      // I should refactor callCustomOpenAI_ACU to accept direct messages, or duplicate the API calling part.
      
      // Duplicating API calling logic for safety and isolation
      if (settings_ACU.apiMode === 'tavern') {
          const profileId = settings_ACU.tavernProfile;
          return await SillyTavern_API_ACU.ConnectionManagerRequestService.sendRequest(
                profileId, messages, settings_ACU.apiConfig.max_tokens || 4096
          ).then(r => r.result.choices[0].message.content);
      } else {
          // Custom API（流式传输）
          if (settings_ACU.apiConfig.useMainApi) {
             return await TavernHelper_API_ACU.generateRaw({ ordered_prompts: messages, should_stream: settings_ACU.streamingEnabled || false });
          } else {
             const url = `/api/backends/chat-completions/generate`;
             const body = JSON.stringify({
                 messages: messages,
                 model: settings_ACU.apiConfig.model,
                 max_tokens: settings_ACU.apiConfig.max_tokens,
                 stream: settings_ACU.streamingEnabled || false,
                 chat_completion_source: "custom",
                 // ... other params
                 reverse_proxy: settings_ACU.apiConfig.url,
                 custom_url: settings_ACU.apiConfig.url,
                 custom_include_headers: settings_ACU.apiConfig.apiKey ? `Authorization: Bearer ${settings_ACU.apiConfig.apiKey}` : ""
             });
             const res = await fetch(url, { method: 'POST', headers: {...SillyTavern.getRequestHeaders(), 'Content-Type': 'application/json'}, body });
             // 根据streamingEnabled设置选择响应处理方式
             const content = await handleApiResponse_ACU(res);
             return content;
          }
      }
  }
