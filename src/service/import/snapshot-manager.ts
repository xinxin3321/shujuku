import { deleteImportedJsonDataFromLorebook_ACU, loadImportedJsonDataFromLorebook_ACU, saveImportedJsonDataToLorebook_ACU } from './import-process';
/**
 * service/import/snapshot-manager.ts — 快照管理
 * re-export 门面，快照逻辑嵌入在 import-process.ts 中。
 */
export { loadImportedJsonDataFromLorebook_ACU, saveImportedJsonDataToLorebook_ACU, deleteImportedJsonDataFromLorebook_ACU } from './import-process';
