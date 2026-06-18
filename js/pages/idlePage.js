import { claimIdleRewards, getProfile, claimAdRewards, getIdleBoost } from '../api.js';
import { formatNumber, createParticles, showToast } from '../utils.js';
import { createIcons } from 'lucide';

export const idlePage = {
    interval: null,
    lastClaim: null,
    baseRate: 10,
    boostRate: 0,

    render(container) {
        this.attachEvents(container);
        this.initState();
    },

    attachEvents(container) {
        const btn = container.querySelector('#btn-claim');
        const btnAd = container.querySelector('#btn-watch-ad');

        btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
                const reward = await claimIdleRewards();
                if (reward > 0) {
                    showToast(`领取成功！获得 ${reward} 果壳币`, 'success');
                } else {
                    showToast('暂无收益可领取', 'info');
                }
                this.lastClaim = new Date();
                await this.loadBoost();
                this.updateDisplay();
            } catch (e) {
            } finally {
                btn.disabled = false;
            }
        });

        btnAd.addEventListener('click', async () => {
            btnAd.disabled = true;
            try {
                await claimAdRewards();
                const adUrl = 'https://www.bilibili.com/video/BV17K411M7rX/';
                window.open(adUrl, '_blank');
                showToast('恭喜！获得 500 果壳币', 'success');
                btnAd.innerHTML = '<i data-lucide="check-circle"></i><span>已领取</span>';
                btnAd.classList.add('disabled');
                createIcons();
            } catch (e) {
                btnAd.disabled = false;
            }
        });

        createParticles(container.querySelector('#idle-particles'), 30);
        createIcons();
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
                const btn = document.getElementById('btn-watch-ad');
                if (btn) {
                    btn.innerHTML = '<i data-lucide="check-circle"></i><span>已领取</span>';
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
        } catch (e) {
            this.boostRate = 0;
        }
    },

    updateDisplay() {
        if (!this.lastClaim) return;
        const diffMin = Math.max(0, (Date.now() - this.lastClaim.getTime()) / 60000);
        const totalRate = this.baseRate + this.boostRate;
        const amount = Math.floor(diffMin * totalRate);

        const amountEl = document.getElementById('earning-amount');
        const boostEl = document.getElementById('earning-boost');
        const boostValueEl = document.getElementById('boost-value');
        const totalEl = document.getElementById('earning-total');

        if (amountEl) amountEl.textContent = formatNumber(amount);
        if (boostValueEl) boostValueEl.textContent = '+' + this.boostRate;
        if (boostEl) boostEl.style.display = this.boostRate > 0 ? 'block' : 'none';
        if (totalEl) totalEl.textContent = '总速率：' + totalRate + ' / 分钟';
    },

    cleanup() {
        if (this.interval) clearInterval(this.interval);
    }
};
