import { checkAdmin, getUserDetail, getUserInventory, getSystemStats, adminGetItems, adminGetAllItems, adminAddItem, adminAddItemDefinition, adminUpdateItemDefinition, getItems, getPendingSubmissions, approveSubmission, rejectSubmission, getLotteryRound, drawLotteryRound, getLotteryHistory, adminBotReplenish, getAllBotsWithConfig, updateBotConfig, adminBotListItem, adminBotCancelOrder, getBotOrders, adminUpdateUserShells, adminAdjustUserShells, adminRemoveUserItem, adminClearUserItems, adminSetUserAdmin, adminGetUsers, adminChangeUserNickname, adminUpdateCropConfig, adminGetCropBySeedId, adminDeleteItem, adminDeleteUser, getUserEmailVerified, adminCreateUser } from '../api.js';
import { supabase } from '../supabaseClient.js';
import { router } from '../router.js';
import { createIcons, icons } from 'lucide';
import { showToast, showConfirm, showConfirmTyped, QUALITY_CONFIG, QUALITY_OPTIONS, ITEM_TYPES, itemTypeOptionsHTML, qualityOptionsHTML, renderPagination, bindPagination, itemImageHTML, initItemImages, replaceWithSearchableSelect, upgradeSelectsToSearchable } from '../utils.js';

export const adminPage = {
    users: [],
    items: [],
    submissions: [],
    // 分页状态
    userPage: 1, userLimit: 20, userTotal: 0, userSearch: '',
    itemPage: 1, itemLimit: 50, itemTotal: 0, itemSearch: '',
    subPage: 1, subLimit: 20, subTotal: 0,
    invPage: 1, invLimit: 20, invTotal: 0,
    lottoPage: 1, lottoLimit: 10, lottoTotal: 0,

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
            return `
            <div class="user-card">
                <div class="user-avatar-small clickable-avatar">
                    <i data-lucide="user"></i>
                </div>
                <div class="user-info">
                    <span class="user-name clickable-name">${user.nickname || '无名'}</span>
                    <span class="user-date">${new Date(user.created_at).toLocaleDateString()}</span>
                </div>
                <div class="user-stats">
                    <span class="user-shells">${(user.shells ?? 0).toLocaleString()} 果壳币</span>
                    ${user.is_admin ? '<span class="admin-badge">管理员</span>' : ''}
                    ${user.is_bot ? '<span class="bot-tag">机器人</span>' : ''}
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
                    <button class="btn btn-danger btn-sm btn-delete-user"
                        data-user-id="${user.user_id}"
                        data-user-name="${this.escHtml(user.nickname || '无名')}"
                        data-is-admin="${user.is_admin ? '1' : '0'}"
                        data-is-self="${isSelf ? '1' : '0'}"
                        ${isSelf || user.is_admin ? 'disabled title="不能删除自己或管理员"' : ''}>
                        <i data-lucide="trash-2"></i> 删除
                    </button>
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
        // 查看详情按钮
        document.querySelectorAll('button.btn-user-detail').forEach(btn => {
            btn.addEventListener('click', async () => {
                const userId = btn.dataset.userId;
                this.showUserDetail(userId);
            });
        });

        // 发放物品按钮
        document.querySelectorAll('button[data-give-to]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const userId = btn.dataset.giveTo;
                const select = document.querySelector(`select[data-user-id="${userId}"]`);
                const qtyInput = document.querySelector(`input[data-qty-for="${userId}"]`);
                if (!select || !qtyInput) return;

                const itemId = parseInt(select.value);
                const quantity = parseInt(qtyInput.value) || 1;

                if (!itemId) {
                    showToast('请选择物品', 'error');
                    return;
                }

                try {
                    await adminAddItem(userId, itemId, quantity);
                    showToast('发放成功', 'success');
                } catch (e) {
                    showToast('发放失败', 'error');
                }
            });
        });

        // 删除用户按钮
        document.querySelectorAll('button.btn-delete-user').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (btn.disabled) return;
                const userId = btn.dataset.userId;
                const userName = btn.dataset.userName;
                const isAdmin = btn.dataset.isAdmin === '1';

                // 按需查询邮箱激活状态（读取 auth.users.email_confirmed_at 原生字段）
                let isVerified = true;
                try {
                    btn.disabled = true;
                    isVerified = await getUserEmailVerified(userId);
                } catch (e) {
                    // 查询失败按已激活处理（走严格流程更安全）
                    isVerified = true;
                } finally {
                    btn.disabled = false;
                }

                this.confirmDeleteUser(userId, userName, isAdmin, isVerified);
            });
        });
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
                            <label>危险操作</label>
                            <button class="btn btn-sm btn-danger" id="btn-delete-user-detail" style="background:var(--seal-red);">
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

            if (!name) { showToast('名称不能为空', 'error'); return; }

            try {
                await adminUpdateItemDefinition(itemId, name, quality, itemType, imageName, description, weightVal);

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

    showAddItemModal() {
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
            const w = parseInt(weightInput);
            const weight = isNaN(w) ? 100 : w;

            if (!name) {
                showToast('请输入物品名称', 'error');
                return;
            }

            const btn = modal.querySelector('#btn-confirm-add-item');
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> 添加中...';
            createIcons({ icons });

            try {
                await adminAddItemDefinition(name, quality, imageName, description, weight);
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
                const ok = await showConfirm(
                    '确定要清空该用户的所有物品吗？此操作不可撤销！',
                    { okText: '清空', okClass: 'btn-danger' }
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
    }
};