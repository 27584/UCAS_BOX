-- UCAS_BOX 数据库架构


















ALTER DATABASE postgres SET TIME ZONE 'Asia/Shanghai';

-- 清理旧的机器人相关对象
DROP TABLE IF EXISTS public.bot_accounts CASCADE;
DROP TABLE IF EXISTS public.bot_state CASCADE;
DROP FUNCTION IF EXISTS public.ensure_bot_users CASCADE;
DROP FUNCTION IF EXISTS public.bot_place_market_order CASCADE;

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
    -- 端午活动：在线时间追踪
    dragon_boat_online_total INT DEFAULT 0, -- 累计在线秒数
    dragon_boat_last_update TIMESTAMPTZ DEFAULT NULL, -- 上次更新时间
    dragon_boat_claimed_1min BOOLEAN DEFAULT false,
    dragon_boat_claimed_10min BOOLEAN DEFAULT false,
    dragon_boat_claimed_60min BOOLEAN DEFAULT false,
    dragon_boat_daily_reset TIMESTAMPTZ DEFAULT NULL, -- 每日重置时间
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 为已存在的表添加端午活动字段（兼容旧版PostgreSQL）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'dragon_boat_online_total') THEN
        ALTER TABLE public.profiles ADD COLUMN dragon_boat_online_total INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'dragon_boat_last_update') THEN
        ALTER TABLE public.profiles ADD COLUMN dragon_boat_last_update TIMESTAMPTZ DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'dragon_boat_claimed_1min') THEN
        ALTER TABLE public.profiles ADD COLUMN dragon_boat_claimed_1min BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'dragon_boat_claimed_10min') THEN
        ALTER TABLE public.profiles ADD COLUMN dragon_boat_claimed_10min BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'dragon_boat_claimed_60min') THEN
        ALTER TABLE public.profiles ADD COLUMN dragon_boat_claimed_60min BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'dragon_boat_daily_reset') THEN
        ALTER TABLE public.profiles ADD COLUMN dragon_boat_daily_reset TIMESTAMPTZ DEFAULT NULL;
    END IF;
END $$;

-- ============================================================
-- 1.5 端午活动进度表（独立表）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dragon_boat_progress (
    user_id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    online_total INT DEFAULT 0, -- 累计在线秒数
    last_update TIMESTAMPTZ DEFAULT NULL, -- 上次更新时间
    claimed_1min BOOLEAN DEFAULT false,
    claimed_10min BOOLEAN DEFAULT false,
    claimed_60min BOOLEAN DEFAULT false,
    daily_reset DATE DEFAULT NULL -- 每日重置日期
);

-- RLS for dragon_boat_progress
ALTER TABLE public.dragon_boat_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own dragon boat progress" ON public.dragon_boat_progress;
CREATE POLICY "Users can view own dragon boat progress" ON public.dragon_boat_progress FOR SELECT USING (auth.uid() = user_id);

-- 注意：dragon_boat_progress的INSERT/UPDATE只能通过SECURITY DEFINER函数进行，防止作弊
-- 管理员例外
DROP POLICY IF EXISTS "Admin can manage dragon boat" ON public.dragon_boat_progress;
CREATE POLICY "Admin can manage dragon boat" ON public.dragon_boat_progress FOR ALL USING (public.check_admin());

-- 保护dragon_boat_progress表，用户只能查看，不能修改
DROP FUNCTION IF EXISTS public.protect_dragon_boat_progress() CASCADE;
CREATE OR REPLACE FUNCTION public.protect_dragon_boat_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 如果是SECURITY DEFINER函数调用（current_user为postgres），允许修改
    IF current_user = 'postgres' THEN
        RETURN NEW;
    END IF;
    
    -- 如果是管理员操作，允许修改
    IF public.check_admin() THEN
        RETURN NEW;
    END IF;
    
    -- 普通用户禁止修改，抛出异常
    RAISE EXCEPTION '无权修改端午活动进度';
END;
$$;

DROP TRIGGER IF EXISTS protect_dragon_boat ON public.dragon_boat_progress;
CREATE TRIGGER protect_dragon_boat
    BEFORE INSERT OR UPDATE OR DELETE ON public.dragon_boat_progress
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_dragon_boat_progress();

-- ============================================================
-- 1.6 彩票活动表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lottery_rounds (
    round_id BIGSERIAL PRIMARY KEY,
    round_number TEXT NOT NULL UNIQUE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    base_pool BIGINT DEFAULT 5000,
    rollover_pool BIGINT DEFAULT 0,
    final_pool BIGINT,
    winning_numbers TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed', 'drawn')),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lottery_tickets (
    id BIGSERIAL PRIMARY KEY,
    round_id BIGINT REFERENCES public.lottery_rounds ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE,
    numbers TEXT NOT NULL,
    quantity INT DEFAULT 1,
    is_winning BOOLEAN DEFAULT false,
    prize_level TEXT,
    prize_amount BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(round_id, user_id, numbers)
);

-- 为已存在的彩票表添加数量字段（兼容旧版PostgreSQL）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lottery_tickets' AND column_name = 'quantity') THEN
        ALTER TABLE public.lottery_tickets ADD COLUMN quantity INT DEFAULT 1;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.lottery_results (
    id BIGSERIAL PRIMARY KEY,
    round_id BIGINT REFERENCES public.lottery_rounds ON DELETE CASCADE,
    prize_level TEXT NOT NULL,
    pool_share NUMERIC NOT NULL,
    total_winners INT DEFAULT 0,
    total_people INT DEFAULT 0,
    rollover_amount BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 为已存在的开奖结果表添加人数字段
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lottery_results' AND column_name = 'total_people') THEN
        ALTER TABLE public.lottery_results ADD COLUMN total_people INT DEFAULT 0;
    END IF;
END $$;

-- RLS for lottery tables
ALTER TABLE public.lottery_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lottery_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lottery_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view all lottery rounds" ON public.lottery_rounds;
CREATE POLICY "Users can view all lottery rounds" ON public.lottery_rounds FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can view own lottery tickets" ON public.lottery_tickets;
CREATE POLICY "Users can view own lottery tickets" ON public.lottery_tickets FOR SELECT USING (auth.uid() = user_id);

-- 注意：lottery_tickets的INSERT只能通过SECURITY DEFINER函数进行，防止免费购买彩票
-- 管理员例外
DROP POLICY IF EXISTS "Admin can manage lottery" ON public.lottery_tickets;
CREATE POLICY "Admin can manage lottery" ON public.lottery_tickets FOR ALL USING (public.check_admin());

DROP POLICY IF EXISTS "Users can view all lottery results" ON public.lottery_results;
CREATE POLICY "Users can view all lottery results" ON public.lottery_results FOR SELECT USING (true);

-- ============================================================
-- 2. 收藏品字典
-- ============================================================
CREATE TABLE IF NOT EXISTS public.items (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    quality TEXT CHECK (quality IN ('white','green','blue','purple','orange','red')),
    image_name TEXT,
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

CREATE INDEX IF NOT EXISTS idx_inventory_user_id ON public.inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_item_id ON public.inventory(item_id);

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

CREATE INDEX IF NOT EXISTS idx_system_mails_user_id ON public.system_mails(user_id);
CREATE INDEX IF NOT EXISTS idx_system_mails_is_read ON public.system_mails(is_read);

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
    image_name TEXT DEFAULT '',
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
    USING (auth.uid() = id OR public.check_admin())
    WITH CHECK (auth.uid() = id AND is_admin = (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can view own inventory" ON public.inventory;
CREATE POLICY "Users can view own inventory"
    ON public.inventory FOR SELECT
    USING (auth.uid() = user_id);

-- 注意：inventory的INSERT/UPDATE/DELETE只能通过SECURITY DEFINER函数进行，用户不能直接操作
-- 管理员例外：允许管理员操作所有数据
DROP POLICY IF EXISTS "Admin can manage all inventory" ON public.inventory;
CREATE POLICY "Admin can manage all inventory"
    ON public.inventory FOR ALL
    USING (public.check_admin());

DROP POLICY IF EXISTS "Market orders public read" ON public.market_orders;
CREATE POLICY "Market orders public read"
    ON public.market_orders FOR SELECT
    USING (true);

-- 注意：market_orders的INSERT/UPDATE/DELETE只能通过SECURITY DEFINER函数进行
-- 管理员例外：允许管理员操作所有数据
DROP POLICY IF EXISTS "Admin can manage all orders" ON public.market_orders;
CREATE POLICY "Admin can manage all orders"
    ON public.market_orders FOR ALL
    USING (public.check_admin());

DROP POLICY IF EXISTS "Users can view own mails" ON public.system_mails;
CREATE POLICY "Users can view own mails"
    ON public.system_mails FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own mails" ON public.system_mails;
CREATE POLICY "Users can update own mails"
    ON public.system_mails FOR UPDATE
    USING (auth.uid() = user_id OR public.check_admin())
    WITH CHECK (auth.uid() = user_id OR public.check_admin());

ALTER TABLE public.item_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own submissions" ON public.item_submissions;
CREATE POLICY "Users can view own submissions"
    ON public.item_submissions FOR SELECT
    USING (auth.uid() = user_id OR public.check_admin());

DROP POLICY IF EXISTS "Users can insert submissions" ON public.item_submissions;
CREATE POLICY "Users can insert submissions"
    ON public.item_submissions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- 管理员例外：允许管理员操作所有投稿
DROP POLICY IF EXISTS "Admin can manage all submissions" ON public.item_submissions;
CREATE POLICY "Admin can manage all submissions"
    ON public.item_submissions FOR ALL
    USING (public.check_admin());

-- ============================================================
-- 7. 触发器：注册后自动创建 profile
-- ============================================================
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
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
    clean_nickname := LEFT(clean_nickname, 10);
    
    -- 检查昵称是否已被使用，如果是则添加随机后缀
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE nickname = clean_nickname) LOOP
        clean_nickname := LEFT(clean_nickname, 8) || FLOOR(RANDOM() * 100)::INT;
    END LOOP;
    
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

-- 保护profiles表敏感字段，所有字段只能通过SECURITY DEFINER函数或管理员修改
DROP FUNCTION IF EXISTS public.protect_profile_fields() CASCADE;
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 如果是SECURITY DEFINER函数调用（current_user为postgres），允许修改所有字段
    IF current_user = 'postgres' THEN
        RETURN NEW;
    END IF;
    
    -- 如果是管理员操作，允许修改所有字段
    IF public.check_admin() THEN
        RETURN NEW;
    END IF;
    
    -- 普通用户禁止修改任何字段（昵称修改需要改名卡，必须通过change_nickname()函数）
    -- 保留id和created_at不变，其他所有字段强制恢复为原值
    NEW.nickname := OLD.nickname;
    NEW.shells := OLD.shells;
    NEW.is_admin := OLD.is_admin;
    NEW.created_at := OLD.created_at;
    NEW.last_open_at := OLD.last_open_at;
    NEW.last_claim_at := OLD.last_claim_at;
    NEW.ad_claimed_at := OLD.ad_claimed_at;
    NEW.is_bot := OLD.is_bot;
    NEW.dragon_boat_online_total := OLD.dragon_boat_online_total;
    NEW.dragon_boat_last_update := OLD.dragon_boat_last_update;
    NEW.dragon_boat_claimed_1min := OLD.dragon_boat_claimed_1min;
    NEW.dragon_boat_claimed_10min := OLD.dragon_boat_claimed_10min;
    NEW.dragon_boat_claimed_60min := OLD.dragon_boat_claimed_60min;
    NEW.dragon_boat_daily_reset := OLD.dragon_boat_daily_reset;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile ON public.profiles;
CREATE TRIGGER protect_profile
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_profile_fields();

-- 保护system_mails表敏感字段，用户只能修改is_read
DROP FUNCTION IF EXISTS public.protect_mail_fields() CASCADE;
CREATE OR REPLACE FUNCTION public.protect_mail_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 如果是SECURITY DEFINER函数调用（current_user为postgres），允许修改所有字段
    IF current_user = 'postgres' THEN
        RETURN NEW;
    END IF;
    
    -- 如果是管理员操作，允许修改所有字段
    IF public.check_admin() THEN
        RETURN NEW;
    END IF;
    
    -- 普通用户只能修改is_read字段，其他字段保持原值
    NEW.user_id := OLD.user_id;
    NEW.title := OLD.title;
    NEW.content := OLD.content;
    NEW.created_at := OLD.created_at;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_mail ON public.system_mails;
CREATE TRIGGER protect_mail
    BEFORE UPDATE ON public.system_mails
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_mail_fields();

-- 保护item_submissions表，强制设置status、reward_shells、admin_note为默认值
DROP FUNCTION IF EXISTS public.protect_submission_fields() CASCADE;
CREATE OR REPLACE FUNCTION public.protect_submission_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 如果是SECURITY DEFINER函数调用（current_user为postgres），允许修改所有字段
    IF current_user = 'postgres' THEN
        RETURN NEW;
    END IF;
    
    -- 如果是管理员操作，允许修改所有字段
    IF public.check_admin() THEN
        RETURN NEW;
    END IF;
    
    -- 普通用户提交时强制设置管理员字段为默认值，防止用户绕过审核
    NEW.status := 'pending';
    NEW.reward_shells := 0;
    NEW.admin_note := NULL;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_submission ON public.item_submissions;
CREATE TRIGGER protect_submission
    BEFORE INSERT ON public.item_submissions
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_submission_fields();

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
    base_rate NUMERIC := 1;
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
            WHEN 'white' THEN 0 * inv.quantity
            WHEN 'green' THEN 0 * inv.quantity
            WHEN 'blue' THEN 1 * inv.quantity
            WHEN 'purple' THEN 5 * inv.quantity
            WHEN 'orange' THEN 10 * inv.quantity
            WHEN 'red' THEN 30 * inv.quantity
            ELSE 0
        END
    ), 0) INTO boost_rate
    FROM public.inventory inv
    JOIN public.items i ON inv.item_id = i.id
    WHERE inv.user_id = user_uuid AND i.item_type = 'collection';

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

    -- 计算总权重（只计算有权重的物品）
    SELECT COALESCE(SUM(drop_weight), 0) INTO total_weight
    FROM public.items
    WHERE drop_weight > 0;

    IF total_weight <= 0 THEN
        RAISE EXCEPTION '暂无物品可掉落';
    END IF;

    -- 随机选择
    random_pick := floor(random() * total_weight) + 1;
    remaining := random_pick;

    FOR selected_item IN
        SELECT id, name, quality, image_name, drop_weight
        FROM public.items
        WHERE drop_weight > 0
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
DROP FUNCTION IF EXISTS public.buy_market_order(BIGINT, INT);
CREATE OR REPLACE FUNCTION public.buy_market_order(p_order_id BIGINT, p_quantity INT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    buyer_uuid UUID := auth.uid();
    order_rec RECORD;
    item_name TEXT;
    total_price BIGINT;
    buyer_shells BIGINT;
    buy_qty INT;
    buyer_nickname TEXT;
BEGIN
    IF buyer_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    -- 获取买家昵称
    SELECT nickname INTO buyer_nickname FROM public.profiles WHERE id = buyer_uuid;

    SELECT mo.*, i.name AS item_name INTO order_rec
    FROM public.market_orders mo
    JOIN public.items i ON mo.item_id = i.id
    WHERE mo.id = p_order_id AND mo.status = 'active'
    FOR UPDATE;

    IF order_rec IS NULL THEN
        RAISE EXCEPTION '订单不存在或已失效';
    END IF;

    IF order_rec.seller_id = buyer_uuid THEN
        RAISE EXCEPTION '不能购买自己的订单';
    END IF;

    -- 默认购买全部
    buy_qty := COALESCE(p_quantity, order_rec.quantity);
    
    IF buy_qty <= 0 OR buy_qty > order_rec.quantity THEN
        RAISE EXCEPTION '购买数量无效';
    END IF;

    total_price := order_rec.price_per_unit * buy_qty;
    item_name := order_rec.item_name;

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
    VALUES (buyer_uuid, order_rec.item_id, buy_qty)
    ON CONFLICT ON CONSTRAINT inventory_user_id_item_id_key
    DO UPDATE SET quantity = public.inventory.quantity + EXCLUDED.quantity;

    -- 如果购买全部，完成订单；否则减少订单数量
    IF buy_qty >= order_rec.quantity THEN
        -- 完成订单
        UPDATE public.market_orders
        SET status = 'completed'
        WHERE id = p_order_id;

        -- 给卖家发送系统邮件
        INSERT INTO public.system_mails (user_id, title, content)
        VALUES (
            order_rec.seller_id,
            '订单出售成功',
            '你上架的「' || public.sanitize_text(item_name) || '」已被「' || public.sanitize_text(buyer_nickname) || '」全部购买，获得 ' || total_price || ' 果壳币。'
        );
    ELSE
        -- 部分购买，减少订单数量
        UPDATE public.market_orders
        SET quantity = quantity - buy_qty
        WHERE id = p_order_id;

        -- 给卖家发送系统邮件
        INSERT INTO public.system_mails (user_id, title, content)
        VALUES (
            order_rec.seller_id,
            '订单部分出售',
            '你上架的「' || public.sanitize_text(item_name) || '」被「' || public.sanitize_text(buyer_nickname) || '」购买 ' || buy_qty || ' 件，获得 ' || total_price || ' 果壳币，剩余 ' || (order_rec.quantity - buy_qty) || ' 件。'
        );
    END IF;
END;
$$;

-- ============================================================
-- 12. RPC 函数：获取用户背包
-- ============================================================
DROP FUNCTION IF EXISTS public.get_user_inventory();
CREATE OR REPLACE FUNCTION public.get_user_inventory()
RETURNS TABLE(inv_id BIGINT, item_id BIGINT, quantity INT, acquired_at TIMESTAMP, item_name TEXT, item_quality TEXT, item_image TEXT, item_description TEXT, item_type TEXT)
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
        inv.acquired_at AT TIME ZONE 'Asia/Shanghai' AS acquired_at,
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

-- ============================================================
-- 12.5 RPC 函数：使用改名卡修改昵称
-- ============================================================
DROP FUNCTION IF EXISTS public.use_rename_card(TEXT);
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
    
    IF char_length(trim(p_new_nickname)) > 10 THEN
        RETURN jsonb_build_object('success', false, 'message', '昵称不能超过10个字符');
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
    seller_is_admin BOOLEAN,
    seller_is_bot BOOLEAN,
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
    -- 转义 LIKE 通配符防止通配符注入
    p_search := REPLACE(REPLACE(p_search, '%', '\%'), '_', '\_');

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
        COALESCE(p.is_admin, false) AS seller_is_admin,
        COALESCE(p.is_bot, false) AS seller_is_bot,
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
-- 14. RPC 函数：领取广告奖励（每日限领一次，随机 1000-5000）
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

    -- 使用 FOR UPDATE 锁定行，防止竞态条件
    SELECT ad_claimed_at::DATE INTO last_claim_date
    FROM public.profiles
    WHERE id = user_uuid
    FOR UPDATE;

    IF last_claim_date = CURRENT_DATE THEN
        RAISE EXCEPTION '今日已领取过广告奖励，请明天再来';
    END IF;

    reward := FLOOR(1000 + RANDOM() * 4000)::BIGINT;

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
            WHEN 'white' THEN 0 * inv.quantity
            WHEN 'green' THEN 0 * inv.quantity
            WHEN 'blue' THEN 1 * inv.quantity
            WHEN 'purple' THEN 5 * inv.quantity
            WHEN 'orange' THEN 10 * inv.quantity
            WHEN 'red' THEN 30 * inv.quantity
            ELSE 0
        END
    ), 0) INTO boost_rate
    FROM public.inventory inv
    JOIN public.items i ON inv.item_id = i.id
    WHERE inv.user_id = user_uuid AND i.item_type = 'collection';

    RETURN boost_rate;
END;
$$;

-- ============================================================
-- 16. RPC 函数：获取用户邮件
-- ============================================================
DROP FUNCTION IF EXISTS public.get_user_mails();
CREATE OR REPLACE FUNCTION public.get_user_mails(p_page INT DEFAULT 1, p_limit INT DEFAULT 20)
RETURNS TABLE(mail_id BIGINT, title TEXT, content TEXT, is_read BOOLEAN, created_at TIMESTAMP, total_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    v_offset INT;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    v_offset := (GREATEST(p_page, 1) - 1) * GREATEST(p_limit, 1);

    RETURN QUERY
    SELECT
        sm.id AS mail_id,
        sm.title,
        sm.content,
        sm.is_read,
        sm.created_at AT TIME ZONE 'Asia/Shanghai' AS created_at,
        (SELECT COUNT(*) FROM public.system_mails WHERE user_id = user_uuid)::BIGINT AS total_count
    FROM public.system_mails sm
    WHERE sm.user_id = user_uuid
    ORDER BY sm.created_at DESC
    LIMIT p_limit
    OFFSET v_offset;
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
DROP FUNCTION IF EXISTS public.check_admin() CASCADE;
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
CREATE OR REPLACE FUNCTION public.get_all_users(p_page INT DEFAULT 1, p_limit INT DEFAULT 20)
RETURNS TABLE(user_id UUID, nickname TEXT, email TEXT, shells BIGINT, is_admin BOOLEAN, is_bot BOOLEAN, created_at TIMESTAMP, total_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    v_offset INT;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    IF NOT public.check_admin() THEN
        RAISE EXCEPTION '无权限';
    END IF;

    v_offset := (GREATEST(p_page, 1) - 1) * GREATEST(p_limit, 1);

    RETURN QUERY
    SELECT
        p.id AS user_id,
        p.nickname,
        COALESCE(au.email, '')::TEXT AS email,
        p.shells,
        p.is_admin,
        p.is_bot,
        p.created_at AT TIME ZONE 'Asia/Shanghai' AS created_at,
        (SELECT COUNT(*) FROM public.profiles)::BIGINT AS total_count
    FROM public.profiles p
    LEFT JOIN auth.users au ON p.id = au.id
    ORDER BY p.created_at DESC
    LIMIT p_limit
    OFFSET v_offset;
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
        '管理员向您发放了「' || public.sanitize_text(i.name) || '」×' || p_quantity || '，请查看背包。'
    FROM public.items i
    WHERE i.id = p_item_id;
END;
$$;

-- ============================================================
-- 21. RPC 函数：获取所有收藏品（管理员）
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_get_items();
CREATE OR REPLACE FUNCTION public.admin_get_items(p_page INT DEFAULT 1, p_limit INT DEFAULT 50)
RETURNS TABLE(item_id BIGINT, name TEXT, quality TEXT, image_name TEXT, description TEXT, drop_weight INT, item_type TEXT, total_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    v_offset INT;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    IF NOT public.check_admin() THEN
        RAISE EXCEPTION '无权限';
    END IF;

    v_offset := (GREATEST(p_page, 1) - 1) * GREATEST(p_limit, 1);

    RETURN QUERY
    SELECT i.id AS item_id, i.name, i.quality, i.image_name, i.description, i.drop_weight, i.item_type,
        (SELECT COUNT(*) FROM public.items)::BIGINT AS total_count
    FROM public.items i
    ORDER BY i.id
    LIMIT p_limit
    OFFSET v_offset;
END;
$$;

-- ============================================================
-- 21b. RPC 函数：修改用户果壳币（管理员）
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_update_user_shells(UUID, BIGINT);
CREATE OR REPLACE FUNCTION public.admin_update_user_shells(p_user_id UUID, p_shells BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    old_shells BIGINT;
    user_nickname TEXT;
BEGIN
    IF user_uuid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '未登录');
    END IF;

    IF NOT public.check_admin() THEN
        RETURN jsonb_build_object('success', false, 'message', '无权限');
    END IF;

    IF p_shells < 0 THEN
        RETURN jsonb_build_object('success', false, 'message', '果壳币不能为负数');
    END IF;

    SELECT nickname, shells INTO user_nickname, old_shells FROM public.profiles WHERE id = p_user_id;
    IF user_nickname IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '用户不存在');
    END IF;

    UPDATE public.profiles SET shells = p_shells WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', '已将 ' || user_nickname || ' 的果壳币从 ' || old_shells || ' 调整为 ' || p_shells,
        'user_id', p_user_id,
        'old_shells', old_shells,
        'new_shells', p_shells
    );
END;
$$;

-- ============================================================
-- 21c. RPC 函数：增减用户果壳币（管理员）
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_adjust_user_shells(UUID, BIGINT, TEXT);
CREATE OR REPLACE FUNCTION public.admin_adjust_user_shells(p_user_id UUID, p_amount BIGINT, p_reason TEXT DEFAULT '')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    old_shells BIGINT;
    new_shells BIGINT;
    user_nickname TEXT;
    change_type TEXT;
BEGIN
    IF user_uuid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '未登录');
    END IF;

    IF NOT public.check_admin() THEN
        RETURN jsonb_build_object('success', false, 'message', '无权限');
    END IF;

    IF p_amount = 0 THEN
        RETURN jsonb_build_object('success', false, 'message', '调整金额不能为0');
    END IF;

    SELECT nickname, shells INTO user_nickname, old_shells FROM public.profiles WHERE id = p_user_id;
    IF user_nickname IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '用户不存在');
    END IF;

    new_shells := old_shells + p_amount;
    IF new_shells < 0 THEN
        RETURN jsonb_build_object('success', false, 'message', '果壳币不能为负数，当前余额: ' || old_shells);
    END IF;

    UPDATE public.profiles SET shells = new_shells WHERE id = p_user_id;
    change_type := CASE WHEN p_amount > 0 THEN '增加' ELSE '减少' END;

    -- 发送通知邮件
    INSERT INTO public.system_mails (user_id, title, content)
    VALUES (p_user_id, '果壳币变动', change_type || abs(p_amount) || '果壳币，原因: ' || COALESCE(p_reason, '管理员操作'));

    RETURN jsonb_build_object(
        'success', true,
        'message', change_type || abs(p_amount) || '果壳币成功，当前余额: ' || new_shells,
        'old_shells', old_shells,
        'new_shells', new_shells,
        'change', p_amount
    );
END;
$$;

-- ============================================================
-- 21d. RPC 函数：移除用户单个物品（管理员）
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_remove_user_item(UUID, BIGINT, INT);
CREATE OR REPLACE FUNCTION public.admin_remove_user_item(p_user_id UUID, p_item_id BIGINT, p_quantity INT DEFAULT 1)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    current_qty INT;
    user_nickname TEXT;
    item_name TEXT;
BEGIN
    IF user_uuid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '未登录');
    END IF;

    IF NOT public.check_admin() THEN
        RETURN jsonb_build_object('success', false, 'message', '无权限');
    END IF;

    SELECT nickname INTO user_nickname FROM public.profiles WHERE id = p_user_id;
    IF user_nickname IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '用户不存在');
    END IF;

    SELECT i.name, inv.quantity INTO item_name, current_qty
    FROM public.items i
    LEFT JOIN public.inventory inv ON inv.item_id = i.id AND inv.user_id = p_user_id
    WHERE i.id = p_item_id;

    IF item_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '物品不存在');
    END IF;

    IF current_qty IS NULL OR current_qty < p_quantity THEN
        RETURN jsonb_build_object('success', false, 'message', '物品数量不足，当前: ' || COALESCE(current_qty::TEXT, '0'));
    END IF;

    IF current_qty = p_quantity THEN
        DELETE FROM public.inventory WHERE user_id = p_user_id AND item_id = p_item_id;
    ELSE
        UPDATE public.inventory SET quantity = quantity - p_quantity WHERE user_id = p_user_id AND item_id = p_item_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', '已从 ' || user_nickname || ' 移除「' || item_name || '」×' || p_quantity,
        'item_name', item_name,
        'removed', p_quantity
    );
END;
$$;

-- ============================================================
-- 21e. RPC 函数：清空用户所有物品（管理员）
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_clear_user_items(UUID);
CREATE OR REPLACE FUNCTION public.admin_clear_user_items(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    user_nickname TEXT;
    item_count INT;
BEGIN
    IF user_uuid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '未登录');
    END IF;

    IF NOT public.check_admin() THEN
        RETURN jsonb_build_object('success', false, 'message', '无权限');
    END IF;

    SELECT nickname INTO user_nickname FROM public.profiles WHERE id = p_user_id;
    IF user_nickname IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '用户不存在');
    END IF;

    DELETE FROM public.inventory WHERE user_id = p_user_id;

    -- 获取删除了多少物品
    GET DIAGNOSTICS item_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'message', '已清空 ' || user_nickname || ' 的所有物品，共 ' || item_count || ' 种',
        'items_cleared', item_count
    );
END;
$$;

-- ============================================================
-- 21f. RPC 函数：设置/撤销管理员权限（管理员）
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_set_user_admin(UUID, BOOLEAN);
CREATE OR REPLACE FUNCTION public.admin_set_user_admin(p_user_id UUID, p_is_admin BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    user_nickname TEXT;
BEGIN
    IF user_uuid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '未登录');
    END IF;

    IF NOT public.check_admin() THEN
        RETURN jsonb_build_object('success', false, 'message', '无权限');
    END IF;

    SELECT nickname INTO user_nickname FROM public.profiles WHERE id = p_user_id;
    IF user_nickname IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '用户不存在');
    END IF;

    UPDATE public.profiles SET is_admin = p_is_admin WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', user_nickname || ' 的管理员权限已' || CASE WHEN p_is_admin THEN '开启' ELSE '撤销' END,
        'nickname', user_nickname,
        'is_admin', p_is_admin
    );
END;
$$;

-- ============================================================
-- 21h. RPC 函数：修改用户昵称（管理员）
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_change_user_nickname(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.admin_change_user_nickname(p_user_id UUID, p_new_nickname TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    old_nickname TEXT;
    new_nickname TEXT;
BEGIN
    IF user_uuid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '未登录');
    END IF;

    IF NOT public.check_admin() THEN
        RETURN jsonb_build_object('success', false, 'message', '无权限');
    END IF;

    -- 检查新昵称
    new_nickname := TRIM(p_new_nickname);
    IF new_nickname IS NULL OR LENGTH(new_nickname) < 2 THEN
        RETURN jsonb_build_object('success', false, 'message', '昵称至少需要2个字符');
    END IF;
    
    IF LENGTH(new_nickname) > 10 THEN
        RETURN jsonb_build_object('success', false, 'message', '昵称不能超过10个字符');
    END IF;
    
    -- 检查特殊字符
    IF new_nickname LIKE '%<%' OR new_nickname LIKE '%>%' OR new_nickname LIKE '%''%' 
       OR new_nickname LIKE '%"%' OR new_nickname LIKE '%\\%' OR new_nickname LIKE '%%;(%' OR new_nickname LIKE '%)%' THEN
        RETURN jsonb_build_object('success', false, 'message', '昵称不能包含特殊字符');
    END IF;

    -- 获取用户当前昵称
    SELECT nickname INTO old_nickname FROM public.profiles WHERE id = p_user_id;
    IF old_nickname IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '用户不存在');
    END IF;

    -- 检查新昵称是否已被使用
    IF EXISTS (SELECT 1 FROM public.profiles WHERE nickname = new_nickname AND id != p_user_id) THEN
        RETURN jsonb_build_object('success', false, 'message', '该昵称已被使用');
    END IF;

    -- 更新昵称
    UPDATE public.profiles SET nickname = new_nickname WHERE id = p_user_id;

    -- 发送通知邮件
    INSERT INTO public.system_mails (user_id, title, content)
    VALUES (p_user_id, '昵称被修改', '管理员将您的昵称从「' || old_nickname || '」修改为「' || new_nickname || '」');

    RETURN jsonb_build_object(
        'success', true,
        'message', '已将 ' || old_nickname || ' 的昵称修改为 ' || new_nickname,
        'old_nickname', old_nickname,
        'new_nickname', new_nickname
    );
END;
$$;

-- ============================================================
-- 21g. RPC 函数：获取用户列表（管理员，带搜索）
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_get_users(TEXT, INT, INT);
CREATE OR REPLACE FUNCTION public.admin_get_users(p_search TEXT DEFAULT '', p_page INT DEFAULT 1, p_limit INT DEFAULT 20)
RETURNS TABLE(
    user_id UUID,
    nickname TEXT,
    shells BIGINT,
    is_admin BOOLEAN,
    created_at TIMESTAMPTZ,
    total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    v_offset INT;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    IF NOT public.check_admin() THEN
        RAISE EXCEPTION '无权限';
    END IF;

    v_offset := (GREATEST(p_page, 1) - 1) * GREATEST(p_limit, 1);

    RETURN QUERY
    SELECT 
        p.id AS user_id,
        p.nickname,
        p.shells,
        p.is_admin,
        p.created_at,
        COUNT(*) OVER()::BIGINT AS total_count
    FROM public.profiles p
    WHERE p.nickname ILIKE '%' || COALESCE(p_search, '') || '%'
       OR p.id::TEXT LIKE '%' || COALESCE(p_search, '') || '%'
    ORDER BY p.created_at DESC
    LIMIT p_limit
    OFFSET v_offset;
END;
$$;

-- ============================================================
-- 22. RPC 函数：添加物品定义（管理员）
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
    v_name TEXT;
    v_desc TEXT;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    IF NOT public.check_admin() THEN
        RAISE EXCEPTION '无权限';
    END IF;

    v_name := TRIM(p_name);
    v_desc := TRIM(p_description);
    IF v_name IS NULL OR LENGTH(v_name) < 1 OR LENGTH(v_name) > 100 THEN
        RAISE EXCEPTION '物品名称长度需在1-100字符之间';
    END IF;
    IF v_desc IS NOT NULL AND LENGTH(v_desc) > 2000 THEN
        RAISE EXCEPTION '描述长度不能超过2000字符';
    END IF;

    INSERT INTO public.items (name, quality, image_name, description, drop_weight, item_type)
    VALUES (v_name, p_quality, p_image_name, v_desc, p_drop_weight, p_item_type)
    RETURNING id INTO new_id;

    RETURN new_id;
END;
$$;

-- ============================================================
-- 22b. RPC 函数：编辑物品定义（管理员）
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_update_item_definition(BIGINT, TEXT, TEXT, TEXT, TEXT, INT, TEXT);
DROP FUNCTION IF EXISTS public.admin_update_item_definition(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, INT);
CREATE OR REPLACE FUNCTION public.admin_update_item_definition(
    p_item_id BIGINT,
    p_name TEXT,
    p_quality TEXT,
    p_item_type TEXT,
    p_image_name TEXT,
    p_description TEXT,
    p_drop_weight INT
)
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

    UPDATE public.items
    SET name = p_name,
        quality = p_quality,
        image_name = p_image_name,
        description = p_description,
        drop_weight = p_drop_weight,
        item_type = p_item_type
    WHERE id = p_item_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '物品不存在';
    END IF;
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
DROP FUNCTION IF EXISTS public.submit_item(TEXT, TEXT, TEXT, INT, TEXT);
CREATE OR REPLACE FUNCTION public.submit_item(
    p_name TEXT,
    p_quality TEXT,
    p_description TEXT,
    p_drop_weight INT DEFAULT 100,
    p_image_name TEXT DEFAULT ''
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    new_id BIGINT;
    v_name TEXT;
    v_desc TEXT;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    -- 输入校验和清理
    v_name := TRIM(p_name);
    v_desc := TRIM(p_description);
    IF v_name IS NULL OR LENGTH(v_name) < 1 OR LENGTH(v_name) > 100 THEN
        RAISE EXCEPTION '物品名称长度需在1-100字符之间';
    END IF;
    IF v_desc IS NULL OR LENGTH(v_desc) > 2000 THEN
        RAISE EXCEPTION '描述长度不能超过2000字符';
    END IF;

    INSERT INTO public.item_submissions (user_id, name, quality, description, drop_weight, image_name)
    VALUES (user_uuid, v_name, p_quality, v_desc, p_drop_weight, p_image_name)
    RETURNING id INTO new_id;

    RETURN new_id;
END;
$$;

-- ============================================================
-- 25. RPC 函数：获取我的投稿
-- ============================================================
DROP FUNCTION IF EXISTS public.get_my_submissions();
CREATE OR REPLACE FUNCTION public.get_my_submissions()
RETURNS TABLE(id BIGINT, name TEXT, quality TEXT, image_name TEXT, description TEXT, drop_weight INT, status TEXT, reward_shells BIGINT, admin_note TEXT, created_at TIMESTAMP)
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
        s.image_name,
        s.description,
        s.drop_weight,
        s.status,
        s.reward_shells,
        s.admin_note,
        s.created_at AT TIME ZONE 'Asia/Shanghai' AS created_at
    FROM public.item_submissions s
    WHERE s.user_id = user_uuid
    ORDER BY s.created_at DESC;
END;
$$;

-- ============================================================
-- 26. RPC 函数：获取待审核投稿（管理员）
-- ============================================================
DROP FUNCTION IF EXISTS public.get_pending_submissions();
CREATE OR REPLACE FUNCTION public.get_pending_submissions(p_page INT DEFAULT 1, p_limit INT DEFAULT 20)
RETURNS TABLE(id BIGINT, user_id UUID, nickname TEXT, name TEXT, quality TEXT, image_name TEXT, description TEXT, drop_weight INT, status TEXT, reward_shells BIGINT, admin_note TEXT, created_at TIMESTAMP, total_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    v_offset INT;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    IF NOT public.check_admin() THEN
        RAISE EXCEPTION '无权限';
    END IF;

    v_offset := (GREATEST(p_page, 1) - 1) * GREATEST(p_limit, 1);

    RETURN QUERY
    SELECT
        s.id,
        s.user_id,
        p.nickname,
        s.name,
        s.quality,
        s.image_name,
        s.description,
        s.drop_weight,
        s.status,
        s.reward_shells,
        s.admin_note,
        s.created_at AT TIME ZONE 'Asia/Shanghai' AS created_at,
        (SELECT COUNT(*) FROM public.item_submissions WHERE item_submissions.status = 'pending')::BIGINT AS total_count
    FROM public.item_submissions s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    WHERE s.status = 'pending'
    ORDER BY s.created_at ASC
    LIMIT p_limit
    OFFSET v_offset;
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
    item_image_name TEXT;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    IF NOT public.check_admin() THEN
        RAISE EXCEPTION '无权限';
    END IF;

    SELECT s.user_id, s.name, s.quality, s.description, s.drop_weight, s.image_name, p.nickname
    INTO submitter_id, item_name, item_quality, item_description, item_drop_weight, item_image_name, submitter_nickname
    FROM public.item_submissions s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    WHERE s.id = p_submission_id AND s.status = 'pending';

    IF submitter_id IS NULL THEN
        RAISE EXCEPTION '投稿不存在或已处理';
    END IF;

    INSERT INTO public.items (name, quality, image_name, description, drop_weight)
    VALUES (item_name, item_quality, item_image_name, item_description, item_drop_weight);

    UPDATE public.item_submissions
    SET status = 'approved', reward_shells = p_reward_shells, updated_at = now()
    WHERE id = p_submission_id;

    UPDATE public.profiles
    SET shells = shells + p_reward_shells
    WHERE id = submitter_id;

    INSERT INTO public.system_mails (user_id, title, content)
    VALUES (submitter_id, '投稿通过',
        '恭喜！您投稿的「' || public.sanitize_text(item_name) || '」已通过审核，获得 ' || p_reward_shells || ' 果壳币奖励！');
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
        '您投稿的「' || public.sanitize_text(item_name) || '」未通过审核。原因：' || COALESCE(public.sanitize_text(p_admin_note), '无'));
END;
$$;

-- ============================================================
-- 29. RPC 函数：使用端午节福袋
-- ============================================================
DROP FUNCTION IF EXISTS public.use_dragon_boat_bag();
CREATE OR REPLACE FUNCTION public.use_dragon_boat_bag()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    bag_item_id BIGINT;
    inv_id BIGINT;
    selected_item RECORD;
    total_weight NUMERIC;
    random_pick NUMERIC;
    remaining NUMERIC;
    item_row RECORD;
BEGIN
    IF user_uuid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '请先登录');
    END IF;
    
    -- 查找端午节福袋物品定义
    SELECT id INTO bag_item_id FROM public.items WHERE name = '端午节福袋' AND item_type = 'consumable';
    
    IF bag_item_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '端午节福袋不存在');
    END IF;
    
    -- 检查用户是否拥有福袋
    SELECT id INTO inv_id FROM public.inventory WHERE user_id = user_uuid AND item_id = bag_item_id;
    
    IF inv_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '你没有端午节福袋');
    END IF;
    
    -- 计算端午收藏品的总权重
    -- 如果drop_weight全为0，则使用固定权重：白色100，绿色80，蓝色50，紫色30，橙色15，红色5
    SELECT COALESCE(SUM(
        CASE 
            WHEN i.drop_weight > 0 THEN i.drop_weight
            WHEN i.quality = 'white' THEN 100
            WHEN i.quality = 'green' THEN 80
            WHEN i.quality = 'blue' THEN 50
            WHEN i.quality = 'purple' THEN 30
            WHEN i.quality = 'orange' THEN 15
            WHEN i.quality = 'red' THEN 5
            ELSE 50
        END
    ), 0) INTO total_weight
    FROM public.items i
    WHERE i.item_type = 'collection' AND i.name IN ('粽子', '艾草香囊', '龙舟模型', '五彩绳', '雄黄酒', '离骚');
    
    IF total_weight <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', '端午节收藏品暂不可用');
    END IF;
    
    -- 随机选择
    random_pick := floor(random() * total_weight) + 1;
    remaining := random_pick;
    
    FOR item_row IN
        SELECT i.id, i.name, i.quality, i.image_name, 
            CASE 
                WHEN i.drop_weight > 0 THEN i.drop_weight
                WHEN i.quality = 'white' THEN 100
                WHEN i.quality = 'green' THEN 80
                WHEN i.quality = 'blue' THEN 50
                WHEN i.quality = 'purple' THEN 30
                WHEN i.quality = 'orange' THEN 15
                WHEN i.quality = 'red' THEN 5
                ELSE 50
            END AS effective_weight
        FROM public.items i
        WHERE i.item_type = 'collection' AND i.name IN ('粽子', '艾草香囊', '龙舟模型', '五彩绳', '雄黄酒', '《离骚》')
        ORDER BY i.id
    LOOP
        remaining := remaining - item_row.effective_weight;
        IF remaining <= 0 THEN
            selected_item := item_row;
            EXIT;
        END IF;
    END LOOP;
    
    IF selected_item IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '端午节福袋暂不可用');
    END IF;
    
    -- 扣除一个福袋（只减数量，不删除整行）
    UPDATE public.inventory SET quantity = quantity - 1 WHERE id = inv_id;

    -- 如果数量为0，删除该行
    DELETE FROM public.inventory WHERE id = inv_id AND quantity <= 0;
    
    -- 给用户随机收藏品
    INSERT INTO public.inventory (user_id, item_id, quantity)
    VALUES (user_uuid, selected_item.id, 1)
    ON CONFLICT ON CONSTRAINT inventory_user_id_item_id_key
    DO UPDATE SET quantity = public.inventory.quantity + 1;
    
    RETURN jsonb_build_object(
        'success', true, 
        'message', '恭喜获得「' || selected_item.name || '」！',
        'item_id', selected_item.id,
        'item_name', selected_item.name,
        'item_quality', selected_item.quality,
        'item_image', selected_item.image_name
    );
END;
$$;

-- ============================================================
-- 30. RPC 函数：端午活动 - 更新在线时间并领取在线礼包
-- ============================================================
DROP FUNCTION IF EXISTS public.claim_dragon_boat_online();
CREATE OR REPLACE FUNCTION public.claim_dragon_boat_online()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    now_time TIMESTAMPTZ := now();
    is_dragon_boat BOOLEAN;
    v_online_total INT;
    v_last_update TIMESTAMPTZ;
    v_daily_reset DATE;
    bag_item_id BIGINT;
    selected_item RECORD;
    v_claimed_1min BOOLEAN;
    v_claimed_10min BOOLEAN;
    v_claimed_60min BOOLEAN;
    claimed_1 BOOLEAN := false;
    claimed_10 BOOLEAN := false;
    claimed_60 BOOLEAN := false;
BEGIN
    IF user_uuid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '请先登录');
    END IF;
    
    -- 检查是否为端午期间（6月19日至21日）
    is_dragon_boat := CURRENT_DATE BETWEEN '2026-06-19' AND '2026-06-21';
    
    IF NOT is_dragon_boat THEN
        RETURN jsonb_build_object('success', false, 'message', '端午活动已结束', 'is_dragon_boat', false);
    END IF;
    
    -- 获取或初始化活动进度
    SELECT online_total, last_update, claimed_1min, claimed_10min, claimed_60min, daily_reset
    INTO v_online_total, v_last_update, v_claimed_1min, v_claimed_10min, v_claimed_60min, v_daily_reset
    FROM public.dragon_boat_progress
    WHERE user_id = user_uuid;
    
    -- 如果没有记录，插入新记录
    IF v_online_total IS NULL THEN
        INSERT INTO public.dragon_boat_progress (user_id, online_total, last_update, claimed_1min, claimed_10min, claimed_60min, daily_reset)
        VALUES (user_uuid, 0, now_time, false, false, false, CURRENT_DATE);
        v_online_total := 0;
        v_last_update := now_time;
        v_claimed_1min := false;
        v_claimed_10min := false;
        v_claimed_60min := false;
        v_daily_reset := CURRENT_DATE;
    END IF;
    
    -- 检查是否需要重置（每日重置）
    IF v_daily_reset IS NULL OR v_daily_reset < CURRENT_DATE THEN
        UPDATE public.dragon_boat_progress 
        SET online_total = 0,
            claimed_1min = false,
            claimed_10min = false,
            claimed_60min = false,
            daily_reset = CURRENT_DATE,
            last_update = now_time
        WHERE user_id = user_uuid;
        v_online_total := 0;
        v_last_update := now_time;
        v_claimed_1min := false;
        v_claimed_10min := false;
        v_claimed_60min := false;
        v_daily_reset := CURRENT_DATE;
    END IF;
    
    -- 计算新增在线时间（最多计算到60分钟）
    IF v_last_update IS NOT NULL THEN
        v_online_total := v_online_total + LEAST(EXTRACT(EPOCH FROM (now_time - v_last_update))::INT, 3600);
    END IF;
    v_online_total := LEAST(v_online_total, 3600);
    
    -- 更新在线时间
    UPDATE public.dragon_boat_progress 
    SET online_total = v_online_total,
        last_update = now_time
    WHERE user_id = user_uuid;
    
    -- 查找端午福袋物品定义
    SELECT id INTO bag_item_id FROM public.items WHERE name = '端午节福袋' AND item_type = 'consumable';
    
    IF bag_item_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '端午节福袋不存在');
    END IF;
    
    -- 检查并领取1分钟奖励
    IF v_online_total >= 60 AND NOT v_claimed_1min THEN
        INSERT INTO public.inventory (user_id, item_id, quantity)
        VALUES (user_uuid, bag_item_id, 1)
        ON CONFLICT ON CONSTRAINT inventory_user_id_item_id_key
        DO UPDATE SET quantity = public.inventory.quantity + 1;
        
        UPDATE public.dragon_boat_progress SET claimed_1min = true WHERE user_id = user_uuid;
        claimed_1 := true;
    END IF;
    
    -- 检查并领取10分钟奖励
    IF v_online_total >= 600 AND NOT v_claimed_10min THEN
        INSERT INTO public.inventory (user_id, item_id, quantity)
        VALUES (user_uuid, bag_item_id, 2)
        ON CONFLICT ON CONSTRAINT inventory_user_id_item_id_key
        DO UPDATE SET quantity = public.inventory.quantity + 2;
        
        UPDATE public.dragon_boat_progress SET claimed_10min = true WHERE user_id = user_uuid;
        claimed_10 := true;
    END IF;
    
    -- 检查并领取60分钟奖励
    IF v_online_total >= 3600 AND NOT v_claimed_60min THEN
        INSERT INTO public.inventory (user_id, item_id, quantity)
        VALUES (user_uuid, bag_item_id, 3)
        ON CONFLICT ON CONSTRAINT inventory_user_id_item_id_key
        DO UPDATE SET quantity = public.inventory.quantity + 3;
        
        UPDATE public.dragon_boat_progress SET claimed_60min = true WHERE user_id = user_uuid;
        claimed_60 := true;
    END IF;
    
    -- 更新返回结果
    RETURN jsonb_build_object(
        'success', true,
        'online_total', v_online_total,
        'claimed_1min', claimed_1 OR v_claimed_1min,
        'claimed_10min', claimed_10 OR v_claimed_10min,
        'claimed_60min', claimed_60 OR v_claimed_60min
    );
END;
$$;

-- ============================================================
-- 31. RPC 函数：彩票 - 获取当前期次
-- ============================================================
DROP FUNCTION IF EXISTS public.get_lottery_round();
CREATE OR REPLACE FUNCTION public.get_lottery_round()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    current_round RECORD;
    user_ticket_count INT := 0;
    time_left INT;
BEGIN
    -- 查找当前活跃期次
    SELECT * INTO current_round FROM public.lottery_rounds
    WHERE status = 'active' OR (status = 'closed' AND winning_numbers IS NULL)
    ORDER BY public.lottery_rounds.round_id DESC
    LIMIT 1;

    -- 如果没有期次，创建新期次
    IF current_round IS NULL THEN
        INSERT INTO public.lottery_rounds (round_number, start_time, end_time, base_pool, rollover_pool, status)
        VALUES (
            'R' || to_char(now(), 'YYYYMMDDHH24MI'),
            now(),
            now() + INTERVAL '8 hours',
            5000,
            0,
            'active'
        )
        RETURNING * INTO current_round;
    END IF;

    -- 检查期次是否已过期需要关闭
    IF current_round.status = 'active' AND current_round.end_time < now() THEN
        UPDATE public.lottery_rounds SET status = 'closed' WHERE round_id = current_round.round_id;
        current_round.status := 'closed';
    END IF;

    -- 计算剩余时间
    IF current_round.status = 'active' THEN
        time_left := GREATEST(0, EXTRACT(EPOCH FROM (current_round.end_time - now())));
    ELSE
        time_left := 0;
    END IF;

    -- 统计用户已购彩票数（按数量计算）
    IF user_uuid IS NOT NULL THEN
        SELECT COALESCE(SUM(lottery_tickets.quantity), 0) INTO user_ticket_count FROM public.lottery_tickets
        WHERE lottery_tickets.round_id = current_round.round_id AND lottery_tickets.user_id = user_uuid;
    END IF;

    RETURN jsonb_build_object(
        'round_id', current_round.round_id,
        'round_number', current_round.round_number,
        'start_time', current_round.start_time AT TIME ZONE 'Asia/Shanghai',
        'end_time', current_round.end_time AT TIME ZONE 'Asia/Shanghai',
        'base_pool', current_round.base_pool,
        'rollover_pool', current_round.rollover_pool,
        'total_pool', current_round.base_pool + current_round.rollover_pool,
        'winning_numbers', current_round.winning_numbers,
        'status', current_round.status,
        'time_left', time_left,
        'user_ticket_count', user_ticket_count,
        'max_tickets', 30,
        'ticket_price', 100
    );
END;
$$;

-- ============================================================
-- 32. RPC 函数：彩票 - 购买彩票
-- ============================================================
DROP FUNCTION IF EXISTS public.buy_lottery_ticket(numbers TEXT);
DROP FUNCTION IF EXISTS public.buy_lottery_ticket(numbers TEXT, quantity INT);
DROP FUNCTION IF EXISTS public.buy_lottery_ticket(numbers TEXT, p_quantity INT);
DROP FUNCTION IF EXISTS public.buy_lottery_ticket(p_numbers TEXT, p_quantity INT);
CREATE OR REPLACE FUNCTION public.buy_lottery_ticket(p_numbers TEXT, p_quantity INT DEFAULT 1)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    current_round RECORD;
    ticket_price BIGINT := 100;
    max_tickets INT := 30;
    user_ticket_count INT := 0;
    existing_quantity INT := 0;
    total_cost BIGINT;
    clean_numbers TEXT;
    char_arr TEXT[];
    i INT;
    j INT;
    has_duplicate BOOLEAN := false;
BEGIN
    IF user_uuid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '请先登录');
    END IF;

    -- 验证数量参数
    IF p_quantity IS NULL OR p_quantity < 1 THEN
        p_quantity := 1;
    END IF;
    IF p_quantity > 10 THEN
        RETURN jsonb_build_object('success', false, 'message', '单次最多购买10注');
    END IF;

    -- 获取当前期次
    SELECT * INTO current_round FROM public.lottery_rounds
    WHERE status = 'active'
    ORDER BY public.lottery_rounds.round_id DESC
    LIMIT 1;

    IF current_round IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '暂无可用期次');
    END IF;

    IF current_round.end_time < now() THEN
        RETURN jsonb_build_object('success', false, 'message', '本期已结束');
    END IF;

    -- 验证号码格式
    clean_numbers := UPPER(TRIM(p_numbers));
    
    IF LENGTH(clean_numbers) != 6 THEN
        RETURN jsonb_build_object('success', false, 'message', '请选择6个号码');
    END IF;

    IF clean_numbers !~ '^[0-9A-F]{6}$' THEN
        RETURN jsonb_build_object('success', false, 'message', '号码只能包含0-9和A-F');
    END IF;

    -- 检查是否有重复字符
    char_arr := REGEXP_SPLIT_TO_ARRAY(clean_numbers, '');
    FOR i IN 1..6 LOOP
        FOR j IN (i+1)..6 LOOP
            IF char_arr[i] = char_arr[j] THEN
                has_duplicate := true;
                EXIT;
            END IF;
        END LOOP;
        IF has_duplicate THEN EXIT; END IF;
    END LOOP;

    IF has_duplicate THEN
        RETURN jsonb_build_object('success', false, 'message', '号码不能重复');
    END IF;

    clean_numbers := (
        SELECT string_agg(c, '') FROM (
            SELECT unnest(REGEXP_SPLIT_TO_ARRAY(clean_numbers, '')) AS c
            ORDER BY c
        ) AS t
    );

    -- 检查限购（按数量计算）
    SELECT COALESCE(SUM(lt.quantity), 0) INTO user_ticket_count FROM public.lottery_tickets lt
    WHERE lt.round_id = current_round.round_id AND lt.user_id = user_uuid;

    -- 检查是否已有相同号码，获取现有数量
    SELECT COALESCE(lt.quantity, 0) INTO existing_quantity FROM public.lottery_tickets lt
    WHERE lt.round_id = current_round.round_id AND lt.user_id = user_uuid AND lt.numbers = clean_numbers;

    -- 计算购买后的总数量
    IF user_ticket_count + p_quantity > max_tickets THEN
        RETURN jsonb_build_object('success', false, 'message', '单期限购30注，当前已购' || user_ticket_count || '注');
    END IF;

    total_cost := ticket_price * p_quantity;

    -- 检查余额
    PERFORM 1 FROM public.profiles WHERE id = user_uuid AND shells >= total_cost FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', '果壳币不足，需要' || total_cost || '果壳币');
    END IF;

    -- 扣除果壳币
    UPDATE public.profiles SET shells = shells - total_cost WHERE id = user_uuid;

    -- 添加到奖池
    UPDATE public.lottery_rounds SET base_pool = base_pool + total_cost WHERE round_id = current_round.round_id;

    -- 插入或更新彩票记录（合并相同号码）
    INSERT INTO public.lottery_tickets (round_id, user_id, numbers, quantity)
    VALUES (current_round.round_id, user_uuid, clean_numbers, p_quantity)
    ON CONFLICT (round_id, user_id, numbers) DO UPDATE
    SET quantity = lottery_tickets.quantity + EXCLUDED.quantity;

    RETURN jsonb_build_object(
        'success', true,
        'message', '购买成功',
        'numbers', clean_numbers,
        'quantity', p_quantity,
        'total_quantity', existing_quantity + p_quantity,
        'round_number', current_round.round_number,
        'remaining_tickets', max_tickets - user_ticket_count - p_quantity,
        'cost', total_cost
    );
END;
$$;

-- ============================================================
-- 33. RPC 函数：彩票 - 开奖
-- ============================================================
DROP FUNCTION IF EXISTS public.draw_lottery_round(BIGINT);
DROP FUNCTION IF EXISTS public.draw_lottery_round(BIGINT, TEXT);
CREATE OR REPLACE FUNCTION public.draw_lottery_round(p_round_id BIGINT, custom_numbers TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    v_round RECORD;
    v_winning_numbers TEXT;
    v_total_pool BIGINT;
    v_tickets RECORD;
    v_matched_count INT;
    v_prize_level TEXT;
    v_prize_amount BIGINT;
    v_pool_share NUMERIC;
    v_winners INT;
    v_people INT;
    v_rollover_amount BIGINT;
    v_winner RECORD;
    v_prize_details TEXT;
    v_total_prize BIGINT;
    v_total_prize_distributed BIGINT;
    v_prize_pool_share BIGINT;
    
    prizes JSONB := '[{"level":"特等奖","matches":[6],"share":0.53},{"level":"一等奖","matches":[5],"share":0.25},{"level":"二等奖","matches":[4],"share":0.15},{"level":"三等奖","matches":[3],"share":0.05},{"level":"幸运奖","matches":[1,2],"share":0.02}]';
    v_prize RECORD;
BEGIN
    SELECT * INTO v_round FROM public.lottery_rounds WHERE lottery_rounds.round_id = p_round_id;

    IF v_round IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '期次不存在');
    END IF;

    IF v_round.status = 'drawn' THEN
        RETURN jsonb_build_object('success', false, 'message', '已开奖');
    END IF;

    IF v_round.end_time > now() AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = user_uuid AND is_admin = true) THEN
        RETURN jsonb_build_object('success', false, 'message', '权限不足');
    END IF;

    IF custom_numbers IS NOT NULL THEN
        v_winning_numbers := UPPER(TRIM(custom_numbers));
        IF LENGTH(v_winning_numbers) != 6 OR v_winning_numbers !~ '^[0-9A-F]{6}$' THEN
            RETURN jsonb_build_object('success', false, 'message', '自定义号码格式错误');
        END IF;
        -- 排序自定义号码
        v_winning_numbers := (
            SELECT string_agg(c, '') FROM (
                SELECT unnest(REGEXP_SPLIT_TO_ARRAY(v_winning_numbers, '')) AS c
                ORDER BY c
            ) AS t
        );
    ELSE
        -- 随机生成6个不重复的号码并排序
        v_winning_numbers := (
            SELECT string_agg(c, '' ORDER BY c) FROM (
                SELECT c FROM unnest(ARRAY['0','1','2','3','4','5','6','7','8','9','A','B','C','D','E','F']) AS c
                ORDER BY random()
                LIMIT 6
            ) AS t
        );
    END IF;

    v_total_pool := v_round.base_pool + v_round.rollover_pool;
    v_rollover_amount := 0;
    v_total_prize_distributed := 0;

    -- 计算每个奖项的中奖情况，同时累计未中奖滚存和中奖后剩余
    FOR v_prize IN SELECT * FROM jsonb_to_recordset(prizes) AS x(level TEXT, matches INT[], share NUMERIC) LOOP
        v_winners := 0;
        v_people := 0;
        v_prize_pool_share := FLOOR(v_total_pool * v_prize.share);
        
        SELECT COALESCE(SUM(lt.quantity), 0) INTO v_winners 
        FROM public.lottery_tickets lt
        WHERE lt.round_id = p_round_id 
        AND lt.is_winning = false
        AND (SELECT CAST(COUNT(*) AS INT) FROM unnest(REGEXP_SPLIT_TO_ARRAY(lt.numbers, '')) AS n 
             WHERE n = ANY(REGEXP_SPLIT_TO_ARRAY(v_winning_numbers, ''))) = ANY(v_prize.matches);
        
        SELECT COUNT(DISTINCT lt.user_id) INTO v_people 
        FROM public.lottery_tickets lt
        WHERE lt.round_id = p_round_id 
        AND lt.is_winning = false
        AND (SELECT CAST(COUNT(*) AS INT) FROM unnest(REGEXP_SPLIT_TO_ARRAY(lt.numbers, '')) AS n 
             WHERE n = ANY(REGEXP_SPLIT_TO_ARRAY(v_winning_numbers, ''))) = ANY(v_prize.matches);
        
        IF v_winners > 0 THEN
            v_prize_amount := v_prize_pool_share / v_winners;
            v_total_prize_distributed := v_total_prize_distributed + v_prize_pool_share;
            
            UPDATE public.lottery_tickets t
            SET is_winning = true,
                prize_level = v_prize.level,
                prize_amount = v_prize_amount * t.quantity
            WHERE t.round_id = p_round_id
            AND t.is_winning = false
            AND (SELECT CAST(COUNT(*) AS INT) FROM unnest(REGEXP_SPLIT_TO_ARRAY(t.numbers, '')) AS n 
                 WHERE n = ANY(REGEXP_SPLIT_TO_ARRAY(v_winning_numbers, ''))) = ANY(v_prize.matches);
        ELSE
            v_rollover_amount := v_rollover_amount + v_prize_pool_share;
        END IF;

        INSERT INTO public.lottery_results (round_id, prize_level, pool_share, total_winners, total_people, rollover_amount)
        VALUES (p_round_id, v_prize.level, v_prize.share, v_winners, v_people, v_prize_pool_share);
    END LOOP;

    -- 更新本期为已开奖，并记录最终奖池和剩余滚存
    UPDATE public.lottery_rounds 
    SET winning_numbers = v_winning_numbers,
        status = 'drawn',
        final_pool = v_total_pool,
        rollover_pool = v_rollover_amount
    WHERE lottery_rounds.round_id = p_round_id;

    -- 创建新期次，滚存 = 本期剩余未分配金额
    INSERT INTO public.lottery_rounds (round_number, start_time, end_time, base_pool, rollover_pool, status)
    VALUES (
        'R' || to_char(now(), 'YYYYMMDDHH24MI'),
        now(),
        now() + INTERVAL '8 hours',
        5000,
        v_rollover_amount,
        'active'
    );

    -- 发放奖金
    UPDATE public.profiles p
    SET shells = shells + COALESCE((SELECT SUM(prize_amount) FROM public.lottery_tickets t WHERE t.user_id = p.id AND t.round_id = p_round_id), 0)
    WHERE EXISTS (SELECT 1 FROM public.lottery_tickets t WHERE t.user_id = p.id AND t.round_id = p_round_id AND t.is_winning = true);

    -- 给中奖用户发送邮件通知
    FOR v_winner IN SELECT DISTINCT t.user_id FROM public.lottery_tickets t WHERE t.round_id = p_round_id AND t.is_winning = true LOOP
        -- 获取用户中奖详情
        SELECT array_to_string(array_agg(t.prize_level || ' ' || t.prize_amount || '果壳币'), '，') INTO v_prize_details
        FROM public.lottery_tickets t WHERE t.user_id = v_winner.user_id AND t.round_id = p_round_id AND t.is_winning = true;
        
        SELECT SUM(t.prize_amount) INTO v_total_prize FROM public.lottery_tickets t WHERE t.user_id = v_winner.user_id AND t.round_id = p_round_id AND t.is_winning = true;
        
        INSERT INTO public.system_mails (user_id, title, content)
        VALUES (
            v_winner.user_id,
            '恭喜中奖！',
            '你在第 ' || v_round.round_number || ' 期彩票中获奖项：' || COALESCE(public.sanitize_text(v_prize_details), '') || '，总计获得 ' || COALESCE(v_total_prize, 0) || ' 果壳币。'
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'message', '开奖完成',
        'round_id', p_round_id,
        'winning_numbers', v_winning_numbers,
        'total_pool', v_total_pool
    );
END;
$$;

-- ============================================================
-- 34. RPC 函数：彩票 - 获取往期开奖记录
-- ============================================================
DROP FUNCTION IF EXISTS public.get_lottery_history(limit_num INT);
DROP FUNCTION IF EXISTS public.get_lottery_history(limit_num INT, p_page INT);
CREATE OR REPLACE FUNCTION public.get_lottery_history(p_page INT DEFAULT 1, p_limit INT DEFAULT 10)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    v_offset INT;
    v_total BIGINT;
BEGIN
    v_offset := (GREATEST(p_page, 1) - 1) * GREATEST(p_limit, 1);
    SELECT COUNT(*) INTO v_total FROM public.lottery_rounds WHERE status = 'drawn';

    RETURN jsonb_build_object(
        'total_count', v_total,
        'page', p_page,
        'limit', p_limit,
        'rounds', (
            SELECT jsonb_agg(row) FROM (
                SELECT 
                    r.round_id,
                    r.round_number,
                    r.end_time AT TIME ZONE 'Asia/Shanghai' AS end_time,
                    r.winning_numbers,
                    COALESCE(r.final_pool, r.base_pool + r.rollover_pool) AS total_pool,
                    r.status,
                    (SELECT jsonb_agg(
                        jsonb_build_object(
                            'prize_level', lr.prize_level,
                            'pool_share', lr.pool_share,
                            'total_winners', lr.total_winners,
                            'total_people', lr.total_people,
                            'rollover_amount', lr.rollover_amount
                        )
                    ) FROM public.lottery_results lr WHERE lr.round_id = r.round_id) AS results,
                    (SELECT jsonb_agg(
                        jsonb_build_object(
                            'numbers', lt.numbers,
                            'quantity', lt.quantity,
                            'is_winning', lt.is_winning,
                            'prize_level', lt.prize_level,
                            'prize_amount', lt.prize_amount
                        )
                    ) FROM public.lottery_tickets lt 
                     WHERE lt.round_id = r.round_id AND lt.user_id = user_uuid) AS user_tickets
                FROM public.lottery_rounds r
                WHERE r.status = 'drawn'
                ORDER BY r.round_id DESC
                LIMIT p_limit
                OFFSET v_offset
            ) AS row
        )
    );
END;
$$;

-- ============================================================
-- 35. RPC 函数：彩票 - 获取用户彩票（修复模糊列round_id）
-- ============================================================
DROP FUNCTION IF EXISTS public.get_user_tickets(BIGINT);
DROP FUNCTION IF EXISTS public.get_user_tickets(p_round_id BIGINT);
CREATE OR REPLACE FUNCTION public.get_user_tickets(p_round_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
BEGIN
    IF user_uuid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '请先登录');
    END IF;

    RETURN (
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', data.id,
                'numbers', data.numbers,
                'quantity', data.quantity,
                'is_winning', data.is_winning,
                'prize_level', data.prize_level,
                'prize_amount', data.prize_amount,
                'created_at', data.created_at
            )
        ) FROM (
            SELECT 
                t.id,
                t.numbers,
                t.quantity,
                t.is_winning,
                t.prize_level,
                t.prize_amount,
                t.created_at
            FROM public.lottery_tickets t
            WHERE t.user_id = user_uuid AND t.round_id = p_round_id
            ORDER BY t.created_at DESC
        ) AS data
    );
END;
$$;

-- ============================================================
-- 36. RPC 函数：收藏品合成（9个同品质收藏品合成1个下一品质随机收藏品）
-- ============================================================
DROP FUNCTION IF EXISTS public.merge_collections(TEXT);
DROP FUNCTION IF EXISTS public.merge_collections(BIGINT[]);
CREATE OR REPLACE FUNCTION public.merge_collections(p_item_ids BIGINT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    v_item RECORD;
    v_target_item RECORD;
    quality_order TEXT[] := ARRAY['white', 'green', 'blue', 'purple', 'orange', 'red'];
    next_quality TEXT;
    v_quality_idx INT;
    total_weight NUMERIC;
    random_pick NUMERIC;
    remaining NUMERIC;
    v_temp RECORD;
    v_first_quality TEXT;
    item_count INT;
BEGIN
    IF user_uuid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '请先登录');
    END IF;

    -- 检查数量
    item_count := array_length(p_item_ids, 1);
    IF item_count IS NULL OR item_count < 9 THEN
        RETURN jsonb_build_object('success', false, 'message', '需要选择9个收藏品');
    END IF;

    -- 获取第一个物品的品质
    SELECT i.quality INTO v_first_quality
    FROM public.inventory inv
    JOIN public.items i ON inv.item_id = i.id
    WHERE inv.id = p_item_ids[1]
    AND inv.user_id = user_uuid
    AND i.item_type = 'collection';

    -- 检查所有物品是否都是收藏品且品质相同
    FOR v_temp IN
        SELECT inv.id, i.quality, i.item_type, inv.quantity
        FROM unnest(p_item_ids) AS arr_id(id)
        JOIN public.inventory inv ON inv.id = arr_id.id
        JOIN public.items i ON inv.item_id = i.id
        WHERE inv.user_id = user_uuid
    LOOP
        IF v_temp.item_type != 'collection' THEN
            RETURN jsonb_build_object('success', false, 'message', '只能选择收藏品');
        END IF;
        IF v_temp.quality != v_first_quality THEN
            RETURN jsonb_build_object('success', false, 'message', '所有收藏品必须是同一品质');
        END IF;
    END LOOP;

    -- 检查是否是最高品质
    SELECT array_position(quality_order, v_first_quality) INTO v_quality_idx;
    IF v_quality_idx IS NULL OR v_quality_idx >= array_length(quality_order, 1) THEN
        RETURN jsonb_build_object('success', false, 'message', '该品质已达到最高品质');
    END IF;

    next_quality := quality_order[v_quality_idx + 1];

    -- 随机选择一个下一品质的收藏品（按权重，与开盒算法一致）
    SELECT COALESCE(SUM(drop_weight), 0) INTO total_weight
    FROM public.items
    WHERE quality = next_quality AND item_type = 'collection' AND drop_weight > 0;

    IF total_weight <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', '暂无可合成的' || next_quality || '品质收藏品');
    END IF;

    random_pick := floor(random() * total_weight) + 1;
    remaining := random_pick;

    FOR v_temp IN
        SELECT id, name, quality, drop_weight
        FROM public.items
        WHERE quality = next_quality AND item_type = 'collection' AND drop_weight > 0
        ORDER BY id
    LOOP
        remaining := remaining - v_temp.drop_weight;
        IF remaining <= 0 THEN
            v_target_item := v_temp;
            EXIT;
        END IF;
    END LOOP;

    -- 扣除9个收藏品（每个物品ID扣1个）
    FOR v_temp IN
        SELECT unnest(p_item_ids) AS inv_id
    LOOP
        UPDATE public.inventory
        SET quantity = quantity - 1
        WHERE id = v_temp.inv_id AND user_id = user_uuid;
    END LOOP;

    -- 删除数量为0的记录
    DELETE FROM public.inventory WHERE user_id = user_uuid AND quantity <= 0;

    -- 添加1个目标物品
    INSERT INTO public.inventory (user_id, item_id, quantity)
    VALUES (user_uuid, v_target_item.id, 1)
    ON CONFLICT ON CONSTRAINT inventory_user_id_item_id_key
    DO UPDATE SET quantity = public.inventory.quantity + 1;

    RETURN jsonb_build_object(
        'success', true,
        'message', '合成成功！获得' || v_target_item.name,
        'item_id', v_target_item.id,
        'item_name', v_target_item.name,
        'item_quality', v_target_item.quality
    );
END;
$$;

-- 为已存在的 profiles 表添加机器人标记
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_bot') THEN
        ALTER TABLE public.profiles ADD COLUMN is_bot BOOLEAN DEFAULT false;
    END IF;
END $$;

-- ============================================================
-- 机器人配置表（关联 profiles.id，机器人即 is_bot=true 的 profile）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bot_configs (
    bot_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT true,               -- 是否启用自动补货
    min_orders INT DEFAULT 2,                   -- 最低挂单数（低于此数自动补）
    max_orders INT DEFAULT 6,                   -- 最高挂单数（超过此数不补）
    qualities TEXT[] DEFAULT ARRAY['white','green','blue','purple'], -- 允许的品质
    -- 各品质基价（果壳币）
    price_white INT DEFAULT 80,
    price_green INT DEFAULT 800,
    price_blue INT DEFAULT 7000,
    price_purple INT DEFAULT 65000,
    price_orange INT DEFAULT 300000,
    price_red INT DEFAULT 1000000,
    -- 各品质数量范围（格式: 'min,max'）
    qty_white TEXT DEFAULT '1,3',
    qty_green TEXT DEFAULT '1,3',
    qty_blue TEXT DEFAULT '1,3',
    qty_purple TEXT DEFAULT '1,1',
    qty_orange TEXT DEFAULT '1,1',
    qty_red TEXT DEFAULT '1,1',
    -- 价格浮动百分比（0.9=±10%）
    price_fluctuation NUMERIC DEFAULT 0.2,
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.bot_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Bot configs admin all" ON public.bot_configs;
DROP POLICY IF EXISTS "Bot configs admin read" ON public.bot_configs;
DROP POLICY IF EXISTS "Bot configs admin write" ON public.bot_configs;
CREATE POLICY "Bot configs admin read" ON public.bot_configs FOR SELECT USING (true);
CREATE POLICY "Bot configs admin write" ON public.bot_configs FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- 将机器人写入 auth.users（和普通用户完全一样）
DO $$
BEGIN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at) VALUES
        ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '66666666-6666-6666-6666-666666666666@ucasbox.local', '__bot_no_login__', now(), '{"nickname":"黑心小贩","is_bot":true}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at) VALUES
        ('77777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '77777777-7777-7777-7777-777777777777@ucasbox.local', '__bot_no_login__', now(), '{"nickname":"小卖部","is_bot":true}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at) VALUES
        ('88888888-8888-8888-8888-888888888888', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '88888888-8888-8888-8888-888888888888@ucasbox.local', '__bot_no_login__', now(), '{"nickname":"小盒子喵喵喵","is_bot":true}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'auth.users insert skipped (RLS or permission): %', SQLERRM;
END $$;

-- 插入机器人到 profiles，同时插入默认配置
DO $$
BEGIN
    -- 黑心小贩
    INSERT INTO public.profiles (id, nickname, shells, is_admin, is_bot)
    VALUES ('66666666-6666-6666-6666-666666666666', '黑心小贩', 999999999, false, true)
    ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname, is_bot = true;
    INSERT INTO public.bot_configs (bot_id) VALUES ('66666666-6666-6666-6666-666666666666')
    ON CONFLICT DO NOTHING;
    -- 小卖部
    INSERT INTO public.profiles (id, nickname, shells, is_admin, is_bot)
    VALUES ('77777777-7777-7777-7777-777777777777', '小卖部', 999999999, false, true)
    ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname, is_bot = true;
    INSERT INTO public.bot_configs (bot_id) VALUES ('77777777-7777-7777-7777-777777777777')
    ON CONFLICT DO NOTHING;
    -- 小盒子喵喵喵
    INSERT INTO public.profiles (id, nickname, shells, is_admin, is_bot)
    VALUES ('88888888-8888-8888-8888-888888888888', '小盒子喵喵喵', 999999999, false, true)
    ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname, is_bot = true;
    INSERT INTO public.bot_configs (bot_id) VALUES ('88888888-8888-8888-8888-888888888888')
    ON CONFLICT DO NOTHING;
END $$;

-- ============================================================
-- 管理员：获取所有机器人（含配置与当前挂单）
-- ============================================================
DROP FUNCTION IF EXISTS public.get_all_bots_with_config();
CREATE OR REPLACE FUNCTION public.get_all_bots_with_config()
RETURNS TABLE(
    bot_id UUID,
    nickname TEXT,
    shells BIGINT,
    enabled BOOLEAN,
    min_orders INT,
    max_orders INT,
    qualities TEXT[],
    price_white INT, price_green INT, price_blue INT,
    price_purple INT, price_orange INT, price_red INT,
    qty_white TEXT, qty_green TEXT, qty_blue TEXT,
    qty_purple TEXT, qty_orange TEXT, qty_red TEXT,
    price_fluctuation NUMERIC,
    active_order_count BIGINT,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_is_admin BOOLEAN;
BEGIN
    SELECT COALESCE(p.is_admin, false) INTO v_is_admin FROM public.profiles p WHERE p.id = auth.uid();
    IF NOT v_is_admin THEN
        RAISE EXCEPTION '无权限';
    END IF;

    RETURN QUERY
    SELECT
        ba.id AS bot_id,
        ba.nickname,
        ba.shells,
        COALESCE(bc.enabled, true) AS enabled,
        COALESCE(bc.min_orders, 2) AS min_orders,
        COALESCE(bc.max_orders, 6) AS max_orders,
        COALESCE(bc.qualities, ARRAY['white','green','blue','purple']) AS qualities,
        COALESCE(bc.price_white, 80) AS price_white,
        COALESCE(bc.price_green, 800) AS price_green,
        COALESCE(bc.price_blue, 7000) AS price_blue,
        COALESCE(bc.price_purple, 65000) AS price_purple,
        COALESCE(bc.price_orange, 300000) AS price_orange,
        COALESCE(bc.price_red, 1000000) AS price_red,
        COALESCE(bc.qty_white, '1,3') AS qty_white,
        COALESCE(bc.qty_green, '1,3') AS qty_green,
        COALESCE(bc.qty_blue, '1,3') AS qty_blue,
        COALESCE(bc.qty_purple, '1,1') AS qty_purple,
        COALESCE(bc.qty_orange, '1,1') AS qty_orange,
        COALESCE(bc.qty_red, '1,1') AS qty_red,
        COALESCE(bc.price_fluctuation, 0.2) AS price_fluctuation,
        (SELECT COUNT(*) FROM public.market_orders mo
         WHERE mo.seller_id = ba.id AND mo.status = 'active') AS active_order_count,
        bc.updated_at
    FROM public.profiles ba
    LEFT JOIN public.bot_configs bc ON ba.id = bc.bot_id
    WHERE ba.is_bot = true
    ORDER BY ba.id;
END;
$$;

-- ============================================================
-- 管理员：更新机器人配置
-- ============================================================
DROP FUNCTION IF EXISTS public.update_bot_config(
    UUID, BOOLEAN, INT, INT, TEXT[],
    INT, INT, INT, INT, INT, INT,
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC
);
CREATE OR REPLACE FUNCTION public.update_bot_config(
    p_bot_id UUID,
    p_enabled BOOLEAN,
    p_min_orders INT,
    p_max_orders INT,
    p_qualities TEXT[],
    p_price_white INT, p_price_green INT, p_price_blue INT,
    p_price_purple INT, p_price_orange INT, p_price_red INT,
    p_qty_white TEXT, p_qty_green TEXT, p_qty_blue TEXT,
    p_qty_purple TEXT, p_qty_orange TEXT, p_qty_red TEXT,
    p_price_fluctuation NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_admin BOOLEAN;
BEGIN
    SELECT COALESCE(p.is_admin, false) INTO is_admin
    FROM public.profiles p WHERE p.id = auth.uid();

    IF NOT is_admin THEN
        RETURN jsonb_build_object('success', false, 'message', '无管理员权限');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.bot_configs WHERE bot_id = p_bot_id) THEN
        RETURN jsonb_build_object('success', false, 'message', '机器人不存在');
    END IF;

    INSERT INTO public.bot_configs (
        bot_id, enabled, min_orders, max_orders, qualities,
        price_white, price_green, price_blue,
        price_purple, price_orange, price_red,
        qty_white, qty_green, qty_blue,
        qty_purple, qty_orange, qty_red,
        price_fluctuation, updated_at
    )
    VALUES (
        p_bot_id, p_enabled, p_min_orders, p_max_orders, p_qualities,
        p_price_white, p_price_green, p_price_blue,
        p_price_purple, p_price_orange, p_price_red,
        p_qty_white, p_qty_green, p_qty_blue,
        p_qty_purple, p_qty_orange, p_qty_red,
        p_price_fluctuation, now()
    )
    ON CONFLICT (bot_id) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        min_orders = EXCLUDED.min_orders,
        max_orders = EXCLUDED.max_orders,
        qualities = EXCLUDED.qualities,
        price_white = EXCLUDED.price_white,
        price_green = EXCLUDED.price_green,
        price_blue = EXCLUDED.price_blue,
        price_purple = EXCLUDED.price_purple,
        price_orange = EXCLUDED.price_orange,
        price_red = EXCLUDED.price_red,
        qty_white = EXCLUDED.qty_white,
        qty_green = EXCLUDED.qty_green,
        qty_blue = EXCLUDED.qty_blue,
        qty_purple = EXCLUDED.qty_purple,
        qty_orange = EXCLUDED.qty_orange,
        qty_red = EXCLUDED.qty_red,
        price_fluctuation = EXCLUDED.price_fluctuation,
        updated_at = now();

    RETURN jsonb_build_object('success', true, 'message', '配置已更新');
END;
$$;

-- ============================================================
-- 管理员：手动上架物品给机器人
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_bot_list_item(BIGINT, UUID, INT, BIGINT);
CREATE OR REPLACE FUNCTION public.admin_bot_list_item(
    p_item_id BIGINT,
    p_bot_id UUID,
    p_quantity INT,
    p_price BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_admin BOOLEAN;
    item_name TEXT;
    new_order_id BIGINT;
BEGIN
    SELECT COALESCE(p.is_admin, false) INTO is_admin
    FROM public.profiles p WHERE p.id = auth.uid();

    IF NOT is_admin THEN
        RETURN jsonb_build_object('success', false, 'message', '无管理员权限');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.bot_configs WHERE bot_id = p_bot_id) THEN
        RETURN jsonb_build_object('success', false, 'message', '机器人不存在');
    END IF;

    SELECT name INTO item_name FROM public.items WHERE id = p_item_id;
    IF item_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '物品不存在');
    END IF;

    -- 给机器人背包加物品
    INSERT INTO public.inventory (user_id, item_id, quantity)
    VALUES (p_bot_id, p_item_id, p_quantity)
    ON CONFLICT ON CONSTRAINT inventory_user_id_item_id_key
    DO UPDATE SET quantity = public.inventory.quantity + EXCLUDED.quantity;

    -- 上架
    INSERT INTO public.market_orders (seller_id, item_id, quantity, price_per_unit, type, status)
    VALUES (p_bot_id, p_item_id, p_quantity, p_price, 'sell', 'active')
    RETURNING id INTO new_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', '已上架「' || item_name || '」×' || p_quantity,
        'order_id', new_order_id
    );
END;
$$;

-- ============================================================
-- 管理员：下架机器人的指定订单
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_bot_cancel_order(BIGINT);
CREATE OR REPLACE FUNCTION public.admin_bot_cancel_order(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_admin BOOLEAN;
    rec RECORD;
BEGIN
    SELECT COALESCE(p.is_admin, false) INTO is_admin
    FROM public.profiles p WHERE p.id = auth.uid();

    IF NOT is_admin THEN
        RETURN jsonb_build_object('success', false, 'message', '无管理员权限');
    END IF;

    SELECT mo.* INTO rec
    FROM public.market_orders mo
    JOIN public.bot_configs bc ON mo.seller_id = bc.bot_id
    WHERE mo.id = p_order_id AND mo.status = 'active';

    IF rec IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '订单不存在或非机器人订单');
    END IF;

    UPDATE public.market_orders SET status = 'cancelled' WHERE id = p_order_id;

    -- 物品退回机器人背包（不退款）
    INSERT INTO public.inventory (user_id, item_id, quantity)
    VALUES (rec.seller_id, rec.item_id, rec.quantity)
    ON CONFLICT ON CONSTRAINT inventory_user_id_item_id_key
    DO UPDATE SET quantity = public.inventory.quantity + EXCLUDED.quantity;

    RETURN jsonb_build_object('success', true, 'message', '已下架该订单');
END;
$$;

-- ============================================================
-- 机器人：按配置自动补货（每小时由 pg_cron 调用）
-- ============================================================
DROP FUNCTION IF EXISTS public.bot_replenish();
CREATE OR REPLACE FUNCTION public.bot_replenish()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    cfg RECORD;
    item_rec RECORD;
    total_weight NUMERIC;
    rand_pick NUMERIC;
    remaining NUMERIC;
    qty INT;
    qty_min INT;
    qty_max INT;
    price BIGINT;
    base_price INT;
    price_flu NUMERIC;
    current_count INT;
    bot_added INT;
    total_added INT := 0;
    v_is_admin BOOLEAN;
BEGIN
    -- 检查权限：允许 pg_cron 调用（无认证用户）或管理员调用
    -- pg_cron 调用时 auth.uid() 返回 NULL
    IF auth.uid() IS NOT NULL THEN
        SELECT COALESCE(p.is_admin, false) INTO v_is_admin
        FROM public.profiles p WHERE p.id = auth.uid();
        IF NOT v_is_admin THEN
            RETURN jsonb_build_object('success', false, 'message', '无权限');
        END IF;
    END IF;
    FOR cfg IN
        SELECT bc.bot_id, bc.enabled,
               bc.min_orders, bc.max_orders, bc.qualities,
               bc.price_white, bc.price_green, bc.price_blue,
               bc.price_purple, bc.price_orange, bc.price_red,
               bc.qty_white, bc.qty_green, bc.qty_blue,
               bc.qty_purple, bc.qty_orange, bc.qty_red,
               bc.price_fluctuation
        FROM public.bot_configs bc
        WHERE bc.enabled = true
    LOOP
        -- 统计当前活跃挂单数
        SELECT COUNT(*) INTO current_count
        FROM public.market_orders
        WHERE seller_id = cfg.bot_id AND status = 'active';

        -- 不低于最低挂单数则跳过
        IF current_count >= cfg.min_orders THEN
            CONTINUE;
        END IF;

        bot_added := 0;

        -- 随机补1~3件（不超过最高挂单数）
        FOR i IN 1..(1 + floor(random() * 3))::INT LOOP
            SELECT COUNT(*) INTO current_count
            FROM public.market_orders
            WHERE seller_id = cfg.bot_id AND status = 'active';

            IF current_count >= cfg.max_orders THEN
                EXIT;
            END IF;

            -- 按配置的品质范围和权重随机抽取物品
            SELECT COALESCE(SUM(drop_weight), 0) INTO total_weight
            FROM public.items
            WHERE drop_weight > 0
              AND item_type = 'collection'
              AND quality = ANY(cfg.qualities);

            IF total_weight <= 0 THEN
                EXIT;
            END IF;

            rand_pick := floor(random() * total_weight) + 1;
            remaining := rand_pick;
            item_rec := NULL;

            FOR item_rec IN
                SELECT id, name, quality, drop_weight
                FROM public.items
                WHERE drop_weight > 0
                  AND item_type = 'collection'
                  AND quality = ANY(cfg.qualities)
                ORDER BY id
            LOOP
                remaining := remaining - item_rec.drop_weight;
                IF remaining <= 0 THEN
                    EXIT;
                END IF;
            END LOOP;

            -- 未抽到物品则跳过
            IF item_rec IS NULL OR item_rec.id IS NULL THEN
                CONTINUE;
            END IF;

            -- 解析数量范围（格式："min,max"）
            qty_min := 1; qty_max := 1;
            BEGIN
                EXECUTE format(
                    'SELECT (regexp_matches(%L, ''(\d+),(\d+)''))[1]::int, (regexp_matches(%L, ''(\d+),(\d+)''))[2]::int',
                    CASE item_rec.quality
                        WHEN 'white'  THEN cfg.qty_white
                        WHEN 'green' THEN cfg.qty_green
                        WHEN 'blue'  THEN cfg.qty_blue
                        WHEN 'purple' THEN cfg.qty_purple
                        WHEN 'orange' THEN cfg.qty_orange
                        WHEN 'red'   THEN cfg.qty_red
                        ELSE '1,1'
                    END,
                    CASE item_rec.quality
                        WHEN 'white'  THEN cfg.qty_white
                        WHEN 'green' THEN cfg.qty_green
                        WHEN 'blue'  THEN cfg.qty_blue
                        WHEN 'purple' THEN cfg.qty_purple
                        WHEN 'orange' THEN cfg.qty_orange
                        WHEN 'red'   THEN cfg.qty_red
                        ELSE '1,1'
                    END
                ) INTO qty_min, qty_max;
            EXCEPTION WHEN OTHERS THEN
                qty_min := 1; qty_max := 1;
            END;

            IF qty_max IS NULL OR qty_max < qty_min THEN
                qty_min := 1; qty_max := 1;
            END IF;

            qty := qty_min + floor(random() * (qty_max - qty_min + 1))::INT;
            qty := GREATEST(1, qty);

            -- 解析基价
            base_price := CASE item_rec.quality
                WHEN 'white'  THEN cfg.price_white
                WHEN 'green' THEN cfg.price_green
                WHEN 'blue'  THEN cfg.price_blue
                WHEN 'purple' THEN cfg.price_purple
                WHEN 'orange' THEN cfg.price_orange
                WHEN 'red'   THEN cfg.price_red
                ELSE 100
            END;

            -- 价格浮动
            price_flu := COALESCE(cfg.price_fluctuation, 0.2);
            price := GREATEST(1, FLOOR(base_price * (1 - price_flu / 2 + random() * price_flu))::BIGINT);

            -- 给机器人背包加物品（仅上架用，不影响已有库存）
            INSERT INTO public.inventory (user_id, item_id, quantity)
            VALUES (cfg.bot_id, item_rec.id, qty)
            ON CONFLICT ON CONSTRAINT inventory_user_id_item_id_key
            DO UPDATE SET quantity = public.inventory.quantity + EXCLUDED.quantity;

            -- 上架新订单（不下架、不修改已有订单）
            INSERT INTO public.market_orders
                (seller_id, item_id, quantity, price_per_unit, type, status)
            VALUES
                (cfg.bot_id, item_rec.id, qty, price, 'sell', 'active');

            bot_added := bot_added + 1;
        END LOOP;

        total_added := total_added + bot_added;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'message', '机器人补货完成，新增 ' || total_added || ' 条挂单'
    );
END;
$$;

-- ============================================================
-- 管理员手动触发机器人补货（权限校验）
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_bot_replenish();
CREATE OR REPLACE FUNCTION public.admin_bot_replenish()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_admin BOOLEAN;
BEGIN
    SELECT COALESCE(p.is_admin, false) INTO is_admin
    FROM public.profiles p WHERE p.id = auth.uid();

    IF NOT is_admin THEN
        RETURN jsonb_build_object('success', false, 'message', '无管理员权限');
    END IF;

    PERFORM public.bot_replenish();
    RETURN jsonb_build_object('success', true, 'message', '补货完成');
END;
$$;

-- ============================================================
-- 管理员：获取指定机器人的所有活跃挂单
-- ============================================================
DROP FUNCTION IF EXISTS public.get_bot_orders(UUID);
CREATE OR REPLACE FUNCTION public.get_bot_orders(p_bot_id UUID)
RETURNS TABLE(
    order_id BIGINT, item_id BIGINT, quantity INT,
    price_per_unit BIGINT, created_at TIMESTAMPTZ,
    item_name TEXT, item_quality TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_is_admin BOOLEAN;
BEGIN
    SELECT COALESCE(p.is_admin, false) INTO v_is_admin FROM public.profiles p WHERE p.id = auth.uid();
    IF NOT v_is_admin THEN
        RAISE EXCEPTION '无权限';
    END IF;

    RETURN QUERY
    SELECT mo.id, mo.item_id, mo.quantity, mo.price_per_unit, mo.created_at,
           i.name, i.quality
    FROM public.market_orders mo
    JOIN public.items i ON mo.item_id = i.id
    WHERE mo.seller_id = p_bot_id AND mo.status = 'active'
    ORDER BY mo.created_at DESC;
END;
$$;

-- ============================================================
-- pg_cron 定时任务：每小时第 16 分钟自动补货
-- ============================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- 仅当 job 已存在时才删除
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bot_replenish_hourly') THEN
            PERFORM cron.delete_job('bot_replenish_hourly');
        END IF;
        PERFORM cron.schedule(
            'bot_replenish_hourly',
            '16 * * * *',
            'SELECT public.bot_replenish()'
        );
    ELSE
        RAISE NOTICE 'pg_cron extension not installed, skipping cron setup';
    END IF;
END $$;

-- HTML 标签清理辅助函数（防止 XSS 注入到邮件/通知中）
CREATE OR REPLACE FUNCTION public.sanitize_text(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT regexp_replace(regexp_replace(COALESCE(p_text, ''), '<[^>]*>', '', 'g'), '["''\\]', '', 'g');
$$;

-- 获取最低版本要求
CREATE OR REPLACE FUNCTION public.get_min_version()
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN jsonb_build_object(
        'min_version_code', 4,
        'min_version', 'v0.4.3_beta',
        'message', '当前版本过低，可能无法正常游玩，请更新（CTRL+SHIFT+F5刷新浏览器或寻求可靠途径）https://27584.github.io/UCAS_BOX'
    );
END;
$$;

-- ============================================
-- 动态功能
-- ============================================

-- 动态帖子表
CREATE TABLE IF NOT EXISTS public.posts (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('Asia/Shanghai', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('Asia/Shanghai', NOW())
);
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- 所有人可读帖子
DROP POLICY IF EXISTS "posts select all" ON public.posts;
CREATE POLICY "posts select all" ON public.posts FOR SELECT USING (true);

-- 登录用户只能插入自己id的帖子
DROP POLICY IF EXISTS "users insert own posts" ON public.posts;
CREATE POLICY "users insert own posts" ON public.posts FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 仅作者可编辑
DROP POLICY IF EXISTS "users update own posts" ON public.posts;
CREATE POLICY "users update own posts" ON public.posts FOR UPDATE USING (auth.uid() = user_id);

-- 仅作者可删除
DROP POLICY IF EXISTS "users delete own posts" ON public.posts;
CREATE POLICY "users delete own posts" ON public.posts FOR DELETE USING (auth.uid() = user_id);

-- 评论表（支持嵌套）
CREATE TABLE IF NOT EXISTS public.comments (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    parent_id BIGINT DEFAULT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('Asia/Shanghai', NOW())
);

-- 点赞表（帖子+评论共用）
CREATE TABLE IF NOT EXISTS public.likes (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('post', 'comment')),
    target_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('Asia/Shanghai', NOW()),
    UNIQUE(user_id, target_type, target_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON public.posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON public.comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON public.comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_likes_target ON public.likes(target_type, target_id);

-- 发帖
CREATE OR REPLACE FUNCTION public.create_post(p_content TEXT, p_tags TEXT[] DEFAULT '{}')
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    user_uuid UUID;
    v_post_id BIGINT;
BEGIN
    user_uuid := auth.uid();
    IF user_uuid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '请先登录');
    END IF;

    IF LENGTH(p_content) < 1 OR LENGTH(p_content) > 2000 THEN
        RETURN jsonb_build_object('success', false, 'message', '内容长度需在1-2000字符之间');
    END IF;

    INSERT INTO public.posts (user_id, content, tags)
    VALUES (user_uuid, p_content, p_tags)
    RETURNING id INTO v_post_id;

    RETURN jsonb_build_object('success', true, 'post_id', v_post_id);
END;
$$;


DROP FUNCTION IF EXISTS public.get_posts(INT, INT, TEXT);
CREATE OR REPLACE FUNCTION public.get_posts(
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0,
    p_tag TEXT DEFAULT NULL
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
    WHERE (p_tag IS NULL OR p_tag = '') OR p_tag = ANY(p.tags)
    ORDER BY p.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;


-- 搜索帖子（全文搜索 content 和 tags）
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
    -- 转义 LIKE 通配符防止通配符注入
    p_query := REPLACE(REPLACE(p_query, '%', '\%'), '_', '\_');
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


-- 搜索用户（昵称/邮箱），尊重 allow_search 隐私设置
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
    -- 转义 LIKE 通配符防止通配符注入
    p_query := REPLACE(REPLACE(p_query, '%', '\%'), '_', '\_');
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


-- 点赞/取消点赞
CREATE OR REPLACE FUNCTION public.toggle_like(p_target_type TEXT, p_target_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    user_uuid UUID;
    v_exists BOOLEAN;
BEGIN
    user_uuid := auth.uid();
    IF user_uuid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '请先登录');
    END IF;

    SELECT EXISTS(SELECT 1 FROM public.likes WHERE user_id = user_uuid AND target_type = p_target_type AND target_id = p_target_id) INTO v_exists;

    IF v_exists THEN
        DELETE FROM public.likes WHERE user_id = user_uuid AND target_type = p_target_type AND target_id = p_target_id;
        RETURN jsonb_build_object('success', true, 'action', 'unliked');
    ELSE
        INSERT INTO public.likes (user_id, target_type, target_id) VALUES (user_uuid, p_target_type, p_target_id);
        RETURN jsonb_build_object('success', true, 'action', 'liked');
    END IF;
END;
$$;

-- 发表评论
CREATE OR REPLACE FUNCTION public.create_comment(p_post_id BIGINT, p_content TEXT, p_parent_id BIGINT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    user_uuid UUID;
    v_comment_id BIGINT;
BEGIN
    user_uuid := auth.uid();
    IF user_uuid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '请先登录');
    END IF;

    IF LENGTH(p_content) < 1 OR LENGTH(p_content) > 500 THEN
        RETURN jsonb_build_object('success', false, 'message', '评论长度需在1-500字符之间');
    END IF;

    INSERT INTO public.comments (post_id, user_id, parent_id, content)
    VALUES (p_post_id, user_uuid, p_parent_id, p_content)
    RETURNING id INTO v_comment_id;

    RETURN jsonb_build_object('success', true, 'comment_id', v_comment_id);
END;
$$;
DROP FUNCTION IF EXISTS public.get_comments(BIGINT);
CREATE OR REPLACE FUNCTION public.get_comments(p_post_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_login_uid UUID := auth.uid();
    result JSONB;
BEGIN
    WITH RECURSIVE comment_tree AS (
        -- 根评论
        SELECT 
            c.id AS cid,
            c.post_id AS cpost_id,
            c.user_id AS cuser_id,
            c.parent_id AS cparent_id,
            c.content AS ccontent,
            c.created_at AS ccreated_at,
            pr.nickname AS user_nickname,
            NULL::TEXT AS user_avatar,
            COALESCE(pr.is_admin, false) AS user_is_admin,
            COALESCE(pr.is_bot, false) AS user_is_bot,
            (SELECT COUNT(*) FROM public.likes l WHERE l.target_type = 'comment' AND l.target_id = c.id) AS likes_count,
            EXISTS(SELECT 1 FROM public.likes l WHERE l.user_id = v_login_uid AND l.target_type = 'comment' AND l.target_id = c.id) AS is_liked,
            0 AS depth,
            ARRAY[c.id] AS path
        FROM public.comments c
        LEFT JOIN public.profiles pr ON c.user_id = pr.id
        WHERE c.post_id = p_post_id AND c.parent_id IS NULL

        UNION ALL

        -- 子评论
        SELECT 
            c.id AS cid,
            c.post_id AS cpost_id,
            c.user_id AS cuser_id,
            c.parent_id AS cparent_id,
            c.content AS ccontent,
            c.created_at AS ccreated_at,
            pr.nickname AS user_nickname,
            NULL::TEXT AS user_avatar,
            COALESCE(pr.is_admin, false) AS user_is_admin,
            COALESCE(pr.is_bot, false) AS user_is_bot,
            (SELECT COUNT(*) FROM public.likes l WHERE l.target_type = 'comment' AND l.target_id = c.id) AS likes_count,
            EXISTS(SELECT 1 FROM public.likes l WHERE l.user_id = v_login_uid AND l.target_type = 'comment' AND l.target_id = c.id) AS is_liked,
            ct.depth + 1,
            ct.path || c.id
        FROM public.comments c
        LEFT JOIN public.profiles pr ON c.user_id = pr.id
        JOIN comment_tree ct ON c.parent_id = ct.cid
        WHERE c.post_id = p_post_id AND ct.depth < 3
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', ct.cid,
            'user_id', ct.cuser_id,
            'user_nickname', ct.user_nickname,
            'user_avatar', ct.user_avatar,
            'user_is_admin', ct.user_is_admin,
            'user_is_bot', ct.user_is_bot,
            'parent_id', ct.cparent_id,
            'content', ct.ccontent,
            'created_at', ct.ccreated_at,
            'likes_count', ct.likes_count,
            'is_liked', ct.is_liked,
            'depth', ct.depth
        ) ORDER BY ct.path
    ) INTO result
    FROM comment_tree ct;

    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- 删除帖子（仅作者可删）
CREATE OR REPLACE FUNCTION public.delete_post(p_post_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    user_uuid UUID;
BEGIN
    user_uuid := auth.uid();
    IF user_uuid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '请先登录');
    END IF;

    DELETE FROM public.posts WHERE id = p_post_id AND user_id = user_uuid;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', '无权删除或帖子不存在');
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 删除评论（仅作者可删）
CREATE OR REPLACE FUNCTION public.delete_comment(p_comment_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    user_uuid UUID;
BEGIN
    user_uuid := auth.uid();
    IF user_uuid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '请先登录');
    END IF;

    DELETE FROM public.comments WHERE id = p_comment_id AND user_id = user_uuid;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', '无权删除或评论不存在');
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- comments 权限
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comments select all" ON public.comments;
CREATE POLICY "comments select all" ON public.comments FOR SELECT USING (true);
DROP POLICY IF EXISTS "users insert own comments" ON public.comments;
CREATE POLICY "users insert own comments" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "users delete own comments" ON public.comments;
CREATE POLICY "users delete own comments" ON public.comments FOR DELETE USING (auth.uid() = user_id);

-- likes 权限
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "likes select all" ON public.likes;
CREATE POLICY "likes select all" ON public.likes FOR SELECT USING (true);
DROP POLICY IF EXISTS "users insert own likes" ON public.likes;
CREATE POLICY "users insert own likes" ON public.likes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "users delete own likes" ON public.likes;
CREATE POLICY "users delete own likes" ON public.likes FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 管理员：获取用户详细信息
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_get_user_detail(UUID);
CREATE OR REPLACE FUNCTION public.admin_get_user_detail(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    v_result JSONB;
    v_inventory_count BIGINT;
    v_order_count BIGINT;
    v_mail_count BIGINT;
BEGIN
    IF user_uuid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '未登录');
    END IF;

    IF NOT public.check_admin() THEN
        RETURN jsonb_build_object('success', false, 'message', '无权限');
    END IF;

    SELECT COUNT(*) INTO v_inventory_count FROM public.inventory WHERE user_id = p_user_id;
    SELECT COUNT(*) INTO v_order_count FROM public.market_orders WHERE seller_id = p_user_id;
    SELECT COUNT(*) INTO v_mail_count FROM public.system_mails WHERE user_id = p_user_id;

    SELECT jsonb_build_object(
        'user_id', p.id,
        'nickname', p.nickname,
        'email', COALESCE(au.email, ''),
        'shells', p.shells,
        'is_admin', p.is_admin,
        'is_bot', p.is_bot,
        'created_at', p.created_at,
        'last_open_at', p.last_open_at,
        'last_claim_at', p.last_claim_at,
        'inventory_count', v_inventory_count,
        'order_count', v_order_count,
        'mail_count', v_mail_count
    ) INTO v_result
    FROM public.profiles p
    LEFT JOIN auth.users au ON p.id = au.id
    WHERE p.id = p_user_id;

    RETURN COALESCE(v_result, jsonb_build_object('success', false, 'message', '用户不存在'));
END;
$$;

-- ============================================================
-- 管理员：获取指定用户的背包物品
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_get_user_inventory(UUID);
CREATE OR REPLACE FUNCTION public.admin_get_user_inventory(p_user_id UUID, p_page INT DEFAULT 1, p_limit INT DEFAULT 20)
RETURNS TABLE(inv_id BIGINT, item_id BIGINT, quantity INT, acquired_at TIMESTAMP, item_name TEXT, item_quality TEXT, item_image TEXT, item_description TEXT, item_type TEXT, total_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    v_offset INT;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    IF NOT public.check_admin() THEN
        RAISE EXCEPTION '无权限';
    END IF;

    v_offset := (GREATEST(p_page, 1) - 1) * GREATEST(p_limit, 1);

    RETURN QUERY
    SELECT
        inv.id AS inv_id,
        inv.item_id,
        inv.quantity,
        inv.acquired_at AT TIME ZONE 'Asia/Shanghai' AS acquired_at,
        i.name AS item_name,
        i.quality AS item_quality,
        i.image_name AS item_image,
        i.description AS item_description,
        i.item_type AS item_type,
        (SELECT COUNT(*) FROM public.inventory WHERE user_id = p_user_id)::BIGINT AS total_count
    FROM public.inventory inv
    JOIN public.items i ON inv.item_id = i.id
    WHERE inv.user_id = p_user_id
    ORDER BY inv.acquired_at DESC
    LIMIT p_limit
    OFFSET v_offset;
END;
$$;

-- ============================================================
-- 关注表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.follows (
    id BIGSERIAL PRIMARY KEY,
    follower_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    following_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(follower_id, following_id),
    CHECK (follower_id != following_id)
);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- 用户可以查看自己的关注关系
DROP POLICY IF EXISTS "Users view own follows" ON public.follows;
CREATE POLICY "Users view own follows" ON public.follows
    FOR SELECT USING (auth.uid() = follower_id OR auth.uid() = following_id);

-- 注意：follows的INSERT/DELETE只能通过SECURITY DEFINER函数进行

-- ============================================================
-- 用户设置表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_settings (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
    show_collections_publicly BOOLEAN DEFAULT true NOT NULL,
    allow_follow BOOLEAN DEFAULT true NOT NULL,
    allow_stranger_dm BOOLEAN DEFAULT true NOT NULL,
    allow_search BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- RLS 策略：用户只能查看/修改自己的设置（管理员例外）
DROP POLICY IF EXISTS "Users can view own settings" ON public.user_settings;
CREATE POLICY "Users can view own settings" ON public.user_settings
    FOR SELECT USING (auth.uid() = user_id OR public.check_admin());

DROP POLICY IF EXISTS "Users can update own settings" ON public.user_settings;
CREATE POLICY "Users can update own settings" ON public.user_settings
    FOR UPDATE USING (auth.uid() = user_id OR public.check_admin());

DROP POLICY IF EXISTS "Users can insert own settings" ON public.user_settings;
CREATE POLICY "Users can insert own settings" ON public.user_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id OR public.check_admin());

-- 保护user_settings表，用户只能修改隐私设置字段
DROP FUNCTION IF EXISTS public.protect_settings_fields() CASCADE;
CREATE OR REPLACE FUNCTION public.protect_settings_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 如果是SECURITY DEFINER函数调用（current_user为postgres），允许修改所有字段
    IF current_user = 'postgres' THEN
        RETURN NEW;
    END IF;
    
    -- 如果是管理员操作，允许修改所有字段
    IF public.check_admin() THEN
        RETURN NEW;
    END IF;
    
    -- 普通用户只能修改隐私设置字段，其他字段保持原值
    NEW.user_id := OLD.user_id;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now(); -- 自动更新updated_at
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_settings ON public.user_settings;
CREATE TRIGGER protect_settings
    BEFORE UPDATE ON public.user_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_settings_fields();

-- 添加隐私设置字段（兼容旧版本）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_settings' AND column_name = 'allow_follow') THEN
        ALTER TABLE public.user_settings ADD COLUMN allow_follow BOOLEAN DEFAULT true NOT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_settings' AND column_name = 'allow_stranger_dm') THEN
        ALTER TABLE public.user_settings ADD COLUMN allow_stranger_dm BOOLEAN DEFAULT true NOT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_settings' AND column_name = 'allow_search') THEN
        ALTER TABLE public.user_settings ADD COLUMN allow_search BOOLEAN DEFAULT true NOT NULL;
    END IF;
END $$;

-- ============================================================
-- 私信表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.private_messages (
    id BIGSERIAL PRIMARY KEY,
    sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('Asia/Shanghai', NOW())
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_pm_sender ON public.private_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_pm_receiver ON public.private_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_pm_created ON public.private_messages(created_at DESC);

ALTER TABLE public.private_messages ENABLE ROW LEVEL SECURITY;

-- RLS：用户只能查看自己发送或接收的消息（管理员例外）
DROP POLICY IF EXISTS "Users view own messages" ON public.private_messages;
CREATE POLICY "Users view own messages" ON public.private_messages
    FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id OR public.check_admin());

-- RLS：用户只能发送消息（管理员例外）
DROP POLICY IF EXISTS "Users insert own messages" ON public.private_messages;
CREATE POLICY "Users insert own messages" ON public.private_messages
    FOR INSERT WITH CHECK (auth.uid() = sender_id OR public.check_admin());

-- RLS：用户只能更新接收的消息（标记已读）（管理员例外）
DROP POLICY IF EXISTS "Users update received messages" ON public.private_messages;
CREATE POLICY "Users update received messages" ON public.private_messages
    FOR UPDATE USING (auth.uid() = receiver_id OR public.check_admin());

-- 保护private_messages表，用户只能修改is_read字段
DROP FUNCTION IF EXISTS public.protect_pm_fields() CASCADE;
CREATE OR REPLACE FUNCTION public.protect_pm_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 如果是SECURITY DEFINER函数调用（current_user为postgres），允许修改所有字段
    IF current_user = 'postgres' THEN
        RETURN NEW;
    END IF;
    
    -- 如果是管理员操作，允许修改所有字段
    IF public.check_admin() THEN
        RETURN NEW;
    END IF;
    
    -- 普通用户只能修改is_read字段，其他字段保持原值
    NEW.sender_id := OLD.sender_id;
    NEW.receiver_id := OLD.receiver_id;
    NEW.content := OLD.content;
    NEW.created_at := OLD.created_at;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_pm ON public.private_messages;
CREATE TRIGGER protect_pm
    BEFORE UPDATE ON public.private_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_pm_fields();

-- ============================================================
-- 用户主页 RPC 函数
-- ============================================================

-- 添加 image_name 列到 item_submissions 表（如果不存在）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_submissions' AND column_name = 'image_name') THEN
        ALTER TABLE public.item_submissions ADD COLUMN image_name TEXT DEFAULT '';
    END IF;
END;
$$;

-- 获取用户公开信息（使用 user_settings 表）
DROP FUNCTION IF EXISTS public.get_user_profile(UUID);
CREATE OR REPLACE FUNCTION public.get_user_profile(p_user_id UUID)
RETURNS TABLE(
    id UUID,
    nickname TEXT,
    shells BIGINT,
    created_at TIMESTAMPTZ,
    post_count BIGINT,
    item_count BIGINT,
    followers_count BIGINT,
    following_count BIGINT,
    show_collections BOOLEAN,
    is_admin BOOLEAN,
    is_bot BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.nickname,
        p.shells,
        p.created_at,
        (SELECT COUNT(*) FROM public.posts WHERE user_id = p_user_id)::BIGINT AS post_count,
        (SELECT COUNT(DISTINCT inv.item_id) FROM public.inventory inv JOIN public.items i ON inv.item_id = i.id WHERE inv.user_id = p_user_id AND i.item_type = 'collection')::BIGINT AS item_count,
        (SELECT COUNT(*) FROM public.follows WHERE following_id = p_user_id)::BIGINT AS followers_count,
        (SELECT COUNT(*) FROM public.follows WHERE follower_id = p_user_id)::BIGINT AS following_count,
        COALESCE(s.show_collections_publicly, true)::BOOLEAN AS show_collections,
        COALESCE(p.is_admin, false) AS is_admin,
        COALESCE(p.is_bot, false) AS is_bot
    FROM public.profiles p
    LEFT JOIN public.user_settings s ON p.id = s.user_id
    WHERE p.id = p_user_id;
END;
$$;

-- 获取用户动态（带分页）
DROP FUNCTION IF EXISTS public.get_user_posts(UUID, INT, INT);
CREATE OR REPLACE FUNCTION public.get_user_posts(p_user_id UUID, p_limit INT DEFAULT 20, p_offset INT DEFAULT 0)
RETURNS TABLE(
    post_id BIGINT,
    content TEXT,
    tags TEXT[],
    likes_count BIGINT,
    comments_count BIGINT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        po.id AS post_id,
        po.content,
        po.tags,
        (SELECT COUNT(*) FROM public.likes l WHERE l.target_type = 'post' AND l.target_id = po.id)::BIGINT AS likes_count,
        (SELECT COUNT(*) FROM public.comments c WHERE c.post_id = po.id)::BIGINT AS comments_count,
        po.created_at
    FROM public.posts po
    WHERE po.user_id = p_user_id
    ORDER BY po.created_at DESC
    LIMIT GREATEST(p_limit, 1)
    OFFSET GREATEST(p_offset, 0);
END;
$$;

-- 获取单个帖子详情
DROP FUNCTION IF EXISTS public.get_post(BIGINT);
CREATE OR REPLACE FUNCTION public.get_post(p_post_id BIGINT)
RETURNS TABLE(
    id BIGINT,
    user_id UUID,
    user_nickname TEXT,
    user_avatar TEXT,
    user_is_admin BOOLEAN,
    user_is_bot BOOLEAN,
    content TEXT,
    tags TEXT[],
    likes_count BIGINT,
    comments_count BIGINT,
    created_at TIMESTAMPTZ,
    is_liked BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
BEGIN
    RETURN QUERY
    SELECT 
        po.id,
        po.user_id,
        p.nickname AS user_nickname,
        NULL::TEXT AS user_avatar,
        COALESCE(p.is_admin, false) AS user_is_admin,
        COALESCE(p.is_bot, false) AS user_is_bot,
        po.content,
        po.tags,
        (SELECT COUNT(*) FROM public.likes l WHERE l.target_type = 'post' AND l.target_id = po.id)::BIGINT AS likes_count,
        (SELECT COUNT(*) FROM public.comments c WHERE c.post_id = po.id)::BIGINT AS comments_count,
        po.created_at,
        EXISTS(
            SELECT 1 FROM public.likes l 
            WHERE l.target_type = 'post' AND l.target_id = po.id AND l.user_id = user_uuid
        ) AS is_liked
    FROM public.posts po
    LEFT JOIN public.profiles p ON po.user_id = p.id
    WHERE po.id = p_post_id;
END;
$$;

-- 获取用户公开收藏品（仅收藏品，且用户需开启公开设置，带分页）
DROP FUNCTION IF EXISTS public.get_user_inventory_public(UUID, INT, INT);
CREATE OR REPLACE FUNCTION public.get_user_inventory_public(p_user_id UUID, p_page INT DEFAULT 1, p_limit INT DEFAULT 50)
RETURNS TABLE(
    item_id BIGINT,
    item_name TEXT,
    item_quality TEXT,
    item_image TEXT,
    quantity INT,
    total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_offset INT;
    v_show_collections BOOLEAN;
BEGIN
    -- 从 user_settings 表检查用户是否允许公开收藏
    SELECT COALESCE(s.show_collections_publicly, true) INTO v_show_collections
    FROM public.user_settings s
    WHERE s.user_id = p_user_id;
    
    -- 如果没有设置记录，默认允许公开
    IF NOT FOUND THEN
        v_show_collections := true;
    END IF;
    
    IF NOT v_show_collections THEN
        RETURN QUERY SELECT NULL::BIGINT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::INT, 0::BIGINT LIMIT 0;
        RETURN;
    END IF;
    
    v_offset := (GREATEST(p_page, 1) - 1) * GREATEST(p_limit, 1);
    
    RETURN QUERY
    SELECT 
        i.id AS item_id,
        i.name AS item_name,
        i.quality AS item_quality,
        i.image_name AS item_image,
        inv.quantity,
        (SELECT COUNT(DISTINCT inv2.item_id) FROM public.inventory inv2 JOIN public.items i2 ON inv2.item_id = i2.id WHERE inv2.user_id = p_user_id AND i2.item_type = 'collection')::BIGINT AS total_count
    FROM public.inventory inv
    JOIN public.items i ON inv.item_id = i.id
    WHERE inv.user_id = p_user_id AND i.item_type = 'collection'
    ORDER BY 
        CASE i.quality 
            WHEN 'red' THEN 1 
            WHEN 'purple' THEN 2 
            WHEN 'blue' THEN 3 
            WHEN 'green' THEN 4 
            ELSE 5 
        END, i.name
    LIMIT GREATEST(p_limit, 1)
    OFFSET v_offset;
END;
$$;

-- 关注/取消关注
DROP FUNCTION IF EXISTS public.toggle_follow(UUID);
CREATE OR REPLACE FUNCTION public.toggle_follow(p_target_user_id UUID)
RETURNS TABLE(success BOOLEAN, is_following BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    already_following BOOLEAN;
    v_allow_follow BOOLEAN;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;
    
    IF user_uuid = p_target_user_id THEN
        RAISE EXCEPTION '不能关注自己';
    END IF;
    
    SELECT EXISTS(
        SELECT 1 FROM public.follows 
        WHERE follower_id = user_uuid AND following_id = p_target_user_id
    ) INTO already_following;
    
    IF already_following THEN
        -- 取消关注，不需要检查设置
        DELETE FROM public.follows 
        WHERE follower_id = user_uuid AND following_id = p_target_user_id;
        RETURN QUERY SELECT TRUE, FALSE;
    ELSE
        -- 关注前检查目标用户是否允许被关注
        SELECT COALESCE(s.allow_follow, true) INTO v_allow_follow
        FROM public.user_settings s
        WHERE s.user_id = p_target_user_id;
        
        IF NOT FOUND THEN
            v_allow_follow := true;
        END IF;
        
        IF NOT v_allow_follow THEN
            RAISE EXCEPTION '该用户禁止被关注';
        END IF;
        
        INSERT INTO public.follows (follower_id, following_id)
        VALUES (user_uuid, p_target_user_id);
        RETURN QUERY SELECT TRUE, TRUE;
    END IF;
END;
$$;

-- 检查是否已关注
DROP FUNCTION IF EXISTS public.check_following(UUID);
CREATE OR REPLACE FUNCTION public.check_following(p_target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
BEGIN
    IF user_uuid IS NULL THEN
        RETURN FALSE;
    END IF;
    
    RETURN EXISTS(
        SELECT 1 FROM public.follows 
        WHERE follower_id = user_uuid AND following_id = p_target_user_id
    );
END;
$$;

-- 获取粉丝列表（带分页）
DROP FUNCTION IF EXISTS public.get_followers(UUID, INT, INT);
CREATE OR REPLACE FUNCTION public.get_followers(p_user_id UUID, p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)
RETURNS TABLE(
    user_id UUID,
    nickname TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        f.follower_id AS user_id,
        p.nickname,
        f.created_at
    FROM public.follows f
    JOIN public.profiles p ON f.follower_id = p.id
    WHERE f.following_id = p_user_id
    ORDER BY f.created_at DESC
    LIMIT GREATEST(p_limit, 1)
    OFFSET GREATEST(p_offset, 0);
END;
$$;

-- 获取关注列表（带分页）
DROP FUNCTION IF EXISTS public.get_following(UUID, INT, INT);
CREATE OR REPLACE FUNCTION public.get_following(p_user_id UUID, p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)
RETURNS TABLE(
    user_id UUID,
    nickname TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        f.following_id AS user_id,
        p.nickname,
        f.created_at
    FROM public.follows f
    JOIN public.profiles p ON f.following_id = p.id
    WHERE f.follower_id = p_user_id
    ORDER BY f.created_at DESC
    LIMIT GREATEST(p_limit, 1)
    OFFSET GREATEST(p_offset, 0);
END;
$$;

-- 更新用户设置（使用 user_settings 表）
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
    
    -- 只允许设置白名单中的字段
    IF p_key IN ('show_collections_publicly', 'allow_follow', 'allow_stranger_dm', 'allow_search') THEN
        -- 使用 upsert 模式，如果记录不存在则插入，存在则更新
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

-- ============================================================
-- 私信 RPC 函数
-- ============================================================

-- 获取私信会话列表（关注的人或有聊天记录的人）
DROP FUNCTION IF EXISTS public.get_dm_conversations(INT, INT);
CREATE OR REPLACE FUNCTION public.get_dm_conversations(p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)
RETURNS TABLE(
    user_id UUID,
    nickname TEXT,
    last_message TEXT,
    last_message_time TIMESTAMPTZ,
    unread_count BIGINT,
    is_following BOOLEAN
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
    
    -- 返回关注的人或有聊天记录的人
    RETURN QUERY
    WITH chat_users AS (
        -- 有聊天记录的人
        SELECT DISTINCT 
            CASE WHEN pm.sender_id = user_uuid THEN pm.receiver_id ELSE pm.sender_id END AS other_user_id,
            MAX(pm.created_at) AS last_msg_time
        FROM public.private_messages pm
        WHERE pm.sender_id = user_uuid OR pm.receiver_id = user_uuid
        GROUP BY CASE WHEN pm.sender_id = user_uuid THEN pm.receiver_id ELSE pm.sender_id END
    ),
    following_users AS (
        -- 关注的人
        SELECT f.following_id AS other_user_id, f.created_at AS follow_time
        FROM public.follows f
        WHERE f.follower_id = user_uuid
    ),
    all_users AS (
        -- 合并：有聊天记录的人 + 关注的人
        SELECT other_user_id FROM chat_users
        UNION
        SELECT other_user_id FROM following_users
    )
    SELECT 
        au.other_user_id AS user_id,
        p.nickname,
        pm.content AS last_message,
        pm.created_at AS last_message_time,
        (SELECT COUNT(*) FROM public.private_messages pm2 
         WHERE pm2.receiver_id = user_uuid AND pm2.sender_id = au.other_user_id AND pm2.is_read = false) AS unread_count,
        EXISTS(SELECT 1 FROM public.follows f WHERE f.follower_id = user_uuid AND f.following_id = au.other_user_id) AS is_following
    FROM all_users au
    LEFT JOIN public.profiles p ON au.other_user_id = p.id
    LEFT JOIN public.private_messages pm ON 
        (pm.sender_id = user_uuid AND pm.receiver_id = au.other_user_id) OR 
        (pm.sender_id = au.other_user_id AND pm.receiver_id = user_uuid)
    WHERE pm.id IS NULL OR pm.created_at = (
        SELECT MAX(pm2.created_at) FROM public.private_messages pm2 
        WHERE (pm2.sender_id = user_uuid AND pm2.receiver_id = au.other_user_id) OR 
              (pm2.sender_id = au.other_user_id AND pm2.receiver_id = user_uuid)
    )
    ORDER BY COALESCE(pm.created_at, p.created_at) DESC
    LIMIT GREATEST(p_limit, 1)
    OFFSET GREATEST(p_offset, 0);
END;
$$;

-- 发送私信
DROP FUNCTION IF EXISTS public.send_private_message(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.send_private_message(p_receiver_id UUID, p_content TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    v_allow_dm BOOLEAN;
    v_is_following BOOLEAN;
    v_message_id BIGINT;
BEGIN
    IF user_uuid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '请先登录');
    END IF;
    
    IF user_uuid = p_receiver_id THEN
        RETURN jsonb_build_object('success', false, 'message', '不能给自己发私信');
    END IF;
    
    IF LENGTH(p_content) < 1 OR LENGTH(p_content) > 1000 THEN
        RETURN jsonb_build_object('success', false, 'message', '消息长度需在1-1000字符之间');
    END IF;
    
    -- 检查接收者是否允许私信
    SELECT COALESCE(s.allow_stranger_dm, true) INTO v_allow_dm
    FROM public.user_settings s
    WHERE s.user_id = p_receiver_id;
    
    IF NOT FOUND THEN
        v_allow_dm := true;
    END IF;
    
    -- 检查是否关注了接收者
    SELECT EXISTS(
        SELECT 1 FROM public.follows 
        WHERE follower_id = user_uuid AND following_id = p_receiver_id
    ) INTO v_is_following;
    
    -- 如果接收者禁止陌生人私信，且发送者不是关注的人，则拒绝
    IF NOT v_allow_dm AND NOT v_is_following THEN
        RETURN jsonb_build_object('success', false, 'message', '对方设置了拒收陌生人私信');
    END IF;
    
    -- 发送消息
    INSERT INTO public.private_messages (sender_id, receiver_id, content)
    VALUES (user_uuid, p_receiver_id, p_content)
    RETURNING id INTO v_message_id;
    
    RETURN jsonb_build_object('success', true, 'message_id', v_message_id);
END;
$$;

-- 获取与某人的聊天记录
DROP FUNCTION IF EXISTS public.get_dm_history(UUID, INT, INT);
CREATE OR REPLACE FUNCTION public.get_dm_history(p_other_user_id UUID, p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)
RETURNS TABLE(
    message_id BIGINT,
    sender_id UUID,
    sender_nickname TEXT,
    content TEXT,
    is_read BOOLEAN,
    created_at TIMESTAMPTZ
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
        pm.id AS message_id,
        pm.sender_id,
        p.nickname AS sender_nickname,
        pm.content,
        pm.is_read,
        pm.created_at
    FROM public.private_messages pm
    LEFT JOIN public.profiles p ON pm.sender_id = p.id
    WHERE (pm.sender_id = user_uuid AND pm.receiver_id = p_other_user_id) OR 
          (pm.sender_id = p_other_user_id AND pm.receiver_id = user_uuid)
    ORDER BY pm.created_at DESC
    LIMIT GREATEST(p_limit, 1)
    OFFSET GREATEST(p_offset, 0);
END;
$$;

-- 标记私信已读
DROP FUNCTION IF EXISTS public.mark_dm_read(UUID);
CREATE OR REPLACE FUNCTION public.mark_dm_read(p_other_user_id UUID)
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
    
    UPDATE public.private_messages
    SET is_read = true
    WHERE receiver_id = user_uuid AND sender_id = p_other_user_id AND is_read = false;
END;
$$;

-- 获取未读私信数量
DROP FUNCTION IF EXISTS public.get_unread_dm_count();
CREATE OR REPLACE FUNCTION public.get_unread_dm_count()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    v_count BIGINT;
BEGIN
    IF user_uuid IS NULL THEN
        RETURN 0;
    END IF;
    
    SELECT COUNT(*) INTO v_count
    FROM public.private_messages
    WHERE receiver_id = user_uuid AND is_read = false;
    
    RETURN v_count;
END;
$$;

-- 获取用户完整设置
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
    
    -- 如果没有设置记录，返回默认值
    IF NOT FOUND THEN
        RETURN QUERY SELECT true, true, true, true;
    END IF;
END;
$$;

-- 检查用户是否允许被关注
DROP FUNCTION IF EXISTS public.check_allow_follow(UUID);
CREATE OR REPLACE FUNCTION public.check_allow_follow(p_target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_allow_follow BOOLEAN;
BEGIN
    SELECT COALESCE(s.allow_follow, true) INTO v_allow_follow
    FROM public.user_settings s
    WHERE s.user_id = p_target_user_id;
    
    IF NOT FOUND THEN
        RETURN true;
    END IF;
    
    RETURN v_allow_follow;
END;
$$;