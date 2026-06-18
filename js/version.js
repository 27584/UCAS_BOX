// ============================================
// 版本信息与更新日志
// ============================================

export const VERSION = 'v0.1.0_beta';

export const CHANGELOG = [
    {
        version: 'v0.1.0_beta',
        date: '2026-06-18',
        type: 'feature',
        features: [
            '开盒系统 - 每10分钟可开启一次神秘盒子',
            '挂机收益 - 离线自动积累果壳币',
            '背包系统 - 存放和管理收藏品',
            '市场系统 - 玩家间自由交易物品',
            '收藏图鉴 - 追踪已收集的物品',
            '广告奖励 - 每日随机领取 1000-10000 果壳币',
            '系统邮件 - 交易成功后自动通知',
            '投稿系统 - 玩家可投稿收藏品，管理员审核后获得果壳币奖励',
            '管理员面板 - 用户管理、物品发放、投稿审核'
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
