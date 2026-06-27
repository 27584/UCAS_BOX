import { checkAdmin, getUserDetail, getUserInventory, getSystemStats, adminGetItems, adminGetAllItems, adminAddItem, adminAddItemDefinition, adminUpdateItemDefinition, getItems, getPendingSubmissions, approveSubmission, rejectSubmission, getLotteryRound, drawLotteryRound, getLotteryHistory, adminBotReplenish, getAllBotsWithConfig, updateBotConfig, adminBotListItem, adminBotCancelOrder, getBotOrders, adminUpdateUserShells, adminAdjustUserShells, adminRemoveUserItem, adminClearUserItems, adminSetUserAdmin, adminGetUsers, adminChangeUserNickname, adminUpdateCropConfig, adminGetCropBySeedId, adminDeleteItem, adminDeleteUser, getUserEmailVerified, adminCreateUser, adminBanUser, adminUnbanUser, adminGetExplorationPoints, adminAddExplorationPoint, adminUpdateExplorationPoint, adminDeleteExplorationPoint, adminGetExplorationHistory, adminGetRewardPools, adminGetRewardPoolDetail, adminCreateRewardPool, adminUpdateRewardPool, adminDeleteRewardPool, adminAddRewardPoolItem, adminUpdateRewardPoolItem, adminDeleteRewardPoolItem, adminGetRewardPoolDraws } from '../api.js';
import { supabase } from '../supabaseClient.js';
import { router } from '../router.js';
import { createIcons, icons } from 'lucide';
import { showToast, showConfirm, showConfirmTyped, QUALITY_CONFIG, QUALITY_OPTIONS, ITEM_TYPES, itemTypeOptionsHTML, qualityOptionsHTML, renderPagination, bindPagination, itemImageHTML, initItemImages, replaceWithSearchableSelect, upgradeSelectsToSearchable, userAvatarHTML } from '../utils.js';

function transformLat(x, y) {
    let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
    return ret;
}

function transformLng(x, y) {
    let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
    return ret;
}

function wgs84ToGcj02(wgsLat, wgsLng) {
    const a = 6378245.0;
    const ee = 0.00669342162296594323;
    
    if (outOfChina(wgsLat, wgsLng)) {
        return { lat: wgsLat, lng: wgsLng };
    }
    
    let dLat = transformLat(wgsLng - 105.0, wgsLat - 35.0);
    let dLng = transformLng(wgsLng - 105.0, wgsLat - 35.0);
    
    const radLat = wgsLat / 180.0 * Math.PI;
    let magic = Math.sin(radLat);
    magic = 1 - ee * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
    dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
    
    return {
        lat: wgsLat + dLat,
        lng: wgsLng + dLng
    };
}

function gcj02ToWgs84(gcjLat, gcjLng) {
    if (outOfChina(gcjLat, gcjLng)) {
        return { lat: gcjLat, lng: gcjLng };
    }
    
    let dLat = transformLat(gcjLng - 105.0, gcjLat - 35.0);
    let dLng = transformLng(gcjLng - 105.0, gcjLat - 35.0);
    
    const radLat = gcjLat / 180.0 * Math.PI;
    let magic = Math.sin(radLat);
    magic = 1 - 0.00669342162296594323 * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((6378245.0 * (1 - 0.00669342162296594323)) / (magic * sqrtMagic) * Math.PI);
    dLng = (dLng * 180.0) / (6378245.0 / sqrtMagic * Math.cos(radLat) * Math.PI);
    
    return {
        lat: gcjLat - dLat,
        lng: gcjLng - dLng
    };
}

function outOfChina(lat, lng) {
    return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55);
}

export const adminPage = {
    users: [],
    items: [],
    submissions: [],
    explorePoints: [],
    rewardPools: [],
    adminMap: null,
    adminMapMarkers: [],
    adminMapCircles: [],
    adminMapVisible: true,
    poolPage: 1, poolLimit: 20, poolTotal: 0, poolTypeFilter: '',
    // 分页状态
    userPage: 1, userLimit: 20, userTotal: 0, userSearch: '',
    itemPage: 1, itemLimit: 50, itemTotal: 0, itemSearch: '',
    subPage: 1, subLimit: 20, subTotal: 0,
    invPage: 1, invLimit: 20, invTotal: 0,
    lottoPage: 1, lottoLimit: 10, lottoTotal: 0,
    explorePage: 1, exploreLimit: 20, exploreTotal: 0,

    async render(container) {
        // 先校验权限，成功再渲染DOM、绑定事件
        const pass = await this.checkPermission();
        if (!pass) return;

        // 获取当前用户ID（用于禁用"删除自己"按钮）
        const { data: { user } } = await supabase.auth.getUser();
        this.currentUserId = user?.id || null;

        await this.loadStats();
        await this.loadUsers();
        // DOM渲染完成后再绑定事件
        this.attachEvents(container);
        createIcons({ icons });

        setTimeout(() => this.initAdminMap(), 500);
    },

    async checkPermission() {
        try {
            const isAdmin = await checkAdmin();
            if (!isAdmin) {
                showToast('无管理员权限', 'error');
                router.navigate('lobby');
                return false;
            }
            return true;
        } catch (e) {
            showToast('加载失败', 'error');
            router.navigate('lobby');
            return false;
        }
    },

    attachEvents(container) {
        // 搜索用户
        const searchInput = container.querySelector('#user-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.renderUsers(e.target.value.trim());
            });
        }

        // Tab切换
        container.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const tab = btn.dataset.tab;
                container.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
                const targetTab = container.querySelector(`#tab-${tab}`);
                if (targetTab) targetTab.style.display = 'block';

                if (tab === 'items') this.loadItems();
                if (tab === 'submissions') this.loadSubmissions();
                if (tab === 'lottery') this.loadLotteryInfo();
                if (tab === 'bots') this.loadBots();
                if (tab === 'explore') this.loadExplorePoints();
                if (tab === 'reward-pools') this.loadRewardPools();
            });
        }); // 修复：原代码缺失这个闭合括号

        // 打开添加物品弹窗
        const openAddItemBtn = container.querySelector('#btn-open-add-item');
        if (openAddItemBtn) openAddItemBtn.addEventListener('click', () => this.showAddItemModal());

        // 用户搜索（后端去抖）
        const userSearch = container.querySelector('#user-search-input');
        if (userSearch) {
            let userSearchTimer = null;
            userSearch.addEventListener('input', () => {
                clearTimeout(userSearchTimer);
                userSearchTimer = setTimeout(() => {
                    this.userSearch = userSearch.value.trim();
                    this.loadUsers(1);  // 搜索后回到第 1 页
                }, 300);
            });
        }

        // 物品搜索（后端）
        const itemSearch = container.querySelector('#item-search');
        if (itemSearch) {
            let searchTimer = null;
            itemSearch.addEventListener('input', () => {
                clearTimeout(searchTimer);
                searchTimer = setTimeout(() => this.loadItems(1), 300);
            });
        }

        // 物品类型筛选（后端）
        const itemTypeFilter = container.querySelector('#item-type-filter');
        if (itemTypeFilter) {
            itemTypeFilter.addEventListener('change', () => this.loadItems(1));
        }

        // 物品品质筛选（后端）
        const itemQualityFilter = container.querySelector('#item-quality-filter');
        if (itemQualityFilter) {
            itemQualityFilter.addEventListener('change', () => this.loadItems(1));
        }

        // 彩票开奖按钮
        const drawBtn = container.querySelector('#btn-admin-draw');
        if (drawBtn) drawBtn.addEventListener('click', () => this.adminDraw());

        const debugDrawBtn = container.querySelector('#btn-debug-draw');
        if (debugDrawBtn) debugDrawBtn.addEventListener('click', () => this.debugDraw());

        const botReplenishBtn = container.querySelector('#btn-bot-replenish');
        if (botReplenishBtn) botReplenishBtn.addEventListener('click', () => this.botReplenish());

        // 添加用户按钮
        const addUserBtn = container.querySelector('#btn-open-add-user');
        if (addUserBtn) addUserBtn.addEventListener('click', () => this.showAddUserModal());

        // 用户列表事件委托（详情按钮、发放按钮）- 绑定到document确保万无一失
        const adminPage = this;
        if (!this._userListDelegateBound) {
            this._userListDelegateBound = true;
            document.addEventListener('click', (e) => {
                // 详情按钮
                const detailBtn = e.target.closest('button.btn-user-detail');
                if (detailBtn && document.getElementById('tab-users')) {
                    const userId = detailBtn.dataset.userId;
                    if (userId) adminPage.showUserDetail(userId);
                    return;
                }

                // 发放物品按钮
                const giveBtn = e.target.closest('button[data-give-to]');
                if (giveBtn && document.getElementById('tab-users')) {
                    const userId = giveBtn.dataset.giveTo;
                    const select = document.querySelector(`select[data-user-id="${userId}"]`);
                    const qtyInput = document.querySelector(`input[data-qty-for="${userId}"]`);
                    if (!select || !qtyInput) return;

                    const itemId = parseInt(select.value);
                    const quantity = parseInt(qtyInput.value) || 1;

                    if (!itemId) {
                        showToast('请选择物品', 'error');
                        return;
                    }

                    (async () => {
                        try {
                            await adminAddItem(userId, itemId, quantity);
                            showToast('发放成功', 'success');
                        } catch (err) {
                            showToast('发放失败', 'error');
                        }
                    })();
                    return;
                }
            });
        }

        // 探索点管理按钮
        const addExplorePointBtn = container.querySelector('#btn-open-add-explore-point');
        if (addExplorePointBtn) addExplorePointBtn.addEventListener('click', () => this.showAddExplorePointModal());

        const viewHistoryBtn = container.querySelector('#btn-view-explore-history');
        if (viewHistoryBtn) viewHistoryBtn.addEventListener('click', () => this.showExploreHistoryModal());

        const locateBtn = container.querySelector('#btn-map-locate');
        if (locateBtn) locateBtn.addEventListener('click', () => this.locateOnMap());

        const addPoolBtn = container.querySelector('#btn-open-add-pool');
        if (addPoolBtn) addPoolBtn.addEventListener('click', () => this.showAddPoolModal());

        const poolTypeFilter = container.querySelector('#pool-type-filter');
        if (poolTypeFilter) {
            poolTypeFilter.addEventListener('change', () => {
                this.poolTypeFilterValue = poolTypeFilter.value || '';
                this.loadRewardPools(1);
            });
        }
    },

    async loadStats() {
        try {
            const stats = await getSystemStats();
            const statData = stats?.[0] ?? {};
            document.getElementById('stat-users').textContent = statData.total_users || 0;
            document.getElementById('stat-items').textContent = statData.total_items || 0;
            document.getElementById('stat-orders').textContent = statData.total_orders || 0;
            document.getElementById('stat-mails').textContent = statData.total_mails || 0;
        } catch (e) {
            console.error('Failed to load stats:', e);
        }
    },

    async loadUsers(page = 1) {
        this.userPage = page;
        const list = document.getElementById('user-list');
        if (!list) return;
        try {
            // 统一走 adminGetUsers（带搜索 + 后端分页）
            const data = await adminGetUsers(
                this.userSearch || '',
                page,
                this.userLimit,
                null  // 不筛选机器人
            );
            this.users = data || [];
            this.userTotal = this.users.length > 0
                ? parseInt(this.users[0].total_count) || 0
                : 0;
            this.renderUsers();
        } catch (e) {
            list.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    },

    renderUsers() {
        const list = document.getElementById('user-list');
        if (!list) return;
        if (this.users.length === 0) {
            list.innerHTML = `<div class="empty-state"><p>${this.userSearch ? '无匹配用户' : '暂无用户'}</p></div>`;
            return;
        }

        let html = this.users.map(user => {
            const isSelf = user.user_id === this.currentUserId;
            const isBanned = user.is_banned;
            const banTitle = isBanned ? this.formatBanTime(user.banned_until) : '';
            const cardStyle = isBanned ? 'border-color:var(--seal-red);background:#fff5f5;' : '';
            return `
            <div class="user-card" style="${cardStyle}">
                <div class="user-avatar-small clickable-avatar" style="overflow:hidden;padding:0;">
                    ${userAvatarHTML(user)}
                </div>
                <div class="user-info">
                    <span class="user-name clickable-name">${user.nickname || '无名'}</span>
                    <span class="user-date">${new Date(user.created_at).toLocaleDateString()}</span>
                </div>
                <div class="user-stats">
                    <span class="user-shells">${(user.shells ?? 0).toLocaleString()} 果壳币</span>
                    ${user.is_admin ? '<span class="admin-badge">管理员</span>' : ''}
                    ${user.is_bot ? '<span class="bot-tag">机器人</span>' : ''}
                    ${isBanned ? `<span class="ban-badge" title="${this.escHtml(banTitle)}">已封禁</span>` : ''}
                </div>
                <div class="user-actions">
                    <button class="btn btn-secondary btn-sm btn-user-detail" data-user-id="${user.user_id}">
                        <i data-lucide="info"></i> 详情
                    </button>
                    <select class="form-input" data-user-id="${user.user_id}" style="width:auto;padding:6px 12px;">
                        <option value="">选择物品</option>
                    </select>
                    <input type="number" class="form-input" data-qty-for="${user.user_id}" value="1" min="1" style="width:60px;" />
                    <button class="btn btn-secondary btn-sm" data-give-to="${user.user_id}">发放</button>
                </div>
            </div>
        `;
        }).join('');

        html += renderPagination(this.userPage, this.userTotal, this.userLimit);

        list.innerHTML = html;

        this.loadItemsForSelect();
        this.attachUserActions();
        bindPagination(list, (page) => this.loadUsers(page));
        createIcons({ icons });
    },

    async loadItemsForSelect() {
        try {
            const items = await adminGetItems(1, 1000);
            // 把所有"选择物品"原生 select 升级为可搜索下拉
            upgradeSelectsToSearchable('select[data-user-id]', items, { placeholder: '选择物品' });
        } catch (e) {
            console.error('Failed to load items:', e);
        }
    },

    attachUserActions() {
    },

    showBanUserModal(userId, userName, onSuccess) {
        const existing = document.getElementById('ban-user-modal');
        if (existing) existing.remove();

        const modalHtml = `
            <div id="ban-user-modal" class="modal" style="display:flex;">
                <div class="modal-overlay"></div>
                <div class="modal-content" style="max-width:440px;">
                    <div class="modal-header">
                        <h3><i data-lucide="ban"></i> 封禁用户</h3>
                        <button class="modal-close-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p style="margin-bottom:16px;">封禁用户「<strong>${this.escHtml(userName)}</strong>」，请选择封禁时长：</p>
                        
                        <div class="ban-duration-options">
                            <button class="btn btn-outline ban-duration-btn" data-hours="1">1 小时</button>
                            <button class="btn btn-outline ban-duration-btn" data-hours="24">1 天</button>
                            <button class="btn btn-outline ban-duration-btn" data-hours="72">3 天</button>
                            <button class="btn btn-outline ban-duration-btn" data-hours="168">7 天</button>
                            <button class="btn btn-outline ban-duration-btn" data-hours="720">30 天</button>
                            <button class="btn btn-outline ban-duration-btn" data-hours="-1">永久封禁</button>
                        </div>
                        
                        <div class="form-group" style="margin-top:16px;">
                            <label class="form-label">自定义时长（小时，留空使用上方选项）</label>
                            <input type="number" class="form-input" id="ban-custom-hours" min="0.5" step="0.5" placeholder="输入小时数，如 2.5 表示2个半小时">
                        </div>
                        
                        <button class="btn btn-warning" id="btn-confirm-ban" style="width:100%;margin-top:8px;" disabled>
                            <i data-lucide="ban"></i> 确认封禁
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('ban-user-modal');
        const closeModal = () => modal.remove();
        modal.querySelector('.modal-overlay').addEventListener('click', closeModal);
        modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
        createIcons({ icons });

        let selectedHours = null;
        const durationBtns = modal.querySelectorAll('.ban-duration-btn');
        const customInput = document.getElementById('ban-custom-hours');
        const confirmBtn = document.getElementById('btn-confirm-ban');

        const updateConfirmBtn = () => {
            const hasCustom = customInput.value && parseFloat(customInput.value) > 0;
            confirmBtn.disabled = selectedHours === null && !hasCustom;
        };

        durationBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                durationBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                customInput.value = '';
                selectedHours = parseFloat(btn.dataset.hours);
                updateConfirmBtn();
            });
        });

        customInput.addEventListener('input', () => {
            durationBtns.forEach(b => b.classList.remove('active'));
            selectedHours = null;
            updateConfirmBtn();
        });

        confirmBtn.addEventListener('click', async () => {
            let hours = selectedHours;
            const customVal = parseFloat(customInput.value);
            if (customVal > 0) {
                hours = customVal;
            }
            if (hours === null || (hours <= 0 && hours !== -1)) return;
            if (hours === -1) hours = null;

            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> 封禁中...';
            createIcons({ icons });

            try {
                const result = await adminBanUser(userId, hours);
                if (result?.success) {
                    showToast(result.message || '封禁成功', 'success');
                    closeModal();
                    if (onSuccess) onSuccess();
                } else {
                    showToast(result?.message || '封禁失败', 'error');
                    confirmBtn.disabled = false;
                    confirmBtn.innerHTML = '<i data-lucide="ban"></i> 确认封禁';
                    createIcons({ icons });
                }
            } catch (e) {
                showToast('封禁失败：' + e.message, 'error');
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i data-lucide="ban"></i> 确认封禁';
                createIcons({ icons });
            }
        });
    },

    async confirmUnbanUser(userId, userName) {
        const ok = await showConfirm(
            `确定要解封用户「${userName}」吗？\n\n解封后该用户将可以正常登录系统。`,
            { okText: '确认解封', okClass: 'btn-success', title: '解封用户' }
        );
        if (!ok) return;

        try {
            const result = await adminUnbanUser(userId);
            if (result?.success) {
                showToast(result.message || '解封成功', 'success');
                this.loadUsers(this.userPage);
            } else {
                showToast(result?.message || '解封失败', 'error');
            }
        } catch (e) {
            showToast('解封失败：' + e.message, 'error');
        }
    },

    async confirmDeleteUser(userId, userName, isAdmin, isVerified = true) {
        if (isAdmin) {
            showToast('不能删除管理员账号', 'error');
            return;
        }
        if (userId === this.currentUserId) {
            showToast('不能删除自己', 'error');
            return;
        }

        // 未激活用户：单次简洁确认
        if (!isVerified) {
            const ok = await showConfirm(
                `该用户邮箱尚未激活，确定要删除「${userName}」吗？`,
                { okText: '删除', okClass: 'btn-danger', title: '删除未激活用户' }
            );
            if (!ok) return;
        } else {
            // 已激活用户：输入昵称 + 二次确认
            const ok = await showConfirmTyped(
                `⚠️ 危险操作：永久删除用户「${userName}」\n\n` +
                `此操作将删除该用户的所有数据：\n` +
                `• 账号本身\n` +
                `• 背包物品\n` +
                `• 挂单记录\n` +
                `• 邮件\n` +
                `• 所有关联数据\n\n` +
                `此操作不可撤销！`,
                userName,
                { okText: '永久删除', placeholder: `请输入用户昵称以确认` }
            );
            if (!ok) return;
        }

        try {
            const result = await adminDeleteUser(userId);
            if (result?.success) {
                showToast(result.message || '用户已删除', 'success');
                this.loadUsers(this.userPage);
                this.loadStats();
            } else {
                showToast(result?.message || '删除失败', 'error');
            }
        } catch (e) {
            showToast('删除失败：' + e.message, 'error');
        }
    },

    async showUserDetail(userId, invPage = 1) {
        this.invPage = invPage;
        const user = this.users.find(u => u.user_id === userId);
        if (!user) return;

        // 如果已有弹窗（切页），只更新loading状态，不重建
        const existingModal = document.getElementById('user-detail-modal');
        if (existingModal) {
            existingModal.style.display = 'flex';
            const body = existingModal.querySelector('.user-detail-body');
            if (body) {
                body.innerHTML = '<div class="user-detail-loading"><i data-lucide="loader-2" class="spin"></i> 加载中...</div>';
                createIcons({ icons });
            }
        } else {
            const modalHtml = `
                <div id="user-detail-modal" class="modal" style="display:flex;">
                    <div class="modal-overlay"></div>
                    <div class="modal-content user-detail-content">
                        <div class="modal-header">
                            <h3>用户详情</h3>
                            <button class="modal-close-btn">&times;</button>
                        </div>
                        <div class="user-detail-body">
                            <div class="user-detail-loading">
                                <i data-lucide="loader-2" class="spin"></i> 加载中...
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            const modal = document.getElementById('user-detail-modal');
            const closeModal = () => modal.remove();
            modal.querySelector('.modal-overlay').addEventListener('click', closeModal);
            modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
            createIcons({ icons });
        }

        const modal = document.getElementById('user-detail-modal');

        const renderDetail = (detail, inventory) => {
            const body = modal.querySelector('.user-detail-body');
            const invItems = inventory || [];
            const invTotal = parseInt(invItems[0]?.total_count) || 0;
            const d = detail || {};
            const invCount = d.inventory_count ?? invTotal;

            let html = `
                <div class="user-detail-section">
                    <h4>基本信息</h4>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <span class="detail-label">用户ID</span>
                            <span class="detail-value">${d.user_id || user.user_id}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">昵称</span>
                            <span class="detail-value">${d.nickname || user.nickname || '未设置'}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">邮箱</span>
                            <span class="detail-value">${d.email || user.email || '未绑定'}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">注册时间</span>
                            <span class="detail-value">${d.created_at ? new Date(d.created_at).toLocaleString() : new Date(user.created_at).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
                <div class="user-detail-section">
                    <h4>账号信息</h4>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <span class="detail-label">果壳币</span>
                            <span class="detail-value highlight">${(d.shells ?? user.shells ?? 0).toLocaleString()}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">背包物品数</span>
                            <span class="detail-value">${invCount}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">管理员</span>
                            <span class="detail-value">${(d.is_admin ?? user.is_admin) ? '是' : '否'}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">机器人</span>
                            <span class="detail-value">${(d.is_bot ?? user.is_bot) ? '是' : '否'}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">封禁状态</span>
                            <span class="detail-value" style="color:${(d.is_banned ?? user.is_banned) ? 'var(--seal-red)' : 'inherit'};">${(d.is_banned ?? user.is_banned) ? '已封禁' : '正常'}</span>
                        </div>
                        ${(d.is_banned ?? user.is_banned) && d.banned_until ? `
                        <div class="detail-item" style="grid-column:span 2;">
                            <span class="detail-label">解封时间</span>
                            <span class="detail-value">${this.formatBanTime(d.banned_until)}（${d.banned_until === 'infinity' || d.banned_until > '2999-01-01' ? '永久' : new Date(d.banned_until).toLocaleString()}）</span>
                        </div>
                        ` : ''}
                        <div class="detail-item">
                            <span class="detail-label">订单数</span>
                            <span class="detail-value">${d.order_count ?? 0}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">邮件数</span>
                            <span class="detail-value">${d.mail_count ?? 0}</span>
                        </div>
                    </div>
                </div>
                <div class="user-detail-section">
                    <h4>管理操作</h4>
                    <div class="admin-actions-row">
                        <div class="admin-action-group">
                            <label>修改昵称</label>
                            <div class="nickname-change-row">
                                <input type="text" class="form-input" id="new-nickname" placeholder="新昵称" maxlength="10" style="flex:1;" />
                                <button class="btn btn-sm btn-primary" id="btn-change-nickname">修改</button>
                            </div>
                        </div>
                        <div class="admin-action-group">
                            <label>果壳币调整</label>
                            <div class="shells-adjust-row">
                                <input type="number" class="form-input" id="shells-adjust-amount" placeholder="数量" style="width:80px;" />
                                <button class="btn btn-sm btn-success" id="btn-shells-add">增加</button>
                                <button class="btn btn-sm btn-danger" id="btn-shells-reduce">减少</button>
                            </div>
                            <input type="text" class="form-input" id="shells-reason" placeholder="操作原因（可选）" style="margin-top:4px;" />
                        </div>
                        <div class="admin-action-group">
                            <label>物品管理</label>
                            <button class="btn btn-sm btn-danger" id="btn-clear-items">清空所有物品</button>
                        </div>
                        <div class="admin-action-group">
                            <label>权限管理</label>
                            <button class="btn btn-sm ${(d.is_admin ?? user.is_admin) ? 'btn-warning' : 'btn-success'}" id="btn-toggle-admin">
                                ${(d.is_admin ?? user.is_admin) ? '撤销管理员' : '设为管理员'}
                            </button>
                        </div>
                        ${!(d.is_admin ?? user.is_admin) && (d.user_id || user.user_id) !== this.currentUserId ? `
                        <div class="admin-action-group">
                            <label>账号状态</label>
                            <button class="btn btn-sm ${(d.is_banned ?? user.is_banned) ? 'btn-success' : 'btn-warning'}" id="btn-toggle-ban">
                                <i data-lucide="${(d.is_banned ?? user.is_banned) ? 'unlock' : 'ban'}" style="width:14px;height:14px;"></i>
                                ${(d.is_banned ?? user.is_banned) ? '解封账号' : '封禁账号'}
                            </button>
                        </div>
                        <div class="admin-action-group">
                            <label>危险操作</label>
                            <button class="btn btn-sm btn-danger" id="btn-delete-user-detail" style="background:var(--seal-red);color:var(--paper-card);border-color:var(--seal-red);">
                                <i data-lucide="trash-2" style="width:14px;height:14px;"></i> 永久删除此用户
                            </button>
                        </div>
                        ` : ''}
                    </div>
                </div>`;

            if (invItems.length > 0) {
                html += `
                <div class="user-detail-section">
                    <h4>背包物品 (${invCount}件)</h4>
                    <div class="user-inventory-list" id="inv-list-content">
                        ${invItems.map(item => {
                            const cfg = QUALITY_CONFIG[item.item_quality] || QUALITY_CONFIG.white;
                            return `
                                <div class="inv-item-row" data-inv-item-id="${item.item_id}" data-inv-item-name="${item.item_name}">
                                    <span class="quality-dot" style="background:${cfg.color}"></span>
                                    <span class="inv-item-name">${item.item_name}</span>
                                    <span class="quality-badge quality-${item.item_quality}">${cfg.label}</span>
                                    <span class="inv-item-qty">x${item.quantity}</span>
                                    <button class="btn btn-danger btn-xs btn-remove-item" data-item-id="${item.item_id}" data-item-name="${item.item_name}" data-qty="${item.quantity}">
                                        <i data-lucide="trash-2"></i>
                                    </button>
                                </div>
                            `;
                        }).join('')}
                    </div>
                    ${renderPagination(invPage, invTotal, this.invLimit)}
                </div>`;
            } else {
                html += `
                <div class="user-detail-section">
                    <h4>背包物品</h4>
                    <div class="empty-state"><p>暂无物品</p></div>
                </div>`;
            }

            body.innerHTML = html;
            createIcons({ icons });

            bindPagination(body, (page) => {
                this.showUserDetail(userId, page);
            });

            // 绑定管理操作事件
            this.bindUserDetailActions(userId);
        };

        try {
            const [detail, inventory] = await Promise.all([
                getUserDetail(userId),
                getUserInventory(userId, invPage, this.invLimit)
            ]);
            renderDetail(detail, inventory);
        } catch (e) {
            renderDetail(null, []);
        }
    },

    async loadItems(page = 1) {
        this.itemPage = page;
        const list = document.getElementById('item-list');
        if (!list) return;
        const search = (document.getElementById('item-search')?.value || '').trim();
        const quality = document.getElementById('item-quality-filter')?.value || '';
        const itemType = document.getElementById('item-type-filter')?.value || '';
        try {
            const [data, allItemsData] = await Promise.all([
                adminGetItems(page, this.itemLimit, search, quality, itemType),
                adminGetAllItems()
            ]);
            this.items = data || [];
            this.allItems = allItemsData || [];
            // 关键修复：total_count 在每一行都返回，0条数据时需要单独查询
            if (data.length > 0) {
                this.itemTotal = parseInt(data[0].total_count) || 0;
            } else {
                // 没数据时，total 是 0（但分页要正确显示）
                this.itemTotal = 0;
            }
            // 如果当前页超出范围，重置到第 1 页
            const totalPages = Math.max(1, Math.ceil(this.itemTotal / this.itemLimit));
            if (this.itemPage > totalPages) {
                this.itemPage = 1;
                return this.loadItems(1);
            }
            this.renderItems();
        } catch (e) {
            console.error('loadItems error:', e);
            list.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    },

    renderItems() {
        const list = document.getElementById('item-list');
        if (!list) return;
        if (this.items.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>暂无匹配物品</p></div>';
            return;
        }

        const items = this.items;
        let html = items.map(item => {
            const cfg = QUALITY_CONFIG[item.quality] || QUALITY_CONFIG.white;
            const qClass = 'quality-' + (item.quality || 'white');

            // 种子物品显示作物信息
            let cropInfoHtml = '';
            if (item.item_type === 'seed' && item.crop_info) {
                const ci = item.crop_info;
                const growTime = this.formatGrowTime(ci.grow_seconds);
                const cropQuality = QUALITY_CONFIG[ci.crop_quality] || QUALITY_CONFIG.white;
                const dropRange = ci.drop_quantity_min === ci.drop_quantity_max
                    ? ci.drop_quantity_min
                    : `${ci.drop_quantity_min}~${ci.drop_quantity_max}`;
                cropInfoHtml = `
                    <div class="crop-info">
                        <div class="crop-info-title">🌱 作物信息</div>
                        <div class="crop-info-row">
                            <span class="crop-label">产出：</span>
                            <span class="crop-value" style="color:${cropQuality.color}">${ci.crop_name || '未知'}</span>
                        </div>
                        <div class="crop-info-row">
                            <span class="crop-label">生长：</span>
                            <span class="crop-value">${growTime}</span>
                        </div>
                        <div class="crop-info-row">
                            <span class="crop-label">产量：</span>
                            <span class="crop-value">${dropRange} 个</span>
                        </div>
                        <div class="crop-info-row">
                            <span class="crop-label">经验：</span>
                            <span class="crop-value">+${ci.exp_reward}</span>
                        </div>
                    </div>
                `;
            }

            return `
                <div class="item-admin-card ${qClass}">
                    <div class="item-quality-bar ${qClass}"></div>
                    <div class="item-admin-row">
                        ${itemImageHTML(item.name, item.quality, item.image_name, 48)}
                        <div class="item-info">
                            <span class="item-name">${item.name}</span>
                            <span class="item-quality">${cfg.label}</span>
                        </div>
                    </div>
                    <div class="item-meta">
                        <span>权重: ${item.drop_weight}</span>
                        <span>ID: ${item.item_id}</span>
                    </div>
                    ${cropInfoHtml}
                    <div class="item-actions">
                        <button class="btn btn-secondary btn-sm btn-edit-item" data-item-id="${item.item_id}">
                            <i data-lucide="edit-3"></i> 编辑
                        </button>
                        <button class="btn btn-danger btn-sm btn-delete-item" data-item-id="${item.item_id}" data-item-name="${this.escHtml(item.name)}" data-item-type="${item.item_type || ''}">
                            <i data-lucide="trash-2"></i> 删除
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        html += renderPagination(this.itemPage, this.itemTotal, this.itemLimit);

        list.innerHTML = html;
        createIcons({ icons });
        initItemImages();

        bindPagination(list, (page) => this.loadItems(page));
        list.querySelectorAll('.btn-edit-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const itemId = parseInt(btn.dataset.itemId);
                this.editItem(itemId);
            });
        });
        list.querySelectorAll('.btn-delete-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const itemId = parseInt(btn.dataset.itemId);
                const itemName = btn.dataset.itemName;
                const itemType = btn.dataset.itemType;
                this.confirmDeleteItem(itemId, itemName, itemType);
            });
        });
    },

    formatGrowTime(seconds) {
        if (!seconds) return '未知';
        if (seconds < 60) return `${seconds}秒`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`;
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return mins > 0 ? `${hours}小时${mins}分` : `${hours}小时`;
    },

    async confirmDeleteItem(itemId, itemName, itemType) {
        const ok = await showConfirm(
            `确定要删除物品「${itemName}」吗？\n\n` +
            `此操作不可撤销！\n` +
            `类型：${itemType || '未知'}\n` +
            `ID：${itemId}`,
            { okText: '删除', okClass: 'btn-danger', danger: true }
        );
        if (!ok) return;

        try {
            const result = await adminDeleteItem(itemId);
            if (result?.success) {
                showToast(result.message || '删除成功', 'success');
                this.loadItems(this.itemPage);
                this.loadStats();
            } else {
                showToast(result?.message || '删除失败', 'error');
            }
        } catch (e) {
            showToast('删除失败：' + e.message, 'error');
        }
    },

    async editItem(itemId) {
        const item = this.items.find(i => i.item_id === itemId);
        if (!item) return;

        const existing = document.getElementById('item-edit-modal');
        if (existing) existing.remove();

        const allItems = this.allItems || [];

        const modalHtml = `
            <div id="item-edit-modal" class="modal" style="display:flex;">
                <div class="modal-overlay"></div>
                <div class="modal-content" style="max-width:520px;max-height:90vh;overflow-y:auto;">
                    <div class="modal-header">
                        <h3>编辑物品 #${item.item_id}</h3>
                        <button class="modal-close-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label">名称</label>
                            <input type="text" class="form-input" id="edit-item-name" value="${this.escHtml(item.name)}" />
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">品质</label>
                                <select class="form-input" id="edit-item-quality">
                                    ${qualityOptionsHTML({ selected: item.quality })}
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">类型</label>
                                <select class="form-input" id="edit-item-type">
                                    ${itemTypeOptionsHTML({ selected: item.item_type })}
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">图像链接</label>
                            <input type="text" class="form-input" id="edit-item-image" value="${this.escHtml(item.image_name || '')}" placeholder="留空使用默认，外链填 https://..." />
                            <div style="margin-top:8px;text-align:center;">
                                <img id="edit-item-preview" src="${this.escHtml(item.image_name || '')}" alt="预览" style="max-width:100%;max-height:120px;object-fit:contain;border-radius:8px;display:${item.image_name ? 'block' : 'none'};" onerror="this.style.display='none';" />
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">描述</label>
                            <input type="text" class="form-input" id="edit-item-desc" value="${this.escHtml(item.description || '')}" />
                        </div>
                        <div class="form-group">
                            <label class="form-label">权重</label>
                            <input type="number" class="form-input" id="edit-item-weight" value="${item.drop_weight}" />
                        </div>

                        <div id="consumable-pool-section" style="margin-top:16px;padding-top:16px;border-top:1.5px dashed var(--ink-faded);">
                            <h4 style="margin:0 0 12px;font-family:var(--font-mono);font-size:0.95rem;"><i data-lucide="gift" style="width:16px;height:16px;vertical-align:middle;"></i> 消耗品奖池（仅消耗品类型有效）</h4>
                            <div class="form-group">
                                <label class="form-label">关联奖池</label>
                                <select class="form-input" id="edit-item-reward-pool">
                                    <option value="">无（普通消耗品）</option>
                                </select>
                            </div>
                        </div>

                        <div id="crop-config-section" style="display:none;margin-top:16px;padding-top:16px;border-top:1.5px dashed var(--ink-faded);">
                            <h4 style="margin:0 0 12px;font-family:var(--font-mono);font-size:0.95rem;"><i data-lucide="sprout" style="width:16px;height:16px;vertical-align:middle;"></i> 作物配置</h4>
                            <div class="form-group">
                                <label class="form-label">收获物品</label>
                                <select class="form-input" id="edit-crop-id" data-searchable-item-select>
                                    ${allItems.map(i => `<option value="${i.id || i.item_id}">${this.escHtml(i.name)} (${i.item_type || 'collection'})</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label class="form-label">生长时间（秒）</label>
                                    <input type="number" class="form-input" id="edit-grow-seconds" value="60" min="1" />
                                </div>
                                <div class="form-group">
                                    <label class="form-label">经验奖励</label>
                                    <input type="number" class="form-input" id="edit-exp-reward" value="10" min="0" />
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label class="form-label">掉落数量最小值</label>
                                    <input type="number" class="form-input" id="edit-drop-min" value="1" min="1" />
                                </div>
                                <div class="form-group">
                                    <label class="form-label">掉落数量最大值</label>
                                    <input type="number" class="form-input" id="edit-drop-max" value="1" min="1" />
                                </div>
                            </div>
                        </div>

                        <button class="btn btn-primary" id="btn-save-item" style="width:100%;margin-top:16px;">保存</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('item-edit-modal');
        const closeModal = () => modal.remove();
        modal.querySelector('.modal-overlay').addEventListener('click', closeModal);
        modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);

        createIcons({ icons });

        // 把收获物品下拉升级为可搜索下拉
        upgradeSelectsToSearchable('#edit-crop-id', allItems, { placeholder: '选择收获物品' });

        const typeSelect = modal.querySelector('#edit-item-type');
        const cropSection = modal.querySelector('#crop-config-section');

        const toggleCropSection = () => {
            if (typeSelect.value === 'seed') {
                cropSection.style.display = 'block';
            } else {
                cropSection.style.display = 'none';
            }
        };
        typeSelect.addEventListener('change', toggleCropSection);
        toggleCropSection();

        await this._loadPoolSelect('#edit-item-reward-pool', item.reward_pool_id, ['consumable', 'general']);

        if (item.item_type === 'seed') {
            const cropConfig = await adminGetCropBySeedId(itemId);
            if (cropConfig) {
                const cropIdSelect = modal.querySelector('#edit-crop-id');
                if (cropIdSelect) {
                    cropIdSelect.value = cropConfig.crop_id;
                    // 触发 change 事件，让可搜索下拉更新显示
                    cropIdSelect.dispatchEvent(new Event('change', { bubbles: true }));
                }
                modal.querySelector('#edit-grow-seconds').value = cropConfig.grow_seconds;
                modal.querySelector('#edit-exp-reward').value = cropConfig.exp_reward;
                modal.querySelector('#edit-drop-min').value = cropConfig.drop_quantity_min;
                modal.querySelector('#edit-drop-max').value = cropConfig.drop_quantity_max;
            }
        }

        const imgInput = modal.querySelector('#edit-item-image');
        const imgPreview = modal.querySelector('#edit-item-preview');
        if (imgInput && imgPreview) {
            imgInput.addEventListener('input', () => {
                const url = imgInput.value.trim();
                if (url) {
                    imgPreview.src = url;
                    imgPreview.style.display = 'block';
                } else {
                    imgPreview.style.display = 'none';
                }
            });
        }

        document.getElementById('btn-save-item').addEventListener('click', async () => {
            const name = document.getElementById('edit-item-name').value.trim();
            const quality = document.getElementById('edit-item-quality').value;
            const itemType = document.getElementById('edit-item-type').value;
            const imageName = document.getElementById('edit-item-image').value.trim();
            const description = document.getElementById('edit-item-desc').value.trim();
            const weight = parseInt(document.getElementById('edit-item-weight').value);
            const weightVal = isNaN(weight) ? 100 : weight;
            const rewardPoolId = document.getElementById('edit-item-reward-pool').value;
            const poolIdVal = rewardPoolId ? parseInt(rewardPoolId) : null;

            if (!name) { showToast('名称不能为空', 'error'); return; }

            try {
                await adminUpdateItemDefinition(itemId, name, quality, itemType, imageName, description, weightVal, poolIdVal);

                if (itemType === 'seed') {
                    const cropId = parseInt(document.getElementById('edit-crop-id').value);
                    const growSeconds = parseInt(document.getElementById('edit-grow-seconds').value);
                    const expReward = parseInt(document.getElementById('edit-exp-reward').value);
                    const dropMin = parseInt(document.getElementById('edit-drop-min').value);
                    const dropMax = parseInt(document.getElementById('edit-drop-max').value);

                    if (!cropId || !growSeconds || growSeconds <= 0) {
                        showToast('请正确填写作物配置', 'error');
                        return;
                    }

                    const cropResult = await adminUpdateCropConfig(itemId, cropId, growSeconds, expReward, dropMin, dropMax);
                    if (!cropResult?.success) {
                        showToast(cropResult?.message || '作物配置保存失败', 'error');
                        return;
                    }
                }

                showToast('保存成功', 'success');
                closeModal();
                this.loadItems(this.itemPage);
            } catch (e) {
                showToast('保存失败：' + e.message, 'error');
            }
        });
    },

    escHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    formatBanTime(bannedUntil) {
        if (!bannedUntil) return '已封禁';
        if (bannedUntil === 'infinity' || bannedUntil === Infinity) return '永久封禁';
        try {
            const until = new Date(bannedUntil);
            const now = new Date();
            const diffMs = until - now;
            if (diffMs <= 0) return '已过期';
            const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            if (diffDays > 30) {
                return `封至${until.getFullYear()}/${String(until.getMonth() + 1).padStart(2, '0')}/${String(until.getDate()).padStart(2, '0')}`;
            } else if (diffDays > 1) {
                return `还有${diffDays}天`;
            } else {
                const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
                return `还有${diffHours}小时`;
            }
        } catch (e) {
            return '已封禁';
        }
    },

    async showAddItemModal() {
        const existing = document.getElementById('add-item-modal');
        if (existing) existing.remove();

        const modalHtml = `
            <div id="add-item-modal" class="modal" style="display:flex;">
                <div class="modal-overlay"></div>
                <div class="modal-content" style="max-width:520px;max-height:90vh;overflow-y:auto;">
                    <div class="modal-header">
                        <h3>添加收藏品</h3>
                        <button class="modal-close-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">名称 <span class="required">*</span></label>
                                <input type="text" class="form-input" id="add-item-name" placeholder="物品名称" />
                            </div>
                            <div class="form-group">
                                <label class="form-label">品质 <span class="required">*</span></label>
                                <select class="form-input" id="add-item-quality">
                                    ${qualityOptionsHTML({ selected: 'white' })}
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">描述</label>
                            <input type="text" class="form-input" id="add-item-desc" placeholder="物品描述" />
                        </div>
                        <div class="form-group">
                            <label class="form-label">图像链接（可选，支持外链）</label>
                            <input type="text" class="form-input" id="add-item-image" placeholder="留空使用默认，填 https://... 使用外链" />
                            <div style="margin-top:8px;text-align:center;">
                                <img id="add-item-preview" src="" alt="预览" style="max-width:100%;max-height:120px;object-fit:contain;border-radius:8px;display:none;" onerror="this.style.display='none';" />
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">权重（越小越稀有）</label>
                            <input type="number" class="form-input" id="add-item-weight" placeholder="100" value="100" />
                        </div>
                        <div class="form-group">
                            <label class="form-label">类型</label>
                            <select class="form-input" id="add-item-type">
                                <option value="collection">收藏品</option>
                                <option value="consumable">消耗品</option>
                                <option value="equipment">装备</option>
                                <option value="material">材料</option>
                                <option value="currency">货币</option>
                                <option value="seed">种子</option>
                            </select>
                        </div>
                        <div id="add-consumable-pool-section" style="margin-top:16px;padding-top:16px;border-top:1.5px dashed var(--ink-faded);">
                            <h4 style="margin:0 0 12px;font-family:var(--font-mono);font-size:0.95rem;"><i data-lucide="gift" style="width:16px;height:16px;vertical-align:middle;"></i> 消耗品奖池</h4>
                            <div class="form-group">
                                <label class="form-label">关联奖池</label>
                                <select class="form-input" id="add-item-reward-pool">
                                    <option value="">无（普通消耗品）</option>
                                </select>
                            </div>
                        </div>
                        <button class="btn btn-primary" id="btn-confirm-add-item" style="width:100%;margin-top:16px;">
                            <i data-lucide="plus"></i>
                            <span>添加物品</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('add-item-modal');
        const closeModal = () => modal.remove();
        modal.querySelector('.modal-overlay').addEventListener('click', closeModal);
        modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
        createIcons({ icons });

        await this._loadPoolSelect('#add-item-reward-pool', null, ['consumable', 'general']);

        // 图像预览
        const imgInput = modal.querySelector('#add-item-image');
        const imgPreview = modal.querySelector('#add-item-preview');
        if (imgInput && imgPreview) {
            imgInput.addEventListener('input', () => {
                const url = imgInput.value.trim();
                if (url) {
                    imgPreview.src = url;
                    imgPreview.style.display = 'block';
                } else {
                    imgPreview.style.display = 'none';
                }
            });
        }

        // 确认添加
        modal.querySelector('#btn-confirm-add-item').addEventListener('click', async () => {
            const name = modal.querySelector('#add-item-name').value.trim();
            const quality = modal.querySelector('#add-item-quality').value;
            const description = modal.querySelector('#add-item-desc').value.trim();
            const weightInput = modal.querySelector('#add-item-weight').value;
            const imageName = modal.querySelector('#add-item-image').value.trim();
            const itemType = modal.querySelector('#add-item-type').value;
            const rewardPoolId = modal.querySelector('#add-item-reward-pool').value;
            const w = parseInt(weightInput);
            const weight = isNaN(w) ? 100 : w;
            const poolIdVal = rewardPoolId ? parseInt(rewardPoolId) : null;

            if (!name) {
                showToast('请输入物品名称', 'error');
                return;
            }

            const btn = modal.querySelector('#btn-confirm-add-item');
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> 添加中...';
            createIcons({ icons });

            try {
                await adminAddItemDefinition(name, quality, imageName, description, weight, itemType, poolIdVal);
                showToast('添加成功', 'success');
                closeModal();
                await this.loadStats();
                this.loadItems();
            } catch (e) {
                showToast('添加失败', 'error');
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="plus"></i><span>添加物品</span>';
                createIcons({ icons });
            }
        });
    },

    showAddUserModal() {
        const existing = document.getElementById('add-user-modal');
        if (existing) existing.remove();

        const modalHtml = `
            <div id="add-user-modal" class="modal" style="display:flex;">
                <div class="modal-overlay"></div>
                <div class="modal-content" style="max-width:480px;max-height:90vh;overflow-y:auto;">
                    <div class="modal-header">
                        <h3><i data-lucide="user-plus"></i> 添加新用户</h3>
                        <button class="modal-close-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form class="add-user-form" id="add-user-form" autocomplete="off">
                            <div>
                                <label class="form-label">邮箱 <span class="required">*</span></label>
                                <input type="email" class="form-input" id="add-user-email"
                                    placeholder="user@example.com" required />
                                <div class="form-hint">用户可使用此邮箱登录</div>
                            </div>
                            <div>
                                <label class="form-label">初始密码 <span class="required">*</span></label>
                                <input type="text" class="form-input" id="add-user-password"
                                    placeholder="至少 6 位" required />
                                <div class="form-hint">管理员可设置一个临时密码，用户登录后可自行修改</div>
                            </div>
                            <div>
                                <label class="form-label">昵称 <span class="required">*</span></label>
                                <input type="text" class="form-input" id="add-user-nickname"
                                    placeholder="2-10 字符" required maxlength="10" />
                                <div class="form-hint">昵称在系统内必须唯一</div>
                            </div>
                            <label class="checkbox-row" for="add-user-is-bot">
                                <input type="checkbox" id="add-user-is-bot" />
                                <span class="checkbox-label">设为机器人</span>
                                <span class="checkbox-hint">自动添加到机器人管理</span>
                            </label>
                            <button type="submit" class="btn btn-primary" id="btn-confirm-add-user"
                                style="width:100%;margin-top:8px;">
                                <i data-lucide="user-plus"></i>
                                <span>创建用户</span>
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('add-user-modal');
        const closeModal = () => modal.remove();
        modal.querySelector('.modal-overlay').addEventListener('click', closeModal);
        modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
        createIcons({ icons });

        // 提交创建
        const form = modal.querySelector('#add-user-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = modal.querySelector('#add-user-email').value.trim();
            const password = modal.querySelector('#add-user-password').value;
            const nickname = modal.querySelector('#add-user-nickname').value.trim();
            const isBot = modal.querySelector('#add-user-is-bot').checked;

            // 前端预校验
            if (!email || !password || !nickname) {
                showToast('请填写所有必填项', 'error');
                return;
            }
            if (password.length < 6) {
                showToast('密码至少 6 位', 'error');
                return;
            }
            if (nickname.length < 2 || nickname.length > 10) {
                showToast('昵称需要 2-10 字符', 'error');
                return;
            }

            const btn = modal.querySelector('#btn-confirm-add-user');
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> 创建中...';
            createIcons({ icons });

            try {
                const result = await adminCreateUser(email, password, nickname, isBot);
                if (result?.success) {
                    showToast(
                        isBot
                            ? `机器人 "${nickname}" 创建成功，已加入机器人管理`
                            : `用户 "${nickname}" 创建成功`,
                        'success'
                    );
                    closeModal();
                    // 刷新统计和列表
                    this.loadStats();
                    this.loadUsers(1);
                } else {
                    showToast(result?.message || '创建失败', 'error');
                }
            } catch (e) {
                showToast('创建失败：' + e.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="user-plus"></i><span>创建用户</span>';
                createIcons({ icons });
            }
        });

        // 自动聚焦第一个输入框
        setTimeout(() => modal.querySelector('#add-user-email')?.focus(), 50);
    },

    async loadSubmissions(page = 1) {
        this.subPage = page;
        const list = document.getElementById('submission-list-admin');
        if (!list) return;
        try {
            const data = await getPendingSubmissions(page, this.subLimit);
            this.submissions = data || [];
            if (data.length > 0) {
                this.subTotal = parseInt(data[0].total_count) || 0;
            }
            this.renderSubmissions();
        } catch (e) {
            list.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    },

    renderSubmissions() {
        const list = document.getElementById('submission-list-admin');
        if (!list) return;

        if (this.submissions.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>暂无待审核投稿</p></div>';
            return;
        }

        let html = this.submissions.map(sub => {
            const cfg = QUALITY_CONFIG[sub.quality] || QUALITY_CONFIG.white;
            return `
                <div class="submission-card">
                    <div class="submission-quality-bar quality-${sub.quality || 'white'}"></div>
                    <div class="submission-info">
                        <div class="submission-header">
                            ${itemImageHTML(sub.name, sub.quality, sub.image_name, 40)}
                            <span class="submission-name">${sub.name}</span>
                            <span class="quality-${sub.quality || 'white'}-text">${cfg.label}</span>
                        </div>
                        <p class="submission-desc">${sub.description}</p>
                        <div class="submission-meta">
                            <span>作者: ${sub.nickname || '匿名'}</span>
                            <span>权重: ${sub.drop_weight}</span>
                        </div>
                    </div>
                    <div class="submission-actions">
                        <input type="number" class="form-input reward-input" data-sub-id="${sub.id}" placeholder="奖励" value="1000" min="0" style="width:80px;" />
                        <button class="btn btn-success btn-sm" data-approve="${sub.id}">通过</button>
                        <button class="btn btn-danger btn-sm" data-reject="${sub.id}">拒绝</button>
                    </div>
                </div>
            `;
        }).join('');

        html += renderPagination(this.subPage, this.subTotal, this.subLimit);

        list.innerHTML = html;
        initItemImages();

        this.attachSubmissionActions();
        bindPagination(list, (page) => this.loadSubmissions(page));
    },

    attachSubmissionActions() {
        document.querySelectorAll('button[data-approve]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = parseInt(btn.dataset.approve);
                const input = document.querySelector(`input[data-sub-id="${id}"]`);
                const reward = input ? (parseInt(input.value) || 0) : 0;
                try {
                    await approveSubmission(id, reward);
                    showToast('审核通过', 'success');
                    this.loadSubmissions();
                } catch (e) {
                    showToast('操作失败', 'error');
                }
            });
        });

        document.querySelectorAll('button[data-reject]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.reject);
                this.showRejectModal(id);
            });
        });
    },

    showRejectModal(submissionId) {
        const modalHtml = `
            <div id="reject-modal" class="modal" style="display:flex;">
                <div class="modal-overlay"></div>
                <div class="modal-content" style="max-width:400px;">
                    <h3 style="margin-bottom:16px;color:var(--text-primary);">拒绝投稿</h3>
                    <textarea id="reject-reason-input" class="form-input" placeholder="请输入拒绝原因..." rows="4" style="width:100%;margin-bottom:16px;"></textarea>
                    <div style="display:flex;gap:12px;justify-content:flex-end;">
                        <button class="btn btn-secondary modal-close">取消</button>
                        <button class="btn btn-danger" id="confirm-reject-btn">确认拒绝</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('reject-modal');
        // 遮罩/取消关闭弹窗（不用内联onclick）
        modal.querySelector('.modal-overlay').addEventListener('click', () => modal.remove());
        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());

        modal.querySelector('#confirm-reject-btn').addEventListener('click', async () => {
            const input = document.getElementById('reject-reason-input');
            const reason = input?.value.trim() || '无';
            try {
                await rejectSubmission(submissionId, reason);
                showToast('已拒绝', 'success');
                modal.remove();
                this.loadSubmissions();
            } catch (e) {
                showToast('操作失败', 'error');
            }
        });
    },

    async loadLotteryInfo() {
        try {
            const round = await getLotteryRound();
            if (!round) throw new Error('无当期彩票');
            document.getElementById('admin-lottery-round').textContent = round.round_number ?? '--';
            document.getElementById('admin-lottery-pool').textContent = (round.total_pool ?? 0).toLocaleString();
            document.getElementById('admin-lottery-numbers').textContent = round.winning_numbers ?? '--';
            document.getElementById('admin-lottery-status').textContent = this.getStatusText(round.status);
            document.getElementById('admin-lottery-end').textContent = round.end_time ? new Date(round.end_time).toLocaleString() : '--';

            await this.loadLotteryRoundList();
        } catch (e) {
            console.error('加载彩票信息失败:', e);
        }
    },

    getStatusText(status) {
        const map = {
            active: '进行中',
            closed: '已结束',
            drawn: '已开奖'
        };
        return map[status] || status || '未知';
    },

    async adminDraw() {
        try {
            const round = await getLotteryRound();
            if (!round) return showToast('无当期彩票', 'error');
            const result = await drawLotteryRound(round.round_id);
            if (result.success) {
                showToast('开奖成功！号码: ' + result.winning_numbers, 'success');
                await this.loadLotteryInfo();
            } else {
                showToast(result.message || '开奖失败', 'error');
            }
        } catch (e) {
            showToast('开奖失败', 'error');
        }
    },

    async debugDraw() {
        const inputEl = document.getElementById('debug-numbers');
        if (!inputEl) return;
        const customNumbers = inputEl.value.trim().toUpperCase();
        try {
            const round = await getLotteryRound();
            if (!round) return showToast('无当期彩票', 'error');
            const result = await drawLotteryRound(round.round_id, customNumbers || null);
            if (result.success) {
                showToast('Debug开奖成功！号码: ' + result.winning_numbers, 'success');
                inputEl.value = '';
                await this.loadLotteryInfo();
            } else {
                showToast(result.message || '开奖失败', 'error');
            }
        } catch (e) {
            showToast('开奖失败', 'error');
        }
    },

    async loadLotteryRoundList(page = 1) {
        this.lottoPage = page;
        const list = document.getElementById('admin-lottery-list');
        if (!list) return;
        try {
            const result = await getLotteryHistory(page, this.lottoLimit);
            const rounds = result?.rounds || [];
            this.lottoTotal = result?.total_count || 0;

            if (!rounds || rounds.length === 0) {
                list.innerHTML = '<div class="empty-state"><p>暂无期次记录</p></div>';
                return;
            }

            let html = rounds.map(round => {
                return `<div class="lottery-round-item">
                    <div class="round-info">
                        <span class="round-number">${round.round_number}</span>
                        <span class="round-status">${this.getStatusText(round.status)}</span>
                    </div>
                    <div class="round-detail">
                        <span>奖池: ${(round.total_pool ?? 0).toLocaleString()}</span>
                        <span>号码: ${round.winning_numbers ?? '--'}</span>
                    </div>
                </div>`;
            }).join('');

            html += renderPagination(this.lottoPage, this.lottoTotal, this.lottoLimit);

            list.innerHTML = html;
            bindPagination(list, (p) => this.loadLotteryRoundList(p));
        } catch (e) {
            list.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    },

    async loadBots() {
        const list = document.getElementById('bot-list');
        if (!list) return;
        list.innerHTML = '<div class="skeleton" style="height:60px;"></div>';
        try {
            const bots = await getAllBotsWithConfig();
            if (!bots || bots.length === 0) {
                list.innerHTML = '<div class="empty-state"><p>暂无机器人</p></div>';
                return;
            }
            list.innerHTML = bots.map(bot => this._botCardHTML(bot)).join('');
            createIcons({ icons });
            this._bindBotCardEvents();
        } catch (e) {
            console.error('loadBots error:', e);
            list.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    },

    _botCardHTML(bot) {
        const cfg = QUALITY_CONFIG;
        // 使用统一的品质列表
        const qLabels = Object.fromEntries(QUALITY_OPTIONS.map(q => [q.value, q.label]));
        const pct = bot.max_orders > 0 ? Math.round(bot.active_order_count / bot.max_orders * 100) : 0;

        const qChecks = QUALITY_OPTIONS.map(q =>
            `<label class="quality-check">
                <input type="checkbox" class="q-check" value="${q.value}" ${(bot.qualities||[]).includes(q.value) ? 'checked' : ''} />
                <span class="quality-badge quality-${q.value}">${q.label}</span>
            </label>`
        ).join('');

        const qRows = QUALITY_OPTIONS.map(q => {
            const priceKey = `price_${q.value}`;
            const qtyKey = `qty_${q.value}`;
            return `<div class="bot-q-row">
                <span class="quality-badge quality-${q.value}">${q.label}</span>
                <div class="bot-q-field">
                    <label>基价</label>
                    <input type="number" class="form-input cfg-${priceKey}" value="${bot[priceKey] || 0}" min="1" />
                </div>
                <div class="bot-q-field">
                    <label>数量</label>
                    <input type="text" class="form-input cfg-${qtyKey}" value="${bot[qtyKey] || '1,1'}" placeholder="min,max" />
                </div>
            </div>`;
        }).join('');

        return `<div class="bot-card" data-bot-id="${bot.bot_id}">
            <div class="bot-card-header">
                <div class="bot-card-title">
                    <span class="bot-card-name">${bot.nickname}</span>
                    <span class="bot-card-id">${bot.bot_id}</span>
                </div>
                <div class="bot-card-status">
                    <span class="bot-orders-count">挂单 <strong>${bot.active_order_count}</strong> / ${bot.max_orders}</span>
                    <div class="bot-progress-bar">
                        <div class="bot-progress-fill" style="width:${pct}%"></div>
                    </div>
                </div>
                <button class="btn btn-sm btn-toggle expand-btn" data-expand="${bot.bot_id}">
                    <i data-lucide="chevron-down"></i>
                </button>
            </div>

            <div class="bot-card-body" id="bot-body-${bot.bot_id}" style="display:none;">
                <!-- 配置区 -->
                <div class="bot-section">
                    <h4>售卖配置</h4>
                    <div class="bot-cfg-main-row">
                        <label class="toggle-label">
                            <input type="checkbox" class="cfg-enabled" ${bot.enabled ? 'checked' : ''} />
                            启用自动补货
                        </label>
                        <div class="bot-cfg-group">
                            <label class="form-label">最低</label>
                            <input type="number" class="form-input cfg-min_orders" value="${bot.min_orders}" min="0" />
                        </div>
                        <div class="bot-cfg-group">
                            <label class="form-label">最高</label>
                            <input type="number" class="form-input cfg-max_orders" value="${bot.max_orders}" min="1" />
                        </div>
                        <div class="bot-cfg-group">
                            <label class="form-label">浮动(±%)</label>
                            <input type="number" class="form-input cfg-price_fluctuation" value="${(bot.price_fluctuation * 100).toFixed(0)}" min="0" max="100" />
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">允许的品质</label>
                        <div class="quality-check-group">${qChecks}</div>
                    </div>
                    <div class="bot-q-grid">${qRows}</div>
                    <button class="btn btn-primary btn-save-cfg" data-bot-id="${bot.bot_id}">
                        <i data-lucide="save"></i> 保存配置
                    </button>
                </div>

                <!-- 当前挂单区 -->
                <div class="bot-section">
                    <h4>当前挂单 <span class="bot-section-count">${bot.active_order_count}</span></h4>
                    <div class="bot-orders-list" id="bot-orders-${bot.bot_id}">
                        <div class="skeleton" style="height:40px;"></div>
                    </div>
                </div>

                <!-- 手动上架区 -->
                <div class="bot-section">
                    <h4>手动上架</h4>
                    <div class="bot-manual-row">
                        <div class="bot-manual-group">
                            <label class="form-label">选择物品</label>
                            <select class="form-input manual-item-select" id="manual-item-${bot.bot_id}">
                                <option value="">-- 加载中 --</option>
                            </select>
                        </div>
                        <div class="bot-manual-group">
                            <label class="form-label">数量</label>
                            <input type="number" class="form-input manual-qty" value="1" min="1" max="99" />
                        </div>
                        <div class="bot-manual-group">
                            <label class="form-label">单价</label>
                            <input type="number" class="form-input manual-price" value="100" min="1" />
                        </div>
                        <button class="btn btn-success btn-list-item" data-bot-id="${bot.bot_id}">
                            <i data-lucide="plus"></i> 上架
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
    },

    _bindBotCardEvents() {
        // 展开/折叠
        document.querySelectorAll('.expand-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const botId = btn.dataset.expand;
                const body = document.getElementById(`bot-body-${botId}`);
                if (!body) return;
                const expanded = body.style.display !== 'none';
                body.style.display = expanded ? 'none' : 'block';
                const icon = btn.querySelector('i');
                if (icon) icon.style.transform = expanded ? '' : 'rotate(180deg)';

                if (!expanded) {
                    // 加载挂单和物品列表
                    this._loadBotOrders(botId);
                    this._loadItemSelect(botId);
                }
            });
        });

        // 保存配置
        document.querySelectorAll('.btn-save-cfg').forEach(btn => {
            btn.addEventListener('click', async () => {
                const botId = btn.dataset.botId;
                const card = document.querySelector(`.bot-card[data-bot-id="${botId}"]`);

                const enabled = card.querySelector('.cfg-enabled').checked;
                const min_orders = parseInt(card.querySelector('.cfg-min_orders').value) || 2;
                const max_orders = parseInt(card.querySelector('.cfg-max_orders').value) || 6;
                const qualities = Array.from(card.querySelectorAll('.q-check:checked')).map(c => c.value);
                const price_fluctuation = parseFloat(card.querySelector('.cfg-price_fluctuation').value) / 100 || 0.2;

                const cfg = {
                    bot_id: botId,
                    enabled,
                    min_orders,
                    max_orders,
                    qualities,
                    price_fluctuation,
                    price_white: parseInt(card.querySelector('.cfg-price_white').value) || 80,
                    price_green: parseInt(card.querySelector('.cfg-price_green').value) || 800,
                    price_blue: parseInt(card.querySelector('.cfg-price_blue').value) || 7000,
                    price_purple: parseInt(card.querySelector('.cfg-price_purple').value) || 65000,
                    price_orange: parseInt(card.querySelector('.cfg-price_orange').value) || 300000,
                    price_red: parseInt(card.querySelector('.cfg-price_red').value) || 1000000,
                    qty_white: card.querySelector('.cfg-qty_white').value || '1,3',
                    qty_green: card.querySelector('.cfg-qty_green').value || '1,3',
                    qty_blue: card.querySelector('.cfg-qty_blue').value || '1,3',
                    qty_purple: card.querySelector('.cfg-qty_purple').value || '1,1',
                    qty_orange: card.querySelector('.cfg-qty_orange').value || '1,1',
                    qty_red: card.querySelector('.cfg-qty_red').value || '1,1',
                };

                btn.disabled = true;
                btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> 保存中...';
                createIcons({ icons });
                try {
                    const res = await updateBotConfig(cfg);
                    showToast(res?.success ? '配置已保存' : (res?.message || '保存失败'), res?.success ? 'success' : 'error');
                } catch (e) {
                    showToast('保存失败', 'error');
                }
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="save"></i> 保存配置';
                createIcons({ icons });
            });
        });

        // 手动上架
        document.querySelectorAll('.btn-list-item').forEach(btn => {
            btn.addEventListener('click', async () => {
                const botId = btn.dataset.botId;
                const card = document.querySelector(`.bot-card[data-bot-id="${botId}"]`);
                const itemId = parseInt(card.querySelector(`#manual-item-${botId}`).value);
                const qty = parseInt(card.querySelector('.manual-qty').value) || 1;
                const price = parseInt(card.querySelector('.manual-price').value) || 1;

                if (!itemId) { showToast('请选择收藏品', 'error'); return; }
                btn.disabled = true;
                btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> 上架中...';
                createIcons({ icons });
                try {
                    const res = await adminBotListItem(itemId, botId, qty, price);
                    if (res?.success) {
                        showToast(res.message, 'success');
                        this._loadBotOrders(botId);
                    } else {
                        showToast(res?.message || '上架失败', 'error');
                    }
                } catch (e) {
                    showToast('上架失败', 'error');
                }
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="plus"></i> 上架';
                createIcons({ icons });
            });
        });
    },

    async _loadBotOrders(botId) {
        const container = document.getElementById(`bot-orders-${botId}`);
        if (!container) return;
        try {
            const orders = await getBotOrders(botId);
            if (!orders || orders.length === 0) {
                container.innerHTML = '<div class="empty-state"><p>暂无挂单</p></div>';
                return;
            }
            container.innerHTML = orders.map(o => {
                const qc = QUALITY_CONFIG[o.item_quality] || QUALITY_CONFIG.white;
                return `<div class="bot-order-row">
                    <span class="quality-dot quality-${o.item_quality || 'white'}"></span>
                    <span class="order-name">${o.item_name}</span>
                    <span class="quality-badge quality-${o.item_quality}">${qc.label}</span>
                    <span class="order-qty">×${o.quantity}</span>
                    <span class="order-price">${o.price_per_unit.toLocaleString()}币</span>
                    <button class="btn btn-danger btn-sm btn-cancel-order" data-order="${o.order_id}" data-bot="${botId}">
                        <i data-lucide="x"></i>
                    </button>
                </div>`;
            }).join('');
            createIcons({ icons });

            // 绑定取消按钮
            container.querySelectorAll('.btn-cancel-order').forEach(btn => {
                btn.addEventListener('click', async () => {
                    btn.disabled = true;
                    try {
                        const res = await adminBotCancelOrder(parseInt(btn.dataset.order));
                        if (res?.success) {
                            showToast('已下架', 'success');
                            this._loadBotOrders(btn.dataset.bot);
                        } else {
                            showToast(res?.message || '下架失败', 'error');
                        }
                    } catch (e) {
                        showToast('下架失败', 'error');
                    }
                    btn.disabled = false;
                });
            });

            // 更新计数
            const header = document.querySelector(`.bot-card[data-bot-id="${botId}"] .bot-orders-count`);
            if (header) header.innerHTML = `挂单 <strong>${orders.length}</strong> / ${document.querySelector(`.bot-card[data-bot-id="${botId}"] .cfg-max_orders`)?.value || '?'}`;
        } catch (e) {
            container.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    },

    async _loadItemSelect(botId) {
        const sel = document.getElementById(`manual-item-${botId}`);
        if (!sel) return;
        try {
            const items = await adminGetItems(1, 1000);
            if (!items || items.length === 0) {
                sel.innerHTML = '<option value="">无可用物品</option>';
                return;
            }
            // 先填充占位 option
            sel.innerHTML = '<option value="">-- 选择物品 --</option>';
            // 升级为可搜索下拉
            upgradeSelectsToSearchable(`#manual-item-${botId}`, items, { placeholder: '选择物品' });
        } catch (e) {
            console.error('_loadItemSelect error:', e);
            sel.innerHTML = '<option value="">加载失败</option>';
        }
    },

    async botReplenish() {
        const btn = document.getElementById('btn-bot-replenish');
        if (!btn) return;
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> 补货中...';
        createIcons({ icons });
        try {
            const result = await adminBotReplenish();
            if (result?.success) {
                showToast(result.message || '补货完成', 'success');
                this.loadBots();
            } else {
                showToast(result?.message || '补货失败', 'error');
            }
        } catch (e) {
            showToast('补货失败', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="refresh-cw"></i> 立刻补货';
            createIcons({ icons });
        }
    },

    // 用户详情操作事件绑定
    async bindUserDetailActions(userId) {
        // 修改昵称
        const btnChangeNickname = document.getElementById('btn-change-nickname');
        if (btnChangeNickname) {
            btnChangeNickname.addEventListener('click', async () => {
                const newNickname = document.getElementById('new-nickname')?.value?.trim();
                if (!newNickname || newNickname.length < 2) {
                    showToast('昵称至少需要2个字符', 'error');
                    return;
                }
                if (newNickname.length > 10) {
                    showToast('昵称不能超过10个字符', 'error');
                    return;
                }
                btnChangeNickname.disabled = true;
                try {
                    const result = await adminChangeUserNickname(userId, newNickname);
                    if (result?.success) {
                        showToast(result.message, 'success');
                        this.showUserDetail(userId, 1);
                        this.loadUsers();
                    } else {
                        showToast(result?.message || '修改失败', 'error');
                    }
                } catch (e) {
                    showToast('修改失败', 'error');
                }
                btnChangeNickname.disabled = false;
            });
        }

        // 增加果壳币
        const btnShellsAdd = document.getElementById('btn-shells-add');
        if (btnShellsAdd) {
            btnShellsAdd.addEventListener('click', async () => {
                const amount = parseInt(document.getElementById('shells-adjust-amount')?.value);
                const reason = document.getElementById('shells-reason')?.value || '管理员操作';
                if (!amount || amount <= 0) {
                    showToast('请输入有效的数量', 'error');
                    return;
                }
                btnShellsAdd.disabled = true;
                try {
                    const result = await adminAdjustUserShells(userId, amount, reason);
                    if (result?.success) {
                        showToast(result.message, 'success');
                        this.showUserDetail(userId, 1);
                    } else {
                        showToast(result?.message || '操作失败', 'error');
                    }
                } catch (e) {
                    showToast('操作失败', 'error');
                }
                btnShellsAdd.disabled = false;
            });
        }

        // 减少果壳币
        const btnShellsReduce = document.getElementById('btn-shells-reduce');
        if (btnShellsReduce) {
            btnShellsReduce.addEventListener('click', async () => {
                const amount = parseInt(document.getElementById('shells-adjust-amount')?.value);
                const reason = document.getElementById('shells-reason')?.value || '管理员操作';
                if (!amount || amount <= 0) {
                    showToast('请输入有效的数量', 'error');
                    return;
                }
                btnShellsReduce.disabled = true;
                try {
                    const result = await adminAdjustUserShells(userId, -amount, reason);
                    if (result?.success) {
                        showToast(result.message, 'success');
                        this.showUserDetail(userId, 1);
                    } else {
                        showToast(result?.message || '操作失败', 'error');
                    }
                } catch (e) {
                    showToast('操作失败', 'error');
                }
                btnShellsReduce.disabled = false;
            });
        }

        // 清空所有物品
        const btnClearItems = document.getElementById('btn-clear-items');
        if (btnClearItems) {
            btnClearItems.addEventListener('click', async () => {
                const user = this.users.find(u => u.user_id === userId);
                const userName = user?.nickname || '无名';
                const ok = await showConfirmTyped(
                    `⚠️ 危险操作：清空「${userName}」的所有物品\n\n` +
                    `此操作将删除该用户背包中的所有物品，不可撤销！`,
                    userName,
                    { okText: '清空所有物品', okClass: 'btn-danger', placeholder: '请输入用户昵称以确认' }
                );
                if (!ok) return;
                btnClearItems.disabled = true;
                try {
                    const result = await adminClearUserItems(userId);
                    if (result?.success) {
                        showToast(result.message, 'success');
                        this.showUserDetail(userId, 1);
                        this.loadStats();
                    } else {
                        showToast(result?.message || '操作失败', 'error');
                    }
                } catch (e) {
                    showToast('操作失败', 'error');
                }
                btnClearItems.disabled = false;
            });
        }

        // 设置/撤销管理员
        const btnToggleAdmin = document.getElementById('btn-toggle-admin');
        if (btnToggleAdmin) {
            btnToggleAdmin.addEventListener('click', async () => {
                const user = this.users.find(u => u.user_id === userId);
                const currentAdmin = user?.is_admin;
                const action = currentAdmin ? '撤销' : '设为';
                const ok = await showConfirm(
                    `确定要${action}该用户的管理员权限吗？`,
                    { okText: action + '管理员', okClass: currentAdmin ? 'btn-warning' : 'btn-success' }
                );
                if (!ok) return;
                btnToggleAdmin.disabled = true;
                try {
                    const result = await adminSetUserAdmin(userId, !currentAdmin);
                    if (result?.success) {
                        showToast(result.message, 'success');
                        this.showUserDetail(userId, 1);
                        this.loadUsers();
                        this.loadStats();
                    } else {
                        showToast(result?.message || '操作失败', 'error');
                    }
                } catch (e) {
                    showToast('操作失败', 'error');
                }
                btnToggleAdmin.disabled = false;
            });
        }

        // 封禁/解封用户
        const btnToggleBan = document.getElementById('btn-toggle-ban');
        if (btnToggleBan) {
            btnToggleBan.addEventListener('click', async () => {
                const user = this.users.find(u => u.user_id === userId);
                const detailUser = user || {};
                const isBanned = detailUser.is_banned;
                const userName = detailUser.nickname || '无名';

                if (isBanned) {
                    const ok = await showConfirm(
                        `确定要解封用户「${userName}」吗？\n\n解封后该用户将可以正常登录系统。`,
                        { okText: '确认解封', okClass: 'btn-success', title: '解封用户' }
                    );
                    if (!ok) return;
                    btnToggleBan.disabled = true;
                    try {
                        const result = await adminUnbanUser(userId);
                        if (result?.success) {
                            showToast(result.message, 'success');
                            this.showUserDetail(userId, 1);
                            this.loadUsers();
                        } else {
                            showToast(result?.message || '解封失败', 'error');
                        }
                    } catch (e) {
                        showToast('解封失败：' + e.message, 'error');
                    }
                    btnToggleBan.disabled = false;
                } else {
                    const detailModal = document.getElementById('user-detail-modal');
                    if (detailModal) detailModal.style.display = 'none';
                    this.showBanUserModal(userId, userName, () => {
                        this.showUserDetail(userId, 1);
                        this.loadUsers();
                    });
                    const banModal = document.getElementById('ban-user-modal');
                    if (banModal) {
                        const handleClose = () => {
                            const dm = document.getElementById('user-detail-modal');
                            if (dm) dm.style.display = 'flex';
                        };
                        banModal.querySelector('.modal-overlay').addEventListener('click', handleClose);
                        banModal.querySelector('.modal-close-btn').addEventListener('click', handleClose);
                    }
                }
            });
        }

        // 永久删除用户
        const btnDeleteUserDetail = document.getElementById('btn-delete-user-detail');
        if (btnDeleteUserDetail) {
            btnDeleteUserDetail.addEventListener('click', async () => {
                const user = this.users.find(u => u.user_id === userId);
                const userName = user?.nickname || '无名';
                btnDeleteUserDetail.disabled = true;
                let isVerified = true;
                try {
                    isVerified = await getUserEmailVerified(userId);
                } catch (e) {
                    isVerified = true;
                } finally {
                    btnDeleteUserDetail.disabled = false;
                }
                const modal = document.getElementById('user-detail-modal');
                await this.confirmDeleteUser(userId, userName, user?.is_admin, isVerified);
                if (modal) modal.remove();
            });
        }

        // 移除单个物品
        document.querySelectorAll('.btn-remove-item').forEach(btn => {
            btn.addEventListener('click', async () => {
                const itemId = parseInt(btn.dataset.itemId);
                const itemName = btn.dataset.itemName;
                const qty = parseInt(btn.dataset.qty);
                const ok = await showConfirm(
                    `确定要移除该用户的「${itemName}」吗？`,
                    { okText: '移除', okClass: 'btn-danger' }
                );
                if (!ok) return;
                btn.disabled = true;
                try {
                    const result = await adminRemoveUserItem(userId, itemId, qty);
                    if (result?.success) {
                        showToast(result.message, 'success');
                        this.showUserDetail(userId, 1);
                    } else {
                        showToast(result?.message || '移除失败', 'error');
                    }
                } catch (e) {
                    showToast('移除失败', 'error');
                }
                btn.disabled = false;
            });
        });
    },

    // ============================================
    // 探索点管理
    // ============================================

    async loadExplorePoints(page = 1) {
        this.explorePage = page;
        const list = document.getElementById('explore-point-list-admin');
        if (!list) return;

        try {
            const data = await adminGetExplorationPoints(page, this.exploreLimit);
            this.explorePoints = data || [];
            if (data && data.length > 0) {
                this.exploreTotal = parseInt(data[0].total_count) || 0;
            } else {
                this.exploreTotal = 0;
            }
            this.renderExplorePoints();
        } catch (e) {
            console.error('loadExplorePoints error:', e);
            list.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    },

    renderExplorePoints() {
        const list = document.getElementById('explore-point-list-admin');
        if (!list) return;

        if (this.explorePoints.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>暂无探索点</p></div>';
            return;
        }

        let html = this.explorePoints.map(point => {
            let rewardInfo = '';
            if (point.reward_pool_id) {
                rewardInfo = `<span class="pool-badge">奖池 #${point.reward_pool_id}</span>`;
            } else if (point.reward_shells || point.reward_item_name) {
                const shells = point.reward_shells ? `${point.reward_shells} 果壳币` : '';
                const item = point.reward_item_name ? `${this.escHtml(point.reward_item_name)}` : '';
                rewardInfo = `${shells}${item ? ' + ' + item : ''}`;
            } else {
                rewardInfo = '无奖励';
            }

            return `
                <div class="explore-point-card-admin" data-point-id="${point.id}">
                    <div class="point-icon-admin">
                        <i data-lucide="map-pin"></i>
                    </div>
                    <div class="point-info-admin">
                        <span class="point-name-admin">${this.escHtml(point.name)}</span>
                        <span class="point-coords-admin">
                            ${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}
                            | 半径: ${point.radius_meters}m
                            | 每日限制: ${point.daily_limit}次
                        </span>
                    </div>
                    <div class="point-reward-admin">
                        <i data-lucide="gift"></i>
                        <span>${rewardInfo}</span>
                    </div>
                    <div class="point-actions-admin">
                        <button class="btn btn-secondary btn-sm btn-edit-explore-point" data-point-id="${point.id}">
                            <i data-lucide="edit-3"></i> 编辑
                        </button>
                        <button class="btn btn-danger btn-sm btn-delete-explore-point" data-point-id="${point.id}" data-point-name="${this.escHtml(point.name)}">
                            <i data-lucide="trash-2"></i> 删除
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        html += renderPagination(this.explorePage, this.exploreTotal, this.exploreLimit);

        list.innerHTML = html;
        createIcons({ icons });
        bindPagination(list, (p) => this.loadExplorePoints(p));

        // 绑定编辑和删除按钮
        list.querySelectorAll('.btn-edit-explore-point').forEach(btn => {
            btn.addEventListener('click', () => {
                const pointId = parseInt(btn.dataset.pointId);
                this.showEditExplorePointModal(pointId);
            });
        });

        list.querySelectorAll('.btn-delete-explore-point').forEach(btn => {
            btn.addEventListener('click', async () => {
                const pointId = parseInt(btn.dataset.pointId);
                const pointName = btn.dataset.pointName;
                await this.deleteExplorePoint(pointId, pointName);
            });
        });
    },

    async showAddExplorePointModal(prefillLat, prefillLng) {
        const existing = document.getElementById('add-explore-point-modal');
        if (existing) existing.remove();

        const latVal = prefillLat ? prefillLat.toFixed(6) : '';
        const lngVal = prefillLng ? prefillLng.toFixed(6) : '';

        const modalHtml = `
            <div id="add-explore-point-modal" class="modal" style="display:flex;">
                <div class="modal-overlay"></div>
                <div class="modal-content" style="max-width:560px;max-height:90vh;overflow-y:auto;">
                    <div class="modal-header">
                        <h3><i data-lucide="map-pin"></i> 添加探索点</h3>
                        <button class="modal-close-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label">名称 <span class="required">*</span></label>
                            <input type="text" class="form-input" id="add-point-name" placeholder="探索点名称" maxlength="50" />
                        </div>
                        <div class="form-group">
                            <label class="form-label">描述</label>
                            <input type="text" class="form-input" id="add-point-desc" placeholder="探索点描述（可选）" />
                        </div>
                        <div class="explore-point-form-row">
                            <div class="form-group coords">
                                <label class="form-label">纬度 <span class="required">*</span></label>
                                <input type="number" class="form-input" id="add-point-lat" placeholder="如 39.9042" step="0.000001" value="${latVal}" />
                            </div>
                            <div class="form-group coords">
                                <label class="form-label">经度 <span class="required">*</span></label>
                                <input type="number" class="form-input" id="add-point-lng" placeholder="如 116.4074" step="0.000001" value="${lngVal}" />
                            </div>
                        </div>
                        <div class="explore-point-form-row">
                            <div class="form-group">
                                <label class="form-label">触发半径（米）</label>
                                <input type="number" class="form-input" id="add-point-radius" value="50" min="10" max="500" />
                            </div>
                            <div class="form-group">
                                <label class="form-label">每日探索限制</label>
                                <input type="number" class="form-input" id="add-point-daily-limit" value="3" min="1" max="10" />
                            </div>
                        </div>

                        <div class="form-group">
                            <label class="form-label">奖励奖池（可选）</label>
                            <select class="form-input" id="add-point-pool" data-pool-select>
                                <option value="">无奖池奖励</option>
                            </select>
                            <div class="form-hint">关联奖池后，探索时将从奖池抽取奖励</div>
                            <button class="btn btn-secondary btn-sm" id="btn-quick-create-pool" style="margin-top:8px;">
                                <i data-lucide="plus"></i> 快速创建专属奖池
                            </button>
                        </div>

                        <div class="form-group" id="add-point-pool-preview" style="display:none;">
                            <label class="form-label">奖池奖励预览</label>
                            <div class="pool-preview-list" id="add-pool-preview-list"></div>
                        </div>

                        <button class="btn btn-primary" id="btn-confirm-add-point" style="width:100%;margin-top:16px;">
                            <i data-lucide="plus"></i>
                            <span>添加探索点</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('add-explore-point-modal');
        const closeModal = () => modal.remove();
        modal.querySelector('.modal-overlay').addEventListener('click', closeModal);
        modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
        createIcons({ icons });

        // 加载奖池选择
        this._loadPoolSelect('#add-point-pool', null, ['general', 'explore']);

        const poolSelect = modal.querySelector('#add-point-pool');
        const poolPreview = modal.querySelector('#add-point-pool-preview');
        const previewList = modal.querySelector('#add-pool-preview-list');

        poolSelect.addEventListener('change', async () => {
            const poolId = parseInt(poolSelect.value);
            if (poolId) {
                const detail = await adminGetRewardPoolDetail(poolId);
                if (detail?.items && detail.items.length > 0) {
                    poolPreview.style.display = 'block';
                    const totalWeight = detail.items.reduce((sum, item) => sum + (item.weight || 0), 0);
                    previewList.innerHTML = detail.items.map(item => {
                        const pct = totalWeight > 0 ? ((item.weight / totalWeight) * 100).toFixed(1) : '0';
                        let desc = '';
                        if (item.reward_type === 'item') {
                            desc = `${item.item_name || '物品'} x${item.item_quantity}`;
                        } else if (item.reward_type === 'shells') {
                            desc = `${item.shells_amount} 果壳币`;
                        } else if (item.reward_type === 'exp') {
                            desc = `${item.exp_amount} 经验`;
                        } else {
                            desc = '空奖励';
                        }
                        return `<div class="preview-item"><span>${desc}</span><span class="preview-weight">${item.weight} (${pct}%)</span></div>`;
                    }).join('');
                } else {
                    poolPreview.style.display = 'block';
                    previewList.innerHTML = '<div class="empty-state"><p>该奖池暂无奖励</p></div>';
                }
            } else {
                poolPreview.style.display = 'none';
            }
        });

        modal.querySelector('#btn-quick-create-pool').addEventListener('click', async () => {
            const name = modal.querySelector('#add-point-name').value.trim() || '新奖池';
            try {
                const result = await adminCreateRewardPool(name + '专属奖池', '探索点奖励奖池', 'explore');
                if (result?.success) {
                    showToast('奖池创建成功', 'success');
                    await this._loadPoolSelect('#add-point-pool', result.id, ['general', 'explore']);
                }
            } catch (e) {
                showToast('创建奖池失败', 'error');
            }
        });

        // 确认添加
        modal.querySelector('#btn-confirm-add-point').addEventListener('click', async () => {
            const name = modal.querySelector('#add-point-name').value.trim();
            const description = modal.querySelector('#add-point-desc').value.trim();
            const latitude = parseFloat(modal.querySelector('#add-point-lat').value);
            const longitude = parseFloat(modal.querySelector('#add-point-lng').value);
            const radiusMeters = parseInt(modal.querySelector('#add-point-radius').value) || 50;
            const dailyLimit = parseInt(modal.querySelector('#add-point-daily-limit').value) || 3;
            const rewardPoolId = parseInt(modal.querySelector('#add-point-pool').value) || null;

            if (!name) {
                showToast('请输入探索点名称', 'error');
                return;
            }
            if (!latitude || !longitude || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
                showToast('请输入有效的经纬度', 'error');
                return;
            }

            const btn = modal.querySelector('#btn-confirm-add-point');
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> 添加中...';
            createIcons({ icons });

            try {
                const result = await adminAddExplorationPoint(
                    name, latitude, longitude, description,
                    radiusMeters, 0, null, 0, dailyLimit, rewardPoolId
                );
                if (result?.success) {
                    showToast(result.message || '添加成功', 'success');
                    closeModal();
                    await this.loadExplorePoints(1);
                    this.updateAdminMapMarkers();
                } else {
                    showToast(result?.message || '添加失败', 'error');
                }
            } catch (e) {
                showToast('添加失败：' + e.message, 'error');
            }

            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="plus"></i><span>添加探索点</span>';
            createIcons({ icons });
        });
    },

    async _loadPoolSelect(selector, selectId = null, poolType = null) {
        const sel = document.querySelector(selector);
        if (!sel) return;

        try {
            const pools = await adminGetRewardPools(1, 100, poolType);
            sel.innerHTML = '<option value="">无奖池奖励</option>';
            if (pools && pools.length > 0) {
                pools.forEach(pool => {
                    const opt = document.createElement('option');
                    opt.value = pool.id;
                    opt.textContent = `${pool.name} (${pool.item_count}个奖励)`;
                    sel.appendChild(opt);
                });
            }
            if (selectId) {
                sel.value = selectId;
            }
        } catch (e) {
            console.error('加载奖池失败:', e);
        }
    },

    async showEditExplorePointModal(pointId) {
        const point = this.explorePoints.find(p => p.id === pointId);
        if (!point) return;

        const existing = document.getElementById('edit-explore-point-modal');
        if (existing) existing.remove();

        const modalHtml = `
            <div id="edit-explore-point-modal" class="modal" style="display:flex;">
                <div class="modal-overlay"></div>
                <div class="modal-content" style="max-width:560px;max-height:90vh;overflow-y:auto;">
                    <div class="modal-header">
                        <h3><i data-lucide="edit-3"></i> 编辑探索点 #${pointId}</h3>
                        <button class="modal-close-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label">名称 <span class="required">*</span></label>
                            <input type="text" class="form-input" id="edit-point-name" value="${this.escHtml(point.name)}" maxlength="50" />
                        </div>
                        <div class="form-group">
                            <label class="form-label">描述</label>
                            <input type="text" class="form-input" id="edit-point-desc" value="${this.escHtml(point.description || '')}" />
                        </div>
                        <div class="explore-point-form-row">
                            <div class="form-group coords">
                                <label class="form-label">纬度 <span class="required">*</span></label>
                                <input type="number" class="form-input" id="edit-point-lat" value="${point.latitude}" step="0.000001" />
                            </div>
                            <div class="form-group coords">
                                <label class="form-label">经度 <span class="required">*</span></label>
                                <input type="number" class="form-input" id="edit-point-lng" value="${point.longitude}" step="0.000001" />
                            </div>
                        </div>
                        <div class="explore-point-form-row">
                            <div class="form-group">
                                <label class="form-label">触发半径（米）</label>
                                <input type="number" class="form-input" id="edit-point-radius" value="${point.radius_meters}" min="10" max="500" />
                            </div>
                            <div class="form-group">
                                <label class="form-label">每日探索限制</label>
                                <input type="number" class="form-input" id="edit-point-daily-limit" value="${point.daily_limit}" min="1" max="10" />
                            </div>
                        </div>

                        <div class="form-group">
                            <label class="form-label">奖励奖池</label>
                            <select class="form-input" id="edit-point-pool" data-pool-select>
                                <option value="">无奖池奖励</option>
                            </select>
                            <div class="form-hint">关联奖池后，探索时将从奖池抽取奖励</div>
                            <button class="btn btn-secondary btn-sm" id="btn-edit-create-pool" style="margin-top:8px;">
                                <i data-lucide="plus"></i> 创建专属奖池
                            </button>
                        </div>

                        <div class="form-group" id="edit-point-pool-preview" style="display:none;">
                            <label class="form-label">奖池奖励预览</label>
                            <div class="pool-preview-list" id="edit-pool-preview-list"></div>
                        </div>

                        <button class="btn btn-primary" id="btn-save-point" style="width:100%;margin-top:16px;">保存</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('edit-explore-point-modal');
        const closeModal = () => modal.remove();
        modal.querySelector('.modal-overlay').addEventListener('click', closeModal);
        modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
        createIcons({ icons });

        // 加载奖池选择并设置当前值
        await this._loadPoolSelect('#edit-point-pool', point.reward_pool_id, ['general', 'explore']);

        const poolSelect = modal.querySelector('#edit-point-pool');
        const poolPreview = modal.querySelector('#edit-point-pool-preview');
        const previewList = modal.querySelector('#edit-pool-preview-list');

        const loadPoolPreview = async () => {
            const poolId = parseInt(poolSelect.value);
            if (poolId) {
                const detail = await adminGetRewardPoolDetail(poolId);
                if (detail?.items && detail.items.length > 0) {
                    poolPreview.style.display = 'block';
                    const totalWeight = detail.items.reduce((sum, item) => sum + (item.weight || 0), 0);
                    previewList.innerHTML = detail.items.map(item => {
                        const pct = totalWeight > 0 ? ((item.weight / totalWeight) * 100).toFixed(1) : '0';
                        let desc = '';
                        if (item.reward_type === 'item') {
                            desc = `${item.item_name || '物品'} x${item.item_quantity}`;
                        } else if (item.reward_type === 'shells') {
                            desc = `${item.shells_amount} 果壳币`;
                        } else if (item.reward_type === 'exp') {
                            desc = `${item.exp_amount} 经验`;
                        } else {
                            desc = '空奖励';
                        }
                        return `<div class="preview-item"><span>${desc}</span><span class="preview-weight">${item.weight} (${pct}%)</span></div>`;
                    }).join('');
                } else {
                    poolPreview.style.display = 'block';
                    previewList.innerHTML = '<div class="empty-state"><p>该奖池暂无奖励</p></div>';
                }
            } else {
                poolPreview.style.display = 'none';
            }
        };

        poolSelect.addEventListener('change', loadPoolPreview);
        if (point.reward_pool_id) {
            await loadPoolPreview();
        }

        modal.querySelector('#btn-edit-create-pool').addEventListener('click', async () => {
            const name = modal.querySelector('#edit-point-name').value.trim() || '新奖池';
            try {
                const result = await adminCreateRewardPool(name + '专属奖池', '探索点奖励奖池', 'explore');
                if (result?.success) {
                    showToast('奖池创建成功', 'success');
                    await this._loadPoolSelect('#edit-point-pool', result.id, ['general', 'explore']);
                    await loadPoolPreview();
                }
            } catch (e) {
                showToast('创建奖池失败', 'error');
            }
        });

        // 保存
        modal.querySelector('#btn-save-point').addEventListener('click', async () => {
            const name = modal.querySelector('#edit-point-name').value.trim();
            const description = modal.querySelector('#edit-point-desc').value.trim();
            const latitude = parseFloat(modal.querySelector('#edit-point-lat').value);
            const longitude = parseFloat(modal.querySelector('#edit-point-lng').value);
            const radiusMeters = parseInt(modal.querySelector('#edit-point-radius').value) || 50;
            const dailyLimit = parseInt(modal.querySelector('#edit-point-daily-limit').value) || 3;
            const rewardPoolId = parseInt(poolSelect.value) || null;

            if (!name) {
                showToast('请输入探索点名称', 'error');
                return;
            }
            if (!latitude || !longitude) {
                showToast('请输入有效的经纬度', 'error');
                return;
            }

            const btn = modal.querySelector('#btn-save-point');
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> 保存中...';
            createIcons({ icons });

            try {
                const result = await adminUpdateExplorationPoint(
                    pointId, name, description, latitude, longitude,
                    radiusMeters, 0, null, 0, dailyLimit, rewardPoolId
                );
                if (result?.success) {
                    showToast(result.message || '保存成功', 'success');
                    closeModal();
                    this.loadExplorePoints(this.explorePage);
                } else {
                    showToast(result?.message || '保存失败', 'error');
                }
            } catch (e) {
                showToast('保存失败：' + e.message, 'error');
            }

            btn.disabled = false;
            btn.innerHTML = '保存';
        });
    },

    async _loadExplorePointItemSelect(selector) {
        const sel = document.querySelector(selector);
        if (!sel) return;
        try {
            const items = await adminGetItems(1, 1000);
            if (!items || items.length === 0) {
                sel.innerHTML = '<option value="">无可用物品</option>';
                return;
            }
            sel.innerHTML = '<option value="">无物品奖励</option>';
            upgradeSelectsToSearchable(selector, items, { placeholder: '选择奖励物品' });
        } catch (e) {
            sel.innerHTML = '<option value="">加载失败</option>';
        }
    },

    async deleteExplorePoint(pointId, pointName) {
        const ok = await showConfirm(
            `确定要删除探索点「${pointName}」吗？\n\n此操作不可撤销！`,
            { okText: '删除', okClass: 'btn-danger', danger: true }
        );
        if (!ok) return;

        try {
            const result = await adminDeleteExplorationPoint(pointId);
            if (result?.success) {
                showToast(result.message || '删除成功', 'success');
                await this.loadExplorePoints(this.explorePage);
                this.updateAdminMapMarkers();
            } else {
                showToast(result?.message || '删除失败', 'error');
            }
        } catch (e) {
            showToast('删除失败：' + e.message, 'error');
        }
    },

    async showExploreHistoryModal() {
        const existing = document.getElementById('explore-history-modal');
        if (existing) existing.remove();

        const modalHtml = `
            <div id="explore-history-modal" class="modal" style="display:flex;">
                <div class="modal-overlay"></div>
                <div class="modal-content explore-history-modal-content">
                    <div class="modal-header">
                        <h3><i data-lucide="history"></i> 探索历史记录</h3>
                        <button class="modal-close-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="explore-history-list" id="explore-history-list-content">
                            <div class="skeleton" style="height:40px;"></div>
                            <div class="skeleton" style="height:40px;"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('explore-history-modal');
        const closeModal = () => modal.remove();
        modal.querySelector('.modal-overlay').addEventListener('click', closeModal);
        modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
        createIcons({ icons });

        const listEl = modal.querySelector('#explore-history-list-content');

        try {
            const history = await adminGetExplorationHistory(1, 50);
            if (!history || history.length === 0) {
                listEl.innerHTML = '<div class="empty-state"><p>暂无探索记录</p></div>';
                return;
            }

            listEl.innerHTML = history.map(h => {
                const time = new Date(h.explored_at).toLocaleString();
                const reward = h.reward_shells
                    ? `${h.reward_shells} 果壳币`
                    : '';
                const itemReward = h.reward_item_name
                    ? ` + ${this.escHtml(h.reward_item_name)}`
                    : '';

                return `
                    <div class="explore-history-item">
                        <span class="history-user">${this.escHtml(h.user_nickname || '匿名')}</span>
                        <span class="history-point">探索「${this.escHtml(h.point_name)}」</span>
                        <span class="history-reward">${reward}${itemReward}</span>
                        <span class="history-time">${time}</span>
                    </div>
                `;
            }).join('');
        } catch (e) {
            listEl.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    },

    // ============================================
    // 探索管理地图
    // ============================================

    initAdminMap() {
        if (this.adminMap) {
            this.adminMap.invalidateSize();
            this.updateAdminMapMarkers();
            return;
        }

        const mapEl = document.getElementById('explore-admin-map');
        if (!mapEl) return;

        if (!window.L) {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.onload = () => {
                this._initAdminMapAfterLoad();
            };
            script.onerror = () => {
                document.getElementById('admin-map-loading').style.display = 'none';
                document.getElementById('admin-map-error').style.display = 'flex';
            };
            document.head.appendChild(script);
            
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        } else {
            this._initAdminMapAfterLoad();
        }
    },

    _initAdminMapAfterLoad() {
        const loadingEl = document.getElementById('admin-map-loading');
        if (loadingEl) loadingEl.style.display = 'none';

        this.adminMap = L.map('explore-admin-map', {
            zoomControl: true,
            attributionControl: false
        }).setView([39.9042, 116.4074], 14);

        L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
            subdomains: '1234',
            attribution: '© 高德地图'
        }).addTo(this.adminMap);

        this.adminMap.on('click', (e) => {
            if (this._isLocating) return;
            const wgs = gcj02ToWgs84(e.latlng.lat, e.latlng.lng);
            this.showAddExplorePointModal(wgs.lat, wgs.lng);
        });

        this.updateAdminMapMarkers();
    },

    _removeUserMarker() {
        if (this._adminUserMarker) {
            this.adminMap.removeLayer(this._adminUserMarker);
            this._adminUserMarker = null;
        }
    },

    updateAdminMapMarkers() {
        if (!this.adminMap) return;

        this.adminMapMarkers.forEach(m => this.adminMap.removeLayer(m));
        this.adminMapMarkers = [];
        this.adminMapCircles.forEach(c => this.adminMap.removeLayer(c));
        this.adminMapCircles = [];

        const points = this.explorePoints || [];

        if (points.length === 0) return;

        const bounds = [];

        points.forEach(point => {
            const gcj = wgs84ToGcj02(point.latitude, point.longitude);
            const icon = L.divIcon({
                className: 'admin-point-marker',
                html: `<div class="admin-point-marker-inner">
                    <i data-lucide="map-pin"></i>
                </div>`,
                iconSize: [36, 36],
                iconAnchor: [18, 36]
            });

            const marker = L.marker([gcj.lat, gcj.lng], {
                icon,
                draggable: true
            }).addTo(this.adminMap);

            marker.bindPopup(`
                <div class="admin-map-popup">
                    <b>${this.escHtml(point.name)}</b>
                    <br><small>${this.escHtml(point.description || '')}</small>
                    <br><small>半径: ${point.radius_meters}m</small>
                    <br>
                    <button class="btn btn-primary btn-xs btn-edit-map-point" data-point-id="${point.id}" style="margin-top:6px;padding:4px 8px;font-size:0.7rem;">
                        编辑
                    </button>
                </div>
            `);

            marker.on('dragend', async (e) => {
                const newGcjLat = e.target.getLatLng().lat;
                const newGcjLng = e.target.getLatLng().lng;
                const newWgs = gcj02ToWgs84(newGcjLat, newGcjLng);

                try {
                    const result = await adminUpdateExplorationPoint(
                        point.id, null, null, newWgs.lat, newWgs.lng, null, null, null, null, null
                    );
                    if (result?.success) {
                        showToast('位置已更新', 'success');
                        point.latitude = newWgs.lat;
                        point.longitude = newWgs.lng;
                        this.renderExplorePoints();
                        this.updateAdminMapCircles();
                    }
                } catch (err) {
                    showToast('更新失败', 'error');
                    const gcj = wgs84ToGcj02(point.latitude, point.longitude);
                    marker.setLatLng([gcj.lat, gcj.lng]);
                }
            });

            marker.on('popupopen', () => {
                createIcons({ icons });
                const editBtn = document.querySelector('.btn-edit-map-point');
                if (editBtn) {
                    editBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const pointId = parseInt(editBtn.dataset.pointId);
                        this.showEditExplorePointModal(pointId);
                        marker.closePopup();
                    });
                }
            });

            this.adminMapMarkers.push(marker);
            bounds.push([gcj.lat, gcj.lng]);

            const circle = L.circle([gcj.lat, gcj.lng], {
                radius: point.radius_meters,
                color: '#FF5722',
                fillColor: 'rgba(255, 87, 34, 0.1)',
                fillOpacity: 0.1,
                weight: 2,
                dashArray: '5, 5'
            }).addTo(this.adminMap);

            this.adminMapCircles.push(circle);
        });

        if (bounds.length > 0) {
            this.adminMap.fitBounds(bounds, { padding: [50, 50] });
        }

        createIcons({ icons });
    },

    updateAdminMapCircles() {
        if (!this.adminMap) return;

        this.adminMapCircles.forEach(c => this.adminMap.removeLayer(c));
        this.adminMapCircles = [];

        const points = this.explorePoints || [];
        points.forEach(point => {
            const gcj = wgs84ToGcj02(point.latitude, point.longitude);
            const circle = L.circle([gcj.lat, gcj.lng], {
                radius: point.radius_meters,
                color: '#FF5722',
                fillColor: 'rgba(255, 87, 34, 0.1)',
                fillOpacity: 0.1,
                weight: 2,
                dashArray: '5, 5'
            }).addTo(this.adminMap);
            this.adminMapCircles.push(circle);
        });
    },

    locateOnMap() {
        if (!this.adminMap) {
            showToast('请先打开地图', 'info');
            return;
        }

        if (!navigator.geolocation) {
            showToast('您的浏览器不支持地理定位', 'error');
            return;
        }

        const locateBtn = document.getElementById('btn-map-locate');
        if (locateBtn) {
            locateBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i>';
            createIcons({ icons });
        }

        this._isLocating = true;

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const wgsLat = position.coords.latitude;
                const wgsLng = position.coords.longitude;
                const gcj = wgs84ToGcj02(wgsLat, wgsLng);
                
                this.adminMap.setView([gcj.lat, gcj.lng], 16);

                this._removeUserMarker();
                const userIcon = L.divIcon({
                    className: 'admin-user-marker',
                    html: `<div class="admin-user-marker-inner"><i data-lucide="user"></i></div>`,
                    iconSize: [40, 40],
                    iconAnchor: [20, 20]
                });
                this._adminUserMarker = L.marker([gcj.lat, gcj.lng], { icon: userIcon })
                    .addTo(this.adminMap)
                    .bindPopup('您的位置');
                
                createIcons({ icons });
                
                if (locateBtn) {
                    locateBtn.innerHTML = '<i data-lucide="crosshair"></i>';
                    createIcons({ icons });
                }
                
                showToast('已定位到您的位置', 'success');

                setTimeout(() => {
                    this._isLocating = false;
                }, 1000);
            },
            (error) => {
                if (locateBtn) {
                    locateBtn.innerHTML = '<i data-lucide="crosshair"></i>';
                    createIcons({ icons });
                }
                
                let msg = '定位失败';
                if (error.code === 1) msg = '请允许定位权限';
                else if (error.code === 2) msg = '无法获取位置';
                else if (error.code === 3) msg = '定位超时';
                
                showToast(msg, 'error');
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
            }
        );
    },

    // ============================================
    // 奖池管理
    // ============================================

    async loadRewardPools(page = 1) {
        this.poolPage = page;
        const list = document.getElementById('reward-pool-list');
        if (!list) return;

        try {
            const typeFilter = this.poolTypeFilterValue || null;
            const data = await adminGetRewardPools(page, this.poolLimit, typeFilter ? [typeFilter] : null);
            let pools = data || [];

            this.rewardPools = pools;
            if (data && data.length > 0) {
                this.poolTotal = parseInt(data[0].total_count) || 0;
            } else {
                this.poolTotal = 0;
            }
            this.renderRewardPools();
        } catch (e) {
            console.error('loadRewardPools error:', e);
            list.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    },

    renderRewardPools() {
        const list = document.getElementById('reward-pool-list');
        if (!list) return;

        if (this.rewardPools.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>暂无奖池</p></div>';
            return;
        }

        const poolTypeLabels = {
            general: '通用',
            explore: '探索',
            consumable: '消耗品',
            activity: '活动',
            lottery: '彩票'
        };

        let html = this.rewardPools.map(pool => {
            const totalWeight = 0;
            return `
                <div class="reward-pool-card" data-pool-id="${pool.id}">
                    <div class="pool-header">
                        <div class="pool-icon">
                            <i data-lucide="gift"></i>
                        </div>
                        <div class="pool-info">
                            <span class="pool-name">${this.escHtml(pool.name)}</span>
                            <span class="pool-meta">
                                <span class="pool-type-tag">${poolTypeLabels[pool.pool_type] || pool.pool_type}</span>
                                ${pool.is_active ? '<span class="status-tag active">启用中</span>' : '<span class="status-tag">已停用</span>'}
                                <span class="pool-item-count">${pool.item_count} 个奖励</span>
                            </span>
                        </div>
                    </div>
                    ${pool.description ? `<div class="pool-desc">${this.escHtml(pool.description)}</div>` : ''}
                    <div class="pool-actions">
                        <button class="btn btn-primary btn-sm btn-manage-pool" data-pool-id="${pool.id}">
                            <i data-lucide="settings"></i> 管理奖励
                        </button>
                        <button class="btn btn-secondary btn-sm btn-edit-pool" data-pool-id="${pool.id}">
                            <i data-lucide="edit-3"></i> 编辑
                        </button>
                        <button class="btn btn-secondary btn-sm btn-toggle-pool" data-pool-id="${pool.id}" data-active="${pool.is_active}">
                            <i data-lucide="${pool.is_active ? 'pause' : 'play'}"></i> ${pool.is_active ? '停用' : '启用'}
                        </button>
                        <button class="btn btn-danger btn-sm btn-delete-pool" data-pool-id="${pool.id}" data-pool-name="${this.escHtml(pool.name)}">
                            <i data-lucide="trash-2"></i> 删除
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        html += renderPagination(this.poolPage, this.poolTotal, this.poolLimit);

        list.innerHTML = html;
        createIcons({ icons });
        bindPagination(list, (p) => this.loadRewardPools(p));

        list.querySelectorAll('.btn-manage-pool').forEach(btn => {
            btn.addEventListener('click', () => {
                const poolId = parseInt(btn.dataset.poolId);
                this.showPoolItemsModal(poolId);
            });
        });

        list.querySelectorAll('.btn-edit-pool').forEach(btn => {
            btn.addEventListener('click', () => {
                const poolId = parseInt(btn.dataset.poolId);
                this.showEditPoolModal(poolId);
            });
        });

        list.querySelectorAll('.btn-toggle-pool').forEach(btn => {
            btn.addEventListener('click', () => {
                const poolId = parseInt(btn.dataset.poolId);
                const isActive = btn.dataset.active === 'true';
                this.togglePool(poolId, !isActive);
            });
        });

        list.querySelectorAll('.btn-delete-pool').forEach(btn => {
            btn.addEventListener('click', () => {
                const poolId = parseInt(btn.dataset.poolId);
                const poolName = btn.dataset.poolName;
                this.deleteRewardPool(poolId, poolName);
            });
        });
    },

    showAddPoolModal() {
        const existing = document.getElementById('add-pool-modal');
        if (existing) existing.remove();

        const modalHtml = `
            <div id="add-pool-modal" class="modal" style="display:flex;">
                <div class="modal-overlay"></div>
                <div class="modal-content" style="max-width:480px;">
                    <div class="modal-header">
                        <h3><i data-lucide="plus"></i> 创建奖池</h3>
                        <button class="modal-close-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label">奖池名称 <span class="required">*</span></label>
                            <input type="text" class="form-input" id="add-pool-name" placeholder="如：普通探索奖池" maxlength="50" />
                        </div>
                        <div class="form-group">
                            <label class="form-label">奖池类型</label>
                            <select class="form-input" id="add-pool-type">
                                <option value="general">通用</option>
                                <option value="explore">探索</option>
                                <option value="consumable">消耗品</option>
                                <option value="activity">活动</option>
                                <option value="lottery">彩票</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">描述</label>
                            <input type="text" class="form-input" id="add-pool-desc" placeholder="奖池描述（可选）" />
                        </div>
                        <button class="btn btn-primary" id="btn-confirm-add-pool" style="width:100%;margin-top:16px;">
                            <i data-lucide="plus"></i> 创建奖池
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('add-pool-modal');
        const closeModal = () => modal.remove();
        modal.querySelector('.modal-overlay').addEventListener('click', closeModal);
        modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
        createIcons({ icons });

        modal.querySelector('#btn-confirm-add-pool').addEventListener('click', async () => {
            const name = modal.querySelector('#add-pool-name').value.trim();
            const description = modal.querySelector('#add-pool-desc').value.trim();
            const poolType = modal.querySelector('#add-pool-type').value;

            if (!name) {
                showToast('请输入奖池名称', 'error');
                return;
            }

            const btn = modal.querySelector('#btn-confirm-add-pool');
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> 创建中...';
            createIcons({ icons });

            try {
                const result = await adminCreateRewardPool(name, description, poolType);
                if (result?.success) {
                    showToast('创建成功', 'success');
                    closeModal();
                    this.loadRewardPools(1);
                } else {
                    showToast(result?.message || '创建失败', 'error');
                }
            } catch (e) {
                showToast('创建失败：' + e.message, 'error');
            }

            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="plus"></i> 创建奖池';
            createIcons({ icons });
        });
    },

    async showEditPoolModal(poolId) {
        const pool = this.rewardPools.find(p => p.id === poolId);
        if (!pool) return;

        const existing = document.getElementById('edit-pool-modal');
        if (existing) existing.remove();

        const modalHtml = `
            <div id="edit-pool-modal" class="modal" style="display:flex;">
                <div class="modal-overlay"></div>
                <div class="modal-content" style="max-width:480px;">
                    <div class="modal-header">
                        <h3><i data-lucide="edit-3"></i> 编辑奖池 #${poolId}</h3>
                        <button class="modal-close-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label">奖池名称 <span class="required">*</span></label>
                            <input type="text" class="form-input" id="edit-pool-name" value="${this.escHtml(pool.name)}" maxlength="50" />
                        </div>
                        <div class="form-group">
                            <label class="form-label">奖池类型</label>
                            <select class="form-input" id="edit-pool-type">
                                <option value="general" ${pool.pool_type === 'general' ? 'selected' : ''}>通用</option>
                                <option value="explore" ${pool.pool_type === 'explore' ? 'selected' : ''}>探索</option>
                                <option value="consumable" ${pool.pool_type === 'consumable' ? 'selected' : ''}>消耗品</option>
                                <option value="activity" ${pool.pool_type === 'activity' ? 'selected' : ''}>活动</option>
                                <option value="lottery" ${pool.pool_type === 'lottery' ? 'selected' : ''}>彩票</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">描述</label>
                            <input type="text" class="form-input" id="edit-pool-desc" value="${this.escHtml(pool.description || '')}" />
                        </div>
                        <button class="btn btn-primary" id="btn-save-pool" style="width:100%;margin-top:16px;">
                            保存
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('edit-pool-modal');
        const closeModal = () => modal.remove();
        modal.querySelector('.modal-overlay').addEventListener('click', closeModal);
        modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
        createIcons({ icons });

        modal.querySelector('#btn-save-pool').addEventListener('click', async () => {
            const name = modal.querySelector('#edit-pool-name').value.trim();
            const description = modal.querySelector('#edit-pool-desc').value.trim();
            const poolType = modal.querySelector('#edit-pool-type').value;

            if (!name) {
                showToast('请输入奖池名称', 'error');
                return;
            }

            const btn = modal.querySelector('#btn-save-pool');
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> 保存中...';
            createIcons({ icons });

            try {
                const result = await adminUpdateRewardPool(poolId, name, description, poolType, null);
                if (result?.success) {
                    showToast('保存成功', 'success');
                    closeModal();
                    this.loadRewardPools(this.poolPage);
                } else {
                    showToast(result?.message || '保存失败', 'error');
                }
            } catch (e) {
                showToast('保存失败：' + e.message, 'error');
            }

            btn.disabled = false;
            btn.innerHTML = '保存';
            createIcons({ icons });
        });
    },

    async togglePool(poolId, isActive) {
        try {
            const result = await adminUpdateRewardPool(poolId, null, null, null, isActive);
            if (result?.success) {
                showToast(isActive ? '已启用' : '已停用', 'success');
                this.loadRewardPools(this.poolPage);
            } else {
                showToast(result?.message || '操作失败', 'error');
            }
        } catch (e) {
            showToast('操作失败：' + e.message, 'error');
        }
    },

    async deleteRewardPool(poolId, poolName) {
        const ok = await showConfirm(
            `确定要删除奖池「${poolName}」吗？\n\n此操作将删除该奖池及其所有奖励配置，不可撤销！`,
            { okText: '删除', okClass: 'btn-danger', danger: true }
        );
        if (!ok) return;

        try {
            const result = await adminDeleteRewardPool(poolId);
            if (result?.success) {
                showToast('删除成功', 'success');
                this.loadRewardPools(this.poolPage);
            } else {
                showToast(result?.message || '删除失败', 'error');
            }
        } catch (e) {
            showToast('删除失败：' + e.message, 'error');
        }
    },

    async showPoolItemsModal(poolId) {
        const pool = this.rewardPools.find(p => p.id === poolId);
        if (!pool) return;

        const existing = document.getElementById('pool-items-modal');
        if (existing) existing.remove();

        const modalHtml = `
            <div id="pool-items-modal" class="modal" style="display:flex;">
                <div class="modal-overlay"></div>
                <div class="modal-content" style="max-width:640px;max-height:85vh;display:flex;flex-direction:column;">
                    <div class="modal-header">
                        <h3><i data-lucide="gift"></i> 奖励配置 - ${this.escHtml(pool.name)}</h3>
                        <button class="modal-close-btn">&times;</button>
                    </div>
                    <div class="modal-body" style="flex:1;overflow-y:auto;">
                        <div class="pool-items-header">
                            <div class="pool-items-total" id="pool-items-total">总权重: -</div>
                            <button class="btn btn-primary btn-sm" id="btn-add-pool-item">
                                <i data-lucide="plus"></i> 添加奖励
                            </button>
                        </div>
                        <div class="pool-items-list" id="pool-items-list">
                            <div class="skeleton" style="height:60px;"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('pool-items-modal');
        const closeModal = () => modal.remove();
        modal.querySelector('.modal-overlay').addEventListener('click', closeModal);
        modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
        createIcons({ icons });

        modal.querySelector('#btn-add-pool-item').addEventListener('click', () => {
            this.showAddPoolItemModal(poolId);
        });

        await this.loadPoolItems(poolId);
    },

    async loadPoolItems(poolId) {
        const listEl = document.getElementById('pool-items-list');
        const totalEl = document.getElementById('pool-items-total');
        if (!listEl) return;

        try {
            const detail = await adminGetRewardPoolDetail(poolId);
            const items = detail?.items || [];
            const totalWeight = items.reduce((sum, item) => sum + (item.weight || 0), 0);

            if (totalEl) {
                totalEl.textContent = `总权重: ${totalWeight}`;
            }

            if (items.length === 0) {
                listEl.innerHTML = '<div class="empty-state"><p>暂无奖励项</p></div>';
                return;
            }

            const rewardTypeLabels = {
                item: '物品',
                shells: '果壳币',
                exp: '经验',
                nothing: '空奖励'
            };

            listEl.innerHTML = items.map((item, index) => {
                const percentage = totalWeight > 0 ? ((item.weight / totalWeight) * 100).toFixed(1) : '0.0';
                let rewardDesc = '';
                if (item.reward_type === 'item') {
                    const qualityCfg = QUALITY_CONFIG[item.item_quality] || QUALITY_CONFIG.white;
                    const textShadow = item.item_quality === 'white' ? 'text-shadow:1px 1px 0 var(--ink), -1px -1px 0 var(--ink), 1px -1px 0 var(--ink), -1px 1px 0 var(--ink);font-weight:600;' : '';
                    rewardDesc = `<span style="color:${qualityCfg.color};${textShadow}">${this.escHtml(item.item_name || '未知物品')}</span> x ${item.item_quantity}`;
                } else if (item.reward_type === 'shells') {
                    rewardDesc = `${item.shells_amount} 果壳币`;
                } else if (item.reward_type === 'exp') {
                    rewardDesc = `${item.exp_amount} 经验`;
                } else {
                    rewardDesc = '空奖励（谢谢参与）';
                }

                return `
                    <div class="pool-item-row" data-item-id="${item.id}">
                        <div class="pool-item-index">${index + 1}</div>
                        <div class="pool-item-type">${rewardTypeLabels[item.reward_type] || item.reward_type}</div>
                        <div class="pool-item-desc">${rewardDesc}</div>
                        <div class="pool-item-weight">
                            <div class="weight-input-group">
                                <input type="number" class="form-input weight-input" value="${item.weight}" min="0" data-item-id="${item.id}" />
                                <span class="weight-percent">${percentage}%</span>
                            </div>
                        </div>
                        <div class="pool-item-actions">
                            <button class="btn btn-secondary btn-xs btn-edit-pool-item" data-item-id="${item.id}">
                                <i data-lucide="edit-3"></i>
                            </button>
                            <button class="btn btn-danger btn-xs btn-delete-pool-item" data-item-id="${item.id}">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            createIcons({ icons });

            listEl.querySelectorAll('.weight-input').forEach(input => {
                input.addEventListener('change', async (e) => {
                    const itemId = parseInt(e.target.dataset.itemId);
                    const newWeight = parseInt(e.target.value);
                    if (isNaN(newWeight) || newWeight < 0) return;

                    try {
                        const result = await adminUpdateRewardPoolItem(itemId, null, null, null, null, null, newWeight, null);
                        if (result?.success) {
                            showToast('权重已更新', 'success');
                            this.loadPoolItems(poolId);
                        }
                    } catch (err) {
                        showToast('更新失败', 'error');
                    }
                });
            });

            listEl.querySelectorAll('.btn-edit-pool-item').forEach(btn => {
                btn.addEventListener('click', () => {
                    const itemId = parseInt(btn.dataset.itemId);
                    const item = (detail?.items || []).find(i => i.id === itemId);
                    if (item) {
                        this.showEditPoolItemModal(poolId, item);
                    }
                });
            });

            listEl.querySelectorAll('.btn-delete-pool-item').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const itemId = parseInt(btn.dataset.itemId);
                    const ok = await showConfirm('确定要删除这个奖励项吗？', { okText: '删除', okClass: 'btn-danger' });
                    if (!ok) return;

                    try {
                        const result = await adminDeleteRewardPoolItem(itemId);
                        if (result?.success) {
                            showToast('删除成功', 'success');
                            this.loadPoolItems(poolId);
                        }
                    } catch (err) {
                        showToast('删除失败', 'error');
                    }
                });
            });

        } catch (e) {
            console.error('loadPoolItems error:', e);
            listEl.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    },

    showAddPoolItemModal(poolId) {
        this._showPoolItemModal(poolId, null);
    },

    showEditPoolItemModal(poolId, item) {
        this._showPoolItemModal(poolId, item);
    },

    _showPoolItemModal(poolId, item) {
        const isEdit = !!item;
        const modalId = isEdit ? 'edit-pool-item-modal' : 'add-pool-item-modal';
        const existing = document.getElementById(modalId);
        if (existing) existing.remove();

        const title = isEdit ? '编辑奖励项' : '添加奖励项';
        const defaultType = item?.reward_type || 'item';

        const modalHtml = `
            <div id="${modalId}" class="modal" style="display:flex;">
                <div class="modal-overlay"></div>
                <div class="modal-content" style="max-width:440px;">
                    <div class="modal-header">
                        <h3><i data-lucide="${isEdit ? 'edit-3' : 'plus'}"></i> ${title}</h3>
                        <button class="modal-close-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label">奖励类型</label>
                            <select class="form-input" id="pool-item-type">
                                <option value="item" ${defaultType === 'item' ? 'selected' : ''}>物品</option>
                                <option value="shells" ${defaultType === 'shells' ? 'selected' : ''}>果壳币</option>
                                <option value="exp" ${defaultType === 'exp' ? 'selected' : ''}>经验</option>
                                <option value="nothing" ${defaultType === 'nothing' ? 'selected' : ''}>空奖励（谢谢参与）</option>
                            </select>
                        </div>

                        <div class="form-group" id="pool-item-item-section" style="display:${defaultType === 'item' ? 'block' : 'none'};">
                            <label class="form-label">选择物品</label>
                            <select class="form-input" id="pool-item-item" data-searchable-item-select>
                                <option value="">选择物品</option>
                            </select>
                            <div class="form-group" style="margin-top:8px;">
                                <label class="form-label">数量</label>
                                <input type="number" class="form-input" id="pool-item-quantity" value="${item?.item_quantity || 1}" min="1" />
                            </div>
                        </div>

                        <div class="form-group" id="pool-item-shells-section" style="display:${defaultType === 'shells' ? 'block' : 'none'};">
                            <label class="form-label">果壳币数量</label>
                            <input type="number" class="form-input" id="pool-item-shells" value="${item?.shells_amount || 100}" min="0" />
                        </div>

                        <div class="form-group" id="pool-item-exp-section" style="display:${defaultType === 'exp' ? 'block' : 'none'};">
                            <label class="form-label">经验数量</label>
                            <input type="number" class="form-input" id="pool-item-exp" value="${item?.exp_amount || 10}" min="0" />
                        </div>

                        <div class="form-group">
                            <label class="form-label">权重（概率占比）</label>
                            <input type="number" class="form-input" id="pool-item-weight" value="${item?.weight || 100}" min="0" />
                            <div class="form-hint">权重越高，中奖概率越大</div>
                        </div>

                        <div class="form-group">
                            <label class="form-label">排序</label>
                            <input type="number" class="form-input" id="pool-item-sort" value="${item?.sort_order || 0}" />
                        </div>

                        <button class="btn btn-primary" id="btn-confirm-pool-item" style="width:100%;margin-top:16px;">
                            ${isEdit ? '保存' : '添加'}
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById(modalId);
        const closeModal = () => modal.remove();
        modal.querySelector('.modal-overlay').addEventListener('click', closeModal);
        modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
        createIcons({ icons });

        const typeSelect = modal.querySelector('#pool-item-type');
        const itemSection = modal.querySelector('#pool-item-item-section');
        const shellsSection = modal.querySelector('#pool-item-shells-section');
        const expSection = modal.querySelector('#pool-item-exp-section');

        const updateSections = () => {
            const type = typeSelect.value;
            itemSection.style.display = type === 'item' ? 'block' : 'none';
            shellsSection.style.display = type === 'shells' ? 'block' : 'none';
            expSection.style.display = type === 'exp' ? 'block' : 'none';
        };
        typeSelect.addEventListener('change', updateSections);

        this._loadExplorePointItemSelect('#pool-item-item').then(() => {
            if (isEdit && item?.item_id) {
                const sel = modal.querySelector('#pool-item-item');
                if (sel) {
                    sel.value = item.item_id;
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        });

        modal.querySelector('#btn-confirm-pool-item').addEventListener('click', async () => {
            const rewardType = modal.querySelector('#pool-item-type').value;
            const weight = parseInt(modal.querySelector('#pool-item-weight').value) || 0;
            const sortOrder = parseInt(modal.querySelector('#pool-item-sort').value) || 0;

            let itemId = null;
            let itemQuantity = 1;
            let shellsAmount = 0;
            let expAmount = 0;

            if (rewardType === 'item') {
                itemId = parseInt(modal.querySelector('#pool-item-item').value) || null;
                itemQuantity = parseInt(modal.querySelector('#pool-item-quantity').value) || 1;
                if (!itemId) {
                    showToast('请选择物品', 'error');
                    return;
                }
            } else if (rewardType === 'shells') {
                shellsAmount = parseInt(modal.querySelector('#pool-item-shells').value) || 0;
            } else if (rewardType === 'exp') {
                expAmount = parseInt(modal.querySelector('#pool-item-exp').value) || 0;
            }

            const btn = modal.querySelector('#btn-confirm-pool-item');
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> 处理中...';
            createIcons({ icons });

            try {
                let result;
                if (isEdit) {
                    result = await adminUpdateRewardPoolItem(
                        item.id, rewardType, itemId, itemQuantity,
                        shellsAmount, expAmount, weight, sortOrder
                    );
                } else {
                    result = await adminAddRewardPoolItem(
                        poolId, rewardType, itemId, itemQuantity,
                        shellsAmount, expAmount, weight, sortOrder
                    );
                }

                if (result?.success) {
                    showToast(isEdit ? '保存成功' : '添加成功', 'success');
                    closeModal();
                    this.loadPoolItems(poolId);
                } else {
                    showToast(result?.message || '操作失败', 'error');
                }
            } catch (e) {
                showToast('操作失败：' + e.message, 'error');
            }

            btn.disabled = false;
            btn.innerHTML = isEdit ? '保存' : '添加';
            createIcons({ icons });
        });
    }
};