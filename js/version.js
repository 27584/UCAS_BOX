// ============================================
// 版本信息与更新日志
// ============================================

export const VERSION = 'v0.2.8_beta';

export const CHANGELOG = [
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
