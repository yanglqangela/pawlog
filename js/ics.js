/* ============================================================
   日历导出 — 纯静态站无法后台推送，交给系统日历提醒
   输出 RFC 5545 子集：VEVENT / VALARM / RRULE
   提醒来源：疫苗、体内/体外驱虫、当前用药
   ============================================================ */
import * as store from './store.js';
import { toast } from './ui.js';

const CRLF = '\r\n';
const pad = (n) => String(n).padStart(2, '0');
const compact = (date) => String(date || '').replace(/-/g, '');

/** DTSTAMP 必须是 UTC：20261010T000000Z */
export function stampUTC(d = new Date()) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
    + `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** TEXT 值转义：反斜杠、换行、分号、逗号 */
export function icsEscape(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/** 按 UTF-8 字节折行，避免中文被切成乱码（RFC 5545 建议 75 字节） */
function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = parts.length ? 74 : 75; // 续行开头的空格也占 1 字节
    if (bytes + n > limit) {
      parts.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  if (cur) parts.push(cur);
  return parts.join(`${CRLF} `);
}

function eventLines(e) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${e.dtstamp}`,
    e.start ? `DTSTART:${compact(e.date)}T${e.start.replace(':', '')}00` : `DTSTART;VALUE=DATE:${compact(e.date)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    `DESCRIPTION:${icsEscape(e.desc)}`,
  ];
  if (e.rrule) lines.push(`RRULE:${e.rrule}`);
  for (const a of e.alarms || []) {
    lines.push(
      'BEGIN:VALARM',
      `TRIGGER:${a.trigger}`,
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(a.text)}`,
      'END:VALARM',
    );
  }
  lines.push('END:VEVENT');
  return lines;
}

function reminderEvent(pet, r) {
  return {
    uid: `${pet.id}-${r.sourceId || r.id}@pawlog.local`,
    date: r.date,
    title: `${pet.name} · ${r.title}`,
    desc: [
      r.sub ? `上次：${r.sub}` : '',
      r.hospital ? `医院：${r.hospital}` : '',
      `下次到期：${r.date}`,
      '由爪迹 PawLog 生成；到期后请按兽医建议处理。',
    ].filter(Boolean).join('\n'),
    rrule: r.type === 'deworm' ? 'FREQ=DAILY;INTERVAL=30;COUNT=12' : 'FREQ=YEARLY;COUNT=3',
    alarms: [
      { trigger: '-P3D', text: `3 天后需要处理：${r.title}` },
      { trigger: 'PT9H', text: `今天需要处理：${r.title}` },
    ],
  };
}

function medicationEvent(pet, m, today) {
  const start = m.startDate && m.startDate > today ? m.startDate : today;
  const time = (m.times && m.times[0]) || '08:00';
  const remaining = m.endDate ? store.daysUntil(m.endDate) + 1 : 30;
  const count = Math.max(1, Math.min(365, Number.isFinite(remaining) ? remaining : 30));
  return {
    uid: `${pet.id}-med-${m.id}@pawlog.local`,
    date: start,
    start: time,
    title: `${pet.name} · 服药：${m.name}`,
    desc: [
      m.dose ? `剂量：${m.dose}${m.unit || ''}` : '',
      m.frequency ? `频次：${m.frequency}` : '',
      m.reason ? `原因：${m.reason}` : '',
      m.prescriber ? `开药：${m.prescriber}` : '',
      '请按兽医处方使用；本应用不提供剂量建议。',
    ].filter(Boolean).join('\n'),
    rrule: `FREQ=DAILY;COUNT=${count}`,
    alarms: [{ trigger: '-PT10M', text: `该服药了：${m.name}` }],
  };
}

/**
 * 生成 .ics 文本。
 * @param {object} pet
 * @param {{reminders?: object[], meds?: object[], now?: Date}} [opts] 传入空数组可只导出其中一类
 */
export function buildICS(pet, { reminders, meds, now = new Date() } = {}) {
  const reminderList = reminders ?? store.reminders(pet.id);
  const medList = meds ?? store.currentMedicationsOf(pet.id);
  const today = store.todayISO();
  const dtstamp = stampUTC(now);
  const events = [
    ...reminderList.map((r) => reminderEvent(pet, r)),
    ...medList.map((m) => medicationEvent(pet, m, today)),
  ];

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PawLog//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events.flatMap((e) => eventLines({ ...e, dtstamp })),
    'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join(CRLF)}${CRLF}`;
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 导出当前宠物的疫苗/驱虫/用药提醒 */
export function exportICS(pet) {
  const reminders = store.reminders(pet.id);
  const meds = store.currentMedicationsOf(pet.id);
  if (!reminders.length && !meds.length) {
    toast('还没有疫苗、驱虫或用药提醒可导出', '🗓️');
    return false;
  }
  try {
    download(`${pet.name}-健康提醒.ics`, buildICS(pet, { reminders, meds }));
    toast('已导出 .ics：添加到手机日历后由系统提醒你', '🗓️');
    return true;
  } catch {
    toast('日历导出失败，请重试', '⚠️');
    return false;
  }
}
