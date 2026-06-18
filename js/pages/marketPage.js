import { getMarketOrders, getInventory, buyMarketOrder, cancelMarketOrder, placeMarketOrder, getProfile } from '../api.js';
import { itemImageHTML, formatNumber, showToast, QUALITY_CONFIG, openItemDetail } from '../utils.js';
import { createIcons, icons } from 'lucide';
import { updateGlobalShells } from '../auth.js';

export const marketPage = {
    orders: [],
    inventory: [],
    myId: null,
    tab: 'browse',

    render(container) {
        this.attachEvents(container);
        this.loadData();
    },

    attachEvents(container) {
        container.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.tab = btn.dataset.tab;
                container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderContent();
            });
        });
        createIcons({ icons });
    },

    async loadData() {
        try {
            const [orders, profile] = await Promise.all([
                getMarketOrders(),
                getProfile()
            ]);
            this.orders = orders;
            this.myId = profile?.id;
            this.renderContent();
        } catch (e) {
            console.error(e);
        }
    },

    async loadInventoryForSell() {
        try {
            this.inventory = await getInventory();
            this.renderSellForm();
        } catch (e) {
            showToast('加载背包失败', 'error');
        }
    },

    renderContent() {
        const content = document.getElementById('market-content');
        if (this.tab === 'browse') {
            this.renderBrowse(content);
        } else if (this.tab === 'my') {
            this.renderMyOrders(content);
        } else if (this.tab === 'sell') {
            this.loadInventoryForSell();
            content.innerHTML = '<div class="skeleton" style="height:200px;"></div>';
        }
        createIcons({ icons });
    },

    renderBrowse(container) {
        if (this.orders.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="store"></i>
                    <p>市场暂无订单</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="market-list">
                ${this.orders.map(order => this.orderCard(order, false)).join('')}
            </div>
        `;

        container.querySelectorAll('.btn-buy').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                btn.disabled = true;
                try {
                    await buyMarketOrder(id);
                    showToast('购买成功！', 'success');
                    await updateGlobalShells();
                    await this.loadData();
                } catch (e) {
                    btn.disabled = false;
                }
            });
        });

        container.querySelectorAll('.market-card-item').forEach(card => {
            card.addEventListener('click', () => {
                const itemId = parseInt(card.dataset.itemId);
                const order = this.orders.find(o => o.item_id === itemId);
                if (order) {
                    openItemDetail({
                        id: order.item_id,
                        name: order.item_name,
                        quality: order.item_quality,
                        image_name: order.item_image,
                        description: order.item_description,
                        owned: 0
                    });
                }
            });
        });
    },

    renderMyOrders(container) {
        const myOrders = this.orders.filter(o => o.seller_id === this.myId);
        if (myOrders.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="clipboard-list"></i>
                    <p>你没有正在出售的订单</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="market-list">
                ${myOrders.map(order => this.orderCard(order, true)).join('')}
            </div>
        `;

        container.querySelectorAll('.btn-cancel').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = parseInt(btn.dataset.id);
                btn.disabled = true;
                try {
                    await cancelMarketOrder(id);
                    showToast('已下架', 'info');
                    await this.loadData();
                } catch (e) {
                    btn.disabled = false;
                }
            });
        });
    },

    renderSellForm() {
        const container = document.getElementById('market-content');
        if (this.inventory.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="package-x"></i>
                    <p>背包为空，无可出售物品</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="sell-form card">
                <div class="form-group">
                    <label class="form-label">选择物品</label>
                    <div class="sell-item-grid" id="sell-item-grid"></div>
                </div>
                <div class="form-group">
                    <label class="form-label">单价（果壳币）</label>
                    <input type="number" class="form-input" id="sell-price" placeholder="输入价格" min="1" />
                </div>
                <div class="form-group">
                    <label class="form-label">数量</label>
                    <input type="number" class="form-input" id="sell-qty" value="1" min="1" />
                </div>
                <button class="btn btn-primary" id="btn-publish">
                    <i data-lucide="upload"></i>
                    <span>发布出售</span>
                </button>
            </div>
        `;

        const grid = container.querySelector('#sell-item-grid');
        let selectedId = null;

        grid.innerHTML = this.inventory.map(inv => `
            <div class="sell-item-card" data-id="${inv.item_id}" data-max="${inv.quantity}">
                ${itemImageHTML(inv.item_name, inv.item_quality, inv.item_image)}
                <div class="sell-item-name">${inv.item_name}</div>
                <div class="sell-item-qty">拥有: ${inv.quantity}</div>
            </div>
        `).join('');

        grid.querySelectorAll('.sell-item-card').forEach(card => {
            card.addEventListener('click', () => {
                grid.querySelectorAll('.sell-item-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                selectedId = parseInt(card.dataset.id);
            });
        });

        container.querySelector('#btn-publish').addEventListener('click', async () => {
            const price = parseInt(container.querySelector('#sell-price').value);
            const qty = parseInt(container.querySelector('#sell-qty').value) || 1;
            if (!selectedId) { showToast('请选择物品', 'error'); return; }
            if (!price || price <= 0) { showToast('请输入有效价格', 'error'); return; }

            try {
                await placeMarketOrder(selectedId, price, qty);
                showToast('发布成功', 'success');
                this.tab = 'my';
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'my'));
                await this.loadData();
            } catch (e) {}
        });

        createIcons({ icons });
    },

    orderCard(order, isOwner) {
        const cfg = QUALITY_CONFIG[order.item_quality];
        const total = order.price_per_unit * order.quantity;
        return `
            <div class="market-card">
                <div class="market-card-item" data-item-id="${order.item_id}">
                    ${itemImageHTML(order.item_name, order.item_quality, order.item_image)}
                    <div class="market-card-info">
                        <div class="market-card-name">${order.item_name}</div>
                        <span class="quality-badge quality-${order.item_quality}">${cfg.label}</span>
                    </div>
                </div>
                <div class="market-card-meta">
                    <div class="market-card-price">${formatNumber(order.price_per_unit)} x ${order.quantity}</div>
                    <div class="market-card-total">合计: ${formatNumber(total)} 果壳币</div>
                    ${!isOwner ? `<div class="market-card-seller">卖家: ${order.seller_nickname || '未知'}</div>` : ''}
                </div>
                ${isOwner
                    ? `<button class="btn btn-danger btn-cancel" data-id="${order.order_id}">下架</button>`
                    : `<button class="btn btn-primary btn-buy" data-id="${order.order_id}">购买</button>`
                }
            </div>
        `;
    }
};
