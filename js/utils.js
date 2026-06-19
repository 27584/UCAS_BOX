// ============================================
// 工具函数
// ============================================

import { createIcons as _createIcons, icons } from 'lucide';

export const QUALITY_CONFIG = {
    white: { label: '普通', color: '#e2e8f0', glow: 'rgba(226,232,240,0.3)' },
    green: { label: '稀有', color: '#22c55e', glow: 'rgba(34,197,94,0.4)' },
    blue: { label: '珍奇', color: '#3b82f6', glow: 'rgba(59,130,246,0.4)' },
    purple: { label: '史诗', color: '#a855f7', glow: 'rgba(168,85,247,0.4)' },
    orange: { label: '传说', color: '#f97316', glow: 'rgba(249,115,22,0.5)' },
    red: { label: '神圣', color: '#ef4444', glow: 'rgba(239,68,68,0.5)' },
};

export const ITEM_TYPE_CONFIG = {
    collection: { label: '收藏品', color: '#f59e0b', bg: '#f59e0b22' },
    consumable: { label: '消耗品', color: '#ef4444', bg: '#ef444422' },
    equipment: { label: '装备', color: '#3b82f6', bg: '#3b82f622' },
    material: { label: '材料', color: '#22c55e', bg: '#22c55e22' },
    currency: { label: '货币', color: '#a855f7', bg: '#a855f722' },
};

export function getItemTypeLabel(type) {
    return ITEM_TYPE_CONFIG[type]?.label || '未知';
}

export function getItemTypeColor(type) {
    return ITEM_TYPE_CONFIG[type]?.color || '#64748b';
}

export function escapeHtml(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

export function formatNumber(n) {
    return n.toLocaleString('zh-CN');
}

export function formatCountdown(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

export function itemImageHTML(name, quality, imageName, size = 64) {
    const cfg = QUALITY_CONFIG[quality] || QUALITY_CONFIG.white;
    const escapedName = escapeHtml(name);
    const initial = escapedName.charAt(0);
    const safeImageName = escapeHtml(imageName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const imgPath = `assets/items/${safeImageName}`;
    return `
        <div class="item-icon" style="position:relative;width:${size}px;height:${size}px;">
            <img src="${imgPath}" alt="${escapedName}" style="width:100%;height:100%;object-fit:contain;border-radius:12px;display:none;" onload="this.style.display='block';this.nextElementSibling.style.display='none';" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
            <div style="width:100%;height:100%;background:linear-gradient(135deg, ${cfg.color}22, ${cfg.color}11);border:2px solid ${cfg.color}55;box-shadow:0 0 12px ${cfg.glow};border-radius:12px;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:${size * 0.45}px;color:${cfg.color};font-weight:700;">${initial}</div>
        </div>
    `;
}

export function createParticles(container, count = 20) {
    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.left = Math.random() * 100 + '%';
        p.style.top = Math.random() * 100 + '%';
        p.style.animationDelay = Math.random() * 5 + 's';
        p.style.animationDuration = (4 + Math.random() * 6) + 's';
        container.appendChild(p);
    }
}

export function openItemDetail(item) {
    const cfg = QUALITY_CONFIG[item.quality] || QUALITY_CONFIG.white;
    const typeCfg = ITEM_TYPE_CONFIG[item.item_type] || ITEM_TYPE_CONFIG.collection;
    const modal = document.getElementById('item-detail-modal');
    if (!modal) {
        const modalHtml = `
            <div id="item-detail-modal" class="modal" style="display:none;">
                <div class="modal-overlay" id="detail-overlay"></div>
                <div class="modal-content item-detail-card">
                    <button class="btn-close" id="detail-close"><i data-lucide="x"></i></button>
                    <div class="detail-header">
                        <div class="detail-icon" id="detail-icon"></div>
                        <div class="detail-info">
                            <h3 id="detail-name"></h3>
                            <div class="detail-tags">
                                <span class="quality-badge" id="detail-quality"></span>
                                <span class="type-badge" id="detail-type"></span>
                            </div>
                        </div>
                    </div>
                    <div class="detail-body">
                        <p id="detail-desc"></p>
                        <div class="detail-meta">
                            <div class="meta-item">
                                <i data-lucide="gem"></i>
                                <span id="detail-amount">拥有: 0</span>
                            </div>
                        </div>
                        <div class="detail-actions" id="detail-actions" style="display:none;"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.getElementById('detail-close').addEventListener('click', closeItemDetail);
        document.getElementById('detail-overlay').addEventListener('click', closeItemDetail);
    }

    const icon = document.getElementById('detail-icon');
    const name = document.getElementById('detail-name');
    const quality = document.getElementById('detail-quality');
    const type = document.getElementById('detail-type');
    const desc = document.getElementById('detail-desc');
    const amount = document.getElementById('detail-amount');

    icon.innerHTML = itemImageHTML(item.name, item.quality, item.image_name, 80);
    name.textContent = item.name;
    name.style.color = cfg.color;
    quality.textContent = cfg.label;
    quality.className = 'quality-badge quality-' + item.quality;
    type.textContent = typeCfg.label;
    type.style.background = typeCfg.bg;
    type.style.color = typeCfg.color;
    desc.textContent = item.description ? escapeHtml(item.description) : '暂无描述';
    amount.textContent = '拥有: ' + (item.owned || 0);

    const actionsDiv = document.getElementById('detail-actions');
    if (item.item_type === 'consumable') {
        if (item.name === '改名卡') {
            actionsDiv.style.display = 'block';
            actionsDiv.innerHTML = '<button class="btn btn-primary" id="use-rename-btn" style="width:100%;margin-top:16px;">' +
                '<i data-lucide="edit-3"></i>' +
                '<span>使用改名卡</span>' +
                '</button>';
            _createIcons({ icons });

            document.getElementById('use-rename-btn').addEventListener('click', () => {
                closeItemDetail();
                setTimeout(() => window.openRenameModal && window.openRenameModal(), 100);
            });
        } else if (item.name === '端午节福袋') {
            actionsDiv.style.display = 'block';
            actionsDiv.innerHTML = '<button class="btn btn-primary" id="use-dragon-boat-btn" style="width:100%;margin-top:16px;">' +
                '<i data-lucide="gift"></i>' +
                '<span>打开福袋</span>' +
                '</button>';
            _createIcons({ icons });

            document.getElementById('use-dragon-boat-btn').addEventListener('click', async () => {
                if (window.useDragonBoatBag) {
                    closeItemDetail();
                    setTimeout(() => window.useDragonBoatBag(), 100);
                }
            });
        } else {
            actionsDiv.style.display = 'none';
        }
    } else {
        actionsDiv.style.display = 'none';
    }

    document.getElementById('item-detail-modal').style.display = 'flex';
    _createIcons({ icons });
}

export function closeItemDetail() {
    const modal = document.getElementById('item-detail-modal');
    if (modal) modal.style.display = 'none';
}
