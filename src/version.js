/**
 * 版本与产品名(集中一处,index/manifest 都从这里取)。
 *
 * 改了输出行为就 bump 版本 —— 缓存键里含版本号,否则旧产物会被当成"还能用"。
 */

export const 产品目录 = 'dshm-tools-doc'
export const 版本 = '0.6.0'

export default { 产品目录, 版本 }
