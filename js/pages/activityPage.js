import { claimDragonBoatOnline, useDragonBoatBag, getInventory } from '../api.js';
import { createParticles, showToast, itemImageHTML, openItemDetail, QUALITY_CONFIG } from '../utils.js';
import { updateGlobalShells } from '../auth.js';
import { createIcons, icons } from 'lucide';

export const activityPage = {
    onlineTotal: 0,
    interval: null,

    render(container) {
        this.attachEvents(container);
        createParticles(container.querySelector('#activity-particles'), 20);
        this.loadActivityData();
        this.startOnlineTimer();
    },

    attachEvents(container) {
        // 领取在线礼包按钮
        ['1', '10', '60'].forEach(min => {
            const btn = container.querySelector(`#btn-claim-online-${min}`);
            if (btn) {
                btn.addEventListener('click', async () => {
                    try {
                        const result = await claimDragonBoatOnline();
                        if (result.success) {
                            this.updateOnlineDisplay(result);
                            if (result.claimed_1min || result.claimed_10min || result.claimed_60min) {
                                showToast('领取成功！获得端午节福袋！', 'success');
                            } else {
                                showToast('暂无可领取的奖励', 'info');
                            }
                        } else if (result.is_dragon_boat === false) {
                            showToast('端午活动已结束', 'info');
                        }
                    } catch (e) {
                        console.error(e);
                        showToast('领取失败', 'error');
                    }
                });
            }
        });

        createIcons({ icons });
    },

    async loadActivityData() {
        try {
            const result = await claimDragonBoatOnline();
            if (result.success) {
                this.updateOnlineDisplay(result);
            } else if (result.is_dragon_boat === false) {
                // 活动已结束，显示提示
                document.querySelector('.activity-hero').innerHTML = `
                    <div class="activity-badge" style="background:#666;">已结束</div>
                    <h1>端午活动</h1>
                    <p class="activity-date">2026年6月1日 - 6月7日</p>
                `;
                document.querySelectorAll('.btn-claim-online').forEach(btn => {
                    btn.disabled = true;
                    btn.innerHTML = '<span>已结束</span>';
                });
            }
        } catch (e) {
            console.error(e);
        }
    },

    updateOnlineDisplay(result) {
        const online = result.online_total || 0;
        this.onlineTotal = online;

        // 更新在线时间显示
        const displayEl = document.getElementById('db-online-display');
        if (displayEl) {
            displayEl.textContent = online;
        }

        // 更新按钮状态
        const claimed1 = result.claimed_1min;
        const claimed10 = result.claimed_10min;
        const claimed60 = result.claimed_60min;

        this.updateClaimButton('1', online >= 60, claimed1);
        this.updateClaimButton('10', online >= 600, claimed10);
        this.updateClaimButton('60', online >= 3600, claimed60);
    },

    updateClaimButton(minute, hasEnough, claimed) {
        const btn = document.getElementById(`btn-claim-online-${minute}`);
        const item = document.getElementById(`online-reward-${minute}`);
        if (!btn || !item) return;

        if (claimed) {
            btn.disabled = true;
            btn.innerHTML = '<span>已领取</span>';
            item.classList.add('claimed');
        } else if (hasEnough) {
            btn.disabled = false;
            item.classList.add('available');
        } else {
            btn.disabled = true;
            item.classList.remove('available');
        }
    },

    startOnlineTimer() {
        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(async () => {
            // 每30秒刷新一次在线状态
            try {
                const result = await claimDragonBoatOnline();
                if (result.success) {
                    this.updateOnlineDisplay(result);
                }
            } catch (e) {
                // ignore
            }
        }, 30000);
    },

    cleanup() {
        if (this.interval) clearInterval(this.interval);
    }
};
