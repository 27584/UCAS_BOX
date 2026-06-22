import { initAuth, resendVerificationEmail, updateMailBadge } from './auth.js';
import { router } from './router.js';
import { createIcons, icons } from 'lucide';
import { showToast, itemImageHTML, openItemDetail, QUALITY_CONFIG, initItemImages } from './utils.js';
import { useRenameCard, useDragonBoatBag, getMinVersion } from './api.js';
import { formatNumber } from './utils.js';
import { VERSION, VERSION_CODE } from './version.js';
import { currentUser } from './supabaseClient.js';

// ============================================
// 应用入口
// ============================================

// 将需要全局调用的函数挂载到 window
window.resendVerificationEmail = resendVerificationEmail;
window.openRenameModal = openRenameModal;
window.useDragonBoatBag = useDragonBoatBagMain;

async function bootstrap() {
    // 版本检测
    await checkVersion();

    await initAuth();
    router.handleRoute();

    // 初始化图标
    createIcons({ icons });

    // 每次路由切换后刷新图标和物品图片
    window.addEventListener('hashchange', () => {
        setTimeout(() => {
            createIcons({ icons });
        }, 50);
        // 延迟更长时间确保页面内容已渲染
        setTimeout(() => {
            initItemImages();
        }, 300);
    });

    // 全局每秒刷新一次图标和物品图片（应对动态内容）
    setInterval(() => {
        createIcons({ icons });
        initItemImages();
    }, 2000);

    // 定期刷新消息红点（每15秒检查一次未读私信和系统消息）
    setInterval(() => {
        if (currentUser) {
            updateMailBadge();
        }
    }, 15000);
}

// 版本检测
async function checkVersion() {
    try {
        const result = await getMinVersion();
        if (result && result.min_version_code > VERSION_CODE) {
            showVersionUpdateModal(result);
        }
    } catch (e) {
        console.error('版本检测失败:', e);
    }
}

// 显示版本更新提示弹窗
function showVersionUpdateModal(result) {
    const modalHtml = `
        <div id="version-modal" class="modal" style="display:flex;z-index:99999;">
            <div class="modal-overlay"></div>
            <div class="modal-content" style="padding:32px 24px 24px;max-width:400px;width:90%;text-align:center;">
                <div style="display:flex;justify-content:center;margin-bottom:14px;">
                    <div class="seal seal-lg">升级</div>
                </div>
                <h3 style="margin:0 0 12px;color:var(--ink);font-family:var(--font-display);font-size:1.4rem;text-transform:uppercase;letter-spacing:1.5px;">
                    版本过低
                </h3>
                <p style="color:var(--ink-soft);margin-bottom:6px;font-family:var(--font-mono);font-size:0.85rem;">
                    当前版本 <span style="color:var(--ink);font-weight:700;">${VERSION}</span>
                </p>
                <p style="color:var(--ink-soft);margin-bottom:14px;font-family:var(--font-mono);font-size:0.85rem;">
                    最低要求 <span style="color:var(--seal-red);font-weight:700;">${result.min_version}</span>
                </p>
                <p style="color:var(--ink);margin-bottom:18px;font-size:0.95rem;line-height:1.6;background:var(--paper-bg);padding:10px 14px;border:1px dashed var(--ink-faded);">
                    ${result.message}
                </p>
                <button id="version-close-btn" class="btn btn-primary" style="width:100%;">
                    我知道了
                </button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    createIcons({ icons });

    const modal = document.getElementById('version-modal');
    const closeBtn = document.getElementById('version-close-btn');

    closeBtn.addEventListener('click', () => modal.remove());
    modal.querySelector('.modal-overlay').addEventListener('click', () => modal.remove());
}

bootstrap();

// ============================================
// 改名卡弹窗
// ============================================
function openRenameModal() {
    const modalHtml = `
        <div id="rename-modal" class="modal" style="display:flex;">
            <div class="modal-overlay" id="rename-overlay"></div>
            <div class="modal-content" style="max-width:400px;width:90%;text-align:center;padding-top:36px;">
                <div style="display:flex;justify-content:center;margin-bottom:12px;">
                    <div class="seal">改名</div>
                </div>
                <h3 style="margin:0 0 14px;color:var(--ink);font-family:var(--font-display);font-size:1.3rem;text-transform:uppercase;letter-spacing:1.5px;">
                    使用改名卡
                </h3>
                <p class="handwritten" style="color:var(--ink-soft);margin-bottom:14px;font-size:0.95rem;">
                    写上你的新名字
                </p>
                <input type="text" id="new-nickname-input" class="form-input"
                    placeholder="请输入新昵称" maxlength="10"
                    style="width:100%;margin-bottom:14px;text-align:center;" />
                <div style="display:flex;gap:10px;">
                    <button id="rename-cancel-btn" class="btn btn-secondary" style="flex:1;">
                        取消
                    </button>
                    <button id="rename-confirm-btn" class="btn btn-primary" style="flex:1;">
                        确认修改
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    createIcons({ icons });
    
    const modal = document.getElementById('rename-modal');
    const input = document.getElementById('new-nickname-input');
    const confirmBtn = document.getElementById('rename-confirm-btn');
    const cancelBtn = document.getElementById('rename-cancel-btn');
    
    input.focus();
    
    function closeModal() {
        modal.remove();
    }
    
    cancelBtn.addEventListener('click', closeModal);
    document.getElementById('rename-overlay').addEventListener('click', closeModal);
    
    confirmBtn.addEventListener('click', async () => {
        const newNickname = input.value.trim();
        
        if (!newNickname || newNickname.length < 2) {
            showToast('昵称至少需要2个字符', 'error');
            return;
        }
        
        if (newNickname.length > 10) {
            showToast('昵称不能超过10个字符', 'error');
            return;
        }
        
        confirmBtn.disabled = true;
        confirmBtn.textContent = '修改中...';
        
        try {
            const result = await useRenameCard(newNickname);
            
            if (result.success) {
                showToast('昵称修改成功！', 'success');
                // 更新页面上的昵称显示
                const nicknameEl = document.querySelector('.user-nickname');
                if (nicknameEl) nicknameEl.textContent = newNickname;
                const navNickname = document.querySelector('#user-dropdown .user-name');
                if (navNickname) navNickname.textContent = newNickname;
                closeModal();
                
                // 刷新背包页面显示
                if (window.refreshInventory) {
                    window.refreshInventory();
                }
            } else {
                showToast(result.message || '修改失败', 'error');
            }
        } catch (e) {
            showToast('修改失败，请稍后重试', 'error');
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = '确认修改';
        }
    });
    
    // 回车确认
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') confirmBtn.click();
    });
}

// ============================================
// 通用开盒结果弹窗
// ============================================
function showDropModal(item) {
    try {
        console.log('[showDropModal] called with:', item);
        // 兼容 lobby 的字段（out_item_xxx）和 福袋的字段（item_xxx）
        const name = (item && (item.out_item_name || item.item_name || item.name)) || '未知物品';
        const quality = (item && (item.out_item_quality || item.item_quality || item.quality)) || 'white';
        const image = item && (item.out_item_image || item.item_image || item.image_name);

        // 移除已存在的弹窗
        const old = document.getElementById('dragon-boat-result-modal');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.className = 'drop-modal show';  // 直接加 show 确保可见
        overlay.id = 'dragon-boat-result-modal';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(31,26,18,0.6);padding:20px;';

        const cfg = (typeof QUALITY_CONFIG !== 'undefined' && QUALITY_CONFIG[quality]) || { label: quality };
        let itemHtml = '';
        try {
            if (typeof itemImageHTML === 'function') {
                itemHtml = itemImageHTML(name, quality, image, 100);
            }
        } catch (e) {
            console.error('[showDropModal] itemImageHTML error:', e);
            itemHtml = '<div style="width:100px;height:100px;display:flex;align-items:center;justify-content:center;border:2px solid #000;font-size:40px;">' + (name ? name.charAt(0) : '?') + '</div>';
        }

        overlay.innerHTML =
            '<div class="drop-modal-box" style="position:relative;width:320px;max-width:100%;background:#fdfaf3;border:1.5px solid #2a2218;padding:40px 24px 24px;text-align:center;box-shadow:6px 6px 0 rgba(0,0,0,0.15);">' +
                '<div class="drop-modal-seal" style="position:absolute;top:-10px;left:50%;transform:translateX(-50%) rotate(-3deg);width:50px;height:20px;background:#a8371f;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.25);"></div>' +
                '<div class="drop-modal-title" style="font-size:1.5rem;color:#a8371f;margin:0 0 20px;font-weight:700;letter-spacing:2px;display:inline-block;transform:rotate(-2deg);">恭喜获得</div>' +
                '<div class="drop-modal-icon quality-' + quality + '" style="width:110px;height:110px;margin:0 auto 16px;border:1.5px solid currentColor;background:#f5f0e6;display:flex;align-items:center;justify-content:center;box-shadow:3px 3px 0 #2a2218;">' +
                    itemHtml +
                '</div>' +
                '<div class="drop-modal-name quality-' + quality + '-text" style="font-size:1.25rem;font-weight:700;margin:0 0 8px;letter-spacing:0.5px;line-height:1.3;">' + name + '</div>' +
                '<div class="drop-modal-badge quality-' + quality + '" style="display:inline-block;padding:3px 12px;font-size:0.75rem;font-weight:700;letter-spacing:1.5px;border:1.5px solid currentColor;background:#fdfaf3;margin-bottom:20px;">' + cfg.label + '</div>' +
                '<button class="drop-modal-btn" id="drop-modal-close" style="display:block;width:100%;margin:0;padding:12px 20px;background:#2a2218;color:#fdfaf3;border:1.5px solid #2a2218;font-size:0.9rem;font-weight:700;letter-spacing:2px;cursor:pointer;box-shadow:3px 3px 0 #a8371f;">收 下</button>' +
            '</div>';

        document.body.appendChild(overlay);
        console.log('[showDropModal] overlay appended, id =', overlay.id);

        const close = () => {
            overlay.style.opacity = '0';
            setTimeout(() => {
                overlay.remove();
                if (window.refreshInventory) window.refreshInventory();
            }, 200);
        };

        const closeBtn = overlay.querySelector('#drop-modal-close');
        if (closeBtn) closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
    } catch (err) {
        console.error('[showDropModal] error:', err);
        alert('弹窗打开失败: ' + err.message);
    }
}
window.showDropModal = showDropModal;
console.log('[main.js] showDropModal registered, typeof =', typeof window.showDropModal);

// ============================================
// 端午节福袋
// ============================================
async function useDragonBoatBagMain() {
    const result = await useDragonBoatBag();

    if (result && result.success) {
        showToast(result.message, 'success');
        showDropModal({
            item_id: result.item_id,
            item_name: result.item_name,
            item_quality: result.item_quality,
            item_image: result.item_image
        });
    } else {
        showToast(result?.message || '打开失败', 'error');
    }
}
