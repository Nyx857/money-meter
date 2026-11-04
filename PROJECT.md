# PROJECT.md — 工程交接说明

给"下一个会话 / 下一个接手的人"看的。README.md（英文）是给外人看的介绍，README.zh.md 是完整使用说明，**这份是改代码前必须读的那份**。

---

## 1. 一句话

月薪 → 每秒进账的实时看板，按**班次**计（跨零点算同一班），支持预设加班时段与倍率、法定节假日 3×、多段不计薪休息、上 N 休 M 循环排班、按天补录记录、自动积累的「足迹」历史、配置导出/导入，外加一个 4% 法则的「自由」视图。单文件网页，无依赖无构建。

- 线上：https://money-meter.pages.dev
- 仓库：https://github.com/Nyx857/money-meter （Public，main）
- 部署：Cloudflare Pages，**push 自动部署**，约 1 分钟
- 当前版本：**v1.4.2**（版本号和更新日志在 `APP_VERSION` / `CHANGELOG`，设置里的「更新」页直接渲染）

## 2. 技术形态

| 项 | 值 |
| --- | --- |
| 入口 | `index.html`（全部 HTML/CSS/JS 内联，约 140KB） |
| 依赖 | 无。没有 package.json、没有构建步骤 |
| 离线 | `sw.js` Service Worker：导航网络优先（900ms 超时）回退干净缓存，静态资源缓存优先 |
| 存储 | localStorage，key = `money-meter.v3`；含 cfg / dayFlags / history / recordStart；SW 缓存名 `money-meter-<版本>` |
| 后端 | 无。纯静态，不联网 |

## 3. 文件地图

```
index.html          全部界面和逻辑（改这里 90% 的情况就够了）
sw.js               Service Worker：缓存页面/图标，桌面冷启动秒开，支持离线
manifest.json       PWA 配置（加主屏）
icon.svg / *.png    图标
_headers            Cloudflare 缓存策略（只给图标长缓存）
README.md           英文介绍（GitHub 首页展示）
README.zh.md        中文完整说明
PROJECT.md          本文件
shots/              文档截图（不影响线上页面）
start.command       macOS 本地起服务 + 终端二维码（手机同 Wi-Fi 调试用）
tools/qr.swift      终端二维码生成（start.command 调用）
tools/shot.swift    WKWebView 真渲染截图 + 控制台探针（自检用）
tests/core.test.mjs 计薪内核单元测试（276 项）
```

## 4. 代码结构（都在 index.html 的单个 `<script>` 里）

```
// ==== CORE:START ====  ← 纯函数，被 tests/core.test.mjs 抽取执行，不能碰 DOM
// ==== CORE:END ====
状态与存储 → load()/save()，state = {cfg, dayFlags, mode, firstRun}
DOM 引用  → el = {...}
render()  → 每帧一次（rAF），按 state.mode 分支
交互      → 加班/不上班/节假日按钮、倍率 chips、tab、分享、设置面板
记录      → recentRecordKeys() / recordStatus() / recordFlagFor()（CORE 纯函数）
足迹      → snapshotDay() 每班结束存一条；ensureHistory() 从最后一条快照之后增量补记；dropHistory() 改标记立即重算；historyLive() 算当前这一班（跨零点挂昨天）；historyTotals()/heatmapCells() 汇总
排班      → isWorkdayAt() 按 cfg.schedule 走 workweek 或 cycle；循环用 isCycleWorkday() / cycleAvgDays()
备份      → encodeBackup() / decodeBackup()（CORE 纯函数，导入走 normalizeCfg / normalizeDayFlags）
版本      → APP_VERSION + CHANGELOG → renderChangelog()
设置分类  → setSheetPane()：班次 / 加班 / 自由 / 数据 / 更新，未读版本用 localStorage 的 money-meter.seenVersion
视口高度  → trackViewportHeight() 写 --vh100（visualViewport 优先），兼容不支持 dvh 的旧 WebView
```

**`CORE:START/END` 两个注释标记不能删**，测试靠它切出代码块。

## 5. 核心不变量（改代码前必须遵守）

1. **一切以班次为单位**：`shiftDayFor()` 决定"现在是哪一班"。跨零点时，凌晨 1 点仍属于昨天那一班，直到下班（含加班）结束。
2. **加班只算班次之外的时间**：`shiftSegments()` 给出班次内的计薪区间，`otSec()` 会扣掉与之重叠的部分，避免重复计。
3. **休息时段两边都扣**：落在班次内扣工资（`shiftSegments`），落在加班时段内扣加班费（`breakRanges`）。默认 17:30–18:00 就属于后者（4h → 3.5h）。
4. **上班天数只算"已经开工"的班次**：`now >= shiftStartTs(...)` 才算。否则清早会显示"上班 3 天挣了 2 天的钱"（v1.1 修的就是这个）。
5. **展示的数字必须同口径**：不要拿"出勤天数"和"等效工资天数"直接比。汇总句只讲单一变量，例如"加班多挣 ¥301.72，等于 1.31 天工资"。
6. **自由视图的公式**：自由线 = 月支出 × 12 × 25（4% 法则）；年限用月复利年金公式解 n，`monthsToFI(cfg, saveDelta, expenseDelta)` 的三个参数分别支持"多存/少花"的假设推演。
7. **分享文案跟视图走**：`buildShare()` 按 `state.mode` 返回四套文案，按钮文案也要同步（`shareLabel`）；节假日单列一套，不能显示成"双倍"。
8. **法定节假日整班 ×`otHoliday`**：`shiftMoney()` 里 holiday 分支直接返回，不再叠加普通工资；`f.off` 优先于 `f.holiday`；周末节假日必须同时有 `worked` 才算上班。
9. **导入一律走校验**：`decodeBackup()` 负责 JSON 解析、字段白名单、数值夹取、日期合法性、`off` 互斥、老版本 `lunch*` → `breaks` 迁移。不要在 UI 里直接 `Object.assign(state.cfg, 粘贴对象)`。**不含足迹的老备份（v3/v4）不能清空本机 `history`/`recordStart`**，只有备份本身带足迹时才整体覆盖。
10. **多段休息是唯一形态**：`cfg.breaks` 数组，旧的 `lunchEnabled/lunchStart/lunchEnd` 只在 `breaksFromCfg()` 迁移时出现，不要在新代码里读。
11. **记录补录要跟班次类型对得上**：工作日才能补加班/请假，休息日才能补"休息日上班"，周末补节假日自动带 `worked`。
12. **排班只走 `isWorkdayAt()`**：`cfg.schedule` 是 `week` 时看 `workweek`，是 `cycle` 时看 `cycleWork/cycleRest/cycleStart`。月度统计、状态、记录校验都调用它，不要各自判断星期。
13. **循环位置用天数编号算**：`dayNumber()` 取 UTC 年月日，避免夏令时让某天变 23/25 小时；`((diff % len) + len) % len` 处理锚点之前的日期。
14. **发版要改两处**：`APP_VERSION` 和 `CHANGELOG` 顶部（版本号 / 日期 / 内容）。设置里的更新日志直接渲染这个数组，不要另写一份 HTML。
15. **主界面必须一屏放下**：`.app` 用 `100dvh` + `space-between`，间距/字号用 `clamp(..., vh, ...)` 随视口高度收缩；只在极短屏隐藏次要信息（页脚、四格补充行、自由视图第二段）。加固定高度模块前先在 393×568 / 360×640 / 393×700 / 393×852 四个尺寸量一遍。
16. **设置按分类放**：`.pane[data-pane]` 五个页面，新增设置项放进对应 pane，不要重新堆成一条长表；保存按钮只在可编辑页显示。更新日志只出现在「更新」页，不要复制到别处。
17. **未读版本逻辑**：`money-meter.seenVersion` 与 `APP_VERSION` 不同且不是首次使用时，齿轮亮小圆点，打开设置默认落在「更新」页；进入该页就写 seen。首次使用（firstRun）在启动时静默写 seen，避免新用户刚设置完就被提示更新。
18. **字号有下限**：主界面正文/标签不低于 11px，设置说明不低于 12px；屏幕矮的时候优先隐藏次要块（页脚、四格补充行、进度条、四格），不要把字缩到 9–10px。
19. **视口高度不要写死**：`html/body` 锁死滚动（`overflow:hidden`），`.app` 用 `--vh100` → `100dvh` → `100vh` 的兜底链，JS 用 `visualViewport.height` 更新。
20. **足迹快照只写一次**：`snapshotDay()` 只对「已结束 + 有收入 + kind != none」的班次生成快照，金额按**生成时**的 cfg 结算；之后改月薪/排班不会改写历史，只有改某天标记才 `dropHistory()` 重算那一天。否则「个人记录」会随配置漂移。`dropHistory()` 必须**删掉后立即重算**，不能只删——增量补记只从最后一条快照之后扫，中间日期删了就永远补不回来。
21. **足迹从 `recordStart` 开始**：首次初始化设为本月 1 号；`ensureHistory()` 没有快照时从它开始补，之后从**最后一条快照的次日**增量补记到已结束的班次（单次最多 1830 天，超长空档下一分钟接着补）。不要用自然年或全量回溯，否则新用户会看到一大段伪造历史；也不要每次都从 `recordStart` 重扫，历史超过 400 天后会扫不到今天。
22. **热力图要跟着数据走**：`hmSig` 里必须带 `historyRev`，否则改完某天标记后快照金额变了、但格子数没变，会继续显示旧格子。
23. **安全区会吃掉高度**：刘海机 `safe-t/safe-b` 可能吃掉 80px，按视口高度写的 media query 会误判。主界面改用 `updateAppOverflow()`：从无到有逐级加 `fit-1…fit-9`（页脚→四格补充→总结→进度条→工时行→收间距→说明卡→四格→加班提示），每加一级重新量 `scrollHeight`，全加完还不够才允许 app 内部滚动。不要再用 `@media (max-height)` 隐藏主界面块。

## 6. 数据结构

`state.history`（足迹快照，key 为班次日）：

```js
{ "2026-11-04": { amount: 380.75, sec: 41400, otSec: 12600, otAmount: 150.86 } }
```

`state.recordStart`：开始记录的日期（首次初始化 = 本月 1 号），例如 `"2026-11-01"`。
备份结构升到 `{ v: 5, cfg, dayFlags, recordStart, history }`；导入 v3/v4 老备份会迁移，足迹为空时按导入的 cfg 补记本月。

`state.cfg`（用户配置）：

| 字段 | 含义 | 默认 |
| --- | --- | --- |
| salary / workDays | 月薪 / 月计薪天数 | 5000 / 21.75 |
| workStart / workEnd | 上班 / 下班（"HH:MM"，end ≤ start 即跨零点） | 09:00 / 17:00 |
| breaks | 不计薪休息，数组，最多 6 段；可跨零点 | `[{start:"17:30", end:"18:00"}]` |
| schedule | 排班方式：`week` 按星期 / `cycle` 上 N 休 M | "week" |
| workweek | 按星期模式下上班的星期，`getDay()` 数字数组（0=周日） | [1,2,3,4,5] |
| cycleWork / cycleRest | 上几天 / 休几天（cycle 模式） | 4 / 1 |
| cycleStart | 循环起始日 `YYYY-MM-DD`，这天算第 1 个上班日 | "2026-01-05"（UI 切到 cycle 时默认今天） |
| otStart / otEnd | 固定加班时段 | 17:00 / 21:00 |
| otWeekday / otWeekend / otHoliday | 倍率 | 1.5 / 2 / 3 |
| payday | 发薪日 1–31 | 15 |
| monthExpense / saved / returnRate | 月支出 / 已存 / 年化%（自由视图） | 2500 / 0 / 5 |

`state.dayFlags`（按天的标记，key 为 `YYYY-MM-DD` 班次日）：

```js
{ "2026-11-04": { off: true },                    // 请假
  "2026-11-05": { ot: true, mult: 1.5 },          // 加班（mult 可省，默认按星期取）
  "2026-11-06": { holiday: true },                // 法定节假日，整班按 otHoliday
  "2026-11-07": { worked: true, mult: 2 },        // 休息日上班，整班按倍率
  "2026-11-08": { holiday: true, worked: true } } // 节假日落在周末：仍然要上班
```

备份文件结构：`{ v: 5, cfg, dayFlags, recordStart, history }`。`v` 是**配置结构版本**（v3 = 单段 `lunch*`，v4 = `breaks`，v5 = 带足迹），跟 localStorage key `money-meter.v3` 不是一回事；导入 v3/v4 会自动迁移，老备份没有足迹时保留本机已有的 history。

## 7. 改代码的标准流程

```bash
cd "/Volumes/SysExt/DeepSeek Harness/money-meter"

# 1. 改 index.html
# 2. 跑内核测试（必须全绿）
node tests/core.test.mjs

# 改 cfg 数据结构时：迁移写进 normalizeCfg()/breaksFromCfg()，
# 并在 tests 里补「老配置/老备份仍能读」的用例；localStorage key 不要轻易升版本。

# 发版时：改 APP_VERSION、在 CHANGELOG 顶部加一条（版本号 / 日期 / 内容），
# 同步升 sw.js 里的 VERSION（缓存名）；然后同步 README 与 PROJECT 的版本号和测试数。
# SW 是缓存优先：新版本会在下一次打开时生效，属预期。

# 3. 视觉/交互自检（可选但推荐）：真渲染截图 + 控制台探针
python3 -m http.server 8782 --bind 127.0.0.1 &
xcrun swift tools/shot.swift "http://127.0.0.1:8782/" /tmp/x.png 393 852 '<你的探针 JS>'
# 探针读 document.title 输出 JSON，能同时验证文本内容和 window.__errs

# 4. 提交并上线
git add -A && git commit -m "fix: xxx" && git push
# Cloudflare 自动部署，约 1 分钟后 curl 验证：
curl -s https://money-meter.pages.dev/ | grep -c "<新加的标志字符串>"
```

## 8. 部署配置（Cloudflare Pages）

| 项 | 值 |
| --- | --- |
| 框架预设 | None |
| 构建命令 | 空 |
| 输出目录 | `/` |
| 分支 | main |

**踩过的坑**：不要走 Workers 流程（那屏预填 `npx wrangler deploy`，本项目没有 wrangler 配置，会报缺入口）。一定要 Pages → 连接到 Git。

## 9. 已知坑（都踩过）

| 坑 | 症状 | 处理 |
| --- | --- | --- |
| 上班天数把未开工的今天算进去 | "上班 3 天挣了 2 天的钱" | 已修：`now >= shiftStartTs` 才算 |
| 休息落在加班里没扣 | 加班算成 4 小时 | 已修：`breakRanges` 参与 `otSec` 扣减 |
| 跨零点选不了时间 | 校验报"下班要晚于上班" | 已修：end ≤ start 视为次日 |
| 分享文案跟视图不一致 | 本班视图复制出本月数据 | 已修：`buildShare()` 按 mode 分支 |
| 改图标后手机仍旧图标 | 缓存 | 只给图标设了 immutable，**改图标必须改文件名** |
| localStorage key 升级 | 旧配置读不到 | `money-meter.v3` 若升 v4，用户需重填，慎用 |
| 截图工具里 CSS 过渡冻结 | 面板"打不开" | 是 WKWebView 离屏不跑 transition，注入 `transition:none` 再截图，不是 bug |
| `hidden` 被 `display:flex` 覆盖 | 节假日时倍率 chips 还显示 | 作者样式优先于 UA 的 `[hidden]{display:none}`，给 `.ot-chips[hidden]` 显式补一条 |
| 新弹层盖住 toast | 记录面板里点添加，看不到提示 | 层级：设置 50 < 记录 60/61 < 备份弹层 70 < toast 80 |
| 导入后设置面板还是旧值 | 再点保存把导进来的配置覆盖回去 | 导入成功后 `closeSheet()`，下次打开重新读 `state.cfg` |
| 老配置没有 breaks | 升级后休息时段消失 | `load()` 走 `normalizeCfg(cfg, true)`，`breaksFromCfg()` 把 `lunch*` 转成数组；已在 WKWebView 真环境验证 |
| 循环模式切回「按星期」后全空 | 保存时提示"至少选一个上班日" | 保存时始终收集星期按钮；`openSheet()` 对空 `workweek` 回落到周一到周五 |
| 循环预览相位不对 | 上四休一落在错误的星期几 | `cycleStart` 是锚点，切到 cycle 模式时默认今天；改日期后立即重算预览 |
| 主界面上下滑一截 | 手机浏览器工具栏占掉高度，`100%` 按布局视口算 | 改 `100dvh` + 流体 `clamp`；`justify-content:space-between` 吃掉余量，短屏只隐藏次要行 |
| 窄屏自由视图顶出屏幕 | 360×640 说明卡文字换行，页面高 44px | 窄屏（≤380）且高度 ≤820 时把说明卡收成一段 |
| 设置面板一长条找不到更新 | 想看日志得滑到底 | 分五个页签 + 未读小圆点；未读时打开设置直接落到「更新」页 |
| 页脚隐藏后内容压到 Home 条 | 数据和更新页没有保存按钮 | `#sheet.no-foot .sheet-body` 补 `safe-area-inset-bottom` |
| 手机上一屏却还能滑 | 浏览器工具栏可见时页面多出可滚动高度 | 去掉 `html{height:100%}`，用 `--vh100`（visualViewport）兜底；不要再给 body/app 写 `100%` |
| 小屏加班时段被截断 | 320 宽显示 `17:00–2…` | ≤360px 时缩小 chip 和 tag 字号/内边距 |
| 字号越缩越小、观感差 | 短屏上标签只有 9–10px | 字号设下限，改为隐藏次要块 / 四格让位，不要无限缩字 |
| iPhone 上明明一屏却还能滑 | 安全区 81px 没算进去，内容比可见区高 20–90px | 页面锁滚动 + `updateAppOverflow()` 按实际 `scrollHeight` 逐级 `fit-*`；`@media (max-height)` 判断不了安全区 |
| fit 步骤漏了收间距 | 568 高度下被迫藏掉四格 | `FIT_STEPS` 必须包含 `fit-6`，顺序不能跳 |
| 设置页能左右滑 | `overflow-y:auto` 隐式把 `overflow-x` 也变成 `auto`，iOS 可横向橡皮筋 | `.sheet-body` 显式 `overflow-x:hidden` + `touch-action:pan-y`；`.sheet-tabs` 同样处理 |
| 底部安全区纯黑 | 背景 radial 在 108% 处，可视区底部只剩底色 | `body::before` 底部 radial 移到 104% 并加一层向上的线性渐变 |
| 桌面打开黑屏几秒 | PWA 冷启动每次走网络，HTML 到之前只有 launch screen | `sw.js` 导航缓存；第一次打开建立缓存，之后秒开/离线可开；`_headers` 给 index/sw 设 no-cache |
| iOS PWA「打不开网页」 | 缓存了 Cloudflare 的 `Content-Encoding: br` 响应，Safari 回放时解码失败 | 写缓存前用 `cleanResponse()` 剥掉编码头；导航失败绝不用 `Response.error()` |
| SW 更新被旧缓存挡住 | 缓存优先导致新版晚一次打开才生效 | 导航改网络优先 + 900ms 超时，兼顾秒开与立即更新 |
| 休息日也生成了快照 | `regularSec()` 只看时间，不看当天是否上班 | `snapshotDay` 先判断 `m.kind === "none"`；`addTodayLive` 同样处理 |
| 热力图改完标记不刷新 | 只靠记录条数做签名，金额变了条数没变 | 签名加入 `historyRev`，`ensureHistory`/`dropHistory` 都递增 |
| 线上验证看到旧版 | SW 缓存优先，后台更新下一次才生效 | 正常现象；发版时升 `sw.js` 的 `VERSION`，验证用新端口或等一次重开 |
| `[hidden]` 在 `.week` 上失效 | 切到循环模式，星期按钮还露着 | `.week` 是 `display:flex`，必须显式写 `.week[hidden]{display:none}` |
| 足迹补记 400 天就不动了 | 用满一年多后「累计入账」不再增加，且没报错 | 已修：`ensureHistory()` 改增量（从最后一条快照之后扫），单次上限 1830 天，超出下一分钟接着补 |
| 删了中间某天的快照就补不回来 | 改历史某天的标记后，那天的金额从足迹里消失 | 已修：`dropHistory()` 删掉后立即用当前 cfg 重算，不要只删等下次补记 |
| 导入 v3/v4 老备份把足迹清空 | 本机攒的记录被本月估算覆盖 | 已修：备份 `historyCount === 0` 时保留本机 `history`/`recordStart`，确认框写清 |
| 热力图金额提示不刷新 | 只改倍率、秒数没变时，点格子还是旧金额 | 已修：`hmSig` 带上当日实时金额（取整到元，避免每秒重绘） |
| 保存设置时用旧配置补记 | 极少数空档会用改之前的月薪结算 | 已修：先 `state.cfg = cfg` 再 `ensureHistory()` |
| 夜班过零点足迹停住 | 00:00 后「累计入账」不再涨、当天格子空白 | 已修：`historyLive()` 用 `shiftDayFor()` 取当前班次，夜班仍挂昨天；跨月那一班不并进新月份 |

## 10. 版本记录

| 版本 | 内容 |
| --- | --- |
| v1.0 | 首次上线：班次计薪、加班倍率、本月统计、自由视图（4% 法则） |
| v1.1 | 修"上班天数"把未开工的今天算进去；去掉"上班 N 天挣 M 天"这种跨口径的句子 |
| v1.2 | P0 配置导出/导入（v4 备份格式，带校验与老版本迁移）；P1 法定节假日整班 3×；P2 多段休息（`breaks`，老 `lunch*` 自动迁移）；P3 记录面板补录/删除 |
| v1.3 | 上 N 休 M 循环排班（锚点 + 8 天预览 + 月计薪天数一键折算）；设置里加版本号/更新日志；底部显示版本号 |
| v1.3.1 | 主界面按视口高度流体收紧，手机上一屏放下；短屏/窄屏隐藏次要说明；更新日志加本版本 |
| v1.3.2 | 设置分「班次 / 加班 / 自由 / 数据 / 更新」五页；更新日志独立成页；未读版本小圆点 + 打开设置直接落到更新页；清空标记移到数据页 |
| v1.3.3 | 字号整体加大、次要文字提亮；分享移到右上角；修复移动端工具栏造成的假滚动；窄屏标签截断 / 极矮屏四格让位 |
| v1.3.4 | 页面级滚动锁死；按安全区后的真实高度用 JS 逐级隐藏（fit-1…fit-9），iPhone 刘海 / Home 条不再顶出滚动 |
| v1.3.5 | 底部暖色渐变（安全区不再纯黑）；设置 / 记录面板禁止横向拖动；页面级横向滑动也锁掉 |
| v1.3.6 | 「月计薪天数」从「钱」移到「上班怎么排」之后，先排班再折算 |
| v1.3.7 | 加 Service Worker：页面优先读缓存（第二次起秒开）、离线可开、后台更新；清理无用样式与调试截图 |
| v1.3.8 | 修复 PWA「打不开网页」：缓存响应带 `Content-Encoding: br`，iOS Safari 回放解码失败；写缓存前剥掉编码头；导航改网络优先 + 900ms 超时回退 + 友好离线页 |
| v1.4.0 | 新增「足迹」：每班结束自动快照、12 周热力图、累计收入/工时/加班；备份升到 v5 并包含 history/recordStart |
| v1.4.1 | 修足迹补记 400 天断档（改增量补记）、导入老备份清空足迹、热力图金额不刷新、保存设置用旧配置补记 |
| v1.4.2 | 修夜班过零点后足迹实时金额停住、跨月夜班并入错月份 |

## 11. 待办清单

v1.2 把原 P0–P3 做完，v1.3 加了循环排班和更新日志。排序依据不变：**会丢数据 > 会算错钱 > 只是不方便**；新需求先写进这里再动手。

### 已完成（v1.2 – v1.3）

- **P0 导出 / 导入**：设置 → 备份。备份格式 `{v:4, cfg, dayFlags}`，导入有字段白名单、数值夹取和 v3 迁移；解析失败不关弹层，用户可以直接改。
- **P1 节假日**：加班卡片第三个按钮「按节假日算」，整班按 `otHoliday`；周末节假日用「休息日上班」+ 3× chip 表达。
- **P2 多段休息**：`cfg.breaks` 数组，设置里增删行；老配置的 `lunch*` 自动迁移，localStorage key 仍是 `money-meter.v3`。
- **P3 记录**：设置 → 记录，按日期倒序列最近 30 天，支持按日期补录/删除；补录类型会校验工作日/休息日。
- **v1.3 循环排班**：设置 → 上班怎么排 → 上几休几；锚点 + `cycleWork/cycleRest`，附 8 天预览和平均班数折算。
- **v1.3 更新日志**：设置 → 关于，渲染 `CHANGELOG`；主界面底部显示 `APP_VERSION`。
- **v1.3.1 一屏布局**：`100dvh` + `clamp(…, vh, …)` + `space-between`；四个视图在 320×568 到 393×852 全部无纵向滚动。
- **v1.3.2 设置分页**：五个页签 + 未读版本提示；「更新」页单独看日志，不再需要滑到最底。
- **v1.3.3 可读性 / 假滚动修复**：字号下限提升、分享移到 header、`html` 不再写死 100%、`visualViewport` 兜底；320×480 到 1440×900 全模式无纵向溢出。
- **v1.3.4 安全区拟合**：页面滚动锁死，主界面按 `visualViewport - safe-area` 的实际高度逐级隐藏；模拟 47/34 安全区后 852/844/812/780/700/667/640/568/480 全部零溢出。
- **v1.3.5 细节**：`body::before` 底部暖色渐变，`html/body` 横向锁死，`.sheet-body` 显式 `overflow-x:hidden` + `touch-action:pan-y`。
- **v1.3.6 顺序调整**：月计薪天数字段移到排班控件之后，循环预览和「按这个填」在同一屏。
- **v1.3.7 启动缓存**：`sw.js` 缓存导航与静态资源；发版改 `VERSION`；更新下一次打开生效。已用停掉本地服务器的方式验证离线可开。
- **v1.3.8 缓存修复**：`cleanResponse()` 去掉 `content-encoding/content-length` 等头再写缓存；导航网络优先、900ms 超时回退；不再返回 `Response.error()`。发版后 SW 会在后台更新，坏缓存随旧 `CACHE` 一起删掉。
- **v1.4.0 足迹**：本月初起自动补记已结束班次；`state.history` 存金额/工时/加班；12 周热力图 + 累计统计；备份 v5 带上记录。设计灵感来自 Rond 的地理日记，但这里记录的是「时间换来的钱」，不定位、不上传。
- **v1.4.1 足迹修复**：补记改增量（从最后一条快照之后），不再有 400 天断档；`dropHistory()` 立即重算中间日期；导入不含足迹的老备份保留本机记录；热力图签名带当日金额；保存设置时先换 cfg 再补记。内核测试 263 项。
- **v1.4.2 跨零点实时**：`historyLive()` 按 `shiftDayFor()` 取当前班次，夜班凌晨的实时金额挂在昨天那一班；月度卡片只在同一月时并入实时，跨月不串。内核测试 276 项。

### 候选（未排期）

- **半天假 / 半天班**：现在 `dayFlags` 只有整班开关，半天要能按小时扣。`off` / `worked` 要改成可带时长的结构，`shiftMoney()` 与记录面板都得跟。
- **一个班次多个加班时段**：`otStart/otEnd` 只有一段，遇到"早到 1 小时 + 晚上 2 小时"只能合并。可仿照 P2 改成 `cfg.otWindows` 数组，注意与休息时段、跨零点求交。
- **记录按月汇总**：记录面板只列日期和状态、不显示金额；可加"这个月补录带来多少钱"的汇总。
- **足迹按月翻页**：现在只有 12 周热力图 + 本月/上月两张卡，记录超过一年后翻不回去；可按月切换或加年总览（纯前端，不动数据结构）。

### 明确不做

- **账号 / 多设备同步**：没有后端，加一个就要处理登录、隐私、合规，成本远大于收益。用导出/导入替代。
- **内置节假日日历**：法定安排年年变，维护一份数据容易过期误导；让用户一键标记更可靠。
- **接入汇率 / 投资行情**：偏离产品定位，且会引入外部依赖和网络失败态。
