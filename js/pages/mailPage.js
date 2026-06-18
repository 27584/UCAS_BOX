import { getMails, markMailRead } from '../api.js';
import { createIcons, icons } from 'lucide';
import { showToast } from '../utils.js';

export const mailPage = {
    mails: [],

    render(container) {
        this.loadMails();
    },

    async loadMails() {
        const list = document.getElementById('mail-list');
        try {
            this.mails = await getMails();
            this.renderList();
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

        list.innerHTML = this.mails.map((mail, idx) => {
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

        createIcons({ icons });
    }
};
