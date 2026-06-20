import { supabase, currentUser, refreshSession } from './supabaseClient.js';
import { router } from './router.js';
import { getProfile, getMails, getUnreadDmCount, checkAdmin } from './api.js';
import { formatNumber, showToast } from './utils.js';

// ============================================
// 认证状态管理
// ============================================

export async function initAuth() {
    await refreshSession();
    updateNavVisibility();
    updateGlobalShells();
    updateMailBadge();
    updateAdminNav();
    checkEmailVerification();

    supabase.auth.onAuthStateChange((event, session) => {
        updateNavVisibility();
        updateGlobalShells();
        updateMailBadge();
        updateAdminNav();
        checkEmailVerification();
        const hash = window.location.hash.replace('#', '') || 'lobby';
        if (!session && hash !== 'auth') {
            router.navigate('auth');
        } else if (session && hash === 'auth') {
            router.navigate('lobby');
        } else {
            // 登录状态下切换页面后同步导航状态
            const currentRoute = window.location.hash.replace('#', '') || 'lobby';
            document.querySelectorAll('.nav-link').forEach(link => {
                link.classList.toggle('active', link.dataset.route === currentRoute);
            });
        }
    });
}

export async function checkEmailVerification() {
    const banner = document.getElementById('email-unverified-banner');
    if (!banner) return;
    
    if (!currentUser) {
        banner.style.display = 'none';
        return;
    }
    
    // 检查邮箱是否已验证 (email_confirmed_at 不为 null)
    const isVerified = !!currentUser.email_confirmed_at;
    
    if (!isVerified) {
        banner.style.display = 'flex';
        banner.querySelector('#unverified-email').textContent = currentUser.email;
    } else {
        banner.style.display = 'none';
    }
}

export async function resendVerificationEmail() {
    if (!currentUser) return;
    
    const btn = document.getElementById('resend-verification-btn');
    if (btn) btn.disabled = true;
    
    try {
        const { error } = await supabase.auth.resend({
            type: 'signup',
            email: currentUser.email
        });
        
        if (error) {
            showToast('发送失败: ' + error.message, 'error');
        } else {
            showToast('验证邮件已发送，请查收邮箱', 'success');
        }
    } catch (e) {
        showToast('发送失败，请稍后重试', 'error');
    } finally {
        if (btn) {
            setTimeout(() => { btn.disabled = false; }, 30000); // 30秒冷却
        }
    }
}

export async function updateGlobalShells() {
    if (!currentUser) return;
    try {
        const profile = await getProfile();
        const el = document.getElementById('global-shells');
        if (el && profile) {
            el.textContent = formatNumber(profile.shells);
        }
    } catch (e) {
        console.error('Failed to update shells:', e);
    }
}

export async function updateMailBadge() {
    if (!currentUser) {
        document.getElementById('mail-badge')?.style.setProperty('display', 'none');
        document.getElementById('header-mail-badge')?.style.setProperty('display', 'none');
        return;
    }
    try {
        // 同时检查未读系统消息和未读私信
        const [mails, dmUnread] = await Promise.all([
            getMails(),
            getUnreadDmCount().catch(() => 0)
        ]);
        const mailUnread = mails.filter(m => !m.is_read).length;
        // 优先显示私信红点（如果有未读私信）
        const totalUnread = mailUnread + (parseInt(dmUnread) || 0);
        
        const navBadge = document.getElementById('mail-badge');
        const headerBadge = document.getElementById('header-mail-badge');
        if (navBadge) {
            navBadge.textContent = totalUnread > 99 ? '99+' : totalUnread;
            navBadge.style.display = totalUnread > 0 ? 'flex' : 'none';
        }
        if (headerBadge) {
            headerBadge.textContent = totalUnread > 99 ? '99+' : totalUnread;
            headerBadge.style.display = totalUnread > 0 ? 'flex' : 'none';
        }
    } catch (e) {
        // silently fail
    }
}

export async function updateAdminNav() {
    if (!currentUser) {
        document.getElementById('nav-admin')?.style.setProperty('display', 'none');
        document.getElementById('nav-admin-bottom')?.style.setProperty('display', 'none');
        return;
    }
    try {
        const isAdmin = await checkAdmin();
        document.getElementById('nav-admin')?.style.setProperty('display', isAdmin ? 'flex' : 'none');
        document.getElementById('nav-admin-bottom')?.style.setProperty('display', isAdmin ? 'flex' : 'none');
    } catch (e) {
        document.getElementById('nav-admin')?.style.setProperty('display', 'none');
        document.getElementById('nav-admin-bottom')?.style.setProperty('display', 'none');
    }
}

export function updateNavVisibility() {
    const isLoggedIn = !!currentUser;
    const topNav = document.getElementById('top-nav');
    const bottomNav = document.getElementById('bottom-nav');
    if (topNav) topNav.style.display = isLoggedIn ? 'flex' : 'none';
    if (bottomNav) bottomNav.style.display = isLoggedIn ? 'flex' : 'none';
    
    // 同步当前路由的导航选中状态
    if (isLoggedIn) {
        const currentRoute = window.location.hash.replace('#', '') || 'lobby';
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.dataset.route === currentRoute);
        });
    }
}

export function requireAuth() {
    if (!currentUser) {
        router.navigate('auth');
        return false;
    }
    return true;
}
