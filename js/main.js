import { initAuth, resendVerificationEmail } from './auth.js';
import { router } from './router.js';
import { createIcons, icons } from 'lucide';
import { showToast, itemImageHTML, openItemDetail, QUALITY_CONFIG } from './utils.js';
import { useRenameCard, useDragonBoatBag } from './api.js';
import { formatNumber } from './utils.js';

// ============================================
// 应用入口
// ============================================

// 将需要全局调用的函数挂载到 window
window.resendVerificationEmail = resendVerificationEmail;
window.openRenameModal = openRenameModal;
window.useDragonBoatBag = useDragonBoatBagMain;

async function bootstrap() {
    await initAuth();
    router.handleRoute();

    // 初始化图标
    createIcons({ icons });

    // 每次路由切换后刷新图标
    window.addEventListener('hashchange', () => {
        setTimeout(() => createIcons({ icons }), 50);
    });

    // 全局每秒刷新一次图标（应对动态内容）
    setInterval(() => createIcons({ icons }), 2000);
}

bootstrap();

// ============================================
// 改名卡弹窗
// ============================================
function openRenameModal() {
    const modalHtml = `
        <div id="rename-modal" class="modal" style="display:flex;">
            <div class="modal-overlay" id="rename-overlay"></div>
            <div class="modal-content" style="background:var(--bg-secondary);border-radius:16px;padding:24px;max-width:400px;width:90%;text-align:center;">
                <h3 style="margin:0 0 20px;color:var(--text-primary);">
                    <i data-lucide="edit-3" style="color:var(--accent-gold);"></i>
                    使用改名卡
                </h3>
                <p style="color:var(--text-secondary);margin-bottom:16px;font-size:14px;">
                    输入新的昵称（2-20个字符）
                </p>
                <input type="text" id="new-nickname-input" class="form-input" 
                    placeholder="请输入新昵称" maxlength="20" 
                    style="width:100%;margin-bottom:16px;text-align:center;" />
                <div style="display:flex;gap:12px;">
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
        
        if (newNickname.length > 20) {
            showToast('昵称不能超过20个字符', 'error');
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
// 端午节福袋
// ============================================
async function useDragonBoatBagMain() {
    const result = await useDragonBoatBag();
    
    if (result && result.success) {
        showToast(result.message, 'success');
        
        const item = {
            item_id: result.item_id,
            name: result.item_name,
            quality: result.item_quality,
            image_name: result.item_image
        };
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:10000;';
        
        const cfg = QUALITY_CONFIG[item.quality] || QUALITY_CONFIG.white;
        const itemHtml = itemImageHTML(item.name, item.quality, item.image_name, 100);
        
        modal.innerHTML = '<div style="background:#1a1f2e;border-radius:20px;padding:32px;text-align:center;max-width:320px;width:90%;">' +
            '<h3 style="color:#f8fafc;margin:0 0 24px;font-size:20px;">恭喜获得</h3>' +
            '<div style="width:100px;height:100px;margin:0 auto 16px;border-radius:16px;background:linear-gradient(135deg,' + cfg.bg + ',rgba(30,41,59,0.8));display:flex;align-items:center;justify-content:center;font-size:60px;border:2px solid ' + cfg.color + ';">' +
            itemHtml +
            '</div>' +
            '<div style="font-size:24px;font-weight:700;color:' + cfg.color + ';margin-bottom:8px;">' + item.name + '</div>' +
            '<span class="quality-badge quality-' + item.quality + '">' + cfg.label + '</span>' +
            '<button class="btn btn-primary" style="margin-top:24px;width:100%;" id="dragon-boat-result-close">确定</button>' +
            '</div>';
        
        document.body.appendChild(modal);
        
        modal.querySelector('#dragon-boat-result-close').addEventListener('click', () => {
            modal.remove();
            if (window.refreshInventory) window.refreshInventory();
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    } else {
        showToast(result?.message || '打开失败', 'error');
    }
}
