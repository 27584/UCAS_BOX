-- UCAS_BOX 完整数据库架构
-- 在 Supabase SQL Editor 中执行此文件以一键创建所有表、函数和策略

-- ============================================================
-- 1. 用户扩展表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    nickname TEXT,
    shells BIGINT DEFAULT 0,
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
    created_at TIMESTAMPTZ DEFAULT now()
);

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
-- 5. RLS 启用
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_orders ENABLE ROW LEVEL SECURITY;

-- RLS 策略
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can view own inventory"
    ON public.inventory FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "System can manage inventory"
    ON public.inventory FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Market orders public read"
    ON public.market_orders FOR SELECT
    USING (true);

CREATE POLICY "Users can manage own orders"
    ON public.market_orders FOR ALL
    USING (auth.uid() = seller_id)
    WITH CHECK (auth.uid() = seller_id);

-- ============================================================
-- 6. 触发器：注册后自动创建 profile
-- ============================================================
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
CREATE OR REPLACE FUNCTION public.claim_idle_rewards()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    last_claim TIMESTAMPTZ;
    now_time TIMESTAMPTZ := now();
    diff_minutes BIGINT;
    base_rate INT := 10;
    boost_rate INT := 0;
    total_rate INT;
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

    diff_minutes := GREATEST(EXTRACT(EPOCH FROM (now_time - last_claim)) / 60, 0)::BIGINT;
    diff_minutes := LEAST(diff_minutes, 480); -- 最多计算8小时
    total_rate := base_rate + boost_rate;
    reward := diff_minutes * total_rate;

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
CREATE OR REPLACE FUNCTION public.open_box()
RETURNS TABLE(item_id BIGINT, item_name TEXT, item_quality TEXT, item_image TEXT)
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
    ON CONFLICT (user_id, item_id)
    DO UPDATE SET quantity = public.inventory.quantity + 1;

    -- 更新开盒时间
    UPDATE public.profiles
    SET last_open_at = now_time
    WHERE id = user_uuid;

    item_id := selected_item.id;
    item_name := selected_item.name;
    item_quality := selected_item.quality;
    item_image := selected_item.image_name;
    RETURN NEXT;
END;
$$;

-- ============================================================
-- 9. RPC 函数：发布市场订单（仅出售）
-- ============================================================
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
-- 10. RPC 函数：下架订单
-- ============================================================
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
    ON CONFLICT (user_id, item_id)
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
    ON CONFLICT (user_id, item_id)
    DO UPDATE SET quantity = public.inventory.quantity + EXCLUDED.quantity;

    -- 完成订单
    UPDATE public.market_orders
    SET status = 'completed'
    WHERE id = p_order_id;
END;
$$;

-- ============================================================
-- 12. RPC 函数：获取图鉴进度
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_collection_progress()
RETURNS TABLE(item_id BIGINT, item_name TEXT, item_quality TEXT, item_image TEXT, owned BIGINT)
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
        COALESCE(inv.quantity, 0)::BIGINT AS owned
    FROM public.items i
    LEFT JOIN public.inventory inv ON inv.item_id = i.id AND inv.user_id = user_uuid
    ORDER BY i.id;
END;
$$;

-- ============================================================
-- 13. RPC 函数：领取广告奖励（每个账号仅可领取一次）
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_ad_rewards()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    has_claimed BOOLEAN;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    SELECT ad_claimed_at IS NOT NULL INTO has_claimed
    FROM public.profiles
    WHERE id = user_uuid;

    IF has_claimed THEN
        RAISE EXCEPTION '该账号已领取过广告奖励';
    END IF;

    UPDATE public.profiles
    SET shells = shells + 500,
        ad_claimed_at = now()
    WHERE id = user_uuid;

    RETURN TRUE;
END;
$$;

-- ============================================================
-- 14. RPC 函数：获取当前挂机加成
-- ============================================================
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
