/**
 * data/repositories/settings-repo.ts — 设置读写 Repository
 *
 * 提供 data 层的设置持久化接口。
 * 纯 CRUD：persistSettingsToStorage_ACU (写) 在 data/storage/config-storage.ts
 * 业务编排：saveSettings_ACU / loadSettings_ACU 在 service/settings/settings-service.ts
 */

// data 层不再 re-export service 层函数
// 如需业务级 save/load，调用方应直接使用 service 层的 saveSettings_ACU / loadSettings_ACU



