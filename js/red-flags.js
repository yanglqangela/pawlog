/* ============================================================
   急诊红旗 — 静态规则，不经过 AI
   出现任一情况，先去医院，不要“再观察一下”
   ============================================================ */
import { esc, openModal } from './ui.js';

const COMMON = [
  '呼吸困难、张口呼吸，或牙龈/舌头明显发白、发紫',
  '抽搐、昏迷、无法站立，或突然不认识主人',
  '大出血、被车撞、从高处坠落',
  '误食巧克力、木糖醇、百合、老鼠药、葡萄/提子',
  '中暑：体温很高、呼吸急促、流口水、站不稳',
  '持续呕吐或腹泻超过 24 小时，且精神明显变差',
];

const CAT = [
  '超过 24 小时没有排尿（公猫尿闭是急症）',
  '突然张口呼吸、后肢瘫痪或拖行',
  '躲起来不吃不喝超过 24 小时',
];

const DOG = [
  '肚子胀得像鼓、干呕但吐不出来（胃扭转风险）',
  '持续呕吐、腹泻带血，或精神突然垮掉',
  '误食后出现流口水、抖动、站不稳',
];

export function redFlagGroups(species) {
  const groups = [{ label: '任何宠物', items: COMMON }];
  if (species === '猫') groups.push({ label: '猫额外注意', items: CAT });
  if (species === '狗') groups.push({ label: '狗额外注意', items: DOG });
  return groups;
}

export function openRedFlags(pet) {
  const groups = redFlagGroups(pet.species);
  const phone = String(pet.hospitalPhone || '').replace(/[^\d+]/g, '');
  const body = `
    <p class="small" style="color:var(--c-ink-2);line-height:1.8;margin-bottom:var(--sp-4)">
      这不是诊断，是帮你决定要不要现在出门。出现以下任一情况，不要等待观察。
    </p>
    <div class="rf-alert" id="rf-alert" role="alert" aria-live="assertive" hidden>
      <div class="rf-alert__title">建议立即就医</div>
      <div class="rf-alert__text">先打电话给医院，说明症状和到达时间；路上不要喂食喂水，不要自行用药。</div>
    </div>
    <div class="rf-list">
      ${groups.map((g) => `
        <div class="rf-group">
          <div class="rf-group__title">${esc(g.label)}</div>
          ${g.items.map((x) => `
            <label class="rf-item">
              <input type="checkbox" data-rf>
              <span>${esc(x)}</span>
            </label>`).join('')}
        </div>`).join('')}
    </div>`;

  const footer = `
    <button class="btn btn--ghost" data-close>关闭</button>
    <a class="btn btn--ghost" href="https://uri.amap.com/search?keyword=${encodeURIComponent('宠物医院')}" target="_blank" rel="noopener">在高德找医院</a>
    ${phone ? `<a class="btn btn--danger" href="tel:${esc(phone)}">拨打医院</a>` : ''}`;

  const panel = openModal({ title: '急诊红旗 · 何时该立刻去医院', body, footer });
  const alert = panel.querySelector('#rf-alert');
  if (!alert) return;
  let firstShow = true;
  const sync = () => {
    const any = !!panel.querySelector('input[data-rf]:checked');
    alert.hidden = !any;
    if (any && firstShow) {
      firstShow = false;
      alert.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };
  panel.querySelectorAll('input[data-rf]').forEach((cb) => cb.addEventListener('change', sync));
}
