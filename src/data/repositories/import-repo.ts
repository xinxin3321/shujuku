import { importTempGet_ACU, importTempRemove_ACU, importTempSet_ACU, isIndexedDbAvailable_ACU } from '../storage/idb-import-temp';
/**
 * data/repositories/import-repo.ts — 导入暂存数据 Repository
 *
 * 对应初版设计 plans/three_layer_refactor_plan.md §3.1 的 import-repo.js。
 * 当前阶段：re-export 门面，底层存储在 data/storage/idb-import-temp.ts 中。
 */

export {
  importTempGet_ACU,
  importTempSet_ACU,
  importTempRemove_ACU,
  isIndexedDbAvailable_ACU,
} from '../storage/idb-import-temp';
