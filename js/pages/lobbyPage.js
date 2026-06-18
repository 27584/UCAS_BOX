import { openBox, getProfile } from '../api.js';
import { formatCountdown, itemImageHTML, showToast, QUALITY_CONFIG } from '../utils.js';
import { createIcons } from 'lucide';

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
                    const result = await openBox();
                    if (result && result.length > 0) {
                        this.showDrop(result[0]);
                        this.startCooldown(new Date());
                        this.updateGlobalShells();
                    }
                } catch (err) {
                    box.classList.remove('animate-shake');
                    btn.disabled = false;
                }
            }, 600);
        });

        document.getElementById('drop-close').addEventListener('click', () => {
            document.getElementById('drop-modal').style.display = 'none';
            box.classList.remove('animate-shake');
        });

        createIcons();
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
                textEl.textContent = '宝盒已就绪，点击开启！';
                return;
            }

            btn.disabled = true;
            countdownEl.style.display = 'flex';
            textEl.style.display = 'none';
            timerEl.textContent = formatCountdown(remaining);
        };

        update();
        this.timer = setInterval(update, 1000);
    },

    showDrop(item) {
        const modal = document.getElementById('drop-modal');
        const glow = document.getElementById('drop-glow');
        const placeholder = document.getElementById('drop-placeholder');
        const nameEl = document.getElementById('drop-name');
        const qualityEl = document.getElementById('drop-quality');
        const cfg = QUALITY_CONFIG[item.item_quality] || QUALITY_CONFIG.white;

        glow.style.background = cfg.color;
        placeholder.innerHTML = itemImageHTML(item.item_name, item.item_quality, item.item_image, 96);
        nameEl.textContent = item.item_name;
        nameEl.style.color = cfg.color;
        qualityEl.textContent = cfg.label;
        qualityEl.className = `quality-badge quality-${item.item_quality}`;

        modal.style.display = 'flex';
    },

    async updateGlobalShells() {
        try {
            const profile = await getProfile();
            const el = document.getElementById('global-shells');
            if (el && profile) el.textContent = profile.shells;
        } catch (e) {}
    }
};
