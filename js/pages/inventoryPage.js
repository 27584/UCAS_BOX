import { getInventory, mergeCollections } from '../api.js';
import { itemImageHTML, QUALITY_CONFIG, openItemDetail, showToast, initItemImages } from '../utils.js';
import { createIcons, icons } from 'lucide';

export const inventoryPage = {
    items: [],
    filterType: '',
    mergeSlots: [], // 合成槽位
    mergeItems: [], // 当前可选收藏品列表

    render(container) {
        this.attachEvents(container);
        this.loadInventory();
    },

    attachEvents(container) {
        const buttons = container.querySelectorAll('.filter-btn');
        const filterType = document.getElementById('inventory-filter-type');

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderGrid(btn.dataset.filter);
            });
        });

        filterType?.addEventListener('change', (e) => {
            this.filterType = e.target.value;
            const activeBtn = container.querySelector('.filter-btn.active');
            this.renderGrid(activeBtn?.dataset.filter || 'all');
        });

        // 合成按钮
        const mergeBtn = document.getElementById('btn-open-merge');
        if (mergeBtn) {
            mergeBtn.addEventListener('click', async () => await this.openMergeModal());
        }

        // 合成弹窗事件
        this.initMergeModal();

        createIcons({ icons });
    },

    initMergeModal() {
        const modal = document.getElementById('merge-modal');
        const overlay = document.getElementById('merge-overlay');
        const closeBtn = document.getElementById('merge-close');
        const mergeBtn = document.getElementById('btn-do-merge');
        const grid = document.getElementById('merge-grid');

        // 关闭弹窗
        const closeMergeModal = () => {
            modal.style.display = 'none';
            this.mergeSlots = [];
            this.renderMergeSlots();
        };

        overlay?.addEventListener('click', closeMergeModal);
        closeBtn?.addEventListener('click', closeMergeModal);

        // 九宫格槽位点击
        grid?.addEventListener('click', (e) => {
            const slot = e.target.closest('.merge-slot');
            if (!slot) return;

            const slotIndex = parseInt(slot.dataset.slot);
            if (this.mergeSlots[slotIndex]) {
                // 槽位有物品，移除
                this.mergeSlots[slotIndex] = null;
                this.renderMergeSlots();
                this.renderMergeItemsList();
            }
        });

        // 合成按钮
        mergeBtn?.addEventListener('click', async () => this.doMerge());

        createIcons({ icons });
    },

    async openMergeModal() {
        const modal = document.getElementById('merge-modal');
        if (!modal) return;

        // 确保物品已加载
        if (!this.items || this.items.length === 0) {
            await this.loadInventory();
        }

        this.mergeSlots = Array(9).fill(null);
        this.mergeItems = this.items.filter(i => i.item_type === 'collection' && i.quality !== 'red');

        this.renderMergeSlots();
        this.renderMergeItemsList();

        modal.style.display = 'flex';
        createIcons({ icons });
    },

    renderMergeSlots() {
        const grid = document.getElementById('merge-grid');
        const countEl = document.getElementById('merge-count');
        const qualityEl = document.getElementById('merge-quality');
        const mergeBtn = document.getElementById('btn-do-merge');

        if (!grid) return;

        // 渲染槽位
        grid.querySelectorAll('.merge-slot').forEach((slot, index) => {
            const item = this.mergeSlots[index];
            if (item) {
                const cfg = QUALITY_CONFIG[item.item_quality] || QUALITY_CONFIG.white;
                slot.classList.add('filled');
                slot.innerHTML = `
                    <div class="slot-item">
                        ${itemImageHTML(item.item_name, item.item_quality, item.item_image, 40)}
                        <span class="item-name">${item.item_name}</span>
                    </div>
                    <button class="slot-remove">×</button>
                `;
            } else {
                slot.classList.remove('filled');
                slot.innerHTML = '';
            }
        });

        // 统计
        const filledSlots = this.mergeSlots.filter(s => s !== null);
        const count = filledSlots.length;
        countEl.textContent = count;

        // 检查品质是否一致
        const qualities = [...new Set(filledSlots.map(s => s?.item_quality).filter(Boolean))];
        const canMerge = count === 9 && qualities.length === 1;

        if (qualities.length === 1 && filledSlots.length > 0) {
            const cfg = QUALITY_CONFIG[qualities[0]];
            qualityEl.textContent = cfg.label;
            qualityEl.style.display = 'inline-block';

            // 检查是否可合成
            if (canMerge) {
                const qualityOrder = ['white', 'green', 'blue', 'purple', 'orange', 'red'];
                const idx = qualityOrder.indexOf(qualities[0]);
                if (idx < 5) {
                    qualityEl.classList.add('can-merge');
                    mergeBtn.disabled = false;
                } else {
                    qualityEl.textContent = '已达最高';
                    qualityEl.classList.remove('can-merge');
                    mergeBtn.disabled = true;
                }
            } else {
                qualityEl.classList.remove('can-merge');
                mergeBtn.disabled = true;
            }
        } else if (count === 0) {
            qualityEl.style.display = 'none';
            qualityEl.classList.remove('can-merge');
            mergeBtn.disabled = true;
        } else {
            qualityEl.textContent = '品质不一致';
            qualityEl.style.display = 'inline-block';
            qualityEl.classList.remove('can-merge');
            mergeBtn.disabled = true;
        }
    },

    renderMergeItemsList() {
        const list = document.getElementById('merge-items-list');
        if (!list) return;

        // 获取当前已选物品中第一个的品质（用于判断品质一致性）
        const firstSelected = this.mergeSlots.find(s => s !== null);
        const selectedQuality = firstSelected?.item_quality;

        let availableItems = this.mergeItems;

        // 如果有选中品质，过滤显示同品质的物品
        if (selectedQuality) {
            availableItems = this.mergeItems.filter(i => i.item_quality === selectedQuality);
        }

        // 统计每个物品被选中的次数
        const selectedCount = {};
        this.mergeSlots.forEach(s => {
            if (s) {
                selectedCount[s.inv_id] = (selectedCount[s.inv_id] || 0) + 1;
            }
        });

        // 统计已选物品数量
        const selectedTotal = this.mergeSlots.filter(s => s !== null).length;
        const slotsLeft = 9 - selectedTotal;

        list.innerHTML = availableItems.map(item => {
            const cfg = QUALITY_CONFIG[item.item_quality] || QUALITY_CONFIG.white;
            const selCount = selectedCount[item.inv_id] || 0;
            const remaining = item.quantity - selCount;
            // 只有当槽位满了或者该物品剩余为0时才禁用
            const isFull = slotsLeft <= 0 || remaining <= 0;

            return `
                <div class="merge-item-card ${isFull ? 'disabled' : ''}" data-inv-id="${item.inv_id}" data-item-id="${item.item_id}" data-quality="${item.item_quality}" data-name="${item.item_name}">
                    ${itemImageHTML(item.item_name, item.item_quality, item.item_image, 40)}
                    <div class="item-name">${item.item_name}</div>
                    <div class="item-count">×${remaining}</div>
                </div>
            `;
        }).join('');

        // 点击添加
        list.querySelectorAll('.merge-item-card:not(.disabled)').forEach(card => {
            card.addEventListener('click', () => {
                const invId = parseInt(card.dataset.invId);
                const itemId = parseInt(card.dataset.itemId);
                const quality = card.dataset.quality;
                const name = card.dataset.name;

                // 找空槽位
                const emptySlot = this.mergeSlots.findIndex(s => s === null);
                if (emptySlot !== -1) {
                    this.mergeSlots[emptySlot] = {
                        inv_id: invId,
                        item_id: itemId,
                        item_quality: quality,
                        item_name: name,
                        item_image: this.mergeItems.find(i => i.inv_id === invId)?.item_image
                    };
                    this.renderMergeSlots();
                    this.renderMergeItemsList();
                }
            });
        });
    },

    async doMerge() {
        const filledSlots = this.mergeSlots.filter(s => s !== null);
        if (filledSlots.length !== 9) {
            showToast('需要放入9个收藏品', 'error');
            return;
        }

        const invIds = filledSlots.map(s => s.inv_id);

        try {
            const result = await mergeCollections(invIds);
            if (result.success) {
                showToast(result.message, 'success');
                document.getElementById('merge-modal').style.display = 'none';
                this.mergeSlots = [];
                await this.loadInventory();
            } else {
                showToast(result.message || '合成失败', 'error');
            }
        } catch (e) {
            console.error(e);
            showToast('合成失败', 'error');
        }
    },

    async loadInventory() {
        try {
            this.items = await getInventory();
            this.renderGrid('all');
        } catch (e) {
            console.error('Load inventory error:', e);
            const grid = document.getElementById('inventory-grid');
            if (grid) {
                grid.innerHTML = `
                    <div class="empty-state" style="grid-column:1/-1;">
                        <p>加载失败</p>
                    </div>
                `;
            }
        }
    },

    refreshInventory() {
        this.loadInventory();
    },

    renderGrid(filter) {
        const grid = document.getElementById('inventory-grid');
        if (!grid) return;

        let filtered = filter === 'all'
            ? this.items
            : this.items.filter(i => i.item_quality === filter);

        if (this.filterType) {
            filtered = filtered.filter(i => i.item_type === this.filterType);
        }

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column:1/-1;">
                    <i data-lucide="package-open"></i>
                    <p>这里空空如也</p>
                </div>
            `;
            createIcons({ icons });
            return;
        }

        grid.innerHTML = filtered.map((inv, idx) => {
            const cfg = QUALITY_CONFIG[inv.item_quality];
            const qClass = 'quality-' + (inv.item_quality || 'white');
            return `
                <div class="item-card animate-fade-in-up ${qClass}" data-item-id="${inv.item_id}" style="animation-delay:${idx * 0.03}s">
                    <div class="item-quality-bar"></div>
                    ${itemImageHTML(inv.item_name, inv.item_quality, inv.item_image)}
                    <div class="item-name">${inv.item_name}</div>
                    <div class="item-count">x${inv.quantity}</div>
                </div>
            `;
        }).join('');
        initItemImages();

        grid.querySelectorAll('.item-card').forEach(card => {
            card.addEventListener('click', () => {
                const itemId = parseInt(card.dataset.itemId);
                const inv = this.items.find(i => i.item_id === itemId);
                if (inv) {
                    openItemDetail({
                        item_id: inv.item_id,
                        name: inv.item_name,
                        quality: inv.item_quality,
                        image_name: inv.item_image,
                        description: inv.item_description,
                        item_type: inv.item_type,
                        owned: inv.quantity,
                        reward_pool_id: inv.reward_pool_id
                    });
                }
            });
        });
    }
};
