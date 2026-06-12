<template>
  <AcuPanel
    :title="formFillCopy.panels.checkpoint.title"
    :description="formFillCopy.panels.checkpoint.description"
  >
    <div class="acu-form-fill-checkpoint-panel__status-grid">
      <div class="acu-form-fill-checkpoint-panel__status-item">
        <span>当前 full checkpoint</span>
        <strong>{{ currentCheckpointLabel }}</strong>
      </div>
      <div class="acu-form-fill-checkpoint-panel__status-item">
        <span>checkpoint 后增量日志</span>
        <strong>{{ entryCountLabel }}</strong>
      </div>
      <div class="acu-form-fill-checkpoint-panel__status-item">
        <span>累计操作大小</span>
        <strong>{{ cumulativeBytesLabel }}</strong>
      </div>
      <div class="acu-form-fill-checkpoint-panel__status-item">
        <span>累计操作单元</span>
        <strong>{{ cumulativeOperationCountLabel }}</strong>
      </div>
    </div>

    <AcuMessage kind="info">
      预计下次写入：
      <strong
        class="acu-form-fill-checkpoint-panel__next-kind"
        :class="{ 'acu-form-fill-checkpoint-panel__next-kind--full': status.nextWriteKind === 'full' }"
      >
        {{ nextWriteLabel }}
      </strong>
    </AcuMessage>

    <section class="acu-form-fill-checkpoint-panel__settings">
      <h4 class="acu-form-fill-checkpoint-panel__section-title">
        自动生成 full checkpoint
      </h4>
      <div class="acu-form-fill-checkpoint-panel__number-grid">
        <AcuFormRow
          v-for="field in checkpointFields"
          :key="field.key"
          :label="field.label"
          :hint="field.hint"
        >
          <AcuInput
            type="number"
            :min="field.min"
            :step="field.step"
            :model-value="field.value"
            @change="setCheckpointNumber(field.key, $event)"
          />
        </AcuFormRow>
      </div>
    </section>
  </AcuPanel>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { getChatArray_ACU } from "../../service/chat/chat-service";
import {
  currentJsonTableData_ACU,
  getCurrentIsolationKey_ACU,
} from "../../service/runtime/state-manager";
import { collectCheckpointGenerationStatusV2_ACU } from "../../service/table/storage-frame-v2-persist";
import { useChatChangedTick } from "../composables/useChatChangedListener";
import {
  useFormFillSettings,
  type NumberSettingKey,
} from "../composables/useFormFillSettings";
import { formFillCopy } from "../copy/form-fill-copy";
import AcuFormRow from "./_lib/AcuFormRow.vue";
import AcuInput from "./_lib/AcuInput.vue";
import AcuMessage from "./_lib/AcuMessage.vue";
import AcuPanel from "./_lib/AcuPanel.vue";

const checkpointFieldKeys = new Set<NumberSettingKey>([
  "checkpointMaxEntriesAfterCheckpoint",
  "checkpointMaxOperationKbAfterCheckpoint",
  "checkpointMaxOperationCountAfterCheckpoint",
  "checkpointCumulativeOperationRatioPercent",
  "checkpointSingleOperationRatioPercent",
]);

const settings = useFormFillSettings();
const refreshTick = ref(0);

const checkpointFields = computed(() =>
  settings.numberFields.value.filter((field) => checkpointFieldKeys.has(field.key)),
);
const checkpointSettingsFingerprint = computed(() =>
  checkpointFields.value.map((field) => `${field.key}:${field.value}`).join("|"),
);
const status = computed(() => {
  void refreshTick.value;
  void checkpointSettingsFingerprint.value;
  return collectCheckpointGenerationStatusV2_ACU(
    getChatArray_ACU(),
    getCurrentIsolationKey_ACU(),
    currentJsonTableData_ACU || null,
  );
});

const currentCheckpointLabel = computed(() =>
  status.value.latestCheckpointAiFloor
    ? `AI 第 ${status.value.latestCheckpointAiFloor} 层`
    : "当前隔离标签暂无 full checkpoint",
);
const entryCountLabel = computed(() =>
  `${status.value.entryCountAfterCheckpoint} / ${status.value.config.maxEntriesAfterCheckpoint} 条`,
);
const cumulativeBytesLabel = computed(() =>
  `${formatBytes(status.value.cumulativeOperationBytes)} / ${formatBytes(status.value.config.maxOperationBytesAfterCheckpoint)}`,
);
const cumulativeOperationCountLabel = computed(() =>
  `${status.value.cumulativeOperationCount} / ${status.value.config.maxOperationCountAfterCheckpoint}`,
);
const nextWriteLabel = computed(() =>
  status.value.nextWriteKind === "full" ? "full checkpoint" : "增量日志",
);

function formatBytes(bytes: number): string {
  const safeBytes = Math.max(0, Number(bytes) || 0);
  if (safeBytes < 1024) return `${safeBytes} B`;
  const kb = safeBytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function refresh(): void {
  settings.refresh();
  refreshTick.value++;
}

function setCheckpointNumber(key: NumberSettingKey, value: number | string): void {
  settings.setNumber(key, value);
  refreshTick.value++;
}

onMounted(refresh);
watch(useChatChangedTick(), refresh);
</script>

<style scoped>
.acu-form-fill-checkpoint-panel__status-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.acu-form-fill-checkpoint-panel__status-item {
  min-width: 0;
  padding: 10px;
  border-radius: var(--acu-radius-sm);
  background: var(--acu-bg-0);
  border: 1px solid var(--acu-border-2);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.acu-form-fill-checkpoint-panel__status-item span {
  color: var(--acu-text-3);
  font-size: var(--acu-font-size-caption, 11px);
}

.acu-form-fill-checkpoint-panel__status-item strong {
  color: var(--acu-text-1);
  font-size: var(--acu-font-size-body, 12px);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.acu-form-fill-checkpoint-panel__next-kind {
  color: var(--acu-accent);
}

.acu-form-fill-checkpoint-panel__next-kind--full {
  color: var(--acu-warning);
}

.acu-form-fill-checkpoint-panel__settings {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.acu-form-fill-checkpoint-panel__section-title {
  margin: 0;
  font-size: var(--acu-font-size-body, 12px);
  line-height: 1.4;
  color: var(--acu-text-1);
}

.acu-form-fill-checkpoint-panel__number-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

@media (max-width: 860px) {
  .acu-form-fill-checkpoint-panel__status-grid,
  .acu-form-fill-checkpoint-panel__number-grid {
    grid-template-columns: 1fr;
  }
}
</style>
