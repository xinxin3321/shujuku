/**
 * shared/host-api.ts — 宿主平台 API 引用
 * SillyTavern、TavernHelper、jQuery、toastr 的运行时引用。
 * 属于 shared 层，任何层均可 import。
 */

export let SillyTavern_API_ACU: any;
export let TavernHelper_API_ACU: any;
export let jQuery_API_ACU: any;
export let toastr_API_ACU: any;

export function _set_SillyTavern_API_ACU(v: any) { SillyTavern_API_ACU = v; }
export function _set_TavernHelper_API_ACU(v: any) { TavernHelper_API_ACU = v; }
export function _set_jQuery_API_ACU(v: any) { jQuery_API_ACU = v; }
export function _set_toastr_API_ACU(v: any) { toastr_API_ACU = v; }
