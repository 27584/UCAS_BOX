import { getCollectionProgress } from '../api.js';
import { itemImageHTML, QUALITY_CONFIG, openItemDetail } from '../utils.js';
import { createIcons, icons } from 'lucide';

export const collectionPage = {
    items: [],

    render(container) {
        this.loadCollection();
    },

    async loadCollection() {
        try {
            this.items = await getCollectionProgress();
            this.renderGrid();
        } catch (e) {
            const grid = document.getElementById('collection-grid');
            if (grid) {
                grid.innerHTML = `
                    <div class="empty-state" style="grid-column:1/-1;">
                        <p>加载失败</p>
                    </div>
                `;
            }
        }
    },

    renderGrid() {
        const grid = document.getElementById('collection-grid');
        if (!grid) return;
        const total = this.items.length;
        const owned = this.items.filter(i => i.owned > 0).length;
        const percent = total > 0 ? Math.round((owned / total) * 100) : 0;

        document.getElementById('progress-fill').style.width = percent + '%';
        document.getElementById('progress-text').textContent = `${owned} / ${total} (${percent}%)`;

        grid.innerHTML = this.items.map((item, idx) => {
            const cfg = QUALITY_CONFIG[item.item_quality];
            const isOwned = item.owned > 0;
            return `
                <div class="item-card collection-card animate-fade-in-up ${!isOwned ? 'unowned' : ''}" data-item-id="${item.item_id}" style="animation-delay:${idx * 0.02}s">
                    <div class="item-quality-bar" style="background:${isOwned ? cfg.color : '#334155'}"></div>
                    ${isOwned
                        ? itemImageHTML(item.item_name, item.item_quality, item.item_image)
                        : `<div class="item-icon" style="width:64px;height:64px;background:#1e293b;border:2px dashed #334155;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#475569;font-size:24px;">?</div>`
                    }
                    <div class="item-name">${isOwned ? item.item_name : '???'}</div>
                    <div class="item-count">${isOwned ? '已拥有 ' + item.owned : '未收集'}</div>
                </div>
            `;
        }).join('');

        grid.querySelectorAll('.item-card').forEach(card => {
            card.addEventListener('click', () => {
                const itemId = parseInt(card.dataset.itemId);
                const item = this.items.find(i => i.item_id === itemId);
                if (item) {
                    openItemDetail({
                        id: item.item_id,
                        name: item.item_name,
                        quality: item.item_quality,
                        image_name: item.item_image,
                        description: item.item_description,
                        owned: item.owned
                    });
                }
            });
        });

        createIcons({ icons });
    }
};
