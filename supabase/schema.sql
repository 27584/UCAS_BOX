-- UCAS_BOX 完整数据库架构
-- 在 Supabase SQL Editor 中执行此文件以一键创建所有表、函数和策略

-- ============================================================
-- 1. 用户扩展表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    nickname TEXT,
    shells BIGINT DEFAULT 0,
    is_admin BOOLEAN DEFAULT false,
    last_open_at TIMESTAMPTZ DEFAULT '1970-01-01'::timestamptz,
    last_claim_at TIMESTAMPTZ DEFAULT now(),
    ad_claimed_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. 收藏品字典
-- ============================================================
CREATE TABLE IF NOT EXISTS public.items (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    quality TEXT CHECK (quality IN ('white','green','blue','purple','orange','red')),
    image_name TEXT NOT NULL,
    description TEXT,
    drop_weight INT DEFAULT 100,
    item_type TEXT DEFAULT 'collection' CHECK (item_type IN ('collection', 'consumable', 'equipment', 'material', 'currency')),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.items ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'collection';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'items_item_type_check') THEN
        ALTER TABLE public.items ADD CONSTRAINT items_item_type_check CHECK (item_type IN ('collection', 'consumable', 'equipment', 'material', 'currency'));
    END IF;
END $$;

-- ============================================================
-- 3. 用户背包
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inventory (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    item_id BIGINT REFERENCES public.items(id),
    quantity INT DEFAULT 1,
    acquired_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, item_id)
);

-- ============================================================
-- 4. 市场订单
-- ============================================================
CREATE TABLE IF NOT EXISTS public.market_orders (
    id BIGSERIAL PRIMARY KEY,
    seller_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    item_id BIGINT REFERENCES public.items(id),
    quantity INT NOT NULL CHECK (quantity > 0),
    price_per_unit BIGINT NOT NULL CHECK (price_per_unit > 0),
    type TEXT CHECK (type IN ('sell','buy')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. 系统邮件
-- ============================================================
CREATE TABLE IF NOT EXISTS public.system_mails (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 6. 投稿表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.item_submissions (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quality TEXT CHECK (quality IN ('white','green','blue','purple','orange','red')) NOT NULL,
    description TEXT NOT NULL,
    drop_weight INT DEFAULT 100,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reward_shells BIGINT DEFAULT 0,
    admin_note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 7. RLS 启用
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_mails ENABLE ROW LEVEL SECURITY;

-- RLS 策略
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can view own inventory" ON public.inventory;
CREATE POLICY "Users can view own inventory"
    ON public.inventory FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can manage inventory" ON public.inventory;
CREATE POLICY "System can manage inventory"
    ON public.inventory FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Market orders public read" ON public.market_orders;
CREATE POLICY "Market orders public read"
    ON public.market_orders FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Users can manage own orders" ON public.market_orders;
CREATE POLICY "Users can manage own orders"
    ON public.market_orders FOR ALL
    USING (auth.uid() = seller_id)
    WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "Users can view own mails" ON public.system_mails;
CREATE POLICY "Users can view own mails"
    ON public.system_mails FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own mails" ON public.system_mails;
CREATE POLICY "Users can update own mails"
    ON public.system_mails FOR UPDATE
    USING (auth.uid() = user_id);

ALTER TABLE public.item_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own submissions" ON public.item_submissions;
CREATE POLICY "Users can view own submissions"
    ON public.item_submissions FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert submissions" ON public.item_submissions;
CREATE POLICY "Users can insert submissions"
    ON public.item_submissions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 7. 触发器：注册后自动创建 profile
-- ============================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    raw_nickname TEXT;
    clean_nickname TEXT;
BEGIN
    raw_nickname := COALESCE(NEW.raw_user_meta_data->>'nickname', split_part(NEW.email, '@', 1));
    -- 移除HTML标签，防止XSS
    clean_nickname := regexp_replace(raw_nickname, '<[^>]*>', '', 'g');
    -- 限制长度
    clean_nickname := LEFT(clean_nickname, 20);
    INSERT INTO public.profiles (id, nickname)
    VALUES (NEW.id, clean_nickname);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 7. RPC 函数：领取挂机收益
-- ============================================================
DROP FUNCTION IF EXISTS public.claim_idle_rewards();
CREATE OR REPLACE FUNCTION public.claim_idle_rewards()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    last_claim TIMESTAMPTZ;
    now_time TIMESTAMPTZ := now();
    diff_seconds NUMERIC;
    diff_minutes NUMERIC;
    base_rate NUMERIC := 10;
    boost_rate NUMERIC := 0;
    total_rate NUMERIC;
    reward BIGINT;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    SELECT last_claim_at INTO last_claim
    FROM public.profiles
    WHERE id = user_uuid
    FOR UPDATE;

    IF last_claim IS NULL THEN
        last_claim := now_time;
    END IF;

    SELECT COALESCE(SUM(
        CASE i.quality
            WHEN 'white' THEN 1 * inv.quantity
            WHEN 'green' THEN 5 * inv.quantity
            WHEN 'blue' THEN 10 * inv.quantity
            WHEN 'purple' THEN 20 * inv.quantity
            WHEN 'orange' THEN 50 * inv.quantity
            WHEN 'red' THEN 100 * inv.quantity
            ELSE 0
        END
    ), 0) INTO boost_rate
    FROM public.inventory inv
    JOIN public.items i ON inv.item_id = i.id
    WHERE inv.user_id = user_uuid;

    diff_seconds := GREATEST(EXTRACT(EPOCH FROM (now_time - last_claim)), 0);
    diff_seconds := LEAST(diff_seconds, 480 * 60); -- 最多计算8小时
    diff_minutes := diff_seconds / 60.0;
    total_rate := base_rate + boost_rate;
    reward := FLOOR(diff_minutes * total_rate);

    IF reward <= 0 THEN
        RETURN 0;
    END IF;

    UPDATE public.profiles
    SET shells = shells + reward,
        last_claim_at = now_time
    WHERE id = user_uuid;

    RETURN reward;
END;
$$;

-- ============================================================
-- 8. RPC 函数：开盒
-- ============================================================
DROP FUNCTION IF EXISTS public.open_box();
CREATE OR REPLACE FUNCTION public.open_box()
RETURNS TABLE(out_item_id BIGINT, out_item_name TEXT, out_item_quality TEXT, out_item_image TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    last_open TIMESTAMPTZ;
    now_time TIMESTAMPTZ := now();
    cooldown_seconds INT := 600; -- 10分钟
    total_weight INT;
    random_pick INT;
    selected_item RECORD;
    remaining INT;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    SELECT profiles.last_open_at INTO last_open
    FROM public.profiles
    WHERE profiles.id = user_uuid
    FOR UPDATE;

    IF EXTRACT(EPOCH FROM (now_time - last_open)) < cooldown_seconds THEN
        RAISE EXCEPTION '冷却中，还需等待 % 秒', (cooldown_seconds - EXTRACT(EPOCH FROM (now_time - last_open)))::INT;
    END IF;

    -- 计算总权重
    SELECT COALESCE(SUM(drop_weight), 0) INTO total_weight
    FROM public.items;

    IF total_weight <= 0 THEN
        RAISE EXCEPTION '暂无收藏品可掉落';
    END IF;

    -- 随机选择
    random_pick := floor(random() * total_weight) + 1;
    remaining := random_pick;

    FOR selected_item IN
        SELECT id, name, quality, image_name, drop_weight
        FROM public.items
        ORDER BY id
    LOOP
        remaining := remaining - selected_item.drop_weight;
        IF remaining <= 0 THEN
            EXIT;
        END IF;
    END LOOP;

    -- 写入 inventory
    INSERT INTO public.inventory (user_id, item_id, quantity)
    VALUES (user_uuid, selected_item.id, 1)
    ON CONFLICT ON CONSTRAINT inventory_user_id_item_id_key
    DO UPDATE SET quantity = public.inventory.quantity + 1;

    -- 更新开盒时间
    UPDATE public.profiles
    SET last_open_at = now_time
    WHERE id = user_uuid;

    out_item_id := selected_item.id;
    out_item_name := selected_item.name;
    out_item_quality := selected_item.quality;
    out_item_image := selected_item.image_name;
    RETURN NEXT;
END;
$$;

-- ============================================================
-- 9. RPC 函数：发布市场订单（仅出售）
-- ============================================================
DROP FUNCTION IF EXISTS public.place_market_order(BIGINT, BIGINT, INT);
CREATE OR REPLACE FUNCTION public.place_market_order(p_item_id BIGINT, p_price BIGINT, p_quantity INT DEFAULT 1)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    inv_quantity INT;
    new_order_id BIGINT;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    IF p_price <= 0 OR p_quantity <= 0 THEN
        RAISE EXCEPTION '价格和数量必须大于0';
    END IF;

    -- 检查库存并锁定
    SELECT quantity INTO inv_quantity
    FROM public.inventory
    WHERE user_id = user_uuid AND item_id = p_item_id
    FOR UPDATE;

    IF inv_quantity IS NULL OR inv_quantity < p_quantity THEN
        RAISE EXCEPTION '库存不足';
    END IF;

    -- 扣除库存
    UPDATE public.inventory
    SET quantity = quantity - p_quantity
    WHERE user_id = user_uuid AND item_id = p_item_id;

    DELETE FROM public.inventory
    WHERE user_id = user_uuid AND item_id = p_item_id AND quantity <= 0;

    -- 创建订单
    INSERT INTO public.market_orders (seller_id, item_id, quantity, price_per_unit, type, status)
    VALUES (user_uuid, p_item_id, p_quantity, p_price, 'sell', 'active')
    RETURNING id INTO new_order_id;

    RETURN new_order_id;
END;
$$;

-- ============================================================
-- 10. RPC 函数：取消市场订单（下架）
-- ============================================================
DROP FUNCTION IF EXISTS public.cancel_market_order(BIGINT);
CREATE OR REPLACE FUNCTION public.cancel_market_order(p_order_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    order_rec RECORD;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    SELECT * INTO order_rec
    FROM public.market_orders
    WHERE id = p_order_id AND seller_id = user_uuid AND status = 'active'
    FOR UPDATE;

    IF order_rec IS NULL THEN
        RAISE EXCEPTION '订单不存在或无法取消';
    END IF;

    -- 退回物品
    INSERT INTO public.inventory (user_id, item_id, quantity)
    VALUES (user_uuid, order_rec.item_id, order_rec.quantity)
    ON CONFLICT ON CONSTRAINT inventory_user_id_item_id_key
    DO UPDATE SET quantity = public.inventory.quantity + EXCLUDED.quantity;

    -- 更新订单状态
    UPDATE public.market_orders
    SET status = 'cancelled'
    WHERE id = p_order_id;
END;
$$;

-- ============================================================
-- 11. RPC 函数：购买订单
-- ============================================================
DROP FUNCTION IF EXISTS public.buy_market_order(BIGINT);
CREATE OR REPLACE FUNCTION public.buy_market_order(p_order_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    buyer_uuid UUID := auth.uid();
    order_rec RECORD;
    total_price BIGINT;
    buyer_shells BIGINT;
BEGIN
    IF buyer_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    SELECT * INTO order_rec
    FROM public.market_orders
    WHERE id = p_order_id AND status = 'active'
    FOR UPDATE;

    IF order_rec IS NULL THEN
        RAISE EXCEPTION '订单不存在或已失效';
    END IF;

    IF order_rec.seller_id = buyer_uuid THEN
        RAISE EXCEPTION '不能购买自己的订单';
    END IF;

    total_price := order_rec.price_per_unit * order_rec.quantity;

    -- 锁定买家余额
    SELECT shells INTO buyer_shells
    FROM public.profiles
    WHERE id = buyer_uuid
    FOR UPDATE;

    IF buyer_shells < total_price THEN
        RAISE EXCEPTION '果壳币不足';
    END IF;

    -- 扣买家钱
    UPDATE public.profiles
    SET shells = shells - total_price
    WHERE id = buyer_uuid;

    -- 给卖家钱
    UPDATE public.profiles
    SET shells = shells + total_price
    WHERE id = order_rec.seller_id;

    -- 给买家物品
    INSERT INTO public.inventory (user_id, item_id, quantity)
    VALUES (buyer_uuid, order_rec.item_id, order_rec.quantity)
    ON CONFLICT ON CONSTRAINT inventory_user_id_item_id_key
    DO UPDATE SET quantity = public.inventory.quantity + EXCLUDED.quantity;

    -- 完成订单
    UPDATE public.market_orders
    SET status = 'completed'
    WHERE id = p_order_id;

    -- 给卖家发送系统邮件
    INSERT INTO public.system_mails (user_id, title, content)
    VALUES (
        order_rec.seller_id,
        '订单出售成功',
        '你上架的物品已被购买，获得 ' || total_price || ' 果壳币。'
    );
END;
$$;

-- ============================================================
-- 12. RPC 函数：获取用户背包
-- ============================================================
DROP FUNCTION IF EXISTS public.get_user_inventory();
CREATE OR REPLACE FUNCTION public.get_user_inventory()
RETURNS TABLE(inv_id BIGINT, item_id BIGINT, quantity INT, acquired_at TIMESTAMPTZ, item_name TEXT, item_quality TEXT, item_image TEXT, item_description TEXT, item_type TEXT)
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
        inv.id AS inv_id,
        inv.item_id,
        inv.quantity,
        inv.acquired_at,
        i.name AS item_name,
        i.quality AS item_quality,
        i.image_name AS item_image,
        i.description AS item_description,
        i.item_type AS item_type
    FROM public.inventory inv
    JOIN public.items i ON inv.item_id = i.id
    WHERE inv.user_id = user_uuid
    ORDER BY inv.acquired_at DESC;
END;
$$;

-- 使用改名卡修改昵称
CREATE OR REPLACE FUNCTION public.use_rename_card(p_new_nickname TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    item_def_id BIGINT;
    inv_id BIGINT;
    new_nickname TEXT;
BEGIN
    IF user_uuid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '请先登录');
    END IF;

    -- 检查昵称长度
    IF p_new_nickname IS NULL OR char_length(trim(p_new_nickname)) < 2 THEN
        RETURN jsonb_build_object('success', false, 'message', '昵称至少需要2个字符');
    END IF;
    
    IF char_length(trim(p_new_nickname)) > 20 THEN
        RETURN jsonb_build_object('success', false, 'message', '昵称不能超过20个字符');
    END IF;
    
    new_nickname := trim(p_new_nickname);
    
    -- 检查是否包含非法字符
    IF new_nickname LIKE '%<%' OR new_nickname LIKE '%>%' OR new_nickname LIKE '%''%' 
       OR new_nickname LIKE '%"%' OR new_nickname LIKE '%\\%' OR new_nickname LIKE '%%;(%' OR new_nickname LIKE '%)%' THEN
        RETURN jsonb_build_object('success', false, 'message', '昵称不能包含特殊字符');
    END IF;
    
    -- 查找改名卡物品定义
    SELECT id INTO item_def_id FROM public.items WHERE name = '改名卡' AND item_type = 'consumable';
    
    IF item_def_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '改名卡不存在');
    END IF;
    
    -- 检查用户是否拥有改名卡
    SELECT id INTO inv_id FROM public.inventory WHERE user_id = user_uuid AND item_id = item_def_id;
    
    IF inv_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '你没有改名卡');
    END IF;
    
       -- 扣除改名卡（数量减1，如果只剩1个则删除记录）
    UPDATE public.inventory SET quantity = quantity - 1 WHERE id = inv_id;
    DELETE FROM public.inventory WHERE id = inv_id AND quantity <= 0;
    
    -- 检查昵称是否已被使用
    IF EXISTS (SELECT 1 FROM public.profiles WHERE nickname = new_nickname AND id != user_uuid) THEN
        RETURN jsonb_build_object('success', false, 'message', '该昵称已被使用');
    END IF;
    
    -- 更新用户昵称
    UPDATE public.profiles SET nickname = new_nickname WHERE id = user_uuid;
    
    RETURN jsonb_build_object('success', true, 'message', '昵称修改成功', 'new_nickname', new_nickname);
END;
$$;

-- ============================================================
-- 13. RPC 函数：获取市场订单（分页+筛选）
-- ============================================================
DROP FUNCTION IF EXISTS public.get_market_orders(INT, INT, TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.get_market_orders(
    p_page INT DEFAULT 1,
    p_limit INT DEFAULT 10,
    p_quality TEXT DEFAULT NULL,
    p_sort TEXT DEFAULT 'newest',
    p_search TEXT DEFAULT NULL,
    p_type TEXT DEFAULT NULL
)
RETURNS TABLE(
    order_id BIGINT,
    seller_id UUID,
    item_id BIGINT,
    quantity INT,
    price_per_unit BIGINT,
    type TEXT,
    status TEXT,
    created_at TIMESTAMPTZ,
    item_name TEXT,
    item_quality TEXT,
    item_image TEXT,
    item_description TEXT,
    item_type TEXT,
    seller_nickname TEXT,
    total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    offset_val INT;
    quality_order INT;
BEGIN
    offset_val := (COALESCE(p_page, 1) - 1) * COALESCE(p_limit, 10);

    RETURN QUERY
    SELECT
        mo.id AS order_id,
        mo.seller_id,
        mo.item_id,
        mo.quantity,
        mo.price_per_unit,
        mo.type,
        mo.status,
        mo.created_at,
        i.name AS item_name,
        i.quality AS item_quality,
        i.image_name AS item_image,
        i.description AS item_description,
        i.item_type AS item_type,
        p.nickname AS seller_nickname,
        (
            SELECT COUNT(*) FROM public.market_orders mo2
            JOIN public.items i2 ON mo2.item_id = i2.id
            LEFT JOIN public.profiles p2 ON mo2.seller_id = p2.id
            WHERE mo2.status = 'active'
            AND (p_quality IS NULL OR i2.quality = p_quality)
            AND (p_type IS NULL OR i2.item_type = p_type)
            AND (p_search IS NULL OR i2.name ILIKE '%' || p_search || '%' OR p2.nickname ILIKE '%' || p_search || '%')
        )::BIGINT AS total_count
    FROM public.market_orders mo
    JOIN public.items i ON mo.item_id = i.id
    LEFT JOIN public.profiles p ON mo.seller_id = p.id
    WHERE mo.status = 'active'
    AND (p_quality IS NULL OR i.quality = p_quality)
    AND (p_type IS NULL OR i.item_type = p_type)
    AND (p_search IS NULL OR i.name ILIKE '%' || p_search || '%' OR p.nickname ILIKE '%' || p_search || '%')
    ORDER BY
        CASE COALESCE(p_sort, 'newest')
            WHEN 'price-low' THEN -mo.price_per_unit
            WHEN 'price-high' THEN mo.price_per_unit
            WHEN 'quality' THEN
                CASE i.quality
                    WHEN 'red' THEN 1
                    WHEN 'orange' THEN 2
                    WHEN 'purple' THEN 3
                    WHEN 'blue' THEN 4
                    WHEN 'green' THEN 5
                    WHEN 'white' THEN 6
                    ELSE 7
                END
            ELSE EXTRACT(EPOCH FROM mo.created_at)
        END DESC
    LIMIT p_limit
    OFFSET offset_val;
END;
$$;

-- ============================================================
-- 14. RPC 函数：获取图鉴进度
-- ============================================================
DROP FUNCTION IF EXISTS public.get_collection_progress();
CREATE OR REPLACE FUNCTION public.get_collection_progress()
RETURNS TABLE(item_id BIGINT, item_name TEXT, item_quality TEXT, item_image TEXT, item_description TEXT, item_type TEXT, owned BIGINT)
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
        i.id,
        i.name,
        i.quality,
        i.image_name,
        i.description,
        i.item_type,
        COALESCE(inv.quantity, 0)::BIGINT AS owned
    FROM public.items i
    LEFT JOIN public.inventory inv ON inv.item_id = i.id AND inv.user_id = user_uuid
    ORDER BY
        CASE i.quality
            WHEN 'red' THEN 1
            WHEN 'orange' THEN 2
            WHEN 'purple' THEN 3
            WHEN 'blue' THEN 4
            WHEN 'green' THEN 5
            WHEN 'white' THEN 6
            ELSE 7
        END,
        i.id;
END;
$$;

-- ============================================================
-- 14. RPC 函数：领取广告奖励（每日限领一次，随机 1000-10000）
-- ============================================================
DROP FUNCTION IF EXISTS public.claim_ad_rewards();
CREATE OR REPLACE FUNCTION public.claim_ad_rewards()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    last_claim_date DATE;
    reward BIGINT;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    SELECT ad_claimed_at::DATE INTO last_claim_date
    FROM public.profiles
    WHERE id = user_uuid;

    IF last_claim_date = CURRENT_DATE THEN
        RAISE EXCEPTION '今日已领取过广告奖励，请明天再来';
    END IF;

    reward := FLOOR(1000 + RANDOM() * 9000)::BIGINT;

    UPDATE public.profiles
    SET shells = shells + reward,
        ad_claimed_at = now()
    WHERE id = user_uuid;

    RETURN reward;
END;
$$;

-- ============================================================
-- 15. RPC 函数：获取当前挂机加成
-- ============================================================
DROP FUNCTION IF EXISTS public.get_idle_boost();
CREATE OR REPLACE FUNCTION public.get_idle_boost()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    boost_rate INT := 0;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    SELECT COALESCE(SUM(
        CASE i.quality
            WHEN 'white' THEN 1 * inv.quantity
            WHEN 'green' THEN 5 * inv.quantity
            WHEN 'blue' THEN 10 * inv.quantity
            WHEN 'purple' THEN 20 * inv.quantity
            WHEN 'orange' THEN 50 * inv.quantity
            WHEN 'red' THEN 100 * inv.quantity
            ELSE 0
        END
    ), 0) INTO boost_rate
    FROM public.inventory inv
    JOIN public.items i ON inv.item_id = i.id
    WHERE inv.user_id = user_uuid;

    RETURN boost_rate;
END;
$$;

-- ============================================================
-- 16. RPC 函数：获取用户邮件
-- ============================================================
DROP FUNCTION IF EXISTS public.get_user_mails();
CREATE OR REPLACE FUNCTION public.get_user_mails()
RETURNS TABLE(mail_id BIGINT, title TEXT, content TEXT, is_read BOOLEAN, created_at TIMESTAMPTZ)
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
        sm.id AS mail_id,
        sm.title,
        sm.content,
        sm.is_read,
        sm.created_at
    FROM public.system_mails sm
    WHERE sm.user_id = user_uuid
    ORDER BY sm.created_at DESC;
END;
$$;

-- ============================================================
-- 17. RPC 函数：标记邮件已读
-- ============================================================
DROP FUNCTION IF EXISTS public.mark_mail_read(BIGINT);
CREATE OR REPLACE FUNCTION public.mark_mail_read(p_mail_id BIGINT)
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

    UPDATE public.system_mails
    SET is_read = true
    WHERE id = p_mail_id AND user_id = user_uuid;
END;
$$;

-- ============================================================
-- 18. RPC 函数：检查是否为管理员
-- ============================================================
DROP FUNCTION IF EXISTS public.check_admin();
CREATE OR REPLACE FUNCTION public.check_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    is_admin BOOLEAN;
BEGIN
    IF user_uuid IS NULL THEN
        RETURN false;
    END IF;

    SELECT profiles.is_admin INTO is_admin
    FROM public.profiles
    WHERE id = user_uuid;

    RETURN COALESCE(is_admin, false);
END;
$$;

-- ============================================================
-- 19. RPC 函数：获取所有用户（管理员）
-- ============================================================
DROP FUNCTION IF EXISTS public.get_all_users();
CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE(user_id UUID, nickname TEXT, shells BIGINT, is_admin BOOLEAN, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    IF NOT public.check_admin() THEN
        RAISE EXCEPTION '无权限';
    END IF;

    RETURN QUERY
    SELECT
        p.id AS user_id,
        p.nickname,
        p.shells,
        p.is_admin,
        p.created_at
    FROM public.profiles p
    ORDER BY p.created_at DESC;
END;
$$;

-- ============================================================
-- 20. RPC 函数：给用户添加物品（管理员）
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_add_item(UUID, BIGINT, INT);
CREATE OR REPLACE FUNCTION public.admin_add_item(p_user_id UUID, p_item_id BIGINT, p_quantity INT DEFAULT 1)
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

    IF NOT public.check_admin() THEN
        RAISE EXCEPTION '无权限';
    END IF;

    INSERT INTO public.inventory (user_id, item_id, quantity)
    VALUES (p_user_id, p_item_id, p_quantity)
    ON CONFLICT ON CONSTRAINT inventory_user_id_item_id_key
    DO UPDATE SET quantity = public.inventory.quantity + EXCLUDED.quantity;

    -- 发送系统邮件通知
    INSERT INTO public.system_mails (user_id, title, content)
    SELECT
        p_user_id,
        '收到管理员发放的物品',
        '管理员向您发放了「' || i.name || '」×' || p_quantity || '，请查看背包。'
    FROM public.items i
    WHERE i.id = p_item_id;
END;
$$;

-- ============================================================
-- 21. RPC 函数：获取所有收藏品（管理员）
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_get_items();
CREATE OR REPLACE FUNCTION public.admin_get_items()
RETURNS TABLE(item_id BIGINT, name TEXT, quality TEXT, image_name TEXT, description TEXT, drop_weight INT, item_type TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    IF NOT public.check_admin() THEN
        RAISE EXCEPTION '无权限';
    END IF;

    RETURN QUERY
    SELECT i.id AS item_id, i.name, i.quality, i.image_name, i.description, i.drop_weight, i.item_type
    FROM public.items i
    ORDER BY i.id;
END;
$$;

-- ============================================================
-- 22. RPC 函数：添加物品（管理员）
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_add_item_definition(TEXT, TEXT, TEXT, TEXT, INT, TEXT);
CREATE OR REPLACE FUNCTION public.admin_add_item_definition(
    p_name TEXT,
    p_quality TEXT,
    p_image_name TEXT,
    p_description TEXT,
    p_drop_weight INT,
    p_item_type TEXT DEFAULT 'collection'
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    new_id BIGINT;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    IF NOT public.check_admin() THEN
        RAISE EXCEPTION '无权限';
    END IF;

    INSERT INTO public.items (name, quality, image_name, description, drop_weight, item_type)
    VALUES (p_name, p_quality, p_image_name, p_description, p_drop_weight, p_item_type)
    RETURNING id INTO new_id;

    RETURN new_id;
END;
$$;

-- ============================================================
-- 23. RPC 函数：获取系统统计（管理员）
-- ============================================================
DROP FUNCTION IF EXISTS public.get_system_stats();
CREATE OR REPLACE FUNCTION public.get_system_stats()
RETURNS TABLE(total_users BIGINT, total_items BIGINT, total_orders BIGINT, total_mails BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    IF NOT public.check_admin() THEN
        RAISE EXCEPTION '无权限';
    END IF;

    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM public.profiles)::BIGINT AS total_users,
        (SELECT COUNT(*) FROM public.items)::BIGINT AS total_items,
        (SELECT COUNT(*) FROM public.market_orders)::BIGINT AS total_orders,
        (SELECT COUNT(*) FROM public.system_mails)::BIGINT AS total_mails;
END;
$$;

-- ============================================================
-- 24. RPC 函数：提交物品投稿
-- ============================================================
DROP FUNCTION IF EXISTS public.submit_item(TEXT, TEXT, TEXT, INT);
CREATE OR REPLACE FUNCTION public.submit_item(
    p_name TEXT,
    p_quality TEXT,
    p_description TEXT,
    p_drop_weight INT DEFAULT 100
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    new_id BIGINT;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    INSERT INTO public.item_submissions (user_id, name, quality, description, drop_weight)
    VALUES (user_uuid, p_name, p_quality, p_description, p_drop_weight)
    RETURNING id INTO new_id;

    RETURN new_id;
END;
$$;

-- ============================================================
-- 25. RPC 函数：获取我的投稿
-- ============================================================
DROP FUNCTION IF EXISTS public.get_my_submissions();
CREATE OR REPLACE FUNCTION public.get_my_submissions()
RETURNS TABLE(id BIGINT, name TEXT, quality TEXT, description TEXT, drop_weight INT, status TEXT, reward_shells BIGINT, admin_note TEXT, created_at TIMESTAMPTZ)
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
        s.id,
        s.name,
        s.quality,
        s.description,
        s.drop_weight,
        s.status,
        s.reward_shells,
        s.admin_note,
        s.created_at
    FROM public.item_submissions s
    WHERE s.user_id = user_uuid
    ORDER BY s.created_at DESC;
END;
$$;

-- ============================================================
-- 26. RPC 函数：获取待审核投稿（管理员）
-- ============================================================
DROP FUNCTION IF EXISTS public.get_pending_submissions();
CREATE OR REPLACE FUNCTION public.get_pending_submissions()
RETURNS TABLE(id BIGINT, user_id UUID, nickname TEXT, name TEXT, quality TEXT, description TEXT, drop_weight INT, status TEXT, reward_shells BIGINT, admin_note TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    IF NOT public.check_admin() THEN
        RAISE EXCEPTION '无权限';
    END IF;

    RETURN QUERY
    SELECT
        s.id,
        s.user_id,
        p.nickname,
        s.name,
        s.quality,
        s.description,
        s.drop_weight,
        s.status,
        s.reward_shells,
        s.admin_note,
        s.created_at
    FROM public.item_submissions s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    WHERE s.status = 'pending'
    ORDER BY s.created_at ASC;
END;
$$;

-- ============================================================
-- 27. RPC 函数：审核通过投稿（管理员）
-- ============================================================
DROP FUNCTION IF EXISTS public.approve_submission(BIGINT, BIGINT);
CREATE OR REPLACE FUNCTION public.approve_submission(p_submission_id BIGINT, p_reward_shells BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    submitter_id UUID;
    submitter_nickname TEXT;
    item_name TEXT;
    item_quality TEXT;
    item_description TEXT;
    item_drop_weight INT;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    IF NOT public.check_admin() THEN
        RAISE EXCEPTION '无权限';
    END IF;

    SELECT s.user_id, s.name, s.quality, s.description, s.drop_weight, p.nickname
    INTO submitter_id, item_name, item_quality, item_description, item_drop_weight, submitter_nickname
    FROM public.item_submissions s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    WHERE s.id = p_submission_id AND s.status = 'pending';

    IF submitter_id IS NULL THEN
        RAISE EXCEPTION '投稿不存在或已处理';
    END IF;

    INSERT INTO public.items (name, quality, image_name, description, drop_weight)
    VALUES (item_name, item_quality, '', item_description, item_drop_weight);

    UPDATE public.item_submissions
    SET status = 'approved', reward_shells = p_reward_shells, updated_at = now()
    WHERE id = p_submission_id;

    UPDATE public.profiles
    SET shells = shells + p_reward_shells
    WHERE id = submitter_id;

    INSERT INTO public.system_mails (user_id, title, content)
    VALUES (submitter_id, '投稿通过',
        '恭喜！您投稿的「' || item_name || '」已通过审核，获得 ' || p_reward_shells || ' 果壳币奖励！');
END;
$$;

-- ============================================================
-- 28. RPC 函数：拒绝投稿（管理员）
-- ============================================================
DROP FUNCTION IF EXISTS public.reject_submission(BIGINT, TEXT);
CREATE OR REPLACE FUNCTION public.reject_submission(p_submission_id BIGINT, p_admin_note TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    submitter_id UUID;
    item_name TEXT;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    IF NOT public.check_admin() THEN
        RAISE EXCEPTION '无权限';
    END IF;

    SELECT s.user_id, s.name
    INTO submitter_id, item_name
    FROM public.item_submissions s
    WHERE s.id = p_submission_id AND s.status = 'pending';

    IF submitter_id IS NULL THEN
        RAISE EXCEPTION '投稿不存在或已处理';
    END IF;

    UPDATE public.item_submissions
    SET status = 'rejected', admin_note = p_admin_note, updated_at = now()
    WHERE id = p_submission_id;

    INSERT INTO public.system_mails (user_id, title, content)
    VALUES (submitter_id, '投稿未通过',
        '您投稿的「' || item_name || '」未通过审核。原因：' || COALESCE(p_admin_note, '无'));
END;
$$;
