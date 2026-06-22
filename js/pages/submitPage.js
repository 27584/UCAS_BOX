import { submitItem, getMySubmissions } from '../api.js';
import { showToast, QUALITY_CONFIG } from '../utils.js';
import { createIcons, icons } from 'lucide';

export const submitPage = {
    submissions: [],

    async render(container) {
        this.attachEvents(container);
        await this.loadSubmissions();
    },

    attachEvents(container) {
        container.querySelector('#btn-submit')?.addEventListener('click', () => this.submit());
        createIcons({ icons });
    },

    async submit() {
        const name = document.getElementById('submit-name').value.trim();
        const quality = document.getElementById('submit-quality').value;
        const description = document.getElementById('submit-desc').value.trim();
        const weight = parseInt(document.getElementById('submit-weight').value) || 100;
        const imageName = (document.getElementById('submit-image')?.value || '').trim();

        if (!name) {
            showToast('请输入物品名称', 'error');
            return;
        }
        if (!description) {
            showToast('请输入物品描述', 'error');
            return;
        }

        try {
            await submitItem(name, quality, description, weight, imageName);
            showToast('投稿成功，等待审核', 'success');
            document.getElementById('submit-name').value = '';
            document.getElementById('submit-desc').value = '';
            document.getElementById('submit-weight').value = '100';
            const imgEl = document.getElementById('submit-image');
            if (imgEl) imgEl.value = '';
            await this.loadSubmissions();
        } catch (e) {
            showToast('投稿失败', 'error');
        }
    },

    async loadSubmissions() {
        const list = document.getElementById('submission-list');
        try {
            this.submissions = await getMySubmissions();
            this.renderSubmissions();
        } catch (e) {
            list.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    },

    renderSubmissions() {
        const list = document.getElementById('submission-list');
        if (!list) return;

        if (this.submissions.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>暂无投稿</p></div>';
            return;
        }

        list.innerHTML = this.submissions.map(sub => {
            const cfg = QUALITY_CONFIG[sub.quality] || QUALITY_CONFIG.white;
            const statusMap = {
                pending: { text: '审核中', cls: 'status-pending' },
                approved: { text: '已通过', cls: 'status-approved' },
                rejected: { text: '未通过', cls: 'status-rejected' }
            };
            const status = statusMap[sub.status] || statusMap.pending;

            return `
                <div class="submission-card">
                    <div class="submission-quality-bar quality-${sub.quality || 'white'}"></div>
                    <div class="submission-info">
                        <div class="submission-header">
                            <span class="submission-name">${sub.name}</span>
                            <span class="submission-status ${status.cls}">${status.text}</span>
                        </div>
                        <p class="submission-desc">${sub.description}</p>
                        <div class="submission-meta">
                            <span class="quality-${sub.quality || 'white'}-text">${cfg.label}</span>
                            <span>权重: ${sub.drop_weight}</span>
                            ${sub.status === 'approved' ? `<span class="reward">奖励: ${sub.reward_shells} 果壳币</span>` : ''}
                            ${sub.status === 'rejected' && sub.admin_note ? `<span class="reject-reason">原因: ${sub.admin_note}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        createIcons({ icons });
    }
};
