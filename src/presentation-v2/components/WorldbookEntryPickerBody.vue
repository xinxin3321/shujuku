<template>
  <div class="acu-v2-wb-entry-picker">
    <WorldbookSourcePicker
      :source="source"
      :selected-names="selectedNames"
      :names="names"
      :status="selectorStatus"
      :error="selectorError"
      :filterable="filterable"
      @update:source="$emit('update:source', $event)"
      @toggle-book="(name: string, checked: boolean) => $emit('toggle-book', name, checked)"
    />
    <p class="acu-v2-wb-entry-picker__hint">
      目前已选: <strong>{{ currentLabel }}</strong>
    </p>

    <WorldbookEntryToolbar
      :filter="filter"
      @update:filter="$emit('update:filter', $event)"
      @select-all="$emit('select-all')"
      @deselect-all="$emit('deselect-all')"
      @skillify-select-all="$emit('skillify-select-all')"
      @skillify-deselect-all="$emit('skillify-deselect-all')"
      @skillify-selected="$emit('skillify-selected')"
    />
    <WorldbookEntryList
      :groups="groups"
      :filter="filter"
      :loading="loading"
      :empty-text="emptyText"
      @toggle="(bookName: string, uid: number, checked: boolean) => $emit('toggle', bookName, uid, checked)"
      @toggle-skillify="(bookName: string, uid: number, checked: boolean) => $emit('toggle-skillify', bookName, uid, checked)"
      @toggle-group="$emit('toggle-group', $event)"
      @save-skill="(bookName: string, uid: number, draft: WorldbookSkillDraft) => $emit('save-skill', bookName, uid, draft)"
      @delete-skill="(bookName: string, uid: number) => $emit('delete-skill', bookName, uid)"
    />
  </div>
</template>

<script setup lang="ts">
import WorldbookSourcePicker from './WorldbookSourcePicker.vue';
import WorldbookEntryList from './WorldbookEntryList.vue';
import WorldbookEntryToolbar from './WorldbookEntryToolbar.vue';
import type { WorldbookLoadStatus } from '../composables/useWorldbookSelector';

type WorldbookSource = 'character' | 'manual';

interface WorldbookSkillMetaView {
  description: string;
  triggerWhen: string;
}

interface WorldbookSkillDraft {
  description: string;
  triggerWhen: string;
}

interface WorldbookEntryItem {
  uid: number;
  bookName: string;
  label: string;
  comment?: string;
  skillMeta?: WorldbookSkillMetaView | null;
  hasSkill: boolean;
  agentTakeoverState: 'native' | 'skill_ready' | 'taken_over' | 'final_greenlight' | 'initial_disabled';
  checked: boolean;
  skillifySelected: boolean;
  disabled: boolean;
}

interface WorldbookEntryGroup {
  bookName: string;
  entries: WorldbookEntryItem[];
  expanded: boolean;
}

withDefaults(defineProps<{
  source: WorldbookSource;
  selectedNames: string[];
  names: string[];
  selectorStatus: WorldbookLoadStatus;
  selectorError: string;
  currentLabel: string;
  filter: string;
  groups: WorldbookEntryGroup[];
  loading: boolean;
  emptyText?: string;
  filterable?: boolean;
}>(), {
  filterable: true,
  emptyText: '所选世界书中无可显示的条目。',
});

defineEmits<{
  (e: 'update:source', value: WorldbookSource): void;
  (e: 'toggle-book', name: string, checked: boolean): void;
  (e: 'update:filter', value: string): void;
  (e: 'select-all'): void;
  (e: 'deselect-all'): void;
  (e: 'skillify-select-all'): void;
  (e: 'skillify-deselect-all'): void;
  (e: 'skillify-selected'): void;
  (e: 'toggle', bookName: string, uid: number, checked: boolean): void;
  (e: 'toggle-skillify', bookName: string, uid: number, checked: boolean): void;
  (e: 'toggle-group', bookName: string): void;
  (e: 'save-skill', bookName: string, uid: number, draft: WorldbookSkillDraft): void;
  (e: 'delete-skill', bookName: string, uid: number): void;
}>();
</script>

<style scoped>
.acu-v2-wb-entry-picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.acu-v2-wb-entry-picker__hint {
  margin: 0;
  font-size: var(--acu-font-size-caption, 11px);
  color: var(--acu-text-3);
}

.acu-v2-wb-entry-picker__hint strong {
  color: var(--acu-text-1);
  font-weight: 500;
}
</style>
