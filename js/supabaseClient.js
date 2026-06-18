import { createClient } from '@supabase/supabase-js';

// ============================================
// Supabase 配置（请替换为你的项目配置）
// ============================================
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 当前会话缓存
export let currentUser = null;

export async function refreshSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
        console.error('获取会话失败:', error);
        currentUser = null;
        return null;
    }
    if (session?.user) {
        currentUser = session.user;
    } else {
        currentUser = null;
    }
    return session;
}

export async function getCurrentProfile() {
    if (!currentUser) return null;
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();
    if (error) {
        console.error('获取资料失败:', error);
        return null;
    }
    return data;
}

// 监听认证状态变化
supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
        currentUser = session.user;
    } else {
        currentUser = null;
    }
});
