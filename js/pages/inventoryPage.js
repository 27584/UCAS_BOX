import { getInventory } from '../api.js';
import { itemImageHTML, QUALITY_CONFIG, openItemDetail } from '../utils.js';
import { createIcons } from 'lucide';

export const inventoryPage = {
    items: [],

    render(container) {
        this.attachEvents(container);
        this.loadInventory();
    },

    attachEvents(container) {
        const buttons = container.querySelectorAll('.filter-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderGrid(btn.dataset.filter);
            });
        });
        createIcons();
    },

    async loadInventory() {
        try {
            this.items = await getInventory();
            this.renderGrid('all');
        } catch (e) {
            document.getElementById('inventory-grid').innerHTML = `
                <div class="empty-state" style="grid-column:1/-1;">
                    <p>加载失败</p>
                </div>
            `;
        }
    },

    renderGrid(filter) {
        const grid = document.getElementById('inventory-grid');
        const filtered = filter === 'all'
            ? this.items
            : this.items.filter(i => i.items.quality === filter);

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column:1/-1;">
                    <i data-lucide="package-open"></i>
                    <p>这里空空如也</p>
                </div>
            `;
            createIcons();
            return;
        }

        grid.innerHTML = filtered.map((inv, idx) => {
            const item = inv.items;
            const cfg = QUALITY_CONFIG[item.quality];
            return `
                <div class="item-card animate-fade-in-up" data-item-id="${item.id}" style="animation-delay:${idx * 0.03}s">
                    <div class="item-quality-bar" style="background:${cfg.color}"></div>
                    ${itemImageHTML(item.name, item.quality, item.image_name)}
                    <div class="item-name">${item.name}</div>
                    <div class="item-count">x${inv.quantity}</div>
                </div>
            `;
        }).join('');

        grid.querySelectorAll('.item-card').forEach(card => {
            card.addEventListener('click', () => {
                const itemId = parseInt(card.dataset.itemId);
                const inv = this.items.find(i => i.items.id === itemId);
                if (inv) {
                    openItemDetail({
                        id: inv.items.id,
                        name: inv.items.name,
                        quality: inv.items.quality,
                        image_name: inv.items.image_name,
                        description: inv.items.description,
                        owned: inv.quantity
                    });
                }
            });
        });
    }
};
