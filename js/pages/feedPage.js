import { getPosts, createPost, toggleLike, getComments, createComment, deletePost, deleteComment } from '../api.js';
import { showToast, formatNumber, timeAgo, showConfirm, userBadgeHTML } from '../utils.js';
import { createIcons, icons } from 'lucide';
import { router } from '../router.js';

// ============================================
// 动态页面
// ============================================

export const feedPage = {
    posts: [],
    currentTag: '',
    offset: 0,
    limit: 20,
    hasMore: true,
    currentPostId: null,
    replyToCommentId: null,
    selectedTags: [],

    render(container) {
        this.attachEvents(container);
        this.loadPosts();
    },

    attachEvents(container) {
        this.bindEvents();
    },

    bindEvents() {
        // 发帖按钮
        const createBtn = document.getElementById('btn-create-post');
        if (createBtn) {
            createBtn.addEventListener('click', () => this.handleCreatePost());
        }

        // 字数统计
        const contentInput = document.getElementById('post-content');
        if (contentInput) {
            contentInput.addEventListener('input', () => {
                document.getElementById('char-count').textContent = contentInput.value.length;
            });
        }

        // 标签选择
        document.querySelectorAll('.post-tags-select .tag-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tag = btn.dataset.tag;
                if (this.selectedTags.includes(tag)) {
                    this.selectedTags = this.selectedTags.filter(t => t !== tag);
                    btn.classList.remove('active');
                } else if (this.selectedTags.length < 3) {
                    this.selectedTags.push(tag);
                    btn.classList.add('active');
                } else {
                    showToast('最多选择3个标签', 'error');
                }
            });
        });

        // 标签筛选
        document.querySelectorAll('.feed-filter-bar .filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.feed-filter-bar .filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTag = btn.dataset.tag;
                this.offset = 0;
                this.posts = [];
                this.loadPosts();
            });
        });

        // 加载更多
        const loadMoreBtn = document.getElementById('btn-load-more');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => this.loadPosts());
        }

        // 评论弹窗关闭
        const closeBtn = document.getElementById('comments-close');
        const overlay = document.getElementById('comments-overlay');
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeCommentsModal());
        if (overlay) overlay.addEventListener('click', () => this.closeCommentsModal());

        // 发送评论
        const submitCommentBtn = document.getElementById('btn-submit-comment');
        if (submitCommentBtn) {
            submitCommentBtn.addEventListener('click', () => this.handleCreateComment());
        }

        // 评论输入框回车发送
        const commentInput = document.getElementById('comment-input');
        if (commentInput) {
            commentInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleCreateComment();
                }
            });
        }
    },

    async loadPosts() {
        try {
            const result = await getPosts(this.limit, this.offset, this.currentTag);
            this.posts = [...this.posts, ...result];
            this.hasMore = result.length === this.limit;
            this.offset += result.length;

            this.renderPosts();
            createIcons({ icons });

            // 显示/隐藏加载更多按钮
            const loadMore = document.getElementById('load-more');
            if (loadMore) {
                loadMore.style.display = this.hasMore ? 'block' : 'none';
            }
        } catch (e) {
            console.error('加载帖子失败:', e);
            showToast('加载失败，请刷新重试', 'error');
        }
    },

    renderPosts() {
        const list = document.getElementById('feed-list');
        if (!list) return;

        if (this.posts.length === 0) {
            list.innerHTML = `
                <div class="feed-empty">
                    <i data-lucide="message-square" style="width:48;height:48;color:var(--text-muted);"></i>
                    <p>暂无动态，快来发布第一条吧！</p>
                </div>
            `;
            createIcons({ icons });
            return;
        }

        list.innerHTML = this.posts.map(post => this.renderPostItem(post)).join('');
        this.bindPostEvents();
    },

    renderPostItem(post) {
        const postId = post?.post_id;
        if (!post || postId === null || postId === undefined || Number.isNaN(postId)) {
            return '';
        }

        const tagsHtml = post.tags && post.tags.length > 0 
            ? post.tags.map(tag => `<span class="post-tag">${tag}</span>`).join('')
            : '';

        return `
            <div class="post-card" data-post-id="${postId}">
                <div class="post-header">
                    <div class="post-author" data-user-id="${post.user_id}" style="cursor:pointer;">
                        <div class="author-avatar">
                            ${post.user_avatar 
                                ? `<img src="${post.user_avatar}" alt="avatar" />`
                                : `<i data-lucide="user" style="width:24;height:24;"></i>`
                            }
                        </div>
                        <div class="author-info">
                            <span class="author-name">${post.user_nickname || '匿名用户'}${userBadgeHTML(post)}</span>
                            <span class="post-time">${timeAgo(post.created_at)}</span>
                        </div>
                    </div>
                    <button class="btn-delete-post" data-post-id="${postId}" title="删除">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
                <div class="post-content">${this.escapeHtml(post.content)}</div>
                ${tagsHtml ? `<div class="post-tags">${tagsHtml}</div>` : ''}
                <div class="post-actions">
                    <button class="action-btn like-btn ${post.is_liked ? 'liked' : ''}" data-post-id="${postId}">
                        <i data-lucide="heart"></i>
                        <span class="like-count">${formatNumber(post.likes_count)}</span>
                    </button>
                    <button class="action-btn comment-btn" data-post-id="${postId}">
                        <i data-lucide="message-circle"></i>
                        <span>${formatNumber(post.comments_count)}</span>
                    </button>
                </div>
            </div>
        `;
    },

    bindPostEvents() {
        // 点击帖子卡片进入详情页
        document.querySelectorAll('.post-card').forEach(card => {
            card.addEventListener('click', (e) => {
                // 如果点击的是按钮，不跳转
                if (e.target.closest('button')) return;
                const postId = card.dataset.postId;
                if (postId) {
                    router.navigate(`post/${postId}`);
                }
            });
        });

        // 点击用户头像/昵称进入用户主页
        document.querySelectorAll('.post-author[data-user-id]').forEach(author => {
            author.addEventListener('click', (e) => {
                e.stopPropagation();
                const userId = author.dataset.userId;
                if (userId) {
                    router.navigate(`user/${userId}`);
                }
            });
        });

        // 点赞
        document.querySelectorAll('.like-btn').forEach(btn => {
            const dataPostId = btn.dataset.postId;
            const postId = parseInt(dataPostId);
            if (!dataPostId || Number.isNaN(postId)) {
                return;
            }
            btn.addEventListener('click', async () => {
                await this.handleToggleLike('post', postId, btn);
            });
        });

        // 评论
        document.querySelectorAll('.comment-btn').forEach(btn => {
            const dataPostId = btn.dataset.postId;
            const postId = parseInt(dataPostId);
            if (!dataPostId || Number.isNaN(postId)) {
                return;
            }
            btn.addEventListener('click', () => {
                this.openCommentsModal(postId);
            });
        });

        // 删除帖子
        document.querySelectorAll('.btn-delete-post').forEach(btn => {
            const postId = parseInt(btn.dataset.postId);
            if (!btn.dataset.postId || Number.isNaN(postId)) {
                return;
            }
            btn.addEventListener('click', async () => {
                const confirmed = await showConfirm('确定删除这条动态吗？');
                if (confirmed) {
                    await this.handleDeletePost(postId);
                }
            });
        });
    },

    async handleCreatePost() {
        const content = document.getElementById('post-content').value.trim();
        if (!content) {
            showToast('请输入内容', 'error');
            return;
        }

        const btn = document.getElementById('btn-create-post');
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> 发布中...';

        try {
            const result = await createPost(content, this.selectedTags);
            if (result.success) {
                showToast('发布成功！', 'success');
                document.getElementById('post-content').value = '';
                document.getElementById('char-count').textContent = '0';
                this.selectedTags = [];
                document.querySelectorAll('.post-tags-select .tag-btn').forEach(b => b.classList.remove('active'));
                this.offset = 0;
                this.posts = [];
                this.loadPosts();
            } else {
                showToast(result.message || '发布失败', 'error');
            }
        } catch (e) {
            showToast('发布失败，请稍后重试', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="send"></i> 发布';
            createIcons({ icons });
        }
    },

    async handleToggleLike(type, id, btn) {
        try {
            const result = await toggleLike(type, id);
            if (result.success) {
                const countEl = btn.querySelector('.like-count') || btn.querySelector('span');
                const post = this.posts.find(p => p.post_id == id);
                
                if (result.action === 'liked') {
                    btn.classList.add('liked');
                    if (post) post.likes_count++;
                    if (countEl) countEl.textContent = formatNumber(parseInt(countEl.textContent) + 1);
                } else {
                    btn.classList.remove('liked');
                    if (post) post.likes_count--;
                    if (countEl) countEl.textContent = formatNumber(parseInt(countEl.textContent) - 1);
                }
            }
        } catch (e) {
            showToast('操作失败', 'error');
        }
    },

    async handleDeletePost(postId) {
        try {
            const result = await deletePost(postId);
            if (result.success) {
                showToast('删除成功', 'success');
                this.posts = this.posts.filter(p => p.post_id != postId);
                this.renderPosts();
                createIcons({ icons });
            } else {
                showToast(result.message || '删除失败', 'error');
            }
        } catch (e) {
            showToast('删除失败', 'error');
        }
    },

    async openCommentsModal(postId) {
        this.currentPostId = postId;
        this.replyToCommentId = null;

        const modal = document.getElementById('comments-modal');
        if (modal) modal.style.display = 'flex';

        const commentInput = document.getElementById('comment-input');
        if (commentInput) {
            commentInput.placeholder = '写下你的评论...';
            commentInput.value = '';
        }

        await this.loadComments(postId);
        createIcons({ icons });
    },

    closeCommentsModal() {
        const modal = document.getElementById('comments-modal');
        if (modal) modal.style.display = 'none';
        this.currentPostId = null;
        this.replyToCommentId = null;
    },

    async loadComments(postId) {
        try {
            const comments = await getComments(postId);
            this.renderComments(comments);
            this.bindCommentEvents();
            createIcons({ icons });
        } catch (e) {
            console.error('加载评论失败:', e);
        }
    },

    renderComments(comments) {
        const list = document.getElementById('comments-list');
        if (!list) return;

        if (!comments || comments.length === 0) {
            list.innerHTML = `
                <div class="comments-empty">
                    <p>暂无评论，快来发表第一条吧！</p>
                </div>
            `;
            return;
        }

        // 构建嵌套结构
        const rootComments = comments.filter(c => c.parent_id === null);
        list.innerHTML = rootComments.map(comment => this.renderCommentTree(comment, comments)).join('');
    },

    renderCommentTree(comment, allComments, depth = 0) {
        const children = allComments.filter(c => c.parent_id === comment.id);
        const indentStyle = depth > 0 ? `margin-left: ${depth * 24}px;` : '';

        return `
            <div class="comment-item" data-comment-id="${comment.id}" style="${indentStyle}">
                <div class="comment-header">
                    <div class="comment-author">
                        <div class="author-avatar-sm clickable-avatar" data-user-id="${comment.user_id}">
                            ${comment.user_avatar 
                                ? `<img src="${comment.user_avatar}" alt="avatar" />`
                                : `<i data-lucide="user" style="width:16;height:16;"></i>`
                            }
                        </div>
                        <span class="author-name clickable-name" data-user-id="${comment.user_id}">${comment.user_nickname || '匿名'}${userBadgeHTML(comment)}</span>
                        <span class="comment-time">${timeAgo(comment.created_at)}</span>
                    </div>
                    <div class="comment-actions">
                        <button class="action-btn-sm like-comment-btn ${comment.is_liked ? 'liked' : ''}" data-comment-id="${comment.id}">
                            <i data-lucide="heart"></i>
                            <span>${formatNumber(comment.likes_count)}</span>
                        </button>
                        <button class="action-btn-sm reply-btn" data-comment-id="${comment.id}" data-author="${comment.user_nickname}">
                            <i data-lucide="reply"></i>
                            回复
                        </button>
                        <button class="action-btn-sm delete-comment-btn" data-comment-id="${comment.id}">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </div>
                <div class="comment-content">${this.escapeHtml(comment.content)}</div>
                ${children.length > 0 ? children.map(c => this.renderCommentTree(c, allComments, depth + 1)).join('') : ''}
            </div>
        `;
    },

    bindCommentEvents() {
        // 点击评论作者头像/昵称进入主页
        document.querySelectorAll('.clickable-avatar, .clickable-name').forEach(el => {
            el.addEventListener('click', () => {
                const userId = el.dataset.userId;
                if (userId) {
                    router.navigate(`user/${userId}`);
                }
            });
        });

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
    },

    async handleToggleCommentLike(commentId, btn) {
        try {
            const result = await toggleLike('comment', commentId);
            if (result.success) {
                const countEl = btn.querySelector('span');
                if (result.action === 'liked') {
                    btn.classList.add('liked');
                    if (countEl) countEl.textContent = formatNumber(parseInt(countEl.textContent) + 1);
                } else {
                    btn.classList.remove('liked');
                    if (countEl) countEl.textContent = formatNumber(parseInt(countEl.textContent) - 1);
                }
            }
        } catch (e) {
            showToast('操作失败', 'error');
        }
    },

    async handleCreateComment() {
        const input = document.getElementById('comment-input');
        const content = input.value.trim();
        if (!content) {
            showToast('请输入评论内容', 'error');
            return;
        }

        if (this.currentPostId === null || this.currentPostId === undefined || Number.isNaN(this.currentPostId)) {
            showToast('请先选择一个帖子', 'error');
            return;
        }

        const btn = document.getElementById('btn-submit-comment');
        btn.disabled = true;

        try {
            const result = await createComment(this.currentPostId, content, this.replyToCommentId);
            if (result.success) {
                showToast('评论成功', 'success');
                input.value = '';
                input.placeholder = '写下你的评论...';
                this.replyToCommentId = null;
                await this.loadComments(this.currentPostId);
                
                // 更新帖子评论数
                const post = this.posts.find(p => p.post_id === this.currentPostId);
                if (post) {
                    post.comments_count++;
                    this.renderPosts();
                    createIcons({ icons });
                }
            } else {
                showToast(result.message || '评论失败', 'error');
            }
        } catch (e) {
            showToast('评论失败', 'error');
        } finally {
            btn.disabled = false;
        }
    },

    async handleDeleteComment(commentId) {
        if (commentId === null || commentId === undefined || Number.isNaN(commentId)) {
            console.error('handleDeleteComment: commentId 无效', commentId);
            showToast('操作失败，请刷新重试', 'error');
            return;
        }
        try {
            const result = await deleteComment(commentId);
            if (result.success) {
                showToast('删除成功', 'success');
                await this.loadComments(this.currentPostId);
                
                // 更新帖子评论数
                const post = this.posts.find(p => p.post_id == this.currentPostId);
                if (post) {
                    post.comments_count--;
                    this.renderPosts();
                    createIcons({ icons });
                }
            } else {
                showToast(result.message || '删除失败', 'error');
            }
        } catch (e) {
            showToast('删除失败', 'error');
        }
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};