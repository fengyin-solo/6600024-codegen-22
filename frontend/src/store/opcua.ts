import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { OPCUANode, DataValue, AlarmEvent, SubscriptionConfig, AnomalyEvent, AnomalyConfig } from '../types'

// 突变注入演示配置
const SPIKE_PROBABILITY = 0.03
// 已知数值节点的突变幅度（用于演示连续采样突变）
const SPIKE_MAGNITUDE: Record<string, number> = {
  temp_sensor: 6,
  pressure_transmitter: 1.2,
  flow_meter: 45,
  valve_position: 25,
  motor_speed: 120
}
// 基线波动率下限，避免采样过于平稳时阈值趋近于 0
const BASELINE_FLOOR = 1

export const useOpcuaStore = defineStore('opcua', () => {
  // 状态
  const nodeTree = ref<OPCUANode[]>([])
  const selectedNode = ref<OPCUANode | null>(null)
  const subscriptions = ref<Map<string, SubscriptionConfig>>(new Map())
  const alarms = ref<AlarmEvent[]>([])
  const realTimeData = ref<Map<string, DataValue>>(new Map())
  const isConnected = ref(false)
  const dataHistory = ref<Map<string, Array<{ timestamp: number; value: number }>>>(new Map())

  // 异常波动识别相关状态
  const anomalies = ref<AnomalyEvent[]>([])
  const anomalyConfig = ref<AnomalyConfig>({
    windowSize: 15,
    mutationFactor: 4,
    consecutiveThreshold: 2,
    cooldown: 8000,
    fragmentSize: 30
  })
  // 每个节点的近期变化幅度（用于计算基线波动率）
  const recentDeltas = ref<Map<string, number[]>>(new Map())
  // 每个节点连续出现突变的次数
  const consecutiveMutations = ref<Map<string, number>>(new Map())
  // 每个节点最近一次风险标记时间（用于冷却去重）
  const lastAnomalyTime = ref<Map<string, number>>(new Map())
  // 瞬时突变待恢复值（突变后下一拍恢复，形成连续突变）
  const pendingRestore = ref<Map<string, number>>(new Map())

  // 初始化模拟节点树
  function initNodeTree() {
    nodeTree.value = [
      {
        id: 'server',
        name: 'Server',
        nodeId: 'ns=0;i=2253',
        type: 'Object',
        description: 'OPC-UA 服务器根节点',
        children: [
          {
            id: 'objects',
            name: 'Objects',
            nodeId: 'ns=0;i=85',
            type: 'Object',
            description: '对象文件夹',
            children: [
              {
                id: 'plc_area1',
                name: 'PLC_Area1',
                nodeId: 'ns=2;i=1001',
                type: 'Object',
                description: '1号生产区域 PLC',
                children: [
                  {
                    id: 'temp_sensor',
                    name: 'Temperature_Sensor',
                    nodeId: 'ns=2;i=1002',
                    type: 'Variable',
                    dataType: 'Double',
                    value: 25.6,
                    unit: '°C',
                    quality: 'Good',
                    description: '温度传感器'
                  },
                  {
                    id: 'pressure_transmitter',
                    name: 'Pressure_Transmitter',
                    nodeId: 'ns=2;i=1003',
                    type: 'Variable',
                    dataType: 'Double',
                    value: 3.45,
                    unit: 'MPa',
                    quality: 'Good',
                    description: '压力变送器'
                  },
                  {
                    id: 'pump_status',
                    name: 'Pump_Status',
                    nodeId: 'ns=2;i=1004',
                    type: 'Variable',
                    dataType: 'Boolean',
                    value: true,
                    quality: 'Good',
                    description: '泵运行状态'
                  }
                ]
              },
              {
                id: 'plc_area2',
                name: 'PLC_Area2',
                nodeId: 'ns=2;i=2001',
                type: 'Object',
                description: '2号生产区域 PLC',
                children: [
                  {
                    id: 'flow_meter',
                    name: 'Flow_Meter',
                    nodeId: 'ns=2;i=2002',
                    type: 'Variable',
                    dataType: 'Double',
                    value: 156.7,
                    unit: 'L/min',
                    quality: 'Good',
                    description: '流量计'
                  },
                  {
                    id: 'valve_position',
                    name: 'Valve_Position',
                    nodeId: 'ns=2;i=2003',
                    type: 'Variable',
                    dataType: 'Double',
                    value: 75,
                    unit: '%',
                    quality: 'Good',
                    description: '阀门开度'
                  },
                  {
                    id: 'motor_speed',
                    name: 'Motor_Speed',
                    nodeId: 'ns=2;i=2004',
                    type: 'Variable',
                    dataType: 'Int32',
                    value: 1480,
                    unit: 'RPM',
                    quality: 'Good',
                    description: '电机转速'
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }

  // 模拟实时数据更新
  function simulateDataUpdate() {
    const nodes = getAllVariableNodes()
    nodes.forEach(node => {
      const currentValue = realTimeData.value.get(node.id)?.value ?? node.value
      
      let newValue: number | boolean | string
      if (node.dataType === 'Double') {
        const numVal = typeof currentValue === 'number' ? currentValue : parseFloat(String(currentValue))
        const variation = (Math.random() - 0.5) * 2
        newValue = Math.round((numVal + variation) * 100) / 100
      } else if (node.dataType === 'Int32') {
        const numVal = typeof currentValue === 'number' ? currentValue : parseInt(String(currentValue))
        const variation = Math.floor((Math.random() - 0.5) * 10)
        newValue = numVal + variation
      } else if (node.dataType === 'Boolean') {
        newValue = Math.random() > 0.95 ? !currentValue : currentValue
      } else {
        newValue = currentValue
      }

      // 异常波动演示：偶尔注入瞬时突变，并在下一拍恢复，形成“连续采样突变”
      const prevNumeric = typeof currentValue === 'number' ? currentValue : NaN
      if (node.dataType === 'Double' || node.dataType === 'Int32') {
        const restore = pendingRestore.value.get(node.id)
        if (restore !== undefined) {
          // 恢复到突变前的正常轨迹，制造第二次突变
          newValue = node.dataType === 'Double'
            ? Math.round(restore * 100) / 100
            : Math.round(restore)
          pendingRestore.value.delete(node.id)
        } else if (Math.random() < SPIKE_PROBABILITY) {
          const base = typeof newValue === 'number' ? newValue : 0
          const magnitude = SPIKE_MAGNITUDE[node.id] ?? Math.max(5, Math.abs(base) * 0.15)
          const offset = Math.random() > 0.5 ? magnitude : -magnitude
          newValue = node.dataType === 'Double'
            ? Math.round((base + offset) * 100) / 100
            : Math.round(base + offset)
          pendingRestore.value.set(node.id, base)
        }
      }

      const dataValue: DataValue = {
        nodeId: node.nodeId,
        value: newValue,
        quality: Math.random() > 0.98 ? 'Uncertain' : 'Good',
        timestamp: Date.now(),
        sourceTimestamp: Date.now(),
        serverTimestamp: Date.now()
      }

      realTimeData.value.set(node.id, dataValue)
      node.value = newValue
      node.quality = dataValue.quality

      // 记录历史数据
      const history = dataHistory.value.get(node.id) || []
      history.push({ timestamp: Date.now(), value: typeof newValue === 'number' ? newValue : 0 })
      if (history.length > 100) history.shift()
      dataHistory.value.set(node.id, history)

      // 检查报警条件
      checkAlarms(node, newValue)

      // 异常波动识别（基于连续采样突变）
      detectAnomalies(node, prevNumeric, newValue)
    })
  }

  // 检查报警
  function checkAlarms(node: OPCUANode, value: number | boolean | string) {
    if (node.id === 'temp_sensor' && typeof value === 'number' && value > 28) {
      addAlarm({
        nodeId: node.nodeId,
        nodeName: node.name,
        severity: 'High',
        message: `温度过高: ${value}°C (阈值: 28°C)`,
        value,
        threshold: 28
      })
    }
    if (node.id === 'pressure_transmitter' && typeof value === 'number' && value > 4.0) {
      addAlarm({
        nodeId: node.nodeId,
        nodeName: node.name,
        severity: 'Critical',
        message: `压力超限: ${value} MPa (阈值: 4.0 MPa)`,
        value,
        threshold: 4.0
      })
    }
    if (node.id === 'motor_speed' && typeof value === 'number' && value > 1550) {
      addAlarm({
        nodeId: node.nodeId,
        nodeName: node.name,
        severity: 'Medium',
        message: `电机转速偏高: ${value} RPM (阈值: 1550 RPM)`,
        value,
        threshold: 1550
      })
    }
  }

  // 添加报警
  function addAlarm(alarm: Omit<AlarmEvent, 'id' | 'timestamp' | 'acknowledged'>) {
    const newAlarm: AlarmEvent = {
      ...alarm,
      id: `alarm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      acknowledged: false
    }
    alarms.value.unshift(newAlarm)
    if (alarms.value.length > 50) alarms.value.pop()
  }

  // 计算数组均值
  function mean(arr: number[]): number {
    if (!arr.length) return 0
    return arr.reduce((a, b) => a + b, 0) / arr.length
  }

  // 根据变化倍数与连续次数判定严重程度
  function getAnomalySeverity(ratio: number, consecutive: number): AnomalyEvent['severity'] {
    if (consecutive >= 3 || ratio >= 8) return 'Critical'
    if (ratio >= 6) return 'High'
    if (ratio >= 4) return 'Medium'
    return 'Low'
  }

  // 异常波动识别：基于近期基线波动率检测连续采样突变
  function detectAnomalies(node: OPCUANode, prevValue: number, newValue: number | boolean | string) {
    if (node.dataType !== 'Double' && node.dataType !== 'Int32') return
    if (typeof newValue !== 'number' || Number.isNaN(prevValue)) return

    const delta = Math.abs(newValue - prevValue)
    const cfg = anomalyConfig.value
    const deltas = recentDeltas.value.get(node.id) || []
    const baseline = Math.max(mean(deltas), BASELINE_FLOOR)
    const threshold = cfg.mutationFactor * baseline
    const isMutation = delta > threshold

    let consecutive = consecutiveMutations.value.get(node.id) || 0
    consecutive = isMutation ? consecutive + 1 : 0
    consecutiveMutations.value.set(node.id, consecutive)

    // 更新近期变化幅度窗口（基线计算之后再加入当前值，避免污染当前判定）
    deltas.push(delta)
    if (deltas.length > cfg.windowSize) deltas.shift()
    recentDeltas.value.set(node.id, deltas)

    if (!isMutation || consecutive < cfg.consecutiveThreshold) return

    // 冷却去重：同一节点短时间内不重复标记
    const lastTime = lastAnomalyTime.value.get(node.id) || 0
    if (Date.now() - lastTime < cfg.cooldown) return
    lastAnomalyTime.value.set(node.id, Date.now())

    const ratio = baseline > 0 ? delta / baseline : delta
    const severity = getAnomalySeverity(ratio, consecutive)
    const history = dataHistory.value.get(node.id) || []
    const historyFragment = history
      .slice(-cfg.fragmentSize)
      .map(h => ({ timestamp: h.timestamp, value: h.value }))

    addAnomaly({
      nodeId: node.nodeId,
      nodeName: node.name,
      severity,
      message: `连续 ${consecutive} 次采样突变，变化 ${delta.toFixed(2)}（基线 ${baseline.toFixed(2)}，${ratio.toFixed(1)} 倍）`,
      prevValue,
      currentValue: newValue,
      delta,
      baselineVolatility: baseline,
      ratio,
      consecutiveCount: consecutive,
      historyFragment
    })
  }

  // 添加异常波动事件
  function addAnomaly(anomaly: Omit<AnomalyEvent, 'id' | 'timestamp' | 'acknowledged'>) {
    const newAnomaly: AnomalyEvent = {
      ...anomaly,
      id: `anomaly_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      acknowledged: false
    }
    anomalies.value.unshift(newAnomaly)
    if (anomalies.value.length > 50) anomalies.value.pop()
  }

  // 确认异常波动
  function acknowledgeAnomaly(anomalyId: string) {
    const anomaly = anomalies.value.find(a => a.id === anomalyId)
    if (anomaly) {
      anomaly.acknowledged = true
    }
  }

  // 清空异常波动
  function clearAnomalies() {
    anomalies.value = []
  }

  // 获取所有变量节点
  function getAllVariableNodes(): OPCUANode[] {
    const variables: OPCUANode[] = []
    function traverse(nodes: OPCUANode[]) {
      nodes.forEach(node => {
        if (node.type === 'Variable') {
          variables.push(node)
        }
        if (node.children) {
          traverse(node.children)
        }
      })
    }
    traverse(nodeTree.value)
    return variables
  }

  // 选择节点
  function selectNode(node: OPCUANode) {
    selectedNode.value = node
  }

  // 添加订阅
  function addSubscription(nodeId: string, config: Partial<SubscriptionConfig> = {}) {
    const subscription: SubscriptionConfig = {
      nodeId,
      publishingInterval: config.publishingInterval || 1000,
      samplingInterval: config.samplingInterval || 500,
      queueSize: config.queueSize || 10,
      discardOldest: config.discardOldest ?? true,
      enabled: true
    }
    subscriptions.value.set(nodeId, subscription)
  }

  // 移除订阅
  function removeSubscription(nodeId: string) {
    subscriptions.value.delete(nodeId)
  }

  // 确认报警
  function acknowledgeAlarm(alarmId: string) {
    const alarm = alarms.value.find(a => a.id === alarmId)
    if (alarm) {
      alarm.acknowledged = true
    }
  }

  // 清空报警
  function clearAlarms() {
    alarms.value = []
  }

  // 连接模拟
  function connect() {
    isConnected.value = true
    initNodeTree()
    // 重置异常波动识别运行时状态
    anomalies.value = []
    recentDeltas.value.clear()
    consecutiveMutations.value.clear()
    lastAnomalyTime.value.clear()
    pendingRestore.value.clear()
  }

  // 断开连接
  function disconnect() {
    isConnected.value = false
  }

  // 计算属性
  const activeAlarmsCount = computed(() => alarms.value.filter(a => !a.acknowledged).length)
  const criticalAlarmsCount = computed(() => alarms.value.filter(a => a.severity === 'Critical' && !a.acknowledged).length)
  const activeAnomaliesCount = computed(() => anomalies.value.filter(a => !a.acknowledged).length)
  const criticalAnomaliesCount = computed(() => anomalies.value.filter(a => a.severity === 'Critical' && !a.acknowledged).length)

  return {
    // 状态
    nodeTree,
    selectedNode,
    subscriptions,
    alarms,
    realTimeData,
    isConnected,
    dataHistory,
    anomalies,
    anomalyConfig,
    // 方法
    initNodeTree,
    simulateDataUpdate,
    selectNode,
    addSubscription,
    removeSubscription,
    acknowledgeAlarm,
    clearAlarms,
    connect,
    disconnect,
    getAllVariableNodes,
    acknowledgeAnomaly,
    clearAnomalies,
    // 计算属性
    activeAlarmsCount,
    criticalAlarmsCount,
    activeAnomaliesCount,
    criticalAnomaliesCount
  }
})
