import { getMarketOrders, getInventory, buyMarketOrder, cancelMarketOrder, placeMarketOrder, getProfile, getItemTradeHistory, getItemTradeStats } from '../api.js';
import { itemImageHTML, formatNumber, showToast, QUALITY_CONFIG, ITEM_TYPE_CONFIG, openItemDetail, initItemImages, userBadgeHTML } from '../utils.js';
import { createIcons, icons } from 'lucide';
import { updateGlobalShells } from '../auth.js';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

const PAGE_SIZE = 10;

export const marketPage = {
    orders: [],
    inventory: [],
    inventoryMap: {},
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
    }
};
