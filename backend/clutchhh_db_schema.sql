--
-- PostgreSQL database dump
--

\restrict 8c7D6oYKTIfHjM2JFwflkjTY5nlKqPgwJdxxI3kJQthvWFDA3Dlr6v8gZ3au26k

-- Dumped from database version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcements (
    id integer NOT NULL,
    cafe_id integer,
    content character varying,
    type character varying,
    created_at timestamp without time zone,
    start_time timestamp without time zone,
    end_time timestamp without time zone,
    active boolean,
    target_role character varying
);


--
-- Name: announcements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.announcements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: announcements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.announcements_id_seq OWNED BY public.announcements.id;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id integer NOT NULL,
    user_id integer,
    action character varying,
    detail character varying,
    "timestamp" timestamp without time zone,
    ip character varying,
    cafe_id integer,
    device_id character varying
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: backup_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backup_entries (
    id integer NOT NULL,
    backup_type character varying,
    file_path character varying,
    created_at timestamp without time zone,
    note character varying
);


--
-- Name: backup_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.backup_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: backup_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.backup_entries_id_seq OWNED BY public.backup_entries.id;


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id integer NOT NULL,
    cafe_id integer,
    user_id integer,
    pc_id integer,
    start_time timestamp without time zone,
    end_time timestamp without time zone,
    status character varying,
    created_at timestamp without time zone
);


--
-- Name: bookings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bookings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bookings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bookings_id_seq OWNED BY public.bookings.id;


--
-- Name: cafes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cafes (
    id integer NOT NULL,
    name character varying,
    location character varying,
    phone character varying,
    owner_id integer
);


--
-- Name: cafes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cafes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cafes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cafes_id_seq OWNED BY public.cafes.id;


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id integer NOT NULL,
    from_user_id integer,
    to_user_id integer,
    pc_id integer,
    cafe_id integer,
    message character varying,
    "timestamp" timestamp without time zone,
    read boolean
);


--
-- Name: chat_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chat_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_messages_id_seq OWNED BY public.chat_messages.id;


--
-- Name: client_pcs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_pcs (
    id integer NOT NULL,
    license_key character varying,
    name character varying,
    status character varying,
    last_seen timestamp without time zone,
    ip_address character varying,
    cafe_id integer,
    current_user_id integer,
    device_id character varying,
    device_secret character varying,
    device_secret_hash character varying,
    hardware_fingerprint character varying,
    capabilities json,
    bound boolean,
    bound_at timestamp without time zone,
    grace_until timestamp without time zone,
    suspended boolean,
    device_status character varying,
    allowed_ip_range character varying
);


--
-- Name: client_pcs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.client_pcs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: client_pcs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.client_pcs_id_seq OWNED BY public.client_pcs.id;


--
-- Name: client_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_updates (
    id integer NOT NULL,
    version character varying,
    description character varying,
    file_url character varying,
    release_date timestamp without time zone,
    force_update boolean,
    active boolean
);


--
-- Name: client_updates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.client_updates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: client_updates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.client_updates_id_seq OWNED BY public.client_updates.id;


--
-- Name: coin_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coin_transactions (
    id integer NOT NULL,
    user_id integer,
    amount integer,
    "timestamp" timestamp without time zone,
    reason character varying
);


--
-- Name: coin_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.coin_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: coin_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.coin_transactions_id_seq OWNED BY public.coin_transactions.id;


--
-- Name: coupon_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupon_redemptions (
    id integer NOT NULL,
    coupon_id integer,
    user_id integer,
    "timestamp" timestamp without time zone
);


--
-- Name: coupon_redemptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.coupon_redemptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: coupon_redemptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.coupon_redemptions_id_seq OWNED BY public.coupon_redemptions.id;


--
-- Name: coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupons (
    id integer NOT NULL,
    cafe_id integer,
    code character varying,
    discount_percent double precision,
    max_uses integer,
    per_user_limit integer,
    expires_at timestamp without time zone,
    applies_to character varying,
    times_used integer
);


--
-- Name: coupons_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.coupons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: coupons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.coupons_id_seq OWNED BY public.coupons.id;


--
-- Name: device_ip_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_ip_history (
    id integer NOT NULL,
    client_pc_id integer NOT NULL,
    ip_address character varying NOT NULL,
    first_seen timestamp without time zone,
    last_seen timestamp without time zone,
    request_count integer
);


--
-- Name: device_ip_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.device_ip_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: device_ip_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.device_ip_history_id_seq OWNED BY public.device_ip_history.id;


--
-- Name: event_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_progress (
    id integer NOT NULL,
    event_id integer,
    user_id integer,
    progress integer,
    completed boolean
);


--
-- Name: event_progress_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.event_progress_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: event_progress_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.event_progress_id_seq OWNED BY public.event_progress.id;


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id integer NOT NULL,
    cafe_id integer,
    name character varying,
    type character varying,
    rule_json character varying,
    start_time timestamp without time zone,
    end_time timestamp without time zone,
    active boolean
);


--
-- Name: events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.events_id_seq OWNED BY public.events.id;


--
-- Name: games; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.games (
    id integer NOT NULL,
    cafe_id integer,
    name character varying,
    exe_path character varying,
    logo_url character varying,
    icon_url character varying,
    version character varying,
    last_updated timestamp without time zone,
    is_free boolean,
    min_age integer,
    enabled boolean,
    category character varying,
    description character varying,
    age_rating integer,
    tags character varying,
    website character varying,
    pc_groups character varying,
    user_groups character varying,
    launchers character varying,
    never_use_parent_license boolean,
    image_600x900 character varying,
    image_background character varying
);


--
-- Name: games_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.games_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: games_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.games_id_seq OWNED BY public.games.id;


--
-- Name: hardware_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hardware_stats (
    id integer NOT NULL,
    pc_id integer,
    cafe_id integer,
    "timestamp" timestamp without time zone,
    cpu_percent double precision,
    ram_percent double precision,
    disk_percent double precision,
    gpu_percent double precision,
    temp double precision
);


--
-- Name: hardware_stats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hardware_stats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hardware_stats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hardware_stats_id_seq OWNED BY public.hardware_stats.id;


--
-- Name: leaderboard_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leaderboard_entries (
    id integer NOT NULL,
    leaderboard_id integer,
    user_id integer,
    period_start timestamp without time zone,
    period_end timestamp without time zone,
    value integer
);


--
-- Name: leaderboard_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leaderboard_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leaderboard_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leaderboard_entries_id_seq OWNED BY public.leaderboard_entries.id;


--
-- Name: leaderboards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leaderboards (
    id integer NOT NULL,
    cafe_id integer,
    name character varying,
    scope character varying,
    metric character varying,
    active boolean
);


--
-- Name: leaderboards_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leaderboards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leaderboards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leaderboards_id_seq OWNED BY public.leaderboards.id;


--
-- Name: license_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.license_assignments (
    id integer NOT NULL,
    account_id integer,
    user_id integer,
    pc_id integer,
    game_id integer,
    started_at timestamp without time zone,
    ended_at timestamp without time zone
);


--
-- Name: license_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.license_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: license_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.license_assignments_id_seq OWNED BY public.license_assignments.id;


--
-- Name: license_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.license_keys (
    id integer NOT NULL,
    key character varying,
    assigned_to character varying,
    issued_at timestamp without time zone,
    expires_at timestamp without time zone,
    is_active boolean,
    activated_at timestamp without time zone,
    last_activated_ip character varying
);


--
-- Name: license_keys_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.license_keys_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: license_keys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.license_keys_id_seq OWNED BY public.license_keys.id;


--
-- Name: licenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.licenses (
    key character varying NOT NULL,
    cafe_id integer,
    expires_at timestamp without time zone,
    is_active boolean,
    activated_at timestamp without time zone,
    max_pcs integer
);


--
-- Name: membership_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.membership_packages (
    id integer NOT NULL,
    cafe_id integer,
    name character varying,
    description character varying,
    price double precision,
    minutes_included integer,
    valid_days integer,
    active boolean
);


--
-- Name: membership_packages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.membership_packages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: membership_packages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.membership_packages_id_seq OWNED BY public.membership_packages.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    user_id integer,
    pc_id integer,
    cafe_id integer,
    type character varying,
    content character varying,
    created_at timestamp without time zone,
    seen boolean
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offers (
    id integer NOT NULL,
    cafe_id integer,
    name character varying,
    description character varying,
    price double precision,
    hours_minutes integer,
    active boolean,
    thumbnail_url character varying,
    bonus_minutes integer DEFAULT 0 NOT NULL,
    discount_percent double precision DEFAULT 0 NOT NULL,
    tax_percent double precision DEFAULT 0 NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    is_happy_hour_only boolean DEFAULT false NOT NULL,
    happy_hour_start character varying(5),
    happy_hour_end character varying(5)
);


--
-- Name: offers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offers_id_seq OWNED BY public.offers.id;


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id integer NOT NULL,
    order_id integer,
    product_id integer,
    quantity integer,
    price double precision
);


--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    cafe_id integer,
    user_id integer,
    total double precision,
    created_at timestamp without time zone
);


--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id integer NOT NULL,
    user_id integer,
    token character varying,
    expires_at timestamp without time zone,
    used boolean,
    created_at timestamp without time zone
);


--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.password_reset_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.password_reset_tokens_id_seq OWNED BY public.password_reset_tokens.id;


--
-- Name: pc_games; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pc_games (
    id integer NOT NULL,
    pc_id integer,
    game_id integer
);


--
-- Name: pc_games_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pc_games_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pc_games_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pc_games_id_seq OWNED BY public.pc_games.id;


--
-- Name: pc_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pc_groups (
    id integer NOT NULL,
    name character varying,
    description character varying
);


--
-- Name: pc_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pc_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pc_groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pc_groups_id_seq OWNED BY public.pc_groups.id;


--
-- Name: pc_to_group; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pc_to_group (
    id integer NOT NULL,
    pc_id integer,
    group_id integer
);


--
-- Name: pc_to_group_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pc_to_group_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pc_to_group_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pc_to_group_id_seq OWNED BY public.pc_to_group.id;


--
-- Name: pcs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pcs (
    id integer NOT NULL,
    name character varying,
    status character varying,
    last_seen timestamp without time zone,
    current_user_id integer,
    banned boolean,
    ban_reason character varying,
    admin_rights boolean
);


--
-- Name: pcs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pcs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pcs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pcs_id_seq OWNED BY public.pcs.id;


--
-- Name: platform_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_accounts (
    id integer NOT NULL,
    game_id integer,
    platform character varying,
    username character varying,
    secret character varying,
    in_use boolean,
    assigned_pc_id integer,
    assigned_user_id integer,
    last_used timestamp without time zone
);


--
-- Name: platform_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.platform_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: platform_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.platform_accounts_id_seq OWNED BY public.platform_accounts.id;


--
-- Name: pricing_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_rules (
    id integer NOT NULL,
    cafe_id integer,
    name character varying,
    rate_per_hour double precision,
    group_id integer,
    start_time timestamp without time zone,
    end_time timestamp without time zone,
    is_active boolean,
    description character varying
);


--
-- Name: pricing_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pricing_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pricing_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pricing_rules_id_seq OWNED BY public.pricing_rules.id;


--
-- Name: prize_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prize_redemptions (
    id integer NOT NULL,
    user_id integer,
    prize_id integer,
    "timestamp" timestamp without time zone,
    status character varying
);


--
-- Name: prize_redemptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prize_redemptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prize_redemptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prize_redemptions_id_seq OWNED BY public.prize_redemptions.id;


--
-- Name: prizes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prizes (
    id integer NOT NULL,
    cafe_id integer,
    name character varying,
    description character varying,
    coin_cost integer,
    stock integer,
    active boolean
);


--
-- Name: prizes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prizes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prizes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prizes_id_seq OWNED BY public.prizes.id;


--
-- Name: product_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_categories (
    id integer NOT NULL,
    cafe_id integer,
    name character varying
);


--
-- Name: product_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_categories_id_seq OWNED BY public.product_categories.id;


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id integer NOT NULL,
    cafe_id integer,
    name character varying,
    price double precision,
    category_id integer,
    active boolean
);


--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token_hash character varying NOT NULL,
    device_id character varying,
    cafe_id integer,
    issued_at timestamp without time zone,
    expires_at timestamp without time zone NOT NULL,
    revoked boolean,
    revoked_at timestamp without time zone,
    ip_address character varying
);


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.refresh_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.refresh_tokens_id_seq OWNED BY public.refresh_tokens.id;


--
-- Name: remote_commands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.remote_commands (
    id integer NOT NULL,
    pc_id integer,
    command character varying,
    params character varying,
    state character varying,
    result json,
    idempotency_key character varying,
    issued_at timestamp without time zone,
    expires_at timestamp without time zone,
    executed boolean,
    acknowledged_at timestamp without time zone
);


--
-- Name: remote_commands_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.remote_commands_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: remote_commands_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.remote_commands_id_seq OWNED BY public.remote_commands.id;


--
-- Name: screenshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.screenshots (
    id integer NOT NULL,
    cafe_id integer,
    pc_id integer,
    image_url character varying,
    "timestamp" timestamp without time zone,
    taken_by integer
);


--
-- Name: screenshots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.screenshots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: screenshots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.screenshots_id_seq OWNED BY public.screenshots.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id integer NOT NULL,
    pc_id integer,
    client_pc_id integer,
    user_id integer,
    cafe_id integer,
    start_time timestamp without time zone,
    end_time timestamp without time zone,
    paid boolean,
    amount double precision
);


--
-- Name: sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sessions_id_seq OWNED BY public.sessions.id;


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    id integer NOT NULL,
    cafe_id integer,
    category character varying,
    key character varying,
    value character varying,
    value_type character varying,
    description character varying,
    updated_by integer,
    updated_at timestamp without time zone,
    is_public boolean
);


--
-- Name: settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.settings_id_seq OWNED BY public.settings.id;


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id integer NOT NULL,
    user_id integer,
    pc_id integer,
    cafe_id integer,
    issue character varying,
    status character varying,
    assigned_staff integer,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


--
-- Name: support_tickets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.support_tickets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: support_tickets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.support_tickets_id_seq OWNED BY public.support_tickets.id;


--
-- Name: system_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_events (
    id integer NOT NULL,
    type character varying,
    cafe_id integer,
    pc_id integer,
    payload json,
    "timestamp" timestamp without time zone
);


--
-- Name: system_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.system_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.system_events_id_seq OWNED BY public.system_events.id;


--
-- Name: user_cafe_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_cafe_map (
    id integer NOT NULL,
    user_id integer NOT NULL,
    cafe_id integer NOT NULL,
    role character varying NOT NULL,
    is_primary boolean,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


--
-- Name: user_cafe_map_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_cafe_map_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_cafe_map_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_cafe_map_id_seq OWNED BY public.user_cafe_map.id;


--
-- Name: user_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_groups (
    id integer NOT NULL,
    cafe_id integer,
    name character varying,
    discount_percent double precision,
    coin_multiplier double precision,
    postpay_allowed boolean
);


--
-- Name: user_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_groups_id_seq OWNED BY public.user_groups.id;


--
-- Name: user_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_memberships (
    id integer NOT NULL,
    user_id integer,
    package_id integer,
    start_date timestamp without time zone,
    end_date timestamp without time zone,
    minutes_remaining integer
);


--
-- Name: user_memberships_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_memberships_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_memberships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_memberships_id_seq OWNED BY public.user_memberships.id;


--
-- Name: user_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_offers (
    id integer NOT NULL,
    user_id integer,
    offer_id integer,
    purchased_at timestamp without time zone,
    minutes_remaining integer
);


--
-- Name: user_offers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_offers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_offers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_offers_id_seq OWNED BY public.user_offers.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    name character varying,
    email character varying,
    role character varying,
    password_hash character varying,
    cafe_id integer,
    wallet_balance double precision,
    coins_balance integer,
    birthdate timestamp without time zone,
    first_name character varying,
    last_name character varying,
    phone character varying,
    tos_accepted boolean,
    tos_accepted_at timestamp without time zone,
    user_group_id integer,
    two_factor_secret character varying,
    two_factor_recovery_codes json,
    is_email_verified boolean,
    email_verification_sent_at timestamp without time zone
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: wallet_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet_transactions (
    id integer NOT NULL,
    user_id integer,
    cafe_id integer,
    amount double precision,
    "timestamp" timestamp without time zone,
    type character varying,
    description character varying
);


--
-- Name: wallet_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wallet_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wallet_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wallet_transactions_id_seq OWNED BY public.wallet_transactions.id;


--
-- Name: webhooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhooks (
    id integer NOT NULL,
    cafe_id integer,
    url character varying,
    event character varying,
    is_active boolean,
    secret character varying,
    created_at timestamp without time zone
);


--
-- Name: webhooks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.webhooks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: webhooks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.webhooks_id_seq OWNED BY public.webhooks.id;


--
-- Name: announcements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements ALTER COLUMN id SET DEFAULT nextval('public.announcements_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: backup_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_entries ALTER COLUMN id SET DEFAULT nextval('public.backup_entries_id_seq'::regclass);


--
-- Name: bookings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings ALTER COLUMN id SET DEFAULT nextval('public.bookings_id_seq'::regclass);


--
-- Name: cafes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cafes ALTER COLUMN id SET DEFAULT nextval('public.cafes_id_seq'::regclass);


--
-- Name: chat_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages ALTER COLUMN id SET DEFAULT nextval('public.chat_messages_id_seq'::regclass);


--
-- Name: client_pcs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_pcs ALTER COLUMN id SET DEFAULT nextval('public.client_pcs_id_seq'::regclass);


--
-- Name: client_updates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_updates ALTER COLUMN id SET DEFAULT nextval('public.client_updates_id_seq'::regclass);


--
-- Name: coin_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coin_transactions ALTER COLUMN id SET DEFAULT nextval('public.coin_transactions_id_seq'::regclass);


--
-- Name: coupon_redemptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions ALTER COLUMN id SET DEFAULT nextval('public.coupon_redemptions_id_seq'::regclass);


--
-- Name: coupons id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons ALTER COLUMN id SET DEFAULT nextval('public.coupons_id_seq'::regclass);


--
-- Name: device_ip_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_ip_history ALTER COLUMN id SET DEFAULT nextval('public.device_ip_history_id_seq'::regclass);


--
-- Name: event_progress id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_progress ALTER COLUMN id SET DEFAULT nextval('public.event_progress_id_seq'::regclass);


--
-- Name: events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events ALTER COLUMN id SET DEFAULT nextval('public.events_id_seq'::regclass);


--
-- Name: games id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.games ALTER COLUMN id SET DEFAULT nextval('public.games_id_seq'::regclass);


--
-- Name: hardware_stats id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hardware_stats ALTER COLUMN id SET DEFAULT nextval('public.hardware_stats_id_seq'::regclass);


--
-- Name: leaderboard_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leaderboard_entries ALTER COLUMN id SET DEFAULT nextval('public.leaderboard_entries_id_seq'::regclass);


--
-- Name: leaderboards id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leaderboards ALTER COLUMN id SET DEFAULT nextval('public.leaderboards_id_seq'::regclass);


--
-- Name: license_assignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_assignments ALTER COLUMN id SET DEFAULT nextval('public.license_assignments_id_seq'::regclass);


--
-- Name: license_keys id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_keys ALTER COLUMN id SET DEFAULT nextval('public.license_keys_id_seq'::regclass);


--
-- Name: membership_packages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_packages ALTER COLUMN id SET DEFAULT nextval('public.membership_packages_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: offers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers ALTER COLUMN id SET DEFAULT nextval('public.offers_id_seq'::regclass);


--
-- Name: order_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: password_reset_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens ALTER COLUMN id SET DEFAULT nextval('public.password_reset_tokens_id_seq'::regclass);


--
-- Name: pc_games id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pc_games ALTER COLUMN id SET DEFAULT nextval('public.pc_games_id_seq'::regclass);


--
-- Name: pc_groups id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pc_groups ALTER COLUMN id SET DEFAULT nextval('public.pc_groups_id_seq'::regclass);


--
-- Name: pc_to_group id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pc_to_group ALTER COLUMN id SET DEFAULT nextval('public.pc_to_group_id_seq'::regclass);


--
-- Name: pcs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pcs ALTER COLUMN id SET DEFAULT nextval('public.pcs_id_seq'::regclass);


--
-- Name: platform_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_accounts ALTER COLUMN id SET DEFAULT nextval('public.platform_accounts_id_seq'::regclass);


--
-- Name: pricing_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rules ALTER COLUMN id SET DEFAULT nextval('public.pricing_rules_id_seq'::regclass);


--
-- Name: prize_redemptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prize_redemptions ALTER COLUMN id SET DEFAULT nextval('public.prize_redemptions_id_seq'::regclass);


--
-- Name: prizes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prizes ALTER COLUMN id SET DEFAULT nextval('public.prizes_id_seq'::regclass);


--
-- Name: product_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories ALTER COLUMN id SET DEFAULT nextval('public.product_categories_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('public.refresh_tokens_id_seq'::regclass);


--
-- Name: remote_commands id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remote_commands ALTER COLUMN id SET DEFAULT nextval('public.remote_commands_id_seq'::regclass);


--
-- Name: screenshots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screenshots ALTER COLUMN id SET DEFAULT nextval('public.screenshots_id_seq'::regclass);


--
-- Name: sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions ALTER COLUMN id SET DEFAULT nextval('public.sessions_id_seq'::regclass);


--
-- Name: settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings ALTER COLUMN id SET DEFAULT nextval('public.settings_id_seq'::regclass);


--
-- Name: support_tickets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets ALTER COLUMN id SET DEFAULT nextval('public.support_tickets_id_seq'::regclass);


--
-- Name: system_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_events ALTER COLUMN id SET DEFAULT nextval('public.system_events_id_seq'::regclass);


--
-- Name: user_cafe_map id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_cafe_map ALTER COLUMN id SET DEFAULT nextval('public.user_cafe_map_id_seq'::regclass);


--
-- Name: user_groups id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_groups ALTER COLUMN id SET DEFAULT nextval('public.user_groups_id_seq'::regclass);


--
-- Name: user_memberships id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_memberships ALTER COLUMN id SET DEFAULT nextval('public.user_memberships_id_seq'::regclass);


--
-- Name: user_offers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_offers ALTER COLUMN id SET DEFAULT nextval('public.user_offers_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: wallet_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transactions ALTER COLUMN id SET DEFAULT nextval('public.wallet_transactions_id_seq'::regclass);


--
-- Name: webhooks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhooks ALTER COLUMN id SET DEFAULT nextval('public.webhooks_id_seq'::regclass);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: backup_entries backup_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_entries
    ADD CONSTRAINT backup_entries_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: cafes cafes_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cafes
    ADD CONSTRAINT cafes_name_key UNIQUE (name);


--
-- Name: cafes cafes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cafes
    ADD CONSTRAINT cafes_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: client_pcs client_pcs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_pcs
    ADD CONSTRAINT client_pcs_pkey PRIMARY KEY (id);


--
-- Name: client_updates client_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_updates
    ADD CONSTRAINT client_updates_pkey PRIMARY KEY (id);


--
-- Name: client_updates client_updates_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_updates
    ADD CONSTRAINT client_updates_version_key UNIQUE (version);


--
-- Name: coin_transactions coin_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coin_transactions
    ADD CONSTRAINT coin_transactions_pkey PRIMARY KEY (id);


--
-- Name: coupon_redemptions coupon_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_pkey PRIMARY KEY (id);


--
-- Name: coupons coupons_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_code_key UNIQUE (code);


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);


--
-- Name: device_ip_history device_ip_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_ip_history
    ADD CONSTRAINT device_ip_history_pkey PRIMARY KEY (id);


--
-- Name: event_progress event_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_progress
    ADD CONSTRAINT event_progress_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: games games_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_name_key UNIQUE (name);


--
-- Name: games games_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_pkey PRIMARY KEY (id);


--
-- Name: hardware_stats hardware_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hardware_stats
    ADD CONSTRAINT hardware_stats_pkey PRIMARY KEY (id);


--
-- Name: leaderboard_entries leaderboard_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leaderboard_entries
    ADD CONSTRAINT leaderboard_entries_pkey PRIMARY KEY (id);


--
-- Name: leaderboards leaderboards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leaderboards
    ADD CONSTRAINT leaderboards_pkey PRIMARY KEY (id);


--
-- Name: license_assignments license_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_assignments
    ADD CONSTRAINT license_assignments_pkey PRIMARY KEY (id);


--
-- Name: license_keys license_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_keys
    ADD CONSTRAINT license_keys_pkey PRIMARY KEY (id);


--
-- Name: licenses licenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT licenses_pkey PRIMARY KEY (key);


--
-- Name: membership_packages membership_packages_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_packages
    ADD CONSTRAINT membership_packages_name_key UNIQUE (name);


--
-- Name: membership_packages membership_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_packages
    ADD CONSTRAINT membership_packages_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: offers offers_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_name_key UNIQUE (name);


--
-- Name: offers offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: pc_games pc_games_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pc_games
    ADD CONSTRAINT pc_games_pkey PRIMARY KEY (id);


--
-- Name: pc_groups pc_groups_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pc_groups
    ADD CONSTRAINT pc_groups_name_key UNIQUE (name);


--
-- Name: pc_groups pc_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pc_groups
    ADD CONSTRAINT pc_groups_pkey PRIMARY KEY (id);


--
-- Name: pc_to_group pc_to_group_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pc_to_group
    ADD CONSTRAINT pc_to_group_pkey PRIMARY KEY (id);


--
-- Name: pcs pcs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pcs
    ADD CONSTRAINT pcs_pkey PRIMARY KEY (id);


--
-- Name: platform_accounts platform_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_accounts
    ADD CONSTRAINT platform_accounts_pkey PRIMARY KEY (id);


--
-- Name: pricing_rules pricing_rules_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_name_key UNIQUE (name);


--
-- Name: pricing_rules pricing_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_pkey PRIMARY KEY (id);


--
-- Name: prize_redemptions prize_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prize_redemptions
    ADD CONSTRAINT prize_redemptions_pkey PRIMARY KEY (id);


--
-- Name: prizes prizes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prizes
    ADD CONSTRAINT prizes_pkey PRIMARY KEY (id);


--
-- Name: product_categories product_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_name_key UNIQUE (name);


--
-- Name: product_categories product_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: remote_commands remote_commands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remote_commands
    ADD CONSTRAINT remote_commands_pkey PRIMARY KEY (id);


--
-- Name: screenshots screenshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screenshots
    ADD CONSTRAINT screenshots_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: system_events system_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_events
    ADD CONSTRAINT system_events_pkey PRIMARY KEY (id);


--
-- Name: user_cafe_map uq_user_cafe; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_cafe_map
    ADD CONSTRAINT uq_user_cafe UNIQUE (user_id, cafe_id);


--
-- Name: user_cafe_map user_cafe_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_cafe_map
    ADD CONSTRAINT user_cafe_map_pkey PRIMARY KEY (id);


--
-- Name: user_groups user_groups_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_name_key UNIQUE (name);


--
-- Name: user_groups user_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_pkey PRIMARY KEY (id);


--
-- Name: user_memberships user_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_memberships
    ADD CONSTRAINT user_memberships_pkey PRIMARY KEY (id);


--
-- Name: user_offers user_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_offers
    ADD CONSTRAINT user_offers_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: wallet_transactions wallet_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id);


--
-- Name: webhooks webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_pkey PRIMARY KEY (id);


--
-- Name: ix_announcements_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_announcements_cafe_id ON public.announcements USING btree (cafe_id);


--
-- Name: ix_announcements_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_announcements_id ON public.announcements USING btree (id);


--
-- Name: ix_audit_logs_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_cafe_id ON public.audit_logs USING btree (cafe_id);


--
-- Name: ix_audit_logs_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_id ON public.audit_logs USING btree (id);


--
-- Name: ix_backup_entries_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_backup_entries_id ON public.backup_entries USING btree (id);


--
-- Name: ix_bookings_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_bookings_cafe_id ON public.bookings USING btree (cafe_id);


--
-- Name: ix_bookings_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_bookings_id ON public.bookings USING btree (id);


--
-- Name: ix_cafes_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_cafes_id ON public.cafes USING btree (id);


--
-- Name: ix_chat_messages_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_chat_messages_cafe_id ON public.chat_messages USING btree (cafe_id);


--
-- Name: ix_chat_messages_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_chat_messages_id ON public.chat_messages USING btree (id);


--
-- Name: ix_client_pcs_hardware_fingerprint; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_client_pcs_hardware_fingerprint ON public.client_pcs USING btree (hardware_fingerprint);


--
-- Name: ix_client_pcs_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_client_pcs_id ON public.client_pcs USING btree (id);


--
-- Name: ix_client_updates_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_client_updates_id ON public.client_updates USING btree (id);


--
-- Name: ix_coin_transactions_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_coin_transactions_id ON public.coin_transactions USING btree (id);


--
-- Name: ix_coupon_redemptions_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_coupon_redemptions_id ON public.coupon_redemptions USING btree (id);


--
-- Name: ix_coupons_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_coupons_cafe_id ON public.coupons USING btree (cafe_id);


--
-- Name: ix_coupons_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_coupons_id ON public.coupons USING btree (id);


--
-- Name: ix_device_ip_history_client_pc_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_device_ip_history_client_pc_id ON public.device_ip_history USING btree (client_pc_id);


--
-- Name: ix_device_ip_history_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_device_ip_history_id ON public.device_ip_history USING btree (id);


--
-- Name: ix_event_progress_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_progress_id ON public.event_progress USING btree (id);


--
-- Name: ix_events_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_events_cafe_id ON public.events USING btree (cafe_id);


--
-- Name: ix_events_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_events_id ON public.events USING btree (id);


--
-- Name: ix_games_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_games_cafe_id ON public.games USING btree (cafe_id);


--
-- Name: ix_games_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_games_id ON public.games USING btree (id);


--
-- Name: ix_hardware_stats_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_hardware_stats_cafe_id ON public.hardware_stats USING btree (cafe_id);


--
-- Name: ix_hardware_stats_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_hardware_stats_id ON public.hardware_stats USING btree (id);


--
-- Name: ix_leaderboard_entries_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_leaderboard_entries_id ON public.leaderboard_entries USING btree (id);


--
-- Name: ix_leaderboards_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_leaderboards_cafe_id ON public.leaderboards USING btree (cafe_id);


--
-- Name: ix_leaderboards_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_leaderboards_id ON public.leaderboards USING btree (id);


--
-- Name: ix_license_assignments_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_license_assignments_id ON public.license_assignments USING btree (id);


--
-- Name: ix_license_keys_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_license_keys_id ON public.license_keys USING btree (id);


--
-- Name: ix_license_keys_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_license_keys_key ON public.license_keys USING btree (key);


--
-- Name: ix_licenses_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_licenses_key ON public.licenses USING btree (key);


--
-- Name: ix_membership_packages_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_membership_packages_cafe_id ON public.membership_packages USING btree (cafe_id);


--
-- Name: ix_membership_packages_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_membership_packages_id ON public.membership_packages USING btree (id);


--
-- Name: ix_notifications_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notifications_cafe_id ON public.notifications USING btree (cafe_id);


--
-- Name: ix_notifications_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notifications_id ON public.notifications USING btree (id);


--
-- Name: ix_offers_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_offers_cafe_id ON public.offers USING btree (cafe_id);


--
-- Name: ix_offers_display_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_offers_display_order ON public.offers USING btree (display_order);


--
-- Name: ix_offers_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_offers_id ON public.offers USING btree (id);


--
-- Name: ix_order_items_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_order_items_id ON public.order_items USING btree (id);


--
-- Name: ix_orders_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_orders_cafe_id ON public.orders USING btree (cafe_id);


--
-- Name: ix_orders_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_orders_id ON public.orders USING btree (id);


--
-- Name: ix_password_reset_tokens_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_password_reset_tokens_id ON public.password_reset_tokens USING btree (id);


--
-- Name: ix_password_reset_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_password_reset_tokens_token ON public.password_reset_tokens USING btree (token);


--
-- Name: ix_pc_games_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_pc_games_id ON public.pc_games USING btree (id);


--
-- Name: ix_pc_groups_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_pc_groups_id ON public.pc_groups USING btree (id);


--
-- Name: ix_pc_to_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_pc_to_group_id ON public.pc_to_group USING btree (id);


--
-- Name: ix_pcs_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_pcs_id ON public.pcs USING btree (id);


--
-- Name: ix_pcs_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_pcs_name ON public.pcs USING btree (name);


--
-- Name: ix_platform_accounts_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_platform_accounts_id ON public.platform_accounts USING btree (id);


--
-- Name: ix_pricing_rules_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_pricing_rules_cafe_id ON public.pricing_rules USING btree (cafe_id);


--
-- Name: ix_pricing_rules_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_pricing_rules_id ON public.pricing_rules USING btree (id);


--
-- Name: ix_prize_redemptions_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_prize_redemptions_id ON public.prize_redemptions USING btree (id);


--
-- Name: ix_prizes_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_prizes_cafe_id ON public.prizes USING btree (cafe_id);


--
-- Name: ix_prizes_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_prizes_id ON public.prizes USING btree (id);


--
-- Name: ix_product_categories_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_product_categories_cafe_id ON public.product_categories USING btree (cafe_id);


--
-- Name: ix_product_categories_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_product_categories_id ON public.product_categories USING btree (id);


--
-- Name: ix_products_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_products_cafe_id ON public.products USING btree (cafe_id);


--
-- Name: ix_products_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_products_id ON public.products USING btree (id);


--
-- Name: ix_refresh_tokens_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_refresh_tokens_id ON public.refresh_tokens USING btree (id);


--
-- Name: ix_refresh_tokens_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_refresh_tokens_token_hash ON public.refresh_tokens USING btree (token_hash);


--
-- Name: ix_refresh_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_refresh_tokens_user_id ON public.refresh_tokens USING btree (user_id);


--
-- Name: ix_remote_commands_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_remote_commands_id ON public.remote_commands USING btree (id);


--
-- Name: ix_screenshots_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_screenshots_cafe_id ON public.screenshots USING btree (cafe_id);


--
-- Name: ix_screenshots_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_screenshots_id ON public.screenshots USING btree (id);


--
-- Name: ix_sessions_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sessions_cafe_id ON public.sessions USING btree (cafe_id);


--
-- Name: ix_sessions_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sessions_id ON public.sessions USING btree (id);


--
-- Name: ix_settings_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_settings_cafe_id ON public.settings USING btree (cafe_id);


--
-- Name: ix_settings_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_settings_category ON public.settings USING btree (category);


--
-- Name: ix_settings_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_settings_id ON public.settings USING btree (id);


--
-- Name: ix_settings_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_settings_key ON public.settings USING btree (key);


--
-- Name: ix_support_tickets_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_support_tickets_cafe_id ON public.support_tickets USING btree (cafe_id);


--
-- Name: ix_support_tickets_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_support_tickets_id ON public.support_tickets USING btree (id);


--
-- Name: ix_system_events_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_system_events_cafe_id ON public.system_events USING btree (cafe_id);


--
-- Name: ix_system_events_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_system_events_id ON public.system_events USING btree (id);


--
-- Name: ix_system_events_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_system_events_timestamp ON public.system_events USING btree ("timestamp");


--
-- Name: ix_system_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_system_events_type ON public.system_events USING btree (type);


--
-- Name: ix_user_cafe_map_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_cafe_map_cafe_id ON public.user_cafe_map USING btree (cafe_id);


--
-- Name: ix_user_cafe_map_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_cafe_map_id ON public.user_cafe_map USING btree (id);


--
-- Name: ix_user_cafe_map_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_cafe_map_user_id ON public.user_cafe_map USING btree (user_id);


--
-- Name: ix_user_groups_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_groups_cafe_id ON public.user_groups USING btree (cafe_id);


--
-- Name: ix_user_groups_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_groups_id ON public.user_groups USING btree (id);


--
-- Name: ix_user_memberships_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_memberships_id ON public.user_memberships USING btree (id);


--
-- Name: ix_user_offers_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_offers_id ON public.user_offers USING btree (id);


--
-- Name: ix_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_users_email ON public.users USING btree (email);


--
-- Name: ix_users_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_users_id ON public.users USING btree (id);


--
-- Name: ix_wallet_transactions_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_wallet_transactions_cafe_id ON public.wallet_transactions USING btree (cafe_id);


--
-- Name: ix_wallet_transactions_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_wallet_transactions_id ON public.wallet_transactions USING btree (id);


--
-- Name: ix_webhooks_cafe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_webhooks_cafe_id ON public.webhooks USING btree (cafe_id);


--
-- Name: ix_webhooks_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_webhooks_id ON public.webhooks USING btree (id);


--
-- Name: announcements announcements_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: audit_logs audit_logs_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: bookings bookings_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: bookings bookings_pc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pc_id_fkey FOREIGN KEY (pc_id) REFERENCES public.pcs(id);


--
-- Name: bookings bookings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: cafes cafes_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cafes
    ADD CONSTRAINT cafes_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- Name: chat_messages chat_messages_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: chat_messages chat_messages_from_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.users(id);


--
-- Name: chat_messages chat_messages_pc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pc_id_fkey FOREIGN KEY (pc_id) REFERENCES public.pcs(id);


--
-- Name: chat_messages chat_messages_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES public.users(id);


--
-- Name: client_pcs client_pcs_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_pcs
    ADD CONSTRAINT client_pcs_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: client_pcs client_pcs_current_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_pcs
    ADD CONSTRAINT client_pcs_current_user_id_fkey FOREIGN KEY (current_user_id) REFERENCES public.users(id);


--
-- Name: client_pcs client_pcs_license_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_pcs
    ADD CONSTRAINT client_pcs_license_key_fkey FOREIGN KEY (license_key) REFERENCES public.licenses(key);


--
-- Name: coin_transactions coin_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coin_transactions
    ADD CONSTRAINT coin_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: coupon_redemptions coupon_redemptions_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.coupons(id);


--
-- Name: coupon_redemptions coupon_redemptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: coupons coupons_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: device_ip_history device_ip_history_client_pc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_ip_history
    ADD CONSTRAINT device_ip_history_client_pc_id_fkey FOREIGN KEY (client_pc_id) REFERENCES public.client_pcs(id);


--
-- Name: event_progress event_progress_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_progress
    ADD CONSTRAINT event_progress_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id);


--
-- Name: event_progress event_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_progress
    ADD CONSTRAINT event_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: events events_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: games games_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: hardware_stats hardware_stats_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hardware_stats
    ADD CONSTRAINT hardware_stats_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: hardware_stats hardware_stats_pc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hardware_stats
    ADD CONSTRAINT hardware_stats_pc_id_fkey FOREIGN KEY (pc_id) REFERENCES public.pcs(id);


--
-- Name: leaderboard_entries leaderboard_entries_leaderboard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leaderboard_entries
    ADD CONSTRAINT leaderboard_entries_leaderboard_id_fkey FOREIGN KEY (leaderboard_id) REFERENCES public.leaderboards(id);


--
-- Name: leaderboard_entries leaderboard_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leaderboard_entries
    ADD CONSTRAINT leaderboard_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: leaderboards leaderboards_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leaderboards
    ADD CONSTRAINT leaderboards_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: license_assignments license_assignments_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_assignments
    ADD CONSTRAINT license_assignments_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.platform_accounts(id);


--
-- Name: license_assignments license_assignments_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_assignments
    ADD CONSTRAINT license_assignments_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.games(id);


--
-- Name: license_assignments license_assignments_pc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_assignments
    ADD CONSTRAINT license_assignments_pc_id_fkey FOREIGN KEY (pc_id) REFERENCES public.client_pcs(id);


--
-- Name: license_assignments license_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_assignments
    ADD CONSTRAINT license_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: licenses licenses_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT licenses_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: membership_packages membership_packages_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_packages
    ADD CONSTRAINT membership_packages_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: notifications notifications_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: notifications notifications_pc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pc_id_fkey FOREIGN KEY (pc_id) REFERENCES public.pcs(id);


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: offers offers_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: orders orders_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: pc_games pc_games_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pc_games
    ADD CONSTRAINT pc_games_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.games(id);


--
-- Name: pc_games pc_games_pc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pc_games
    ADD CONSTRAINT pc_games_pc_id_fkey FOREIGN KEY (pc_id) REFERENCES public.pcs(id);


--
-- Name: pc_to_group pc_to_group_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pc_to_group
    ADD CONSTRAINT pc_to_group_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.pc_groups(id);


--
-- Name: pc_to_group pc_to_group_pc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pc_to_group
    ADD CONSTRAINT pc_to_group_pc_id_fkey FOREIGN KEY (pc_id) REFERENCES public.pcs(id);


--
-- Name: pcs pcs_current_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pcs
    ADD CONSTRAINT pcs_current_user_id_fkey FOREIGN KEY (current_user_id) REFERENCES public.users(id);


--
-- Name: platform_accounts platform_accounts_assigned_pc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_accounts
    ADD CONSTRAINT platform_accounts_assigned_pc_id_fkey FOREIGN KEY (assigned_pc_id) REFERENCES public.client_pcs(id);


--
-- Name: platform_accounts platform_accounts_assigned_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_accounts
    ADD CONSTRAINT platform_accounts_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES public.users(id);


--
-- Name: platform_accounts platform_accounts_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_accounts
    ADD CONSTRAINT platform_accounts_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.games(id);


--
-- Name: pricing_rules pricing_rules_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: pricing_rules pricing_rules_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.pc_groups(id);


--
-- Name: prize_redemptions prize_redemptions_prize_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prize_redemptions
    ADD CONSTRAINT prize_redemptions_prize_id_fkey FOREIGN KEY (prize_id) REFERENCES public.prizes(id);


--
-- Name: prize_redemptions prize_redemptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prize_redemptions
    ADD CONSTRAINT prize_redemptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: prizes prizes_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prizes
    ADD CONSTRAINT prizes_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: product_categories product_categories_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: products products_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.product_categories(id);


--
-- Name: refresh_tokens refresh_tokens_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: remote_commands remote_commands_pc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remote_commands
    ADD CONSTRAINT remote_commands_pc_id_fkey FOREIGN KEY (pc_id) REFERENCES public.client_pcs(id);


--
-- Name: screenshots screenshots_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screenshots
    ADD CONSTRAINT screenshots_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: screenshots screenshots_pc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screenshots
    ADD CONSTRAINT screenshots_pc_id_fkey FOREIGN KEY (pc_id) REFERENCES public.client_pcs(id);


--
-- Name: screenshots screenshots_taken_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screenshots
    ADD CONSTRAINT screenshots_taken_by_fkey FOREIGN KEY (taken_by) REFERENCES public.users(id);


--
-- Name: sessions sessions_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: sessions sessions_client_pc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_client_pc_id_fkey FOREIGN KEY (client_pc_id) REFERENCES public.client_pcs(id);


--
-- Name: sessions sessions_pc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pc_id_fkey FOREIGN KEY (pc_id) REFERENCES public.pcs(id);


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: settings settings_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: settings settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: support_tickets support_tickets_assigned_staff_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_assigned_staff_fkey FOREIGN KEY (assigned_staff) REFERENCES public.users(id);


--
-- Name: support_tickets support_tickets_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: support_tickets support_tickets_pc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pc_id_fkey FOREIGN KEY (pc_id) REFERENCES public.pcs(id);


--
-- Name: support_tickets support_tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: system_events system_events_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_events
    ADD CONSTRAINT system_events_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: system_events system_events_pc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_events
    ADD CONSTRAINT system_events_pc_id_fkey FOREIGN KEY (pc_id) REFERENCES public.client_pcs(id);


--
-- Name: user_cafe_map user_cafe_map_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_cafe_map
    ADD CONSTRAINT user_cafe_map_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: user_cafe_map user_cafe_map_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_cafe_map
    ADD CONSTRAINT user_cafe_map_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: user_groups user_groups_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: user_memberships user_memberships_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_memberships
    ADD CONSTRAINT user_memberships_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.membership_packages(id);


--
-- Name: user_memberships user_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_memberships
    ADD CONSTRAINT user_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: user_offers user_offers_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_offers
    ADD CONSTRAINT user_offers_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id);


--
-- Name: user_offers user_offers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_offers
    ADD CONSTRAINT user_offers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: users users_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: users users_user_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_user_group_id_fkey FOREIGN KEY (user_group_id) REFERENCES public.user_groups(id);


--
-- Name: wallet_transactions wallet_transactions_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- Name: wallet_transactions wallet_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: webhooks webhooks_cafe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id);


--
-- PostgreSQL database dump complete
--

\unrestrict 8c7D6oYKTIfHjM2JFwflkjTY5nlKqPgwJdxxI3kJQthvWFDA3Dlr6v8gZ3au26k

