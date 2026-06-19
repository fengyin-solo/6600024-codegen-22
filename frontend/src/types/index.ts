// OPC-UA 节点类型定义
export interface OPCUANode {
  id: string
  name: string
  nodeId: string
  type: 'Object' | 'Variable' | 'Method' | 'DataType'
  dataType?: string
  value?: any
  unit?: string
  quality?: 'Good' | 'Bad' | 'Uncertain'
  children?: OPCUANode[]
  description?: string
  browseName?: string
}

// 数据值模型
export interface DataValue {
  nodeId: string
  value: number | boolean | string
  quality: 'Good' | 'Bad' | 'Uncertain'
  timestamp: number
  sourceTimestamp?: number
  serverTimestamp?: number
}

// 报警事件
export interface AlarmEvent {
  id: string
  nodeId: string
  nodeName: string
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info'
  message: string
  timestamp: number
  acknowledged: boolean
  value?: number | boolean | string
  threshold?: number
}

// 订阅配置
export interface SubscriptionConfig {
  nodeId: string
  publishingInterval: number
  samplingInterval: number
  queueSize: number
  discardOldest: boolean
  enabled: boolean
}

// 历史数据点
export interface HistoryDataPoint {
  timestamp: number
  value: number
  quality: 'Good' | 'Bad' | 'Uncertain'
}

// 异常波动事件（连续采样突变识别）
export interface AnomalyEvent {
  id: string
  nodeId: string
  nodeName: string
  severity: 'Critical' | 'High' | 'Medium' | 'Low'
  message: string
  timestamp: number
  acknowledged: boolean
  // 突变前后的采样值
  prevValue: number
  currentValue: number
  // 单步变化量（绝对值）
  delta: number
  // 触发突变判定的基线波动率（近期平均变化幅度）
  baselineVolatility: number
  // 变化幅度相对基线的倍数
  ratio: number
  // 连续出现突变的采样次数
  consecutiveCount: number
  // 关联历史片段（突变前后的采样窗口）
  historyFragment: Array<{ timestamp: number; value: number }>
}

// 异常波动识别配置
export interface AnomalyConfig {
  // 计算基线波动率使用的近期采样窗口大小
  windowSize: number
  // 突变判定倍数：变化幅度超过 基线 * factor 视为突变
  mutationFactor: number
  // 触发风险标记所需的连续突变次数
  consecutiveThreshold: number
  // 单节点风险标记冷却时间（毫秒），避免同一异常重复刷屏
  cooldown: number
  // 关联历史片段捕获的采样点数量
  fragmentSize: number
}

// 节点详情
export interface NodeDetail {
  node: OPCUANode
  currentValue?: DataValue
  history?: HistoryDataPoint[]
  subscriptions?: SubscriptionConfig[]
}
