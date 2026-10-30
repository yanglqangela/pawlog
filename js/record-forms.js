/* ============================================================
   记录表单 — 被健康档案页和首页「记一笔」共用
   单独成模块，避免 dashboard ↔ health 循环依赖
   ============================================================ */
import * as store from './store.js';
import { esc, fmtDate, todayISO, toast, openModal, field, selectHTML, num } from './ui.js';
import { openRedFlags } from './red-flags.js';

const nowLocalInput = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const FORMS = {
  weight(pet, after, record = null) {
    const last = store.lastRecord(pet.id, 'weight');
    const preset = record ? record.value : (last ? last.value : '');
    const presetVal = preset === '' || preset == null ? '' : num(preset);
    const date = record?.date || todayISO();
    openModal({
      title: record ? `编辑 ${pet.name} 的体重记录` : `记录 ${pet.name} 的体重`,
      sheet: true,
      body:
        field('体重 (kg)',
          `<input type="number" name="value" step="0.1" min="0.1" max="120" required value="${esc(presetVal)}" placeholder="比如：4.8">`,
          !record && last ? `已填上次的 ${last.value}kg（${fmtDate(last.date, false)}），有变化改一下就行` : '') +
        field('测量日期', `<input type="date" name="date" value="${esc(date)}" required>`) +
        (!record && last && Number(last.value) > 0 ? `
        <div class="row" style="gap:6px;flex-wrap:wrap">
          <button type="button" class="chip" data-delta="-0.2">−0.2</button>
          <button type="button" class="chip" data-delta="-0.1">−0.1</button>
          <button type="button" class="chip" data-delta="0">保持 ${esc(last.value)}</button>
          <button type="button" class="chip" data-delta="0.1">+0.1</button>
          <button type="button" class="chip" data-delta="0.2">+0.2</button>
        </div>` : ''),
      onSubmit(d) {
        const v = Number(d.value);
        if (!(v > 0)) { toast('体重需要大于 0', '⚠️'); return false; }
        const data = { petId: pet.id, type: 'weight', value: v, date: d.date };
        if (record) {
          store.updateRecord(record.id, data);
          toast('体重记录已更新');
        } else {
          store.addRecord(data);
          const delta = last ? v - Number(last.value) : 0;
          toast(delta === 0 ? `已记录 ${v}kg` : `已记录 ${v}kg（${delta > 0 ? '+' : ''}${delta.toFixed(1)}）`);
        }
        after();
      },
    });

    // 快捷增减按钮（仅新增时）
    if (!record && last) {
      const panel = document.getElementById('modal-form');
      if (panel) {
        panel.querySelectorAll('[data-delta]').forEach((b) =>
          b.addEventListener('click', () => {
            const input = panel.querySelector('[name="value"]');
            input.value = (Number(last.value) + Number(b.dataset.delta)).toFixed(1);
          }));
      }
    }
  },

  vaccine(pet, after, record = null) {
    const last = store.lastRecord(pet.id, 'vaccine');
    const base = record || last;
    const startDate = record?.date || todayISO();
    // 新增时按「接种日期 + 1 年」推算，不能继承上一条可能已过期的 nextDate
    const nextPreset = record?.nextDate || store.suggestNext('vaccine', null, startDate);
    openModal({
      title: record ? '编辑疫苗记录' : '添加疫苗记录',
      sheet: true,
      body:
        field('疫苗名称', `<input name="name" required value="${esc(base?.name || '')}" placeholder="比如：猫三联（第三针）">`) +
        field('接种日期', `<input type="date" name="date" value="${esc(startDate)}" required>`) +
        field('下次接种日期', `<input type="date" name="nextDate" value="${esc(nextPreset)}">`, '默认按一年周期推算，可改') +
        field('医院', `<input name="hospital" value="${esc(base?.hospital || pet.hospital || '')}" placeholder="比如：北碚仁爱动物医院">`) +
        field('疫苗批号', `<input name="batch" value="${esc(record?.batch || '')}" placeholder="选填">`),
      onSubmit(d) {
        if (!d.name) { toast('请填写疫苗名称', '⚠️'); return false; }
        const data = {
          petId: pet.id, type: 'vaccine', name: d.name, date: d.date,
          nextDate: d.nextDate || '', hospital: d.hospital, batch: d.batch,
        };
        if (record) {
          store.updateRecord(record.id, data);
          toast('疫苗记录已更新');
        } else {
          store.addRecord(data);
          toast('疫苗记录已保存');
        }
        after();
      },
    });

    // 新增时改接种日期，下次日期跟着重算；编辑时保留原下次日期
    const form = document.getElementById('modal-form');
    const dateInput = form?.querySelector('[name="date"]');
    const nextInput = form?.querySelector('[name="nextDate"]');
    dateInput?.addEventListener('change', () => {
      if (record || !dateInput.value) return;
      nextInput.value = store.suggestNext('vaccine', null, dateInput.value);
    });
  },

  deworm(pet, after, record = null) {
    const lastIn = store.lastRecord(pet.id, 'deworm', '体内');
    const lastOut = store.lastRecord(pet.id, 'deworm', '体外');
    const kind = record?.kind || '体内';
    const last = kind === '体内' ? lastIn : lastOut;
    const nextPreset = record?.nextDate || store.suggestNext('deworm', kind, todayISO());
    const product = record?.product || last?.product || '';
    openModal({
      title: record ? '编辑驱虫记录' : '添加驱虫记录',
      sheet: true,
      body:
        field('类型', selectHTML('kind', [['体内', '体内驱虫'], ['体外', '体外驱虫']], kind)) +
        field('驱虫日期', `<input type="date" name="date" value="${esc(record?.date || todayISO())}" required>`) +
        field('下次日期', `<input type="date" name="nextDate" value="${esc(nextPreset)}">`, '已按 30 天周期自动填好，可改') +
        field('使用药品', `<input name="product" value="${esc(product)}" placeholder="比如：拜宠清 / 大宠爱">`),
      onSubmit(d) {
        const data = {
          petId: pet.id, type: 'deworm', kind: d.kind, date: d.date,
          nextDate: d.nextDate || '', product: d.product,
        };
        if (record) {
          store.updateRecord(record.id, data);
          toast('驱虫记录已更新');
        } else {
          store.addRecord(data);
          toast(`${d.kind}驱虫已记录`);
        }
        after();
      },
    });

    // 切换体内/体外或改日期时，同步更新预填的下次日期与药品
    const form = document.getElementById('modal-form');
    if (form) {
      const sel = form.querySelector('[name="kind"]');
      const dateInput = form.querySelector('[name="date"]');
      const syncNext = () => {
        form.querySelector('[name="nextDate"]').value =
          store.suggestNext('deworm', sel.value, dateInput?.value || todayISO());
      };
      sel?.addEventListener('change', () => {
        const lastForKind = sel.value === '体内' ? lastIn : lastOut;
        syncNext();
        form.querySelector('[name="product"]').value = lastForKind?.product || '';
      });
      dateInput?.addEventListener('change', () => { if (!record) syncNext(); });
    }
  },

  vet(pet, after, record = null) {
    const base = record || {};
    openModal({
      title: record ? '编辑就诊记录' : '添加就诊记录',
      sheet: true,
      body:
        field('就诊日期', `<input type="date" name="date" value="${esc(base.date || todayISO())}" required>`) +
        field('医院', `<input name="hospital" required value="${esc(base.hospital || pet.hospital || '')}" placeholder="比如：北碚仁爱动物医院">`) +
        field('医生', `<input name="doctor" value="${esc(base.doctor || '')}" placeholder="选填">`) +
        field('症状', `<textarea name="symptom" required placeholder="比如：连续两天软便、食欲下降">${esc(base.symptom || '')}</textarea>`) +
        field('诊断结果', `<input name="diagnosis" required value="${esc(base.diagnosis || '')}" placeholder="比如：轻度肠胃炎">`) +
        field('花费 (元)', `<input type="number" name="cost" min="0" step="1" value="${base.cost ? esc(num(base.cost)) : ''}" placeholder="比如：320">`) +
        field('复诊日期', `<input type="date" name="followUp" value="${esc(base.followUp || '')}">`, '选填，会写入档案与就医摘要'),
      onSubmit(d) {
        if (!d.hospital || !d.symptom || !d.diagnosis) { toast('请填写完整', '⚠️'); return false; }
        const data = {
          petId: pet.id, type: 'vet', date: d.date, hospital: d.hospital,
          doctor: d.doctor || '', symptom: d.symptom, diagnosis: d.diagnosis,
          cost: Number(d.cost) || 0, followUp: d.followUp || '',
        };
        if (record) {
          store.updateRecord(record.id, data);
          toast('就诊记录已更新');
        } else {
          store.addRecord(data);
          toast('就诊记录已保存');
        }
        after();
      },
    });
  },
  symptom(pet, after, record = null) {
    const base = record || {};
    const sel = (name, options, fallback) =>
      selectHTML(name, options.map((o) => [o, o]), base[name] || fallback);
    openModal({
      title: record ? '编辑症状记录' : '记录症状',
      sheet: true,
      body:
        field('时间', `<input type="datetime-local" name="at" value="${esc(base.at || nowLocalInput())}" required>`) +
        field('呕吐', sel('vomiting', ['无', '1 次', '2–3 次', '更多', '带血'], '无')) +
        field('腹泻', sel('diarrhea', ['无', '软便', '水样', '带血'], '无')) +
        field('食欲', sel('appetite', ['正常', '减少', '不吃'], '正常')) +
        field('精神', sel('energy', ['正常', '沉郁', '亢奋', '无法站立'], '正常')) +
        field('饮水', sel('water', ['正常', '增多', '减少'], '正常')) +
        field('排尿', sel('urination', ['正常', '困难', '无'], '正常')) +
        field('呼吸', sel('breathing', ['正常', '急促', '困难'], '正常')) +
        field('疼痛 (0–5)', sel('pain', ['0', '1', '2', '3', '4', '5'], '0')) +
        field('备注', `<textarea name="note" maxlength="200" placeholder="比如：晚饭后吐了两次">${esc(base.note || '')}</textarea>`),
      onSubmit(d) {
        const redFlags = [];
        if (pet.species === '猫' && d.urination === '无') redFlags.push('无排尿（猫尿闭是急症）');
        if (d.breathing === '困难' || d.breathing === '急促') redFlags.push('呼吸困难');
        if (d.energy === '无法站立') redFlags.push('无法站立/昏迷');
        if (d.vomiting === '带血' || d.diarrhea === '带血') redFlags.push('呕吐/腹泻带血');
        const data = {
          petId: pet.id, at: d.at,
          vomiting: d.vomiting, diarrhea: d.diarrhea, appetite: d.appetite,
          energy: d.energy, water: d.water, urination: d.urination,
          breathing: d.breathing, pain: Number(d.pain) || 0,
          note: d.note || '', redFlags,
        };
        if (record) {
          store.updateSymptom(record.id, data);
          toast('症状记录已更新');
        } else {
          store.addSymptom(data);
          toast('症状已记录');
        }
        after();
        if (!record && redFlags.length) {
          toast(`出现红旗症状：${redFlags[0]}，建议立即就医`, '🚨', {
            label: '查看急诊红旗',
            onClick: () => openRedFlags(pet),
          });
        }
      },
    });
  },

  medication(pet, after, record = null) {
    const base = record || {};
    openModal({
      title: record ? '编辑用药' : '添加用药',
      sheet: true,
      body:
        field('药名', `<input name="name" required value="${esc(base.name || '')}" placeholder="比如：肾脏支持片">`) +
        field('剂量', `<input name="dose" value="${esc(base.dose || '')}" placeholder="比如：1">`) +
        field('单位', `<input name="unit" value="${esc(base.unit || '')}" placeholder="片 / ml / 滴">`) +
        field('频次', selectHTML('frequency', [['每日一次', '每日一次'], ['每日两次', '每日两次'], ['隔日一次', '隔日一次'], ['每周一次', '每周一次'], ['按需', '按需']], base.frequency || '每日一次')) +
        field('服药时间', `<input type="time" name="time" value="${esc(base.times?.[0] || '08:00')}">`) +
        field('开始日期', `<input type="date" name="startDate" value="${esc(base.startDate || todayISO())}">`) +
        field('结束日期', `<input type="date" name="endDate" value="${esc(base.endDate || '')}">`, '选填') +
        field('原因', `<input name="reason" value="${esc(base.reason || '')}" placeholder="比如：慢性肾病支持">`) +
        field('开药兽医', `<input name="prescriber" value="${esc(base.prescriber || '')}" placeholder="选填">`) +
        field('备注', `<textarea name="note" maxlength="200">${esc(base.note || '')}</textarea>`) +
        `<label class="row" style="gap:8px;align-items:center;cursor:pointer">
           <input type="checkbox" name="active" style="width:auto" ${base.active === false ? '' : 'checked'}>
           <span class="small strong">正在使用</span>
         </label>`,
      onSubmit(d) {
        if (!d.name) { toast('请填写药名', '⚠️'); return false; }
        const data = {
          petId: pet.id, name: d.name, dose: d.dose || '', unit: d.unit || '',
          frequency: d.frequency, times: d.time ? [d.time] : [],
          startDate: d.startDate || '', endDate: d.endDate || '',
          reason: d.reason || '', prescriber: d.prescriber || '',
          note: d.note || '', active: d.active === 'on',
        };
        if (record) {
          store.updateMedication(record.id, data);
          toast('用药已更新');
        } else {
          store.addMedication(data);
          toast('用药已添加');
        }
        after();
      },
    });
  },
};

export function openExpenseForm(pet, after, record = null) {
  const base = record || {};
  openModal({
    title: record ? '编辑费用' : '添加费用',
    sheet: true,
    body:
      field('日期', `<input type="date" name="date" value="${esc(base.date || todayISO())}" required>`) +
      field('类别', selectHTML('category', [['就诊', '就诊'], ['药品', '药品'], ['检查', '检查'], ['疫苗', '疫苗'], ['驱虫', '驱虫'], ['寄养', '寄养'], ['其他', '其他']], base.category || '药品')) +
      field('金额 (元)', `<input type="number" name="amount" min="0" step="0.01" required value="${base.amount ? esc(num(base.amount)) : ''}" placeholder="比如：120">`) +
      field('备注', `<input name="note" value="${esc(base.note || '')}" maxlength="120" placeholder="比如：肠胃炎用药">`),
    onSubmit(d) {
      const amount = Number(d.amount);
      if (!(amount >= 0)) { toast('金额需要大于等于 0', '⚠️'); return false; }
      const data = { petId: pet.id, date: d.date, category: d.category, amount, note: d.note || '' };
      if (record) {
        store.updateExpense(record.id, data);
        toast('费用已更新');
      } else {
        store.addExpense(data);
        toast('费用已记录');
      }
      after();
    },
  });
}

export function openPolicyForm(pet, after, record = null) {
  const base = record || {};
  openModal({
    title: record ? '编辑保单' : '添加保单',
    sheet: true,
    body:
      field('保险公司', `<input name="company" required value="${esc(base.company || '')}" placeholder="比如：示例保险">`, '仅记录，不构成投保建议') +
      field('保单号', `<input name="policyNo" value="${esc(base.policyNo || '')}" maxlength="40">`) +
      field('生效日期', `<input type="date" name="start" value="${esc(base.start || todayISO())}">`) +
      field('到期日期', `<input type="date" name="end" value="${esc(base.end || '')}">`) +
      field('保障范围', `<textarea name="coverage" maxlength="200">${esc(base.coverage || '')}</textarea>`) +
      field('理赔电话', `<input name="claimPhone" value="${esc(base.claimPhone || '')}" maxlength="24">`) +
      field('备注', `<textarea name="note" maxlength="200">${esc(base.note || '')}</textarea>`),
    onSubmit(d) {
      if (!d.company) { toast('请填写保险公司', '⚠️'); return false; }
      const data = {
        petId: pet.id, company: d.company, policyNo: d.policyNo || '',
        start: d.start || '', end: d.end || '', coverage: d.coverage || '',
        claimPhone: d.claimPhone || '', note: d.note || '',
      };
      if (record) {
        store.updatePolicy(record.id, data);
        toast('保单已更新');
      } else {
        store.addPolicy(data);
        toast('保单已保存');
      }
      after();
    },
  });
}

export function openRecordForm(pet, type, after, record = null) {
  const fn = FORMS[type];
  if (!fn) throw new Error(`未知的记录类型：${type}`);
  return fn(pet, after, record);
}
