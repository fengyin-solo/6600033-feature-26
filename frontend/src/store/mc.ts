import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface ParamInfo {
  value: number
  label: string
  meaning: string
  recommended: string
  scenario: string
  caution?: string
}

export interface MCScenario {
  id: string
  name: string
  description: string
  params: Record<string, ParamInfo>
  category: string
  recommendedIterations: string
  useCase: string
}

export interface MCResult {
  scenario: string
  iterations: number
  estimate: number
  trueValue?: number
  error?: number
  samples: number[]
  convergence: number[]
}

export interface HypTestResult {
  testType: string
  statistic: number
  pValue: number
  significant: boolean
  alpha: number
  df?: number
}

function normalRandom(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

function runMC(scenario: MCScenario, n: number): MCResult {
  const samples: number[] = []
  const convergence: number[] = []

  if (scenario.id === 'pi') {
    let inside = 0
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 2 - 1, y = Math.random() * 2 - 1
      if (x * x + y * y <= 1) inside++
      samples.push(x * x + y * y <= 1 ? 1 : 0)
      convergence.push((inside / (i + 1)) * 4)
    }
    const estimate = (inside / n) * 4
    return { scenario: 'pi', iterations: n, estimate, trueValue: Math.PI, error: Math.abs(estimate - Math.PI), samples, convergence }
  }
  if (scenario.id === 'brownian') {
    let pos = 0
    const dt = scenario.params.dt?.value || 0.01
    for (let i = 0; i < n; i++) { pos += normalRandom() * Math.sqrt(dt); samples.push(pos) }
    convergence.push(...samples.slice(0, 200))
    return { scenario: 'brownian', iterations: n, estimate: pos, samples, convergence }
  }
  if (scenario.id === 'option') {
    const S0 = scenario.params.S0?.value || 100
    const K = scenario.params.K?.value || 105
    const r = scenario.params.r?.value || 0.05
    const sigma = scenario.params.sigma?.value || 0.2
    const T = scenario.params.T?.value || 1
    let payoffSum = 0
    for (let i = 0; i < n; i++) {
      const ST = S0 * Math.exp((r - 0.5 * sigma * sigma) * T + sigma * Math.sqrt(T) * normalRandom())
      const p = Math.max(ST - K, 0); payoffSum += p; samples.push(p)
      if ((i + 1) % 50 === 0) convergence.push((payoffSum / (i + 1)) * Math.exp(-r * T))
    }
    return { scenario: 'option', iterations: n, estimate: (payoffSum / n) * Math.exp(-r * T), samples, convergence }
  }
  if (scenario.id === 'random_walk') {
    let pos = 0
    for (let i = 0; i < n; i++) { pos += Math.random() > 0.5 ? 1 : -1; samples.push(pos) }
    convergence.push(...samples.slice(0, 200))
    return { scenario: 'random_walk', iterations: n, estimate: pos, samples, convergence }
  }
  if (scenario.id === 'diffusion') {
    const D = scenario.params.D?.value || 1
    const dt = scenario.params.dt?.value || 0.01
    let x = 0, y = 0
    for (let i = 0; i < n; i++) {
      x += normalRandom() * Math.sqrt(2 * D * dt); y += normalRandom() * Math.sqrt(2 * D * dt)
      samples.push(Math.sqrt(x * x + y * y))
    }
    convergence.push(...samples.slice(0, 200))
    return { scenario: 'diffusion', iterations: n, estimate: Math.sqrt(x * x + y * y), samples, convergence }
  }
  // gambler
  const p = scenario.params.p?.value || 0.45
  const bankroll = scenario.params.bankroll?.value || 50
  const goal = scenario.params.goal?.value || 100
  let ruinCount = 0
  for (let i = 0; i < n; i++) {
    let money = bankroll
    let steps = 0
    while (money > 0 && money < goal && steps < 10000) { money += Math.random() < p ? 1 : -1; steps++ }
    if (money <= 0) ruinCount++
    samples.push(money <= 0 ? 0 : 1)
    convergence.push(ruinCount / (i + 1))
  }
  return { scenario: 'gambler', iterations: n, estimate: ruinCount / n, samples, convergence }
}

export const SCENARIOS: MCScenario[] = [
  {
    id: 'pi',
    name: '圆周率π估算',
    description: '随机投点估算π值，观察收敛过程',
    useCase: '适合理解蒙特卡洛核心思想、演示大数定律、教学演示',
    recommendedIterations: '1000-5000次（精度与√n成正比）',
    params: {},
    category: '基础'
  },
  {
    id: 'brownian',
    name: '布朗运动模拟',
    description: '粒子热运动随机路径模拟',
    useCase: '物理过程模拟、金融资产价格路径生成、随机过程教学',
    recommendedIterations: '500-2000次（观察单条路径）',
    params: {
      dt: {
        value: 0.01,
        label: '时间步长',
        meaning: '每一步模拟的时间间隔，决定路径的光滑程度',
        recommended: '0.001-0.1',
        scenario: 'dt越小路径越光滑但计算量越大；dt过大时路径呈锯齿状且可能不符合物理意义',
        caution: 'dt > 0.1 会导致数值不稳定，建议 dt ≤ 0.05'
      }
    },
    category: '物理'
  },
  {
    id: 'option',
    name: '欧式期权定价',
    description: 'Black-Scholes期权价格蒙特卡洛估算',
    useCase: '金融衍生品定价、风险价值(VaR)计算、复杂期权估值',
    recommendedIterations: '2000-5000次（金融定价需要更高精度）',
    params: {
      S0: {
        value: 100,
        label: '标的当前价格',
        meaning: '期权合约标的资产（如股票）的当前市场价格',
        recommended: '50-200',
        scenario: 'S0远低于K时值为深度虚值期权，S0远高于K时为深度实值期权'
      },
      K: {
        value: 105,
        label: '行权价格',
        meaning: '期权合约约定的未来买入/卖出标的资产的价格',
        recommended: '80-150',
        scenario: 'K ≈ S0 时为平值期权，gamma风险最大；K与S0偏离越大，期权时间价值越小'
      },
      r: {
        value: 0.05,
        label: '无风险利率',
        meaning: '资金的时间价值，通常取国债收益率或银行同业拆借利率',
        recommended: '0.01-0.10（1%-10%）',
        scenario: '利率上升时看涨期权价值上升，看跌期权价值下降；r为年化利率'
      },
      sigma: {
        value: 0.2,
        label: '波动率',
        meaning: '标的资产收益率的年化标准差，衡量价格波动程度',
        recommended: '0.1-0.5（10%-50%）',
        scenario: '低波动(10%-20%): 成熟大盘股；中波动(20%-40%): 科技股；高波动(>40%): 加密货币、小盘股',
        caution: '波动率是期权定价最敏感的参数，输入历史波动率还是隐含波动率需要明确'
      },
      T: {
        value: 1,
        label: '到期时间(年)',
        meaning: '从当前日期到期权到期日的时间长度，以年为单位',
        recommended: '0.25-5.0（3个月到5年）',
        scenario: '短期期权(T<0.5)时间价值衰减快；长期期权时间价值高但对利率更敏感'
      }
    },
    category: '金融'
  },
  {
    id: 'random_walk',
    name: '随机游走',
    description: '一维离散随机游走轨迹模拟',
    useCase: '股票价格对数收益模拟、醉汉问题、马尔可夫链演示',
    recommendedIterations: '500-2000次',
    params: {},
    category: '基础'
  },
  {
    id: 'diffusion',
    name: '粒子扩散',
    description: '二维粒子随机扩散位移分析',
    useCase: '污染物扩散模拟、液体中分子布朗运动、热传导过程',
    recommendedIterations: '500-2000次',
    params: {
      D: {
        value: 1,
        label: '扩散系数',
        meaning: '描述粒子扩散速率的物理常数，单位为长度²/时间',
        recommended: '0.1-10',
        scenario: '气体中D≈10⁻⁵ m²/s，液体中D≈10⁻⁹ m²/s，可调整观察扩散速度差异'
      },
      dt: {
        value: 0.01,
        label: '时间步长',
        meaning: '每一步模拟的时间间隔，与D共同决定每步位移大小',
        recommended: '0.001-0.1',
        scenario: '均方位移 <x²> = 4Dt，可通过改变D和dt验证该关系'
      }
    },
    category: '物理'
  },
  {
    id: 'gambler',
    name: '赌徒破产',
    description: '不利赌局下资金耗尽概率估算',
    useCase: '风险管理、破产概率计算、久赌必输原理演示、赌博成瘾教育',
    recommendedIterations: '1000-3000次（需足够多样本估计概率）',
    params: {
      p: {
        value: 0.45,
        label: '单次胜率',
        meaning: '每一局赌博中获胜的概率',
        recommended: '0.40-0.55',
        scenario: 'p < 0.5: 不利赌局，长期必然破产；p = 0.5: 公平赌局，破产概率 = 1 - bankroll/goal；p > 0.5: 有利赌局，存在安全策略',
        caution: 'p < 0.4 时破产概率极高，p > 0.55 时破产概率极低，极端值会失去教学意义'
      },
      bankroll: {
        value: 50,
        label: '初始资金',
        meaning: '赌徒开始时拥有的资金量',
        recommended: '20-200',
        scenario: '初始资金越多，在不利赌局中存活时间越长，但最终破产概率仍随局数增加而趋近于1'
      },
      goal: {
        value: 100,
        label: '目标资金',
        meaning: '赌徒决定停止赌博的盈利目标',
        recommended: 'bankroll的1.5-5倍',
        scenario: 'goal越大，达到目标的概率越低；当goal→∞时，不利赌局破产概率→1'
      }
    },
    category: '概率'
  }
]

export const useMCStore = defineStore('mc', () => {
  const currentScenario = ref<MCScenario>(SCENARIOS[0])
  const iterations = ref(1000)
  const result = ref<MCResult | null>(null)
  const testResult = ref<HypTestResult | null>(null)
  const isRunning = ref(false)

  function runSimulation() {
    isRunning.value = true
    setTimeout(() => { result.value = runMC(currentScenario.value, iterations.value); isRunning.value = false }, 10)
  }

  function runTest(g1: number[], g2: number[]) {
    const n1 = g1.length, n2 = g2.length
    const m1 = g1.reduce((a, b) => a + b, 0) / n1
    const m2 = g2.reduce((a, b) => a + b, 0) / n2
    const v1 = g1.reduce((s, x) => s + (x - m1) ** 2, 0) / (n1 - 1)
    const v2 = g2.reduce((s, x) => s + (x - m2) ** 2, 0) / (n2 - 1)
    const se = Math.sqrt(v1 / n1 + v2 / n2)
    const t = (m1 - m2) / se
    const df = Math.round((v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1)))
    const pValue = 2 * (1 - Math.min(0.9999, Math.abs(t) / (Math.abs(t) + Math.sqrt(df))))
    testResult.value = { testType: 'Welch T检验', statistic: Math.round(t * 1000) / 1000, pValue: Math.round(pValue * 10000) / 10000, significant: pValue < 0.05, alpha: 0.05, df }
  }

  function setScenario(s: MCScenario) { currentScenario.value = s; result.value = null }

  function updateParam(key: string, value: number) {
    if (currentScenario.value.params[key]) {
      currentScenario.value.params[key].value = value
      result.value = null
    }
  }

  const convergenceData = computed(() => {
    if (!result.value) return [] as [number, number][]
    return result.value.convergence.slice(0, 200).map((v, i): [number, number] => [i, Math.round(v * 100000) / 100000])
  })

  const histogramData = computed(() => {
    if (!result.value) return { xAxis: [] as number[], data: [] as number[] }
    const s = result.value.samples.slice(0, 1000)
    const mn = Math.min(...s), mx = Math.max(...s)
    const bins = 20, bs = (mx - mn) / bins || 1
    const counts = new Array(bins).fill(0)
    s.forEach(v => { counts[Math.min(bins - 1, Math.floor((v - mn) / bs))]++ })
    return { xAxis: Array.from({ length: bins }, (_, i) => Math.round((mn + i * bs) * 100) / 100), data: counts }
  })

  return { currentScenario, iterations, result, testResult, isRunning, convergenceData, histogramData, runSimulation, runTest, setScenario, updateParam }
})
