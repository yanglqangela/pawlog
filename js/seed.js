/* ============================================================
   种子数据 — 首次访问时填充，让产品「一打开就是活的」
   日期相对「今天」生成，保证提醒/倒计时看起来永远新鲜
   ============================================================ */

const DAY = 86400000;

/** n 天前的 ISO 日期（YYYY-MM-DD） */
const ago = (n) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
/** n 天后的 ISO 日期 */
const ahead = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

export function buildSeed() {
  const pets = [
    {
      id: 'p_buding',
      name: '布丁',
      emoji: '🐱',
      species: '猫',
      breed: '中华田园猫（橘）',
      gender: '公',
      neutered: true,
      birthday: ago(930),
      weight: 4.8,
      color: 'brand',
      bio: '三年前的雨天在楼下捡到的，现在已经是家里的一把手了。最爱纸箱和冻干。',
    },
    {
      id: 'p_zhima',
      name: '芝麻',
      emoji: '🐶',
      species: '狗',
      breed: '威尔士柯基犬',
      gender: '母',
      neutered: false,
      birthday: ago(495),
      weight: 9.2,
      color: 'mint',
      bio: '精力旺盛的小短腿，每天必须遛满两次，闻到别的狗就走不动道。',
    },
  ];

  const records = [
    /* ── 布丁 · 体重曲线 ── */
    { id: 'r_w1', petId: 'p_buding', type: 'weight', date: ago(300), value: 3.6 },
    { id: 'r_w2', petId: 'p_buding', type: 'weight', date: ago(240), value: 4.1 },
    { id: 'r_w3', petId: 'p_buding', type: 'weight', date: ago(180), value: 4.4 },
    { id: 'r_w4', petId: 'p_buding', type: 'weight', date: ago(120), value: 4.6 },
    { id: 'r_w5', petId: 'p_buding', type: 'weight', date: ago(60),  value: 4.9 },
    { id: 'r_w6', petId: 'p_buding', type: 'weight', date: ago(7),   value: 4.8 },

    /* ── 布丁 · 疫苗 ── */
    { id: 'r_v1', petId: 'p_buding', type: 'vaccine', date: ago(365), name: '猫三联（第三针）', hospital: '北碚仁爱动物医院', nextDate: ahead(15), batch: 'FVRCP-2411' },
    { id: 'r_v2', petId: 'p_buding', type: 'vaccine', date: ago(365), name: '狂犬疫苗', hospital: '北碚仁爱动物医院', nextDate: ahead(15), batch: 'RAB-2409' },

    /* ── 布丁 · 驱虫 ── */
    { id: 'r_d1', petId: 'p_buding', type: 'deworm', date: ago(88), kind: '体内', product: '拜宠清', nextDate: ahead(2) },
    { id: 'r_d2', petId: 'p_buding', type: 'deworm', date: ago(20), kind: '体外', product: '大宠爱', nextDate: ahead(10) },

    /* ── 布丁 · 就诊 ── */
    { id: 'r_vt1', petId: 'p_buding', type: 'vet', date: ago(140), hospital: '北碚仁爱动物医院', symptom: '连续两天软便、食欲下降', diagnosis: '轻度肠胃炎', cost: 320 },

    /* ── 芝麻 ── */
    { id: 'r_z1', petId: 'p_zhima', type: 'weight', date: ago(200), value: 6.4 },
    { id: 'r_z2', petId: 'p_zhima', type: 'weight', date: ago(120), value: 8.0 },
    { id: 'r_z3', petId: 'p_zhima', type: 'weight', date: ago(30),  value: 9.2 },
    { id: 'r_z4', petId: 'p_zhima', type: 'vaccine', date: ago(150), name: '犬四联（加强）', hospital: '渝北宠康动物医院', nextDate: ahead(215), batch: 'DHPP-2502' },
    { id: 'r_z5', petId: 'p_zhima', type: 'deworm', date: ago(45), kind: '体内', product: '犬心保', nextDate: ahead(45) },
    { id: 'r_z6', petId: 'p_zhima', type: 'deworm', date: ago(12), kind: '体外', product: '尼可信', nextDate: ahead(18) },
  ];

  const timeline = [
    {
      id: 't1', petId: 'p_buding', date: ago(890), milestone: true, title: '接你回家',
      text: '在楼下花坛边捡到的，浑身湿透，只有巴掌大。带去洗了澡驱了虫，从此家里多了一个成员。',
      photos: ['📦', '🌧️'], tags: ['第一个里程碑'],
    },
    {
      id: 't2', petId: 'p_buding', date: ago(700), milestone: true, title: '第一次打疫苗',
      text: '全程炸毛，医生按都按不住。回到家躲在床底三个小时不肯出来。',
      photos: ['💉'], tags: ['疫苗'],
    },
    {
      id: 't3', petId: 'p_buding', date: ago(520), milestone: false, title: '学会了「握手」',
      text: '用冻干训练了大概一周，现在一伸手就自动把爪子递过来，有时候没给零食还会再拍你一下。',
      photos: ['🐾'], tags: ['技能点'],
    },
    {
      id: 't4', petId: 'p_buding', date: ago(180), milestone: true, title: '一岁生日 🎂',
      text: '买了个三文鱼罐头顶上插了根猫条当蜡烛。一整年从 0.4kg 长到 4.4kg，体检一切正常。',
      photos: ['🎂', '🐟'], tags: ['生日'],
    },
    {
      id: 't5', petId: 'p_buding', date: ago(7), milestone: false, title: '体重达标了',
      text: '坚持控量喂食三个月，从 4.9 回落到 4.8，体态评分终于从「偏胖」回到「理想」。',
      photos: ['⚖️'], tags: ['健康'],
    },
    {
      id: 't6', petId: 'p_zhima', date: ago(480), milestone: true, title: '芝麻来到家里',
      text: '在犬舍一眼看中这只屁股最圆的。回家路上在车里晕车吐了一路。',
      photos: ['🚗'], tags: ['第一个里程碑'],
    },
    {
      id: 't7', petId: 'p_zhima', date: ago(60), milestone: true, title: '学会「趴下」和「等」',
      text: '柯基太聪明了，二十分钟就学会了。现在吃饭前会自己趴下等口令。',
      photos: ['🦴'], tags: ['技能点'],
    },
  ];

  const friends = [
    { id: 'f1', name: '阿茶和橘座', emoji: '🐱', city: '重庆', district: '北碚区', distance: 0.8,
      pets: [{ name: '橘座', species: '猫', breed: '橘猫' }],
      bio: '两只猫的老母亲，专治各种挑食。坐标西大一带有空一起遛猫（用推车那种）。',
      tags: ['养猫', '西大', '可约遛猫'], posts: 42 },
    { id: 'f2', name: '陈小满', emoji: '🐶', city: '重庆', district: '北碚区', distance: 1.2,
      pets: [{ name: '满仔', species: '狗', breed: '柴犬' }],
      bio: '每天下班固定去滨江路遛狗，欢迎组队。柴犬家长看到请务必联系我。',
      tags: ['养狗', '滨江路', '约遛'], posts: 88 },
    { id: 'f3', name: '王小熊家的猫', emoji: '🐱', city: '重庆', district: '沙坪坝区', distance: 6.5,
      pets: [{ name: '小熊', species: '猫', breed: '布偶' }, { name: '汤圆', species: '猫', breed: '蓝猫' }],
      bio: '两只长毛猫的梳毛日常。对猫毛过敏还是养了两只，属于工伤。',
      tags: ['布偶', '长毛', '梳毛'], posts: 130 },
    { id: 'f4', name: '遛狗不牵绳是耍流氓', emoji: '🐕', city: '重庆', district: '渝北区', distance: 4.1,
      pets: [{ name: '大黄', species: '狗', breed: '金毛' }],
      bio: '名字就是立场。金毛家长，周末常去中央公园，狗友自取。',
      tags: ['金毛', '中央公园', '文明养犬'], posts: 65 },
    { id: 'f5', name: '研究所养猫人', emoji: '🐈', city: '重庆', district: '北碚区', distance: 0.4,
      pets: [{ name: '数据', species: '猫', breed: '英短' }],
      bio: '同在西大读研，宿舍养猫（已报备）。可以帮忙代喂，寒暑假互相搭把手。',
      tags: ['西大', '英短', '可代喂'], posts: 17 },
    { id: 'f6', name: '小亮和鹦鹉', emoji: '🦜', city: '重庆', district: '江北区', distance: 9.3,
      pets: [{ name: '豆豆', species: '鸟', breed: '玄凤鹦鹉' }],
      bio: '异宠家长报到。玄凤、仓鼠、守宫都养过，欢迎交流。',
      tags: ['异宠', '鹦鹉', '冷门'], posts: 23 },
  ];

  const posts = [
    {
      id: 'po1', author: 'f1', name: '阿茶和橘座', emoji: '🐱', city: '重庆·北碚区', time: ago(0),
      text: '终于把橘座的体重从 6.2 拉回 5.6 了！\n方法其实很朴素：定时定量 + 把干粮换成了一半湿粮，三个月见效。有需要的家长可以参考～',
      imgs: ['⚖️', '🐟'], tags: ['减肥日记', '科学喂养'],
      likes: 128, liked: false, comments: [
        { name: '陈小满', text: '求湿粮牌子！', time: ago(0) },
        { name: '研究所养猫人', text: '我家数据也超重了，明天开始照做', time: ago(0) },
      ],
    },
    {
      id: 'po2', author: 'f2', name: '陈小满', emoji: '🐶', city: '重庆·北碚区', time: ago(1),
      text: '滨江路的日落配柴犬，今天的遛狗 KPI 完成了 ✅',
      imgs: ['🌇', '🐕'], tags: ['遛狗日常', '柴犬'],
      likes: 96, liked: true, comments: [{ name: '阿茶和橘座', text: '这也太好看了吧', time: ago(1) }],
    },
    {
      id: 'po3', author: 'f5', name: '研究所养猫人', emoji: '🐈', city: '重庆·北碚区', time: ago(2),
      text: '给「数据」建了健康档案之后最大的改变：再也不用翻微信聊天记录找上次驱虫是哪天了。\n疫苗到期前 15 天自动提醒，属于是养猫新手救命功能。',
      imgs: ['📋'], tags: ['健康档案', '新手养猫'],
      likes: 214, liked: false, comments: [
        { name: '王小熊家的猫', text: '同感，以前全靠备忘录', time: ago(1) },
      ],
    },
    {
      id: 'po4', author: 'f6', name: '小亮和鹦鹉', emoji: '🦜', city: '重庆·江北区', time: ago(3),
      text: '玄凤豆豆学会吹《两只老虎》的前四个音了，虽然音准堪忧但我很感动。',
      imgs: ['🎵', '🦜'], tags: ['异宠', '鹦鹉'],
      likes: 73, liked: false, comments: [],
    },
    {
      id: 'po5', author: 'f3', name: '王小熊家的猫', emoji: '🐱', city: '重庆·沙坪坝区', time: ago(4),
      text: '换季掉毛实录：一天梳下来的毛可以再捏一只猫。\n长毛猫家长请务必每天梳，不然打结之后只能剃。',
      imgs: ['🧶', '🐱'], tags: ['换毛季', '长毛猫'],
      likes: 189, liked: false, comments: [
        { name: '阿茶和橘座', text: '看图血压升高了哈哈哈哈', time: ago(4) },
      ],
    },
  ];

  const activities = [
    { id: 'a1', title: '北碚滨江路 · 周末遛狗局', host: '陈小满', emoji: '🐕', city: '重庆', district: '北碚区',
      date: ahead(2), time: '16:30', joined: 8, cap: 12, tags: ['狗狗专场', '免费'] },
    { id: 'a2', title: '西大宠物义诊 + 免费驱虫', host: '北碚仁爱动物医院', emoji: '🏥', city: '重庆', district: '北碚区',
      date: ahead(5), time: '09:00', joined: 34, cap: 60, tags: ['义诊', '需预约'] },
    { id: 'a3', title: '中央公园柯基短腿大赛', host: '遛狗不牵绳是耍流氓', emoji: '🐶', city: '重庆', district: '渝北区',
      date: ahead(9), time: '14:00', joined: 21, cap: 30, tags: ['柯基', '比赛'] },
  ];

  const me = {
    name: '我',
    emoji: '🙂',
    city: '重庆',
    district: '北碚区',
    bio: '两猫一狗……不对，是一猫一狗的新手家长，正在努力学习科学喂养。',
  };

  return { pets, records, timeline, friends, posts, activities, me, activePetId: 'p_buding' };
}
