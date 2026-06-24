import { getMarketOrders, getInventory, buyMarketOrder, cancelMarketOrder, placeMarketOrder, getProfile, getItemTradeHistory, getItemTradeStats, createBuyRequest, cancelBuyRequest, getMyBuyRequests, getBuyRequests, getItems, sellToBuyRequest } from '../api.js';
import { itemImageHTML, formatNumber, showToast, QUALITY_CONFIG, ITEM_TYPE_CONFIG, openItemDetail, initItemImages, userBadgeHTML, upgradeSelectsToSearchable } from '../utils.js';
import { createIcons, icons } from 'lucide';
import { updateGlobalShells } from '../auth.js';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

const PAGE_SIZE = 10;

export const marketPage = {
    orders: [],
    inventory: [],
    inventoryMap: {},
    allItems: [],
    myId: null,
    tab: 'browse',
    page: 1,
    totalCount: 0,
    filterQuality: '',
    filterSort: 'newest',
    filterSearch: '',
    filterType: '',
    isLoading: false,
    // 求购相关
    buyRequests: [],
    myBuyRequests: [],
    brPage: 1,
    brTotalCount: 0,
    brFilterQuality: '',
    brFilterSort: 'newest',
    brFilterSearch: '',
    brFilterType: '',

    render(container) {
        this.attachEvents(container);
        this.loadData();
    },

    attachEvents(container) {
        container.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.tab = btn.dataset.tab;
                this.page = 1;
                this.brPage = 1;
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

        // 求购筛选事件
        const brFilterQuality = document.getElementById('br-filter-quality');
        const brFilterSort = document.getElementById('br-filter-sort');
        const brFilterSearch = document.getElementById('br-filter-search');
        const brFilterType = document.getElementById('br-filter-type');

        brFilterQuality?.addEventListener('change', (e) => {
            this.brFilterQuality = e.target.value;
            this.brPage = 1;
            this.loadBuyRequestsData();
        });

        brFilterSort?.addEventListener('change', (e) => {
            this.brFilterSort = e.target.value;
            this.brPage = 1;
            this.loadBuyRequestsData();
        });

        brFilterType?.addEventListener('change', (e) => {
            this.brFilterType = e.target.value;
            this.brPage = 1;
            this.loadBuyRequestsData();
        });

        let brSearchTimeout;
        brFilterSearch?.addEventListener('input', (e) => {
            clearTimeout(brSearchTimeout);
            brSearchTimeout = setTimeout(() => {
                this.brFilterSearch = e.target.value.trim();
                this.brPage = 1;
                this.loadBuyRequestsData();
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
            // 同时加载市场订单和用户背包
            const [data, inventory] = await Promise.all([
                getMarketOrders(
                    this.page,
                    PAGE_SIZE,
                    this.filterQuality || null,
                    this.filterSort,
                    this.filterSearch || null,
                    this.filterType || null
                ),
                getInventory()
            ]);
            
            this.orders = data || [];
            this.totalCount = data[0]?.total_count || 0;
            // 保存背包数据用于查找拥有数量
            this.inventoryMap = {};
            (inventory || []).forEach(item => {
                this.inventoryMap[item.item_id] = item.quantity;
            });
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
        const brFilterBar = document.getElementById('buy-request-filter');
        const pagination = document.getElementById('market-pagination');
        const brPagination = document.getElementById('buy-request-pagination');

        // 首先隐藏所有筛选栏和分页
        filterBar.style.display = 'none';
        brFilterBar.style.display = 'none';
        pagination.style.display = 'none';
        brPagination.style.display = 'none';

        if (this.tab === 'browse') {
            filterBar.style.display = 'flex';
            pagination.style.display = 'flex';
            this.loadBrowseData();
        } else if (this.tab === 'buy-requests') {
            brFilterBar.style.display = 'flex';
            brPagination.style.display = 'flex';
            this.loadBuyRequestsData();
        } else if (this.tab === 'my') {
            this.loadMyOrdersData();
        } else if (this.tab === 'sell') {
            this.loadInventoryForSell();
            content.innerHTML = '<div class="skeleton" style="height:200px;"></div>';
        } else if (this.tab === 'buy') {
            this.loadBuyForm();
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
        initItemImages();

        const totalPages = Math.ceil(this.totalCount / PAGE_SIZE);
        this.renderPagination(totalPages);

        container.querySelectorAll('.btn-buy').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                const order = this.orders.find(o => o.order_id === id);
                if (order) {
                    this.openBuyModal(order);
                }
            });
        });

        container.querySelectorAll('.btn-trade-history').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const itemId = parseInt(btn.dataset.itemId);
                const itemName = btn.dataset.itemName;
                this.openTradeHistoryModal(itemId, itemName);
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
                        owned: this.inventoryMap?.[itemId] || 0
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
        initItemImages();

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

        container.querySelectorAll('.btn-trade-history').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const itemId = parseInt(btn.dataset.itemId);
                const itemName = btn.dataset.itemName;
                this.openTradeHistoryModal(itemId, itemName);
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
            <div class="sell-layout">
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
                <div class="sell-chart-panel card">
                    <h3><i data-lucide="trending-up"></i> 物品行情</h3>
                    <div class="sell-chart-empty" id="sell-chart-empty">
                        <p>请选择一个物品查看行情</p>
                    </div>
                    <div class="sell-chart-container" id="sell-chart-container" style="display:none;">
                        <div class="chart-tabs">
                            <button class="chart-tab active" data-group="hour">小时</button>
                            <button class="chart-tab" data-group="day">日</button>
                        </div>
                        <div class="chart-container" style="height:200px;">
                            <canvas id="sell-trade-chart"></canvas>
                        </div>
                        <div class="trade-stats">
                            <div class="trade-stat">
                                <span class="stat-label">总交易量</span>
                                <span class="stat-value" id="sell-stat-qty">-</span>
                            </div>
                            <div class="trade-stat">
                                <span class="stat-label">总交易额</span>
                                <span class="stat-value" id="sell-stat-price">-</span>
                            </div>
                            <div class="trade-stat">
                                <span class="stat-label">交易次数</span>
                                <span class="stat-value" id="sell-stat-count">-</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const grid = container.querySelector('#sell-item-grid');
        let selectedId = null;
        let selectedName = '';

        grid.innerHTML = this.inventory.map(inv => `
            <div class="sell-item-card" data-id="${inv.item_id}" data-name="${inv.item_name}" data-max="${inv.quantity}">
                ${itemImageHTML(inv.item_name, inv.item_quality, inv.item_image)}
                <div class="sell-item-name">${inv.item_name}</div>
                <div class="sell-item-qty">拥有: ${inv.quantity}</div>
            </div>
        `).join('');
        initItemImages();

        const self = this;
        grid.querySelectorAll('.sell-item-card').forEach(card => {
            card.addEventListener('click', function() {
                grid.querySelectorAll('.sell-item-card').forEach(c => c.classList.remove('selected'));
                this.classList.add('selected');
                selectedId = parseInt(this.dataset.id);
                selectedName = this.dataset.name;
                console.log('Selected item:', selectedId, selectedName);
                self.loadSellItemStats(selectedId, selectedName);
            });
        });

        container.querySelectorAll('.chart-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                container.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                if (selectedId) {
                    self.loadSellItemStats(selectedId, selectedName, this.dataset.group);
                }
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
                    <div class="market-card-price-row">
                        <span class="market-card-unit-price">
                            <i data-lucide="coins" class="market-coin-icon"></i>
                            ${formatNumber(order.price_per_unit)} 果壳币
                        </span>
                        <span class="market-card-qty">数量 ${order.quantity}</span>
                    </div>
                    ${!isOwner ? `<div class="market-card-seller">卖家: ${order.seller_nickname || '未知'}${userBadgeHTML({is_admin: order.seller_is_admin, is_bot: order.seller_is_bot})}</div>` : ''}
                </div>
                <div class="market-card-actions">
                    ${isOwner
                        ? `<button class="btn btn-danger btn-cancel" data-id="${order.order_id}">下架</button>`
                        : `<button class="btn btn-primary btn-buy" data-id="${order.order_id}">购买</button>`
                    }
                    <button class="btn btn-outline btn-trade-history" data-item-id="${order.item_id}" data-item-name="${order.item_name}">
                        <i data-lucide="trending-up"></i>
                        行情
                    </button>
                </div>
            </div>
        `;
    },

    openBuyModal(order) {
        const existingModal = document.getElementById('buy-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const pricePerUnit = order.price_per_unit;
        let quantity = 1;
        const self = this;

        const modalHtml = `
            <div id="buy-modal" class="modal" style="display:flex;">
                <div class="modal-overlay" id="buy-overlay"></div>
                <div class="modal-content buy-modal-card">
                    <button class="btn-close" id="buy-close"><i data-lucide="x"></i></button>
                    <div class="buy-header">
                        <h3>确认购买</h3>
                    </div>
                    <div class="buy-body">
                        <div class="buy-item-info">
                            <div class="buy-item-name">${order.item_name}</div>
                            <div class="buy-item-price">
                                <i data-lucide="coins" class="market-coin-icon"></i>
                                <span id="buy-total-price">${formatNumber(pricePerUnit)}</span> 果壳币
                            </div>
                        </div>
                        <div id="market-buy-quantity-selector">
                            <span id="market-buy-quantity-label">购买数量</span>
                            <div id="market-buy-quantity-controls">
                                <button id="market-qty-minus" class="market-qty-btn">
                                    <i data-lucide="minus"></i>
                                </button>
                                <input type="number" id="market-buy-quantity" value="1" min="1" max="${order.quantity}">
                                <button id="market-qty-plus" class="market-qty-btn">
                                    <i data-lucide="plus"></i>
                                </button>
                            </div>
                        </div>
                        <div class="buy-hint">
                            购买后物品将直接放入您的背包
                        </div>
                    </div>
                    <div class="buy-footer">
                        <button id="buy-cancel" class="btn btn-secondary">取消</button>
                        <button id="buy-confirm" class="btn btn-primary">
                            <i data-lucide="shopping-cart"></i>
                            确认购买
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        createIcons({ icons });

        const modal = document.getElementById('buy-modal');
        const quantityInput = document.getElementById('market-buy-quantity');
        const totalPriceEl = document.getElementById('buy-total-price');
        const minusBtn = document.getElementById('market-qty-minus');
        const plusBtn = document.getElementById('market-qty-plus');
        const confirmBtn = document.getElementById('buy-confirm');
        const cancelBtn = document.getElementById('buy-cancel');
        const closeBtn = document.getElementById('buy-close');
        const overlay = document.getElementById('buy-overlay');

        function closeModal() {
            modal.remove();
        }

        function updatePrice() {
            const total = pricePerUnit * quantity;
            totalPriceEl.textContent = formatNumber(total);
            quantityInput.value = quantity;
        }

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', closeModal);

        minusBtn.addEventListener('click', () => {
            if (quantity > 1) {
                quantity--;
                updatePrice();
            }
        });

        plusBtn.addEventListener('click', () => {
            if (quantity < order.quantity) {
                quantity++;
                updatePrice();
            }
        });

        quantityInput.addEventListener('change', () => {
            let val = parseInt(quantityInput.value) || 1;
            if (val < 1) val = 1;
            if (val > order.quantity) val = order.quantity;
            quantity = val;
            updatePrice();
        });

        confirmBtn.addEventListener('click', async () => {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> 购买中...';
            createIcons({ icons });

            try {
                await buyMarketOrder(order.order_id, quantity);
                showToast(`购买成功 ${quantity} 件！`, 'success');
                await updateGlobalShells();
                self.loadBrowseData();
                closeModal();
            } catch (e) {
                showToast('购买失败', 'error');
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i data-lucide="shopping-cart"></i> 确认购买';
                createIcons({ icons });
            }
        });
    },

    tradeChart: null,
    sellTradeChart: null,

    openTradeHistoryModal(itemId, itemName) {
        const existingModal = document.getElementById('trade-history-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modalHtml = `
            <div id="trade-history-modal" class="modal" style="display:flex;">
                <div class="modal-overlay" id="trade-overlay"></div>
                <div class="modal-content trade-history-card">
                    <button class="btn-close" id="trade-close"><i data-lucide="x"></i></button>
                    <div class="trade-header">
                        <h3><i data-lucide="trending-up"></i> ${itemName} 交易行情</h3>
                    </div>
                    <div class="trade-body">
                        <div class="chart-tabs">
                            <button class="chart-tab active" data-group="hour">小时</button>
                            <button class="chart-tab" data-group="day">日</button>
                        </div>
                        <div class="chart-container">
                            <canvas id="trade-chart"></canvas>
                        </div>
                        <div class="trade-stats">
                            <div class="trade-stat">
                                <span class="stat-label">总交易量</span>
                                <span class="stat-value" id="stat-total-qty">-</span>
                            </div>
                            <div class="trade-stat">
                                <span class="stat-label">总交易额</span>
                                <span class="stat-value" id="stat-total-price">-</span>
                            </div>
                            <div class="trade-stat">
                                <span class="stat-label">交易次数</span>
                                <span class="stat-value" id="stat-trade-count">-</span>
                            </div>
                        </div>
                        <div class="trade-history-list" id="trade-history-list">
                            <div class="skeleton" style="height:150px;"></div>
                        </div>
                    </div>
                    <div class="trade-footer">
                        <button id="trade-close-btn" class="btn btn-secondary">关闭</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        createIcons({ icons });

        const modal = document.getElementById('trade-history-modal');
        const closeBtn = document.getElementById('trade-close');
        const overlay = document.getElementById('trade-overlay');
        const closeBtn2 = document.getElementById('trade-close-btn');

        function closeModal() {
            modal.remove();
            if (this.tradeChart) {
                this.tradeChart.destroy();
                this.tradeChart = null;
            }
        }

        closeBtn.addEventListener('click', closeModal.bind(this));
        closeBtn2.addEventListener('click', closeModal.bind(this));
        overlay.addEventListener('click', closeModal.bind(this));

        document.querySelectorAll('.chart-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.loadTradeStats(itemId, tab.dataset.group);
            });
        });

        this.loadTradeStats(itemId, 'hour');
        this.loadTradeHistory(itemId);
    },

    async loadTradeStats(itemId, groupBy) {
        try {
            const stats = await getItemTradeStats(itemId, groupBy);
            this.renderChart(stats);
            this.updateStats(stats);
        } catch (e) {
            console.error('加载交易统计失败:', e);
            const ctx = document.getElementById('trade-chart');
            if (ctx) {
                ctx.style.display = 'none';
            }
            document.getElementById('stat-total-qty').textContent = 'N/A';
            document.getElementById('stat-total-price').textContent = 'N/A';
            document.getElementById('stat-trade-count').textContent = 'N/A';
        }
    },

    async loadTradeHistory(itemId) {
        const listEl = document.getElementById('trade-history-list');
        try {
            const history = await getItemTradeHistory(itemId, 20);
            if (!history || history.length === 0) {
                listEl.innerHTML = '<div class="empty-state"><p>暂无交易记录</p></div>';
                return;
            }

            listEl.innerHTML = `
                <div class="trade-history-header">
                    <span>时间</span>
                    <span>单价</span>
                    <span>数量</span>
                    <span>总额</span>
                </div>
                ${history.map(h => `
                    <div class="trade-history-item">
                        <span>${new Date(h.created_at).toLocaleString()}</span>
                        <span>${formatNumber(h.price_per_unit)}</span>
                        <span>${h.quantity}</span>
                        <span>${formatNumber(h.total_price)}</span>
                    </div>
                `).join('')}
            `;
        } catch (e) {
            listEl.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    },

    renderChart(stats) {
        const ctx = document.getElementById('trade-chart');
        if (!ctx) return;

        if (this.tradeChart) {
            this.tradeChart.destroy();
        }

        if (!stats || stats.length === 0) {
            ctx.style.display = 'none';
            return;
        }

        ctx.style.display = 'block';
        const labels = stats.map(s => s.period);
        const prices = stats.map(s => s.avg_price);
        const quantities = stats.map(s => s.total_quantity);

        this.tradeChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '平均价格',
                        data: prices,
                        borderColor: '#e74c3c',
                        backgroundColor: 'rgba(231, 76, 60, 0.1)',
                        yAxisID: 'y',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: '成交数量',
                        data: quantities,
                        borderColor: '#3498db',
                        backgroundColor: 'rgba(52, 152, 219, 0.1)',
                        yAxisID: 'y1',
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            font: {
                                family: 'Special Elite, monospace'
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: '#2c2c2c',
                        titleFont: { family: 'Special Elite' },
                        bodyFont: { family: 'Special Elite' },
                        padding: 12,
                        cornerRadius: 4
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(0,0,0,0.1)'
                        },
                        ticks: {
                            font: {
                                family: 'Special Elite, monospace'
                            },
                            maxRotation: 45,
                            minRotation: 45
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        grid: {
                            color: 'rgba(0,0,0,0.1)'
                        },
                        ticks: {
                            font: {
                                family: 'Special Elite, monospace'
                            }
                        },
                        title: {
                            display: true,
                            text: '价格 (果壳币)',
                            font: {
                                family: 'Special Elite'
                            }
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        grid: {
                            drawOnChartArea: false
                        },
                        ticks: {
                            font: {
                                family: 'Special Elite, monospace'
                            }
                        },
                        title: {
                            display: true,
                            text: '数量',
                            font: {
                                family: 'Special Elite'
                            }
                        }
                    }
                }
            }
        });
    },

    updateStats(stats) {
        if (!stats || stats.length === 0) return;

        const totalQty = stats.reduce((sum, s) => sum + s.total_quantity, 0);
        const totalPrice = stats.reduce((sum, s) => sum + (s.avg_price * s.total_quantity), 0);
        const tradeCount = stats.reduce((sum, s) => sum + s.trade_count, 0);

        document.getElementById('stat-total-qty').textContent = formatNumber(totalQty);
        document.getElementById('stat-total-price').textContent = formatNumber(totalPrice);
        document.getElementById('stat-trade-count').textContent = tradeCount;
    },

    async loadSellItemStats(itemId, itemName, groupBy = 'hour') {
        console.log('loadSellItemStats called:', itemId, itemName, groupBy);
        try {
            const stats = await getItemTradeStats(itemId, groupBy);
            console.log('Stats received:', stats);
            this.renderSellChart(stats, itemName);
            this.updateSellStats(stats);
        } catch (e) {
            console.error('加载交易统计失败:', e);
            this.renderSellChart([], itemName);
            this.updateSellStats([]);
        }
    },

    renderSellChart(stats, itemName = '') {
        const ctx = document.getElementById('sell-trade-chart');
        const emptyEl = document.getElementById('sell-chart-empty');
        const containerEl = document.getElementById('sell-chart-container');
        
        if (!ctx) return;

        if (this.sellTradeChart) {
            this.sellTradeChart.destroy();
            this.sellTradeChart = null;
        }

        if (!stats || stats.length === 0) {
            emptyEl.innerHTML = `
                <div class="empty-trade-info">
                    <p><strong>${itemName || '该物品'}</strong></p>
                    <p>暂无交易记录</p>
                    <p style="font-size:0.8rem;color:var(--ink-mute);">成为第一个交易此物品的人吧！</p>
                </div>
            `;
            emptyEl.style.display = 'block';
            containerEl.style.display = 'none';
            return;
        }

        emptyEl.style.display = 'none';
        containerEl.style.display = 'block';

        const labels = stats.map(s => s.period);
        const prices = stats.map(s => s.avg_price);
        const quantities = stats.map(s => s.total_quantity);

        this.sellTradeChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '平均价格',
                        data: prices,
                        borderColor: '#e74c3c',
                        backgroundColor: 'rgba(231, 76, 60, 0.1)',
                        yAxisID: 'y',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: '成交数量',
                        data: quantities,
                        borderColor: '#3498db',
                        backgroundColor: 'rgba(52, 152, 219, 0.1)',
                        yAxisID: 'y1',
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            font: {
                                family: 'Special Elite, monospace'
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: '#2c2c2c',
                        titleFont: { family: 'Special Elite' },
                        bodyFont: { family: 'Special Elite' },
                        padding: 12,
                        cornerRadius: 4
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(0,0,0,0.1)'
                        },
                        ticks: {
                            font: {
                                family: 'Special Elite, monospace'
                            },
                            maxRotation: 45,
                            minRotation: 45
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        grid: {
                            color: 'rgba(0,0,0,0.1)'
                        },
                        ticks: {
                            font: {
                                family: 'Special Elite, monospace'
                            }
                        },
                        title: {
                            display: true,
                            text: '价格',
                            font: {
                                family: 'Special Elite'
                            }
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        grid: {
                            drawOnChartArea: false
                        },
                        ticks: {
                            font: {
                                family: 'Special Elite, monospace'
                            }
                        },
                        title: {
                            display: true,
                            text: '数量',
                            font: {
                                family: 'Special Elite'
                            }
                        }
                    }
                }
            }
        });
    },

    updateSellStats(stats) {
        if (!stats || stats.length === 0) {
            document.getElementById('sell-stat-qty').textContent = 'N/A';
            document.getElementById('sell-stat-price').textContent = 'N/A';
            document.getElementById('sell-stat-count').textContent = 'N/A';
            return;
        }

        const totalQty = stats.reduce((sum, s) => sum + s.total_quantity, 0);
        const totalPrice = stats.reduce((sum, s) => sum + (s.avg_price * s.total_quantity), 0);
        const tradeCount = stats.reduce((sum, s) => sum + s.trade_count, 0);

        document.getElementById('sell-stat-qty').textContent = formatNumber(totalQty);
        document.getElementById('sell-stat-price').textContent = formatNumber(totalPrice);
        document.getElementById('sell-stat-count').textContent = tradeCount;
    },

    async loadBuyItemStats(itemId, itemName, groupBy = 'hour') {
        try {
            const stats = await getItemTradeStats(itemId, groupBy);
            this.renderBuyChart(stats, itemName);
            this.updateBuyStats(stats);
        } catch (e) {
            console.error('加载交易统计失败:', e);
            this.renderBuyChart([], itemName);
            this.updateBuyStats([]);
        }
    },

    renderBuyChart(stats, itemName = '') {
        const ctx = document.getElementById('buy-trade-chart');
        const emptyEl = document.getElementById('buy-chart-empty');
        const containerEl = document.getElementById('buy-chart-container');
        
        if (!ctx) return;

        if (this.buyTradeChart) {
            this.buyTradeChart.destroy();
            this.buyTradeChart = null;
        }

        if (!stats || stats.length === 0) {
            emptyEl.innerHTML = `
                <div class="empty-trade-info">
                    <p><strong>${itemName || '该物品'}</strong></p>
                    <p>暂无交易记录</p>
                    <p style="font-size:0.8rem;color:var(--ink-mute);">成为第一个交易此物品的人吧！</p>
                </div>
            `;
            emptyEl.style.display = 'block';
            containerEl.style.display = 'none';
            return;
        }

        emptyEl.style.display = 'none';
        containerEl.style.display = 'block';

        const labels = stats.map(s => s.period);
        const prices = stats.map(s => s.avg_price);
        const quantities = stats.map(s => s.total_quantity);

        this.buyTradeChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '平均价格',
                        data: prices,
                        borderColor: '#e84a3c',
                        backgroundColor: 'rgba(232, 74, 60, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        yAxisID: 'y'
                    },
                    {
                        label: '交易量',
                        data: quantities,
                        borderColor: '#2e7d32',
                        backgroundColor: 'rgba(46, 125, 50, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            font: {
                                family: 'Special Elite, monospace'
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: '#2c2c2c',
                        titleFont: { family: 'Special Elite' },
                        bodyFont: { family: 'Special Elite' },
                        padding: 12,
                        cornerRadius: 4
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(0,0,0,0.1)'
                        },
                        ticks: {
                            font: {
                                family: 'Special Elite, monospace'
                            },
                            maxRotation: 45,
                            minRotation: 45
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        grid: {
                            color: 'rgba(0,0,0,0.1)'
                        },
                        ticks: {
                            font: {
                                family: 'Special Elite, monospace'
                            }
                        },
                        title: {
                            display: true,
                            text: '价格',
                            font: {
                                family: 'Special Elite'
                            }
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        grid: {
                            drawOnChartArea: false
                        },
                        ticks: {
                            font: {
                                family: 'Special Elite, monospace'
                            }
                        },
                        title: {
                            display: true,
                            text: '数量',
                            font: {
                                family: 'Special Elite'
                            }
                        }
                    }
                }
            }
        });
    },

    updateBuyStats(stats) {
        if (!stats || stats.length === 0) {
            document.getElementById('buy-stat-qty').textContent = 'N/A';
            document.getElementById('buy-stat-price').textContent = 'N/A';
            document.getElementById('buy-stat-count').textContent = 'N/A';
            return;
        }

        const totalQty = stats.reduce((sum, s) => sum + s.total_quantity, 0);
        const totalPrice = stats.reduce((sum, s) => sum + (s.avg_price * s.total_quantity), 0);
        const tradeCount = stats.reduce((sum, s) => sum + s.trade_count, 0);

        document.getElementById('buy-stat-qty').textContent = formatNumber(totalQty);
        document.getElementById('buy-stat-price').textContent = formatNumber(totalPrice);
        document.getElementById('buy-stat-count').textContent = tradeCount;
    },

    // ============================================================
    // 求购功能
    // ============================================================

    async loadBuyRequestsData() {
        if (this.isLoading) return;
        this.isLoading = true;

        const content = document.getElementById('market-content');
        content.innerHTML = '<div class="skeleton" style="height:200px;"></div>';

        try {
            const [data, inventory] = await Promise.all([
                getBuyRequests(
                    this.brPage,
                    PAGE_SIZE,
                    this.brFilterQuality || null,
                    this.brFilterSort,
                    this.brFilterSearch || null,
                    this.brFilterType || null
                ),
                getInventory()
            ]);
            
            this.buyRequests = data || [];
            this.brTotalCount = data?.[0]?.total_count || 0;
            this.inventory = inventory || [];
            this.renderBuyRequests(content);
        } catch (e) {
            console.error(e);
            content.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        } finally {
            this.isLoading = false;
        }
    },

    renderBuyRequests(container) {
        if (this.buyRequests.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="shopping-bag"></i>
                    <p>暂无求购订单</p>
                </div>
            `;
            this.renderBrPagination(0);
            return;
        }

        container.innerHTML = `
            <div class="market-list">
                ${this.buyRequests.map(req => this.buyRequestCard(req)).join('')}
            </div>
        `;
        initItemImages();

        const totalPages = Math.ceil(this.brTotalCount / PAGE_SIZE);
        this.renderBrPagination(totalPages);

        container.querySelectorAll('.btn-cancel-br').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = parseInt(btn.dataset.id);
                btn.disabled = true;
                try {
                    const result = await cancelBuyRequest(id);
                    showToast(`已取消，返还 ${result.refunded_shells} 果壳币`, 'info');
                    await updateGlobalShells();
                    this.loadBuyRequestsData();
                } catch (e) {
                    btn.disabled = false;
                }
            });
        });

        container.querySelectorAll('.btn-quick-sell').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.id);
                const itemId = parseInt(btn.dataset.itemId);
                const name = btn.dataset.name;
                const price = parseInt(btn.dataset.price);
                const maxQty = parseInt(btn.dataset.max);
                this.openQuickSellModal(id, itemId, name, price, maxQty);
            });
        });

        container.querySelectorAll('.market-card-item').forEach(card => {
            card.addEventListener('click', () => {
                const itemId = parseInt(card.dataset.itemId);
                const req = this.buyRequests.find(r => r.item_id === itemId);
                if (req) {
                    openItemDetail({
                        id: req.item_id,
                        name: req.item_name,
                        quality: req.item_quality,
                        image_name: req.item_image,
                        item_type: req.item_type
                    });
                }
            });
        });

        createIcons({ icons });
    },

    buyRequestCard(req) {
        const cfg = QUALITY_CONFIG[req.item_quality];
        const isOwner = req.buyer_id === this.myId;
        return `
            <div class="market-card">
                <div class="market-card-item" data-item-id="${req.item_id}">
                    ${itemImageHTML(req.item_name, req.item_quality, req.item_image)}
                    <div class="market-card-info">
                        <div class="market-card-name">${req.item_name}</div>
                        <span class="quality-badge quality-${req.item_quality}">${cfg.label}</span>
                    </div>
                </div>
                <div class="market-card-meta">
                    <div class="market-card-price-row">
                        <span class="market-card-unit-price">
                            <i data-lucide="coins" class="market-coin-icon"></i>
                            ${formatNumber(req.price_per_unit)} 果壳币
                        </span>
                        <span class="market-card-qty">求购 ${req.remaining_quantity}/${req.quantity}</span>
                    </div>
                    ${!isOwner ? `<div class="market-card-seller">买家: ${req.buyer_nickname || '未知'}${userBadgeHTML({is_admin: req.buyer_is_admin, is_bot: req.buyer_is_bot})}</div>` : ''}
                </div>
                <div class="market-card-actions">
                    ${isOwner 
                        ? `<button class="btn btn-danger btn-cancel-br" data-id="${req.request_id}">取消求购</button>`
                        : `<button class="btn btn-success btn-quick-sell" data-id="${req.request_id}" data-item-id="${req.item_id}" data-name="${req.item_name}" data-price="${req.price_per_unit}" data-max="${req.remaining_quantity}">快速出售</button>`
                    }
                </div>
            </div>
        `;
    },

    openQuickSellModal(requestId, itemId, itemName, price, maxQty) {
        const myItem = this.inventory.find(i => i.item_id === itemId);
        const myQty = myItem ? myItem.quantity : 0;
        const sellableQty = Math.min(maxQty, myQty);

        if (myQty <= 0) {
            showToast('你没有这个物品', 'warn');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'quick-sell-modal-overlay';
        modal.innerHTML = `
            <div class="quick-sell-modal">
                <div class="quick-sell-header">
                    <h3>快速出售</h3>
                    <button class="quick-sell-close">&times;</button>
                </div>
                <div class="quick-sell-body">
                    <p class="qs-item-name">${itemName}</p>
                    <div class="qs-info-row">
                        <span>求购单价</span>
                        <span class="qs-price">${formatNumber(price)} 果壳币</span>
                    </div>
                    <div class="qs-info-row">
                        <span>你拥有</span>
                        <span>${myQty} 件</span>
                    </div>
                    <div class="qs-info-row">
                        <span>可出售</span>
                        <span>${sellableQty} 件</span>
                    </div>
                    <div class="qs-qty-section">
                        <label>出售数量</label>
                        <div class="qs-qty-controls">
                            <button class="qs-qty-btn qs-minus">−</button>
                            <input type="number" class="qs-qty-input" value="1" min="1" max="${sellableQty}">
                            <button class="qs-qty-btn qs-plus">+</button>
                        </div>
                        <button class="qs-max-btn">最大</button>
                    </div>
                    <div class="qs-summary">
                        <div class="qs-info-row">
                            <span>出售总价</span>
                            <span class="qs-total-price">${formatNumber(price)} 果壳币</span>
                        </div>
                        <div class="qs-info-row">
                            <span>实际获得 (扣5%税)</span>
                            <span class="qs-received">${formatNumber(Math.floor(price * 0.95))} 果壳币</span>
                        </div>
                    </div>
                </div>
                <div class="quick-sell-footer">
                    <button class="btn btn-secondary qs-cancel">取消</button>
                    <button class="btn btn-success qs-confirm">确认出售</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const qtyInput = modal.querySelector('.qs-qty-input');
        const minusBtn = modal.querySelector('.qs-minus');
        const plusBtn = modal.querySelector('.qs-plus');
        const maxBtn = modal.querySelector('.qs-max-btn');
        const totalPriceEl = modal.querySelector('.qs-total-price');
        const receivedEl = modal.querySelector('.qs-received');
        const closeBtn = modal.querySelector('.quick-sell-close');
        const cancelBtn = modal.querySelector('.qs-cancel');
        const confirmBtn = modal.querySelector('.qs-confirm');

        const updateSummary = () => {
            let qty = parseInt(qtyInput.value) || 1;
            qty = Math.max(1, Math.min(qty, sellableQty));
            qtyInput.value = qty;
            const total = qty * price;
            totalPriceEl.textContent = formatNumber(total) + ' 果壳币';
            receivedEl.textContent = formatNumber(Math.floor(total * 0.95)) + ' 果壳币';
        };

        minusBtn.addEventListener('click', () => {
            let v = parseInt(qtyInput.value) || 1;
            qtyInput.value = Math.max(1, v - 1);
            updateSummary();
        });

        plusBtn.addEventListener('click', () => {
            let v = parseInt(qtyInput.value) || 1;
            qtyInput.value = Math.min(sellableQty, v + 1);
            updateSummary();
        });

        maxBtn.addEventListener('click', () => {
            qtyInput.value = sellableQty;
            updateSummary();
        });

        qtyInput.addEventListener('input', updateSummary);

        const close = () => modal.remove();

        closeBtn.addEventListener('click', close);
        cancelBtn.addEventListener('click', close);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

        confirmBtn.addEventListener('click', async () => {
            const qty = parseInt(qtyInput.value) || 1;
            confirmBtn.disabled = true;
            confirmBtn.textContent = '出售中...';
            try {
                const result = await sellToBuyRequest(requestId, qty);
                showToast(`成功出售 ${result.quantity} 件，获得 ${formatNumber(result.received_shells)} 果壳币`, 'success');
                close();
                await updateGlobalShells();
                try { this.loadInventory(); } catch (e) {}
                try { this.loadBuyRequestsData(); } catch (e) {}
            } catch (e) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = '确认出售';
            }
        });

        createIcons({ icons });
    },

    renderBrPagination(totalPages) {
        const pagination = document.getElementById('buy-request-pagination');
        if (!pagination || totalPages <= 1) {
            if (pagination) pagination.style.display = totalPages <= 1 ? 'none' : 'flex';
            return;
        }

        pagination.style.display = 'flex';
        
        const maxVisiblePages = 5;
        let startPage = Math.max(1, this.brPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        pagination.innerHTML = `
            <button class="page-btn" data-page="${this.brPage - 1}" ${this.brPage === 1 ? 'disabled' : ''}>
                <i data-lucide="chevron-left"></i>
            </button>
            ${startPage > 1 ? '<button class="page-btn" data-page="1">1</button>' : ''}
            ${startPage > 2 ? '<span class="page-ellipsis">...</span>' : ''}
            ${Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i).map(p => `
                <button class="page-btn ${p === this.brPage ? 'active' : ''}" data-page="${p}">${p}</button>
            `).join('')}
            ${endPage < totalPages - 1 ? '<span class="page-ellipsis">...</span>' : ''}
            ${endPage < totalPages ? `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>` : ''}
            <button class="page-btn" data-page="${this.brPage + 1}" ${this.brPage === totalPages ? 'disabled' : ''}>
                <i data-lucide="chevron-right"></i>
            </button>
        `;

        pagination.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = parseInt(btn.dataset.page);
                if (p >= 1 && p <= totalPages && p !== this.brPage) {
                    this.brPage = p;
                    this.loadBuyRequestsData();
                }
            });
        });

        createIcons({ icons });
    },

    async loadBuyForm() {
        try {
            const [items, myRequests] = await Promise.all([
                getItems(),
                getMyBuyRequests(1, 100)
            ]);
            this.allItems = items || [];
            this.myBuyRequests = myRequests || [];
            this.renderBuyForm();
        } catch (e) {
            showToast('加载失败', 'error');
        }
    },

    renderBuyForm() {
        const container = document.getElementById('market-content');
        
        const availableItems = this.allItems.filter(item => item.item_type !== 'currency');

        container.innerHTML = `
            <div class="sell-layout">
                <div class="sell-form card">
                    <div class="form-group">
                        <label class="form-label">选择物品</label>
                        <select class="form-input" id="buy-item-select">
                            <option value="">-- 选择物品 --</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">求购单价（果壳币）</label>
                        <input type="number" class="form-input" id="buy-price" placeholder="输入价格" min="1" />
                        <small class="form-hint">上架价格 ≤ 此价格时会自动购买</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label">数量</label>
                        <input type="number" class="form-input" id="buy-qty" value="1" min="1" />
                    </div>
                    <div class="form-group">
                        <label class="form-label">锁定金额</label>
                        <div id="buy-lock-info" class="buy-lock-info">0 果壳币</div>
                    </div>
                    <button class="btn btn-primary" id="btn-create-buy">
                        <i data-lucide="shopping-bag"></i>
                        <span>发布求购</span>
                    </button>
                </div>
                <div class="sell-chart-panel card">
                    <h3><i data-lucide="trending-up"></i> 物品行情</h3>
                    <div class="sell-chart-empty" id="buy-chart-empty">
                        <p>请选择一个物品查看行情</p>
                    </div>
                    <div class="sell-chart-container" id="buy-chart-container" style="display:none;">
                        <div class="chart-tabs">
                            <button class="chart-tab active" data-group="hour">小时</button>
                            <button class="chart-tab" data-group="day">日</button>
                        </div>
                        <div class="chart-container" style="height:200px;">
                            <canvas id="buy-trade-chart"></canvas>
                        </div>
                        <div class="trade-stats">
                            <div class="trade-stat">
                                <span class="stat-label">总交易量</span>
                                <span class="stat-value" id="buy-stat-qty">-</span>
                            </div>
                            <div class="trade-stat">
                                <span class="stat-label">总交易额</span>
                                <span class="stat-value" id="buy-stat-price">-</span>
                            </div>
                            <div class="trade-stat">
                                <span class="stat-label">交易次数</span>
                                <span class="stat-value" id="buy-stat-count">-</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        upgradeSelectsToSearchable('#buy-item-select', availableItems, { placeholder: '选择物品' });

        const priceInput = container.querySelector('#buy-price');
        const qtyInput = container.querySelector('#buy-qty');
        const lockInfo = container.querySelector('#buy-lock-info');
        const itemSelect = container.querySelector('#buy-item-select');

        function updateLockInfo() {
            const price = parseInt(priceInput.value) || 0;
            const qty = parseInt(qtyInput.value) || 1;
            const total = price * qty;
            lockInfo.textContent = `${formatNumber(total)} 果壳币`;
            lockInfo.style.color = total > 0 ? 'var(--seal-red)' : 'var(--ink-soft)';
        }

        priceInput.addEventListener('input', updateLockInfo);
        qtyInput.addEventListener('input', updateLockInfo);

        const self = this;
        itemSelect.addEventListener('change', function() {
            const itemId = parseInt(this.value);
            const item = availableItems.find(i => i.id === itemId);
            if (itemId && item) {
                self.loadBuyItemStats(itemId, item.name);
            } else {
                self.renderBuyChart([], '');
                self.updateBuyStats([]);
            }
        });

        container.querySelectorAll('.chart-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                container.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                const itemId = parseInt(itemSelect.value);
                const item = availableItems.find(i => i.id === itemId);
                if (itemId && item) {
                    self.loadBuyItemStats(itemId, item.name, this.dataset.group);
                }
            });
        });

        container.querySelector('#btn-create-buy').addEventListener('click', async () => {
            const itemId = parseInt(itemSelect.value);
            const price = parseInt(priceInput.value);
            const qty = parseInt(qtyInput.value) || 1;
            if (!itemId) { showToast('请选择物品', 'error'); return; }
            if (!price || price <= 0) { showToast('请输入有效价格', 'error'); return; }

            const btn = container.querySelector('#btn-create-buy');
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> 发布中...';
            createIcons({ icons });

            try {
                const result = await createBuyRequest(itemId, price, qty);
                showToast(`求购成功，锁定 ${result.locked_shells} 果壳币`, 'success');
                await updateGlobalShells();
                this.loadBuyForm();
            } catch (e) {
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="shopping-bag"></i> 发布求购';
                createIcons({ icons });
            }
        });

        createIcons({ icons });
    },

    async loadMyOrdersData() {
        const content = document.getElementById('market-content');
        content.innerHTML = '<div class="skeleton" style="height:200px;"></div>';
        
        try {
            // 同时加载出售订单和求购订单
            const [allOrders, myRequests] = await Promise.all([
                getMarketOrders(1, 1000),
                getMyBuyRequests(1, 100)
            ]);
            const mySellOrders = (allOrders || []).filter(o => o.seller_id === this.myId);
            this.myBuyRequests = myRequests || [];
            this.renderMyOrders(content, mySellOrders);
        } catch (e) {
            content.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    },

    renderMyOrders(container, mySellOrders) {
        const hasSellOrders = mySellOrders.length > 0;
        const hasBuyRequests = this.myBuyRequests.length > 0;

        if (!hasSellOrders && !hasBuyRequests) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="clipboard-list"></i>
                    <p>你没有正在进行的订单</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="my-orders-section">
                ${hasSellOrders ? `
                    <h3 class="section-title"><i data-lucide="store"></i> 出售订单</h3>
                    <div class="market-list">
                        ${mySellOrders.map(order => this.orderCard(order, true)).join('')}
                    </div>
                ` : ''}
                ${hasBuyRequests ? `
                    <h3 class="section-title"><i data-lucide="shopping-bag"></i> 求购订单</h3>
                    <div class="my-buy-requests-full">
                        ${this.myBuyRequests.map(req => `
                            <div class="my-buy-request-card ${req.status}">
                                <div class="request-card-item">
                                    ${itemImageHTML(req.item_name, req.item_quality, req.item_image)}
                                    <div class="request-card-info">
                                        <div class="request-card-name">${req.item_name}</div>
                                        <span class="quality-badge quality-${req.item_quality}">${QUALITY_CONFIG[req.item_quality]?.label || req.item_quality}</span>
                                    </div>
                                </div>
                                <div class="request-card-meta">
                                    <div class="request-card-price-row">
                                        <span class="request-card-unit-price">
                                            <i data-lucide="coins" class="market-coin-icon"></i>
                                            ${formatNumber(req.price_per_unit)} 果壳币
                                        </span>
                                        <span class="request-card-qty">剩余 ${req.remaining_quantity}/${req.quantity}</span>
                                    </div>
                                    <div class="request-card-status">
                                        <span class="status-badge status-${req.status}">${req.status === 'active' ? '进行中' : req.status === 'completed' ? '已完成' : '已取消'}</span>
                                        ${req.status === 'active' ? `<span class="locked-shells">锁定 ${formatNumber(req.locked_shells)} 币</span>` : ''}
                                    </div>
                                </div>
                                <div class="request-card-actions">
                                    ${req.status === 'active' ? `<button class="btn btn-danger btn-cancel-my-order-br" data-id="${req.request_id}">取消求购</button>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
        initItemImages();

        // 出售订单取消按钮
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

        // 求购订单取消按钮
        container.querySelectorAll('.btn-cancel-my-order-br').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = parseInt(btn.dataset.id);
                btn.disabled = true;
                try {
                    const result = await cancelBuyRequest(id);
                    showToast(`已取消，返还 ${result.refunded_shells} 果壳币`, 'info');
                    await updateGlobalShells();
                    this.loadMyOrdersData();
                } catch (e) {
                    btn.disabled = false;
                }
            });
        });

        // 行情按钮
        container.querySelectorAll('.btn-trade-history').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const itemId = parseInt(btn.dataset.itemId);
                const itemName = btn.dataset.itemName;
                this.openTradeHistoryModal(itemId, itemName);
            });
        });

        createIcons({ icons });
    }
};
