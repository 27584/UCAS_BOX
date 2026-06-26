import { claimIdleRewards, getProfile, claimAdRewards, getIdleBoost, getFarmInfo, plantSeed, harvestCrop, harvestAllReady, getInventory, speedUpPlot } from '../api.js';
import { formatNumber, createParticles, showToast } from '../utils.js';
import { updateGlobalShells } from '../auth.js';
import { createIcons, icons } from 'lucide';

export const idlePage = {
    interval: null,
    farmInterval: null,
    lastClaim: null,
    baseRate: 1,
    boostRate: 0,
    boostLoaded: false,
    currentTab: 'idle',
    farmData: null,
    inventoryData: [],

    render(container) {
        this.boostLoaded = false;
        this.attachEvents(container);
        this.initState();
    },

    attachEvents(container) {
        // 挂机分页按钮
        const btn = container.querySelector('#btn-claim');

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

        // 挂机/农场分页切换
        container.querySelectorAll('.idle-tab').forEach(tabBtn => {
            tabBtn.addEventListener('click', () => {
                this.switchTab(tabBtn.dataset.tab);
            });
        });

        // 一键收获
        const btnHarvestAll = container.querySelector('#btn-harvest-all');
        if (btnHarvestAll) {
            btnHarvestAll.addEventListener('click', () => this.handleHarvestAll());
        }

        // 关闭模态框
        document.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = document.getElementById('plant-modal');
                if (modal) modal.style.display = 'none';
            });
        });
        const modal = document.getElementById('plant-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal-overlay')) modal.style.display = 'none';
            });
        }

        createParticles(container.querySelector('#idle-particles'), 30);
        createIcons({ icons });
    },

    switchTab(tabName) {
        this.currentTab = tabName;
        document.querySelectorAll('.idle-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tabName);
        });
        document.querySelectorAll('.idle-tab-content').forEach(c => {
            const isActive = c.dataset.tab === tabName;
            c.classList.toggle('active', isActive);
            c.style.display = isActive ? 'block' : 'none';
        });

        if (tabName === 'farm') {
            this.loadFarm();
        }
    },

    async initState() {
        try {
            const profile = await getProfile();
            if (profile?.last_claim_at) {
                this.lastClaim = new Date(profile.last_claim_at);
            } else {
                this.lastClaim = new Date();
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
        const cappedSec = Math.min(diffSec, 480 * 60);
        const diffMin = cappedSec / 60;
        const totalRate = this.baseRate + this.boostRate;
        const amount = Math.floor(diffMin * totalRate);

        const amountEl = document.getElementById('earning-amount');
        const boostEl = document.getElementById('earning-boost');
        const boostValueEl = document.getElementById('boost-value');
        const totalEl = document.getElementById('earning-total');
        const timeEl = document.getElementById('earning-time');

        if (amountEl) {
            amountEl.textContent = this.boostLoaded ? formatNumber(amount) : '加载中...';
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

    // ============================================
    // 农场相关方法
    // ============================================

    async loadFarm() {
        try {
            const [farmInfo, inventory] = await Promise.all([
                getFarmInfo(),
                getInventory()
            ]);
            this.farmData = farmInfo;
            this.inventoryData = inventory || [];
            this.renderFarm();
            if (this.farmInterval) clearInterval(this.farmInterval);
            this.farmInterval = setInterval(() => this.updateFarmTimers(), 1000);
        } catch (e) {
            console.error('加载农场失败:', e);
            showToast('加载农场失败', 'error');
        }
    },

    renderFarm() {
        if (!this.farmData) return;

        // 等级信息
        const levelInfo = this.farmData.level_info || {};
        document.getElementById('farm-level').textContent = this.farmData.farm_level;
        document.getElementById('farm-level-title').textContent = '农场等级';
        document.getElementById('farm-total-harvests').textContent = this.farmData.total_harvests;

        const currentExp = this.farmData.exp;
        const expRequired = levelInfo.exp_required || 0;
        const nextLevelExp = levelInfo.next_level_exp || expRequired;
        const expInLevel = currentExp - expRequired;
        const expToNext = nextLevelExp - expRequired;
        const percent = expToNext > 0 ? Math.min(100, (expInLevel / expToNext) * 100) : 100;

        document.getElementById('farm-exp-current').textContent = currentExp;
        document.getElementById('farm-exp-next').textContent = nextLevelExp;
        document.getElementById('farm-exp-fill').style.width = percent + '%';

        // 渲染12块土地
        this.renderPlots();

        createIcons({ icons });
    },

    renderPlots() {
        const grid = document.getElementById('farm-plots-grid');
        if (!grid || !this.farmData) return;

        const plots = this.farmData.plots || [];
        const plotsUnlocked = this.farmData.level_info?.plots_unlocked || 1;

        grid.innerHTML = plots.map((plot, idx) => {
            const isUnlocked = plot.is_unlocked || idx < plotsUnlocked;
            let stateClass = '';
            let content = '';
            let action = '';

            if (!isUnlocked) {
                stateClass = 'plot-locked';
                content = `
                    <div class="plot-locked-content">
                        <i data-lucide="lock"></i>
                        <span>未解锁</span>
                    </div>
                `;
            } else if (plot.crop_id) {
                stateClass = 'plot-planted';
                if (plot.is_ready) {
                    stateClass += ' plot-ready';
                    content = `
                        <div class="plot-crop-ready">
                            <i data-lucide="check-circle"></i>
                            <span class="plot-crop-name">${this.escapeHtml(plot.crop_name || '成熟')}</span>
                        </div>
                        <div class="plot-crop-info">可收获！</div>
                    `;
                    action = `<button class="btn btn-primary btn-harvest" data-plot-id="${plot.id}">收获</button>`;
                } else {
                    const remaining = plot.remaining_seconds || 0;
                    content = `
                        <div class="plot-crop-growing">
                            <i data-lucide="sprout"></i>
                            <span class="plot-crop-name">${this.escapeHtml(plot.crop_name)}</span>
                        </div>
                        <div class="plot-crop-timer" data-plot-id="${plot.id}" data-planted="${plot.planted_at}" data-grow="${plot.grow_seconds}">
                            ${this.formatTime(remaining)}
                        </div>
                    `;
                    action = `<button class="btn btn-secondary btn-speed" data-plot-id="${plot.id}">加速</button>`;
                }
            } else {
                stateClass = 'plot-empty';
                content = `
                    <div class="plot-empty-content">
                        <i data-lucide="plus"></i>
                        <span>空地</span>
                    </div>
                `;
                action = `<button class="btn btn-primary btn-plant" data-plot-id="${plot.id}">播种</button>`;
            }

            return `
                <div class="farm-plot ${stateClass}">
                    <div class="plot-number">#${idx + 1}</div>
                    <div class="plot-content">${content}</div>
                    ${action ? `<div class="plot-action">${action}</div>` : ''}
                </div>
            `;
        }).join('');

        // 绑定事件
        grid.querySelectorAll('.btn-plant').forEach(btn => {
            btn.addEventListener('click', () => this.openPlantModal(btn.dataset.plotId));
        });
        grid.querySelectorAll('.btn-harvest').forEach(btn => {
            btn.addEventListener('click', () => this.handleHarvest(btn.dataset.plotId));
        });
        grid.querySelectorAll('.btn-speed').forEach(btn => {
            btn.addEventListener('click', () => this.handleSpeedUp(btn.dataset.plotId));
        });

        createIcons({ icons });
    },

    openPlantModal(plotId) {
        if (!this.farmData) return;
        const modal = document.getElementById('plant-modal');
        const body = document.getElementById('plant-modal-body');
        if (!modal || !body) return;

        const crops = this.farmData.crops || [];
        const seedsWithCount = crops.map(crop => {
            const inv = this.inventoryData.find(i => i.item_id === crop.seed_id);
            return { ...crop, owned: inv ? inv.quantity : 0 };
        }).filter(s => s.owned > 0);

        if (seedsWithCount.length === 0) {
            body.innerHTML = `
                <div style="text-align:center;padding:40px 20px;color:var(--ink-soft);">
                    <i data-lucide="package-x" style="width:48px;height:48px;margin-bottom:12px;opacity:0.5;"></i>
                    <p style="margin:0;font-family:var(--font-mono);font-size:0.95rem;">背包中没有种子</p>
                    <p style="margin:8px 0 0;font-size:0.8rem;opacity:0.7;">获取种子后再来播种吧</p>
                </div>
            `;
        } else {
            body.innerHTML = seedsWithCount.map(s => `
                <div class="plant-seed-card" data-crop-id="${s.id}">
                    <div class="plant-seed-name">${this.escapeHtml(s.seed_name)}</div>
                    <div class="plant-seed-meta">
                        收获：${this.escapeHtml(s.crop_name)} · ${this.formatTime(s.grow_seconds)} · +${s.exp_reward}EXP
                    </div>
                    <div class="plant-seed-count">库存：x${s.owned}</div>
                </div>
            `).join('');

            body.querySelectorAll('.plant-seed-card').forEach(card => {
                card.addEventListener('click', () => {
                    this.handlePlant(plotId, card.dataset.cropId);
                });
            });
        }

        modal.style.display = 'flex';
        createIcons({ icons });
    },

    async handlePlant(plotId, cropId) {
        try {
            const result = await plantSeed(parseInt(plotId), parseInt(cropId));
            if (result?.success) {
                showToast(result.message, 'success');
                document.getElementById('plant-modal').style.display = 'none';
                await this.loadFarm();
            } else {
                showToast(result?.message || '播种失败', 'error');
            }
        } catch (e) {
            showToast('播种失败：' + e.message, 'error');
        }
    },

    async handleHarvest(plotId) {
        try {
            const result = await harvestCrop(parseInt(plotId));
            if (result?.success) {
                showToast(`收获 ${result.item_name} x${result.quantity}，+${result.exp_gained} EXP`, 'success');
                await this.loadFarm();
            } else {
                showToast(result?.message || '收获失败', 'error');
            }
        } catch (e) {
            showToast('收获失败：' + e.message, 'error');
        }
    },

    async handleHarvestAll() {
        try {
            const result = await harvestAllReady();
            if (result?.harvest_count > 0) {
                const itemList = (result.items || []).map(i => `${i.name}x${i.quantity}`).join(', ');
                showToast(`收获 ${result.harvest_count} 个作物，+${result.total_exp} EXP\n${itemList}`, 'success');
                await this.loadFarm();
            } else {
                showToast('暂无可收获的作物', 'info');
            }
        } catch (e) {
            showToast('收获失败：' + e.message, 'error');
        }
    },

    async handleSpeedUp(plotId) {
        const seconds = prompt('输入要加速的秒数（每2秒消耗1果壳币）：', '60');
        if (!seconds) return;
        const sec = parseInt(seconds);
        if (isNaN(sec) || sec <= 0) {
            showToast('请输入有效数字', 'error');
            return;
        }
        try {
            const result = await speedUpPlot(parseInt(plotId), sec);
            if (result?.success) {
                showToast(`加速成功，消耗 ${result.cost} 果壳币`, 'success');
                await this.loadFarm();
            } else {
                showToast(result?.message || '加速失败', 'error');
            }
        } catch (e) {
            showToast('加速失败：' + e.message, 'error');
        }
    },

    updateFarmTimers() {
        document.querySelectorAll('.plot-crop-timer').forEach(el => {
            const planted = new Date(el.dataset.planted).getTime();
            const grow = parseInt(el.dataset.grow) * 1000;
            const remaining = Math.max(0, planted + grow - Date.now());
            el.textContent = this.formatTime(Math.floor(remaining / 1000));
        });
    },

    formatTime(sec) {
        if (sec == null || sec < 0) sec = 0;
        if (sec < 60) return `${sec}秒`;
        if (sec < 3600) return `${Math.floor(sec / 60)}分${sec % 60}秒`;
        if (sec < 86400) {
            const h = Math.floor(sec / 3600);
            const m = Math.floor((sec % 3600) / 60);
            return `${h}时${m}分`;
        }
        const d = Math.floor(sec / 86400);
        const h = Math.floor((sec % 86400) / 3600);
        return `${d}天${h}时`;
    },

    escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    cleanup() {
        if (this.interval) clearInterval(this.interval);
        if (this.farmInterval) clearInterval(this.farmInterval);
    }
};
