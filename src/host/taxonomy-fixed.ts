/**
 * Fixed Chinese discipline taxonomy ("固定学科目录") for LitGraph fixed mode.
 *
 * Free mode lets the LLM grow a taxonomy per paper; fixed mode pins the vocabulary
 * to this curated 3-level tree (一级学科 > 二级方向 > 三级主题). Paths are the only
 * legal category strings and are joined with " > ". A model may pick a shorter
 * existing prefix (一级 or 一级 > 二级), but never invent a new node.
 *
 * Keep the list stable: stored papers keep these paths verbatim, and the prompt
 * built by buildFixedTaxonomyPrompt() is embedded in the system prompt so it stays
 * cacheable across calls in one host process.
 */

export type TaxonomyMode = 'free' | 'fixed'

export const FIXED_TAXONOMY: string[] = [
  // 数学
  '数学 > 基础数学 > 代数与数论',
  '数学 > 基础数学 > 几何与拓扑',
  '数学 > 基础数学 > 分析与偏微分方程',
  '数学 > 应用数学 > 计算数学',
  '数学 > 应用数学 > 概率论与数理统计',
  '数学 > 应用数学 > 运筹学与控制论',
  '数学 > 应用数学 > 数学物理',
  // 物理
  '物理 > 凝聚态物理 > 量子材料',
  '物理 > 凝聚态物理 > 超导与磁性',
  '物理 > 凝聚态物理 > 半导体物理',
  '物理 > 光学 > 激光物理',
  '物理 > 光学 > 量子光学',
  '物理 > 光学 > 光通信与光子学',
  '物理 > 理论物理 > 量子信息',
  '物理 > 理论物理 > 统计物理',
  '物理 > 理论物理 > 粒子物理与核物理',
  '物理 > 原子分子物理 > 冷原子与精密测量',
  // 化学
  '化学 > 有机化学 > 合成方法学',
  '化学 > 有机化学 > 高分子化学',
  '化学 > 有机化学 > 超分子化学',
  '化学 > 无机化学 > 配位化学',
  '化学 > 无机化学 > 固态化学',
  '化学 > 物理化学 > 催化化学',
  '化学 > 物理化学 > 电化学',
  '化学 > 物理化学 > 计算化学',
  '化学 > 分析化学 > 光谱分析',
  '化学 > 分析化学 > 色谱与质谱',
  // 材料科学
  '材料科学 > 金属材料 > 合金设计与强韧化',
  '材料科学 > 无机非金属材料 > 陶瓷与玻璃',
  '材料科学 > 高分子材料 > 功能高分子',
  '材料科学 > 高分子材料 > 复合材料',
  '材料科学 > 能源材料 > 电池材料',
  '材料科学 > 能源材料 > 催化与储能材料',
  '材料科学 > 纳米材料 > 二维材料',
  '材料科学 > 纳米材料 > 纳米颗粒与薄膜',
  // 计算机科学与技术
  '计算机科学与技术 > 人工智能 > 机器学习',
  '计算机科学与技术 > 人工智能 > 深度学习',
  '计算机科学与技术 > 人工智能 > 自然语言处理',
  '计算机科学与技术 > 人工智能 > 计算机视觉',
  '计算机科学与技术 > 人工智能 > 强化学习',
  '计算机科学与技术 > 人工智能 > 生成式模型',
  '计算机科学与技术 > 人工智能 > 多模态学习',
  '计算机科学与技术 > 计算机系统 > 操作系统',
  '计算机科学与技术 > 计算机系统 > 体系结构',
  '计算机科学与技术 > 计算机系统 > 并行与分布式计算',
  '计算机科学与技术 > 计算机网络 > 网络协议与架构',
  '计算机科学与技术 > 计算机网络 > 无线网络与移动计算',
  '计算机科学与技术 > 网络安全 > 系统安全',
  '计算机科学与技术 > 数据库 > 数据管理与查询优化',
  '计算机科学与技术 > 数据库 > 数据挖掘与知识发现',
  '计算机科学与技术 > 软件工程 > 程序分析与验证',
  '计算机科学与技术 > 软件工程 > 软件开发与测试',
  '计算机科学与技术 > 计算机图形学 > 渲染与几何建模',
  '计算机科学与技术 > 计算机图形学 > 数据可视化',
  '计算机科学与技术 > 理论计算机科学 > 算法与计算复杂度',
  // 控制科学与工程
  '控制科学与工程 > 控制理论与应用 > 自适应控制',
  '控制科学与工程 > 控制理论与应用 > 鲁棒控制',
  '控制科学与工程 > 控制理论与应用 > 最优控制',
  '控制科学与工程 > 控制理论与应用 > 非线性控制',
  '控制科学与工程 > 机器人学 > 运动规划与控制',
  '控制科学与工程 > 机器人学 > 人机交互',
  '控制科学与工程 > 机器人学 > 多机器人系统',
  '控制科学与工程 > 导航与制导 > 惯性导航与组合导航',
  '控制科学与工程 > 模式识别与智能系统 > 智能感知',
  '控制科学与工程 > 模式识别与智能系统 > 决策与规划',
  // 机械工程
  '机械工程 > 机械设计 > 机构与传动',
  '机械工程 > 机械设计 > 摩擦学与表面工程',
  '机械工程 > 机械制造 > 增材制造',
  '机械工程 > 机械制造 > 精密加工',
  '机械工程 > 机械制造 > 智能制造',
  '机械工程 > 车辆工程 > 新能源汽车',
  '机械工程 > 车辆工程 > 自动驾驶',
  '机械工程 > 流体机械 > 泵与风机',
  '机械工程 > 流体机械 > 湍流与流动控制',
  // 电气工程
  '电气工程 > 电力系统 > 电力系统稳定性',
  '电气工程 > 电力系统 > 智能电网',
  '电气工程 > 电力系统 > 继电保护',
  '电气工程 > 电力电子 > 变流器与电机驱动',
  '电气工程 > 电力电子 > 无线能量传输',
  '电气工程 > 电机与电器 > 永磁电机',
  '电气工程 > 电机与电器 > 高电压与绝缘',
  // 能源与动力工程
  '能源与动力工程 > 热能工程 > 燃烧与传热',
  '能源与动力工程 > 热能工程 > 制冷与空调',
  '能源与动力工程 > 新能源 > 太阳能利用',
  '能源与动力工程 > 新能源 > 风能利用',
  '能源与动力工程 > 新能源 > 氢能与燃料电池',
  '能源与动力工程 > 动力机械 > 燃气轮机',
  '能源与动力工程 > 动力机械 > 内燃机',
  // 土木工程
  '土木工程 > 结构工程 > 混凝土结构',
  '土木工程 > 结构工程 > 钢结构',
  '土木工程 > 结构工程 > 结构抗震与防灾',
  '土木工程 > 岩土工程 > 地基与基础',
  '土木工程 > 岩土工程 > 边坡与隧道',
  '土木工程 > 桥梁与隧道工程 > 桥梁设计',
  '土木工程 > 市政工程 > 给排水与水处理',
  '土木工程 > 市政工程 > 城市防灾',
  // 环境科学与工程
  '环境科学与工程 > 水污染控制 > 污水处理',
  '环境科学与工程 > 水污染控制 > 水体修复',
  '环境科学与工程 > 大气污染控制 > 颗粒物治理',
  '环境科学与工程 > 大气污染控制 > 温室气体减排',
  '环境科学与工程 > 固废处理 > 固废资源化',
  '环境科学与工程 > 固废处理 > 土壤修复',
  '环境科学与工程 > 环境生态 > 生态修复',
  '环境科学与工程 > 环境生态 > 环境毒理',
  // 生物医学工程
  '生物医学工程 > 医学影像 > 医学图像处理',
  '生物医学工程 > 医学影像 > 影像组学',
  '生物医学工程 > 生物材料 > 组织工程材料',
  '生物医学工程 > 生物材料 > 可植入材料',
  '生物医学工程 > 生物医学信号 > 脑机接口',
  '生物医学工程 > 生物医学信号 > 生理信号处理',
  '生物医学工程 > 生物力学 > 计算生物力学',
  '生物医学工程 > 康复工程 > 智能假肢与辅具',
  // 临床医学
  '临床医学 > 内科学 > 心血管病学',
  '临床医学 > 内科学 > 肿瘤学',
  '临床医学 > 内科学 > 呼吸病学',
  '临床医学 > 内科学 > 内分泌与代谢病学',
  '临床医学 > 外科学 > 骨科学',
  '临床医学 > 外科学 > 神经外科学',
  '临床医学 > 外科学 > 普通外科学',
  '临床医学 > 儿科学 > 新生儿医学',
  '临床医学 > 影像医学 > 放射诊断学',
  '临床医学 > 影像医学 > 核医学',
  // 基础医学
  '基础医学 > 免疫学 > 肿瘤免疫',
  '基础医学 > 免疫学 > 免疫调节',
  '基础医学 > 病理学 > 分子病理',
  '基础医学 > 病理学 > 疾病机制',
  '基础医学 > 生理学 > 神经生理',
  '基础医学 > 生理学 > 心血管生理',
  '基础医学 > 组织胚胎学 > 组织工程',
  // 药学
  '药学 > 药物化学 > 药物设计与合成',
  '药学 > 药物化学 > 天然产物化学',
  '药学 > 药剂学 > 纳米给药系统',
  '药学 > 药剂学 > 缓释与靶向制剂',
  '药学 > 药理学 > 分子药理学',
  '药学 > 药理学 > 临床药理学',
  '药学 > 药物分析 > 药物代谢',
  '药学 > 药物分析 > 药物质量控制',
  // 生物学
  '生物学 > 生物化学与分子生物学 > 基因表达调控',
  '生物学 > 生物化学与分子生物学 > 蛋白质结构与功能',
  '生物学 > 细胞生物学 > 细胞信号转导',
  '生物学 > 细胞生物学 > 细胞凋亡与自噬',
  '生物学 > 遗传学 > 基因组学',
  '生物学 > 遗传学 > 表观遗传学',
  '生物学 > 生态学 > 生态系统生态学',
  '生物学 > 生态学 > 生物多样性',
  '生物学 > 微生物学 > 微生物代谢',
  '生物学 > 微生物学 > 合成生物学',
  // 地球科学
  '地球科学 > 地质学 > 岩石与矿床学',
  '地球科学 > 地质学 > 构造地质学',
  '地球科学 > 地球物理学 > 地震学',
  '地球科学 > 地球物理学 > 重磁电法勘探',
  '地球科学 > 地理学 > 遥感与地理信息系统',
  '地球科学 > 地理学 > 自然地理学',
  '地球科学 > 大气科学 > 气候动力学',
  '地球科学 > 大气科学 > 天气预测',
  '地球科学 > 海洋科学 > 物理海洋学',
  '地球科学 > 海洋科学 > 海洋生态学',
  // 经济学
  '经济学 > 理论经济学 > 宏观经济学',
  '经济学 > 理论经济学 > 微观经济学',
  '经济学 > 理论经济学 > 计量经济学',
  '经济学 > 应用经济学 > 金融学',
  '经济学 > 应用经济学 > 国际贸易',
  '经济学 > 应用经济学 > 产业经济学',
  '经济学 > 应用经济学 > 数字经济',
  // 管理学
  '管理学 > 管理科学与工程 > 运筹与优化',
  '管理学 > 管理科学与工程 > 决策分析',
  '管理学 > 管理科学与工程 > 信息管理',
  '管理学 > 工商管理 > 组织行为学',
  '管理学 > 工商管理 > 市场营销',
  '管理学 > 工商管理 > 战略管理',
  '管理学 > 公共管理 > 公共政策',
  '管理学 > 公共管理 > 应急管理',
  // 法学
  '法学 > 法学理论 > 法理学',
  '法学 > 法学理论 > 法律史',
  '法学 > 民商法 > 合同法',
  '法学 > 民商法 > 知识产权法',
  '法学 > 国际法 > 国际公法',
  '法学 > 国际法 > 国际经济法',
  // 教育学
  '教育学 > 教育学原理 > 教育哲学',
  '教育学 > 教育学原理 > 教育政策',
  '教育学 > 课程与教学论 > 教学设计',
  '教育学 > 课程与教学论 > 学科教育',
  '教育学 > 教育技术学 > 学习分析',
  '教育学 > 教育技术学 > 智慧教育',
  // 文学
  '文学 > 中国语言文学 > 中国现当代文学',
  '文学 > 中国语言文学 > 语言学及应用语言学',
  '文学 > 中国语言文学 > 文艺学',
  '文学 > 外国语言文学 > 英语文学',
  '文学 > 外国语言文学 > 翻译研究',
  '文学 > 新闻传播学 > 传播理论',
  '文学 > 新闻传播学 > 新媒体研究',
  // 历史学
  '历史学 > 中国史 > 中国古代史',
  '历史学 > 中国史 > 中国近现代史',
  '历史学 > 世界史 > 世界古代史',
  '历史学 > 世界史 > 世界近现代史',
  '历史学 > 考古学 > 考古发掘',
  '历史学 > 考古学 > 文化遗产',
  // 哲学
  '哲学 > 哲学基础 > 马克思主义哲学',
  '哲学 > 哲学基础 > 西方哲学',
  '哲学 > 哲学基础 > 中国哲学',
  '哲学 > 逻辑学 > 形式逻辑',
  '哲学 > 逻辑学 > 逻辑与计算',
  '哲学 > 伦理学 > 应用伦理学',
  '哲学 > 伦理学 > 科技伦理学',
]

export const FIXED_TAXONOMY_TOP_LEVELS: string[] = Array.from(
  new Set(FIXED_TAXONOMY.map((entry) => entry.split(' > ')[0])),
)

const FIXED_TAXONOMY_INDEX = new Map<string, string>()
for (const entry of FIXED_TAXONOMY) FIXED_TAXONOMY_INDEX.set(entry.toLowerCase(), entry)

/** Collapse "A>B > C" into the canonical "A > B > C" form (max 3 levels). */
export function normalizeTaxonomyPath(raw: string): string {
  return raw
    .replace(/^NEW\s*[:：]\s*/i, '')
    .split('>')
    .map((part) => part.trim().replace(/\s+/g, ' '))
    .filter((part) => part.length > 0)
    .slice(0, 3)
    .join(' > ')
}

/** True for a full fixed path or an existing shorter prefix (一级 / 一级 > 二级). */
export function isFixedTaxonomyPath(path: string): boolean {
  const normalized = normalizeTaxonomyPath(path)
  if (normalized === '') return false
  const lower = normalized.toLowerCase()
  if (FIXED_TAXONOMY_INDEX.has(lower)) return true
  return FIXED_TAXONOMY.some((entry) => entry.toLowerCase().startsWith(lower + ' > '))
}

/**
 * Map one model-proposed category onto the fixed tree.
 *
 * Accepts an exact path, a shorter existing prefix, or (as a last resort) a path
 * whose leaf uniquely names a topic in the tree. Returns null when nothing fits so
 * the caller can drop the hallucinated category instead of storing it.
 */
export function matchFixedCategory(raw: string): string | null {
  const normalized = normalizeTaxonomyPath(raw)
  if (normalized === '') return null
  const lower = normalized.toLowerCase()
  const exact = FIXED_TAXONOMY_INDEX.get(lower)
  if (exact !== undefined) return exact
  if (FIXED_TAXONOMY.some((entry) => entry.toLowerCase().startsWith(lower + ' > '))) return normalized
  const leaf = (normalized.split(' > ').pop() ?? '').toLowerCase()
  if (leaf === '') return null
  const leafMatches = FIXED_TAXONOMY.filter((entry) => (entry.split(' > ').pop() ?? '').toLowerCase() === leaf)
  if (leafMatches.length === 1) return leafMatches[0]
  return null
}

/** Prompt block listing the whole fixed catalogue, grouped by 一级学科. */
export function buildFixedTaxonomyPrompt(): string {
  const lines: string[] = [
    '固定学科目录（共 ' + FIXED_TAXONOMY.length + ' 条，只能逐字选择下列路径；禁止新增、改写、缩写或自造任何一级/二级类目）：',
  ]
  let currentTop = ''
  for (const entry of FIXED_TAXONOMY) {
    const top = entry.split(' > ')[0]
    if (top !== currentTop) {
      if (currentTop !== '') lines.push('')
      currentTop = top
      lines.push('【' + top + '】')
    }
    lines.push('- ' + entry)
  }
  return lines.join('\n')
}
