-- 迁移脚本：添加搜索功能
-- 在 Supabase SQL Editor 中执行此文件

-- 1. 添加 allow_search 字段到 user_settings
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_settings' AND column_name = 'allow_search') THEN
        ALTER TABLE public.user_settings ADD COLUMN allow_search BOOLEAN DEFAULT true NOT NULL;
    END IF;
END $$;

-- 2. 更新 update_profile_setting 函数（加入 allow_search）
DROP FUNCTION IF EXISTS public.update_profile_setting(TEXT, BOOLEAN);
CREATE OR REPLACE FUNCTION public.update_profile_setting(p_key TEXT, p_value BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;
    
    IF p_key IN ('show_collections_publicly', 'allow_follow', 'allow_stranger_dm', 'allow_search') THEN
        INSERT INTO public.user_settings (user_id, show_collections_publicly, allow_follow, allow_stranger_dm, allow_search, updated_at)
        VALUES (user_uuid, 
                CASE WHEN p_key = 'show_collections_publicly' THEN p_value ELSE true END,
                CASE WHEN p_key = 'allow_follow' THEN p_value ELSE true END,
                CASE WHEN p_key = 'allow_stranger_dm' THEN p_value ELSE true END,
                CASE WHEN p_key = 'allow_search' THEN p_value ELSE true END,
                now())
        ON CONFLICT (user_id) 
        DO UPDATE SET 
            show_collections_publicly = CASE WHEN p_key = 'show_collections_publicly' THEN p_value ELSE user_settings.show_collections_publicly END,
            allow_follow = CASE WHEN p_key = 'allow_follow' THEN p_value ELSE user_settings.allow_follow END,
            allow_stranger_dm = CASE WHEN p_key = 'allow_stranger_dm' THEN p_value ELSE user_settings.allow_stranger_dm END,
            allow_search = CASE WHEN p_key = 'allow_search' THEN p_value ELSE user_settings.allow_search END,
            updated_at = now();
    ELSE
        RAISE EXCEPTION '不支持的设置项';
    END IF;
END;
$$;

-- 3. 更新 get_user_settings_full 函数（加入 allow_search）
DROP FUNCTION IF EXISTS public.get_user_settings_full();
CREATE OR REPLACE FUNCTION public.get_user_settings_full()
RETURNS TABLE(
    show_collections_publicly BOOLEAN,
    allow_follow BOOLEAN,
    allow_stranger_dm BOOLEAN,
    allow_search BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;
    
    RETURN QUERY
    SELECT 
        COALESCE(s.show_collections_publicly, true),
        COALESCE(s.allow_follow, true),
        COALESCE(s.allow_stranger_dm, true),
        COALESCE(s.allow_search, true)
    FROM public.user_settings s
    WHERE s.user_id = user_uuid;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT true, true, true, true;
    END IF;
END;
$$;

-- 4. 新增 search_posts 函数
DROP FUNCTION IF EXISTS public.search_posts(TEXT, INT, INT);
CREATE OR REPLACE FUNCTION public.search_posts(
    p_query TEXT,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS TABLE(
    post_id BIGINT,
    user_id UUID,
    user_nickname TEXT,
    user_avatar TEXT,
    user_is_admin BOOLEAN,
    user_is_bot BOOLEAN,
    content TEXT,
    tags TEXT[],
    created_at TIMESTAMPTZ,
    likes_count BIGINT,
    comments_count BIGINT,
    is_liked BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_uuid UUID;
BEGIN
    v_user_uuid := auth.uid();
    RETURN QUERY
    SELECT 
        p.id AS post_id,
        p.user_id,
        pr.nickname AS user_nickname,
        NULL::TEXT AS user_avatar,
        COALESCE(pr.is_admin, false) AS user_is_admin,
        COALESCE(pr.is_bot, false) AS user_is_bot,
        p.content,
        p.tags,
        p.created_at,
        (SELECT COUNT(*) FROM public.likes l WHERE l.target_type = 'post' AND l.target_id = p.id) AS likes_count,
        (SELECT COUNT(*) FROM public.comments c WHERE c.post_id = p.id) AS comments_count,
        EXISTS(SELECT 1 FROM public.likes l WHERE l.user_id = v_user_uuid AND l.target_type = 'post' AND l.target_id = p.id) AS is_liked
    FROM public.posts p
    LEFT JOIN public.profiles pr ON p.user_id = pr.id
    WHERE p.content ILIKE '%' || p_query || '%'
       OR EXISTS (SELECT 1 FROM unnest(p.tags) t WHERE t ILIKE '%' || p_query || '%')
    ORDER BY p.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- 5. 新增 search_users 函数（尊重 allow_search 隐私设置）
DROP FUNCTION IF EXISTS public.search_users(TEXT, INT, INT);
CREATE OR REPLACE FUNCTION public.search_users(
    p_query TEXT,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS TABLE(
    user_id UUID,
    nickname TEXT,
    is_admin BOOLEAN,
    is_bot BOOLEAN,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id AS user_id,
        p.nickname,
        COALESCE(p.is_admin, false) AS is_admin,
        COALESCE(p.is_bot, false) AS is_bot,
        p.created_at
    FROM public.profiles p
    LEFT JOIN public.user_settings s ON p.id = s.user_id
    LEFT JOIN auth.users au ON p.id = au.id
    WHERE (p.nickname ILIKE '%' || p_query || '%' OR au.email ILIKE '%' || p_query || '%')
      AND COALESCE(s.allow_search, true) = true
    ORDER BY p.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;
