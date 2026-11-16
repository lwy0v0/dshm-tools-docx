/**
 * 媒体落盘:把包里的图片写到 `media/` 下,并做去重与命名。
 *
 * 去重按**部件路径**(同一张图在文档里出现十次,只写一个文件、十处引用同一路径)。
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { posix } from 'node:path'

export class 媒体导出器 {
  /**
   * @param {object} 参数
   * @param {import('../../ooxml/package.js').OoxmlPackage} 参数.包
   * @param {string} 参数.目录 媒体的绝对目录(不存在会自动建)
   * @param {string} [参数.前缀] 相对产物根的路径前缀,默认 'media'
   */
  constructor ({ 包, 目录, 前缀 = 'media' }) {
    this.包 = 包
    this.目录 = 目录
    this.前缀 = 前缀
    /** @type {Map<string, {相对路径:string, 字节长度:number, 类型:string, 原名:string}>} */
    this.已导出 = new Map()
    this.序号 = 0
    mkdirSync(目录, { recursive: true })
  }

  /**
   * 取(必要时导出)一张图。
   * @param {string} 部件路径 包内路径,如 `word/media/image1.png`
   */
  取 (部件路径) {
    const 键 = String(部件路径).replace(/\\/g, '/').replace(/^\//, '')
    if (this.已导出.has(键)) return this.已导出.get(键)

    const 字节 = this.包.字节(键)
    if (!字节) {
      this.已导出.set(键, null)
      return null
    }

    const 扩展 = (posix.extname(键) || '.bin').toLowerCase()
    const 类型 = 扩展 === '.png' ? 'image/png'
      : 扩展 === '.jpg' || 扩展 === '.jpeg' ? 'image/jpeg'
        : 扩展 === '.gif' ? 'image/gif'
          : 扩展 === '.bmp' ? 'image/bmp'
            : 扩展 === '.tif' || 扩展 === '.tiff' ? 'image/tiff'
              : 扩展 === '.svg' ? 'image/svg+xml'
                : 扩展 === '.emf' ? 'image/x-emf'
                  : 扩展 === '.wmf' ? 'image/x-wmf' : 'application/octet-stream'

    const 序号 = String(++this.序号).padStart(3, '0')
    const 文件名 = `${序号}${扩展}`
    writeFileSync(join(this.目录, 文件名), 字节)

    const 信息 = {
      相对路径: `${this.前缀}/${文件名}`,
      字节长度: 字节.length,
      类型,
      原名: posix.basename(键)
    }
    this.已导出.set(键, 信息)
    return 信息
  }

  /** 已导出的清单 */
  清单 () {
    return [...this.已导出.values()].filter(Boolean)
  }
}
