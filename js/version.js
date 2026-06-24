// ============================================
// 版本信息与更新日志
// ============================================

export const VERSION = 'v0.7.0_beta';
export const VERSION_CODE = 7; // 绝对版本号

export const CHANGELOG = [{
        version: 'v0.7.0_beta',
        date: '2026-06-24',
        type: 'feature',
        features: [
            "新增农场",
        ]
    },{
        version: 'v0.6.2_beta',
        date: '2026-06-23',
        type: 'feature',
        features: [
            "私信页面显示在线状态",
            "新增在线状态隐私设置",
            "回复通知区分一级评论和回复评论",
        ]
    }, {
        version: 'v0.6.1_beta',
        date: '2026-06-23',
        type: 'feature',
        features: [
            "新增市场行情",
            "新增回复通知",
            "新增关注与好友页面",
        ]
    }, {
        version: 'v0.5.0_beta',
        date: '2026-06-22',
        type: 'feature',
        features: [
            "优化UI",
        ]
    }, {
        version: 'v0.4.4_beta',
        date: '2026-06-20',
        type: 'feature',
        features: [
            "新增随机商品",
            "新增动态、个人主页与私信",
            "更新若干图片",
            "优化一些UI",
        ]
    }, {
        version: 'v0.3.2_beta',
        date: '2026-06-19',
        type: 'feature',
        features: [
            "新增彩票，快来试试手气吧~",
            "新增收藏品合成，9个低品级可以合成一个高品级收藏品",
            "新增版本检测",
            "降低广告奖励为1000-5000",
        ]
    },
      {
        version: 'v0.2.8_beta',
        date: '2026-06-19',
        type: 'feature',
        features: [
            "降低了挂机奖励",
            "修复移动端图鉴不显示的问题",
            "修复市场筛选的问题",
            '修复了邮箱注册的问题，如果需要改邮箱可联系管理员',
            '修复了若干UI问题',
            "新增端午节活动！",
            "新增购买数量设置",
            "新增图鉴分页",
            "新增物品类型",
            "新增市场筛选、分页、搜索",
        ]
    },
    {
        version: 'v0.1.0_beta',
        date: '2026-06-18',
        type: 'feature',
        features: [
            '开盒系统 - 每10分钟可开启一次神秘盒子',
            '挂机收益 - 在线/离线自动积累果壳币',
            '背包系统 - 存放和管理收藏品',
            '市场系统 - 玩家间自由交易物品',
            '收藏图鉴 - 追踪已收集的物品',
            '广告奖励 - 每日随机领取 1000-10000 果壳币',
            '系统邮件 - 交易成功后自动通知'
        ]
    }
];

export function getVersionInfo() {
    const latest = CHANGELOG[0];
    return {
        version: VERSION,
        date: latest.date,
        type: latest.type,
        features: latest.features
    };
}
