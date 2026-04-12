  // [已迁移] handleManualUpdate_ACU → service/table/update-process.ts
  // [已迁移] getCurrentIsolationKey_ACU → service/runtime/state-manager.ts
  // [已迁移] mainInitialize_ACU → service/runtime/init.ts
  // [已迁移] table-repo 相关 → data/repositories/table-repo.ts
  // [已迁移] injection-engine 相关 → service/worldbook/injection-engine.ts

  $(function() {
      console.log('ACU_INIT_DEBUG: Document is ready, attempting to initialize ACU script.');
      mainInitialize_ACU();
  });
