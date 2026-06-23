import { getFriendsWithOnline, getFollowingWithOnline, getFollowersWithOnline, toggleFollow } from '../api.js';
import { userAvatarHTML, userBadgeHTML, showToast } from '../utils.js';
import { createIcons, icons } from 'lucide';
import { currentUser } from '../supabaseClient.js';
import { router } from '../router.js';

export const followPage = {
    currentTab: 'friends',
    userId: null,

    render(container) {
        // 从路由获取用户ID，如果没有则使用当前用户
        const hash = window.location.hash;
        const parts = hash.split('/');
        this.userId = parts[1] || currentUser?.id;

        if (!this.userId) {
            showToast('请先登录', 'error');
            router.navigate('auth');
            return;
        }

        container.innerHTML = `
            <div class="follow-page">
                <div class="follow-tabs">
                    <button class="follow-tab active" data-tab="friends">
                        <i data-lucide="users"></i>
                        <span>好友</span>
                    </button>
                    <button class="follow-tab" data-tab="following">
                        <i data-lucide="user-plus"></i>
                        <span>关注</span>
                    </button>
                    <button class="follow-tab" data-tab="followers">
                        <i data-lucide="heart"></i>
                        <span>粉丝</span>
                    </button>
                </div>
                <div class="follow-list" id="follow-list">
                    <div class="follow-loading">加载中...</div>
                </div>
            </div>
        `;

        this.attachEvents(container);
        this.loadData();
    },

    attachEvents(container) {
        container.querySelectorAll('.follow-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                container.querySelectorAll('.follow-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentTab = tab.dataset.tab;
                this.loadData();
            });
        });

        createIcons({ icons });
    },

    async loadData() {
        const listEl = document.getElementById('follow-list');
        if (!listEl) return;
        
        listEl.innerHTML = '<div class="follow-loading">加载中...</div>';

        try {
            let users = [];
            switch (this.currentTab) {
                case 'friends':
                    users = await getFriendsWithOnline(this.userId) || [];
                    break;
                case 'following':
                    users = await getFollowingWithOnline(this.userId) || [];
                    break;
                case 'followers':
                    users = await getFollowersWithOnline(this.userId) || [];
                    break;
            }

            this.renderList(users);
        } catch (e) {
            console.error('加载关注列表失败:', e);
            listEl.innerHTML = '<div class="follow-empty">加载失败，请稍后重试</div>';
        }
    },

    renderList(users) {
        const listEl = document.getElementById('follow-list');
        if (!listEl) return;

        if (!users || users.length === 0) {
            const emptyMessages = {
                friends: '暂无好友，互关后成为好友',
                following: '暂无关注',
                followers: '暂无粉丝'
            };
            listEl.innerHTML = `<div class="follow-empty">${emptyMessages[this.currentTab]}</div>`;
            return;
        }

        listEl.innerHTML = users.map(user => `
            <div class="follow-item" data-user-id="${user.user_id}">
                <div class="follow-avatar">
                    ${userAvatarHTML(user)}
                    ${user.is_online ? '<span class="online-dot"></span>' : ''}
                </div>
                <div class="follow-info">
                    <div class="follow-name">
                        ${user.nickname}
                        ${userBadgeHTML({ is_admin: user.is_admin, is_bot: user.is_bot })}
                        ${user.is_online ? '<span class="online-tag">在线</span>' : ''}
                    </div>
                    ${this.currentTab !== 'friends' && user.is_mutual ? '<span class="mutual-tag">互关</span>' : ''}
                </div>
                <div class="follow-actions">
                    <button class="btn btn-outline btn-profile" data-user-id="${user.user_id}">
                        <i data-lucide="user"></i>
                        查看
                    </button>
                    ${this.currentTab === 'following' || this.currentTab === 'friends' ? `
                        <button class="btn btn-danger btn-unfollow" data-user-id="${user.user_id}">
                            <i data-lucide="user-minus"></i>
                            取关
                        </button>
                    ` : ''}
                    ${this.currentTab === 'followers' && !user.is_mutual ? `
                        <button class="btn btn-primary btn-follow-back" data-user-id="${user.user_id}">
                            <i data-lucide="user-plus"></i>
                            回关
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('');

        createIcons({ icons });

        // 绑定事件
        listEl.querySelectorAll('.btn-profile').forEach(btn => {
            btn.addEventListener('click', () => {
                router.navigate(`user/${btn.dataset.userId}`);
            });
        });

        listEl.querySelectorAll('.btn-unfollow').forEach(btn => {
            btn.addEventListener('click', async () => {
                await this.handleUnfollow(btn.dataset.userId);
            });
        });

        listEl.querySelectorAll('.btn-follow-back').forEach(btn => {
            btn.addEventListener('click', async () => {
                await this.handleFollowBack(btn.dataset.userId);
            });
        });
    },

    async handleUnfollow(targetId) {
        try {
            const result = await toggleFollow(targetId);
            if (result.success) {
                showToast('已取消关注', 'success');
                this.loadData();
            }
        } catch (e) {
            showToast('操作失败', 'error');
        }
    },

    async handleFollowBack(targetId) {
        try {
            const result = await toggleFollow(targetId);
            if (result.success) {
                showToast('关注成功', 'success');
                this.loadData();
            }
        } catch (e) {
            showToast('操作失败', 'error');
        }
    }
};