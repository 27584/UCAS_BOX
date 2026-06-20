import { checkAdmin, getAllUsers, getUserDetail, getUserInventory, getSystemStats, adminGetItems, adminAddItem, adminAddItemDefinition, getItems, getPendingSubmissions, approveSubmission, rejectSubmission, getLotteryRound, drawLotteryRound, getLotteryHistory, adminBotReplenish, getAllBotsWithConfig, updateBotConfig, adminBotListItem, adminBotCancelOrder, getBotOrders } from '../api.js';
import { supabase } from '../supabaseClient.js';
import { router } from '../router.js';
import { createIcons, icons } from 'lucide';
import { showToast, QUALITY_CONFIG, renderPagination, bindPagination } from '../utils.js';

export const adminPage = {
    users: [],
    items: [],
    submissions: [],
    // 分页状态
    userPage: 1, userLimit: 20, userTotal: 0,
    itemPage: 1, itemLimit: 50, itemTotal: 0,
    subPage: 1, subLimit: 20, subTotal: 0,
    invPage: 1, invLimit: 20, invTotal: 0,
    lottoPage: 1, lottoLimit: 10, lottoTotal: 0,

    async render(container) {
        // 先校验权限，成功再渲染DOM、绑定事件
        const pass = await this.checkPermission();
        if (!pass) return;

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

        // 新增物品按钮
        const addItemBtn = container.querySelector('#btn-add-item');
        if (addItemBtn) addItemBtn.addEventListener('click', () => this.addItem());

        // 彩票开奖按钮
        const drawBtn = container.querySelector('#btn-admin-draw');
        if (drawBtn) drawBtn.addEventListener('click', () => this.adminDraw());

        const debugDrawBtn = container.querySelector('#btn-debug-draw');
        if (debugDrawBtn) debugDrawBtn.addEventListener('click', () => this.debugDraw());

        const botReplenishBtn = container.querySelector('#btn-bot-replenish');
        if (botReplenishBtn) botReplenishBtn.addEventListener('click', () => this.botReplenish());
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
            const data = await getAllUsers(page, this.userLimit);
            this.users = data || [];
            if (data.length > 0) {
                this.userTotal = parseInt(data[0].total_count) || 0;
            }
            this.renderUsers();
        } catch (e) {
            list.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    },

    renderUsers(filterText = '') {
        const list = document.getElementById('user-list');
        if (!list) return;
        if (this.users.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>暂无用户</p></div>';
            return;
        }

        const filtered = filterText
            ? this.users.filter(u => (u.nickname || '').toLowerCase().includes(filterText.toLowerCase()) || (u.user_id || '').toString().includes(filterText))
            : this.users;

        if (filtered.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>无匹配用户</p></div>';
            return;
        }

        let html = filtered.map(user => `
            <div class="user-card">
                <div class="user-avatar-small">
                    <i data-lucide="user"></i>
                </div>
                <div class="user-info">
                    <span class="user-name">${user.nickname || '无名'}</span>
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
                </div>
            </div>
        `).join('');

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
            const selects = document.querySelectorAll('select[data-user-id]');
            selects.forEach(select => {
                // 清空旧选项防止重复叠加
                select.innerHTML = '<option value="">选择物品</option>';
                items.forEach(item => {
                    const opt = document.createElement('option');
                    opt.value = item.item_id;
                    opt.textContent = `[${item.quality}] ${item.name}`;
                    select.appendChild(opt);
                });
            });
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
    },

    async showUserDetail(userId, invPage = 1) {
        this.invPage = invPage;
        const user = this.users.find(u => u.user_id === userId);
        if (!user) return;

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
                </div>`;

            if (invItems.length > 0) {
                html += `
                <div class="user-detail-section">
                    <h4>背包物品 (${invCount}件)</h4>
                    <div class="user-inventory-list" id="inv-list-content">
                        ${invItems.map(item => {
                            const cfg = QUALITY_CONFIG[item.item_quality] || QUALITY_CONFIG.white;
                            return `
                                <div class="inv-item-row">
                                    <span class="quality-dot" style="background:${cfg.color}"></span>
                                    <span class="inv-item-name">${item.item_name}</span>
                                    <span class="quality-badge quality-${item.item_quality}">${cfg.label}</span>
                                    <span class="inv-item-qty">x${item.quantity}</span>
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
        try {
            const data = await adminGetItems(page, this.itemLimit);
            this.items = data || [];
            if (data.length > 0) {
                this.itemTotal = parseInt(data[0].total_count) || 0;
            }
            this.renderItems();
        } catch (e) {
            list.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    },

    renderItems() {
        const list = document.getElementById('item-list');
        if (!list) return;
        if (this.items.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>暂无收藏品</p></div>';
            return;
        }

        let html = this.items.map(item => {
            const cfg = QUALITY_CONFIG[item.quality] || QUALITY_CONFIG.white;
            return `
                <div class="item-admin-card">
                    <div class="item-quality-bar" style="background:${cfg.color}"></div>
                    <div class="item-info">
                        <span class="item-name">${item.name}</span>
                        <span class="item-quality" style="color:${cfg.color}">${cfg.label}</span>
                    </div>
                    <div class="item-meta">
                        <span>权重: ${item.drop_weight}</span>
                    </div>
                </div>
            `;
        }).join('');

        html += renderPagination(this.itemPage, this.itemTotal, this.itemLimit);

        list.innerHTML = html;
        bindPagination(list, (page) => this.loadItems(page));
    },

    async addItem() {
        const nameEl = document.getElementById('item-name');
        const qualityEl = document.getElementById('item-quality');
        const descEl = document.getElementById('item-desc');
        const weightEl = document.getElementById('item-weight');
        if (!nameEl || !qualityEl || !descEl || !weightEl) return;

        const name = nameEl.value.trim();
        const quality = qualityEl.value;
        const description = descEl.value.trim();
        const weight = parseInt(weightEl.value) || 100;

        if (!name) {
            showToast('请输入物品名称', 'error');
            return;
        }

        try {
            await adminAddItemDefinition(name, quality, '', description, weight);
            showToast('添加成功', 'success');
            nameEl.value = '';
            descEl.value = '';
            await this.loadStats();
            this.loadItems();
        } catch (e) {
            showToast('添加失败', 'error');
        }
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
                    <div class="submission-quality-bar" style="background:${cfg.color}"></div>
                    <div class="submission-info">
                        <div class="submission-header">
                            <span class="submission-name">${sub.name}</span>
                            <span style="color:${cfg.color}">${cfg.label}</span>
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
        const qualities = ['white','green','blue','purple','orange','red'];
        const qLabels = { white:'普通', green:'稀有', blue:'珍奇', purple:'史诗', orange:'传说', red:'神圣' };
        const pct = bot.max_orders > 0 ? Math.round(bot.active_order_count / bot.max_orders * 100) : 0;

        const qChecks = qualities.map(q =>
            `<label class="quality-check">
                <input type="checkbox" class="q-check" value="${q}" ${(bot.qualities||[]).includes(q) ? 'checked' : ''} />
                <span class="quality-badge quality-${q}">${qLabels[q]}</span>
            </label>`
        ).join('');

        const qRows = qualities.map(q => {
            const priceKey = `price_${q}`;
            const qtyKey = `qty_${q}`;
            return `<div class="bot-q-row">
                <span class="quality-badge quality-${q}">${qLabels[q]}</span>
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
                    <span class="quality-dot" style="background:${qc.color}"></span>
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
            console.log('adminGetItems result:', items);
            if (!items || items.length === 0) {
                sel.innerHTML = '<option value="">无可用物品</option>';
                return;
            }
            sel.innerHTML = '<option value="">-- 选择物品 --</option>' +
                items.map(i => {
                    const qc = QUALITY_CONFIG[i.quality] || QUALITY_CONFIG.white;
                    const itemId = i.item_id !== undefined ? i.item_id : i.id;
                    return `<option value="${itemId}">${i.name} (${qc.label} / ${i.item_type})</option>`;
                }).join('');
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
    }
};