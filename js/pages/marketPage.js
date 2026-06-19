import { getMarketOrders, getInventory, buyMarketOrder, cancelMarketOrder, placeMarketOrder, getProfile } from '../api.js';
import { itemImageHTML, formatNumber, showToast, QUALITY_CONFIG, ITEM_TYPE_CONFIG, openItemDetail } from '../utils.js';
import { createIcons, icons } from 'lucide';
import { updateGlobalShells } from '../auth.js';

const PAGE_SIZE = 10;

export const marketPage = {
    orders: [],
    inventory: [],
    myId: null,
    tab: 'browse',
    page: 1,
    totalCount: 0,
    filterQuality: '',
    filterSort: 'newest',
    filterSearch: '',
    filterType: '',
    isLoading: false,

    render(container) {
        this.attachEvents(container);
        this.loadData();
    },

    attachEvents(container) {
        container.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.tab = btn.dataset.tab;
                this.page = 1;
                container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderContent();
            });
        });

        // 筛选事件
        const filterQuality = document.getElementById('filter-quality');
        const filterSort = document.getElementById('filter-sort');
        const filterSearch = document.getElementById('filter-search');
        const filterType = document.getElementById('filter-type');

        filterQuality?.addEventListener('change', (e) => {
            this.filterQuality = e.target.value;
            this.page = 1;
            this.loadBrowseData();
        });

        filterSort?.addEventListener('change', (e) => {
            this.filterSort = e.target.value;
            this.page = 1;
            this.loadBrowseData();
        });

        filterType?.addEventListener('change', (e) => {
            this.filterType = e.target.value;
            this.page = 1;
            this.loadBrowseData();
        });

        let searchTimeout;
        filterSearch?.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.filterSearch = e.target.value.trim();
                this.page = 1;
                this.loadBrowseData();
            }, 300);
        });

        createIcons({ icons });
    },

    async loadData() {
        try {
            const profile = await getProfile();
            this.myId = profile?.id;
            this.renderContent();
        } catch (e) {
            console.error(e);
        }
    },

    async loadBrowseData() {
        if (this.isLoading) return;
        this.isLoading = true;

        const content = document.getElementById('market-content');
        content.innerHTML = '<div class="skeleton" style="height:200px;"></div>';

        try {
            const data = await getMarketOrders(
                this.page,
                PAGE_SIZE,
                this.filterQuality || null,
                this.filterSort,
                this.filterSearch || null,
                this.filterType || null
            );
            
            this.orders = data || [];
            this.totalCount = data[0]?.total_count || 0;
            this.renderBrowse(content);
        } catch (e) {
            console.error(e);
            content.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        } finally {
            this.isLoading = false;
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
        const filterBar = document.getElementById('market-filter');
        const pagination = document.getElementById('market-pagination');

        if (this.tab === 'browse') {
            filterBar.style.display = 'flex';
            pagination.style.display = 'flex';
            this.loadBrowseData();
        } else if (this.tab === 'my') {
            filterBar.style.display = 'none';
            pagination.style.display = 'none';
            this.loadMyOrdersData();
        } else if (this.tab === 'sell') {
            filterBar.style.display = 'none';
            pagination.style.display = 'none';
            this.loadInventoryForSell();
            content.innerHTML = '<div class="skeleton" style="height:200px;"></div>';
        }
        createIcons({ icons });
    },

    async loadMyOrdersData() {
        const content = document.getElementById('market-content');
        content.innerHTML = '<div class="skeleton" style="height:200px;"></div>';
        
        try {
            // 获取所有订单来筛选我的订单（或者创建专门的 RPC）
            const allOrders = await getMarketOrders(1, 1000);
            const myOrders = (allOrders || []).filter(o => o.seller_id === this.myId);
            this.renderMyOrders(content, myOrders);
        } catch (e) {
            content.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    },

    renderBrowse(container) {
        if (this.orders.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="store"></i>
                    <p>没有符合条件的订单</p>
                </div>
            `;
            this.renderPagination(0);
            return;
        }

        container.innerHTML = `
            <div class="market-list">
                ${this.orders.map(order => this.orderCard(order, false)).join('')}
            </div>
        `;

        const totalPages = Math.ceil(this.totalCount / PAGE_SIZE);
        this.renderPagination(totalPages);

        container.querySelectorAll('.btn-buy').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                btn.disabled = true;
                try {
                    await buyMarketOrder(id);
                    showToast('购买成功！', 'success');
                    await updateGlobalShells();
                    this.loadBrowseData();
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
                        item_type: order.item_type,
                        owned: 0
                    });
                }
            });
        });

        createIcons({ icons });
    },

    renderPagination(totalPages) {
        const pagination = document.getElementById('market-pagination');
        if (!pagination || totalPages <= 1) {
            if (pagination) pagination.style.display = totalPages <= 1 ? 'none' : 'flex';
            return;
        }

        pagination.style.display = 'flex';
        
        // 限制显示的页码数量
        const maxVisiblePages = 5;
        let startPage = Math.max(1, this.page - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        pagination.innerHTML = `
            <button class="page-btn" data-page="${this.page - 1}" ${this.page === 1 ? 'disabled' : ''}>
                <i data-lucide="chevron-left"></i>
            </button>
            ${startPage > 1 ? '<button class="page-btn" data-page="1">1</button>' : ''}
            ${startPage > 2 ? '<span class="page-ellipsis">...</span>' : ''}
            ${Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i).map(p => `
                <button class="page-btn ${p === this.page ? 'active' : ''}" data-page="${p}">${p}</button>
            `).join('')}
            ${endPage < totalPages - 1 ? '<span class="page-ellipsis">...</span>' : ''}
            ${endPage < totalPages ? `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>` : ''}
            <button class="page-btn" data-page="${this.page + 1}" ${this.page === totalPages ? 'disabled' : ''}>
                <i data-lucide="chevron-right"></i>
            </button>
        `;

        pagination.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = parseInt(btn.dataset.page);
                if (p >= 1 && p <= totalPages && p !== this.page) {
                    this.page = p;
                    this.loadBrowseData();
                }
            });
        });

        createIcons({ icons });
    },

    renderMyOrders(container, myOrders) {
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
                    this.loadMyOrdersData();
                } catch (e) {
                    btn.disabled = false;
                }
            });
        });

        createIcons({ icons });
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
                this.renderContent();
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
