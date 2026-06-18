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
        showToast(error.message, 'error');
        throw error;
    }
    showToast('注册成功，请查收邮件验证（如未开启验证则可直接登录）', 'success');
    return data;
}

export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        showToast(error.message, 'error');
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

export async function buyMarketOrder(orderId) {
    return rpc('buy_market_order', { p_order_id: orderId });
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
    const { data, error } = await supabase
        .from('inventory')
        .select('*, items(*)')
        .order('acquired_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function getMarketOrders() {
    const { data, error } = await supabase
        .from('market_orders')
        .select('*, items(*), profiles!seller_id(nickname)')
        .eq('status', 'active')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function getItems() {
    const { data, error } = await supabase
        .from('items')
        .select('*')
        .order('id');
    if (error) throw error;
    return data || [];
}
