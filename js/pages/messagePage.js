import { getMails, markMailRead, getDmConversations, getDmHistory, sendPrivateMessage, markDmRead, getUnreadDmCount, getReplyNotifications, markNotificationRead, markAllNotificationsRead, getUnreadNotificationCount } from '../api.js';
import { createIcons, icons } from 'lucide';
import { showToast, renderPagination, bindPagination, timeAgo } from '../utils.js';
import { currentUser } from '../supabaseClient.js';
import { router } from '../router.js';
import { updateMailBadge } from '../auth.js';

export const messagePage = {
    mails: [],
    dmConversations: [],
    dmHistory: [],
    notifications: [],
    currentTab: 'system',
    page: 1,
    limit: 20,
    totalCount: 0,
    currentChatUser: null,

    render(container) {
        this.bindTabEvents();
        this.loadBadges();
        // 检查是否有待处理的回复通知（从通知按钮跳转过来）
        const pendingNotificationTab = sessionStorage.getItem('pendingNotificationTab');
        if (pendingNotificationTab) {
            sessionStorage.removeItem('pendingNotificationTab');
            this.currentTab = 'notification';
            this.currentChatUser = null;
            document.querySelectorAll('.message-tab').forEach(tab => {
                tab.classList.toggle('active', tab.dataset.tab === 'notification');
            });
            const systemContent = document.getElementById('system-messages');
            const notificationContent = document.getElementById('notification-list');
            const dmContainer = document.getElementById('dm-container');
            if (systemContent) systemContent.style.display = 'none';
            if (notificationContent) notificationContent.style.display = 'block';
            if (dmContainer) dmContainer.style.display = 'none';
            this.loadNotifications(1);
            return;
        }
        // 检查是否有待处理的私信（从用户主页跳转过来）
        const pendingDm = sessionStorage.getItem('pendingDm');
        if (pendingDm) {
            try {
                const dm = JSON.parse(pendingDm);
                sessionStorage.removeItem('pendingDm');
                this.currentTab = 'dm';
                this.currentChatUser = null;
                document.querySelectorAll('.message-tab').forEach(tab => {
                    tab.classList.toggle('active', tab.dataset.tab === 'dm');
                });
                const systemContent = document.getElementById('system-messages');
                const notificationContent = document.getElementById('notification-list');
                const dmContainer = document.getElementById('dm-container');
                if (systemContent) systemContent.style.display = 'none';
                if (notificationContent) notificationContent.style.display = 'none';
                if (dmContainer) dmContainer.style.display = 'flex';
                this.loadDmConversations().then(() => {
                    this.openChat(dm.userId, dm.nickname);
                });
                return;
            } catch (e) {}
        }
        // 重置到系统消息标签
        this.currentTab = 'system';
        this.currentChatUser = null;
        const systemContent = document.getElementById('system-messages');
        const notificationContent = document.getElementById('notification-list');
        const dmContainer = document.getElementById('dm-container');
        if (systemContent) systemContent.style.display = 'block';
        if (notificationContent) notificationContent.style.display = 'none';
        if (dmContainer) dmContainer.style.display = 'none';
        document.querySelectorAll('.message-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === 'system');
        });
        this.loadMails(1);
    },

    bindTabEvents() {
        const tabs = document.querySelectorAll('.message-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                this.switchTab(tabName);
            });
        });
    },

    async loadBadges() {
        if (!currentUser) return;
        try {
            // 获取未读系统消息数量
            const mails = await getMails(1, 100);
            const systemUnread = mails.filter(m => !m.is_read).length;
            const systemBadge = document.getElementById('system-badge');
            if (systemBadge) {
                systemBadge.textContent = systemUnread > 99 ? '99+' : systemUnread;
                systemBadge.style.display = systemUnread > 0 ? 'flex' : 'none';
            }

            // 获取未读回复通知数量
            const notificationUnreadRaw = await getUnreadNotificationCount().catch(() => 0);
            const notificationUnread = parseInt(notificationUnreadRaw) || 0;
            const notificationBadge = document.getElementById('notification-badge');
            if (notificationBadge) {
                notificationBadge.textContent = notificationUnread > 99 ? '99+' : notificationUnread;
                notificationBadge.style.display = notificationUnread > 0 ? 'flex' : 'none';
            }

            // 获取未读私信数量
            const dmUnreadRaw = await getUnreadDmCount().catch(() => 0);
            const dmUnread = parseInt(dmUnreadRaw) || 0;
            const dmBadge = document.getElementById('dm-badge');
            if (dmBadge) {
                dmBadge.textContent = dmUnread > 99 ? '99+' : dmUnread;
                dmBadge.style.display = dmUnread > 0 ? 'flex' : 'none';
            }
        } catch (e) {
            console.error('加载红点失败:', e);
        }
    },

    switchTab(tabName) {
        this.currentTab = tabName;
        this.page = 1;
        this.currentChatUser = null;

        // 更新标签样式
        document.querySelectorAll('.message-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // 显示对应内容
        const systemContent = document.getElementById('system-messages');
        const notificationContent = document.getElementById('notification-list');
        const dmContainer = document.getElementById('dm-container');
        const chatEmpty = document.getElementById('chat-empty');
        const chatMain = document.getElementById('chat-main');

        if (tabName === 'system') {
            systemContent.style.display = 'block';
            notificationContent.style.display = 'none';
            dmContainer.style.display = 'none';
            this.loadMails(1);
        } else if (tabName === 'notification') {
            systemContent.style.display = 'none';
            notificationContent.style.display = 'block';
            dmContainer.style.display = 'none';
            this.loadNotifications(1);
        } else {
            systemContent.style.display = 'none';
            notificationContent.style.display = 'none';
            dmContainer.style.display = 'flex';
            chatEmpty.style.display = 'flex';
            chatMain.style.display = 'none';
            this.loadDmConversations();
        }
    },

    async loadMessages() {
        // 默认加载系统消息
        this.loadMails(1);
    },

    async loadMails(page) {
        this.page = page;
        const list = document.getElementById('system-messages');
        try {
            const data = await getMails(page, this.limit);
            this.mails = data || [];
            if (data.length > 0) {
                this.totalCount = parseInt(data[0].total_count) || 0;
            }
            this.renderMailList();
        } catch (e) {
            if (list) {
                list.innerHTML = `
                    <div class="empty-state" style="padding:40px 0;">
                        <p>加载失败</p>
                    </div>
                `;
            }
        }
    },

    renderMailList() {
        const list = document.getElementById('system-messages');
        if (!list) return;
        if (this.mails.length === 0) {
            list.innerHTML = `
                <div class="empty-state" style="padding:40px 0;">
                    <i data-lucide="inbox"></i>
                    <p>暂无系统消息</p>
                </div>
            `;
            createIcons({ icons });
            return;
        }

        let html = this.mails.map((mail, idx) => {
            const date = new Date(mail.created_at).toLocaleString('zh-CN');
            return `
                <div class="mail-item ${mail.is_read ? 'read' : 'unread'} animate-fade-in-up" data-mail-id="${mail.mail_id}" style="animation-delay:${idx * 0.05}s">
                    <div class="mail-dot"></div>
                    <div class="mail-body">
                        <div class="mail-title">${mail.title}</div>
                        <div class="mail-content">${mail.content}</div>
                        <div class="mail-date">${date}</div>
                    </div>
                </div>
            `;
        }).join('');

        html += renderPagination(this.page, this.totalCount, this.limit);

        list.innerHTML = html;

        list.querySelectorAll('.mail-item').forEach(item => {
            item.addEventListener('click', async () => {
                const mailId = parseInt(item.dataset.mailId);
                const mail = this.mails.find(m => m.mail_id === mailId);
                if (!mail) return;

                item.classList.remove('unread');
                item.classList.add('read');

                if (!mail.is_read) {
                    try {
                        await markMailRead(mailId);
                        mail.is_read = true;
                        // 更新红点
                        this.loadBadges();
                        updateMailBadge();
                    } catch (e) {}
                }
            });
        });

        bindPagination(list, (page) => this.loadMails(page));
        createIcons({ icons });
    },

    async loadNotifications(page) {
        this.page = page;
        const list = document.getElementById('notification-list');
        try {
            console.log('加载回复通知:', { page, limit: this.limit });
            const data = await getReplyNotifications(page, this.limit);
            console.log('回复通知数据:', data);
            this.notifications = data || [];
            if (data && data.length > 0) {
                this.totalCount = parseInt(data[0].total_count) || 0;
            } else {
                this.totalCount = 0;
            }
            this.renderNotificationList();
        } catch (e) {
            console.error('加载回复通知失败:', e);
            if (list) {
                list.innerHTML = `
                    <div class="empty-state" style="padding:40px 0;">
                        <p>加载失败</p>
                        <p style="font-size:0.8rem;color:var(--ink-faded);margin-top:8px;">${e.message || '未知错误'}</p>
                    </div>
                `;
            }
        }
    },

    renderNotificationList() {
        const list = document.getElementById('notification-list');
        if (!list) return;
        if (this.notifications.length === 0) {
            list.innerHTML = `
                <div class="empty-state" style="padding:40px 0;">
                    <i data-lucide="inbox"></i>
                    <p>暂无回复通知</p>
                </div>
            `;
            createIcons({ icons });
            return;
        }

        let html = this.notifications.map((n, idx) => {
            const date = new Date(n.created_at).toLocaleString('zh-CN');
            const avatarHtml = n.reply_author_avatar ?
                `<img src="${n.reply_author_avatar}" alt="${n.reply_author_name}" class="notification-avatar-img" />` :
                `<i data-lucide="user"></i>`;
            const adminBadge = n.reply_author_is_admin ? '<span class="badge admin-badge">管理员</span>' : '';
            const botBadge = n.reply_author_is_bot ? '<span class="badge bot-badge">机器人</span>' : '';
            
            const isPostComment = n.notification_type === 'post_comment';
            const replyTarget = isPostComment ? n.post_title : (n.parent_content || n.post_title);
            
            return `
                <div class="notification-item ${n.is_read ? 'read' : 'unread'} animate-fade-in-up" data-id="${n.notification_id}" data-post-id="${n.post_id}" style="animation-delay:${idx * 0.05}s">
                    <div class="notification-avatar">
                        ${avatarHtml}
                    </div>
                    <div class="notification-body">
                        <div class="notification-author">
                            ${n.reply_author_name} ${adminBadge} ${botBadge}
                        </div>
                        <div class="notification-content-text">${this.escapeHtml(n.content)}</div>
                        <div class="notification-meta">
                            <span class="notification-post">回复了「${replyTarget}」</span>
                            <span class="notification-date">${date}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        html += renderPagination(this.page, this.totalCount, this.limit);

        list.innerHTML = html;

        list.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', async () => {
                const notificationId = parseInt(item.dataset.id);
                const postId = parseInt(item.dataset.postId);
                const notification = this.notifications.find(n => n.notification_id === notificationId);
                if (!notification) return;

                item.classList.remove('unread');
                item.classList.add('read');

                if (!notification.is_read) {
                    try {
                        await markNotificationRead(notificationId);
                        notification.is_read = true;
                        this.loadBadges();
                    } catch (e) {}
                }

                router.navigate(`post/${postId}`);
            });
        });

        bindPagination(list, (page) => this.loadNotifications(page));
        createIcons({ icons });
    },

    async loadDmConversations() {
        const list = document.getElementById('dm-list');
        try {
            const data = await getDmConversations(50, 0);
            this.dmConversations = data || [];
            this.renderDmList();
        } catch (e) {
            if (list) {
                list.innerHTML = `
                    <div class="empty-state" style="padding:40px 0;">
                        <p>加载失败</p>
                    </div>
                `;
            }
        }
    },

    renderDmList() {
        const list = document.getElementById('dm-list');
        if (!list) return;
        if (this.dmConversations.length === 0) {
            list.innerHTML = `
                <div class="empty-state" style="padding:40px 0;">
                    <i data-lucide="users"></i>
                    <p>暂无私信</p>
                    <p class="hint">关注的人会出现在这里</p>
                </div>
            `;
            createIcons({ icons });
            return;
        }

        let html = this.dmConversations.map((conv, idx) => {
            const time = conv.last_message_time ? new Date(conv.last_message_time).toLocaleString('zh-CN') : '';
            const unreadBadge = conv.unread_count > 0 ? `<span class="unread-badge">${conv.unread_count}</span>` : '';
            const followIcon = conv.is_following ? '<i data-lucide="heart" class="follow-icon"></i>' : '';
            
            let onlineStatus = '';
            if (conv.is_online) {
                onlineStatus = '<span class="online-status online">在线</span>';
            } else if (conv.last_active_at) {
                onlineStatus = `<span class="online-status offline">${timeAgo(conv.last_active_at)}</span>`;
            }
            
            return `
                <div class="dm-item animate-fade-in-up" data-user-id="${conv.user_id}" data-nickname="${conv.nickname || '无名旅者'}" style="animation-delay:${idx * 0.05}s">
                    <div class="dm-avatar">
                        <i data-lucide="user"></i>
                        ${followIcon}
                    </div>
                    <div class="dm-body">
                        <div class="dm-name">${conv.nickname || '无名旅者'} ${onlineStatus} ${unreadBadge}</div>
                        <div class="dm-preview">${conv.last_message || '开始聊天吧'}</div>
                        <div class="dm-time">${time}</div>
                    </div>
                </div>
            `;
        }).join('');

        list.innerHTML = html;

        list.querySelectorAll('.dm-item').forEach(item => {
            item.addEventListener('click', () => {
                const userId = item.dataset.userId;
                const nickname = item.dataset.nickname;
                this.openChat(userId, nickname);
            });
        });

        createIcons({ icons });
    },

    async openChat(userId, nickname) {
        this.currentChatUser = { id: userId, nickname };

        // 显示聊天主界面
        const chatEmpty = document.getElementById('chat-empty');
        const chatMain = document.getElementById('chat-main');
        const chatContainer = document.getElementById('chat-container');
        chatEmpty.style.display = 'none';
        chatMain.style.display = 'flex';

        // 移动端：聊天界面全屏显示
        const isMobile = window.innerWidth <= 600;
        if (isMobile && chatContainer) {
            chatContainer.classList.add('mobile-active');
            document.body.style.overflow = 'hidden';
        }

        // 高亮选中的会话
        document.querySelectorAll('.dm-item').forEach(item => {
            item.classList.toggle('active', item.dataset.userId === userId);
        });

        // 渲染聊天头部（移动端加返回按钮）
        const chatHeader = document.getElementById('chat-header');
        const backBtnHtml = isMobile ? `
            <button class="chat-back-btn" id="chat-back-btn">
                <i data-lucide="arrow-left"></i>
                返回
            </button>
        ` : '';
        chatHeader.innerHTML = backBtnHtml + `
            <div class="chat-user-info">
                <span class="chat-user-name">${nickname}</span>
            </div>
            <button class="chat-user-link" data-user-id="${userId}">
                <i data-lucide="external-link"></i>
                查看主页
            </button>
        `;

        // 绑定返回按钮（移动端）
        const backBtn = document.getElementById('chat-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                chatContainer.classList.remove('mobile-active');
                document.body.style.overflow = '';
                chatEmpty.style.display = 'flex';
                chatMain.style.display = 'none';
                this.currentChatUser = null;
                // 清除会话高亮
                document.querySelectorAll('.dm-item').forEach(item => {
                    item.classList.remove('active');
                });
            });
        }

        // 绑定查看用户主页
        chatHeader.querySelector('.chat-user-link').addEventListener('click', () => {
            router.navigate(`user/${userId}`);
        });

        // 加载聊天记录
        await this.loadChatHistory(userId);

        // 标记已读
        try {
            await markDmRead(userId);
            // 更新会话列表（清除红点）
            this.loadDmConversations();
            // 更新红点
            this.loadBadges();
            updateMailBadge();
        } catch (e) {}

        // 绑定发送消息
        const sendBtn = document.getElementById('send-dm-btn');
        const input = document.getElementById('dm-input');

        sendBtn.onclick = () => this.sendMessage(userId, input);
        input.onkeypress = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage(userId, input);
            }
        };

        createIcons({ icons });
    },

    async loadChatHistory(userId) {
        const chatMessages = document.getElementById('chat-messages');
        try {
            const data = await getDmHistory(userId, 50, 0);
            this.dmHistory = data || [];
            this.renderChatHistory();
        } catch (e) {
            chatMessages.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    },

    renderChatHistory() {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;

        if (this.dmHistory.length === 0) {
            chatMessages.innerHTML = `
                <div class="empty-state" style="padding:40px 0;">
                    <p>开始聊天吧</p>
                </div>
            `;
            return;
        }

        // 按时间正序显示（从旧到新）
        const sortedHistory = [...this.dmHistory].reverse();
        
        let html = sortedHistory.map(msg => {
            const isMine = msg.sender_id === currentUser.id;
            const time = new Date(msg.created_at).toLocaleString('zh-CN');
            
            return `
                <div class="chat-message ${isMine ? 'mine' : 'other'}">
                    <div class="msg-text">${this.escapeHtml(msg.content)}</div>
                    <div class="message-time">${time}</div>
                </div>
            `;
        }).join('');

        chatMessages.innerHTML = html;
        
        // 滚动到底部（使用 requestAnimationFrame 确保 DOM 已更新）
        requestAnimationFrame(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });
    },

    async sendMessage(userId, input) {
        const content = input.value.trim();
        if (!content) return;

        try {
            const result = await sendPrivateMessage(userId, content);
            if (result.success) {
                input.value = '';
                // 添加新消息到历史
                this.dmHistory.unshift({
                    message_id: result.message_id,
                    sender_id: currentUser.id,
                    sender_nickname: '我',
                    content: content,
                    is_read: false,
                    created_at: new Date().toISOString()
                });
                this.renderChatHistory();
                // 刷新会话列表（让列表顶部显示最新消息）
                this.loadDmConversations();
            } else {
                showToast(result.message || '发送失败', 'error');
            }
        } catch (e) {
            showToast('发送失败', 'error');
        }
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};