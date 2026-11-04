# PROJECT.md — 工程交接说明

给"下一个会话 / 下一个接手的人"看的。README.md（英文）是给外人看的介绍，README.zh.md 是完整使用说明，**这份是改代码前必须读的那份**。

---

## 1. 一句话

月薪 → 每秒进账的实时看板，按**班次**计（跨零点算同一班），支持预设加班时段与倍率，外加一个 4% 法则的「自由」视图。单文件网页，无依赖无构建。

- 线上：https://money-meter.pages.dev
- 仓库：https://github.com/Nyx857/money-meter （Public，main）
- 部署：Cloudflare Pages，**push 自动部署**，约 1 分钟
- 当前版本：**v1.1**

## 2. 技术形态

| 项 | 值 |
| --- | --- |
| 入口 | `index.html`（全部 HTML/CSS/JS 内联，约 86KB） |
| 依赖 | 无。没有 package.json、没有构建步骤 |
| 存储 | localStorage，key = `money-meter.v3` |
| 后端 | 无。纯静态，不联网 |

## 3. 文件地图

```
index.html          全部界面和逻辑（改这里 90% 的情况就够了）
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
tests/core.test.mjs 计薪内核单元测试（98 项）
```

## 4. 代码结构（都在 index.html 的单个 `<script>` 里）

```
// ==== CORE:START ====  ← 纯函数，被 tests/core.test.mjs 抽取执行，不能碰 DOM
// ==== CORE:END ====
状态与存储 → load()/save()，state = {cfg, dayFlags, mode, firstRun}
DOM 引用  → el = {...}
render()  → 每帧一次（rAF），按 state.mode 分支
交互      → 加班/不上班按钮、倍率 chips、tab、分享、设置面板
```

**`CORE:START/END` 两个注释标记不能删**，测试靠它切出代码块。

## 5. 核心不变量（改代码前必须遵守）

1. **一切以班次为单位**：`shiftDayFor()` 决定"现在是哪一班"。跨零点时，凌晨 1 点仍属于昨天那一班，直到下班（含加班）结束。
2. **加班只算班次之外的时间**：`shiftSegments()` 给出班次内的计薪区间，`otSec()` 会扣掉与之重叠的部分，避免重复计。
3. **休息时段两边都扣**：落在班次内扣工资（`shiftSegments`），落在加班时段内扣加班费（`breakRanges`）。默认 17:30–18:00 就属于后者（4h → 3.5h）。
4. **上班天数只算"已经开工"的班次**：`now >= shiftStartTs(...)` 才算。否则清早会显示"上班 3 天挣了 2 天的钱"（v1.1 修的就是这个）。
5. **展示的数字必须同口径**：不要拿"出勤天数"和"等效工资天数"直接比。汇总句只讲单一变量，例如"加班多挣 ¥301.72，等于 1.31 天工资"。
6. **自由视图的公式**：自由线 = 月支出 × 12 × 25（4% 法则）；年限用月复利年金公式解 n，`monthsToFI(cfg, saveDelta, expenseDelta)` 的三个参数分别支持"多存/少花"的假设推演。
7. **分享文案跟视图走**：`buildShare()` 按 `state.mode` 返回四套文案，按钮文案也要同步（`shareLabel`）。

## 6. 数据结构

`state.cfg`（用户配置）：

| 字段 | 含义 | 默认 |
| --- | --- | --- |
| salary / workDays | 月薪 / 月计薪天数 | 5000 / 21.75 |
| workStart / workEnd | 上班 / 下班（"HH:MM"，end ≤ start 即跨零点） | 09:00 / 17:00 |
| lunchEnabled / lunchStart / lunchEnd | 不计薪休息 | true / 17:30 / 18:00 |
| workweek | 上班星期，`getDay()` 数字数组（0=周日） | [1,2,3,4,5] |
| otStart / otEnd | 固定加班时段 | 17:00 / 21:00 |
| otWeekday / otWeekend / otHoliday | 倍率 | 1.5 / 2 / 3 |
| payday | 发薪日 1–31 | 15 |
| monthExpense / saved / returnRate | 月支出 / 已存 / 年化%（自由视图） | 2500 / 0 / 5 |

`state.dayFlags`（按天的标记，key 为 `YYYY-MM-DD` 班次日）：

```js
{ "2026-11-04": { off: true },              // 请假
  "2026-11-05": { ot: true, mult: 1.5 },    // 加班（mult 可省，默认按星期取）
  "2026-11-07": { worked: true, mult: 2 } } // 休息日上班，整班按倍率
```

## 7. 改代码的标准流程

```bash
cd "/Volumes/SysExt/DeepSeek Harness/money-meter"

# 1. 改 index.html
# 2. 跑内核测试（必须全绿）
node tests/core.test.mjs

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

## 10. 版本记录

| 版本 | 内容 |
| --- | --- |
| v1.0 | 首次上线：班次计薪、加班倍率、本月统计、自由视图（4% 法则） |
| v1.1 | 修"上班天数"把未开工的今天算进去；去掉"上班 N 天挣 M 天"这种跨口径的句子 |

## 11. 未做 / 可做

- 导出 / 导入配置（换手机、防误删）
- 节假日日历（现在只能手动选 3×）
- 多段休息（现在只支持一段）
- 历史记录编辑（现在只能撤销当天）
