import { getUserProfile, getUserPosts, getUserInventoryPublic, toggleFollow, checkFollowing, checkAllowFollow, getUserMarketOrders, getUserBuyRequests, buyMarketOrder, sellToBuyRequest, getInventory } from '../api.js';
import { showToast, formatNumber, timeAgo, escapeHtml, itemImageHTML, QUALITY_CONFIG, initItemImages, renderPagination, bindPagination, userBadgeHTML } from '../utils.js';
import { createIcons, icons } from 'lucide';
import { router } from '../router.js';
import { currentUser } from '../supabaseClient.js';
import { updateGlobalShells } from '../auth.js';

export const userPage = {
    userId: null,
    profile: null,
    posts: [],
    inventory: [],
    sellOrders: [],
    buyRequests: [],
    isFollowing: false,
    currentTab: 'posts',
    postsPage: 1,
    postsTotal: 0,
    inventoryPage: 1,
    inventoryTotal: 0,
    sellPage: 1,
    sellTotal: 0,
    buyPage: 1,
    buyTotal: 0,
    postsPerPage: 10,
    inventoryPerPage: 24,
    ordersPerPage: 20,

    render(container) {
        const hash = window.location.hash;
        const parts = hash.split('/');
        this.userId = parts[1] || null;

        if (!this.userId) {
            showToast('用户不存在', 'error');
            router.navigate('feed');
            return;
        }

        this.postsPage = 1;
        this.inventoryPage = 1;
        this.sellPage = 1;
        this.buyPage = 1;
        this.posts = [];
        this.inventory = [];
        this.sellOrders = [];
        this.buyRequests = [];

        this.attachEvents(container);
        this.loadUserProfile();
    },

    attachEvents(container) {
        const followBtn = container.querySelector('#btn-follow');
        if (followBtn) {
            followBtn.addEventListener('click', () => this.handleToggleFollow());
        }

        const dmBtn = container.querySelector('#btn-dm');
        if (dmBtn) {
            dmBtn.addEventListener('click', () => this.handleDm());
        }

        container.querySelectorAll('.user-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                container.querySelectorAll('.user-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentTab = tab.dataset.tab;
                this.switchTab();
            });
        });
    },

    switchTab() {
        const postsContent = document.getElementById('user-posts-content');
        const inventoryContent = document.getElementById('user-inventory-content');
        const sellContent = document.getElementById('user-sell-content');
        const buyContent = document.getElementById('user-buy-content');

        [postsContent, inventoryContent, sellContent, buyContent].forEach(el => {
            if (el) el.style.display = 'none';
        });

        if (this.currentTab === 'posts') {
            if (postsContent) postsContent.style.display = 'block';
        } else if (this.currentTab === 'inventory') {
            if (this.profile && this.profile.show_collections === false) {
                showToast('该用户未公开收藏品', 'error');
                this.currentTab = 'posts';
                document.querySelectorAll('.user-tab').forEach(t => t.classList.remove('active'));
                document.querySelector('.user-tab[data-tab="posts"]')?.classList.add('active');
                if (postsContent) postsContent.style.display = 'block';
                return;
            }
            if (inventoryContent) inventoryContent.style.display = 'block';
            if (this.inventory.length === 0) {
                this.loadUserInventory(1);
            }
        } else if (this.currentTab === 'sell') {
            if (sellContent) sellContent.style.display = 'block';
            if (this.sellOrders.length === 0) {
                this.loadUserSellOrders(1);
            }
        } else if (this.currentTab === 'buy') {
            if (buyContent) buyContent.style.display = 'block';
            if (this.buyRequests.length === 0) {
                this.loadUserBuyRequests(1);
            }
        }
    },

    async loadUserProfile() {
        try {
            const [profileArr, followingStatus] = await Promise.all([
                getUserProfile(this.userId),
                currentUser ? checkFollowing(this.userId) : Promise.resolve(false)
            ]);

            this.profile = Array.isArray(profileArr) ? profileArr[0] : profileArr;
            this.isFollowing = followingStatus || false;

            this.updateTabVisibility();
            this.renderProfile();
            this.loadUserPosts(1);
            createIcons({ icons });
        } catch (e) {
            console.error('加载用户信息失败:', e);
            showToast('加载失败', 'error');
        }
    },

    updateTabVisibility() {
        const inventoryTab = document.querySelector('.user-tab[data-tab="inventory"]');
        if (inventoryTab) {
            if (this.profile && this.profile.show_collections === false) {
                inventoryTab.style.display = 'none';
                if (this.currentTab === 'inventory') {
                    this.currentTab = 'posts';
                }
            } else {
                inventoryTab.style.display = 'flex';
            }
        }
    },

    renderProfile() {
        if (!this.profile) return;

        const nickname = escapeHtml(this.profile.nickname) || '无名旅者';
        const initial = nickname.charAt(0).toUpperCase();

        document.getElementById('user-nickname').innerHTML = nickname + userBadgeHTML(this.profile);
        
        const avatarEl = document.getElementById('user-avatar');
        if (avatarEl) {
            if (this.profile.avatar_url) {
                avatarEl.innerHTML = `<img src="${escapeHtml(this.profile.avatar_url)}" alt="${nickname}" style="width:100%;height:100%;object-fit:cover;">`;
            } else {
                avatarEl.innerHTML = `<span id="user-initial">${initial}</span>`;
            }
        }

        document.getElementById('user-shells').textContent = formatNumber(this.profile.shells || 0);
        document.getElementById('user-items').textContent = formatNumber(this.profile.item_count || 0);
        document.getElementById('user-posts').textContent = formatNumber(this.profile.post_count || 0);
        document.getElementById('user-followers').textContent = formatNumber(this.profile.followers_count || 0);
        document.getElementById('user-following').textContent = formatNumber(this.profile.following_count || 0);

        if (this.profile.created_at) {
            document.getElementById('user-joined').textContent = `加入于 ${new Date(this.profile.created_at).toLocaleDateString('zh-CN')}`;
        }

        this.updateFollowButton();

        if (currentUser && currentUser.id === this.userId) {
            const btn = document.getElementById('btn-follow');
            if (btn) btn.style.display = 'none';
            const dmBtn = document.getElementById('btn-dm');
            if (dmBtn) dmBtn.style.display = 'none';
        }

        this.updateTabVisibility();
    },

    updateFollowButton() {
        const btn = document.getElementById('btn-follow');
        if (!btn) return;

        if (this.isFollowing) {
            btn.innerHTML = '<i data-lucide="user-check"></i><span>已关注</span>';
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-secondary');
        } else {
            btn.innerHTML = '<i data-lucide="user-plus"></i><span>关注</span>';
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-primary');
        }
        createIcons({ icons });
    },

    async handleToggleFollow() {
        if (!currentUser) {
            showToast('请先登录', 'error');
            return;
        }

        const btn = document.getElementById('btn-follow');
        if (btn) btn.disabled = true;

        try {
            if (!this.isFollowing) {
                const allowFollow = await checkAllowFollow(this.userId);
                if (!allowFollow) {
                    showToast('该用户禁止被关注', 'error');
                    if (btn) btn.disabled = false;
                    return;
                }
            }

            const result = await toggleFollow(this.userId);
            if (Array.isArray(result) && result[0]) {
                this.isFollowing = result[0].is_following;
                this.updateFollowButton();

                const followersEl = document.getElementById('user-followers');
                const currentCount = parseInt(followersEl?.textContent) || 0;
                if (followersEl) {
                    followersEl.textContent = formatNumber(this.isFollowing ? currentCount + 1 : Math.max(0, currentCount - 1));
                }

                showToast(this.isFollowing ? '关注成功' : '已取消关注', 'success');
            }
        } catch (e) {
            console.error('关注失败:', e);
            showToast('操作失败', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    },

    handleDm() {
        if (!currentUser) {
            showToast('请先登录', 'error');
            return;
        }
        if (!this.profile) return;
        const nickname = escapeHtml(this.profile.nickname) || '无名旅者';
        sessionStorage.setItem('pendingDm', JSON.stringify({
            userId: this.userId,
            nickname: nickname
        }));
        router.navigate('message');
    },

    async loadUserPosts(page = 1) {
        const list = document.getElementById('user-posts-list');
        const pagination = document.getElementById('user-posts-pagination');
        if (!list) return;

        this.postsPage = page;
        list.innerHTML = '<div class="skeleton" style="height:60px;margin-bottom:8px;"></div>'.repeat(3);

        try {
            const offset = (page - 1) * this.postsPerPage;
            const result = await getUserPosts(this.userId, this.postsPerPage, offset);
            const postsData = Array.isArray(result) ? result : [];
            
            this.postsTotal = this.profile?.post_count || 0;

            if (postsData.length === 0 && page === 1) {
                list.innerHTML = `
                    <div class="empty-state">
                        <i data-lucide="message-square"></i>
                        <p>该用户暂无动态</p>
                    </div>
                `;
                if (pagination) pagination.innerHTML = '';
            } else {
                this.posts = postsData;
                this.renderPosts();
                this.bindPostsEvents();
                
                if (pagination) {
                    renderPagination(pagination, page, this.postsTotal, this.postsPerPage, (newPage) => {
                        this.loadUserPosts(newPage);
                    });
                }
            }
            createIcons({ icons });
        } catch (e) {
            console.error('加载动态失败:', e);
            list.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    },

    renderPosts() {
        const list = document.getElementById('user-posts-list');
        if (!list) return;

        list.innerHTML = this.posts.map(post => `
            <div class="post-card-simple clickable-post" data-post-id="${post.post_id}">
                <div class="post-content">${escapeHtml(post.content)}</div>
                <div class="post-meta">
                    <span class="post-time">${timeAgo(post.created_at)}</span>
                    <div class="post-stats">
                        <span><i data-lucide="heart"></i> ${formatNumber(post.likes_count || 0)}</span>
                        <span><i data-lucide="message-circle"></i> ${formatNumber(post.comments_count || 0)}</span>
                    </div>
                </div>
                ${post.tags && post.tags.length > 0 ? `
                    <div class="post-tags">${post.tags.map(tag => `<span class="post-tag">${escapeHtml(tag)}</span>`).join('')}</div>
                ` : ''}
            </div>
        `).join('');
        createIcons({ icons });
    },

    bindPostsEvents() {
        document.querySelectorAll('.clickable-post').forEach(el => {
            el.addEventListener('click', () => {
                const postId = el.dataset.postId;
                if (postId) {
                    router.navigate(`post/${postId}`);
                }
            });
        });
    },

    async loadUserInventory(page = 1) {
        const grid = document.getElementById('user-inventory-grid');
        const pagination = document.getElementById('user-inventory-pagination');
        if (!grid) return;

        if (this.profile && this.profile.show_collections === false) {
            grid.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="lock"></i>
                    <p>该用户未公开收藏品</p>
                </div>
            `;
            if (pagination) pagination.innerHTML = '';
            createIcons({ icons });
            return;
        }

        this.inventoryPage = page;
        grid.innerHTML = '<div class="skeleton" style="height:80px;"></div>'.repeat(4);

        try {
            const result = await getUserInventoryPublic(this.userId, page, this.inventoryPerPage);
            const inventoryData = Array.isArray(result) ? result : [];
            
            this.inventoryTotal = this.profile?.item_count || 0;

            if (inventoryData.length === 0 && page === 1) {
                grid.innerHTML = `
                    <div class="empty-state">
                        <i data-lucide="package"></i>
                        <p>收藏品空空如也</p>
                    </div>
                `;
                if (pagination) pagination.innerHTML = '';
            } else {
                this.inventory = inventoryData;
                this.renderInventory();
                
                if (pagination) {
                    renderPagination(pagination, page, this.inventoryTotal, this.inventoryPerPage, (newPage) => {
                        this.loadUserInventory(newPage);
                    });
                }
            }
            createIcons({ icons });
            initItemImages();
        } catch (e) {
            console.error('加载背包失败:', e);
            grid.innerHTML = '<div class="empty-state"><p>无法查看该用户背包</p></div>';
            if (pagination) pagination.innerHTML = '';
        }
    },

    renderInventory() {
        const grid = document.getElementById('user-inventory-grid');
        if (!grid) return;

        grid.innerHTML = this.inventory.map(item => `
            <div class="inventory-item-card">
                ${itemImageHTML(item.item_name, item.item_quality, item.item_image, 48)}
                <div class="item-info">
                    <span class="item-name">${escapeHtml(item.item_name)}</span>
                    <span class="item-qty">x${item.quantity}</span>
                </div>
            </div>
        `).join('');
        initItemImages();
    },

    async loadUserSellOrders(page = 1) {
        const list = document.getElementById('user-sell-list');
        const pagination = document.getElementById('user-sell-pagination');
        if (!list) return;

        this.sellPage = page;
        list.innerHTML = '<div class="skeleton" style="height:70px;margin-bottom:8px;"></div>'.repeat(3);

        try {
            const result = await getUserMarketOrders(this.userId, page, this.ordersPerPage);
            const orders = Array.isArray(result) ? result : [];

            if (orders.length === 0 && page === 1) {
                list.innerHTML = `
                    <div class="empty-state">
                        <i data-lucide="tag"></i>
                        <p>暂无挂售</p>
                    </div>
                `;
                if (pagination) pagination.innerHTML = '';
            } else {
                this.sellOrders = orders;
                this.renderSellOrders();
                
                if (pagination) {
                    const total = orders.length < this.ordersPerPage ? (page - 1) * this.ordersPerPage + orders.length : (page + 1) * this.ordersPerPage;
                    renderPagination(pagination, page, total, this.ordersPerPage, (newPage) => {
                        this.loadUserSellOrders(newPage);
                    });
                }
            }
            createIcons({ icons });
            initItemImages();
        } catch (e) {
            console.error('加载挂售失败:', e);
            list.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    },

    renderSellOrders() {
        const list = document.getElementById('user-sell-list');
        if (!list) return;

        const isOwner = currentUser && currentUser.id === this.userId;

        list.innerHTML = this.sellOrders.map(order => {
            const cfg = QUALITY_CONFIG[order.item_quality];
            return `
                <div class="user-order-item">
                    <div class="user-order-item-img">
                        ${itemImageHTML(order.item_name, order.item_quality, order.item_image, 40)}
                    </div>
                    <div class="user-order-item-info">
                        <div class="user-order-item-name">
                            ${escapeHtml(order.item_name)}
                            <span class="quality-badge quality-${order.item_quality}">${cfg.label}</span>
                        </div>
                        <div class="user-order-item-price">
                            <i data-lucide="coins" class="market-coin-icon"></i>
                            ${formatNumber(order.price_per_unit)} 果壳币 × ${order.quantity}
                        </div>
                    </div>
                    ${!isOwner ? `<button class="btn btn-primary btn-sm user-order-action" data-action="buy" data-order-id="${order.order_id}" data-item-name="${escapeHtml(order.item_name)}" data-price="${order.price_per_unit}" data-qty="${order.quantity}">购买</button>` : ''}
                </div>
            `;
        }).join('');
        createIcons({ icons });
        initItemImages();

        list.querySelectorAll('.user-order-action[data-action="buy"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const orderId = parseInt(btn.dataset.orderId);
                const itemName = btn.dataset.itemName;
                const price = parseInt(btn.dataset.price);
                const qty = parseInt(btn.dataset.qty);
                this.openBuyModal({ order_id: orderId, item_name: itemName, price_per_unit: price, quantity: qty });
            });
        });
    },

    async loadUserBuyRequests(page = 1) {
        const list = document.getElementById('user-buy-list');
        const pagination = document.getElementById('user-buy-pagination');
        if (!list) return;

        this.buyPage = page;
        list.innerHTML = '<div class="skeleton" style="height:70px;margin-bottom:8px;"></div>'.repeat(3);

        try {
            const result = await getUserBuyRequests(this.userId, page, this.ordersPerPage);
            const requests = Array.isArray(result) ? result : [];

            if (requests.length === 0 && page === 1) {
                list.innerHTML = `
                    <div class="empty-state">
                        <i data-lucide="shopping-cart"></i>
                        <p>暂无求购</p>
                    </div>
                `;
                if (pagination) pagination.innerHTML = '';
            } else {
                this.buyRequests = requests;
                this.renderBuyRequests();
                
                if (pagination) {
                    const total = requests.length < this.ordersPerPage ? (page - 1) * this.ordersPerPage + requests.length : (page + 1) * this.ordersPerPage;
                    renderPagination(pagination, page, total, this.ordersPerPage, (newPage) => {
                        this.loadUserBuyRequests(newPage);
                    });
                }
            }
            createIcons({ icons });
            initItemImages();
        } catch (e) {
            console.error('加载求购失败:', e);
            list.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    },

    renderBuyRequests() {
        const list = document.getElementById('user-buy-list');
        if (!list) return;

        const isOwner = currentUser && currentUser.id === this.userId;

        list.innerHTML = this.buyRequests.map(req => {
            const cfg = QUALITY_CONFIG[req.item_quality];
            return `
                <div class="user-order-item">
                    <div class="user-order-item-img">
                        ${itemImageHTML(req.item_name, req.item_quality, req.item_image, 40)}
                    </div>
                    <div class="user-order-item-info">
                        <div class="user-order-item-name">
                            ${escapeHtml(req.item_name)}
                            <span class="quality-badge quality-${req.item_quality}">${cfg.label}</span>
                        </div>
                        <div class="user-order-item-price">
                            <i data-lucide="coins" class="market-coin-icon"></i>
                            ${formatNumber(req.price_per_unit)} 果壳币 × ${req.remaining_quantity}/${req.quantity}
                        </div>
                        <div class="user-order-item-locked">
                            锁定 ${formatNumber(req.locked_shells)} 果壳币
                        </div>
                    </div>
                    ${!isOwner ? `<button class="btn btn-success btn-sm user-order-action" data-action="sell" data-request-id="${req.request_id}" data-item-id="${req.item_id}" data-item-name="${escapeHtml(req.item_name)}" data-price="${req.price_per_unit}" data-max="${req.remaining_quantity}">快速出售</button>` : ''}
                </div>
            `;
        }).join('');
        createIcons({ icons });
        initItemImages();

        list.querySelectorAll('.user-order-action[data-action="sell"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const requestId = parseInt(btn.dataset.requestId);
                const itemId = parseInt(btn.dataset.itemId);
                const itemName = btn.dataset.itemName;
                const price = parseInt(btn.dataset.price);
                const maxQty = parseInt(btn.dataset.max);
                this.openQuickSellModal(requestId, itemId, itemName, price, maxQty);
            });
        });
    },

    openBuyModal(order) {
        const existingModal = document.getElementById('buy-modal');
        if (existingModal) existingModal.remove();

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
                self.loadUserSellOrders(self.sellPage);
                closeModal();
            } catch (e) {
                showToast(e.message || '购买失败', 'error');
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i data-lucide="shopping-cart"></i> 确认购买';
                createIcons({ icons });
            }
        });
    },

    async openQuickSellModal(requestId, itemId, itemName, price, maxQty) {
        try {
            const inventory = await getInventory();
            const invItem = inventory?.find(i => i.item_id === itemId);
            const haveQty = invItem?.quantity || 0;

            if (haveQty <= 0) {
                showToast('您没有这个物品', 'error');
                return;
            }

            const sellMax = Math.min(haveQty, maxQty);
            const self = this;

            const modal = document.createElement('div');
            modal.className = 'quick-sell-modal-overlay';
            modal.innerHTML = `
                <div class="quick-sell-modal">
                    <div class="quick-sell-header">
                        <h3>快速出售</h3>
                        <button class="quick-sell-close">&times;</button>
                    </div>
                    <div class="quick-sell-body">
                        <p class="qs-item-name">${escapeHtml(itemName)}</p>
                        <div class="qs-info-row">
                            <span>求购单价</span>
                            <span class="qs-price">${formatNumber(price)} 果壳币</span>
                        </div>
                        <div class="qs-info-row">
                            <span>你拥有</span>
                            <span>${haveQty} 件</span>
                        </div>
                        <div class="qs-info-row">
                            <span>可出售</span>
                            <span>${sellMax} 件</span>
                        </div>
                        <div class="qs-qty-section">
                            <label>出售数量</label>
                            <div class="qs-qty-controls">
                                <button class="qs-qty-btn qs-minus">−</button>
                                <input type="number" class="qs-qty-input" value="1" min="1" max="${sellMax}">
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
                qty = Math.max(1, Math.min(qty, sellMax));
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
                qtyInput.value = Math.min(sellMax, v + 1);
                updateSummary();
            });

            maxBtn.addEventListener('click', () => {
                qtyInput.value = sellMax;
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
                    const received = result?.received_shells ?? Math.floor(qty * price * 0.95);
                    showToast(`成功出售 ${result?.quantity ?? qty} 件，获得 ${formatNumber(received)} 果壳币`, 'success');
                    await updateGlobalShells();
                    self.loadUserBuyRequests(self.buyPage);
                    close();
                } catch (e) {
                    showToast(e.message || '出售失败', 'error');
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = '确认出售';
                }
            });
        } catch (e) {
            showToast(e.message || '操作失败', 'error');
        }
    },
};
