<template>
  <div class="acu-v2-wb-entries">
    <div v-if="loading" class="acu-v2-wb-entries__status">正在加载条目...</div>
    <div v-else-if="groups.length === 0" class="acu-v2-wb-entries__status">
      {{ emptyText }}
    </div>
    <template v-else>
      <AcuDisclosureGroup
        v-for="(group, index) in filteredGroups"
        :key="group.bookName"
        root-class="acu-v2-wb-entry-group"
        header-class="acu-v2-wb-entry-group__header"
        body-class="acu-v2-wb-entry-group__body"
        chevron-class="acu-v2-wb-entry-group__chevron"
        label-class="acu-v2-wb-entry-group__name"
        meta-class="acu-v2-wb-entry-group__meta"
        :label="group.bookName"
        :meta="formatGroupMeta(group)"
        :expanded="group.expanded"
        :body-id="`acu-v2-wb-entry-group-${index}`"
        body-mode="if"
        body-max-height="280px"
        @toggle="$emit('toggle-group', group.bookName)"
      >
        <div
          v-for="entry in group.entries"
          :key="`${group.bookName}-${entry.uid}`"
          class="acu-v2-wb-entry-item"
          :class="{ 'acu-v2-wb-entry-item--disabled': entry.disabled }"
        >
          <AcuCheckbox
            :model-value="entry.checked"
            :label="entry.label"
            :disabled="entry.disabled"
            @update:model-value="onToggle(entry.bookName, entry.uid, $event)"
          />
          <div class="acu-v2-wb-entry-item__actions">
            <span v-if="entry.skillMeta" class="acu-v2-wb-entry-item__skill-badge">Skill</span>
            <span v-if="formatAgentTakeoverState(entry)" class="acu-v2-wb-entry-item__state-badge">{{ formatAgentTakeoverState(entry) }}</span>
            <AcuCheckbox
              :model-value="entry.skillifySelected"
              label="Skill 化"
              :disabled="entry.disabled"
              @update:model-value="$emit('toggle-skillify', entry.bookName, entry.uid, $event)"
            />
            <AcuButton size="sm" @click="toggleSkillEditor(entry)">
              {{ isSkillEditorOpen(entry) ? '收起 Skill' : '编辑 Skill' }}
            </AcuButton>
          </div>
          <div v-if="isSkillEditorOpen(entry)" class="acu-v2-wb-entry-skill">
            <AcuTextarea
              :model-value="getSkillDraft(entry).description"
              label="Skill 描述"
              placeholder="描述该世界书条目的用途，留空则不写入 Skill 元数据。"
              :rows="2"
              :max-rows="6"
              auto-resize
              @update:model-value="patchSkillDraft(entry, { description: String($event) })"
            />
            <AcuTextarea
              :model-value="getSkillDraft(entry).triggerWhen"
              label="触发时机"
              placeholder="说明 Agent 何时应选择该条目，留空则不写入 Skill 元数据。"
              :rows="2"
              :max-rows="6"
              auto-resize
              @update:model-value="patchSkillDraft(entry, { triggerWhen: String($event) })"
            />
            <div class="acu-v2-wb-entry-skill__actions">
              <AcuButton size="sm" variant="primary" @click="saveSkill(entry)">保存 Skill</AcuButton>
              <AcuButton size="sm" variant="danger" @click="$emit('delete-skill', entry.bookName, entry.uid)">删除 Skill</AcuButton>
            </div>
          </div>
        </div>
      </AcuDisclosureGroup>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import AcuButton from './_lib/AcuButton.vue';
import AcuCheckbox from './_lib/AcuCheckbox.vue';
import AcuDisclosureGroup from './_lib/AcuDisclosureGroup.vue';
import AcuTextarea from './_lib/AcuTextarea.vue';
import type { WorldbookEntryGroup, WorldbookEntryItem } from '../composables/usePlotWorldbookEntries';

interface WorldbookSkillDraft {
  description: string;
  triggerWhen: string;
}

const props = withDefaults(defineProps<{
  groups: WorldbookEntryGroup[];
  filter: string;
  loading: boolean;
  emptyText?: string;
}>(), {
  emptyText: '所选世界书中无可显示的条目。',
});

const emit = defineEmits<{
  (e: 'toggle', bookName: string, uid: number, checked: boolean): void;
  (e: 'toggle-skillify', bookName: string, uid: number, checked: boolean): void;
  (e: 'toggle-group', bookName: string): void;
  (e: 'save-skill', bookName: string, uid: number, draft: WorldbookSkillDraft): void;
  (e: 'delete-skill', bookName: string, uid: number): void;
}>();

const skillEditorOpen = reactive<Record<string, boolean>>({});
const skillDrafts = reactive<Record<string, WorldbookSkillDraft>>({});

const filteredGroups = computed(() => {
  const q = props.filter.trim().toLowerCase();
  if (!q) return props.groups;
  return props.groups
    .map(g => {
      const bookMatch = g.bookName.toLowerCase().includes(q);
      if (bookMatch) return g;
      const filtered = g.entries.filter(e =>
        e.label.toLowerCase().includes(q) || e.bookName.toLowerCase().includes(q),
      );
      if (filtered.length === 0) return null;
      return { ...g, entries: filtered, expanded: true };
    })
    .filter((g): g is WorldbookEntryGroup => g !== null);
});

function formatGroupMeta(group: WorldbookEntryGroup): string {
  const checkedCount = group.entries.filter(entry => entry.checked).length;
  const skillCount = group.entries.filter(entry => entry.hasSkill).length;
  const controlledCount = group.entries.filter(entry => entry.agentTakeoverState === 'taken_over' || entry.agentTakeoverState === 'final_greenlight').length;
  const suffix = [
    skillCount > 0 ? `Skill ${skillCount}` : '',
    controlledCount > 0 ? `接管 ${controlledCount}` : '',
  ].filter(Boolean).join(' · ');
  return suffix ? `${checkedCount}/${group.entries.length} 条 · ${suffix}` : `${checkedCount}/${group.entries.length} 条`;
}

function formatAgentTakeoverState(entry: WorldbookEntryItem): string {
  if (entry.agentTakeoverState === 'initial_disabled') return '原本关闭';
  if (entry.agentTakeoverState === 'native') return '原生逻辑';
  if (entry.agentTakeoverState === 'skill_ready') return '可接管';
  if (entry.agentTakeoverState === 'taken_over') return 'Agent 接管';
  if (entry.agentTakeoverState === 'final_greenlight') return '正文放行';
  return '';
}

function onToggle(bookName: string, uid: number, checked: boolean): void {
  emit('toggle', bookName, uid, checked);
}

function getEntryKey(entry: WorldbookEntryItem): string {
  return `${entry.bookName}::${entry.uid}`;
}

function buildSkillDraft(entry: WorldbookEntryItem): WorldbookSkillDraft {
  return {
    description: entry.skillMeta?.description ?? '',
    triggerWhen: entry.skillMeta?.triggerWhen ?? '',
  };
}

function getSkillDraft(entry: WorldbookEntryItem): WorldbookSkillDraft {
  const key = getEntryKey(entry);
  if (!skillDrafts[key]) skillDrafts[key] = buildSkillDraft(entry);
  return skillDrafts[key];
}

function patchSkillDraft(entry: WorldbookEntryItem, patch: Partial<WorldbookSkillDraft>): void {
  const key = getEntryKey(entry);
  skillDrafts[key] = { ...getSkillDraft(entry), ...patch };
}

function isSkillEditorOpen(entry: WorldbookEntryItem): boolean {
  return !!skillEditorOpen[getEntryKey(entry)];
}

function toggleSkillEditor(entry: WorldbookEntryItem): void {
  const key = getEntryKey(entry);
  skillEditorOpen[key] = !skillEditorOpen[key];
  if (skillEditorOpen[key]) skillDrafts[key] = buildSkillDraft(entry);
}

function saveSkill(entry: WorldbookEntryItem): void {
  emit('save-skill', entry.bookName, entry.uid, { ...getSkillDraft(entry) });
}
</script>

<style scoped>
.acu-v2-wb-entries {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.acu-v2-wb-entries__status {
  padding: 8px 0;
  color: var(--acu-text-3);
  font-size: var(--acu-font-size-body, 12px);
}

.acu-v2-wb-entry-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 8px;
  align-items: center;
  padding: 3px 10px;
  transition: background 0.08s ease;
}
.acu-v2-wb-entry-item:hover { background: var(--acu-hover-overlay); }
.acu-v2-wb-entry-item--disabled {
  opacity: 0.5;
}

.acu-v2-wb-entry-item__actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.acu-v2-wb-entry-item__skill-badge {
  border-radius: 999px;
  padding: 1px 6px;
  background: color-mix(in srgb, var(--acu-accent) 14%, transparent);
  color: var(--acu-accent);
  font-size: var(--acu-font-size-caption, 11px);
  line-height: 1.5;
}

.acu-v2-wb-entry-item__state-badge {
  border-radius: 999px;
  padding: 1px 6px;
  background: color-mix(in srgb, var(--acu-warning) 14%, transparent);
  color: var(--acu-warning);
  font-size: var(--acu-font-size-caption, 11px);
  line-height: 1.5;
}

.acu-v2-wb-entry-skill {
  grid-column: 1 / -1;
  display: grid;
  gap: 8px;
  margin: 4px 0 6px 24px;
  padding: 8px;
  border: 1px solid var(--acu-border-1);
  border-radius: var(--acu-radius-sm);
  background: var(--acu-bg-1);
}

.acu-v2-wb-entry-skill__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

@media (max-width: 640px) {
  .acu-v2-wb-entry-item {
    grid-template-columns: 1fr;
  }
  .acu-v2-wb-entry-item__actions {
    justify-content: flex-start;
    padding-left: 24px;
  }
  .acu-v2-wb-entry-skill {
    margin-left: 0;
  }
}
</style>
