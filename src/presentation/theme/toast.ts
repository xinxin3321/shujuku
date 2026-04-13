// toast.ts — presentation 层的 toast re-export 门面
// 核心逻辑已迁移到 service/runtime/toast-service.ts

export {
  showToastr_ACU,
  ACU_TOAST_TITLE_ACU,
  _acuToastDedup_ACU,
  _acuToastStyleInjected_ACU,
  _set__acuToastStyleInjected_ACU,
} from '../../service/runtime/toast-service';

// ACU_TOAST_CATEGORY_ACU 已迁移到 shared/constants
export { ACU_TOAST_CATEGORY_ACU } from '../../shared/constants';
