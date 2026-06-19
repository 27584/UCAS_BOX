import { supabase } from './supabaseClient.js';
import { showToast } from './utils.js';

// ============================================
// API 封装（所有后端操作通过 RPC 或 RLS 查询）
// ============================================

export async function rpc(functionName, params = {}) {
    const { data, error } = await supabase.rpc(functionName, params);
    if (error) {
        console.error(`RPC ${functionName} 失败:`, error);
        showToast(error.message || '操作失败', 'error');
        throw error;
    }
    return data;
}

// 认证相关
export async function signUp(email, password, nickname) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { nickname } }
    });
    if (error) {
        const msg = error.message?.toLowerCase?.() || '';
        if (msg.includes('rate limit') || msg.includes('429') || msg.includes('over email send rate limit')) {
            showToast('操作太频繁，请 1 小时后再试', 'error');
        } else if (msg.includes('already registered') || msg.includes('already exists')) {
            showToast('该邮箱已注册，请直接登录', 'error');
        } else {
            showToast(error.message, 'error');
        }
        throw error;
    }
    
    // Supabase 对已存在邮箱会静默返回成功（不发送邮件）
    // 检查 identities 是否为空来判断是否真正注册
    if (data?.user?.identities?.length === 0) {
        showToast('该邮箱已注册，请直接登录', 'error');
        throw new Error('该邮箱已注册');
    }
    
    showToast('注册成功，请查收邮件验证', 'success');
    return data;
}

export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        const msg = error.message?.toLowerCase?.() || '';
        if (msg.includes('rate limit') || msg.includes('429') || msg.includes('over email send rate limit')) {
            showToast('操作太频繁，请 1 小时后再试', 'error');
        } else if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
            showToast('邮箱尚未验证，请查收验证邮件后登录', 'error');
        } else {
            showToast(error.message, 'error');
        }
        throw error;
    }
    showToast('登录成功', 'success');
    return data;
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
        showToast(error.message, 'error');
        throw error;
    }
    showToast('已退出登录', 'info');
}

// 游戏逻辑 RPC
export async function claimIdleRewards() {
    return rpc('claim_idle_rewards');
}

export async function openBox() {
    return rpc('open_box');
}

export async function placeMarketOrder(itemId, price, quantity = 1) {
    return rpc('place_market_order', {
        p_item_id: itemId,
        p_price: price,
        p_quantity: quantity
    });
}

export async function cancelMarketOrder(orderId) {
    return rpc('cancel_market_order', { p_order_id: orderId });
}

export async function buyMarketOrder(orderId, quantity = null) {
    return rpc('buy_market_order', { p_order_id: orderId, p_quantity: quantity });
}

export async function getCollectionProgress() {
    return rpc('get_collection_progress');
}

export async function claimAdRewards() {
    return rpc('claim_ad_rewards');
}

export async function getIdleBoost() {
    return rpc('get_idle_boost');
}

export async function getMails() {
    return rpc('get_user_mails');
}

export async function markMailRead(mailId) {
    return rpc('mark_mail_read', { p_mail_id: mailId });
}

// 查询（受RLS保护）
export async function getProfile() {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .single();
    if (error) throw error;
    return data;
}

export async function getInventory() {
    return rpc('get_user_inventory');
}

export async function getMarketOrders(page = 1, limit = 10, quality = null, sort = 'newest', search = null, type = null) {
    return rpc('get_market_orders', {
        p_page: page,
        p_limit: limit,
        p_quality: quality,
        p_sort: sort,
        p_search: search,
        p_type: type
    });
}

export async function getItems() {
    const { data, error } = await supabase
        .from('items')
        .select('*')
        .order('id');
    if (error) throw error;
    return data || [];
}

// 管理员 API
export async function checkAdmin() {
    return rpc('check_admin');
}

export async function getAllUsers() {
    return rpc('get_all_users');
}

export async function getSystemStats() {
    return rpc('get_system_stats');
}

export async function adminGetItems() {
    return rpc('admin_get_items');
}

export async function adminAddItem(userId, itemId, quantity = 1) {
    return rpc('admin_add_item', {
        p_user_id: userId,
        p_item_id: itemId,
        p_quantity: quantity
    });
}

export async function adminAddItemDefinition(name, quality, imageName, description, dropWeight) {
    return rpc('admin_add_item_definition', {
        p_name: name,
        p_quality: quality,
        p_image_name: imageName,
        p_description: description,
        p_drop_weight: dropWeight
    });
}

// 投稿 API
export async function submitItem(name, quality, description, dropWeight = 100) {
    return rpc('submit_item', {
        p_name: name,
        p_quality: quality,
        p_description: description,
        p_drop_weight: dropWeight
    });
}

export async function getMySubmissions() {
    return rpc('get_my_submissions');
}

export async function getPendingSubmissions() {
    return rpc('get_pending_submissions');
}

export async function approveSubmission(submissionId, rewardShells) {
    return rpc('approve_submission', {
        p_submission_id: submissionId,
        p_reward_shells: rewardShells
    });
}

export async function rejectSubmission(submissionId, adminNote) {
    return rpc('reject_submission', {
        p_submission_id: submissionId,
        p_admin_note: adminNote
    });
}

// 使用改名卡修改昵称
export async function useRenameCard(newNickname) {
    return rpc('use_rename_card', {
        p_new_nickname: newNickname
    });
}
