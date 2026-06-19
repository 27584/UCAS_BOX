import { claimIdleRewards, getProfile, claimAdRewards, getIdleBoost } from '../api.js';
import { formatNumber, createParticles, showToast } from '../utils.js';
import { updateGlobalShells } from '../auth.js';
import { createIcons, icons } from 'lucide';

export const idlePage = {
    interval: null,
    lastClaim: null,
    baseRate: 1,
    boostRate: 0,
    boostLoaded: false,

    render(container) {
        this.boostLoaded = false;
        this.attachEvents(container);
        this.initState();
    },

    attachEvents(container) {
        const btn = container.querySelector('#btn-claim');
        const btnAd = container.querySelector('#btn-watch-ad');

        btn.addEventListener('click', async () => {
            if (!this.boostLoaded) {
                showToast('正在加载加成信息，请稍候...', 'info');
                return;
            }
            btn.disabled = true;
            try {
                const reward = await claimIdleRewards();
                if (reward > 0) {
                    showToast(`领取成功！获得 ${reward} 果壳币`, 'success');
                    await updateGlobalShells();
                } else {
                    showToast('暂无收益可领取', 'info');
                }
                this.lastClaim = new Date();
                await this.loadBoost();
                this.updateDisplay();
            } catch (e) {
                btn.disabled = false;
            }
        });

        btnAd.addEventListener('click', async () => {
            btnAd.disabled = true;
            try {
                const reward = await claimAdRewards();
                const adUrl = 'https://27584.github.io/Man/';
                window.open(adUrl, '_blank');
                await updateGlobalShells();
                showToast(`恭喜！获得 ${reward} 果壳币`, 'success');
                btnAd.innerHTML = '<i data-lucide="check-circle"></i><span>今日已领取</span>';
                btnAd.classList.add('disabled');
                createIcons({ icons });
            } catch (e) {
                btnAd.disabled = false;
            }
        });

        createParticles(container.querySelector('#idle-particles'), 30);
        createIcons({ icons });
    },

    async initState() {
        try {
            const profile = await getProfile();
            if (profile?.last_claim_at) {
                this.lastClaim = new Date(profile.last_claim_at);
            } else {
                this.lastClaim = new Date();
            }
            if (profile?.ad_claimed_at) {
                const claimDate = new Date(profile.ad_claimed_at).toISOString().split('T')[0];
                const today = new Date().toISOString().split('T')[0];
                const btn = document.getElementById('btn-watch-ad');
                if (btn && claimDate === today) {
                    btn.innerHTML = '<i data-lucide="check-circle"></i><span>今日已领取</span>';
                    btn.classList.add('disabled');
                }
            }
            await this.loadBoost();
            this.updateDisplay();
            this.interval = setInterval(() => this.updateDisplay(), 1000);
        } catch (e) {
            console.error(e);
        }
    },

    async loadBoost() {
        try {
            this.boostRate = await getIdleBoost();
            this.boostLoaded = true;
        } catch (e) {
            this.boostRate = 0;
            this.boostLoaded = true;
        }
    },

    updateDisplay() {
        if (!this.lastClaim) return;
        const diffSec = Math.max(0, (Date.now() - this.lastClaim.getTime()) / 1000);
        const cappedSec = Math.min(diffSec, 480 * 60); // 最多8小时
        const diffMin = diffSec / 60;
        const totalRate = this.baseRate + this.boostRate;
        const amount = Math.floor(diffMin * totalRate);

        const amountEl = document.getElementById('earning-amount');
        const boostEl = document.getElementById('earning-boost');
        const boostValueEl = document.getElementById('boost-value');
        const totalEl = document.getElementById('earning-total');
        const timeEl = document.getElementById('earning-time');

        if (amountEl) {
            if (!this.boostLoaded) {
                amountEl.textContent = '加载中...';
            } else {
                amountEl.textContent = formatNumber(amount);
            }
        }
        if (boostValueEl) boostValueEl.textContent = '+' + this.boostRate;
        if (boostEl) boostEl.style.display = this.boostRate > 0 ? 'block' : 'none';
        if (totalEl) totalEl.textContent = '总速率：' + totalRate + ' / 分钟';

        if (timeEl) {
            const formatTime = (s) => {
                const h = Math.floor(s / 3600);
                const m = Math.floor((s % 3600) / 60);
                const sec = Math.floor(s % 60);
                return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
            };
            timeEl.textContent = `已挂机：${formatTime(cappedSec)} / 08:00:00`;
        }
    },

    cleanup() {
        if (this.interval) clearInterval(this.interval);
    }
};
