/**
 * presentation/bootstrap/api-groups/callback-api.ts
 * 回调管理 API — 表格更新和填表开始的回调注册/注销/通知
 */

import { currentJsonTableData_ACU } from '../../../service/runtime/state-manager';
import { logDebug_ACU, logError_ACU } from '../../../shared/utils';

export interface ApiGroupContext {
    /** 表格更新回调列表 */
    tableUpdateCallbacks: Function[];
    /** 填表开始回调列表 */
    tableFillStartCallbacks: Function[];
    /** 获取完整 API 对象的引用（解决 this 引用） */
    getApi: () => any;
}

export function createCallbackApi(ctx: ApiGroupContext): Record<string, Function> {
    return {
        // 注册表格更新回调
        registerTableUpdateCallback: function(callback: Function) {
            if (typeof callback === 'function' && !ctx.tableUpdateCallbacks.includes(callback)) {
                ctx.tableUpdateCallbacks.push(callback);
                logDebug_ACU('A new table update callback has been registered.');
            }
        },
        // 注销表格更新回调
        unregisterTableUpdateCallback: function(callback: Function) {
            const index = ctx.tableUpdateCallbacks.indexOf(callback);
            if (index > -1) {
                ctx.tableUpdateCallbacks.splice(index, 1);
                logDebug_ACU('A table update callback has been unregistered.');
            }
        },
        // 内部使用：通知更新
        _notifyTableUpdate: function() {
            logDebug_ACU(`Notifying ${ctx.tableUpdateCallbacks.length} callbacks about table update.`);
            // 修复：确保回调函数永远不会收到 null，而是收到一个空对象，增加稳健性。
            const dataToSend = currentJsonTableData_ACU || {};
            ctx.tableUpdateCallbacks.forEach(callback => {
                try {
                    // 将最新的数据作为参数传给回调
                    callback(dataToSend);
                } catch (e) {
                    logError_ACU('Error executing a table update callback:', e);
                }
            });
        },
        // 注册"填表开始"回调
        registerTableFillStartCallback: function(callback: Function) {
            if (typeof callback === 'function' && !ctx.tableFillStartCallbacks.includes(callback)) {
                ctx.tableFillStartCallbacks.push(callback);
                logDebug_ACU('A new table fill start callback has been registered.');
            }
        },
        // 内部使用：通知"填表开始"
        _notifyTableFillStart: function() {
            logDebug_ACU(`Notifying ${ctx.tableFillStartCallbacks.length} callbacks about table fill start.`);
            ctx.tableFillStartCallbacks.forEach(callback => {
                try {
                    callback();
                } catch (e) {
                    logError_ACU('Error executing a table fill start callback:', e);
                }
            });
        },
    };
}
