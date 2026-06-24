import { getPost, getComments, createComment, toggleLike, deletePost, deleteComment } from '../api.js';
import { showToast, formatNumber, timeAgo, escapeHtml, showConfirm, userBadgeHTML } from '../utils.js';
import { createIcons, icons } from 'lucide';
import { router } from '../router.js';
import { currentUser } from '../supabaseClient.js';

export const postPage = {
    postId: null,
    post: null,
    comments: [],
    replyToCommentId: null,

    render(container) {
        const hash = window.location.hash;
        const parts = hash.split('/');
        this.postId = parts[1] ? parseInt(parts[1]) : null;

        if (!this.postId || isNaN(this.postId)) {
            showToast('帖子不存在', 'error');
            router.navigate('feed');
            return;
        }

        this.attachEvents(container);
        this.loadPost();
    },

    attachEvents(container) {
        // 返回按钮
        const backBtn = container.querySelector('#btn-back');
        if (backBtn) {
            backBtn.addEventListener('click', () => history.back());
        }

        // 点击作者头像/名称进入主页
        container.querySelectorAll('.post-author .clickable-avatar, .post-author .clickable-name').forEach(el => {
            el.addEventListener('click', () => {
                const userId = el.dataset.userId;
                if (userId) {
                    router.navigate(`user/${userId}`);
                }
            });
        });

        // 点赞
        const likeBtn = container.querySelector('#btn-like');
        if (likeBtn) {
            likeBtn.addEventListener('click', () => this.handleToggleLike());
        }

        // 发送评论
        const submitBtn = container.querySelector('#btn-submit-comment');
        if (submitBtn) {
            submitBtn.addEventListener('click', () => this.handleCreateComment());
        }

        // 评论输入框回车发送
        const commentInput = container.querySelector('#comment-input');
        if (commentInput) {
            commentInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleCreateComment();
                }
            });
        }

        // 删除帖子
        const deleteBtn = container.querySelector('#btn-delete-post');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.handleDeletePost());
        }
    },

    async loadPost() {
        const container = document.getElementById('post-detail');
        if (!container) return;

        container.innerHTML = '<div class="skeleton" style="height:200px;margin-bottom:16px;"></div>';

        try {
            const [postResult, commentsResult] = await Promise.all([
                getPost(this.postId),
                getComments(this.postId)
            ]);

            const postData = Array.isArray(postResult) ? postResult[0] : postResult;
            if (!postData) {
                showToast('帖子不存在', 'error');
                router.navigate('feed');
                return;
            }

            this.post = postData;
            this.comments = Array.isArray(commentsResult) ? commentsResult : [];

            this.renderPost();
            this.renderComments();
            this.bindDynamicEvents();
            createIcons({ icons });
        } catch (e) {
            console.error('加载帖子失败:', e);
            showToast('加载失败', 'error');
            container.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    },

    renderPost() {
        const container = document.getElementById('post-detail');
        if (!container || !this.post) return;

        const { content, user_id, user_nickname, user_avatar, user_is_admin, user_is_bot, tags, likes_count, comments_count, created_at, is_liked } = this.post;

        // 判断是否是自己的帖子
        const isOwner = currentUser && currentUser.id === user_id;

        let tagsHtml = '';
        if (tags && tags.length > 0) {
            tagsHtml = `<div class="post-tags">${tags.map(tag => `<span class="post-tag">${escapeHtml(tag)}</span>`).join('')}</div>`;
        }

        container.innerHTML = `
            <div class="post-detail-card card animate-fade-in-up">
                <div class="post-detail-header">
                    <button class="back-btn" id="btn-back">
                        <i data-lucide="arrow-left"></i>
                        返回
                    </button>
                    ${isOwner ? `
                        <button class="btn-delete-post" id="btn-delete-post">删除</button>
                    ` : ''}
                </div>
                
                <div class="post-author" data-user-id="${user_id}">
                    <div class="author-avatar clickable-avatar" data-user-id="${user_id}">
                        ${user_avatar 
                            ? `<img src="${escapeHtml(user_avatar)}" alt="avatar" />`
                            : `<div class="avatar-placeholder">${(user_nickname || '匿').charAt(0).toUpperCase()}</div>`
                        }
                    </div>
                    <div class="author-info">
                        <span class="author-name clickable-name" data-user-id="${user_id}">${escapeHtml(user_nickname || '匿名用户')}${userBadgeHTML({is_admin: user_is_admin, is_bot: user_is_bot})}</span>
                        <span class="post-time">${timeAgo(created_at)}</span>
                    </div>
                </div>
                
                <div class="post-content">${escapeHtml(content)}</div>
                ${tagsHtml}
                
                <div class="post-actions">
                    <button class="action-btn like-btn ${is_liked ? 'liked' : ''}" id="btn-like">
                        <i data-lucide="heart"></i>
                        <span class="like-count">${formatNumber(likes_count || 0)}</span>
                    </button>
                    <div class="action-btn" id="comment-count-display">
                        <i data-lucide="message-circle"></i>
                        <span>${formatNumber(comments_count || 0)}</span>
                    </div>
                </div>
            </div>
            
            <div class="comments-section card animate-fade-in-up" style="animation-delay:0.1s;">
                <h3>评论</h3>
                <div class="comment-create">
                    <textarea id="comment-input" placeholder="写下你的评论..." rows="2"></textarea>
                    <button class="btn btn-primary" id="btn-submit-comment">发送</button>
                </div>
                <div class="comments-list" id="comments-list"></div>
            </div>
        `;

        // 重新绑定事件
        this.attachEvents(document.getElementById('post-detail'));
    },

    bindDynamicEvents() {
        // 评论点赞
        document.querySelectorAll('.like-comment-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const commentId = parseInt(btn.dataset.commentId);
                await this.handleToggleCommentLike(commentId, btn);
            });
        });

        // 回复评论
        document.querySelectorAll('.reply-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const commentId = parseInt(btn.dataset.commentId);
                const author = btn.dataset.author;
                this.replyToCommentId = commentId;
                const input = document.getElementById('comment-input');
                if (input) {
                    input.placeholder = `回复 ${author}...`;
                    input.focus();
                }
            });
        });

        // 删除评论
        document.querySelectorAll('.delete-comment-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const commentId = parseInt(btn.dataset.commentId);
                const confirmed = await showConfirm('确定删除这条评论吗？');
                if (confirmed) {
                    await this.handleDeleteComment(commentId);
                }
            });
        });

        // 评论作者点击
        document.querySelectorAll('.comment-item[data-user-id]').forEach(item => {
            const author = item.querySelector('.comment-author');
            if (author) {
                author.addEventListener('click', () => {
                    const userId = item.dataset.userId;
                    if (userId) {
                        router.navigate(`user/${userId}`);
                    }
                });
            }
        });
    },

    renderComments() {
        const list = document.getElementById('comments-list');
        if (!list) return;

        if (this.comments.length === 0) {
            list.innerHTML = '<div class="comments-empty"><p>暂无评论，快来发表第一条吧！</p></div>';
            return;
        }

        // 构建嵌套结构
        const rootComments = this.comments.filter(c => c.parent_id === null);
        list.innerHTML = rootComments.map(comment => this.renderCommentTree(comment, this.comments)).join('');
    },

    renderCommentTree(comment, allComments, depth = 0) {
        const children = allComments.filter(c => c.parent_id === comment.id);
        const indentStyle = depth > 0 ? `margin-left: ${depth * 24}px;` : '';
        const isOwner = currentUser && currentUser.id === comment.user_id;

        return `
            <div class="comment-item" data-comment-id="${comment.id}" data-user-id="${comment.user_id}" style="${indentStyle}">
                <div class="comment-header">
                    <div class="comment-author">
                        <div class="author-avatar-sm clickable-avatar">
                            ${comment.user_avatar 
                                ? `<img src="${escapeHtml(comment.user_avatar)}" alt="avatar" />`
                                : `<i data-lucide="user" style="width:16;height:16;"></i>`
                            }
                        </div>
                        <span class="author-name clickable-name" data-user-id="${comment.user_id}">${escapeHtml(comment.user_nickname || '匿名')}${userBadgeHTML(comment)}</span>
                        <span class="comment-time">${timeAgo(comment.created_at)}</span>
                    </div>
                    <div class="comment-actions">
                        <button class="action-btn-sm like-comment-btn ${comment.is_liked ? 'liked' : ''}" data-comment-id="${comment.id}">
                            <i data-lucide="heart"></i>
                            <span>${formatNumber(comment.likes_count || 0)}</span>
                        </button>
                        <button class="action-btn-sm reply-btn" data-comment-id="${comment.id}" data-author="${comment.user_nickname}">
                            <i data-lucide="reply"></i>
                            回复
                        </button>
                        ${isOwner ? `
                            <button class="action-btn-sm delete-comment-btn" data-comment-id="${comment.id}">
                                <i data-lucide="trash-2"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
                <div class="comment-content">${escapeHtml(comment.content)}</div>
                ${children.length > 0 ? children.map(c => this.renderCommentTree(c, allComments, depth + 1)).join('') : ''}
            </div>
        `;
    },

    async handleToggleLike() {
        if (!currentUser) {
            showToast('请先登录', 'error');
            return;
        }

        try {
            const result = await toggleLike('post', this.postId);
            if (result.success) {
                const btn = document.getElementById('btn-like');
                const countEl = btn?.querySelector('.like-count');
                if (result.action === 'liked') {
                    btn?.classList.add('liked');
                    if (countEl) countEl.textContent = formatNumber((parseInt(countEl.textContent) || 0) + 1);
                } else {
                    btn?.classList.remove('liked');
                    if (countEl) countEl.textContent = formatNumber(Math.max(0, (parseInt(countEl.textContent) || 0) - 1));
                }
                this.post.is_liked = result.action === 'liked';
            }
        } catch (e) {
            showToast('操作失败', 'error');
        }
    },

    async handleToggleCommentLike(commentId, btn) {
        if (!currentUser) {
            showToast('请先登录', 'error');
            return;
        }

        try {
            const result = await toggleLike('comment', commentId);
            if (result.success) {
                const countEl = btn.querySelector('span');
                if (result.action === 'liked') {
                    btn.classList.add('liked');
                    if (countEl) countEl.textContent = formatNumber((parseInt(countEl.textContent) || 0) + 1);
                } else {
                    btn.classList.remove('liked');
                    if (countEl) countEl.textContent = formatNumber(Math.max(0, (parseInt(countEl.textContent) || 0) - 1));
                }
            }
        } catch (e) {
            showToast('操作失败', 'error');
        }
    },

    async handleCreateComment() {
        if (!currentUser) {
            showToast('请先登录', 'error');
            return;
        }

        const input = document.getElementById('comment-input');
        const content = input?.value.trim();

        if (!content) {
            showToast('请输入评论内容', 'error');
            return;
        }

        try {
            await createComment(this.postId, content, this.replyToCommentId);
            showToast('评论成功', 'success');
            input.value = '';
            this.replyToCommentId = null;
            input.placeholder = '写下你的评论...';
            
            // 重新加载评论
            const result = await getComments(this.postId);
            this.comments = Array.isArray(result) ? result : [];
            
            // 更新评论数
            const commentCountEl = document.querySelector('#comment-count-display span');
            if (commentCountEl && this.post) {
                this.post.comments_count = (this.post.comments_count || 0) + 1;
                commentCountEl.textContent = formatNumber(this.post.comments_count);
            }
            
            this.renderComments();
            this.bindDynamicEvents();
            createIcons({ icons });
        } catch (e) {
            console.error('评论失败:', e);
            showToast('评论失败', 'error');
        }
    },

    async handleDeleteComment(commentId) {
        try {
            await deleteComment(commentId);
            showToast('删除成功', 'success');
            
            // 重新加载评论
            const result = await getComments(this.postId);
            this.comments = Array.isArray(result) ? result : [];
            
            // 更新评论数
            const commentCountEl = document.querySelector('#comment-count-display span');
            if (commentCountEl && this.post) {
                this.post.comments_count = Math.max(0, (this.post.comments_count || 0) - 1);
                commentCountEl.textContent = formatNumber(this.post.comments_count);
            }
            
            this.renderComments();
            this.bindDynamicEvents();
            createIcons({ icons });
        } catch (e) {
            showToast('删除失败', 'error');
        }
    },

    async handleDeletePost() {
        const confirmed = await showConfirm('确定删除这条动态吗？');
        if (!confirmed) return;

        try {
            await deletePost(this.postId);
            showToast('删除成功', 'success');
            router.navigate('feed');
        } catch (e) {
            showToast('删除失败', 'error');
        }
    }
};
