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

// 生成用户徽章 HTML（管理员 & 机器人标识）
export function userBadgeHTML(user) {
    if (!user) return '';
    const isAdmin = user.is_admin || user.user_is_admin;
    const isBot = user.is_bot || user.user_is_bot;
    let html = '';
    if (isAdmin) html += '<span class="admin-badge">管理员</span> ';
    if (isBot) html += '<span class="bot-tag">机器人</span> ';
    return html;
}

export function formatNumber(n) {
    return n.toLocaleString('zh-CN');
}

export function timeAgo(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}天前`;
    if (diff < 2592000) return `${Math.floor(diff / 604800)}周前`;
    
    return date.toLocaleDateString('zh-CN');
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

// 自定义确认对话框
export function showConfirm(message) {
    return new Promise((resolve) => {
        // 移除已存在的确认框
        const existing = document.getElementById('confirm-modal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'confirm-modal';
        overlay.innerHTML = `
            <div class="confirm-overlay"></div>
            <div class="confirm-dialog">
                <div class="confirm-message">${message}</div>
                <div class="confirm-buttons">
                    <button class="btn btn-secondary" id="confirm-cancel">取消</button>
                    <button class="btn btn-danger" id="confirm-ok">确定</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        // 添加样式
        if (!document.getElementById('confirm-styles')) {
            const style = document.createElement('style');
            style.id = 'confirm-styles';
            style.textContent = `
                #confirm-modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; }
                #confirm-modal .confirm-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); }
                #confirm-modal .confirm-dialog { position: relative; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 16px; padding: 24px; min-width: 280px; box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
                #confirm-modal .confirm-message { text-align: center; margin-bottom: 24px; color: var(--text-primary); font-size: 16px; }
                #confirm-modal .confirm-buttons { display: flex; gap: 12px; }
                #confirm-modal .confirm-buttons .btn { flex: 1; padding: 12px 16px; border-radius: 8px; font-size: 14px; border: none; cursor: pointer; }
                #confirm-modal .btn-secondary { background: var(--bg-tertiary); color: var(--text-secondary); }
                #confirm-modal .btn-secondary:hover { background: var(--bg-hover); }
                #confirm-modal .btn-danger { background: var(--error-color, #ef4444); color: white; }
                #confirm-modal .btn-danger:hover { opacity: 0.9; }
            `;
            document.head.appendChild(style);
        }

        // 动画
        requestAnimationFrame(() => {
            overlay.querySelector('.confirm-dialog').style.transform = 'scale(1)';
            overlay.querySelector('.confirm-dialog').style.opacity = '1';
        });

        document.getElementById('confirm-cancel').addEventListener('click', () => {
            overlay.remove();
            resolve(false);
        });

        document.getElementById('confirm-ok').addEventListener('click', () => {
            overlay.remove();
            resolve(true);
        });

        overlay.querySelector('.confirm-overlay').addEventListener('click', () => {
            overlay.remove();
            resolve(false);
        });
    });
}

export function itemImageHTML(name, quality, imageName, size = 64) {
    const cfg = QUALITY_CONFIG[quality] || QUALITY_CONFIG.white;
    const escapedName = escapeHtml(name);
    const initial = escapedName.charAt(0);
    // 支持 http/https URL 和 data:image/xxx;base64,... 格式
    const isUrl = imageName && (/^https?:\/\//i.test(imageName) || /^data:image\//i.test(imageName));
    const hasImage = isUrl || (imageName && imageName.trim());
    const imgPath = isUrl ? imageName : hasImage ? `assets/items/${escapeHtml(imageName).replace(/[^a-zA-Z0-9._-]/g, '_')}` : '';
    return `
        <div class="item-icon" style="position:relative;width:${size}px;height:${size}px;overflow:hidden;border-radius:12px;flex-shrink:0;">
            <div class="item-fallback" style="width:100%;height:100%;background:linear-gradient(135deg, ${cfg.color}22, ${cfg.color}11);border:2px solid ${cfg.color}55;box-shadow:0 0 12px ${cfg.glow};display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:${size * 0.45}px;color:${cfg.color};font-weight:700;">${initial}</div>
            ${hasImage ? `<img src="${imgPath}" alt="${escapedName}" class="item-image" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:12px;display:none;z-index:1;">` : ''}
        </div>
    `;
}

export function initItemImages() {
    // 使用 requestAnimationFrame 确保 DOM 已完全渲染
    requestAnimationFrame(() => {
        document.querySelectorAll('.item-icon .item-image:not([data-initialized])').forEach(img => {
            img.setAttribute('data-initialized', 'true');
            const icon = img.closest('.item-icon');
            const fallback = icon?.querySelector('.item-fallback');
            if (!icon || !fallback) return;
            
            const handleLoad = () => {
                img.style.display = 'block';
                fallback.style.display = 'none';
            };
            
            const handleError = () => {
                img.style.display = 'none';
                fallback.style.display = 'flex';
            };
            
            if (img.complete) {
                if (img.naturalWidth > 0) {
                    handleLoad();
                } else {
                    handleError();
                }
            } else {
                img.addEventListener('load', handleLoad);
                img.addEventListener('error', handleError);
            }
        });
    });
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
    let actionHtml = '';

    if (item.item_type === 'consumable') {
        if (item.name === '改名卡') {
            actionHtml = '<button class="btn btn-primary" id="use-rename-btn" style="width:100%;margin-top:16px;">' +
                '<i data-lucide="edit-3"></i>' +
                '<span>使用改名卡</span>' +
                '</button>';
        } else if (item.name === '端午节福袋') {
            actionHtml = '<button class="btn btn-primary" id="use-dragon-boat-btn" style="width:100%;margin-top:16px;">' +
                '<i data-lucide="gift"></i>' +
                '<span>打开福袋</span>' +
                '</button>';
        }
    }

    if (actionHtml) {
        actionsDiv.style.display = 'block';
        actionsDiv.innerHTML = actionHtml;
        _createIcons({ icons });

        if (item.item_type === 'consumable') {
            if (item.name === '改名卡') {
                document.getElementById('use-rename-btn').addEventListener('click', () => {
                    closeItemDetail();
                    setTimeout(() => window.openRenameModal && window.openRenameModal(), 100);
                });
            } else if (item.name === '端午节福袋') {
                document.getElementById('use-dragon-boat-btn').addEventListener('click', async () => {
                    if (window.useDragonBoatBag) {
                        closeItemDetail();
                        setTimeout(() => window.useDragonBoatBag(), 100);
                    }
                });
            }
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

// ============================================
// 分页组件
// ============================================
export function renderPagination(currentPage, totalCount, limit, onClick) {
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    if (totalPages <= 1) return '';

    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
        start = Math.max(1, end - maxVisible + 1);
    }

    if (start > 1) pages.push(`<button class="page-btn" data-page="1">1</button>`);
    if (start > 2) pages.push(`<span class="page-ellipsis">...</span>`);

    for (let i = start; i <= end; i++) {
        pages.push(`<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`);
    }

    if (end < totalPages - 1) pages.push(`<span class="page-ellipsis">...</span>`);
    if (end < totalPages) pages.push(`<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`);

    return `
        <div class="pagination">
            <button class="page-btn" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>
                <i data-lucide="chevron-left"></i>
            </button>
            ${pages.join('')}
            <button class="page-btn" data-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>
                <i data-lucide="chevron-right"></i>
            </button>
            <span class="page-ellipsis">共 ${totalCount} 条</span>
        </div>
    `;
}

export function bindPagination(container, onClick) {
    if (!container) return;
    container.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = parseInt(btn.dataset.page);
            if (page > 0) onClick(page);
        });
    });
}
