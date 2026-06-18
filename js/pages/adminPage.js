import { checkAdmin, getAllUsers, getSystemStats, adminGetItems, adminAddItem, adminAddItemDefinition, getItems, getPendingSubmissions, approveSubmission, rejectSubmission } from '../api.js';
import { router } from '../router.js';
import { createIcons, icons } from 'lucide';
import { showToast, QUALITY_CONFIG } from '../utils.js';

export const adminPage = {
    users: [],
    items: [],
    submissions: [],

    async render(container) {
        this.attachEvents(container);
        await this.checkPermission();
        await this.loadStats();
        await this.loadUsers();
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
        container.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const tab = btn.dataset.tab;
                container.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
                container.querySelector(`#tab-${tab}`).style.display = 'block';
                if (tab === 'items') this.loadItems();
                if (tab === 'submissions') this.loadSubmissions();
            });
        });

        container.querySelector('#btn-add-item')?.addEventListener('click', () => this.addItem());

        createIcons({ icons });
    },

    async loadStats() {
        try {
            const stats = await getSystemStats();
            document.getElementById('stat-users').textContent = stats[0]?.total_users || 0;
            document.getElementById('stat-items').textContent = stats[0]?.total_items || 0;
            document.getElementById('stat-orders').textContent = stats[0]?.total_orders || 0;
            document.getElementById('stat-mails').textContent = stats[0]?.total_mails || 0;
        } catch (e) {
            console.error('Failed to load stats:', e);
        }
    },

    async loadUsers() {
        const list = document.getElementById('user-list');
        try {
            this.users = await getAllUsers();
            this.renderUsers();
        } catch (e) {
            list.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    },

    renderUsers() {
        const list = document.getElementById('user-list');
        if (this.users.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>暂无用户</p></div>';
            return;
        }

        list.innerHTML = this.users.map(user => `
            <div class="user-card">
                <div class="user-info">
                    <span class="user-name">${user.nickname || '无名'}</span>
                    <span class="user-date">${new Date(user.created_at).toLocaleDateString()}</span>
                </div>
                <div class="user-stats">
                    <span class="user-shells">${user.shells} 果壳币</span>
                    ${user.is_admin ? '<span class="admin-badge">管理员</span>' : ''}
                </div>
                <div class="user-actions">
                    <select class="form-input" data-user-id="${user.user_id}" style="width:auto;padding:6px 12px;">
                        <option value="">选择物品</option>
                    </select>
                    <input type="number" class="form-input" data-qty-for="${user.user_id}" value="1" min="1" style="width:60px;" />
                    <button class="btn btn-secondary btn-sm" data-give-to="${user.user_id}">发放</button>
                </div>
            </div>
        `).join('');

        this.loadItemsForSelect();
        this.attachUserActions();
        createIcons({ icons });
    },

    async loadItemsForSelect() {
        try {
            const items = await adminGetItems();
            document.querySelectorAll('select[data-user-id]').forEach(select => {
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
        document.querySelectorAll('button[data-give-to]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const userId = btn.dataset.giveTo;
                const select = document.querySelector(`select[data-user-id="${userId}"]`);
                const qtyInput = document.querySelector(`input[data-qty-for="${userId}"]`);
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

    async loadItems() {
        const list = document.getElementById('item-list');
        try {
            this.items = await adminGetItems();
            this.renderItems();
        } catch (e) {
            list.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    },

    renderItems() {
        const list = document.getElementById('item-list');
        if (this.items.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>暂无收藏品</p></div>';
            return;
        }

        list.innerHTML = this.items.map(item => {
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
    },

    async addItem() {
        const name = document.getElementById('item-name').value.trim();
        const quality = document.getElementById('item-quality').value;
        const description = document.getElementById('item-desc').value.trim();
        const weight = parseInt(document.getElementById('item-weight').value) || 100;

        if (!name) {
            showToast('请输入物品名称', 'error');
            return;
        }

        try {
            await adminAddItemDefinition(name, quality, '', description, weight);
            showToast('添加成功', 'success');
            document.getElementById('item-name').value = '';
            document.getElementById('item-desc').value = '';
            await this.loadStats();
            this.loadItems();
        } catch (e) {
            showToast('添加失败', 'error');
        }
    },

    async loadSubmissions() {
        const list = document.getElementById('submission-list-admin');
        try {
            this.submissions = await getPendingSubmissions();
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

        list.innerHTML = this.submissions.map(sub => {
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

        this.attachSubmissionActions();
        createIcons({ icons });
    },

    attachSubmissionActions() {
        document.querySelectorAll('button[data-approve]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = parseInt(btn.dataset.approve);
                const input = document.querySelector(`input[data-sub-id="${id}"]`);
                const reward = parseInt(input.value) || 0;
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
            btn.addEventListener('click', async () => {
                const id = parseInt(btn.dataset.reject);
                this.showRejectModal(id);
            });
        });
    },

    showRejectModal(submissionId) {
        // 创建拒绝弹窗
        const modalHtml = `
            <div id="reject-modal" class="modal" style="display:flex;">
                <div class="modal-overlay" onclick="document.getElementById('reject-modal').remove()"></div>
                <div class="modal-content" style="max-width:400px;">
                    <h3 style="margin-bottom:16px;color:var(--text-primary);">拒绝投稿</h3>
                    <textarea id="reject-reason-input" class="form-input" placeholder="请输入拒绝原因..." rows="4" style="width:100%;margin-bottom:16px;"></textarea>
                    <div style="display:flex;gap:12px;justify-content:flex-end;">
                        <button class="btn btn-secondary" onclick="document.getElementById('reject-modal').remove()">取消</button>
                        <button class="btn btn-danger" id="confirm-reject-btn">确认拒绝</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('confirm-reject-btn').addEventListener('click', async () => {
            const reason = document.getElementById('reject-reason-input').value.trim() || '无';
            try {
                await rejectSubmission(submissionId, reason);
                showToast('已拒绝', 'success');
                document.getElementById('reject-modal').remove();
                this.loadSubmissions();
            } catch (e) {
                showToast('操作失败', 'error');
            }
        });
    }
};
