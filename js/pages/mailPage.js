import { getMails, markMailRead, markAllMailsRead } from '../api.js';
import { createIcons, icons } from 'lucide';
import { showToast, renderPagination, bindPagination } from '../utils.js';

export const mailPage = {
    mails: [],
    page: 1,
    limit: 20,
    totalCount: 0,

    render(container) {
        this.loadMails(1);
    },

    async loadMails(page) {
        this.page = page;
        const list = document.getElementById('mail-list');
        try {
            const data = await getMails(page, this.limit);
            this.mails = data || [];
            if (data.length > 0) {
                this.totalCount = parseInt(data[0].total_count) || 0;
            }
            this.renderList();

            const hasUnread = this.mails.some(m => !m.is_read);
            if (hasUnread) {
                try {
                    await markAllMailsRead();
                    this.mails.forEach(m => { m.is_read = true; });
                    this.renderList();
                } catch (e) {}
            }
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

    renderList() {
        const list = document.getElementById('mail-list');
        if (!list) return;
        if (this.mails.length === 0) {
            list.innerHTML = `
                <div class="empty-state" style="padding:40px 0;">
                    <i data-lucide="inbox"></i>
                    <p>暂无邮件</p>
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
                    } catch (e) {}
                }
            });
        });

        bindPagination(list, (page) => this.loadMails(page));
        createIcons({ icons });
    }
};
