import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { version: { type: 'boolean' }, help: { type: 'boolean' } } })
if (values.version) console.log('TIanZhiAi 0.0.1')
else if (values.help) console.log('TIanZhiAi 开发入口：--version、--help；Profile 启动器待 TZ-004 迁入。')
else throw new Error('Profile 启动器尚未迁入；当前仅支持 --version 和 --help。')
