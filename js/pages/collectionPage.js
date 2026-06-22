import { getCollectionProgress } from '../api.js';
import { itemImageHTML, QUALITY_CONFIG, openItemDetail, initItemImages } from '../utils.js';
import { createIcons, icons } from 'lucide';

const PAGE_SIZE = 16;

export const collectionPage = {
    items: [],
    page: 1,
    filterOwned: '',
    filterType: '',

    render(container) {
        this.attachEvents();
        this.loadCollection();
    },

    attachEvents() {
        const filterOwned = document.getElementById('collection-filter-owned');
        const filterType = document.getElementById('collection-filter-type');
        
        filterOwned?.addEventListener('change', (e) => {
            this.filterOwned = e.target.value;
            this.page = 1;
            this.renderGrid();
        });
        
        filterType?.addEventListener('change', (e) => {
            this.filterType = e.target.value;
            this.page = 1;
            this.renderGrid();
        });
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

    getFilteredItems() {
        let filtered = this.items;
        
        if (this.filterType) {
            filtered = filtered.filter(i => i.item_type === this.filterType);
        }
        
        if (this.filterOwned === 'owned') {
            filtered = filtered.filter(i => i.owned > 0);
        } else if (this.filterOwned === 'unowned') {
            filtered = filtered.filter(i => i.owned === 0);
        }
        
        return filtered;
    },

    renderGrid() {
        const grid = document.getElementById('collection-grid');
        if (!grid) return;

        // 更新进度条（始终显示全部数据的统计）
        const total = this.items.length;
        const owned = this.items.filter(i => i.owned > 0).length;
        const percent = total > 0 ? Math.round((owned / total) * 100) : 0;

        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        if (progressFill) progressFill.style.width = percent + '%';
        if (progressText) progressText.textContent = `${owned} / ${total} (${percent}%)`;

        // 筛选和分页
        const filtered = this.getFilteredItems();
        const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
        const start = (this.page - 1) * PAGE_SIZE;
        const pageItems = filtered.slice(start, start + PAGE_SIZE);

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column:1/-1;">
                    <i data-lucide="search-x"></i>
                    <p>没有符合条件的物品</p>
                </div>
            `;
            this.renderPagination(0);
            return;
        }

        grid.innerHTML = pageItems.map((item, idx) => {
            const cfg = QUALITY_CONFIG[item.item_quality];
            const isOwned = item.owned > 0;
            const qualityClass = 'quality-' + (item.item_quality || 'white');
            return `
                <div class="item-card collection-card animate-fade-in-up ${!isOwned ? 'unowned' : ''} ${qualityClass}" data-item-id="${item.item_id}" style="animation-delay:${idx * 0.02}s">
                    ${isOwned ? `<div class="item-quality-bar ${qualityClass}"></div>` : ''}
                    ${isOwned
                        ? itemImageHTML(item.item_name, item.item_quality, item.item_image)
                        : `<div class="item-icon unowned-placeholder">?</div>`
                    }
                    <div class="item-name">${isOwned ? item.item_name : '???'}</div>
                    <div class="item-count">${isOwned ? '已拥有 ' + item.owned : '未收集'}</div>
                </div>
            `;
        }).join('');
        initItemImages();

        this.renderPagination(totalPages);

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
                        item_type: item.item_type,
                        owned: item.owned
                    });
                }
            });
        });

        createIcons({ icons });
    },

    renderPagination(totalPages) {
        const pagination = document.getElementById('collection-pagination');
        if (!pagination || totalPages <= 1) {
            if (pagination) pagination.innerHTML = '';
            return;
        }

        const maxVisiblePages = 5;
        let startPage = Math.max(1, this.page - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        pagination.innerHTML = `
            <button class="page-btn" data-page="${this.page - 1}" ${this.page === 1 ? 'disabled' : ''}>
                <i data-lucide="chevron-left"></i>
            </button>
            ${startPage > 1 ? '<button class="page-btn" data-page="1">1</button>' : ''}
            ${startPage > 2 ? '<span class="page-ellipsis">...</span>' : ''}
            ${Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i).map(p => `
                <button class="page-btn ${p === this.page ? 'active' : ''}" data-page="${p}">${p}</button>
            `).join('')}
            ${endPage < totalPages - 1 ? '<span class="page-ellipsis">...</span>' : ''}
            ${endPage < totalPages ? `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>` : ''}
            <button class="page-btn" data-page="${this.page + 1}" ${this.page === totalPages ? 'disabled' : ''}>
                <i data-lucide="chevron-right"></i>
            </button>
        `;

        pagination.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = parseInt(btn.dataset.page);
                if (p >= 1 && p <= totalPages && p !== this.page) {
                    this.page = p;
                    this.renderGrid();
                }
            });
        });

        createIcons({ icons });
    }
};
