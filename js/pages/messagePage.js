import { getMails, markMailRead, getDmConversations, getDmHistory, sendPrivateMessage, markDmRead, getUnreadDmCount } from '../api.js';
import { createIcons, icons } from 'lucide';
import { showToast, renderPagination, bindPagination } from '../utils.js';
import { currentUser } from '../supabaseClient.js';
import { router } from '../router.js';
import { updateMailBadge } from '../auth.js';

export const messagePage = {
    mails: [],
    dmConversations: [],
    dmHistory: [],
    currentTab: 'system',
    page: 1,
    limit: 20,
    totalCount: 0,
    currentChatUser: null,

    render(container) {
        this.bindTabEvents();
        this.loadBadges();
        // 检查是否有待处理的私信（从用户主页跳转过来）
        const pendingDm = sessionStorage.getItem('pendingDm');
        if (pendingDm) {
            try {
                const dm = JSON.parse(pendingDm);
                sessionStorage.removeItem('pendingDm');
                // 切换到私信tab并打开对话
                this.currentTab = 'dm';
                this.currentChatUser = null;
                document.querySelectorAll('.message-tab').forEach(tab => {
                    tab.classList.toggle('active', tab.dataset.tab === 'dm');
                });
                const systemContent = document.getElementById('system-messages');
                const dmContainer = document.getElementById('dm-container');
                if (systemContent) systemContent.style.display = 'none';
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
        const dmContainer = document.getElementById('dm-container');
        if (systemContent) systemContent.style.display = 'block';
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

            // 获取未读私信数量
            const dmUnreadRaw = await getUnreadDmCount().catch(() => 0);
            const dmUnread = parseInt(dmUnreadRaw) || 0;
            console.log('未读私信数量:', dmUnreadRaw, '解析后:', dmUnread);
            const dmBadge = document.getElementById('dm-badge');
            console.log('dmBadge元素:', dmBadge);
            if (dmBadge) {
                dmBadge.textContent = dmUnread > 99 ? '99+' : dmUnread;
                dmBadge.style.display = dmUnread > 0 ? 'flex' : 'none';
                console.log('私信红点显示:', dmBadge.style.display, '内容:', dmBadge.textContent);
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
        const dmContainer = document.getElementById('dm-container');
        const chatEmpty = document.getElementById('chat-empty');
        const chatMain = document.getElementById('chat-main');

        if (tabName === 'system') {
            systemContent.style.display = 'block';
            dmContainer.style.display = 'none';
            this.loadMails(1);
        } else {
            systemContent.style.display = 'none';
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
            
            return `
                <div class="dm-item animate-fade-in-up" data-user-id="${conv.user_id}" data-nickname="${conv.nickname || '无名旅者'}" style="animation-delay:${idx * 0.05}s">
                    <div class="dm-avatar">
                        <i data-lucide="user"></i>
                        ${followIcon}
                    </div>
                    <div class="dm-body">
                        <div class="dm-name">${conv.nickname || '无名旅者'} ${unreadBadge}</div>
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
        chatEmpty.style.display = 'none';
        chatMain.style.display = 'flex';

        // 高亮选中的会话
        document.querySelectorAll('.dm-item').forEach(item => {
            item.classList.toggle('active', item.dataset.userId === userId);
        });

        // 渲染聊天头部
        const chatHeader = document.getElementById('chat-header');
        chatHeader.innerHTML = `
            <div class="chat-user-info">
                <span class="chat-user-name">${nickname}</span>
            </div>
            <button class="chat-user-link" data-user-id="${userId}">
                <i data-lucide="external-link"></i>
                查看主页
            </button>
        `;

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