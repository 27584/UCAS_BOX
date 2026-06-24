import { supabase } from './supabaseClient.js';
import { showToast } from './utils.js';

// ============================================
// API 封装（所有后端操作通过 RPC 或 RLS 查询）
// ============================================

export async function rpc(functionName, params = {}) {
    const { data, error } = await supabase.rpc(functionName, params);
    if (error) {
        console.error(`RPC ${functionName} 失败:`, error);
        console.error('RPC params:', JSON.stringify(params));
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

export async function getItemTradeHistory(itemId, limit = 50) {
    const data = await rpc('get_item_trade_history', { p_item_id: itemId, p_limit: limit });
    return data || [];
}

export async function getItemTradeStats(itemId, groupBy = 'hour') {
    const data = await rpc('get_item_trade_stats', { p_item_id: itemId, p_group_by: groupBy });
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

// ============================================
// 农场相关 API
// ============================================
export async function getFarmInfo() {
    return rpc('get_farm_info');
}

export async function plantSeed(plotId, cropId) {
    return rpc('plant_seed', { p_plot_id: plotId, p_crop_id: cropId });
}

export async function harvestCrop(plotId) {
    return rpc('harvest_crop', { p_plot_id: plotId });
}

export async function harvestAllReady() {
    return rpc('harvest_all_ready');
}

export async function speedUpPlot(plotId, seconds) {
    return rpc('speed_up_plot', { p_plot_id: plotId, p_seconds: seconds });
}

export async function grantSeed(seedName, quantity = 1) {
    return rpc('grant_seed', { p_seed_name: seedName, p_quantity: quantity });
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

// 关注/粉丝系统
export async function toggleFollow(targetUserId) {
    return rpc('toggle_follow', { p_target_user_id: targetUserId });
}

export async function checkFollowing(targetUserId) {
    return rpc('check_following', { p_target_user_id: targetUserId });
}

export async function getFollowers(userId, limit = 50, offset = 0) {
    return rpc('get_followers', { p_user_id: userId, p_limit: limit, p_offset: offset });
}

export async function getFollowing(userId, limit = 50, offset = 0) {
    return rpc('get_following', { p_user_id: userId, p_limit: limit, p_offset: offset });
}

export async function getFriendsWithOnline(userId, limit = 50) {
    return rpc('get_friends_with_online', { p_user_id: userId, p_limit: limit });
}

export async function getFollowingWithOnline(userId, limit = 50) {
    return rpc('get_following_with_online', { p_user_id: userId, p_limit: limit });
}

export async function getFollowersWithOnline(userId, limit = 50) {
    return rpc('get_followers_with_online', { p_user_id: userId, p_limit: limit });
}

export async function userPing() {
    return rpc('user_ping');
}

// 回复通知系统
export async function getReplyNotifications(page = 1, limit = 20) {
    return rpc('get_reply_notifications', { p_page: page, p_limit: limit });
}

export async function markNotificationRead(notificationId) {
    return rpc('mark_notification_read', { p_notification_id: notificationId });
}

export async function markAllNotificationsRead() {
    return rpc('mark_all_notifications_read');
}

export async function getUnreadNotificationCount() {
    return rpc('get_unread_notification_count');
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

export async function adminGetItems(page = 1, limit = 50, search = '', quality = '', itemType = '') {
    return rpc('admin_get_items', {
        p_page: page,
        p_limit: limit,
        p_search: search || null,
        p_quality: quality || null,
        p_item_type: itemType || null
    });
}

export async function adminGetAllItems() {
    return rpc('admin_get_all_items');
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

// 删除物品定义（管理员）
export async function adminDeleteItem(itemId) {
    return rpc('admin_delete_item', { p_item_id: itemId });
}

// 删除用户（管理员）
export async function adminDeleteUser(userId) {
    return rpc('admin_delete_user', { p_user_id: userId });
}

// 查询某用户邮箱是否已激活（按需调用，读取 auth.users.email_confirmed_at 原生字段）
export async function getUserEmailVerified(userId) {
    return rpc('check_email_verified', { p_user_id: userId });
}

// 修改用户昵称（管理员）
export async function adminChangeUserNickname(userId, newNickname) {
    return rpc('admin_change_user_nickname', {
        p_user_id: userId,
        p_new_nickname: newNickname
    });
}

// 管理员创建新用户（可选机器人）
export async function adminCreateUser(email, password, nickname, isBot = false) {
    return rpc('admin_create_user', {
        p_email: email,
        p_password: password,
        p_nickname: nickname,
        p_is_bot: isBot
    });
}

// 获取用户列表（管理员，带搜索 + 后端分页 + 机器人筛选）
export async function adminGetUsers(search = '', page = 1, limit = 20, isBot = null) {
    return rpc('admin_get_users', {
        p_search: search,
        p_page: page,
        p_limit: limit,
        p_is_bot: isBot
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

export async function adminUpdateCropConfig(seedId, cropId, growSeconds, expReward, dropMin, dropMax) {
    return rpc('admin_update_crop_config', {
        p_seed_id: seedId,
        p_crop_id: cropId,
        p_grow_seconds: growSeconds,
        p_exp_reward: expReward,
        p_drop_min: dropMin,
        p_drop_max: dropMax
    });
}

export async function adminGetCropBySeedId(seedId) {
    return rpc('admin_get_crop_by_seed_id', { p_seed_id: seedId });
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
