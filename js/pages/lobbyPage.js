import { openBox, getProfile } from '../api.js';
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

        createIcons({ icons });
    },

    async loadState() {
        try {
            const profile = await getProfile();
            if (profile?.last_open_at) {
                this.startCooldown(new Date(profile.last_open_at));
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
