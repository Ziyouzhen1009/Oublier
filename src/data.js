(function (global) {
  "use strict";

  const Oublier = (global.Oublier = global.Oublier || {});

  const IDENTITY_POOL = [
    "3号车厢的听雨人",
    "凌晨的煮茶人",
    "忘记看表的旅人",
    "拾贝壳的影子",
    "晚风收藏家",
    "发呆的蓝鲸",
    "末班地铁的旁观者",
    "钟楼下的守夜人",
    "借火的夜行人",
    "回廊里的抄书者",
    "海岸线散步者",
    "不回消息的猫",
    "等潮汐的灯塔",
    "便利店关门前的风",
    "落叶里的书签",
    "替月亮守夜的人",
    "失眠的松果",
    "没有日程表的星期天",
    "只喝热水的星",
    "修道院外的白鸽"
  ];

  const REFLECTION_PROMPTS = [
    "如果今天是一张可以揉掉重写的草稿纸，你最想留住哪一个微小的瞬间？",
    "剥离掉工作、身份和别人对你的期待，此刻纯粹的你喜欢什么？",
    "最近一次让你觉得“时间好像慢下来了”，是在什么地方？",
    "有没有一件你一直在硬撑的事，其实今晚可以先把它放回地上？",
    "小时候的你如果见到现在的你，最想对你说的一句安慰是什么？",
    "今天有没有一盏灯、一口热饮或一阵风，曾悄悄接住过疲惫的你？",
    "如果明天可以完全消失一整天，不用对任何人交代，你会怎么度过？",
    "你最近心里最常出现的“必须”是什么？它真的是你想要的吗？",
    "哪一首歌或哪一种气味，总能让你一秒回到最安心的自己？",
    "这一年里，你悄悄原谅了自己哪一件曾经很在意的小事？",
    "如果把你的情绪比作今晚的天气，它现在是薄雾、阵雨，还是微凉的晴夜？",
    "此刻不用急着变得更好——你觉得自己现在已经足够努力的地方在哪里？",
    "有哪些话你一直想对某个人说，却最终吞了回去？写给今晚的海风吧。",
    "你上一次没有任何目的、纯粹为了好玩而做一件事，是什么时候？",
    "在所有必须扮演的角色之外，你的内心还保留着哪一小块自留地？",
    "如果今晚可以寄一封不署名的信给半年后的自己，你想叮嘱什么？",
    "你最害怕别人看到你的哪一面？在忘忧修道院，那一面其实也很安全。",
    "今天哪一刻你其实想说“我不愿意”，却还是习惯性地点了头？"
  ];

  const RELEASE_RESPONSES = [
    "圣火轻轻卷走了那些字迹，剩下的交给海风吧。",
    "它已经化作一缕余烬升向尖顶之上，今晚不必再背着它走路了。",
    "铁盆里的木柴轻响了一声，像是在说：没关系，到这里就先放下吧。",
    "火星穿过石拱门散进星海，明天醒来时，那件事会变得比今晚轻一点。",
    "火苗舔过纸角，所有说不出口的委屈都归于温暖的灰烬。",
    "烧完啦。伸个懒腰，再多烤一会儿火吧。",
    "海风把余温吹散了，此刻的你只属于你自己的呼吸。",
    "不必强迫自己立刻开心起来，至少今晚它不再占着你的口袋了。"
  ];

  const CLOISTER_WHISPERS = [
    "石廊上的风已经吹了几百年，你的赶时间在它面前其实可以稍微慢一点。",
    "不必每件事都做到满分。有些裂缝，本来就是用来让月光照进来的。",
    "如果今晚大脑还在不停回放白天的对话，试着把那些句子想象成墙外的潮声。",
    "允许自己有一小段时间对世界“暂时失联”，天不会塌下来。",
    "你并不是一台必须时刻高效运转的机器，疲惫本来就是身体在替你喊停。",
    "真正的安宁，往往不是把所有问题解决完才出现，而是先学会在问题旁边坐一会儿。",
    "在回廊尽头没有人在给你打分，连风钟也只按自己的心情响起。",
    "那些让你羞愧或懊恼的笨拙瞬间，其实早就随着涨潮被冲散在石阶外了。",
    "如果不知道下一步要往哪里走，就先站在原地看一会儿玫瑰窗上的月光吧。",
    "你值得拥有一段没有任何目的、不被任何目标绑架的夜晚。",
    "把“我应该”换成“我现在想”，哪怕只是想多发五分钟呆。",
    "许多看似紧迫的事，放到三个月后再回头看，都只是一阵路过的薄雾。",
    "今天已经很辛苦了。剩下的路，留给睡醒之后更轻盈的自己吧。",
    "静下来听一听，你心里那个一直没被问候的声音，今天还好吗？",
    "不需要把所有情绪都整理出意义，难过也可以只是坐在这里吹吹风。",
    "天亮以后你还是要回到真实世界，但至少此刻，整座修道院都替你守着门。"
  ];

  const SEED_BOTTLES = [
    {
      id: "seed-1",
      author: "末班车上的耳机",
      text: "加完班走出写字楼已经十一点半了，路边烤红薯的大叔还没收摊。突然觉得，活在人间有时候也就图这一点点热气。",
      mood: "深夜",
      lights: 14,
      timestampLabel: "昨夜涨潮时"
    },
    {
      id: "seed-2",
      author: "阳台种薄荷的人",
      text: "今天把微信通知全关了三个小时，只看着那盆被风吹歪的薄荷发呆。好像也没错过什么天塌下来的大事。",
      mood: "放空",
      lights: 9,
      timestampLabel: "前天黄昏"
    },
    {
      id: "seed-3",
      author: "失眠的小行星",
      text: "如果你也正觉得自己“怎么还是不够好”，请先喝一口温水。我们只是太久没有被人温柔地允许慢下来了。",
      mood: "致陌生人",
      lights: 23,
      timestampLabel: "几个潮汐前"
    },
    {
      id: "seed-4",
      author: "旧书摊里的灰尘",
      text: "突然很怀念小学放学后什么都不用想、只盯着地上蚂蚁搬家的半小时。长大以后，发呆居然变成了一件需要找借口的事。",
      mood: "怀旧",
      lights: 18,
      timestampLabel: "深秋某夜"
    },
    {
      id: "seed-5",
      author: "便利店热美式",
      text: "刚在工位上哭完去洗了把脸，镜子里的自己眼睛红红的，但还是挺好看的。明天辞职或者继续干，今晚先不管。",
      mood: "释放",
      lights: 31,
      timestampLabel: "凌晨两点"
    },
    {
      id: "seed-6",
      author: "不想合群的云",
      text: "其实我并不讨厌人，只是每次聚会结束后都像电量耗尽。能在这里看着别人远处的火光却不用说话，真好。",
      mood: "微光",
      lights: 16,
      timestampLabel: "细雨天"
    },
    {
      id: "seed-7",
      author: "等天亮的船",
      text: "今天终于学会对一个并不合理的请求说了“这个我处理不了”。虽然手心冒汗，但挂掉电话那刻，窗外的树叶都变绿了。",
      mood: "边界",
      lights: 27,
      timestampLabel: "拂晓前"
    },
    {
      id: "seed-8",
      author: "404号房间",
      text: "刚刚对着海浪声发了二十分钟呆，突然记起来自己二十岁时其实很喜欢画画，只是这五年一次都没拿过画笔。",
      mood: "找回",
      lights: 12,
      timestampLabel: "星夜"
    },
    {
      id: "seed-9",
      author: "南方下雪了",
      text: "愿此刻正在看这个瓶子的你，今晚能睡一个没有梦、也没有闹钟焦虑的深觉。",
      mood: "祝福",
      lights: 19,
      timestampLabel: "刚刚飘来"
    },
    {
      id: "seed-10",
      author: "逃票看海的人",
      text: "生活总是催着我交答卷，可我有时候只想在草地上翻个身，问问风今天去哪里。",
      mood: "轻盈",
      lights: 15,
      timestampLabel: "三个潮汐前"
    },
    {
      id: "seed-11",
      author: "安静的橘子",
      text: "今天什么成就也没有完成，但我认真剥了一个完整的橘子，没有弄断白色的橘络。这也是胜利吧。",
      mood: "微小确幸",
      lights: 21,
      timestampLabel: "傍晚"
    },
    {
      id: "seed-12",
      author: "过路的风筝",
      text: "如果觉得现实里到处都是评判的目光，就把那件隐形的盔甲脱在岸边吧。海浪从来不打分。",
      mood: "慰藉",
      lights: 25,
      timestampLabel: "子夜"
    }
  ];

  const TRAVELERS = [
    {
      id: "tea-keeper",
      name: "凌晨的煮茶人",
      role: "守火者",
      color: "#c88456",
      scarfColor: "#e6b588",
      hasLantern: true,
      home: { x: -10, z: 8 },
      patrolRadius: 6,
      status: "正站在石拱门旁守着暖炉",
      greeting: "“别拘束。这壶陈皮白茶刚煮好，修道院里没有闹钟，你只管坐着发呆。”",
      teaReaction: "他默默往你手里塞了一只温热的粗陶杯，茶香混着松烟味散开，你们谁都没有再开口。",
      silentReaction: "你和煮茶人并肩望着圣火坛里跳动的火舌。石柱把影子拉得很长，世界好像只剩下木柴轻响。",
      dialogue: [
        {
          choice: "“你为什么也会来这里？”",
          reply: "“白天在现实里听了太多‘收到’‘好的’‘马上改’。到了晚上，就想找个没人认识我的地方，听听水壶烧开的声音。”"
        },
        {
          choice: "“今天过得有点累，不想说话。”",
          reply: "“那就别说。把不想记住的丢进圣火里，剩下的交给海风。天亮以后，连我也不会记得你来过。”"
        },
        {
          choice: "“这杯茶喝完，我好像又有一点力气了。”",
          reply: "“那就好。不过也别急着赶路，力气是留给自己享受微风的，不完全是为了明天去冲刺。”"
        }
      ]
    },
    {
      id: "tide-listener",
      name: "听海的影子",
      role: "拾瓶者",
      color: "#6b99c2",
      scarfColor: "#a8d0f0",
      hasLantern: false,
      home: { x: -11, z: 41 },
      patrolRadius: 8,
      status: "沿着南面的水门石阶慢慢走着",
      greeting: "“嘘——你听，第三道浪退下去的时候，声音会比前两道轻一点。”",
      teaReaction: "他接过热茶轻抿了一口，朝你微微点头：“海风有点凉，谢谢你的暖意。”",
      silentReaction: "你们隔着两步的距离站在水门旁，一起看着黑曜石般的海面把月光揉碎又拼好。",
      dialogue: [
        {
          choice: "“平时在岸上，大家好像都很忙。”",
          reply: "“是啊，忙到连自己喜不喜欢现在的日子都来不及问。但潮汐不管这些，它几万年来都是按自己的节奏涨落。”"
        },
        {
          choice: "“漂流瓶真的会有人看到吗？”",
          reply: "“总会有另一个同样睡不着、或者刚喘口气的人捡到它。哪怕只是替你点亮一盏小灯，也算隔空碰了个杯。”"
        },
        {
          choice: "“我好像快记不起自己真正的样子了。”",
          reply: "“没关系，去北边的观星钟楼坐一坐吧。不用急着找回全部，先找回一个小小的念头就够了。”"
        }
      ]
    },
    {
      id: "star-gazer",
      name: "不看表的观星客",
      role: "守夜人",
      color: "#9a87cf",
      scarfColor: "#d3c6f8",
      hasLantern: true,
      home: { x: 13, z: -38 },
      patrolRadius: 7,
      status: "仰头凝望钟楼玫瑰窗上方的星图",
      greeting: "“夜晚最公平的地方在于，无论你白天搞砸了什么，尖顶之上的星光都不会少一颗。”",
      teaReaction: "他把热茶捧在掌心暖手，轻声道：“这比城市里的自动贩卖机温暖多了。”",
      silentReaction: "你们一起仰面望着玫瑰窗后的夜空。偶尔一颗流星划过石塔，谁也没有急着许愿。",
      dialogue: [
        {
          choice: "“看着星星，总觉得自己的烦恼又小又好笑。”",
          reply: "“小归小，可它压在你肩上的时候也是真的重呀。不用否定自己的疲惫，允许它存在，然后再放它走。”"
        },
        {
          choice: "“天亮以后我们真的会忘掉这段话吗？”",
          reply: "“会的，Oublier 的意思就是遗忘。只带走那种轻松一点的感觉就够了，具体的词句就留在岛上吧。”"
        },
        {
          choice: "“祝你今晚也拥有好梦。”",
          reply: "“谢谢你。无论什么时候觉得太吵了，这座修道院都在这里，火也一直给你留着。”"
        }
      ]
    },
    {
      id: "scribe",
      name: "修道院抄书人",
      role: "听风者",
      color: "#7ca696",
      scarfColor: "#b8decb",
      hasLantern: false,
      home: { x: -36, z: -12 },
      patrolRadius: 6,
      status: "在西侧回声长廊的拱柱间慢慢踱步",
      greeting: "“以前我总想把每一页羊皮纸都抄得毫无涂改。后来风吹翻了书页，我才发现留白才是最舒服的部分。”",
      teaReaction: "他接过茶杯轻轻晃了晃：“在回廊里吹风久了，能喝到一口热茶真好。”",
      silentReaction: "你们站在对称的石拱阴影下，听着风铃发出极其轻微的一声嗡鸣，心里忽然静了下来。",
      dialogue: [
        {
          choice: "“我也总是害怕把事情做砸。”",
          reply: "“其实很多时候，‘做完’就已经够了，甚至‘今天先不做’也是一种回答。石柱缺了一角，不也照样站了几百年吗？”"
        },
        {
          choice: "“回廊里的风声听起来像有人在说话。”",
          reply: "“那是过去来过这里的旅人留下的善意。如果你心里很乱，可以去长廊尽头敲一下风钟。”"
        },
        {
          choice: "“谢谢你陪我站了一会儿。”",
          reply: "“不客气。就算什么都不做、只是散步，也完全算作好好度过了一个夜晚。”"
        }
      ]
    }
  ];

  const LANDMARKS = [
    {
      id: "campfire",
      name: "遗忘圣火坛",
      shortHint: "把想暂时忘掉的事投入圣火",
      x: 0,
      z: 0,
      radius: 7.5
    },
    {
      id: "cliff",
      name: "观星钟楼",
      shortHint: "登上北阶，在玫瑰窗下找回自己",
      x: 0,
      z: -50,
      radius: 8.5
    },
    {
      id: "pier",
      name: "潮汐石栈桥",
      shortHint: "穿过水门，打捞或投出漂流瓶",
      x: 0,
      z: 56,
      radius: 8.0
    },
    {
      id: "bench",
      name: "柏林石亭",
      shortHint: "在东林石椅静坐，跟随呼吸慢下来",
      x: 46,
      z: -8,
      radius: 7.5
    },
    {
      id: "cloister",
      name: "回声长廊",
      shortHint: "听一句长廊低语，或敲响石廊风钟",
      x: -46,
      z: -8,
      radius: 8.5
    },
    {
      id: "lighthouse",
      name: "孤灯望海台",
      shortHint: "登上东南悬崖，全景远眺整片夜海",
      x: 38,
      z: 36,
      radius: 8.0
    }
  ];

  const MOODS = {
    midnight: {
      id: "midnight",
      label: "星夜",
      skyTop: 0x070c18,
      skyHorizon: 0x1a2742,
      fogColor: 0x121b2e,
      fogDensity: 0.0058,
      moonColor: 0xe6efff,
      moonIntensity: 1.22,
      hemiSky: 0x7694c2,
      hemiGround: 0x262d3d,
      hemiIntensity: 0.88,
      seaColor: 0x0b1729,
      stoneTint: 0xd0d7e4,
      darkStoneTint: 0x9aa4b8,
      turfTint: 0xb6cab8,
      starAlpha: 0.95,
      rainIntensity: 0,
      fireflyAlpha: 0.88,
      roseGlow: 0xc2a8ff
    },
    rainy: {
      id: "rainy",
      label: "细雨",
      skyTop: 0x09121c,
      skyHorizon: 0x223642,
      fogColor: 0x172630,
      fogDensity: 0.0095,
      moonColor: 0xbad6e6,
      moonIntensity: 0.88,
      hemiSky: 0x7a9cac,
      hemiGround: 0x222f38,
      hemiIntensity: 0.82,
      seaColor: 0x0c1c26,
      stoneTint: 0xb8c8d2,
      darkStoneTint: 0x8698a6,
      turfTint: 0x9ec0b2,
      starAlpha: 0.25,
      rainIntensity: 1,
      fireflyAlpha: 0.4,
      roseGlow: 0x88c8dc
    },
    dawn: {
      id: "dawn",
      label: "拂晓",
      skyTop: 0x1d1930,
      skyHorizon: 0x62455e,
      fogColor: 0x3b2c44,
      fogDensity: 0.0056,
      moonColor: 0xffd7be,
      moonIntensity: 1.28,
      hemiSky: 0xc99bb8,
      hemiGround: 0x382d3e,
      hemiIntensity: 0.96,
      seaColor: 0x1a1c34,
      stoneTint: 0xe6d4da,
      darkStoneTint: 0xb4a0b2,
      turfTint: 0xcfc4bc,
      starAlpha: 0.45,
      rainIntensity: 0,
      fireflyAlpha: 0.65,
      roseGlow: 0xffc0a6
    }
  };

  Oublier.Data = {
    IDENTITY_POOL,
    REFLECTION_PROMPTS,
    RELEASE_RESPONSES,
    CLOISTER_WHISPERS,
    SEED_BOTTLES,
    TRAVELERS,
    LANDMARKS,
    MOODS
  };
})(window);
