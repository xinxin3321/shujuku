<template>
  <AcuDrawer
    :is-open="open"
    :title="plotCopy.agentControl.advanced.title"
    width="min(760px, 100vw)"
    @close="$emit('close')"
  >
    <div class="acu-agent-advanced">
      <AcuMessage kind="info">
        {{ plotCopy.agentControl.advanced.description }}
      </AcuMessage>

      <section class="acu-agent-advanced__section">
        <header class="acu-agent-advanced__section-head">
          <div>
            <h4>{{ plotCopy.agentControl.executionMode.label }}</h4>
            <p>{{ plotCopy.agentControl.executionMode.hint }}</p>
          </div>
        </header>
        <AcuSegmentedControl
          :model-value="agentControl.agentPlotExecutionMode.value"
          :options="executionModeOptions"
          size="sm"
          aria-label="Agent 与剧情推进执行方式"
          @update:model-value="onExecutionModeChange"
        />
      </section>

      <section class="acu-agent-advanced__section">
        <header class="acu-agent-advanced__section-head">
          <div>
            <h4>{{ plotCopy.agentControl.contextSettings.title }}</h4>
            <p>{{ plotCopy.agentControl.contextSettings.description }}</p>
          </div>
          <AcuButton size="sm" @click="resetContextSettings">
            {{ plotCopy.agentControl.contextSettings.resetButton }}
          </AcuButton>
        </header>
        <div class="acu-agent-advanced__grid">
          <AcuFormRow
            v-for="field in contextFields"
            :key="field.key"
            :label="field.copy.label"
            :hint="field.copy.hint"
          >
            <AcuInput
              type="number"
              size="sm"
              :model-value="agentControl.contextSettings.value[field.key]"
              :min="field.limits.min"
              :max="field.limits.max"
              :step="field.step"
              @change="onContextChange(field.key, $event)"
            />
          </AcuFormRow>
        </div>
      </section>

      <section class="acu-agent-advanced__section">
        <header class="acu-agent-advanced__section-head">
          <div>
            <h4>{{ plotCopy.agentControl.prompts.title }}</h4>
            <p>{{ plotCopy.agentControl.prompts.description }}</p>
          </div>
        </header>

        <div class="acu-agent-advanced__prompt-head">
          <h5>{{ plotCopy.agentControl.prompts.decisionTitle }}</h5>
          <AcuButton size="sm" @click="resetPrompt('decision')">
            {{ plotCopy.agentControl.prompts.decisionReset }}
          </AcuButton>
        </div>
        <AcuPromptSegments
          :segments="agentControl.agentDecisionPromptSegments.value"
          :role-options="AGENT_ROLE_OPTIONS"
          :show-slot="false"
          :allow-move="true"
          :rows="7"
          :empty-text="plotCopy.agentControl.prompts.emptyText"
          @add="(position) => addPromptSegment('decision', position)"
          @delete="(index) => deletePromptSegment('decision', index)"
          @move="(index, delta) => movePromptSegment('decision', index, delta)"
          @update="(index, patch) => updatePromptSegment('decision', index, patch)"
        />

        <div class="acu-agent-advanced__prompt-head">
          <h5>{{ plotCopy.agentControl.prompts.skillifyTitle }}</h5>
          <AcuButton size="sm" @click="resetPrompt('skillify')">
            {{ plotCopy.agentControl.prompts.skillifyReset }}
          </AcuButton>
        </div>
        <AcuPromptSegments
          :segments="agentControl.agentSkillifyPromptSegments.value"
          :role-options="AGENT_ROLE_OPTIONS"
          :show-slot="false"
          :allow-move="true"
          :rows="7"
          :empty-text="plotCopy.agentControl.prompts.emptyText"
          @add="(position) => addPromptSegment('skillify', position)"
          @delete="(index) => deletePromptSegment('skillify', index)"
          @move="(index, delta) => movePromptSegment('skillify', index, delta)"
          @update="(index, patch) => updatePromptSegment('skillify', index, patch)"
        />
      </section>
    </div>
  </AcuDrawer>
</template>


<script setup lang="ts">
import type { AgentContextSettings_ACU, PromptSegment_ACU } from '../../data/models/settings-model';
import type { AgentContextSettingKey_ACU, AgentPlotExecutionModeSetting_ACU, AgentPromptKind_ACU } from '../composables/usePlotWorldbookAgentControl';
import { usePlotWorldbookAgentControl } from '../composables/usePlotWorldbookAgentControl';
import { plotCopy } from '../copy/plot-copy';
import AcuButton from './_lib/AcuButton.vue';
import AcuDrawer from './_lib/AcuDrawer.vue';
import AcuFormRow from './_lib/AcuFormRow.vue';
import AcuInput from './_lib/AcuInput.vue';
import AcuMessage from './_lib/AcuMessage.vue';
import AcuPromptSegments from './_lib/AcuPromptSegments.vue';
import AcuSegmentedControl, { type AcuSegmentedOption } from './_lib/AcuSegmentedControl.vue';
import type { PromptSegment } from './_lib/AcuPromptSegments.vue';
import type { AcuSelectOption } from './_lib/AcuSelect.vue';

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'changed'): void;
}>();

const agentControl = usePlotWorldbookAgentControl();

const AGENT_ROLE_OPTIONS: AcuSelectOption[] = [
  { value: 'system', label: 'SYSTEM' },
  { value: 'user', label: 'USER' },
  { value: 'assistant', label: 'ASSISTANT' },
];

const executionModeOptions: AcuSegmentedOption[] = [
  { value: 'sequential', label: plotCopy.agentControl.executionMode.options.sequential },
  { value: 'concurrent', label: plotCopy.agentControl.executionMode.options.concurrent },
];

type ContextFieldMeta = {
  key: AgentContextSettingKey_ACU;
  step: number;
  copy: { label: string; hint: string };
  limits: { min: number; max: number };
};

type VisibleContextSettingKey_ACU = Exclude<AgentContextSettingKey_ACU, 'decisionWorldbookContentPreviewLimit' | 'decisionPreviousPlotCharLimit' | 'skillifyContentPreviewLimit'>;

const visibleContextFieldKeys: VisibleContextSettingKey_ACU[] = [
  'decisionRecentContextCharLimit',
  'decisionWorldbookCandidateLimit',
  'skillifyMaxEntries',
  'plotWorldbookScanMessageLimit',
  'agentAiMaxRetries',
  'greenlightMinTkBudget',
  'greenlightMaxTkBudget',
];

const contextFieldSteps: Record<VisibleContextSettingKey_ACU, number> = {
  decisionRecentContextCharLimit: 1,
  decisionWorldbookCandidateLimit: 1,
  skillifyMaxEntries: 1,
  plotWorldbookScanMessageLimit: 1,
  agentAiMaxRetries: 1,
  greenlightMinTkBudget: 100,
  greenlightMaxTkBudget: 100,
};

const contextFields: ContextFieldMeta[] = visibleContextFieldKeys.map((key) => ({
  key,
  step: contextFieldSteps[key],
  copy: plotCopy.agentControl.contextSettings.fields[key],
  limits: agentControl.contextSettingsLimits[key],
}));

async function onExecutionModeChange(value: string): Promise<void> {
  await agentControl.setAgentPlotExecutionMode(value as AgentPlotExecutionModeSetting_ACU);
  emit('changed');
}

async function onContextChange(key: AgentContextSettingKey_ACU, value: string | number): Promise<void> {
  if (await agentControl.setContextSetting(key, value)) emit('changed');
}

async function resetContextSettings(): Promise<void> {
  await agentControl.resetContextSettings();
  emit('changed');
}

async function resetPrompt(kind: AgentPromptKind_ACU): Promise<void> {
  await agentControl.resetPromptSegments(kind);
  emit('changed');
}

async function addPromptSegment(kind: AgentPromptKind_ACU, position: 'top' | 'bottom'): Promise<void> {
  await agentControl.addPromptSegment(kind, position);
  emit('changed');
}

async function deletePromptSegment(kind: AgentPromptKind_ACU, index: number): Promise<void> {
  await agentControl.deletePromptSegment(kind, index);
  emit('changed');
}

async function movePromptSegment(kind: AgentPromptKind_ACU, index: number, delta: -1 | 1): Promise<void> {
  await agentControl.movePromptSegment(kind, index, delta);
  emit('changed');
}

async function updatePromptSegment(
  kind: AgentPromptKind_ACU,
  index: number,
  patch: Partial<PromptSegment>,
): Promise<void> {
  await agentControl.updatePromptSegment(kind, index, patch as Partial<PromptSegment_ACU>);
  emit('changed');
}
</script>

<style scoped>
.acu-agent-advanced { display: flex; flex-direction: column; gap: 16px; min-width: 0; max-width: 100%; }
.acu-agent-advanced__section { display: flex; flex-direction: column; gap: 12px; min-width: 0; max-width: 100%; padding: 12px; border-radius: var(--acu-radius-sm); background: var(--acu-bg-2); }
.acu-agent-advanced__section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; min-width: 0; max-width: 100%; }
.acu-agent-advanced__section-head > div { min-width: 0; }
.acu-agent-advanced__section-head h4,
.acu-agent-advanced__prompt-head h5 { margin: 0; min-width: 0; color: var(--acu-text-1); overflow-wrap: anywhere; }
.acu-agent-advanced__section-head p { margin: 4px 0 0; color: var(--acu-text-3); font-size: var(--acu-font-size-caption, 11px); line-height: 1.5; overflow-wrap: anywhere; }
.acu-agent-advanced__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; min-width: 0; max-width: 100%; }
.acu-agent-advanced__prompt-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; max-width: 100%; margin-top: 4px; }
.acu-agent-advanced :deep(.acu-form-row),
.acu-agent-advanced :deep(.acu-form-row__control),
.acu-agent-advanced :deep(.acu-input),
.acu-agent-advanced :deep(.acu-segmented),
.acu-agent-advanced :deep(.acu-prompt-segs) {
  min-width: 0;
  max-width: 100%;
}

@media (max-width: 720px) {
  .acu-agent-advanced { gap: 12px; }
  .acu-agent-advanced__section { gap: 10px; padding: 10px; }
  .acu-agent-advanced__grid { grid-template-columns: minmax(0, 1fr); }
  .acu-agent-advanced__section-head,
  .acu-agent-advanced__prompt-head { flex-direction: column; align-items: stretch; }
}

@media (max-width: 420px) {
  .acu-agent-advanced__section { padding: 8px; }
}
</style>
