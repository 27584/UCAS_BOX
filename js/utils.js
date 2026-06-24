// ============================================
// 工具函数
// ============================================

import { createIcons as _createIcons, icons } from 'lucide';
import { supabase } from './supabaseClient.js';

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
    seed: { label: '种子', color: '#10b981', bg: '#10b98122' },
};

// 统一的物品类型列表（所有页面共用，禁止硬编码）
export const ITEM_TYPES = Object.entries(ITEM_TYPE_CONFIG).map(([value, cfg]) => ({
    value,
    label: cfg.label
}));

// 统一的品质列表（所有页面共用）
export const QUALITY_OPTIONS = [
    { value: 'white', label: '普通' },
    { value: 'green', label: '稀有' },
    { value: 'blue', label: '珍奇' },
    { value: 'purple', label: '史诗' },
    { value: 'orange', label: '传说' },
    { value: 'red', label: '神圣' }
];

// 生成 <option> HTML（用于在 <select> 里填充）
export function itemTypeOptionsHTML({ includeAll = false, allLabel = '全部类型', selected = '' } = {}) {
    const opts = ITEM_TYPES.map(t =>
        `<option value="${t.value}"${selected === t.value ? ' selected' : ''}>${t.label}</option>`
    ).join('');
    return includeAll ? `<option value="">${allLabel}</option>${opts}` : opts;
}

export function qualityOptionsHTML({ includeAll = false, allLabel = '全部品质', selected = '' } = {}) {
    const opts = QUALITY_OPTIONS.map(q =>
        `<option value="${q.value}"${selected === q.value ? ' selected' : ''}>${q.label}</option>`
    ).join('');
    return includeAll ? `<option value="">${allLabel}</option>${opts}` : opts;
}

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

export function userAvatarHTML(user) {
    if (!user) return '';
    const avatarUrl = user.avatar_url || user.user_avatar_url;
    const nickname = user.nickname || user.user_nickname || '未知用户';
    const initial = nickname.charAt(0);
    const isUrl = avatarUrl && (/^https?:\/\//i.test(avatarUrl) || /^data:image\//i.test(avatarUrl));
    return `
        <div class="avatar-wrapper">
            <div class="avatar" style="background:var(--paper-card);border:1.5px solid var(--ink);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-weight:700;color:var(--ink);">
                ${isUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(nickname)}" class="avatar-img">` : `<span class="avatar-initial">${initial}</span>`}
            </div>
        </div>
    `;
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
const CONFIRM_STYLES = `
#confirm-modal { position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; z-index: 99999 !important; display: flex !important; align-items: center !important; justify-content: center !important; padding: 20px; margin: 0; }
#confirm-modal * { box-sizing: border-box; }
#confirm-modal .confirm-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(31, 26, 18, 0.55); backdrop-filter: blur(2px); }
#confirm-modal .confirm-dialog { position: relative; background: var(--paper-card, #fdf6e3); border: 2px solid var(--ink, #2c2416); border-radius: 0; padding: 28px 24px; width: 100%; max-width: 420px; box-shadow: 6px 6px 0 var(--ink, #2c2416); transform: scale(0.94); opacity: 0; transition: transform 0.18s ease-out, opacity 0.18s ease-out; }
#confirm-modal .confirm-dialog::before { content: ''; position: absolute; top: -10px; left: 50%; transform: translateX(-50%) rotate(-3deg); width: 36px; height: 18px; background: var(--seal-red, #b94545); border-radius: 50%; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2); opacity: 0.85; }
#confirm-modal .confirm-dialog.is-danger { border-color: var(--seal-red, #b94545); }
#confirm-modal .confirm-dialog.is-danger::before { background: var(--seal-red, #b94545); }
#confirm-modal .confirm-icon { text-align: center; color: var(--seal-red, #b94545); margin-bottom: 12px; }
#confirm-modal .confirm-icon svg { width: 40px; height: 40px; }
#confirm-modal .confirm-title { text-align: center; color: var(--ink, #2c2416); font-family: var(--font-display, serif); font-size: 1.15rem; font-weight: 700; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1.5px; }
#confirm-modal .confirm-dialog.is-danger .confirm-title { color: var(--seal-red, #b94545); }
#confirm-modal .confirm-message { text-align: left; margin-bottom: 20px; color: var(--ink, #2c2416); font-size: 0.92rem; font-family: var(--font-body, sans-serif); white-space: pre-wrap; word-wrap: break-word; line-height: 1.6; max-height: 60vh; overflow-y: auto; }
#confirm-modal .confirm-buttons { display: flex; gap: 10px; }
#confirm-modal .confirm-buttons .btn { flex: 1; padding: 10px 16px; font-size: 0.9rem; }
#confirm-modal .confirm-input-wrap { margin-bottom: 16px; }
#confirm-modal .confirm-input { width: 100%; padding: 10px 12px; border: 1.5px solid var(--ink, #2c2416); background: var(--paper-bg, #f5ecd9); font-family: var(--font-mono, monospace); font-size: 0.9rem; color: var(--ink, #2c2416); box-shadow: 2px 2px 0 var(--ink-faded, #8a7d5e); }
#confirm-modal .confirm-input:focus { outline: none; box-shadow: 3px 3px 0 var(--ink, #2c2416); transform: translate(-1px, -1px); }
#confirm-modal .confirm-hint { font-size: 0.75rem; color: var(--ink-faded, #8a7d5e); margin-top: 6px; text-align: center; }
`;

function ensureConfirmStyles() {
    let style = document.getElementById('confirm-styles');
    if (!style) {
        style = document.createElement('style');
        style.id = 'confirm-styles';
        document.head.appendChild(style);
    }
    style.textContent = CONFIRM_STYLES;
}

export function showConfirm(message, options = {}) {
    return new Promise((resolve) => {
        // 移除已存在的确认框
        const existing = document.getElementById('confirm-modal');
        if (existing) existing.remove();

        const okText = options.okText || '确定';
        const cancelText = options.cancelText || '取消';
        const okClass = options.okClass || 'btn-danger';
        const cancelClass = options.cancelClass || 'btn-secondary';
        const danger = options.danger || false;
        const title = options.title || (danger ? '危险操作' : '请确认');

        ensureConfirmStyles();

        const overlay = document.createElement('div');
        overlay.id = 'confirm-modal';
        overlay.innerHTML = `
            <div class="confirm-overlay"></div>
            <div class="confirm-dialog ${danger ? 'is-danger' : ''}">
                ${danger ? '<div class="confirm-icon"><i data-lucide="alert-triangle"></i></div>' : ''}
                <div class="confirm-title">${title}</div>
                <div class="confirm-message">${message}</div>
                <div class="confirm-buttons">
                    <button class="btn ${cancelClass}" id="confirm-cancel">${cancelText}</button>
                    <button class="btn ${okClass}" id="confirm-ok">${okText}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        // 重新渲染 lucide 图标
        if (window.lucide) lucide.createIcons();

        // 动画
        requestAnimationFrame(() => {
            overlay.querySelector('.confirm-dialog').style.transform = 'scale(1)';
            overlay.querySelector('.confirm-dialog').style.opacity = '1';
        });

        const close = (result) => {
            overlay.remove();
            resolve(result);
        };

        document.getElementById('confirm-cancel').addEventListener('click', () => close(false));
        document.getElementById('confirm-ok').addEventListener('click', () => close(true));
        overlay.querySelector('.confirm-overlay').addEventListener('click', () => close(false));

        // Esc 键取消
        const onKey = (e) => {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', onKey);
                close(false);
            }
        };
        document.addEventListener('keydown', onKey);
    });
}

// 危险操作确认：要求用户输入指定文本
export function showConfirmTyped(message, expectedText, options = {}) {
    return new Promise((resolve) => {
        const existing = document.getElementById('confirm-modal');
        if (existing) existing.remove();

        const okText = options.okText || '确认删除';
        const cancelText = options.cancelText || '取消';
        const title = options.title || '危险操作';

        ensureConfirmStyles();

        const overlay = document.createElement('div');
        overlay.id = 'confirm-modal';
        overlay.innerHTML = `
            <div class="confirm-overlay"></div>
            <div class="confirm-dialog is-danger">
                <div class="confirm-icon"><i data-lucide="alert-triangle"></i></div>
                <div class="confirm-title">${title}</div>
                <div class="confirm-message">${message}</div>
                <div class="confirm-input-wrap">
                    <input type="text" class="confirm-input" id="confirm-typed-input" placeholder="${options.placeholder || `请输入 ${expectedText} 确认`}" autocomplete="off" />
                    <div class="confirm-hint">输入「<strong>${expectedText}</strong>」以启用确认按钮</div>
                </div>
                <div class="confirm-buttons">
                    <button class="btn btn-secondary" id="confirm-cancel">${cancelText}</button>
                    <button class="btn btn-danger" id="confirm-ok" disabled>${okText}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        if (window.lucide) lucide.createIcons();

        requestAnimationFrame(() => {
            overlay.querySelector('.confirm-dialog').style.transform = 'scale(1)';
            overlay.querySelector('.confirm-dialog').style.opacity = '1';
            document.getElementById('confirm-typed-input').focus();
        });

        const inputEl = document.getElementById('confirm-typed-input');
        const okBtn = document.getElementById('confirm-ok');
        const updateBtn = () => {
            okBtn.disabled = inputEl.value.trim() !== expectedText;
        };
        inputEl.addEventListener('input', updateBtn);
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !okBtn.disabled) {
                okBtn.click();
            } else if (e.key === 'Escape') {
                document.getElementById('confirm-cancel').click();
            }
        });

        const close = (result) => {
            overlay.remove();
            resolve(result);
        };

        document.getElementById('confirm-cancel').addEventListener('click', () => close(false));
        okBtn.addEventListener('click', () => close(true));
        overlay.querySelector('.confirm-overlay').addEventListener('click', () => close(false));

        const onKey = (e) => {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', onKey);
                close(false);
            }
        };
        document.addEventListener('keydown', onKey);
    });
}

// 通用：把原生 <select> 替换为可搜索下拉组件
// 参数：
//   originalSelect - 原生 select 元素
//   items - 物品数组 [{item_id, name, quality, item_type, ...}]
//   options - { placeholder, onChange }
export function replaceWithSearchableSelect(originalSelect, items, options = {}) {
    if (!originalSelect) return null;

    const placeholder = options.placeholder || '选择物品';
    const onChange = options.onChange || null;
    const preselectedId = originalSelect.value || options.preselectedId || '';
    const selectId = originalSelect.id || `ss-${Math.random().toString(36).slice(2, 9)}`;
    originalSelect.id = selectId;
    const wrapperId = `searchable-select-${selectId}`;
    if (!originalSelect.dataset.originalValue) {
        originalSelect.dataset.originalValue = preselectedId;
    }

    // 已存在则只更新数据
    const existing = document.getElementById(wrapperId);
    if (existing) {
        const list = existing.querySelector('.searchable-select-list');
        if (list) {
            _populateSearchableList(list, items);
            _populateSelectOptions(originalSelect, items);
            // 恢复已选值
            const val = originalSelect.value;
            if (val) {
                const item = items.find(i => (i.item_id ?? i.id) == val);
                if (item) {
                    const cfg = (typeof QUALITY_CONFIG !== 'undefined' && QUALITY_CONFIG[item.quality]) || null;
                    const valueEl = existing.querySelector('.searchable-select-value');
                    if (valueEl) {
                        const qualityText = cfg ? `[${cfg.label}] ` : '';
                        valueEl.textContent = qualityText + (item.name || '');
                        valueEl.dataset.set = '1';
                    }
                }
            }
            return existing;
        }
    }

    const wrapper = document.createElement('div');
    wrapper.id = wrapperId;
    wrapper.className = 'searchable-select';
    wrapper.dataset.targetSelect = selectId;

    wrapper.innerHTML = `
        <div class="searchable-select-trigger" tabindex="0">
            <span class="searchable-select-value">${placeholder}</span>
            <i data-lucide="chevron-down" class="searchable-select-arrow"></i>
        </div>
        <div class="searchable-select-dropdown" style="display:none;">
            <div class="searchable-select-search">
                <i data-lucide="search"></i>
                <input type="text" placeholder="搜索物品名称或品质..." />
            </div>
            <div class="searchable-select-list"></div>
        </div>
    `;

    originalSelect.style.display = 'none';
    originalSelect.parentNode.insertBefore(wrapper, originalSelect);

    const trigger = wrapper.querySelector('.searchable-select-trigger');
    const dropdown = wrapper.querySelector('.searchable-select-dropdown');
    const searchInput = wrapper.querySelector('.searchable-select-search input');
    const listEl = wrapper.querySelector('.searchable-select-list');
    const valueEl = wrapper.querySelector('.searchable-select-value');

    // 关键修复：必须给原 select 填充 option，否则 select.value = "5" 会因找不到匹配 option 而静默失败
    _populateSelectOptions(originalSelect, items);

    _populateSearchableList(listEl, items);

    // 恢复已选值
    if (preselectedId) {
        const item = items.find(i => (i.item_id ?? i.id) == preselectedId);
        if (item) {
            const cfg = QUALITY_CONFIG[item.quality] || QUALITY_CONFIG.white;
            valueEl.textContent = `[${cfg.label}] ${item.name}`;
            valueEl.dataset.set = '1';
        }
    }

    const close = () => {
        dropdown.style.display = 'none';
        dropdown.style.visibility = '';
        // 重置 fixed 定位，回到 absolute（CSS 默认）
        dropdown.style.position = '';
        dropdown.style.top = '';
        dropdown.style.left = '';
        dropdown.style.minWidth = '';
        dropdown.style.maxWidth = '';
        trigger.classList.remove('open');
    };
    const open = () => {
        // 先临时显示以测量尺寸
        dropdown.style.visibility = 'hidden';
        dropdown.style.display = 'block';
        // 计算 fixed 位置（绝对定位逃不出父元素的 overflow:hidden）
        const rect = trigger.getBoundingClientRect();
        const dropdownRect = dropdown.getBoundingClientRect();
        const viewportH = window.innerHeight;
        const viewportW = window.innerWidth;
        // 默认在 trigger 下方
        let top = rect.bottom + 4;
        let left = rect.left;
        // 如果下方空间不够，改为上方
        if (top + dropdownRect.height > viewportH - 8) {
            top = Math.max(8, rect.top - dropdownRect.height - 4);
        }
        // 如果右侧超出，贴右对齐
        if (left + dropdownRect.width > viewportW - 8) {
            left = Math.max(8, viewportW - dropdownRect.width - 8);
        }
        // 使用 fixed 定位，完全脱离父元素约束
        dropdown.style.position = 'fixed';
        dropdown.style.top = top + 'px';
        dropdown.style.left = left + 'px';
        dropdown.style.minWidth = Math.max(rect.width, 240) + 'px';
        dropdown.style.maxWidth = '320px';
        dropdown.style.visibility = 'visible';
        trigger.classList.add('open');
        setTimeout(() => {
            searchInput.value = '';
            // 重置过滤
            listEl.querySelectorAll('.searchable-select-item').forEach(r => r.style.display = '');
            const empty = listEl.querySelector('.searchable-select-empty');
            if (empty) empty.style.display = 'none';
            searchInput.focus();
        }, 0);
    };

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dropdown.style.display === 'none') open();
        else close();
    });
    trigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (dropdown.style.display === 'none') open();
            else close();
        }
    });

    searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim().toLowerCase();
        listEl.querySelectorAll('.searchable-select-item').forEach(row => {
            const text = (row.dataset.searchText || '').toLowerCase();
            row.style.display = !q || text.includes(q) ? '' : 'none';
        });
        let emptyEl = listEl.querySelector('.searchable-select-empty');
        const visible = Array.from(listEl.querySelectorAll('.searchable-select-item'))
            .filter(r => r.style.display !== 'none');
        if (visible.length === 0) {
            if (!emptyEl) {
                emptyEl = document.createElement('div');
                emptyEl.className = 'searchable-select-empty';
                emptyEl.textContent = '无匹配物品';
                listEl.appendChild(emptyEl);
            }
            emptyEl.style.display = '';
        } else if (emptyEl) {
            emptyEl.style.display = 'none';
        }
    });

    // 点击外部关闭
    const onDocClick = (e) => {
        if (!wrapper.contains(e.target)) close();
    };
    document.addEventListener('click', onDocClick);

    // 暴露重新填充方法
    wrapper._updateItems = (newItems) => {
        _populateSearchableList(listEl, newItems);
        _populateSelectOptions(originalSelect, newItems);
    };

    // 监听原生 select 的 change 事件，自动同步显示
    originalSelect.addEventListener('change', () => {
        const v = originalSelect.value;
        if (!v) {
            valueEl.textContent = placeholder;
            delete valueEl.dataset.set;
            return;
        }
        const item = items.find(i => (i.item_id ?? i.id) == v);
        if (item) {
            const cfg = QUALITY_CONFIG[item.quality] || QUALITY_CONFIG.white;
            valueEl.textContent = `[${cfg.label}] ${item.name}`;
            valueEl.dataset.set = '1';
        }
    });

    if (window.lucide) lucide.createIcons();
    return wrapper;
}

function _populateSearchableList(listEl, items) {
    if (!listEl) return;
    const opts = items.map(item => {
        const cfg = QUALITY_CONFIG[item.quality] || QUALITY_CONFIG.white;
        const id = item.item_id ?? item.id;
        return `<div class="searchable-select-item" data-value="${id}" data-search-text="[${cfg.label}] ${item.name} ${item.item_type || ''}">
            <span class="quality-dot" style="background:${cfg.color}"></span>
            <span class="quality-badge quality-${item.quality}">${cfg.label}</span>
            <span class="ss-item-name">${(item.name || '').replace(/</g, '&lt;')}</span>
            <span class="ss-item-type">${item.item_type || ''}</span>
        </div>`;
    }).join('');

    listEl.innerHTML = opts + '<div class="searchable-select-empty" style="display:none;">无匹配物品</div>';

    listEl.querySelectorAll('.searchable-select-item').forEach(row => {
        row.addEventListener('click', () => {
            const wrapper = listEl.closest('.searchable-select');
            const targetId = wrapper?.dataset.targetSelect;
            const select = targetId ? document.getElementById(targetId) : null;
            if (select) {
                // 关键修复：select.value = X 要求 select 必须有 value=X 的 option
                // 如果原 select 没填充 option，这里会静默失败（value 不变）
                const val = row.dataset.value;
                select.value = val;
                // 防御性检查：如果值没设置成功（option 不存在），手动补一个
                if (select.value !== val) {
                    const opt = document.createElement('option');
                    opt.value = val;
                    opt.textContent = row.querySelector('.ss-item-name')?.textContent || '';
                    select.appendChild(opt);
                    select.value = val;
                }
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
            const valueEl = wrapper?.querySelector('.searchable-select-value');
            if (valueEl) {
                const name = row.querySelector('.ss-item-name')?.textContent || '';
                const badge = row.querySelector('.quality-badge')?.textContent || '';
                valueEl.textContent = badge ? `[${badge}] ${name}` : name;
                valueEl.dataset.set = '1';
            }
            wrapper?.querySelector('.searchable-select-dropdown') && (wrapper.querySelector('.searchable-select-dropdown').style.display = 'none');
            wrapper?.querySelector('.searchable-select-trigger')?.classList.remove('open');
            // 简化：直接设置样式，等下次 open 时会重置
            const dd = wrapper?.querySelector('.searchable-select-dropdown');
            if (dd) {
                dd.style.display = 'none';
                dd.style.visibility = '';
                dd.style.position = '';
                dd.style.top = '';
                dd.style.left = '';
                dd.style.minWidth = '';
                dd.style.maxWidth = '';
            }
            wrapper?.querySelector('.searchable-select-trigger')?.classList.remove('open');
            // 自定义回调
            const cb = wrapper?._onChange;
            if (typeof cb === 'function') cb(row.dataset.value);
        });
    });
}

// 给原 select 填充 options（保证 select.value = X 能正常工作）
function _populateSelectOptions(select, items) {
    if (!select) return;
    // 保留第一个 option（通常是占位 "选择物品"）
    const firstOpt = select.querySelector('option');
    const firstValue = firstOpt ? firstOpt.value : '';
    const firstText = firstOpt ? firstOpt.textContent : '';
    // 清空并重建
    select.innerHTML = '';
    if (firstOpt) {
        const placeholder = document.createElement('option');
        placeholder.value = firstValue;
        placeholder.textContent = firstText;
        select.appendChild(placeholder);
    }
    items.forEach(item => {
        const id = item.item_id ?? item.id;
        if (id == null) return;
        const opt = document.createElement('option');
        opt.value = id;
        const cfg = QUALITY_CONFIG[item.quality] || QUALITY_CONFIG.white;
        opt.textContent = `[${cfg.label}] ${item.name || ''}`;
        select.appendChild(opt);
    });
}

// 批量替换页面内所有带特定选择器的 select
export function upgradeSelectsToSearchable(selector, items, options = {}) {
    document.querySelectorAll(selector).forEach(sel => {
        if (sel.dataset.searchableUpgraded === '1') {
            // 已升级过，只更新数据
            const wrapper = sel.nextElementSibling;
            if (wrapper && wrapper.classList.contains('searchable-select') && wrapper._updateItems) {
                wrapper._updateItems(items);
            }
            return;
        }
        sel.dataset.searchableUpgraded = '1';
        replaceWithSearchableSelect(sel, items, options);
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
        <div class="item-icon quality-${quality}" style="position:relative;width:${size}px;height:${size}px;overflow:hidden;flex-shrink:0;">
            <div class="item-fallback" style="width:100%;height:100%;background:var(--paper-bg);border:1.5px solid currentColor;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:${size * 0.45}px;color:currentColor;font-weight:700;">${initial}</div>
            ${hasImage ? `<img src="${imgPath}" alt="${escapedName}" class="item-image" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none;z-index:1;">` : ''}
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
    name.className = 'quality-' + item.quality + '-text';
    quality.textContent = cfg.label;
    quality.className = 'quality-badge quality-' + item.quality;
    type.textContent = typeCfg.label;
    type.className = 'type-badge';
    desc.textContent = item.description ? escapeHtml(item.description) : '暂无描述';
    amount.textContent = '拥有: ' + (item.owned || 0);

    const actionsDiv = document.getElementById('detail-actions');
    const metaDiv = document.querySelector('.detail-meta');
    let actionHtml = '';
    let extraMetaHtml = '';

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

    if (item.item_type === 'seed') {
        extraMetaHtml = '<div class="meta-item seed-crop-info" id="seed-crop-info"><span class="meta-loading">加载中...</span></div>';
    }

    if (extraMetaHtml) {
        metaDiv.insertAdjacentHTML('beforeend', extraMetaHtml);
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

    if (item.item_type === 'seed' && item.item_id) {
        loadSeedCropInfo(item.item_id);
    }

    document.getElementById('item-detail-modal').style.display = 'flex';
    _createIcons({ icons });
}

async function loadSeedCropInfo(itemId) {
    try {
        const { data, error } = await supabase
            .from('crops')
            .select('*, crop_item:items!crops_crop_id_fkey(name, image_name, quality, item_type)')
            .eq('seed_id', itemId)
            .single();
        if (!error && data) {
            const infoDiv = document.getElementById('seed-crop-info');
            if (infoDiv) {
                const growTime = formatTime(data.grow_seconds);
                infoDiv.innerHTML = `
                    <div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--ink-faded);">
                        <div style="font-weight:700;margin-bottom:6px;font-family:var(--font-mono);font-size:0.85rem;"><i data-lucide="sprout" style="width:14px;height:14px;vertical-align:middle;"></i> 种植信息</div>
                        <div style="font-size:0.85rem;color:var(--ink-soft);line-height:1.6;">
                            <div>收获物品：<span class="quality-${data.crop_item?.quality || 'white'}-text" style="font-weight:600;">${escapeHtml(data.crop_item?.name || '未知')}</span></div>
                            <div>生长时间：${growTime}</div>
                            <div>获得经验：+${data.exp_reward} EXP</div>
                            <div>掉落数量：${data.drop_quantity_min} ~ ${data.drop_quantity_max}</div>
                        </div>
                    </div>
                `;
                _createIcons({ icons });
            }
        }
    } catch (e) {
        console.error('加载种子作物信息失败:', e);
    }
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
