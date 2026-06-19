import { getInventory } from '../api.js';
import { itemImageHTML, QUALITY_CONFIG, openItemDetail } from '../utils.js';
import { createIcons, icons } from 'lucide';

export const inventoryPage = {
    items: [],
    filterType: '',

    render(container) {
        this.attachEvents(container);
        this.loadInventory();
    },

    loadInventory() {
        return this._loadInventory();
    },

    _loadInventory() {
        const self = this;
        getInventory().then(items => {
            self.items = items || [];
            self.renderGrid('all');
        }).catch(e => {
            console.error('Load inventory error:', e);
        });
    },

    attachEvents(container) {
        const buttons = container.querySelectorAll('.filter-btn');
        const filterType = document.getElementById('inventory-filter-type');
        
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderGrid(btn.dataset.filter);
            });
        });
        
        filterType?.addEventListener('change', (e) => {
            this.filterType = e.target.value;
            const activeBtn = container.querySelector('.filter-btn.active');
            this.renderGrid(activeBtn?.dataset.filter || 'all');
        });
        
        createIcons({ icons });
    },

    async loadInventory() {
        try {
            this.items = await getInventory();
            console.log('Inventory data:', JSON.stringify(this.items, null, 2));
            this.renderGrid('all');
        } catch (e) {
            console.error('Load inventory error:', e);
            const grid = document.getElementById('inventory-grid');
            if (grid) {
                grid.innerHTML = `
                    <div class="empty-state" style="grid-column:1/-1;">
                        <p>加载失败</p>
                    </div>
                `;
            }
        }
    },

    refreshInventory() {
        this.loadInventory();
    },

    renderGrid(filter) {
        const grid = document.getElementById('inventory-grid');
        if (!grid) return;
        let filtered = filter === 'all'
            ? this.items
            : this.items.filter(i => i.item_quality === filter);
        
        if (this.filterType) {
            filtered = filtered.filter(i => i.item_type === this.filterType);
        }

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column:1/-1;">
                    <i data-lucide="package-open"></i>
                    <p>这里空空如也</p>
                </div>
            `;
            createIcons({ icons });
            return;
        }

        grid.innerHTML = filtered.map((inv, idx) => {
            const cfg = QUALITY_CONFIG[inv.item_quality];
            return `
                <div class="item-card animate-fade-in-up" data-item-id="${inv.item_id}" style="animation-delay:${idx * 0.03}s">
                    <div class="item-quality-bar" style="background:${cfg.color}"></div>
                    ${itemImageHTML(inv.item_name, inv.item_quality, inv.item_image)}
                    <div class="item-name">${inv.item_name}</div>
                    <div class="item-count">x${inv.quantity}</div>
                </div>
            `;
        }).join('');

        grid.querySelectorAll('.item-card').forEach(card => {
            card.addEventListener('click', () => {
                const itemId = parseInt(card.dataset.itemId);
                const inv = this.items.find(i => i.item_id === itemId);
                if (inv) {
                    openItemDetail({
                        id: inv.item_id,
                        name: inv.item_name,
                        quality: inv.item_quality,
                        image_name: inv.item_image,
                        description: inv.item_description,
                        item_type: inv.item_type,
                        owned: inv.quantity
                    });
                }
            });
        });
    }
};
