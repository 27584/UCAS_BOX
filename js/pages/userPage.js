import { getUserProfile, getUserPosts, getUserInventoryPublic, toggleFollow, checkFollowing, checkAllowFollow } from '../api.js';
import { showToast, formatNumber, timeAgo, escapeHtml, itemImageHTML, QUALITY_CONFIG, initItemImages, renderPagination, bindPagination, userBadgeHTML } from '../utils.js';
import { createIcons, icons } from 'lucide';
import { router } from '../router.js';
import { currentUser } from '../supabaseClient.js';

export const userPage = {
    userId: null,
    profile: null,
    posts: [],
    inventory: [],
    isFollowing: false,
    currentTab: 'posts',
    postsPage: 1,
    postsTotal: 0,
    inventoryPage: 1,
    inventoryTotal: 0,
    postsPerPage: 10,
    inventoryPerPage: 24,

    render(container) {
        // 从路由获取用户ID
        const hash = window.location.hash;
        const parts = hash.split('/');
        this.userId = parts[1] || null;

        if (!this.userId) {
            showToast('用户不存在', 'error');
            router.navigate('feed');
            return;
        }

        // 重置状态
        this.postsPage = 1;
        this.inventoryPage = 1;
        this.posts = [];
        this.inventory = [];

        this.attachEvents(container);
        this.loadUserProfile();
    },

    attachEvents(container) {
        // 关注按钮
        const followBtn = container.querySelector('#btn-follow');
        if (followBtn) {
            followBtn.addEventListener('click', () => this.handleToggleFollow());
        }

        // 私信按钮
        const dmBtn = container.querySelector('#btn-dm');
        if (dmBtn) {
            dmBtn.addEventListener('click', () => this.handleDm());
        }

        // Tab切换
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

        if (this.currentTab === 'posts') {
            if (postsContent) postsContent.style.display = 'block';
            if (inventoryContent) inventoryContent.style.display = 'none';
        } else {
            // 检查是否允许查看收藏
            if (this.profile && this.profile.show_collections === false) {
                showToast('该用户未公开收藏品', 'error');
                this.currentTab = 'posts';
                document.querySelectorAll('.user-tab').forEach(t => t.classList.remove('active'));
                document.querySelector('.user-tab[data-tab="posts"]')?.classList.add('active');
                if (postsContent) postsContent.style.display = 'block';
                if (inventoryContent) inventoryContent.style.display = 'none';
                return;
            }
            if (postsContent) postsContent.style.display = 'none';
            if (inventoryContent) inventoryContent.style.display = 'block';
            if (this.inventory.length === 0) {
                this.loadUserInventory(1);
            }
        }
    },

    async loadUserProfile() {
        try {
            const [profileArr, followingStatus] = await Promise.all([
                getUserProfile(this.userId),
                currentUser ? checkFollowing(this.userId) : Promise.resolve(false)
            ]);

            // RPC 返回数组，取第一个
            this.profile = Array.isArray(profileArr) ? profileArr[0] : profileArr;
            this.isFollowing = followingStatus || false;

            // 隐藏收藏tab如果没有开启
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
                this.currentTab = 'posts';
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
        document.getElementById('user-initial').textContent = initial;
        document.getElementById('user-shells').textContent = formatNumber(this.profile.shells || 0);
        document.getElementById('user-items').textContent = formatNumber(this.profile.item_count || 0);
        document.getElementById('user-posts').textContent = formatNumber(this.profile.post_count || 0);
        document.getElementById('user-followers').textContent = formatNumber(this.profile.followers_count || 0);
        document.getElementById('user-following').textContent = formatNumber(this.profile.following_count || 0);

        if (this.profile.created_at) {
            document.getElementById('user-joined').textContent = `加入于 ${new Date(this.profile.created_at).toLocaleDateString('zh-CN')}`;
        }

        // 更新关注按钮状态
        this.updateFollowButton();

        // 如果是自己，隐藏关注按钮和私信按钮
        if (currentUser && currentUser.id === this.userId) {
            const btn = document.getElementById('btn-follow');
            if (btn) btn.style.display = 'none';
            const dmBtn = document.getElementById('btn-dm');
            if (dmBtn) dmBtn.style.display = 'none';
        }

        // 更新tab可见性
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
            // 如果当前未关注，先检查用户是否允许被关注
            if (!this.isFollowing) {
                const allowFollow = await checkAllowFollow(this.userId);
                if (!allowFollow) {
                    showToast('该用户禁止被关注', 'error');
                    if (btn) btn.disabled = false;
                    return;
                }
            }

            const result = await toggleFollow(this.userId);
            // result 是数组
            if (Array.isArray(result) && result[0]) {
                this.isFollowing = result[0].is_following;
                this.updateFollowButton();

                // 更新粉丝数
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
            
            // 获取总数
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
                
                // 渲染分页
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

        // 检查是否允许查看
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
            
            // 获取总数
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
                
                // 渲染分页
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
    }
};
