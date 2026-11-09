# CLASS × LIFECOURSE — 社会阶层与生命周期的跨学科耦合模型

互动式知识图谱：4 个生命阶段 × 3 个社会阶层 = 12 个矩阵单元格，
背后是 **397 个理论节点、726 条带类型与证据等级的边**。全部界面与内容为简体中文。

## 两种打开方式

### A. 单文件版（可分享，推荐）

`dist/class-lifecourse-matrix.html`（约 3.2 MB）—— 所有 JS/CSS/three.js 全部内嵌，
**双击即可用，无需服务器**，可直接 AirDrop / 微信 / 邮件发送。

重新构建（改了任何源码后跑一次）：

```bash
python3 build_dist.py
```

构建脚本会把 `lib/three.core.min.js` 与 `lib/three.module.min.js` 自动「去模块化」
（剥 `export{}`、把 `import{}` 改写成对 core 导出的引用），拼成 `window.THREE` 再内联。

### B. 多文件开发版（需 HTTP 服务）

```bash
cd class-lifecourse-matrix
python3 -m http.server 8642
# 开启 http://localhost:8642/
```

hash 直连：`/#matrix`、`/#graph`、`/#graph:节点id`、`/#deep`、`/#bounds`、`/#data`。
（注意 file:// 打不开多文件版——three 以 ES module 载入会被 CORS 挡，用单文件版。）

## 图谱交互

- **3D 力导向**：拖动旋转 / 滚轮缩放 / 拖节点重排；张力边带方向粒子
- **着色模式**：学科 / 谱系(school) / 阶级×阶段（选格位点亮其理论，按谱系着色）
- **搜索**：下拉结果列表，匹配 `cn`/`en`/`scholar`/`school`/`work`/`aka`（含中文译名，
  搜「加缪」「荣格」「弗洛伊德」均可）；点结果 → 点亮其整个知识谱系 + 相机聚焦
- **节点点击** → 详情面板（detail 详解 + SOURCES 原文链接，跳转前有确认弹窗防误触）；
  卡头徽章显示 学科 / 谱系及规模 / 奠基文本（谱系内最早年份自动推断）/ 关系数
- **谱系脉络**：面板内可展开，沿 `genealogy` 边双向追溯全链，按年份排序，点击跳节点
- **维基浮窗**：「维基 ⇗」联网查 zh.wikipedia 摘要（aka→en→work→scholar 依次尝试），
  圆角浮卡显示，⛶ 可放大；未命中给搜索兜底，外链统一走确认 modal
- **详情面板里的每个理论名都可点** → 图中居中该节点；标题点击 = 居中自己
- **边点击** → 面板显示机制说明 + 相机居中两端中点；面板里两端理论名同样可点
- **工具列可隐藏**（右上角「隐藏 ▾」，左上有 ☰ 重新展开）
- **未命中节点三态**：`淡化`（默认，变暗保留上下文）/ `隐藏`（从图数据中移除）/ `正常`（不淡化）
- **效能**：大图默认懒加载文字标签——只有被点亮的节点显示标签，「标签」键全开；
  warmup 完成后引擎自动停转
- `◎ 置中` 一键 zoomToFit；`重置高亮` 还原

## 定位问卷（定位 QUIZ）

`/#quiz` 把「自我定位」做成问卷 → 打分 → 定位报告 → 图谱点亮的闭环：

- **短问卷 8 题**：年龄段 / 本人学历 / 父母学历 / 职业类型 / 主观阶层阶梯(MacArthur 1–10) /
  性别 / 压力域多选 / 诉求；**深问卷 +4 题**：童年经济 / 近一年大事 / 工作状态 / 育儿
- **打分**：SES 由学历+父母学历+职业+阶梯加权合成 → 高斯权重映射到 c1/c2/c3；
  每个节点按 stages 命中×3 + 阶级加权×3 + domain 命中×2 + 性别加减分排序
- **报告**：`阶段 × 阶级` 定位卡 + 该格 mech/out 解读 + 三栏
  （困住你的结构 / 你正处的转折点 / 破局杠杆=lever:1 节点）
- **「在图谱中查看」**：点亮 top-30 命中节点，未命中节点按工具列三态处理；
  报告每项可点 → 图中居中
- **人生型格（32 型）**：SES 轴(蓄能E/负重P) × 诉求轴(向外A/向内R) × 压力域轴(现实W/内在I)
  × 生命时期(萌芽s1/拔节s2/破浪s3/归航s4) = 32 型，如 `PAW-S3 破浪期·破局者`；
  头像为 DiceBear open-peeps 预生成 SVG（`mascots.js`，离线可用）
- **分享**：canvas 手绘 900×1200 分享卡 → 下载 PNG；或复制定位文案到剪贴板

## 主题与 UI

- 设计系统用 **Pico CSS v2.0.6**（`lib/pico.min.css`，MIT）负责表单/按钮语义样式；
  自定义 CSS 变量层负责暖色系皮肤（`--bg/--txt/--accent/--shadow` 等）
- **暖色治愈系色板**：light 默认 = 米白纸底 + 赭石主色；dark = 暖炭棕 + 杏色。
  标题用衬线（Songti/Noto Serif）拉人文感，正文系统 sans，mono 仅用于 ID/统计
- 导航最右 `◐` 切换明暗，记忆于 localStorage；3D 画布与图控面板固定暖深色
- 封面 hero 用 **Trianglify**（`lib/trianglify.min.js`，MIT）生成暖色三角网格，
  随主题切换重绘，seed 固定保证一致性
- **进入页**：首次打开显示全屏 cover（trianglify 底 + 悬浮光斑 + 衬线标题），
  「推开这扇门」CTA 穿门动画进入问卷；「主线论述」「边界与局限」
  两个次级入口也在此。带 hash 的直链（#graph 等）跳过封面
- 主导航只保留 定位/矩阵/图谱 三项；#deep #bounds #data 视图经封面或 hash 可达

## 档案结构

| 档案 | 说明 |
|---|---|
| `index.html` | 版壳与样式；ES module 载入 three@0.179 设全域 `THREE`，再动态载入依赖 |
| `app.js` | 视图层（ForceGraph3D 交互、着色、谱系搜索、详情面板、modal） |
| `data.js` | 主资料库：meta、stages、classes、cells、edges、deepdives、boundaries |
| `nodes_*.js` | 各学科理论节点（soc/dev/econ/psy/pol/exi/anth/bio/fam，共 9 档，397 节点） |
| `edges_new_a.js` / `edges_new_b.js` | 2024 扩充批次的边来源（**已合并进 data.js**，仅作 provenance 存档，页面不载入） |
| `citations.js` | OpenAlex 被引数（仅收录人工核对过的可靠匹配） |
| `build_dist.py` | 单文件打包脚本 |
| `dist/class-lifecourse-matrix.html` | 打包产物（勿手改） |
| `lib/` | 3d-force-graph 1.80.2、three.core/module r179、three-spritetext、pico.min.css 2.0.6、trianglify 4.1.1（MIT/BSD） |
| `fetch_citations*.py` | OpenAlex 引文抓取脚本（有速率限制，见下） |

## 资料 schema

### 理论节点（nodes_*.js → DB.theories）

```js
{ id, cn, en, scholar, disc, core, ref?, school?, work?, year?, aka?, detail, links,
  stages?, classes?, domains, lever, gender? }
```

- `id`：全域唯一 snake_case
- `disc`：学科代码（soc/dev/econ/psy/pol/exi/anth/bio/fam）
- `school`：学派/脉络——谱系着色与谱系搜索的分组键
- `core`：核心理论 summary；`ref`：代表作/出处
- `aka`：常见简体中文译名/别名（空格分隔），搜索用
- `detail`：300–600 字详解（核心概念、实证、与相连理论的关系、适用边界）
- `links`：`[{t, u}]` 经查证的外部链接（DOI/出版社页），点击前弹确认 modal
- 问卷打标字段（397/397 已全标）：
  - `stages`：适用生命阶段子集 `["s1".."s4"]`，**省略 = 全阶段普适**
  - `classes`：适用阶层子集 `["c1".."c3"]`，**省略 = 全阶层普适**
  - `domains`：解释的生活域 1–3 个，取自 `money|work|family|health|meaning|relation|mobility`，必填
  - `lever`：`1` = 含个体可操作的能动/破局机制，`0` = 纯结构/描述（397 节点中 53 个为 1）
  - `gender`：`"f"|"m"` 仅标单一性别经验理论（17 个），其余省略

### 边（DB.edges）

```js
{ f, t, type, label, m, ev, s }
```

- `type`：`coupling` 耦合 / `tension` 张力 / `genealogy` 谱系 / `produces` 产出 / `operationalizes` 操作化
- `ev`：`emp` 实证 / `obs` 观察支持 / `fw` 理论推导 / `nat` 自然延伸 / `spec` 推测
- `s`：关系强度（旧边 3–5，扩充边 1–3）；`m`：150–230 字机制说明，回答「为什么这两个理论连」

### 矩阵单元格（DB.cells）

```js
{ stage, cls, theories:[id...], mech, out }
```

- `stage`：`s1`–`s4`；`cls`：`c1`–`c3`；`theories` 引用节点 id

## 引文数据的注意事项

- `citations.js` **只收录经人工核对的 OpenAlex 匹配**（目前 lancy/geertz/levinson 三笔）。
- title.search 容易错配（如 SDT 匹配到 Deci & Ryan），未收录 ≠ 被引数为 0。
- OpenAlex 匿名请求约 10 req/s 即被 429；结果必须逐笔核对 `oa_title` 才能入库。

## 验证

```bash
# 语法检查
for f in nodes_*.js data.js app.js; do node --check "$f"; done

# 结构检查（重复 id、悬空边/格引用、非法 type/ev、孤立节点）
node -e "
global.window={};const fs=require('fs');
for (const f of fs.readdirSync('.').filter(f=>/^nodes_/.test(f))) eval(fs.readFileSync(f,'utf8'));
const DB=eval(fs.readFileSync('data.js','utf8')+';DB');
const linked=new Set(DB.edges.flatMap(e=>[e.f,e.t]));
console.log('orphans:',DB.theories.filter(t=>!linked.has(t.id)).length);
console.log('dangling:',DB.edges.filter(e=>!DB.theories.some(t=>t.id===e.f)||!DB.theories.some(t=>t.id===e.t)).length);"

# 单文件冒烟
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --user-data-dir=/tmp/clmtest --window-size=1500,900 --virtual-time-budget=20000 \
  --screenshot=out.png "file:///绝对路径/dist/class-lifecourse-matrix.html#graph"
```

## 内容政策

- 简体中文为唯一界面/内容语言（`detail`/`m`/`label` 统一 t2s 转换过）。
- 新增节点必须带 `detail`（300–600 字，说明理论+机制+实证+相连理由+边界）、
  `links`（web_search 查证过的真实 URL，禁编造）、`aka`（中文译名）。
- 新增边必须写 `m`（150–230 字解释两边为何相连），type/ev 用既有枚举。
