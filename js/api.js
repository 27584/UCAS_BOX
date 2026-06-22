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

export async function getMails(page = 1, limit = 20) {
    return rpc('get_user_mails', { p_page: page, p_limit: limit });
}

export async function markMailRead(mailId) {
    return rpc('mark_mail_read', { p_mail_id: mailId });
}

export async function getLotteryRound() {
    return rpc('get_lottery_round');
}

export async function buyLotteryTicket(numbers, quantity) {
    return rpc('buy_lottery_ticket', { p_numbers: numbers, p_quantity: quantity });
}

export async function getLotteryHistory(page = 1, limit = 10) {
    return rpc('get_lottery_history', { p_page: page, p_limit: limit });
}

export async function getUserLotteryTickets(roundId) {
    return rpc('get_user_tickets', { p_round_id: roundId });
}

export async function drawLotteryRound(roundId, customNumbers = null) {
    const params = { p_round_id: roundId };
    if (customNumbers !== null) {
        params.custom_numbers = customNumbers;
    }
    return rpc('draw_lottery_round', params);
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

// 获取用户设置
export async function getUserSettings() {
    const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .single();
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
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

export async function adminBotReplenish() {
    return rpc('admin_bot_replenish');
}

// 前端触发的机器人补货（任何人可调用，内置60分钟节流）
export async function triggerBotReplenish() {
    return rpc('trigger_bot_replenish');
}

export async function getAllBotsWithConfig() {
    return rpc('get_all_bots_with_config');
}

export async function updateBotConfig(config) {
    return rpc('update_bot_config', {
        p_bot_id: config.bot_id,
        p_enabled: config.enabled,
        p_min_orders: config.min_orders,
        p_max_orders: config.max_orders,
        p_qualities: config.qualities,
        p_price_white: config.price_white,
        p_price_green: config.price_green,
        p_price_blue: config.price_blue,
        p_price_purple: config.price_purple,
        p_price_orange: config.price_orange,
        p_price_red: config.price_red,
        p_qty_white: config.qty_white,
        p_qty_green: config.qty_green,
        p_qty_blue: config.qty_blue,
        p_qty_purple: config.qty_purple,
        p_qty_orange: config.qty_orange,
        p_qty_red: config.qty_red,
        p_price_fluctuation: config.price_fluctuation,
    });
}

export async function adminBotListItem(itemId, botId, quantity, price) {
    return rpc('admin_bot_list_item', {
        p_item_id: itemId,
        p_bot_id: botId,
        p_quantity: quantity,
        p_price: price,
    });
}

export async function adminBotCancelOrder(orderId) {
    return rpc('admin_bot_cancel_order', { p_order_id: orderId });
}

export async function getBotOrders(botId) {
    return rpc('get_bot_orders', { p_bot_id: botId });
}

export async function getAllUsers(page = 1, limit = 20) {
    return rpc('get_all_users', { p_page: page, p_limit: limit });
}

export async function getUserDetail(userId) {
    return rpc('admin_get_user_detail', { p_user_id: userId });
}

export async function getUserInventory(userId, page = 1, limit = 20) {
    return rpc('admin_get_user_inventory', { p_user_id: userId, p_page: page, p_limit: limit });
}

export async function getSystemStats() {
    return rpc('get_system_stats');
}

export async function adminGetItems(page = 1, limit = 50) {
    return rpc('admin_get_items', { p_page: page, p_limit: limit });
}

export async function adminAddItem(userId, itemId, quantity = 1) {
    return rpc('admin_add_item', {
        p_user_id: userId,
        p_item_id: itemId,
        p_quantity: quantity
    });
}

// 设置用户果壳币（管理员）
export async function adminUpdateUserShells(userId, shells) {
    return rpc('admin_update_user_shells', {
        p_user_id: userId,
        p_shells: shells
    });
}

// 增减用户果壳币（管理员）
export async function adminAdjustUserShells(userId, amount, reason = '') {
    return rpc('admin_adjust_user_shells', {
        p_user_id: userId,
        p_amount: amount,
        p_reason: reason
    });
}

// 移除用户物品（管理员）
export async function adminRemoveUserItem(userId, itemId, quantity = 1) {
    return rpc('admin_remove_user_item', {
        p_user_id: userId,
        p_item_id: itemId,
        p_quantity: quantity
    });
}

// 清空用户所有物品（管理员）
export async function adminClearUserItems(userId) {
    return rpc('admin_clear_user_items', { p_user_id: userId });
}

// 设置用户管理员权限（管理员）
export async function adminSetUserAdmin(userId, isAdmin) {
    return rpc('admin_set_user_admin', {
        p_user_id: userId,
        p_is_admin: isAdmin
    });
}

// 修改用户昵称（管理员）
export async function adminChangeUserNickname(userId, newNickname) {
    return rpc('admin_change_user_nickname', {
        p_user_id: userId,
        p_new_nickname: newNickname
    });
}

// 获取用户列表（管理员，带搜索）
export async function adminGetUsers(search = '', page = 1, limit = 20) {
    return rpc('admin_get_users', {
        p_search: search,
        p_page: page,
        p_limit: limit
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

export async function adminUpdateItemDefinition(itemId, name, quality, itemType, imageName, description, dropWeight) {
    return rpc('admin_update_item_definition', {
        p_item_id: itemId,
        p_name: name,
        p_quality: quality,
        p_item_type: itemType,
        p_image_name: imageName,
        p_description: description,
        p_drop_weight: dropWeight
    });
}

// 投稿 API
export async function submitItem(name, quality, description, dropWeight = 100, imageName = '') {
    return rpc('submit_item', {
        p_name: name,
        p_quality: quality,
        p_description: description,
        p_drop_weight: dropWeight,
        p_image_name: imageName
    });
}

export async function getMySubmissions() {
    return rpc('get_my_submissions');
}

export async function getPendingSubmissions(page = 1, limit = 20) {
    return rpc('get_pending_submissions', { p_page: page, p_limit: limit });
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

// 使用端午节福袋
export async function useDragonBoatBag() {
    return rpc('use_dragon_boat_bag');
}

// 端午活动 - 更新在线时间并领取在线礼包
export async function claimDragonBoatOnline() {
    return rpc('claim_dragon_boat_online');
}

// 收藏品合成
export async function mergeCollections(itemIds) {
    return rpc('merge_collections', { p_item_ids: itemIds });
}

// 获取最低版本要求
export async function getMinVersion() {
    return rpc('get_min_version');
}

// ============================================
// 动态功能
// ============================================

export async function createPost(content, tags = []) {
    return rpc('create_post', { p_content: content, p_tags: tags });
}

export async function getPosts(limit = 20, offset = 0, tag = null) {
    return rpc('get_posts', { p_limit: limit, p_offset: offset, p_tag: tag });
}

export async function getPost(postId) {
    return rpc('get_post', { p_post_id: postId });
}

export async function toggleLike(targetType, targetId) {
    return rpc('toggle_like', { p_target_type: targetType, p_target_id: targetId });
}

export async function createComment(postId, content, parentId = null) {
    return rpc('create_comment', { p_post_id: postId, p_content: content, p_parent_id: parentId });
}

export async function getComments(postId) {
    return rpc('get_comments', { p_post_id: postId });
}

export async function deletePost(postId) {
    return rpc('delete_post', { p_post_id: postId });
}

export async function deleteComment(commentId) {
    return rpc('delete_comment', { p_comment_id: commentId });
}

// ============================================
// 用户主页功能
// ============================================

export async function getUserProfile(userId) {
    return rpc('get_user_profile', { p_user_id: userId });
}

export async function getUserPosts(userId, limit = 20, offset = 0) {
    return rpc('get_user_posts', { p_user_id: userId, p_limit: limit, p_offset: offset });
}

export async function getUserInventoryPublic(userId, page = 1, limit = 50) {
    return rpc('get_user_inventory_public', { p_user_id: userId, p_page: page, p_limit: limit });
}

// ============================================
// 关注功能
// ============================================

export async function toggleFollow(userId) {
    return rpc('toggle_follow', { p_target_user_id: userId });
}

export async function checkFollowing(userId) {
    return rpc('check_following', { p_target_user_id: userId });
}

export async function getFollowers(userId, limit = 50, offset = 0) {
    return rpc('get_followers', { p_user_id: userId, p_limit: limit, p_offset: offset });
}

export async function getFollowing(userId, limit = 50, offset = 0) {
    return rpc('get_following', { p_user_id: userId, p_limit: limit, p_offset: offset });
}

// ============================================
// 搜索
// ============================================

export async function searchPosts(query, limit = 20, offset = 0) {
    return rpc('search_posts', { p_query: query, p_limit: limit, p_offset: offset });
}

export async function searchUsers(query, limit = 20, offset = 0) {
    return rpc('search_users', { p_query: query, p_limit: limit, p_offset: offset });
}

// ============================================
// 用户设置
// ============================================

export async function updateProfileSetting(settingKey, settingValue) {
    return rpc('update_profile_setting', { p_key: settingKey, p_value: settingValue });
}

export async function getUserSettingsFull() {
    const result = await rpc('get_user_settings_full');
    return Array.isArray(result) ? result[0] : result;
}

export async function checkAllowFollow(userId) {
    return rpc('check_allow_follow', { p_target_user_id: userId });
}

// ============================================
// 私信功能
// ============================================

export async function getDmConversations(limit = 50, offset = 0) {
    return rpc('get_dm_conversations', { p_limit: limit, p_offset: offset });
}

export async function sendPrivateMessage(receiverId, content) {
    return rpc('send_private_message', { p_receiver_id: receiverId, p_content: content });
}

export async function getDmHistory(otherUserId, limit = 50, offset = 0) {
    return rpc('get_dm_history', { p_other_user_id: otherUserId, p_limit: limit, p_offset: offset });
}

export async function markDmRead(otherUserId) {
    return rpc('mark_dm_read', { p_other_user_id: otherUserId });
}

export async function getUnreadDmCount() {
    return rpc('get_unread_dm_count');
}
