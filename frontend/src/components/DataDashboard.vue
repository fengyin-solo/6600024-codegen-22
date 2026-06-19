<template>
  <div class="data-dashboard">
    <!-- 仪表盘区域 -->
    <div class="gauges-section">
      <h3 class="section-title">实时仪表</h3>
      <div class="gauges-grid">
        <!-- 温度仪表 -->
        <div class="gauge-card">
          <div class="gauge-label">温度</div>
          <div class="gauge-value" :class="getTempClass(temperature)">
            {{ temperature.toFixed(1) }}
            <span class="gauge-unit">°C</span>
          </div>
          <el-progress
            :percentage="Math.min((temperature / 50) * 100, 100)"
            :color="getTempColor(temperature)"
            :stroke-width="8"
          />
          <div class="gauge-quality">
            <span class="quality-dot" :class="getQualityClass('temp_sensor')"></span>
            {{ getNodeQuality('temp_sensor') }}
          </div>
        </div>

        <!-- 压力表 -->
        <div class="gauge-card">
          <div class="gauge-label">压力</div>
          <div class="gauge-value" :class="getPressureClass(pressure)">
            {{ pressure.toFixed(2) }}
            <span class="gauge-unit">MPa</span>
          </div>
          <el-progress
            :percentage="Math.min((pressure / 6) * 100, 100)"
            :color="getPressureColor(pressure)"
            :stroke-width="8"
          />
          <div class="gauge-quality">
            <span class="quality-dot" :class="getQualityClass('pressure_transmitter')"></span>
            {{ getNodeQuality('pressure_transmitter') }}
          </div>
        </div>

        <!-- 流量计 -->
        <div class="gauge-card">
          <div class="gauge-label">流量</div>
          <div class="gauge-value text-blue-400">
            {{ flow.toFixed(1) }}
            <span class="gauge-unit">L/min</span>
          </div>
          <el-progress
            :percentage="Math.min((flow / 300) * 100, 100)"
            color="#60a5fa"
            :stroke-width="8"
          />
          <div class="gauge-quality">
            <span class="quality-dot" :class="getQualityClass('flow_meter')"></span>
            {{ getNodeQuality('flow_meter') }}
          </div>
        </div>

        <!-- 阀门开度 -->
        <div class="gauge-card">
          <div class="gauge-label">阀门开度</div>
          <div class="gauge-value text-purple-400">
            {{ valvePosition.toFixed(0) }}
            <span class="gauge-unit">%</span>
          </div>
          <el-progress
            :percentage="valvePosition"
            color="#a78bfa"
            :stroke-width="8"
          />
          <div class="gauge-quality">
            <span class="quality-dot" :class="getQualityClass('valve_position')"></span>
            {{ getNodeQuality('valve_position') }}
          </div>
        </div>

        <!-- 电机转速 -->
        <div class="gauge-card">
          <div class="gauge-label">电机转速</div>
          <div class="gauge-value" :class="getSpeedClass(motorSpeed)">
            {{ motorSpeed }}
            <span class="gauge-unit">RPM</span>
          </div>
          <el-progress
            :percentage="Math.min((motorSpeed / 2000) * 100, 100)"
            :color="getSpeedColor(motorSpeed)"
            :stroke-width="8"
          />
          <div class="gauge-quality">
            <span class="quality-dot" :class="getQualityClass('motor_speed')"></span>
            {{ getNodeQuality('motor_speed') }}
          </div>
        </div>

        <!-- 泵状态 -->
        <div class="gauge-card">
          <div class="gauge-label">泵运行状态</div>
          <div class="gauge-value" :class="pumpStatus ? 'text-green-400' : 'text-red-400'">
            {{ pumpStatus ? '运行中' : '已停止' }}
          </div>
          <div class="pump-indicator" :class="pumpStatus ? 'pump-on' : 'pump-off'">
            <el-icon :size="32"><CircleCheckFilled v-if="pumpStatus" /><CircleCloseFilled v-else /></el-icon>
          </div>
          <div class="gauge-quality">
            <span class="quality-dot" :class="getQualityClass('pump_status')"></span>
            {{ getNodeQuality('pump_status') }}
          </div>
        </div>
      </div>
    </div>

    <!-- 趋势图区域 -->
    <div class="charts-section">
      <h3 class="section-title">数据趋势</h3>
      <div class="charts-grid">
        <div class="chart-card">
          <v-chart :option="tempChartOption" autoresize class="chart" />
        </div>
        <div class="chart-card">
          <v-chart :option="pressureChartOption" autoresize class="chart" />
        </div>
        <div class="chart-card">
          <v-chart :option="flowChartOption" autoresize class="chart" />
        </div>
      </div>
    </div>

    <!-- 异常波动识别区域 -->
    <div class="anomaly-section">
      <div class="anomaly-section-header">
        <h3 class="section-title anomaly-title">
          <el-icon class="text-orange-400"><Warning /></el-icon>
          异常波动识别
        </h3>
        <div class="anomaly-header-actions">
          <el-button type="primary" size="small" text @click="configDialogVisible = true">
            <el-icon><Setting /></el-icon>
            检测配置
          </el-button>
          <el-button
            v-if="store.anomalies.length > 0"
            type="danger"
            size="small"
            text
            @click="store.clearAnomalies()"
          >
            清空
          </el-button>
        </div>
      </div>

      <div class="anomaly-stats">
        <el-tag type="danger" size="small">严重: {{ store.criticalAnomaliesCount }}</el-tag>
        <el-tag type="warning" size="small">活跃: {{ store.activeAnomaliesCount }}</el-tag>
        <el-tag type="info" size="small">总计: {{ store.anomalies.length }}</el-tag>
      </div>

      <div class="anomaly-list">
        <div
          v-for="anomaly in store.anomalies"
          :key="anomaly.id"
          class="anomaly-item"
          :class="{
            'anomaly-critical': anomaly.severity === 'Critical',
            'anomaly-high': anomaly.severity === 'High',
            'anomaly-medium': anomaly.severity === 'Medium',
            'anomaly-acknowledged': anomaly.acknowledged
          }"
        >
          <div class="anomaly-item-header">
            <el-tag
              :type="getAnomalySeverityType(anomaly.severity)"
              size="small"
              effect="dark"
            >
              {{ getAnomalySeverityLabel(anomaly.severity) }}
            </el-tag>
            <span class="anomaly-time">{{ formatAnomalyTime(anomaly.timestamp) }}</span>
          </div>
          <div class="anomaly-item-body">
            <div class="anomaly-node">
              <span class="anomaly-node-name">{{ anomaly.nodeName }}</span>
              <span class="anomaly-ratio">×{{ anomaly.ratio.toFixed(1) }}</span>
            </div>
            <p class="anomaly-message">{{ anomaly.message }}</p>
            <div class="anomaly-values">
              <span class="value-prev">{{ anomaly.prevValue.toFixed(2) }}</span>
              <el-icon class="text-gray-500"><ArrowRight /></el-icon>
              <span class="value-cur">{{ anomaly.currentValue.toFixed(2) }}</span>
            </div>
          </div>
          <div class="anomaly-item-actions">
            <el-button type="primary" size="small" text @click="openFragment(anomaly)">
              查看历史片段
            </el-button>
            <el-button
              v-if="!anomaly.acknowledged"
              type="success"
              size="small"
              text
              @click="store.acknowledgeAnomaly(anomaly.id)"
            >
              确认
            </el-button>
          </div>
        </div>

        <div v-if="store.anomalies.length === 0" class="no-anomalies">
          <el-empty description="暂无异常波动风险" :image-size="60" />
        </div>
      </div>
    </div>

    <!-- 关联历史片段弹窗 -->
    <el-dialog
      v-model="fragmentDialogVisible"
      title="关联历史片段"
      width="640px"
      class="fragment-dialog"
      align-center
    >
      <template v-if="selectedAnomaly">
        <el-descriptions :column="2" size="small" border class="fragment-descriptions">
          <el-descriptions-item label="节点">{{ selectedAnomaly.nodeName }}</el-descriptions-item>
          <el-descriptions-item label="严重程度">
            <el-tag
              :type="getAnomalySeverityType(selectedAnomaly.severity)"
              size="small"
              effect="dark"
            >
              {{ getAnomalySeverityLabel(selectedAnomaly.severity) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="变化量">{{ selectedAnomaly.delta.toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="基线波动">{{ selectedAnomaly.baselineVolatility.toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="变化倍数">×{{ selectedAnomaly.ratio.toFixed(1) }}</el-descriptions-item>
          <el-descriptions-item label="连续突变">{{ selectedAnomaly.consecutiveCount }} 次</el-descriptions-item>
        </el-descriptions>
        <v-chart :option="fragmentChartOption" autoresize class="fragment-chart" />
        <p class="fragment-tip">红色标记为突变采样点，曲线展示突变前后的关联历史片段</p>
      </template>
    </el-dialog>

    <!-- 异常波动识别参数配置 -->
    <el-dialog
      v-model="configDialogVisible"
      title="异常波动检测配置"
      width="480px"
      class="config-dialog"
      align-center
    >
      <el-form :model="localConfig" label-width="140px" size="default">
        <el-form-item label="基线窗口大小">
          <el-slider
            v-model="localConfig.windowSize"
            :min="5"
            :max="30"
            :step="1"
            show-input
            input-size="small"
          />
          <span class="form-tip">用于计算基线波动率的近期采样点数</span>
        </el-form-item>
        <el-form-item label="突变判定倍数">
          <el-slider
            v-model="localConfig.mutationFactor"
            :min="2"
            :max="10"
            :step="0.5"
            show-input
            input-size="small"
          />
          <span class="form-tip">变化幅度超过 基线 × 此倍数 视为单次突变</span>
        </el-form-item>
        <el-form-item label="连续突变阈值">
          <el-slider
            v-model="localConfig.consecutiveThreshold"
            :min="1"
            :max="5"
            :step="1"
            show-input
            input-size="small"
          />
          <span class="form-tip">连续出现此次数突变才标记为风险</span>
        </el-form-item>
        <el-form-item label="冷却时间(秒)">
          <el-slider
            v-model="cooldownSeconds"
            :min="2"
            :max="30"
            :step="1"
            show-input
            input-size="small"
          />
          <span class="form-tip">同一节点短时间内不重复标记，避免刷屏</span>
        </el-form-item>
        <el-form-item label="历史片段长度">
          <el-slider
            v-model="localConfig.fragmentSize"
            :min="10"
            :max="60"
            :step="5"
            show-input
            input-size="small"
          />
          <span class="form-tip">关联历史片段捕获的采样点数量</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetConfig">重置默认</el-button>
        <el-button type="primary" @click="applyConfig">应用配置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, TitleComponent, MarkPointComponent } from 'echarts/components'
import { CircleCheckFilled, CircleCloseFilled, Warning, ArrowRight, Setting } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useOpcuaStore } from '../store/opcua'
import type { AnomalyEvent } from '../types'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, TitleComponent, MarkPointComponent])

const store = useOpcuaStore()

// 获取节点当前值
function getNodeValue(nodeId: string): number | boolean {
  const data = store.realTimeData.get(nodeId)
  if (data) return data.value as number | boolean
  const node = findNodeById(nodeId)
  return node?.value ?? 0
}

function getNodeQuality(nodeId: string): string {
  const data = store.realTimeData.get(nodeId)
  if (data) return data.quality
  const node = findNodeById(nodeId)
  return node?.quality ?? 'Unknown'
}

function findNodeById(id: string) {
  function search(nodes: any[]): any {
    for (const node of nodes) {
      if (node.id === id) return node
      if (node.children) {
        const found = search(node.children)
        if (found) return found
      }
    }
    return null
  }
  return search(store.nodeTree)
}

function getQualityClass(nodeId: string): string {
  const quality = getNodeQuality(nodeId)
  return quality === 'Good' ? 'quality-good' : quality === 'Bad' ? 'quality-bad' : 'quality-uncertain'
}

// 实时数值
const temperature = computed(() => getNodeValue('temp_sensor') as number || 25)
const pressure = computed(() => getNodeValue('pressure_transmitter') as number || 3.5)
const flow = computed(() => getNodeValue('flow_meter') as number || 150)
const valvePosition = computed(() => getNodeValue('valve_position') as number || 75)
const motorSpeed = computed(() => getNodeValue('motor_speed') as number || 1480)
const pumpStatus = computed(() => getNodeValue('pump_status') as boolean)

// 温度和颜色判断
function getTempClass(val: number) {
  if (val > 30) return 'text-red-400'
  if (val > 28) return 'text-yellow-400'
  return 'text-green-400'
}

function getTempColor(val: number) {
  if (val > 30) return '#f56c6c'
  if (val > 28) return '#e6a23c'
  return '#67c23a'
}

function getPressureClass(val: number) {
  if (val > 4.5) return 'text-red-400'
  if (val > 4.0) return 'text-yellow-400'
  return 'text-cyan-400'
}

function getPressureColor(val: number) {
  if (val > 4.5) return '#f56c6c'
  if (val > 4.0) return '#e6a23c'
  return '#06b6d4'
}

function getSpeedClass(val: number) {
  if (val > 1600) return 'text-red-400'
  if (val > 1550) return 'text-yellow-400'
  return 'text-emerald-400'
}

function getSpeedColor(val: number) {
  if (val > 1600) return '#f56c6c'
  if (val > 1550) return '#e6a23c'
  return '#34d399'
}

// 构建趋势图
function buildChartOption(title: string, nodeId: string, color: string, unit: string) {
  const history = store.dataHistory.get(nodeId) || []
  const data = history.map(h => [h.timestamp, h.value])

  return {
    title: { text: title, textStyle: { color: '#e0e0e0', fontSize: 14 }, left: 'center' },
    tooltip: { trigger: 'axis' as const },
    grid: { left: 60, right: 20, top: 40, bottom: 30 },
    xAxis: {
      type: 'time' as const,
      axisLabel: { color: '#999', formatter: '{HH}:{mm}:{ss}' },
      axisLine: { lineStyle: { color: '#444' } }
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: '#999', formatter: `{value} ${unit}` },
      splitLine: { lineStyle: { color: '#333' } }
    },
    series: [{
      type: 'line',
      data,
      smooth: true,
      lineStyle: { color, width: 2 },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: color + '40' }, { offset: 1, color: color + '05' }] } },
      symbol: 'none'
    }]
  }
}

const tempChartOption = computed(() => buildChartOption('温度趋势', 'temp_sensor', '#67c23a', '°C'))
const pressureChartOption = computed(() => buildChartOption('压力趋势', 'pressure_transmitter', '#06b6d4', 'MPa'))
const flowChartOption = computed(() => buildChartOption('流量趋势', 'flow_meter', '#60a5fa', 'L/min'))

// ===== 异常波动识别 =====
const selectedAnomaly = ref<AnomalyEvent | null>(null)
const fragmentDialogVisible = ref(false)
const configDialogVisible = ref(false)

const localConfig = ref({
  windowSize: store.anomalyConfig.windowSize,
  mutationFactor: store.anomalyConfig.mutationFactor,
  consecutiveThreshold: store.anomalyConfig.consecutiveThreshold,
  cooldown: store.anomalyConfig.cooldown,
  fragmentSize: store.anomalyConfig.fragmentSize
})
const cooldownSeconds = ref(Math.round(store.anomalyConfig.cooldown / 1000))

function openFragment(anomaly: AnomalyEvent) {
  selectedAnomaly.value = anomaly
  fragmentDialogVisible.value = true
}

function applyConfig() {
  localConfig.value.cooldown = cooldownSeconds.value * 1000
  store.anomalyConfig.windowSize = localConfig.value.windowSize
  store.anomalyConfig.mutationFactor = localConfig.value.mutationFactor
  store.anomalyConfig.consecutiveThreshold = localConfig.value.consecutiveThreshold
  store.anomalyConfig.cooldown = localConfig.value.cooldown
  store.anomalyConfig.fragmentSize = localConfig.value.fragmentSize
  configDialogVisible.value = false
  ElMessage.success('检测配置已应用')
}

function resetConfig() {
  localConfig.value = {
    windowSize: 15,
    mutationFactor: 4,
    consecutiveThreshold: 2,
    cooldown: 8000,
    fragmentSize: 30
  }
  cooldownSeconds.value = 8
}

function getAnomalySeverityType(severity: AnomalyEvent['severity']) {
  switch (severity) {
    case 'Critical': return 'danger'
    case 'High': return 'danger'
    case 'Medium': return 'warning'
    case 'Low': return 'info'
  }
}

function getAnomalySeverityLabel(severity: AnomalyEvent['severity']) {
  switch (severity) {
    case 'Critical': return '严重'
    case 'High': return '高'
    case 'Medium': return '中'
    case 'Low': return '低'
  }
}

function formatAnomalyTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })
}

// 关联历史片段趋势图（末位标记突变采样点）
const fragmentChartOption = computed(() => {
  const anomaly = selectedAnomaly.value
  if (!anomaly) return {}
  const data = anomaly.historyFragment.map(h => [h.timestamp, h.value])
  const mutationPoint = data.length ? data[data.length - 1] : null
  return {
    title: { text: `${anomaly.nodeName} - 关联历史片段`, textStyle: { color: '#e0e0e0', fontSize: 14 }, left: 'center' },
    tooltip: { trigger: 'axis' as const },
    grid: { left: 60, right: 30, top: 50, bottom: 40 },
    xAxis: {
      type: 'time' as const,
      axisLabel: { color: '#999', formatter: '{HH}:{mm}:{ss}' },
      axisLine: { lineStyle: { color: '#444' } }
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: '#999' },
      splitLine: { lineStyle: { color: '#333' } }
    },
    series: [{
      type: 'line',
      data,
      smooth: true,
      symbol: 'circle',
      symbolSize: 5,
      lineStyle: { color: '#f59e0b', width: 2 },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: '#f59e0b40' }, { offset: 1, color: '#f59e0b05' }]
        }
      },
      markPoint: mutationPoint ? {
        symbol: 'circle',
        symbolSize: 14,
        data: [{ coord: mutationPoint, value: '突变' }],
        itemStyle: { color: '#ef4444', borderColor: '#fff', borderWidth: 2 },
        label: { show: true, formatter: '突变', color: '#fff', fontSize: 11, position: 'top' }
      } : undefined
    }]
  }
})
</script>

<style scoped>
.data-dashboard {
  height: 100%;
  overflow-y: auto;
  padding: 12px;
}

.section-title {
  font-size: 16px;
  font-weight: bold;
  color: #22d3ee;
  margin-bottom: 12px;
  padding-left: 8px;
  border-left: 3px solid #06b6d4;
}

.gauges-section {
  margin-bottom: 20px;
}

.gauges-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.gauge-card {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gauge-label {
  font-size: 13px;
  color: #94a3b8;
  font-weight: 500;
}

.gauge-value {
  font-size: 28px;
  font-weight: bold;
  font-family: 'Courier New', monospace;
}

.gauge-unit {
  font-size: 14px;
  color: #64748b;
  font-weight: normal;
}

.gauge-quality {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #64748b;
}

.quality-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.quality-good { background: #67c23a; }
.quality-bad { background: #f56c6c; }
.quality-uncertain { background: #e6a23c; }

.pump-indicator {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

.pump-on { color: #67c23a; }
.pump-off { color: #f56c6c; }

.charts-section {
  margin-top: 16px;
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.chart-card {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 8px;
  padding: 12px;
}

.chart {
  height: 220px;
  width: 100%;
}

/* 异常波动识别区域 */
.anomaly-section {
  margin-top: 20px;
}

.anomaly-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.anomaly-title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #f59e0b;
  border-left-color: #f59e0b;
}

.anomaly-stats {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  padding-left: 8px;
}

.anomaly-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.anomaly-item {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 6px;
  padding: 10px 12px;
  border-left: 3px solid #64748b;
}

.anomaly-critical {
  border-left-color: #ef4444;
  background: rgba(239, 68, 68, 0.08);
}

.anomaly-high {
  border-left-color: #f97316;
  background: rgba(249, 115, 22, 0.06);
}

.anomaly-medium {
  border-left-color: #eab308;
  background: rgba(234, 179, 8, 0.05);
}

.anomaly-acknowledged {
  opacity: 0.5;
}

.anomaly-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.anomaly-time {
  font-size: 11px;
  color: #64748b;
  font-family: monospace;
}

.anomaly-item-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.anomaly-node {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.anomaly-node-name {
  font-size: 13px;
  color: #94a3b8;
  font-weight: 500;
}

.anomaly-ratio {
  font-size: 13px;
  color: #f59e0b;
  font-weight: bold;
  font-family: monospace;
}

.anomaly-message {
  font-size: 12px;
  color: #cbd5e1;
}

.anomaly-values {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: monospace;
  font-size: 12px;
}

.value-prev {
  color: #94a3b8;
}

.value-cur {
  color: #f87171;
  font-weight: bold;
}

.anomaly-item-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 4px;
}

.no-anomalies {
  display: flex;
  justify-content: center;
  padding-top: 24px;
}

/* 关联历史片段弹窗 */
.fragment-chart {
  height: 280px;
  width: 100%;
}

.fragment-tip {
  margin-top: 8px;
  font-size: 12px;
  color: #64748b;
  text-align: center;
}

:deep(.fragment-dialog) {
  --el-dialog-bg-color: rgba(30, 41, 59, 0.98);
}

:deep(.fragment-dialog .el-dialog__title),
:deep(.fragment-dialog .el-dialog__body) {
  color: #e2e8f0;
}

:deep(.fragment-dialog .el-descriptions__label) {
  background: #1f2937 !important;
  color: #94a3b8 !important;
}

:deep(.fragment-dialog .el-descriptions__content) {
  color: #e2e8f0 !important;
}

/* 配置对话框样式 */
:deep(.config-dialog) {
  --el-dialog-bg-color: rgba(30, 41, 59, 0.98);
}

:deep(.config-dialog .el-dialog__title),
:deep(.config-dialog .el-dialog__body) {
  color: #e2e8f0;
}

:deep(.config-dialog .el-form-item__label) {
  color: #94a3b8;
}

.form-tip {
  display: block;
  font-size: 11px;
  color: #64748b;
  margin-top: 4px;
}

.anomaly-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 1200px) {
  .gauges-grid { grid-template-columns: repeat(2, 1fr); }
  .charts-grid { grid-template-columns: 1fr; }
}
</style>
