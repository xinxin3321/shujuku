<template>
  <section class="acu-v2-agent-wb-control">
    <div class="acu-v2-agent-wb-control__head">
      <div>
        <div class="acu-v2-agent-wb-control__title">{{ plotCopy.agentControl.title }}</div>
        <p class="acu-v2-agent-wb-control__desc">{{ plotCopy.agentControl.description }}</p>
      </div>
      <AcuBadge :variant="statusVariant">{{ statusText }}</AcuBadge>
    </div>

    <div class="acu-v2-agent-wb-control__body">
      <AcuSegmentedControl
        :model-value="agentControl.mode.value"
        :options="modeOptions"
        size="sm"
        aria-label="Agent 世界书模式"
        @update:model-value="onModeChange"
      />
      <div class="acu-v2-agent-wb-control__actions">
        <AcuButton size="sm" variant="danger" :loading="agentControl.busy.value === 'takeover'" :disabled="agentControl.busy.value !== null || !agentControl.isAgentMode.value" @click="runTakeover">
          {{ plotCopy.agentControl.takeover.button }}
        </AcuButton>
        <AcuButton size="sm" :loading="agentControl.busy.value === 'restore'" :disabled="agentControl.busy.value !== null || !agentControl.snapshot.value.active" @click="runRestore">
          {{ plotCopy.agentControl.restore.button }}
        </AcuButton>
        <AcuButton size="sm" variant="primary" :loading="agentControl.busy.value === 'skillify'" :disabled="agentControl.busy.value !== null" @click="runSkillify">
          {{ plotCopy.agentControl.skillify.button }}
        </AcuButton>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AgentWorldbookControlMode_ACU } from '../../data/models/settings-model';
import { usePlotWorldbookAgentControl } from '../composables/usePlotWorldbookAgentControl';
import { plotCopy } from '../copy/plot-copy';
import AcuBadge from './_lib/AcuBadge.vue';
import AcuButton from './_lib/AcuButton.vue';
import AcuSegmentedControl, { type AcuSegmentedOption } from './_lib/AcuSegmentedControl.vue';

type AcuBadgeVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const emit = defineEmits<{ (e: 'changed'): void }>();
const agentControl = usePlotWorldbookAgentControl();

const modeOptions: AcuSegmentedOption[] = [
  { value: 'disabled', label: plotCopy.agentControl.modes.disabled },
  { value: 'passive', label: plotCopy.agentControl.modes.passive },
  { value: 'agent', label: plotCopy.agentControl.modes.agent },
];

const statusVariant = computed<AcuBadgeVariant>(() => agentControl.snapshot.value.active ? 'warning' : (agentControl.isAgentMode.value ? 'accent' : 'neutral'));
const statusText = computed(() => agentControl.snapshot.value.active
  ? plotCopy.agentControl.status.active(agentControl.snapshotEntryCount.value)
  : plotCopy.agentControl.status.inactive);

function onModeChange(value: string): void {
  agentControl.setMode(value as AgentWorldbookControlMode_ACU);
}

async function runTakeover(): Promise<void> {
  if (await agentControl.takeover()) emit('changed');
}
async function runRestore(): Promise<void> {
  if (await agentControl.restore()) emit('changed');
}
async function runSkillify(): Promise<void> {
  if (await agentControl.skillifyAll()) emit('changed');
}
</script>

<style scoped>
.acu-v2-agent-wb-control { display: flex; flex-direction: column; gap: 10px; padding: 10px; border-radius: var(--acu-radius-sm); background: var(--acu-bg-2); }
.acu-v2-agent-wb-control__head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.acu-v2-agent-wb-control__title { font-size: var(--acu-font-size-body-lg, 13px); font-weight: 600; color: var(--acu-text-1); }
.acu-v2-agent-wb-control__desc { margin: 3px 0 0; font-size: var(--acu-font-size-caption, 11px); color: var(--acu-text-3); line-height: 1.5; }
.acu-v2-agent-wb-control__body { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.acu-v2-agent-wb-control__actions { display: flex; flex-wrap: wrap; gap: 6px; }
</style>
