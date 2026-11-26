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
    "屋顶数云的人",
    "借火的夜行人",
    "折纸船的旧梦",
    "海岸线散步者",
    "不回消息的猫",
    "等潮汐的灯塔",
    "便利店关门前的风",
    "落叶里的书签",
    "替月亮守夜的人",
    "失眠的松果",
    "没有日程表的星期天",
    "只喝热水的星",
    "岸边微醺的月影"
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
    "你最害怕别人看到你的哪一面？在忘忧屿，那一面其实也很安全。",
    "今天哪一刻你其实想说“我不愿意”，却还是习惯性地点了头？"
  ];

  const RELEASE_RESPONSES = [
    "火光轻轻卷走了那些字迹，剩下的交给海风吧。",
    "它已经化作一缕青烟升向夜空，今晚不必再背着它走路了。",
    "篝火哔剥响了一声，像是在说：没关系，到这里就先放下吧。",
    "火星散进星海里，明天醒来时，那件事会变得比今晚轻一点。",
    "火苗舔过纸角，所有说不出口的委屈都归于温暖的灰烬。",
    "烧完啦。伸个懒腰，再多烤一会儿火吧。",
    "海风把余温吹散了，此刻的你只属于你自己的呼吸。",
    "不必强迫自己立刻开心起来，至少今晚它不再占着你的口袋了。"
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
      color: "#f2b880",
      home: { x: -72, y: 36 },
      patrolRadius: 34,
      status: "正往小泥炉里添一块松木",
      greeting: "“别拘束。这壶陈皮白茶刚煮好，岛上没有闹钟，你只管坐着发呆。”",
      teaReaction: "他默默往你手里塞了一只温热的粗陶杯，茶香混着松烟味散开，你们谁都没有再开口。",
      silentReaction: "你和煮茶人并肩望着跳动的火舌。火光把影子拉得很长，世界好像只剩下木柴轻轻炸开的声响。",
      dialogue: [
        {
          choice: "“你为什么也会来这座岛？”",
          reply: "“白天在现实里听了太多‘收到’‘好的’‘马上改’。到了晚上，就想找个没人认识我的地方，听听水壶烧开的声音。”"
        },
        {
          choice: "“今天过得有点累，不想说话。”",
          reply: "“那就别说。把不想记住的丢进火里，剩下的交给海风。天亮以后，连我也不会记得你来过。”"
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
      color: "#8cc4e8",
      home: { x: -135, y: 120 },
      patrolRadius: 52,
      status: "沿着潮湿的沙岸慢慢走着",
      greeting: "“嘘——你听，第三道浪退下去的时候，声音会比前两道轻一点。”",
      teaReaction: "他接过热茶轻抿了一口，朝你微微点头：“海风有点凉，谢谢你的暖意。”",
      silentReaction: "你们隔着两步的距离站在岸边，一起看着浪花把月光揉碎又拼好。孤独感忽然变得很温柔。",
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
          reply: "“没关系，去北边的观星石阶坐一坐吧。不用急着找回全部，先找回一个小小的念头就够了。”"
        }
      ]
    },
    {
      id: "star-gazer",
      name: "不看表的观星客",
      role: "守夜人",
      color: "#c5b5f2",
      home: { x: 108, y: -115 },
      patrolRadius: 48,
      status: "仰头辨认松林上方的星图",
      greeting: "“夜晚最公平的地方在于，无论你白天搞砸了什么，头顶的星光都不会少一颗。”",
      teaReaction: "他把热茶捧在掌心暖手，轻声道：“这比城市里的自动贩卖机温暖多了。”",
      silentReaction: "你们一起仰面望着缓缓流动的星河。偶尔一颗流星划过，谁也没有急着许愿。",
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
          reply: "“谢谢你。无论什么时候觉得太吵了，这座岛都在这里，火也一直给你留着。”"
        }
      ]
    }
  ];

  const LANDMARKS = [
    {
      id: "campfire",
      name: "遗忘篝火",
      shortHint: "把想暂时忘掉的事丢进火里",
      x: 0,
      y: 12,
      radius: 68
    },
    {
      id: "pier",
      name: "潮汐栈桥",
      shortHint: "打捞漂流瓶，或寄出你的只言片语",
      x: 0,
      y: 222,
      radius: 72
    },
    {
      id: "cliff",
      name: "观星石阶",
      shortHint: "回答一个温柔的问题，找回自己",
      x: 0,
      y: -178,
      radius: 68
    },
    {
      id: "bench",
      name: "静谧长椅",
      shortHint: "坐下来，跟随呼吸慢一分钟",
      x: 185,
      y: -26,
      radius: 64
    }
  ];

  const MOODS = {
    midnight: {
      id: "midnight",
      label: "星夜",
      skyTop: "#060b16",
      skyBottom: "#0e1a30",
      seaOuter: "#081224",
      seaInner: "#132948",
      foam: "rgba(182, 214, 248, 0.22)",
      sand: "#2b303f",
      turfOuter: "#172638",
      turfInner: "#21364c",
      treeDark: "#0e1b2c",
      treeLight: "#16293f",
      starAlpha: 0.95,
      rainIntensity: 0,
      fireflyAlpha: 0.85,
      fogColor: "rgba(18, 32, 58, 0.22)"
    },
    rainy: {
      id: "rainy",
      label: "细雨",
      skyTop: "#09131a",
      skyBottom: "#142632",
      seaOuter: "#0a1720",
      seaInner: "#193342",
      foam: "rgba(176, 218, 232, 0.24)",
      sand: "#29333a",
      turfOuter: "#172b33",
      turfInner: "#203b44",
      treeDark: "#0d1c22",
      treeLight: "#162d36",
      starAlpha: 0.22,
      rainIntensity: 1,
      fireflyAlpha: 0.35,
      fogColor: "rgba(130, 175, 195, 0.14)"
    },
    dawn: {
      id: "dawn",
      label: "拂晓",
      skyTop: "#1a172c",
      skyBottom: "#422c46",
      seaOuter: "#18192e",
      seaInner: "#373052",
      foam: "rgba(246, 206, 188, 0.28)",
      sand: "#423743",
      turfOuter: "#26283e",
      turfInner: "#353652",
      treeDark: "#191a2d",
      treeLight: "#272742",
      starAlpha: 0.45,
      rainIntensity: 0,
      fireflyAlpha: 0.6,
      fogColor: "rgba(244, 178, 148, 0.16)"
    }
  };

  Oublier.Data = {
    IDENTITY_POOL,
    REFLECTION_PROMPTS,
    RELEASE_RESPONSES,
    SEED_BOTTLES,
    TRAVELERS,
    LANDMARKS,
    MOODS
  };
})(window);
