// 计薪内核单元测试：node tests/core.test.mjs
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const core = html.split('// ==== CORE:START ====')[1].split('// ==== CORE:END ====')[0];
if (!core) throw new Error('没找到 CORE 代码块');

const A = new Function(
  core +
  '\nreturn {basePerSec,dailyWorkSec,shiftSegments,shiftDurationMin,shiftStartTs,shiftEndTs,' +
  'shiftDayFor,shiftMoney,computeTotals,statusAt,otRange,otSec,autoMult,nextPayday,isWorkdayAt,' +
  'isOvernight,startOfDay,dayKey,fmt2,fmtRate,splitAmount,hmToMin,minToHm,fmtDur,otNetMin,monthWorkdayCount,fiTarget,monthsToFI,fmtWan,fmtMonths,' +
  'decodeBackup,normalizeCfg,normalizeDayFlags,DEFAULTS};'
)();

let pass = 0, fail = 0;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function eq(name, actual, expected, eps = 1e-6) {
  ok(name, near(actual, expected, eps), `actual=${actual} expected=${expected}`);
}
const at = (y, m, d, hh, mm = 0) => new Date(y, m - 1, d, hh, mm, 0, 0).getTime();

// 真实班次：下午 16:20 到次日 00:20
const night = {
  salary: 12000, workDays: 21.75,
  workStart: '16:20', workEnd: '00:20',
  lunchEnabled: false, lunchStart: '20:00', lunchEnd: '20:30',
  workweek: [1, 2, 3, 4, 5],
  otStart: '00:20', otEnd: '02:20',
  otWeekday: 1.5, otWeekend: 2, otHoliday: 3,
  payday: 15
};
// 普通白班，用来做回归
const day = {
  salary: 12000, workDays: 21.75,
  workStart: '09:00', workEnd: '18:00',
  lunchEnabled: true, lunchStart: '12:00', lunchEnd: '13:00',
  workweek: [1, 2, 3, 4, 5],
  otStart: '18:00', otEnd: '20:00',
  otWeekday: 1.5, otWeekend: 2, otHoliday: 3,
  payday: 15
};

const base = 12000 / (21.75 * 28800);
const dayPay = base * 28800;
const NOFLAGS = {};

console.log('\n[1] 跨零点班次的基础换算');
eq('班次长度 8 小时 = 480 分', A.shiftDurationMin(night), 480);
eq('每天计薪 28800 秒', A.dailyWorkSec(night), 28800);
ok('识别为跨零点', A.isOvernight(night) === true);
eq('每秒费率', A.basePerSec(night), base);
eq('日薪约 551.72', dayPay, 551.7241, 0.001);
eq('下班时刻 = 次日 00:20', A.shiftEndTs(night, A.startOfDay(at(2026, 11, 4, 0, 0))), at(2026, 11, 5, 0, 20));

console.log('\n[2] 夜班按班次累计（2026-11-04 周三）');
let t = A.computeTotals(night, NOFLAGS, at(2026, 11, 4, 20, 0));
ok('20:00 仍属于 11/04 班次', A.dayKey(t.shiftDay) === '2026-11-04');
eq('20:00 已上 3 小时 40 分', t.today, 220 * 60 * base);
t = A.computeTotals(night, NOFLAGS, at(2026, 11, 5, 0, 10));
ok('凌晨 00:10 仍算 11/04 那一班', A.dayKey(t.shiftDay) === '2026-11-04');
eq('凌晨 00:10 已上 7 小时 50 分', t.today, 470 * 60 * base);
t = A.computeTotals(night, NOFLAGS, at(2026, 11, 5, 0, 30));
ok('00:30 下班后切到新的一天', A.dayKey(t.shiftDay) === '2026-11-05');
eq('新班还没开始 → 0', t.today, 0);

console.log('\n[3] 状态识别');
const st = (cfg, flags, ts) => A.statusAt(cfg, flags, ts);
ok('20:00 在岗中', st(night, NOFLAGS, at(2026, 11, 4, 20, 0)).key === 'working');
eq('在岗倍率 1.0', st(night, NOFLAGS, at(2026, 11, 4, 20, 0)).mult, 1);
ok('凌晨 00:10 显示夜班中', st(night, NOFLAGS, at(2026, 11, 5, 0, 10)).label === '夜班中');
ok('09:30 还没开工', st(night, NOFLAGS, at(2026, 11, 4, 9, 30)).key === 'early');

console.log('\n[4] 固定加班时段 00:20–02:20 ×1.5');
const withOT = { '2026-11-04': { ot: true, mult: 1.5 } };
t = A.computeTotals(night, withOT, at(2026, 11, 5, 1, 5));
ok('凌晨 1:05 仍算 11/04 班次（加班没结束）', A.dayKey(t.shiftDay) === '2026-11-04');
eq('正常 8 小时 + 45 分钟加班', t.today, dayPay + 45 * 60 * base * 1.5);
eq('加班部分单独计入', t.todayOT, 45 * 60 * base * 1.5);
ok('状态为加班中', st(night, withOT, at(2026, 11, 5, 1, 5)).key === 'ot');
eq('加班倍率 1.5', st(night, withOT, at(2026, 11, 5, 1, 5)).mult, 1.5);
t = A.computeTotals(night, withOT, at(2026, 11, 5, 2, 30));
ok('加班结束后切到下一班', A.dayKey(t.shiftDay) === '2026-11-05');
eq('加班结束后当天归零', t.today, 0);
t = A.computeTotals(night, withOT, at(2026, 11, 5, 0, 30));
eq('只加了 10 分钟', t.todayOT, 10 * 60 * base * 1.5);

console.log('\n[5] 加班时段和上班时间重叠的部分不算');
const inside = { ...night, otStart: '18:00', otEnd: '19:00' };
eq('18:00–19:00 在班次内 → 加班 0',
   A.otSec(inside, A.startOfDay(at(2026, 11, 4, 0, 0)), { start: 1080, end: 1140 }, at(2026, 11, 4, 20, 0)), 0);
const before = { ...night, otStart: '14:00', otEnd: '16:00' };
const r = A.otRange(before, A.startOfDay(at(2026, 11, 4, 0, 0)), { start: 840, end: 960 });
ok('班次前的加班时段落在同一天 14:00', new Date(r[0]).getHours() === 14 && new Date(r[0]).getDate() === 4);

console.log('\n[6] 不上班');
const off = { '2026-11-04': { off: true } };
t = A.computeTotals(night, off, at(2026, 11, 4, 20, 0));
eq('请假当天不计薪', t.today, 0);
ok('状态为今天不上班', st(night, off, at(2026, 11, 4, 20, 0)).key === 'offday');
eq('本月只算前两个工作日', t.month, dayPay * 2);

console.log('\n[7] 休息日上班整班双倍（2026-11-07 周六）');
const sat = at(2026, 11, 7, 0, 0);
ok('周六不是工作日', !A.isWorkdayAt(night, sat));
const worked = { '2026-11-07': { worked: true, mult: 2 } };
t = A.computeTotals(night, worked, at(2026, 11, 7, 19, 0));
eq('19:00 已上 2 小时 40 分 ×2', t.today, 160 * 60 * base * 2);
ok('状态为周末上班中', st(night, worked, at(2026, 11, 7, 19, 0)).label === '周末上班中');
eq('倍率 2.0', st(night, worked, at(2026, 11, 7, 19, 0)).mult, 2);
t = A.computeTotals(night, NOFLAGS, at(2026, 11, 7, 19, 0));
eq('周末没点上班 → 0', t.today, 0);
ok('状态为休息日', st(night, NOFLAGS, at(2026, 11, 7, 19, 0)).key === 'rest');

console.log('\n[8] 本月累计');
t = A.computeTotals(night, NOFLAGS, at(2026, 11, 4, 20, 0));
eq('11/2 + 11/3 两个整班 + 今天 3 小时 40 分', t.month, dayPay * 2 + 220 * 60 * base);
t = A.computeTotals(night, withOT, at(2026, 11, 5, 1, 5));
ok('本月含加班收入', t.monthOT > 0 && t.month > dayPay * 3);

console.log('\n[9] 白班回归（9:00–18:00 午休 1 小时）');
eq('每班仍 28800 秒', A.dailyWorkSec(day), 28800);
eq('10:00 已上 1 小时', A.computeTotals(day, NOFLAGS, at(2026, 11, 4, 10, 0)).today, 3600 * base);
eq('12:30 午休不涨钱（3 小时）', A.computeTotals(day, NOFLAGS, at(2026, 11, 4, 12, 30)).today, 3 * 3600 * base);
eq('19:00 封顶 8 小时', A.computeTotals(day, NOFLAGS, at(2026, 11, 4, 19, 0)).today, dayPay);
ok('12:30 状态为休息中', st(day, NOFLAGS, at(2026, 11, 4, 12, 30)).key === 'lunch');
const dayOT = { '2026-11-04': { ot: true, mult: 1.5 } };
eq('白班加班 18:00–20:00 两小时 ×1.5',
   A.computeTotals(day, dayOT, at(2026, 11, 4, 20, 0)).todayOT, 7200 * base * 1.5);

console.log('\n[10] 24:00 / 老配置兼容');
const toMidnight = { ...day, workEnd: '00:00' };
eq('09:00 → 24:00 是 15 小时', A.shiftDurationMin(toMidnight), 900);
ok('也算跨零点', A.isOvernight(toMidnight) === true);
eq('夜班配了 12:00–13:00 午休 → 自动忽略',
   A.dailyWorkSec({ ...night, lunchEnabled: true, lunchStart: '12:00', lunchEnd: '13:00' }), 28800);
eq('夜里 23:00–23:30 休息能正确扣掉',
   A.dailyWorkSec({ ...night, lunchEnabled: true, lunchStart: '23:00', lunchEnd: '23:30' }), 27000);

console.log('\n[11] 发薪日');
let pd = A.nextPayday(night, at(2026, 11, 4, 10, 0));
eq('11/4 → 距 11/15 还有 11 天', pd.days, 11);
eq('当天发薪 = 0 天', A.nextPayday(night, at(2026, 11, 15, 10, 0)).days, 0);
eq('过了发薪日就等下月（11/20 → 12/15）', A.nextPayday(night, at(2026, 11, 20, 10, 0)).days, 25);
eq('31 号在小月取月末', A.nextPayday({ ...night, payday: 31 }, at(2026, 2, 10, 10, 0)).days, 18);

console.log('\n[12] 格式化 / 趣味换算');
ok('两位小数带千分位', A.fmt2(12345.678) === '12,345.68', A.fmt2(12345.678));
ok('拆分整数小数', A.splitAmount(1234.5).int === '1,234' && A.splitAmount(1234.5).dec === '.50');
ok('小额费率 4 位', A.fmtRate(0.019157) === '0.0192');
ok('8 小时', A.fmtDur(480) === '8 小时');
ok('2 小时 20 分', A.fmtDur(140) === '2 小时 20 分');
ok('45 分钟', A.fmtDur(45) === '45 分钟');

console.log('\n[13] 边界：配错了也不能崩');
eq('月薪 0 → 费率 0', A.basePerSec({ ...night, salary: 0 }), 0);
eq('月薪 0 → 当天 0', A.computeTotals({ ...night, salary: 0 }, NOFLAGS, at(2026, 11, 4, 20, 0)).today, 0);
eq('没有工作日 → 不算正常工资', A.computeTotals({ ...night, workweek: [] }, NOFLAGS, at(2026, 11, 4, 20, 0)).today, 0);
ok('缺字段也不报错', A.computeTotals({}, NOFLAGS, at(2026, 11, 4, 20, 0)).today === 0);
ok('hmToMin 支持 24:00', A.hmToMin('24:00') === 1440);
ok('minToHm 1440 → 24:00', A.minToHm(1440) === '24:00');

console.log('\n[14] 新默认：5000 / 9:00–17:00 / 加班 17:00–21:00 / 休息 17:30–18:00');
const dflt = {
  salary: 5000, workDays: 21.75,
  workStart: '09:00', workEnd: '17:00',
  lunchEnabled: true, lunchStart: '17:30', lunchEnd: '18:00',
  workweek: [1, 2, 3, 4, 5],
  otStart: '17:00', otEnd: '21:00',
  otWeekday: 1.5, otWeekend: 2, otHoliday: 3,
  payday: 15
};
const b2 = 5000 / (21.75 * 28800);
const d2 = b2 * 28800;
eq('每班仍是 8 小时', A.dailyWorkSec(dflt), 28800);
eq('每秒 ¥0.00798', A.basePerSec(dflt), b2);
eq('时薪 ¥28.74', b2 * 3600, 28.7356, 0.001);
eq('加班净 3.5 小时（4 小时扣掉 30 分钟休息）', A.otNetMin(dflt), 210);
eq('加班一次 ¥150.86', 210 * 60 * b2 * 1.5, 150.86, 0.01);

const dfltOT = { '2026-11-04': { ot: true, mult: 1.5 } };
let d3 = A.computeTotals(dflt, dfltOT, at(2026, 11, 4, 19, 30));
eq('19:30 加班部分 = 2 小时 ×1.5', d3.todayOT, 7200 * b2 * 1.5);
eq('19:30 合计 = 日薪 + 加班费', d3.today, d2 + 7200 * b2 * 1.5);
d3 = A.computeTotals(dflt, dfltOT, at(2026, 11, 4, 17, 20));
eq('17:20 加班已开始 20 分钟', d3.todayOT, 1200 * b2 * 1.5);
d3 = A.computeTotals(dflt, dfltOT, at(2026, 11, 4, 17, 45));
eq('17:45 在休息里，仍是 30 分钟', d3.todayOT, 1800 * b2 * 1.5);
d3 = A.computeTotals(dflt, dfltOT, at(2026, 11, 4, 18, 10));
eq('18:10 = 70 分钟扣掉 30 分钟休息', d3.todayOT, 2400 * b2 * 1.5);

console.log('\n[15] 休息压在班次/加班边界上');
const straddle = { ...dflt, lunchStart: '16:30', lunchEnd: '17:30' };
eq('休息跨过下班点，班次只算 7.5 小时', A.dailyWorkSec(straddle), 27000);
eq('加班同时扣掉 17:00–17:30，净 3.5 小时', A.otNetMin(straddle), 210);
const inShift = { ...dflt, lunchStart: '12:00', lunchEnd: '13:00' };
eq('休息全在班次内 → 计薪 7 小时', A.dailyWorkSec(inShift), 25200);
eq('此时加班不受影响（4 小时）', A.otNetMin(inShift), 240);

console.log('\n[16] 本月天数统计');
eq('2026 年 11 月共 21 个工作日', A.monthWorkdayCount(dflt, at(2026, 11, 6, 19, 30)), 21);
const mix = {
  '2026-11-04': { off: true },
  '2026-11-05': { ot: true, mult: 1.5 },
  '2026-11-06': { ot: true, mult: 1.5 }
};
const mt = A.computeTotals(dflt, mix, at(2026, 11, 6, 19, 30));
eq('上班 4 天', mt.monthWorkDays, 4);
eq('请假 1 天', mt.monthOffDays, 1);
eq('加班 2 天', mt.monthOTDays, 2);
eq('加班还没开始的那天不算', A.computeTotals(dflt, { '2026-11-06': { ot: true, mult: 1.5 } }, at(2026, 11, 6, 10, 0)).monthOTDays, 0);
eq('周末上班也算上班天数', A.computeTotals(dflt, { '2026-11-07': { worked: true, mult: 2 } }, at(2026, 11, 7, 19, 0)).monthWorkDays, 6);
eq('还没到上班时间，今天不算上班天数', A.computeTotals(dflt, {}, at(2026, 11, 4, 8, 25)).monthWorkDays, 2);
eq('上班时间一到就算', A.computeTotals(dflt, {}, at(2026, 11, 4, 9, 1)).monthWorkDays, 3);

console.log('\n[17] 自由线：4% 法则 + 复利');
const fiCfg = { salary: 5000, monthExpense: 2500, saved: 0, returnRate: 5 };
eq('自由线 = 年支出 × 25', A.fiTarget(fiCfg), 2500 * 12 * 25);
eq('月存 2500、年化 5% → 约 196 个月', A.monthsToFI(fiCfg), 196.4, 0.5);
ok('月存更多 → 更快', A.monthsToFI(fiCfg, 500, 0) < A.monthsToFI(fiCfg));
ok('少花一半 → 更快', A.monthsToFI(fiCfg, 0, -1250) < A.monthsToFI(fiCfg));
ok('月光族 → 永远到不了', !isFinite(A.monthsToFI({ ...fiCfg, monthExpense: 5000 })));
eq('已经存够 → 0 个月', A.monthsToFI({ ...fiCfg, saved: 800000 }), 0);
eq('花销为 0 → 0 个月', A.monthsToFI({ ...fiCfg, monthExpense: 0 }), 0);
ok('年化 0 也能算', isFinite(A.monthsToFI({ ...fiCfg, returnRate: 0 })));
eq('50% 储蓄率约 16 年', Math.round(A.monthsToFI(fiCfg) / 12), 16);
ok('fmtMonths 196 → 16 年', A.fmtMonths(196) === '16 年', A.fmtMonths(196));
ok('fmtMonths 84 → 7 年', A.fmtMonths(84) === '7 年', A.fmtMonths(84));
ok('fmtWan 750000 → 75 万', A.fmtWan(750000) === '75 万', A.fmtWan(750000));
ok('fmtWan 90000 → 9.0 万', A.fmtWan(90000) === '9.0 万', A.fmtWan(90000));

console.log('\n[18] 导出 / 导入配置');
const backup = JSON.stringify({
  v: 3,
  cfg: { ...dflt, monthExpense: 3000, saved: 12000 },
  dayFlags: {
    '2026-11-04': { ot: true, mult: 1.5 },
    '2026-11-05': { off: true }
  }
});
let p = A.decodeBackup(backup);
ok('正常备份能解析', p.ok === true, p.error);
eq('版本号保留', p.version, 3);
eq('标记条数', p.count, 2);
eq('月薪恢复', p.cfg.salary, 5000);
eq('支出恢复', p.cfg.monthExpense, 3000);
eq('存款恢复', p.cfg.saved, 12000);
ok('加班标记恢复', p.dayFlags['2026-11-04'].ot === true && p.dayFlags['2026-11-04'].mult === 1.5);
ok('请假标记恢复', p.dayFlags['2026-11-05'].off === true);
ok('导出的配置字段齐全', Object.keys(A.DEFAULTS).every(k => p.cfg[k] !== undefined));

// 验收：导出 → 清空标记并改月薪 → 导入 → 全部恢复
const mutated = { ...p.cfg, salary: 9999 };
let again = A.decodeBackup(backup);
eq('改过的月薪被导入覆盖回去', again.cfg.salary, 5000);
eq('清空的标记被找回', Object.keys(again.dayFlags).length, 2);
ok('mutated 只是临时副本', mutated.salary === 9999 && again.cfg.salary === 5000);

p = A.decodeBackup(JSON.stringify({ v: 2, cfg: { salary: 8000 } }));
ok('旧版本 v2 仍能导入', p.ok === true, p.error);
eq('旧版本号被识别', p.version, 2);
ok('旧备份缺的字段补默认值', p.cfg.otEnd === '21:00', p.cfg.otEnd);
eq('旧备份缺的周设置补默认值', p.cfg.workweek.length, 5);
eq('缺省 dayFlags 当空对象', p.count, 0);

p = A.decodeBackup(JSON.stringify({ cfg: { salary: '8000' } }));
ok('月薪是字符串也能转数字', p.ok === true && p.cfg.salary === 8000);
ok('没有版本号也允许导入', p.version === 0);

p = A.decodeBackup(JSON.stringify({ v: 3, cfg: { salary: 5000, hacker: 1 } }));
ok('未知字段被忽略', p.ok === true && !('hacker' in p.cfg));

ok('月薪 0 拒绝导入', A.decodeBackup(JSON.stringify({ v: 3, cfg: { salary: 0 } })).ok === false);
ok('空文本拒绝导入', A.decodeBackup('   ').ok === false);
ok('非 JSON 拒绝导入', A.decodeBackup('随便一段话').ok === false);
ok('数组拒绝导入', A.decodeBackup('[1,2,3]').ok === false);
ok('缺 cfg 拒绝导入', A.decodeBackup(JSON.stringify({ v: 3, dayFlags: {} })).ok === false);
ok('解析失败有给人看的提示', A.decodeBackup('x').error.length > 0);

p = A.decodeBackup(JSON.stringify({ v: 3, cfg: { salary: 5000 }, dayFlags: 'nope' }));
ok('dayFlags 类型不对 → 空标记但配置可用', p.ok === true && p.count === 0);

p = A.decodeBackup(JSON.stringify({
  v: 3, cfg: { salary: 5000 },
  dayFlags: {
    '2026-11-04': { ot: true, mult: 1.5 },
    '2026-02-31': { ot: true },
    'foo': { off: true },
    '2026-11-05': 'nope',
    '2026-11-06': { off: true, ot: true, worked: true, mult: 2 },
    '2026-11-07': { mult: 2 }
  }
}));
eq('非法日期 / 非法条目被丢掉', p.count, 2);
ok('请假优先，清掉加班和上班', p.dayFlags['2026-11-06'].off === true
  && !p.dayFlags['2026-11-06'].ot && !p.dayFlags['2026-11-06'].worked);
ok('只有倍率没有状态 → 丢弃', !p.dayFlags['2026-11-07']);

p = A.decodeBackup(JSON.stringify({ v: 3, cfg: { salary: 1 }, dayFlags: { '2026-11-04': { ot: true, mult: 99 } } }));
eq('离谱倍率夹到 5', p.dayFlags['2026-11-04'].mult, 5);

p = A.decodeBackup(JSON.stringify({ v: 3, cfg: { salary: 5000, workweek: [1, 1, 9, '2'] } }));
ok('星期去重并过滤越界', p.cfg.workweek.length === 2 && p.cfg.workweek.indexOf(1) >= 0 && p.cfg.workweek.indexOf(2) >= 0);
p = A.decodeBackup(JSON.stringify({ v: 3, cfg: { salary: 5000, workweek: [] } }));
eq('空星期回落到默认', p.cfg.workweek.length, 5);
p = A.decodeBackup(JSON.stringify({ v: 3, cfg: { salary: 5000, payday: 99, returnRate: 50 } }));
eq('发薪日夹到 31', p.cfg.payday, 31);
eq('年化收益夹到 20', p.cfg.returnRate, 20);
p = A.decodeBackup(JSON.stringify({ v: 3, cfg: { salary: 5000, workStart: '9:5', workEnd: 'abc' } }));
ok('时间格式被规整', p.cfg.workStart === '09:05' && p.cfg.workEnd === '17:00', p.cfg.workStart + ' / ' + p.cfg.workEnd);
p = A.decodeBackup(JSON.stringify({ v: 3, cfg: { salary: 5000, workDays: 0 } }));
eq('计薪天数 0 → 默认值', p.cfg.workDays, 21.75);

console.log('\n[19] 法定节假日：整班按 ×3');
const hol = { '2026-11-04': { holiday: true } }; // 2026-11-04 周三
let h1 = A.computeTotals(dflt, hol, at(2026, 11, 4, 20, 0));
eq('周三节假日整班 ¥689.66', h1.today, d2 * 3, 0.001);
eq('节假日收入不进普通工资', h1.todayRegular, 0);
ok('shiftMoney 标为 holiday', A.shiftMoney(dflt, hol, A.startOfDay(at(2026, 11, 4, 0, 0)), at(2026, 11, 4, 20, 0)).kind === 'holiday');
let hs = A.statusAt(dflt, hol, at(2026, 11, 4, 10, 0));
ok('状态 key = holiday', hs.key === 'holiday', hs.key);
ok('状态文案 = 节假日上班', hs.label === '节假日上班', hs.label);
eq('状态倍率 = 3', hs.mult, 3);
eq('取消节假日 → 回到 1×', A.computeTotals(dflt, {}, at(2026, 11, 4, 20, 0)).today, d2, 0.001);
eq('请假优先于节假日', A.computeTotals(dflt, { '2026-11-04': { holiday: true, off: true } }, at(2026, 11, 4, 20, 0)).today, 0);
eq('节假日 + 加班不重复计', A.computeTotals(dflt, { '2026-11-04': { holiday: true, ot: true, mult: 1.5 } }, at(2026, 11, 4, 19, 30)).today, d2 * 3, 0.001);
eq('节假日只上了半小时', A.computeTotals(dflt, hol, at(2026, 11, 4, 9, 30)).today, 1800 * b2 * 3, 0.001);
eq('节假日还没开工 → 0', A.computeTotals(dflt, hol, at(2026, 11, 4, 8, 0)).today, 0);
ok('节假日还没开工状态是 early', A.statusAt(dflt, hol, at(2026, 11, 4, 8, 0)).key === 'early');
ok('节假日算已开工的上班天数',
   A.computeTotals(dflt, hol, at(2026, 11, 4, 10, 0)).monthWorkDays ===
   A.computeTotals(dflt, {}, at(2026, 11, 4, 10, 0)).monthWorkDays);
eq('节假日也扣午休（8 小时计薪 ×3）',
   A.computeTotals(day, { '2026-11-04': { holiday: true } }, at(2026, 11, 4, 19, 0)).today, 8 * 3600 * base * 3, 0.001);
ok('午休时段仍报休息中', A.statusAt(day, { '2026-11-04': { holiday: true } }, at(2026, 11, 4, 12, 30)).key === 'lunch');
eq('周六标节假日 + 上班 → ×3 而不是 ×2',
   A.computeTotals(dflt, { '2026-11-07': { holiday: true, worked: true } }, at(2026, 11, 7, 19, 0)).today, d2 * 3, 0.001);
eq('周六只标节假日没点上班 → 0',
   A.computeTotals(dflt, { '2026-11-07': { holiday: true } }, at(2026, 11, 7, 19, 0)).today, 0);
ok('周六节假日上班状态 = 节假日上班',
   A.statusAt(dflt, { '2026-11-07': { holiday: true, worked: true } }, at(2026, 11, 7, 10, 0)).label === '节假日上班');

p = A.decodeBackup(JSON.stringify({ v: 3, cfg: { salary: 5000 }, dayFlags: { '2026-11-04': { holiday: true, ot: true, mult: 1.5 } } }));
ok('导入时保留 holiday 并清掉冲突的 ot', p.dayFlags['2026-11-04'].holiday === true && !p.dayFlags['2026-11-04'].ot);
p = A.decodeBackup(JSON.stringify({ v: 3, cfg: { salary: 5000 }, dayFlags: { '2026-11-07': { holiday: true, worked: true } } }));
ok('导入时保留周末节假日上班', p.dayFlags['2026-11-07'].holiday === true && p.dayFlags['2026-11-07'].worked === true);

console.log(`\n${fail === 0 ? '✅' : '❌'} 通过 ${pass} 项，失败 ${fail} 项\n`);
process.exit(fail === 0 ? 0 : 1);
