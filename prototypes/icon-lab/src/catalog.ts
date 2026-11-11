import inventory from './inventory.json'
import { inlineMapping } from './source-map'

export type StyleId = 'line' | 'round' | 'angular' | 'open' | 'prism'
export type MotionKind =
  | 'draw'
  | 'turn'
  | 'lift'
  | 'slide'
  | 'pulse'
  | 'swing'
  | 'send'
  | 'blink'
  | 'wave'
export type Part = {
  d: string
  role: 'body' | 'detail' | 'accent'
  motion?: MotionKind
  solid?: boolean
  origin?: string
}
export type IconSpec = {
  id: string
  name: string
  category: string
  parts: Part[]
  motion: string
  future: boolean
  badge?: string
  sources: { path: string; line?: number }[]
  symbols: string[]
  registryOnly?: boolean
}
export const styles: {
  id: StyleId
  name: string
  english: string
  description: string
  action: string
}[] = [
  {
    id: 'line',
    name: '轻线',
    english: 'Contour',
    description: '均衡轮廓 · 轻移落笔',
    action: '短位移，单笔确认',
  },
  {
    id: 'round',
    name: '圆弧',
    english: 'Elastic',
    description: '气泡胶囊 · 弹性伸展',
    action: '压缩蓄力，弹起回正',
  },
  {
    id: 'angular',
    name: '切角',
    english: 'Construct',
    description: '直线切面 · 分段组装',
    action: '部件错开，逐段归位',
  },
  {
    id: 'open',
    name: '开线',
    english: 'Trace',
    description: '开口笔段 · 游走描线',
    action: '线段沿轮廓依次生长',
  },
  {
    id: 'prism',
    name: '等距',
    english: 'Spatial',
    description: '空间线框 · 前后展开',
    action: '前后层展开，再收拢',
  },
]
export const categories = [
  '全部图标',
  '聊天与导航',
  '操作与编辑',
  '文件与代码',
  '运行与状态',
  '外观与布局',
  '权限与安全',
  '智能体与工具',
  '协作与自动化',
]
const p = (d: string, motion: MotionKind = 'draw'): Part => ({ d, role: 'detail', motion })
const a = (d: string, motion: MotionKind = 'pulse', solid = false): Part => ({
  d,
  role: 'accent',
  motion,
  solid,
})
const b = (d: string, motion?: MotionKind): Part => ({ d, role: 'body', motion })
const circle = (x: number, y: number, r: number) =>
  `M${x - r} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`
const rect = (x: number, y: number, w: number, h: number, r = 2) =>
  `M${x + r} ${y}h${w - r * 2}q${r} 0 ${r} ${r}v${h - r * 2}q0 ${r} ${-r} ${r}h${-w + r * 2}q${-r} 0 ${-r} ${-r}v${-h + r * 2}q0 ${-r} ${r} ${-r}Z`
const sheet = 'M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z'
const fold = 'M14 3v5h5'
const shield = 'M12 3 20 6v5c0 5-4 8-8 10-4-2-8-5-8-10V6Z'
const windowShape = rect(3, 4, 18, 16, 3)
const folder = 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z'
const check = 'm7 12 3.3 3.3L17 8.5'
const robot = [
  b(rect(4, 7, 16, 13, 4)),
  p('M12 7V3'),
  a(circle(12, 3, 1), 'pulse', true),
  a('M8 12v2M16 12v2', 'blink'),
  p('M9 17h6'),
]
const file = (symbol: Part[]) => [b(sheet), p(fold), ...symbol]
const recipes: Record<string, { name: string; category: string; parts: Part[]; motion: string }> =
  {}
function add(ids: string, name: string, category: string, parts: Part[], motion: string) {
  for (const id of ids.split('|')) recipes[id] = { name, category, parts, motion }
}
const nav = '聊天与导航',
  edit = '操作与编辑',
  files = '文件与代码',
  status = '运行与状态',
  layout = '外观与布局',
  security = '权限与安全',
  agent = '智能体与工具',
  auto = '协作与自动化'
add(
  'new-chat-outline',
  '新建聊天',
  nav,
  [
    b('M18 14v3a3 3 0 0 1-3 3H9l-5 2V7a3 3 0 0 1 3-3h6'),
    a('m12 12 2.5-.5L22 4l-3-3-7.5 7.5Z', 'slide'),
  ],
  '笔尖写入',
)
add(
  'search-outline',
  '搜索',
  nav,
  [b(circle(10.5, 10.5, 6.5)), a('m15.5 15.5 5 5', 'slide'), p('M7 10a3.5 3.5 0 0 1 3-3')],
  '镜头轻探',
)
add(
  'globe-outline',
  '网络',
  agent,
  [
    b(circle(12, 12, 9)),
    p('M3 12h18M12 3c-5 4-5 14 0 18M12 3c5 4 5 14 0 18'),
    a('M5 7.5h14M5 16.5h14', 'wave'),
  ],
  '经纬流转',
)
add(
  'settings-outline',
  '设置',
  layout,
  [
    b(
      'm10 3-1 3-3 1-3-1-1 3 2 2v3l-2 2 2 3 3-1 2 2 1 3h4l1-3 2-2 3 1 2-3-2-2v-3l2-2-1-3-3 1-3-1-1-3Z',
      'turn',
    ),
    a(circle(12, 12, 3), 'turn'),
  ],
  '齿轮转动',
)
add('panel-left-outline', '侧栏', layout, [b(windowShape), a('M9 4v16', 'slide')], '侧栏滑出')
add(
  'ellipsis-outline',
  '更多',
  edit,
  [
    a(circle(5, 12, 1), 'pulse', true),
    a(circle(12, 12, 1), 'pulse', true),
    a(circle(19, 12, 1), 'pulse', true),
  ],
  '三点依次呼吸',
)
add('plus-outline', '添加', edit, [p('M5 12h14'), a('M12 5v14', 'turn')], '横竖交汇')
add('check-outline', '确认', status, [a(check, 'draw')], '勾线落笔')
add(
  'branch-outline',
  '分支',
  agent,
  [p('M6 6v12M18 6v2c0 5-12 2-12 8'), a(circle(6, 4, 2)), a(circle(6, 20, 2)), a(circle(18, 4, 2))],
  '分支信号',
)
add('chevron-down-outline', '向下展开', nav, [a('m6 9 6 6 6-6', 'lift')], '向下轻落')
add('chevron-up-outline', '向上收起', nav, [a('m6 15 6-6 6 6', 'lift')], '向上归位')
add('chevron-left-outline', '返回', nav, [a('m15 5-7 7 7 7', 'slide')], '向左轻移')
add('chevron-right-outline', '进入', nav, [a('m9 5 7 7-7 7', 'slide')], '向右轻移')
add('triangle-right-fill', '展开节点', nav, [a('m9 6 8 6-8 6Z', 'slide', true)], '节点展开')
add('close-outline', '关闭', edit, [p('m6 6 12 12'), a('M18 6 6 18', 'turn')], '交叉回正')
add(
  'close-fill',
  '关闭强调',
  edit,
  [a('m6 4 6 6 6-6 2 2-6 6 6 6-2 2-6-6-6 6-2-2 6-6-6-6Z', 'turn', true)],
  '交叉回正',
)
add(
  'close-circle-fill',
  '关闭圆形',
  edit,
  [b(circle(12, 12, 9)), a('m9 9 6 6m0-6-6 6', 'turn')],
  '圆内收合',
)
add(
  'copy-outline',
  '复制',
  edit,
  [b(rect(4, 3, 12, 15, 2)), b(rect(8, 7, 12, 15, 2), 'slide')],
  '副本错位展开',
)
add(
  'refresh-outline',
  '重新生成',
  edit,
  [p('M20 9a8 8 0 1 0 .2 5', 'turn'), a('M20 3v6h-6', 'turn')],
  '单次回旋',
)
const thumb = 'M9 10V7l3-5c2 0 3 1 2 4l-1 4h6c2 0 2 2 1 4l-2 6H9ZM4 10h5v11H4Z'
add('like-outline', '赞', edit, [b(thumb, 'lift')], '拇指轻抬')
add('like-fill', '已赞', edit, [{ ...a(thumb, 'lift', true), role: 'body' }], '选中回弹')
const downThumb = 'M9 14v3l3 5c2 0 3-1 2-4l-1-4h6c2 0 2-2 1-4l-2-6H9ZM4 3h5v11H4Z'
add('dislike-outline', '踩', edit, [b(downThumb, 'lift')], '反馈轻落')
add('dislike-fill', '已踩', edit, [{ ...a(downThumb, 'lift', true), role: 'body' }], '选中回弹')
add(
  'share-outline',
  '分享',
  edit,
  [b('M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7'), a('M12 15V3m-4 4 4-4 4 4', 'lift')],
  '分享箭头升起',
)
add(
  'deliver-doc',
  '交付文档',
  files,
  file([p('M8 11h4M8 15h3'), a('m14 16 4 4 4-4m-4-4v8', 'lift')]),
  '文档向外交付',
)
add(
  'edit-outline',
  '编辑',
  edit,
  [b('M4 16 16 4l4 4L8 20l-5 1Z', 'slide'), p('m13 7 4 4')],
  '笔尖划过',
)
add(
  'think-outline',
  '思考',
  agent,
  [
    b('M12 5C8 0 4 4 5 8c-5 1-3 7 0 7-1 5 4 7 7 3 3 4 8 2 7-3 4-1 5-6 0-7 1-4-3-8-7-3Z'),
    p('M12 5v13M8 8c2 1 2 3 0 4M16 9c-2 1-2 3 0 4'),
    a(circle(7, 17, 1), 'pulse', true),
  ],
  '思路脉冲',
)
add('agent-preset-outline', '智能体', agent, robot, '眼睛轻眨')
add(
  'browse-outline',
  '浏览器',
  agent,
  [
    b(windowShape),
    p('M3 9h18'),
    a('M6 6.5h.01M9 6.5h.01', 'blink'),
    a('m10 12 5 3-2 1-1 3Z', 'slide'),
  ],
  '光标进入',
)
add(
  'context-injection-outline',
  '引用上下文',
  agent,
  [b(rect(3, 3, 13, 18, 2)), p('M6 7h6M6 11h4'), a('M12 16h10m-3-3 3 3-3 3', 'slide')],
  '上下文汇入',
)
add(
  'link-outline',
  '链接',
  edit,
  [
    p('m10 15 5-6'),
    b('m9 16-2 2a4 4 0 0 1-5-5l4-4a4 4 0 0 1 6 0', 'slide'),
    a('m15 8 2-2a4 4 0 0 1 5 5l-4 4a4 4 0 0 1-6 0', 'slide'),
  ],
  '两环连接',
)
add(
  'right-up-outline',
  '在外部打开',
  nav,
  [
    b('M12 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7'),
    a('M10 14 21 3m-7 0h7v7', 'send'),
  ],
  '向右上打开',
)
add(
  'enhance-outline',
  '增强',
  agent,
  [b('m4 18 11-11 3 3L7 21Z', 'swing'), a('M18 2v4m-2-2h4M5 5v4M3 7h4', 'pulse')],
  '魔杖点亮',
)
add(
  'trash-outline',
  '删除',
  edit,
  [
    b('M5 7h14l-1 13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1Z'),
    a('M3 6h18M9 6V3h6v3', 'lift'),
    p('M9 10v7M15 10v7'),
  ],
  '盖子轻抬',
)
add(
  'warning-outline',
  '错误提示',
  status,
  [b(circle(12, 12, 9)), a('M12 6v7m0 4h.01', 'swing')],
  '轻摆提示',
)
add(
  'check-circle-fill',
  '完成强调',
  status,
  [{ ...b(circle(12, 12, 9)), solid: true }, a(check, 'draw')],
  '完成确认',
)
add(
  'warning-triangle-outline',
  '警告',
  status,
  [
    b('M10.3 3.8a2 2 0 0 1 3.4 0l8 14a2 2 0 0 1-1.7 3H4a2 2 0 0 1-1.7-3Z'),
    a('M12 8v5m0 4h.01', 'pulse'),
  ],
  '警告轻闪',
)
add(
  'user-outline',
  '用户',
  nav,
  [b(circle(12, 7, 4), 'lift'), b('M4 21v-2a8 7 0 0 1 16 0v2Z')],
  '头像轻颔',
)
add(
  'users-outline',
  '成员',
  auto,
  [
    b(circle(9, 7, 3)),
    b('M2 21v-3a7 6 0 0 1 14 0v3Z'),
    a('M17 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 4 5v2', 'slide'),
  ],
  '成员依次入场',
)
add(
  'paper-plane-outline',
  '纸飞机',
  nav,
  [b('M3 10 21 3l-7 18-4-7Z', 'send'), p('m10 14 11-11')],
  '短途起飞',
)
add(
  'stop-fill',
  '停止',
  status,
  [{ ...b(rect(5, 5, 14, 14, 3), 'pulse'), solid: true }],
  '收束停住',
)
add(
  'paperclip-outline',
  '附件',
  files,
  [p('m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2', 'draw'), a('m6 15 9-9', 'slide')],
  '回形针绕入',
)
add(
  'loading-outline',
  '加载',
  status,
  [p('M12 3a9 9 0 0 1 9 9', 'turn'), a('M12 21a9 9 0 0 1-9-9', 'turn')],
  '双弧旋转',
)
add(
  'download-outline',
  '下载',
  edit,
  [b('M3 16v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3'), a('M12 3v12m-5-5 5 5 5-5', 'lift')],
  '箭头落入托盘',
)
add('play-outline', '运行', status, [b('M7 4.5 21 12 7 19.5Z', 'slide')], '向前启动')
add(
  'pause-outline',
  '暂停',
  status,
  [b(rect(5, 4, 4, 16, 1), 'pulse'), b(rect(15, 4, 4, 16, 1), 'pulse')],
  '双柱收定',
)
add(
  'fullscreen-outline',
  '全屏',
  layout,
  [p('M3 9V3h6M15 3h6v6'), a('M21 15v6h-6M9 21H3v-6', 'pulse')],
  '四角展开',
)
add(
  'code-outline',
  '代码',
  files,
  [p('m8 5-6 7 6 7'), a('m16 5 6 7-6 7', 'slide'), p('m14 3-4 18')],
  '括号分合',
)
add(
  'cordis-plugin-outline',
  '插件',
  agent,
  [
    b(
      'M4 4h6V2a2 2 0 0 1 4 0v2h6v6h2a2 2 0 0 1 0 4h-2v6h-6v-2a2 2 0 0 0-4 0v2H4v-6h2a2 2 0 0 0 0-4H4Z',
      'pulse',
    ),
  ],
  '模块扣合',
)
add(
  'api-outline',
  'API 连接',
  agent,
  [b(rect(3, 4, 18, 16, 3)), p('m9 9-3 3 3 3'), a('m15 9 3 3-3 3', 'slide')],
  '接口握手',
)
add(
  'personalization-outline',
  '个性化',
  layout,
  [b('M5 4h10l5 5v6H10l-5 5Z'), a('M9 8h5M9 12h7', 'wave')],
  '偏好展开',
)
add(
  'project-add-outline',
  '新建项目',
  files,
  [b(folder), a('M12 10v8m-4-4h8', 'turn')],
  '新项目加入',
)
add(
  'folder-open-outline',
  '打开文件夹',
  files,
  [b('M3 19V6a2 2 0 0 1 2-2h5l2 3h7v3'), b('M5 10h17l-3 11H3Z', 'lift')],
  '文件夹掀开',
)
add(
  'folder-open',
  '文件夹展开',
  files,
  [b('M3 19V6a2 2 0 0 1 2-2h5l2 3h7v3'), { ...b('M5 10h17l-3 11H3Z', 'lift'), solid: true }],
  '文件夹掀开',
)
add('folder-close', '文件夹收起', files, [{ ...b(folder, 'lift'), solid: true }], '文件夹归位')
add('tree-corner', '目录连接', files, [a('M6 3v14h14', 'draw')], '目录连线生长')
add(
  'light-outline',
  '浅色模式',
  layout,
  [
    b(circle(12, 12, 4), 'turn'),
    a(
      'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5',
      'turn',
    ),
  ],
  '日光旋开',
)
add(
  'dark-outline',
  '深色模式',
  layout,
  [b('M20 15A9 9 0 0 1 9 3c-8 2-8 13-1 17 5 3 10 0 12-5Z', 'swing'), a('M17 4v4M15 6h4', 'pulse')],
  '月光轻摆',
)
add(
  'followsystem-outline',
  '跟随系统',
  layout,
  [b(rect(3, 3, 18, 13, 2)), p('M9 21h6M12 16v5'), a('M12 6v7', 'slide')],
  '显示器明暗切换',
)
add(
  'data-outline',
  '数据',
  agent,
  [
    b(rect(3, 13, 4, 8, 1), 'lift'),
    b(rect(10, 8, 4, 13, 1), 'lift'),
    b(rect(17, 3, 4, 18, 1), 'lift'),
  ],
  '数据柱依次上升',
)
add(
  'database-outline',
  '数据库',
  agent,
  [
    b('M3 6c0-5 18-5 18 0v12c0 5-18 5-18 0Z'),
    p('M3 6c0 5 18 5 18 0'),
    a('M3 12c0 5 18 5 18 0', 'lift'),
  ],
  '数据层呼吸',
)
add('clock-outline', '时间', status, [b(circle(12, 12, 9)), a('M12 6v6l4 2', 'turn')], '指针走时')
add(
  'gauge-outline',
  '用量',
  status,
  [
    b('M3 20a10 10 0 1 1 18 0Z'),
    p('M5 14h2M6.5 7.5 8 9M12 5v2M17.5 7.5 16 9'),
    a('m12 16 5-5', 'swing'),
  ],
  '指针读数',
)
add('send-outline', '发送', nav, [a('M12 21V3m-7 7 7-7 7 7', 'lift')], '消息上行')
add(
  'queue-outline',
  '消息队列',
  status,
  [b(rect(3, 3, 18, 6, 2)), p('M5 13h14M5 18h9'), a('m18 16 3 3-3 3', 'slide')],
  '队列向前',
)
add(
  'checklist-outline',
  '清单',
  agent,
  [p('M11 6h10M11 12h10M11 18h10'), a('m3 5 2 2 3-3m-5 7 2 2 3-3m-5 7 2 2 3-3', 'draw')],
  '逐项勾选',
)
add(
  'list-pen-outline',
  '编辑清单',
  agent,
  [p('M3 5h16M3 10h12M3 15h8M3 20h6'), a('m13 17 7-7 3 3-7 7-4 1Z', 'slide')],
  '清单落笔',
)
add(
  'goal-outline',
  '目标',
  agent,
  [b(circle(11, 13, 8)), p(circle(11, 13, 4)), a('m11 13 8-8m-1-3v4h4', 'send')],
  '目标命中',
)
add(
  'sparkle',
  '灵感',
  agent,
  [b('M12 2c1 7 3 9 10 10-7 1-9 3-10 10-1-7-3-9-10-10 7-1 9-3 10-10Z', 'pulse')],
  '灵感亮起',
)
add(
  'inspect-outline',
  '检查',
  agent,
  [b(windowShape), p('M3 9h18'), a('m8 12 7 3-3 2-1 4Z', 'slide')],
  '检查指针',
)
add(
  'skill-outline',
  '技能',
  agent,
  [b('m12 2 9 5v10l-9 5-9-5V7Z'), a('m13 6-5 7h4l-1 5 6-8h-4Z', 'pulse')],
  '能力充能',
)
add(
  'question-outline',
  '帮助',
  status,
  [b(circle(12, 12, 9)), a('M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5m0 4h.01', 'draw')],
  '问号显现',
)
add(
  'info-outline',
  '信息',
  status,
  [b(circle(12, 12, 9)), a('M12 11v6M12 7h.01', 'pulse')],
  '信息提示',
)
add(
  'plugin-pinwheel-outline',
  '扩展中心',
  agent,
  [
    b('M12 12V3c6-2 10 5 0 9Z', 'turn'),
    b('M12 12h9c2 6-5 10-9 0Z', 'turn'),
    b('M12 12v9c-6 2-10-5 0-9Z', 'turn'),
    b('M12 12H3c-2-6 5-10 9 0Z', 'turn'),
  ],
  '模块旋合',
)
add(
  'alarm-clock-outline',
  '提醒',
  auto,
  [b(circle(12, 13, 8)), a('M12 9v4l3 2', 'swing'), p('m3 5 3-3m12 0 3 3M7 20l-2 2m12-2 2 2')],
  '闹钟轻振',
)
add(
  'archive-outline',
  '归档',
  edit,
  [b(rect(4, 7, 16, 14, 2)), a(rect(2, 3, 20, 5, 1), 'lift'), p('M9 12h6')],
  '顶盖合拢',
)
add(
  'wrap-lines-outline',
  '自动换行',
  files,
  [p('M3 5h18M3 11h14a4 4 0 0 1 0 8h-5M3 17h4'), a('m14 16-3 3 3 3', 'slide')],
  '末行折返',
)
add(
  'nowrap-fill',
  '不换行',
  files,
  [p('M3 3v18M21 3v18M6 12h12'), a('m15 9 3 3-3 3', 'slide')],
  '直行展开',
)
add(
  'wrap-fill',
  '换行开启',
  files,
  [p('M3 3v18M21 3v18M6 7h8a4 4 0 0 1 0 8H8'), a('m10 12-3 3 3 3', 'slide')],
  '行尾回折',
)
add(
  'compare-split-outline',
  '并排对比',
  layout,
  [b(rect(2, 3, 8, 18, 2)), b(rect(14, 3, 8, 18, 2), 'slide'), p('M5 8h2M5 12h2M17 8h2M17 16h2')],
  '双栏分开',
)
add(
  'plan-outline',
  '计划',
  auto,
  [b(rect(4, 4, 16, 17, 2)), p('M8 2v4M16 2v4M4 9h16'), a('M8 13h3M8 17h7', 'draw')],
  '计划逐行呈现',
)
add(
  'compact-outline',
  '压缩上下文',
  status,
  [p('M12 3a9 9 0 1 1-9 9', 'turn'), a('m4 4 5 5m-4 0h4V5', 'slide')],
  '上下文收拢',
)
add('shield-outline', '权限', security, [b(shield, 'pulse')], '护盾展开')
add('check-circle-outline', '完成', status, [b(circle(12, 12, 9)), a(check, 'draw')], '完成落笔')
add(
  'unarchive-outline',
  '取消归档',
  edit,
  [b(rect(4, 7, 16, 14, 2)), p(rect(2, 3, 20, 5, 1)), a('M12 18v-7m-3 3 3-3 3 3', 'lift')],
  '内容提取',
)
const pin = 'm8 3 9 3-2 5 3 5-1 2-12-5 1-2 4-2Z'
add('pin-outline', '置顶', edit, [b(pin, 'swing'), p('m9 15-4 7')], '图钉落定')
add('pin-fill', '已置顶', edit, [{ ...b(pin, 'swing'), solid: true }, p('m9 15-4 7')], '固定回弹')
add(
  'flat-list-outline',
  '列表',
  layout,
  [p('M9 5h12M9 12h12M9 19h12'), a('M3 5h.01M3 12h.01M3 19h.01', 'wave')],
  '列表依次展开',
)
add(
  'workspace-tree-outline',
  '工作目录',
  files,
  [b(folder), p('M8 11v6h8'), a('M12 11v3h5', 'draw')],
  '目录分枝',
)
add(
  'chevrons-up-down-outline',
  '切换选项',
  nav,
  [p('m8 8 4-4 4 4'), a('m8 16 4 4 4-4', 'lift')],
  '双向开合',
)
add(
  'drag-handle-outline',
  '拖动',
  layout,
  [p('M5 7h14M5 12h14'), a('M5 17h14', 'slide')],
  '拖柄轻移',
)
add(
  'archive-off-outline',
  '归档关闭',
  edit,
  [b(rect(4, 7, 16, 14, 2)), p(rect(2, 3, 20, 5, 1)), a('M3 2 22 21', 'draw')],
  '归档划除',
)
add(
  'archive-check-outline',
  '归档完成',
  edit,
  [b(rect(4, 7, 16, 14, 2)), p(rect(2, 3, 20, 5, 1)), a('m8 14 3 3 5-5', 'draw')],
  '归档确认',
)
add(
  'sliders-two-outline',
  '参数',
  layout,
  [p('M3 7h18M3 17h18'), b(circle(8, 7, 2.5), 'slide'), b(circle(16, 17, 2.5), 'slide')],
  '参数滑移',
)
add(
  'microphone-outline',
  '语音输入',
  nav,
  [b(rect(9, 2, 6, 13, 3), 'pulse'), p('M5 11v1a7 7 0 0 0 14 0v-1M12 19v3M8 22h8')],
  '麦克风响应',
)
add(
  'apps-add-outline',
  '添加功能',
  agent,
  [
    b(rect(3, 3, 7, 7, 2)),
    b(rect(3, 14, 7, 7, 2)),
    b(rect(14, 14, 7, 7, 2)),
    a('M17.5 2v9M13 6.5h9', 'turn'),
  ],
  '能力模块展开',
)
add(
  'apps-add-compact-outline',
  '添加功能紧凑',
  agent,
  [
    b(rect(4, 4, 6, 6, 1.5)),
    b(rect(4, 14, 6, 6, 1.5)),
    b(rect(14, 14, 6, 6, 1.5)),
    a('M17 3v8M13 7h8', 'turn'),
  ],
  '紧凑模块展开',
)

const codeBadge: Record<string, string> = {
  javascript: 'JS',
  typescript: 'TS',
  python: 'PY',
  rust: 'RS',
  react: 'JSX',
  objectivec: 'M',
  'objective-c': 'M',
  clojure: 'CLJ',
  csharp: 'C#',
  cpp: 'C++',
  docker: 'DK',
  graphql: 'GQL',
  haskell: 'HS',
  powershell: 'PS',
  protobuf: 'PB',
  solidity: 'SOL',
  makefile: 'MK',
  node: 'NPM',
  shell: 'SH',
  elixir: 'EX',
  erlang: 'ERL',
  kotlin: 'KT',
  angular: 'NG',
  flutter: 'FL',
  svelte: 'SV',
  swift: 'SW',
  wasm: 'WAS',
  cmake: 'CM',
  java: 'JV',
  javascriptreact: 'JSX',
}
const traditional: [string, string, string][] = [
  ['code', '代码文件', '</>'],
  ['excel', '表格', 'XLS'],
  ['folder', '文件夹', ''],
  ['html', '网页', 'HTM'],
  ['image', '图片', ''],
  ['markdown', 'Markdown', 'MD'],
  ['other', '通用文件', ''],
  ['pdf', 'PDF 文档', 'PDF'],
  ['ppt', '演示文稿', 'PPT'],
  ['video', '视频', ''],
  ['word', '文字文档', 'DOC'],
]
const catalog: IconSpec[] = inventory.registry.map((entry) => {
  const recipe = recipes[entry.id]
  if (!recipe) throw new Error(`Missing recipe: ${entry.id}`)
  return {
    ...recipe,
    id: entry.id,
    future: false,
    symbols: entry.symbols,
    sources: entry.sources.length ? entry.sources : [{ path: entry.registry }],
    registryOnly: entry.sources.length === 0,
  }
})
for (const kind of inventory.codeTypes)
  catalog.push({
    id: `file-${kind}`,
    name: `${kind === 'objective-c' ? 'Objective-C' : kind[0].toUpperCase() + kind.slice(1)} 文件`,
    category: files,
    parts: file([]),
    motion: '折角展开，类型浮现',
    badge: codeBadge[kind] ?? kind.toUpperCase().slice(0, 4),
    future: false,
    sources: [{ path: inventory.fileSource }],
    symbols: ['CodeFileIcon'],
  })
for (const [kind, name, badge] of traditional) {
  const glyph =
    kind === 'folder'
      ? [b(folder, 'lift')]
      : kind === 'image'
        ? file([a(circle(9, 11, 1.5)), p('m7 18 4-4 2 2 2-2 3 4')])
        : kind === 'video'
          ? file([a('m10 11 6 4-6 4Z', 'pulse', true)])
          : file([])
  catalog.push({
    id: `file-${kind}`,
    name,
    category: files,
    parts: glyph,
    motion: '文档展开',
    badge: badge || undefined,
    future: false,
    sources: [{ path: 'packages/client/ui-primitives/src/FileTypeIcon.tsx' }],
    symbols: ['FileTypeIcon'],
  })
}
function extra(
  id: string,
  name: string,
  category: string,
  parts: Part[],
  motion: string,
  source: string,
  badge?: string,
) {
  catalog.push({
    id,
    name,
    category,
    parts,
    motion,
    future: false,
    sources: [{ path: source }],
    symbols: [],
    badge,
  })
}
const primitives = 'packages/client/ui-primitives/src/'
extra(
  'permission-read',
  '仅可查看',
  security,
  [b(shield), a(check, 'draw')],
  '护盾确认',
  primitives + 'PermissionIcon.tsx',
)
extra(
  'permission-write',
  '工作区修改',
  security,
  [b(shield), a('m9 14 6-6 2 2-6 6-3 1Z', 'slide')],
  '授权写入',
  primitives + 'PermissionIcon.tsx',
)
extra(
  'permission-full',
  '完全权限',
  security,
  [b(shield), a('m13 6-5 7h4l-1 5 6-8h-4Z', 'pulse')],
  '权限点亮',
  primitives + 'PermissionIcon.tsx',
)
extra(
  'zoom-out',
  '缩小',
  layout,
  [a('M4 12h16', 'slide')],
  '缩小视图',
  primitives + 'ZoomControls.tsx',
)
extra(
  'quote',
  '引用内容',
  files,
  [
    b('M3 6h7v8H5c0 3 2 4 4 4v3c-5-1-6-4-6-7Z', 'lift'),
    b('M14 6h7v8h-5c0 3 2 4 4 4v3c-5-1-6-4-6-7Z', 'lift'),
  ],
  '双引号依次展开',
  primitives + 'QuotePreview.tsx',
)
extra(
  'link-code',
  '代码链接',
  files,
  [p('m8 5-6 7 6 7'), a('m16 5 6 7-6 7', 'slide')],
  '代码引用展开',
  primitives + 'LinkIcon.tsx',
)
extra(
  'file-link',
  '文件链接',
  files,
  file([a('M8 13h8m-3-3 3 3-3 3', 'slide')]),
  '文件引用进入',
  primitives + 'LinkIcon.tsx',
)
extra(
  'folder-link',
  '目录链接',
  files,
  [b(folder), a('M8 14h8m-3-3 3 3-3 3', 'slide')],
  '目录引用进入',
  primitives + 'LinkIcon.tsx',
)
extra(
  'context-meter',
  '上下文容量',
  status,
  [b(circle(12, 12, 9)), a('M12 3a9 9 0 0 1 9 9', 'turn'), p('M12 8v4l3 2')],
  '容量弧线推进',
  'packages/client/ui-conversation/src/client/skeleton/ContextMeter.tsx',
)
extra(
  'running-tail',
  '正在思考',
  status,
  [b('M12 17C2 19 1 5 3 5c5 0 7 4 9 8 2-4 4-8 9-8 2 0 1 14-9 12Z', 'wave')],
  '双翼交替起伏',
  'packages/client/ui-chat/src/client/chat/RunningWhaleTail.tsx',
)
extra(
  'sandbox-lock',
  '浏览器沙箱',
  security,
  [b(rect(4, 10, 16, 11, 2)), p('M8 10V7a4 4 0 0 1 8 0v3'), a('M12 14v3', 'pulse')],
  '锁芯确认',
  'packages/client/ui-sidebar-browser/src/client/view/BrowserBody.tsx',
)
extra(
  'sandbox-unlocked',
  '沙箱关闭',
  security,
  [b(rect(4, 10, 16, 11, 2)), a('M8 10V7a4 4 0 0 1 8-1', 'swing'), p('M12 14v3')],
  '开锁提醒',
  'packages/client/ui-sidebar-browser/src/client/view/BrowserBody.tsx',
)
extra(
  'exit-fullscreen',
  '退出全屏',
  layout,
  [a('M9 3v6H3M15 21v-6h6', 'pulse'), p('M3 21l6-6M21 3l-6 6')],
  '四角收回',
  'packages/client/ui-sidebar-right/src/client/shell/SidebarRight.tsx',
)
extra(
  'cube',
  '工作台',
  agent,
  [b('m12 2 9 5v10l-9 5-9-5V7Z'), p('m3 7 9 5 9-5M12 12v10')],
  '立方层展开',
  'packages/client/ui-sidebar-right/src/client/tabs/guide/GuideTitle.tsx',
)
for (const [i, zone] of ['left', 'right', 'top', 'bottom', 'center'].entries())
  extra(
    `dock-${zone}`,
    ['停靠左侧', '停靠右侧', '停靠顶部', '停靠底部', '停靠中央'][i],
    layout,
    [
      b(windowShape),
      a(
        [
          rect(5, 6, 6, 12, 1),
          rect(13, 6, 6, 12, 1),
          rect(5, 6, 14, 5, 1),
          rect(5, 13, 14, 5, 1),
          rect(8, 8, 8, 8, 1),
        ][i],
        'slide',
        true,
      ),
    ],
    '停靠区域吸附',
    'packages/client/ui-dockkit/src/components/TabPanel.tsx',
  )
for (const [i, state] of ['done', 'warning', 'ongoing', 'error', 'idle'].entries())
  extra(
    `state-${state}`,
    ['已完成状态', '等待关注', '运行中状态', '错误状态', '空闲状态'][i],
    status,
    [
      b(circle(12, 12, 8)),
      ...[
        [a(check, 'draw')],
        [a('M12 7v6m0 4h.01', 'pulse')],
        [a('M12 4a8 8 0 0 1 8 8', 'turn')],
        [a('m9 9 6 6m0-6-6 6', 'swing')],
        [a(circle(12, 12, 2), 'pulse', true)],
      ][i],
    ],
    '状态反馈',
    primitives + 'StateDot.tsx',
  )

extra(
  'upload-files',
  '上传文件',
  files,
  [b(rect(3, 7, 12, 14, 2)), b(rect(7, 3, 12, 14, 2)), a('M18 20v-9m-3 3 3-3 3 3', 'lift')],
  '文件依次加入',
  'packages/client/ui-attachment/src/DropOverlay.tsx',
)
extra(
  'upload-rejected',
  '文件不可上传',
  files,
  [b(sheet), p(fold), a('m8 12 7 7m0-7-7 7', 'swing')],
  '不可用提示',
  'packages/client/ui-attachment/src/DropOverlay.tsx',
)
extra(
  'json-collapse',
  '收起结构',
  files,
  [p('M4 13h7v7M20 11h-7V4'), a('m4 20 7-7M20 4l-7 7', 'slide')],
  '结构向内收起',
  primitives + 'JsonTree.tsx',
)
extra(
  'split-panel',
  '拆分面板',
  layout,
  [b(windowShape), a('M12 4v16', 'slide')],
  '面板一分为二',
  'packages/client/ui-dockkit/src/components/TabPanel.tsx',
)

function future(id: string, name: string, category: string, parts: Part[], motion: string) {
  catalog.push({
    id,
    name,
    category,
    parts,
    motion,
    future: true,
    sources: [{ path: 'docs/specs/项目开发规范.md' }],
    symbols: [],
  })
}
future(
  'agent-team',
  '智能体团队',
  auto,
  [
    b(circle(12, 5, 3)),
    b(circle(5, 17, 3)),
    b(circle(19, 17, 3)),
    a('M10 8 6 14M14 8l4 6M8 17h8', 'draw'),
  ],
  '成员连线逐一建立',
)
future(
  'delegate',
  '委派任务',
  auto,
  [b(rect(2, 3, 8, 7, 2)), b(rect(14, 14, 8, 7, 2)), a('M6 10v7h8m-3-3 3 3-3 3', 'slide')],
  '任务沿路径传递',
)
future(
  'handoff',
  '人工接管',
  security,
  [
    b(
      'M9 12V4a2 2 0 0 1 4 0v7-2a2 2 0 0 1 4 0v2a2 2 0 0 1 4 0v4c0 4-3 7-7 7h-2c-2 0-3-1-5-3l-4-6a2 2 0 0 1 3-2l3 3Z',
      'swing',
    ),
  ],
  '手掌抬起等待接管',
)
future(
  'return-agent',
  '归还控制',
  security,
  [b(windowShape), p('M3 9h18'), a('M8 15h9m-3-3 3 3-3 3', 'slide')],
  '控制权返回',
)
future(
  'memory',
  '长期记忆',
  agent,
  [b('m12 2 9 5-9 5-9-5Z'), p('m3 12 9 5 9-5'), a('m3 17 9 5 9-5', 'lift')],
  '记忆层次叠合',
)
future(
  'memory-search',
  '记忆检索',
  agent,
  [
    b(rect(3, 3, 12, 17, 2)),
    p('M6 7h6M6 11h3'),
    a(circle(16, 15, 4), 'slide'),
    a('m19 18 3 3', 'slide'),
  ],
  '在记忆中查找',
)
future(
  'workflow',
  '工作流',
  auto,
  [
    b(rect(8, 2, 8, 5, 1)),
    b(rect(2, 17, 8, 5, 1)),
    b(rect(14, 17, 8, 5, 1)),
    a('M12 7v5H6v5m6-5h6v5', 'draw'),
  ],
  '流程逐段连通',
)
future(
  'schedule',
  '定时计划',
  auto,
  [
    b(rect(3, 4, 18, 17, 3)),
    p('M7 2v4M17 2v4M3 9h18'),
    a(circle(12, 15, 3), 'turn'),
    a('M12 13v2l1 1', 'turn'),
  ],
  '计划按时触发',
)
future(
  'notification',
  '通知',
  auto,
  [b('M5 17v-6a7 7 0 0 1 14 0v6l2 2H3Z', 'swing'), a('M9 22h6', 'pulse')],
  '铃铛轻振',
)
future(
  'notification-off',
  '通知静音',
  auto,
  [b('M5 17v-6a7 7 0 0 1 14 0v6l2 2H3Z'), p('M9 22h6'), a('M3 2 22 21', 'draw')],
  '静音划线',
)
future(
  'skill-learn',
  '学习技能',
  agent,
  [
    b('M12 6C8 3 5 3 2 4v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-3-1-6-1-10 2Z'),
    p('M12 6v15'),
    a('M6 8v6m-3-3h6', 'pulse'),
  ],
  '新知识写入',
)
future(
  'skill-version',
  '技能版本',
  agent,
  [p('M6 5v14M6 12h12V5'), a(circle(6, 4, 2)), a(circle(6, 20, 2)), a(circle(18, 4, 2))],
  '版本分支',
)
future(
  'rollback',
  '回滚',
  edit,
  [b('M4 11a8 8 0 1 1 3 8', 'turn'), a('M4 4v7h7', 'turn'), p('M12 8v5h4')],
  '历史回拨',
)
future(
  'mcp',
  'MCP 服务',
  agent,
  [b(rect(7, 7, 10, 10, 3)), a('M12 1v6M12 17v6M1 12h6M17 12h6', 'draw'), p(circle(12, 12, 2))],
  '工具连接',
)
future(
  'cloud-sync',
  '云端同步',
  auto,
  [
    b('M6 18a5 5 0 1 1 0-10 7 7 0 0 1 13 2 4 4 0 0 1 0 8'),
    a('M9 21v-8m-3 3 3-3 3 3M16 13v8m-3-3 3 3 3-3', 'lift'),
  ],
  '双向同步',
)
future(
  'device',
  '设备管理',
  auto,
  [b(rect(2, 3, 14, 12, 2)), p('M7 15v5M4 20h6'), b(rect(14, 9, 8, 13, 2), 'lift'), a('M17 19h2')],
  '设备连接',
)
future(
  'audit',
  '执行审计',
  security,
  file([p('M8 10h6M8 14h3'), a('m12 18 3 3 6-7', 'draw')]),
  '证据逐项核验',
)
future(
  'evidence',
  '证据',
  security,
  [b(windowShape), p('M3 9h18'), a('m7 15 3 3 7-6', 'draw')],
  '当前证据确认',
)
future(
  'budget',
  '任务预算',
  auto,
  [b(circle(12, 12, 9)), p('M8 6l4 6 4-6M12 12v7'), a('M8 12h8M8 16h8', 'wave')],
  '额度清晰呈现',
)
future(
  'checkpoint',
  '执行检查点',
  auto,
  [p('M4 3v19'), b('M4 4h15l-3 5 3 5H4Z', 'wave'), a('m8 9 2 2 4-4', 'draw')],
  '检查点立旗',
)
future(
  'retry-task',
  '重试任务',
  status,
  [b(rect(4, 3, 16, 18, 3)), a('M8 13a4 4 0 1 0 2-4M8 7v6h5', 'turn')],
  '任务单次重试',
)
future(
  'connection',
  '连接状态',
  status,
  [
    p('M2 8a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8 16a5 5 0 0 1 8 0'),
    a(circle(12, 21, 1), 'pulse', true),
  ],
  '连接波纹',
)
future(
  'key',
  '访问密钥',
  security,
  [b(circle(8, 8, 5)), a('m12 12 9 9m-5-5 3-3m-6 0 3-3', 'slide'), p(circle(7, 7, 1))],
  '密钥转入',
)
future(
  'artifact',
  '任务产物',
  files,
  [b('m12 2 9 5v10l-9 5-9-5V7Z'), p('m3 7 9 5 9-5M12 12v10'), a('M8 4.2 9 5 18 10', 'draw')],
  '产物打包',
)
future(
  'group-chat',
  '群聊协作',
  auto,
  [b('M3 3h13v10H9l-4 3v-3H3Z'), a('M16 7h5v12h-3v3l-5-3h-3v-3', 'slide')],
  '对话气泡联动',
)
future(
  'approval-request',
  '等待审批',
  security,
  [b(shield), a('M12 7v6m0 4h.01', 'pulse')],
  '授权前等待',
)
future(
  'web-action',
  '网页操作',
  agent,
  [b(windowShape), p('M3 9h18'), a('m9 12 8 3-4 2-2 4Z', 'slide')],
  '网页目标定位',
)
future(
  'export',
  '导出记录',
  files,
  file([p('M8 10h4M8 14h3'), a('M14 17h9m-3-3 3 3-3 3', 'slide')]),
  '记录向外导出',
)
for (const [path, ids] of Object.entries(inlineMapping)) {
  for (const id of ids) {
    const target = catalog.find((item) => item.id === id)
    if (target && !target.sources.some((source) => source.path === path))
      target.sources.push({ path })
  }
}
export const icons = catalog
export const iconById = new Map(icons.map((icon) => [icon.id, icon]))
export const currentCount = icons.filter((icon) => !icon.future).length
export const futureCount = icons.length - currentCount
export { inventory }
