import { openBox, getProfile, claimAdRewards } from '../api.js';
import { formatCountdown, showToast } from '../utils.js';
import { createIcons, icons } from 'lucide';
import { updateGlobalShells } from '../auth.js';

export const lobbyPage = {
    timer: null,
    cooldownSeconds: 600,

    render(container) {
        this.attachEvents(container);
        this.loadState();
    },

    attachEvents(container) {
        const btn = container.querySelector('#btn-open');
        const box = container.querySelector('#mystery-box');

        btn.addEventListener('click', async () => {
            if (btn.disabled) return;
            btn.disabled = true;
            box.classList.add('animate-shake');

            setTimeout(async () => {
                try {
                    console.log('[lobby] openBox clicked');
                    const result = await openBox();
                    console.log('[lobby] openBox result:', result);
                    if (result && result.length > 0) {
                        if (typeof window.showDropModal === 'function') {
                            window.showDropModal(result[0]);
                        } else {
                            console.error('[lobby] window.showDropModal is not a function!');
                            alert('showDropModal 未加载，请刷新页面 (Ctrl+Shift+R)');
                        }
                        this.startCooldown(new Date());
                        try { updateGlobalShells(); } catch (e) { console.error('updateGlobalShells error:', e); }
                    }
                } catch (err) {
                    console.error('[lobby] openBox error:', err);
                    box.classList.remove('animate-shake');
                    btn.disabled = false;
                }
            }, 600);
        });

        // 广告书签按钮
        const btnAd = container.querySelector('#btn-watch-ad');
        const btnPlay = container.querySelector('#btn-just-play');
        if (btnAd) {
            btnAd.addEventListener('click', async () => {
                if (btnAd.classList.contains('disabled')) return;
                btnAd.disabled = true;
                try {
                    const reward = await claimAdRewards();
                    const adUrl = 'https://27584.github.io/Man/';
                    window.open(adUrl, '_blank');
                    await updateGlobalShells();
                    showToast(`恭喜！获得 ${reward} 果壳币`, 'success');
                    btnAd.innerHTML = '<i data-lucide="check-circle"></i><span>今日已领取</span>';
                    btnAd.classList.add('disabled');
                    if (btnPlay) btnPlay.style.display = 'flex';
                    createIcons({ icons });
                } catch (e) {
                    btnAd.disabled = false;
                }
            });
        }
        if (btnPlay) {
            btnPlay.addEventListener('click', () => {
                const adUrl = 'https://27584.github.io/Man/';
                window.open(adUrl, '_blank');
            });
        }

        createIcons({ icons });
    },

    async loadState() {
        try {
            const profile = await getProfile();
            if (profile?.last_open_at) {
                this.startCooldown(new Date(profile.last_open_at));
            }
            if (profile?.ad_claimed_at) {
                const claimDate = new Date(profile.ad_claimed_at).toISOString().split('T')[0];
                const today = new Date().toISOString().split('T')[0];
                const btnAd = document.getElementById('btn-watch-ad');
                const btnPlay = document.getElementById('btn-just-play');
                if (btnAd && claimDate === today) {
                    btnAd.innerHTML = '<i data-lucide="check-circle"></i><span>今日已领取</span>';
                    btnAd.classList.add('disabled');
                    if (btnPlay) btnPlay.style.display = 'flex';
                }
            }
        } catch (e) {
            console.error(e);
        }
    },

    startCooldown(lastOpenDate) {
        const btn = document.getElementById('btn-open');
        const countdownEl = document.getElementById('countdown-display');
        const timerEl = document.getElementById('countdown-timer');
        const textEl = document.getElementById('cooldown-text');

        if (this.timer) clearInterval(this.timer);

        const update = () => {
            const diff = Math.floor((Date.now() - lastOpenDate.getTime()) / 1000);
            const remaining = this.cooldownSeconds - diff;

            if (remaining <= 0) {
                if (this.timer) clearInterval(this.timer);
                btn.disabled = false;
                countdownEl.style.display = 'none';
                textEl.style.display = 'block';
                textEl.textContent = '盒子已就绪，点击开启！';
                return;
            }

            btn.disabled = true;
            countdownEl.style.display = 'flex';
            textEl.style.display = 'none';
            timerEl.textContent = formatCountdown(remaining);
        };

        update();
        this.timer = setInterval(update, 1000);
    }
};
