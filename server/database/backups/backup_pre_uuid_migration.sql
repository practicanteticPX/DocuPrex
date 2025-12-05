--
-- PostgreSQL database dump
--

\restrict gmSD3tdZNOImhHYogbzdYAv5xnsXo1qqegR7ITXA8ZKdwcaHHQ05h5qhx3g5CJf

-- Dumped from database version 14.19
-- Dumped by pg_dump version 14.19

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

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: causacion_grupos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.causacion_grupos (
    id integer NOT NULL,
    codigo character varying(50) NOT NULL,
    nombre character varying(255) NOT NULL,
    descripcion text,
    activo boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.causacion_grupos OWNER TO postgres;

--
-- Name: TABLE causacion_grupos; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.causacion_grupos IS 'Grupos disponibles para el proceso de causación de facturas';


--
-- Name: COLUMN causacion_grupos.codigo; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.causacion_grupos.codigo IS 'Código único del grupo usado en el frontend (financiera, logistica)';


--
-- Name: causacion_grupos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.causacion_grupos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.causacion_grupos_id_seq OWNER TO postgres;

--
-- Name: causacion_grupos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.causacion_grupos_id_seq OWNED BY public.causacion_grupos.id;


--
-- Name: causacion_integrantes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.causacion_integrantes (
    id integer NOT NULL,
    grupo_id integer NOT NULL,
    user_id uuid NOT NULL,
    cargo character varying(255) DEFAULT 'Causación'::character varying,
    activo boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.causacion_integrantes OWNER TO postgres;

--
-- Name: TABLE causacion_integrantes; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.causacion_integrantes IS 'Integrantes de cada grupo de causación (referencia directa a users)';


--
-- Name: COLUMN causacion_integrantes.user_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.causacion_integrantes.user_id IS 'Referencia al usuario en la tabla users (nombre y email se obtienen de ahí)';


--
-- Name: COLUMN causacion_integrantes.cargo; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.causacion_integrantes.cargo IS 'Cargo que aparecerá en el informe de firmas (por defecto: Causación)';


--
-- Name: causacion_integrantes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.causacion_integrantes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.causacion_integrantes_id_seq OWNER TO postgres;

--
-- Name: causacion_integrantes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.causacion_integrantes_id_seq OWNED BY public.causacion_integrantes.id;


--
-- Name: document_signers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.document_signers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    document_id uuid NOT NULL,
    user_id uuid NOT NULL,
    order_position integer DEFAULT 0,
    is_required boolean DEFAULT true,
    assigned_role_id uuid,
    role_name character varying(255),
    notified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    assigned_role_ids uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
    role_names text[] DEFAULT ARRAY[]::text[] NOT NULL
);


ALTER TABLE public.document_signers OWNER TO postgres;

--
-- Name: TABLE document_signers; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.document_signers IS 'Usuarios asignados para firmar cada documento';


--
-- Name: COLUMN document_signers.assigned_role_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.document_signers.assigned_role_id IS 'Rol asignado al firmante en este documento';


--
-- Name: COLUMN document_signers.role_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.document_signers.role_name IS 'Nombre del rol (copia histórica)';


--
-- Name: document_type_roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.document_type_roles (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    document_type_id uuid NOT NULL,
    role_name character varying(255) NOT NULL,
    role_code character varying(50) NOT NULL,
    order_position integer NOT NULL,
    is_required boolean DEFAULT true,
    description text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.document_type_roles OWNER TO postgres;

--
-- Name: TABLE document_type_roles; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.document_type_roles IS 'Roles específicos requeridos para cada tipo de documento';


--
-- Name: document_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.document_types (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    code character varying(50) NOT NULL,
    description text,
    prefix character varying(50) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.document_types OWNER TO postgres;

--
-- Name: TABLE document_types; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.document_types IS 'Tipos de documentos con prefijos y configuración específica';


--
-- Name: documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.documents (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    title character varying(500) NOT NULL,
    description text,
    file_name character varying(500) NOT NULL,
    file_path character varying(1000) NOT NULL,
    file_size integer NOT NULL,
    mime_type character varying(100) DEFAULT 'application/pdf'::character varying,
    status character varying(50) DEFAULT 'pending'::character varying,
    uploaded_by uuid NOT NULL,
    document_type_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp with time zone,
    CONSTRAINT documents_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'rejected'::character varying, 'archived'::character varying])::text[])))
);


ALTER TABLE public.documents OWNER TO postgres;

--
-- Name: TABLE documents; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.documents IS 'Documentos subidos para firma digital';


--
-- Name: COLUMN documents.document_type_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.documents.document_type_id IS 'Tipo de documento asignado';


--
-- Name: negotiation_signers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.negotiation_signers (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    cedula character varying(20) NOT NULL,
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.negotiation_signers OWNER TO postgres;

--
-- Name: negotiation_signers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.negotiation_signers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.negotiation_signers_id_seq OWNER TO postgres;

--
-- Name: negotiation_signers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.negotiation_signers_id_seq OWNED BY public.negotiation_signers.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    type character varying(50) NOT NULL,
    document_id uuid,
    actor_id uuid,
    document_title character varying(500),
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: TABLE notifications; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.notifications IS 'Notificaciones del sistema para usuarios';


--
-- Name: signatures; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.signatures (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    document_id uuid NOT NULL,
    signer_id uuid NOT NULL,
    signature_data text,
    signature_type character varying(50) DEFAULT 'digital'::character varying,
    ip_address character varying(45),
    user_agent text,
    status character varying(50) DEFAULT 'pending'::character varying,
    rejection_reason text,
    signed_at timestamp with time zone,
    rejected_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    consecutivo text,
    real_signer_name character varying(255),
    CONSTRAINT signatures_signature_type_check CHECK (((signature_type)::text = ANY ((ARRAY['digital'::character varying, 'electronic'::character varying, 'handwritten'::character varying])::text[]))),
    CONSTRAINT signatures_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'signed'::character varying, 'rejected'::character varying])::text[])))
);


ALTER TABLE public.signatures OWNER TO postgres;

--
-- Name: TABLE signatures; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.signatures IS 'Firmas digitales realizadas en los documentos';


--
-- Name: COLUMN signatures.rejection_reason; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.signatures.rejection_reason IS 'Razón del rechazo cuando status = rejected';


--
-- Name: COLUMN signatures.rejected_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.signatures.rejected_at IS 'Fecha de rechazo cuando status = rejected';


--
-- Name: COLUMN signatures.real_signer_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.signatures.real_signer_name IS 'Stores the real person name when using shared accounts (e.g., "Carolina Martinez" when signed by Negociaciones user)';


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255),
    role character varying(50) DEFAULT 'user'::character varying,
    ad_username character varying(255),
    is_active boolean DEFAULT true,
    email_notifications boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'user'::character varying, 'viewer'::character varying])::text[])))
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: TABLE users; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.users IS 'Usuarios del sistema con autenticación AD o local';


--
-- Name: COLUMN users.email_notifications; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.users.email_notifications IS 'Indica si el usuario desea recibir notificaciones por email';


--
-- Name: v_documents_with_details; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_documents_with_details AS
SELECT
    NULL::uuid AS id,
    NULL::character varying(500) AS title,
    NULL::text AS description,
    NULL::character varying(500) AS file_name,
    NULL::character varying(1000) AS file_path,
    NULL::integer AS file_size,
    NULL::character varying(100) AS mime_type,
    NULL::character varying(50) AS status,
    NULL::uuid AS uploaded_by,
    NULL::uuid AS document_type_id,
    NULL::timestamp with time zone AS created_at,
    NULL::timestamp with time zone AS updated_at,
    NULL::timestamp with time zone AS completed_at,
    NULL::character varying(255) AS uploaded_by_name,
    NULL::character varying(255) AS uploaded_by_email,
    NULL::character varying(255) AS document_type_name,
    NULL::character varying(50) AS document_type_code,
    NULL::character varying(50) AS document_type_prefix,
    NULL::bigint AS total_signers,
    NULL::bigint AS signed_count,
    NULL::bigint AS pending_count;


ALTER TABLE public.v_documents_with_details OWNER TO postgres;

--
-- Name: v_documents_with_signatures; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_documents_with_signatures AS
SELECT
    NULL::uuid AS id,
    NULL::character varying(500) AS title,
    NULL::text AS description,
    NULL::character varying(500) AS file_name,
    NULL::character varying(1000) AS file_path,
    NULL::integer AS file_size,
    NULL::character varying(100) AS mime_type,
    NULL::character varying(50) AS status,
    NULL::uuid AS uploaded_by,
    NULL::uuid AS document_type_id,
    NULL::timestamp with time zone AS created_at,
    NULL::timestamp with time zone AS updated_at,
    NULL::timestamp with time zone AS completed_at,
    NULL::character varying(255) AS uploaded_by_name,
    NULL::character varying(255) AS uploaded_by_email,
    NULL::bigint AS total_signers,
    NULL::bigint AS signed_count,
    NULL::bigint AS pending_count;


ALTER TABLE public.v_documents_with_signatures OWNER TO postgres;

--
-- Name: v_pending_documents_by_user; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_pending_documents_by_user AS
 SELECT ds.user_id,
    d.id AS document_id,
    d.title,
    d.description,
    d.status AS document_status,
    d.created_at,
    u.name AS uploaded_by_name,
    COALESCE(s.status, 'pending'::character varying) AS signature_status
   FROM (((public.document_signers ds
     JOIN public.documents d ON ((ds.document_id = d.id)))
     JOIN public.users u ON ((d.uploaded_by = u.id)))
     LEFT JOIN public.signatures s ON (((d.id = s.document_id) AND (ds.user_id = s.signer_id))))
  WHERE (((COALESCE(s.status, 'pending'::character varying))::text = 'pending'::text) AND ((d.status)::text <> ALL ((ARRAY['completed'::character varying, 'archived'::character varying])::text[])));


ALTER TABLE public.v_pending_documents_by_user OWNER TO postgres;

--
-- Name: causacion_grupos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.causacion_grupos ALTER COLUMN id SET DEFAULT nextval('public.causacion_grupos_id_seq'::regclass);


--
-- Name: causacion_integrantes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.causacion_integrantes ALTER COLUMN id SET DEFAULT nextval('public.causacion_integrantes_id_seq'::regclass);


--
-- Name: negotiation_signers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.negotiation_signers ALTER COLUMN id SET DEFAULT nextval('public.negotiation_signers_id_seq'::regclass);


--
-- Data for Name: causacion_grupos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.causacion_grupos (id, codigo, nombre, descripcion, activo, created_at, updated_at) FROM stdin;
1	financiera	Financiera	Grupo de causación del área financiera	t	2025-12-05 19:43:01.911773	2025-12-05 19:43:01.911773
2	logistica	Logística	Grupo de causación del área de logística	t	2025-12-05 19:43:01.911773	2025-12-05 19:43:01.911773
\.


--
-- Data for Name: causacion_integrantes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.causacion_integrantes (id, grupo_id, user_id, cargo, activo, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: document_signers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.document_signers (id, document_id, user_id, order_position, is_required, assigned_role_id, role_name, notified_at, created_at, assigned_role_ids, role_names) FROM stdin;
5409f09e-1791-419e-8554-57f3308e1d0d	0257ee26-263a-42d9-a573-7e75e41d82ba	51e4c507-6dce-4e08-b352-1b2e5dd9e96b	1	t	296de4a7-4ed5-4d90-91ba-472afe2c609b	Resp Ctro Cost	\N	2025-11-20 21:34:04.249243+00	{296de4a7-4ed5-4d90-91ba-472afe2c609b}	{"Resp Ctro Cost"}
6bc769c0-7d9a-45ae-9754-e7a17cd7e448	0257ee26-263a-42d9-a573-7e75e41d82ba	e673b177-638d-4b24-a824-c6a2c7b7ffd2	2	t	1942b0e1-da97-4429-a052-eb4b228393ed	Negociaciones	\N	2025-11-20 21:34:04.295783+00	{1942b0e1-da97-4429-a052-eb4b228393ed}	{Negociaciones}
4c35a428-3ea8-4347-9dc2-6040ecf20fc5	0257ee26-263a-42d9-a573-7e75e41d82ba	14c4766a-4020-4dd1-b2f2-33708d359e29	3	t	ca2e61e9-9746-4518-b1ba-f635168ba95d	Resp Cta Cont	\N	2025-11-20 21:34:04.312283+00	{ca2e61e9-9746-4518-b1ba-f635168ba95d,7d83aab5-8b45-4606-abf1-f9a740f7518c}	{"Resp Cta Cont","Área financiera"}
eb43e69e-77d7-4e1d-91f0-ee2828af18cc	0257ee26-263a-42d9-a573-7e75e41d82ba	ef762b40-4a03-4d84-be67-7b46c123a3c2	4	t	9f02fe9b-43ed-4bf5-9720-4517a21cc044	Causación	\N	2025-11-20 21:34:04.328936+00	{9f02fe9b-43ed-4bf5-9720-4517a21cc044}	{Causación}
cd550e58-45cd-474f-8cff-f1d09c96dccc	0cdd20f6-ab19-41dd-a7fd-341e42c87df4	e673b177-638d-4b24-a824-c6a2c7b7ffd2	1	t	1942b0e1-da97-4429-a052-eb4b228393ed	Negociaciones	\N	2025-11-20 21:54:20.635338+00	{1942b0e1-da97-4429-a052-eb4b228393ed}	{Negociaciones}
efc1835a-df5b-4df6-b2e9-f3c6c73c5e23	0cdd20f6-ab19-41dd-a7fd-341e42c87df4	b4562143-e0ba-42ce-a364-8e46cb31e228	2	t	296de4a7-4ed5-4d90-91ba-472afe2c609b	Resp Ctro Cost	\N	2025-11-20 21:54:20.651671+00	{296de4a7-4ed5-4d90-91ba-472afe2c609b,ca2e61e9-9746-4518-b1ba-f635168ba95d}	{"Resp Ctro Cost","Resp Cta Cont"}
c38bb4bc-32e8-4244-85ff-47182d56d347	0cdd20f6-ab19-41dd-a7fd-341e42c87df4	ba569036-24e1-4269-bf1f-1dc1d2c81f79	3	t	296de4a7-4ed5-4d90-91ba-472afe2c609b	Resp Ctro Cost	\N	2025-11-20 21:54:20.668303+00	{296de4a7-4ed5-4d90-91ba-472afe2c609b}	{"Resp Ctro Cost"}
0b6645cb-4860-4708-a558-08a0d69b03f8	0cdd20f6-ab19-41dd-a7fd-341e42c87df4	e93d74cf-e6de-45f2-8408-7f9ae62713f8	4	t	ca2e61e9-9746-4518-b1ba-f635168ba95d	Resp Cta Cont	\N	2025-11-20 21:54:20.685044+00	{ca2e61e9-9746-4518-b1ba-f635168ba95d}	{"Resp Cta Cont"}
846a51c9-2460-4787-88a5-b1b23de8ff44	0cdd20f6-ab19-41dd-a7fd-341e42c87df4	14c4766a-4020-4dd1-b2f2-33708d359e29	5	t	7d83aab5-8b45-4606-abf1-f9a740f7518c	Área financiera	\N	2025-11-20 21:54:20.701592+00	{7d83aab5-8b45-4606-abf1-f9a740f7518c}	{"Área financiera"}
f1b85d09-3382-4a28-8e88-a75a3fcc8f3b	0cdd20f6-ab19-41dd-a7fd-341e42c87df4	ef762b40-4a03-4d84-be67-7b46c123a3c2	6	t	9f02fe9b-43ed-4bf5-9720-4517a21cc044	Causación	\N	2025-11-20 21:54:20.752736+00	{9f02fe9b-43ed-4bf5-9720-4517a21cc044}	{Causación}
834f76ce-51bb-4131-bde1-652ccb1aa504	84c043e6-81ec-42c8-a8c1-c888cc121b65	51e4c507-6dce-4e08-b352-1b2e5dd9e96b	1	t	ca2e61e9-9746-4518-b1ba-f635168ba95d	Resp Cta Cont	\N	2025-11-27 14:13:22.076959+00	{ca2e61e9-9746-4518-b1ba-f635168ba95d}	{"Resp Cta Cont"}
0b33d250-c076-4a60-a8fe-176e66dc7766	84c043e6-81ec-42c8-a8c1-c888cc121b65	e673b177-638d-4b24-a824-c6a2c7b7ffd2	2	t	1942b0e1-da97-4429-a052-eb4b228393ed	Negociaciones	\N	2025-11-27 14:13:22.177601+00	{1942b0e1-da97-4429-a052-eb4b228393ed}	{Negociaciones}
ec8247ae-cfb7-495f-91c9-9a75a1c8ce74	84c043e6-81ec-42c8-a8c1-c888cc121b65	b4562143-e0ba-42ce-a364-8e46cb31e228	3	t	296de4a7-4ed5-4d90-91ba-472afe2c609b	Resp Ctro Cost	\N	2025-11-27 14:13:22.193938+00	{296de4a7-4ed5-4d90-91ba-472afe2c609b}	{"Resp Ctro Cost"}
5db9816c-672c-4acb-9447-e3072ccd4fcd	84c043e6-81ec-42c8-a8c1-c888cc121b65	14c4766a-4020-4dd1-b2f2-33708d359e29	4	t	7d83aab5-8b45-4606-abf1-f9a740f7518c	Área financiera	\N	2025-11-27 14:13:22.210664+00	{7d83aab5-8b45-4606-abf1-f9a740f7518c}	{"Área financiera"}
2ae5e3b2-752e-4abf-8161-59a03b9f379c	84c043e6-81ec-42c8-a8c1-c888cc121b65	ef762b40-4a03-4d84-be67-7b46c123a3c2	5	t	9f02fe9b-43ed-4bf5-9720-4517a21cc044	Causación	\N	2025-11-27 14:13:22.227343+00	{9f02fe9b-43ed-4bf5-9720-4517a21cc044}	{Causación}
f5c6a160-62e0-42af-bc5d-436f5a4e8a71	105b1593-d4f6-4cbc-b5ce-b62197879075	51e4c507-6dce-4e08-b352-1b2e5dd9e96b	1	t	ca2e61e9-9746-4518-b1ba-f635168ba95d	Resp Cta Cont	\N	2025-11-27 14:17:34.755149+00	{ca2e61e9-9746-4518-b1ba-f635168ba95d}	{"Resp Cta Cont"}
06ea7751-c1ba-4a39-92c9-b4c238ac9d51	105b1593-d4f6-4cbc-b5ce-b62197879075	e673b177-638d-4b24-a824-c6a2c7b7ffd2	2	t	1942b0e1-da97-4429-a052-eb4b228393ed	Negociaciones	\N	2025-11-27 14:17:34.788553+00	{1942b0e1-da97-4429-a052-eb4b228393ed}	{Negociaciones}
72a5f50d-4b67-40ee-b975-7d7f27b9ab17	105b1593-d4f6-4cbc-b5ce-b62197879075	14c4766a-4020-4dd1-b2f2-33708d359e29	3	t	7d83aab5-8b45-4606-abf1-f9a740f7518c	Área financiera	\N	2025-11-27 14:17:34.804949+00	{7d83aab5-8b45-4606-abf1-f9a740f7518c}	{"Área financiera"}
7cafc62e-b68f-4152-a675-a70a550144bb	105b1593-d4f6-4cbc-b5ce-b62197879075	ef762b40-4a03-4d84-be67-7b46c123a3c2	4	t	9f02fe9b-43ed-4bf5-9720-4517a21cc044	Causación	\N	2025-11-27 14:17:34.821702+00	{9f02fe9b-43ed-4bf5-9720-4517a21cc044}	{Causación}
0eeb86ad-90a5-4136-a9fe-af9bc9d9f6b9	620e5b92-2649-43d1-ac73-dbfaabda06d0	f2cf7842-ec6d-40be-a2cc-ca1d3c5e128b	1	t	216b9130-99c4-4020-b347-6f77b7b8498c	Solicitante	\N	2025-11-28 15:00:02.143695+00	{216b9130-99c4-4020-b347-6f77b7b8498c}	{Solicitante}
6c30e257-2b47-4ef3-900c-f910f50f8552	620e5b92-2649-43d1-ac73-dbfaabda06d0	51e4c507-6dce-4e08-b352-1b2e5dd9e96b	2	t	29b4873d-c9cc-4e4a-9903-b19113017ed8	Aprobador	\N	2025-11-28 15:00:02.204164+00	{29b4873d-c9cc-4e4a-9903-b19113017ed8}	{Aprobador}
16f4cd3d-5b10-4bab-a999-ee18f275ce18	620e5b92-2649-43d1-ac73-dbfaabda06d0	e673b177-638d-4b24-a824-c6a2c7b7ffd2	3	t	7340abce-f698-423e-95e1-f6ccf8e758a7	Negociaciones	\N	2025-11-28 15:00:02.220598+00	{7340abce-f698-423e-95e1-f6ccf8e758a7}	{Negociaciones}
41d96ef0-61ae-472d-ba6f-6ceb704d3be8	620e5b92-2649-43d1-ac73-dbfaabda06d0	14c4766a-4020-4dd1-b2f2-33708d359e29	4	t	9f414c8f-9bcd-47eb-8ccf-79e1bf1e8e87	Área Financiera	\N	2025-11-28 15:00:02.253908+00	{9f414c8f-9bcd-47eb-8ccf-79e1bf1e8e87}	{"Área Financiera"}
18cc8d53-98f4-42a1-8562-c83bb3cca559	620e5b92-2649-43d1-ac73-dbfaabda06d0	1589c26c-502d-4ecc-82ed-8bde157f92c2	5	t	3754deed-d93e-482e-ae5f-01feec3ebc70	Tesorería	\N	2025-11-28 15:00:02.270638+00	{3754deed-d93e-482e-ae5f-01feec3ebc70}	{Tesorería}
3061a2d2-da9b-4049-b9f5-c6e807134316	8770fd2b-38db-445a-953d-4cff6ad8b10f	7304529a-76b8-460a-9a14-531f694c5e32	1	t	\N	\N	\N	2025-12-02 21:18:51.412769+00	{}	{}
c51bf614-2165-4fbf-8c39-4aafcdd4e4ac	8770fd2b-38db-445a-953d-4cff6ad8b10f	4fb7c77e-cb5c-442b-b0e0-00bbc1c7ceb5	2	t	\N	\N	\N	2025-12-02 21:18:51.519146+00	{}	{}
38a99cfa-d4bc-42e8-9cf9-9613e8353aa7	e48a8e7f-7392-404b-9b71-168c703fb540	7304529a-76b8-460a-9a14-531f694c5e32	1	t	\N	\N	\N	2025-12-03 14:20:36.931041+00	{}	{}
34a00a24-d9c1-432f-abea-5e7822b31c86	e48a8e7f-7392-404b-9b71-168c703fb540	4fb7c77e-cb5c-442b-b0e0-00bbc1c7ceb5	2	t	\N	\N	\N	2025-12-03 14:20:36.970869+00	{}	{}
\.


--
-- Data for Name: document_type_roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.document_type_roles (id, document_type_id, role_name, role_code, order_position, is_required, description, created_at) FROM stdin;
216b9130-99c4-4020-b347-6f77b7b8498c	192bccf7-698a-46df-beab-6b264b24f39b	Solicitante	SOLICITANTE	1	t	Persona que solicita el anticipo	2025-11-15 14:27:04.492853+00
29b4873d-c9cc-4e4a-9903-b19113017ed8	192bccf7-698a-46df-beab-6b264b24f39b	Aprobador	APROBADOR	2	t	Persona que aprueba la solicitud	2025-11-15 14:27:04.492853+00
7340abce-f698-423e-95e1-f6ccf8e758a7	192bccf7-698a-46df-beab-6b264b24f39b	Negociaciones	NEGOCIACIONES	3	t	Área de negociaciones	2025-11-15 14:27:04.492853+00
9f414c8f-9bcd-47eb-8ccf-79e1bf1e8e87	192bccf7-698a-46df-beab-6b264b24f39b	Área Financiera	AREA_FINANCIERA	4	t	Área financiera	2025-11-15 14:27:04.492853+00
aa269ae0-21ee-4b89-adee-572ae448cbd2	192bccf7-698a-46df-beab-6b264b24f39b	Gerencia Ejecutiva	GERENCIA_EJECUTIVA	5	f	Gerencia ejecutiva (opcional)	2025-11-15 14:27:04.492853+00
7d83aab5-8b45-4606-abf1-f9a740f7518c	187a2d04-662e-4852-a5ec-a53387548c3a	Área financiera	AREA_FINANCIERA	4	f	Representante del área financiera	2025-11-15 14:33:16.664363+00
9f02fe9b-43ed-4bf5-9720-4517a21cc044	187a2d04-662e-4852-a5ec-a53387548c3a	Causación	CAUSACION	5	f	Responsable de la causación de la factura	2025-11-15 14:33:16.664363+00
3754deed-d93e-482e-ae5f-01feec3ebc70	192bccf7-698a-46df-beab-6b264b24f39b	Tesorería	TESORERIA	6	t	Responsable del área de tesorería	2025-11-15 14:34:40.291028+00
296de4a7-4ed5-4d90-91ba-472afe2c609b	187a2d04-662e-4852-a5ec-a53387548c3a	Resp Ctro Cost	RESPONSABLE_CENTRO_COSTOS	1	f	Responsable del centro de costos asociado a la factura	2025-11-15 14:33:16.664363+00
1942b0e1-da97-4429-a052-eb4b228393ed	187a2d04-662e-4852-a5ec-a53387548c3a	Negociaciones	RESPONSABLE_NEGOCIACIONES	3	f	Responsable del área de negociaciones	2025-11-15 14:33:16.664363+00
ca2e61e9-9746-4518-b1ba-f635168ba95d	187a2d04-662e-4852-a5ec-a53387548c3a	Resp Cta Cont	RESPONSABLE_CUENTA_CONTABLE	2	f	Responsable de la cuenta contable donde se imputa la factura	2025-11-15 14:33:16.664363+00
\.


--
-- Data for Name: document_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.document_types (id, name, code, description, prefix, is_active, created_at, updated_at) FROM stdin;
192bccf7-698a-46df-beab-6b264b24f39b	Solicitud de Anticipo	SA	Solicitud de anticipo de fondos con flujo de aprobación por áreas	SA -	t	2025-11-15 14:27:04.443271+00	2025-11-15 14:27:04.443271+00
187a2d04-662e-4852-a5ec-a53387548c3a	Legalización de Facturas	FV	Legalización de facturas con flujo de aprobación flexible y múltiples roles por firmante	FV - 	t	2025-11-15 14:33:16.632313+00	2025-11-15 14:33:16.632313+00
\.


--
-- Data for Name: documents; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.documents (id, title, description, file_name, file_path, file_size, mime_type, status, uploaded_by, document_type_id, created_at, updated_at, completed_at) FROM stdin;
0cdd20f6-ab19-41dd-a7fd-341e42c87df4	FV -  Factura teléfonos Samsung	\N	unificado-1763675660461-97933189.pdf	uploads/jorge_anibal_pena/unificado-1763675660461-97933189.pdf	226092	application/pdf	in_progress	f2cf7842-ec6d-40be-a2cc-ca1d3c5e128b	187a2d04-662e-4852-a5ec-a53387548c3a	2025-11-20 21:54:20.584669+00	2025-11-24 22:10:18.565491+00	\N
8770fd2b-38db-445a-953d-4cff6ad8b10f	a	\N	prueba.pdf	uploads/esteban_zuluaga/prueba.pdf	29982	application/pdf	in_progress	7304529a-76b8-460a-9a14-531f694c5e32	\N	2025-12-02 21:18:51.257649+00	2025-12-02 21:18:52.083465+00	\N
0257ee26-263a-42d9-a573-7e75e41d82ba	FV -  Pago OpenAi	\N	unificado-1763674444035-675809340.pdf	uploads/jorge_anibal_pena/unificado-1763674444035-675809340.pdf	123748	application/pdf	completed	f2cf7842-ec6d-40be-a2cc-ca1d3c5e128b	187a2d04-662e-4852-a5ec-a53387548c3a	2025-11-20 21:34:04.151281+00	2025-11-24 14:53:12.583118+00	2025-11-24 14:53:12.583118+00
e48a8e7f-7392-404b-9b71-168c703fb540	jj	knlkn	jjjjj.pdf	uploads/esteban_zuluaga/jjjjj.pdf	14506	application/pdf	in_progress	7304529a-76b8-460a-9a14-531f694c5e32	\N	2025-12-03 14:20:36.860101+00	2025-12-03 14:20:37.535074+00	\N
620e5b92-2649-43d1-ac73-dbfaabda06d0	SA - Actualizacion DNS ClickPanda	Actualizacion DNS ClickPanda en mail hosting prexxa.com.co.	RFN-00123 Solicitud de Anticipos Actualizar DNS.pdf	uploads/jorge_anibal_pena/RFN-00123 Solicitud de Anticipos Actualizar DNS.pdf	118355	application/pdf	in_progress	f2cf7842-ec6d-40be-a2cc-ca1d3c5e128b	192bccf7-698a-46df-beab-6b264b24f39b	2025-11-28 15:00:02.036453+00	2025-11-28 15:13:59.751292+00	\N
105b1593-d4f6-4cbc-b5ce-b62197879075	FV -  Factura Plan corporativo	Factura Plan corporativo, líneas móviles	unificado-1764253054364-248560717.pdf	uploads/jorge_anibal_pena/unificado-1764253054364-248560717.pdf	2423399	application/pdf	in_progress	f2cf7842-ec6d-40be-a2cc-ca1d3c5e128b	187a2d04-662e-4852-a5ec-a53387548c3a	2025-11-27 14:17:34.606869+00	2025-11-28 15:14:22.654891+00	\N
84c043e6-81ec-42c8-a8c1-c888cc121b65	FV -  Facturas Lineas 3245564212 y 3004934116	Facturas Líneas móviles 3245564212 y 3004934116	unificado-1764252801432-43438792.pdf	uploads/jorge_anibal_pena/unificado-1764252801432-43438792.pdf	3695738	application/pdf	in_progress	f2cf7842-ec6d-40be-a2cc-ca1d3c5e128b	187a2d04-662e-4852-a5ec-a53387548c3a	2025-11-27 14:13:21.845953+00	2025-11-28 15:14:34.961292+00	\N
\.


--
-- Data for Name: negotiation_signers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.negotiation_signers (id, name, cedula, active, created_at, updated_at) FROM stdin;
1	Carolina Martinez	1152454029	t	2025-11-24 18:28:29.742412	2025-11-24 18:28:29.742412
2	Valentina Arroyave	1000752110	t	2025-11-24 18:28:29.742412	2025-11-24 18:28:29.742412
3	Manuela Correa	1128462657	t	2025-11-24 18:28:29.742412	2025-11-24 18:28:29.742412
4	Luisa Velez	1036649911	t	2025-11-24 18:28:29.742412	2025-11-24 18:28:29.742412
5	Sebastian Pinto	1152454298	t	2025-11-24 18:28:29.742412	2025-11-24 18:28:29.742412
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notifications (id, user_id, type, document_id, actor_id, document_title, is_read, created_at, updated_at) FROM stdin;
1ce7fa6e-49ce-41d6-9141-669a94c34fd3	f2cf7842-ec6d-40be-a2cc-ca1d3c5e128b	document_signed	0cdd20f6-ab19-41dd-a7fd-341e42c87df4	e673b177-638d-4b24-a824-c6a2c7b7ffd2	FV -  Factura teléfonos Samsung	f	2025-11-24 16:43:07.560171+00	2025-11-24 16:43:07.560171+00
16fcc9cd-abe2-4ad8-9a0e-334dd0b945a4	f2cf7842-ec6d-40be-a2cc-ca1d3c5e128b	document_signed	0cdd20f6-ab19-41dd-a7fd-341e42c87df4	b4562143-e0ba-42ce-a364-8e46cb31e228	FV -  Factura teléfonos Samsung	f	2025-11-24 19:56:24.624679+00	2025-11-24 19:56:24.624679+00
b9b34ce8-d0ff-4c84-94e1-3e9b868cde8b	f2cf7842-ec6d-40be-a2cc-ca1d3c5e128b	document_signed	0cdd20f6-ab19-41dd-a7fd-341e42c87df4	ba569036-24e1-4269-bf1f-1dc1d2c81f79	FV -  Factura teléfonos Samsung	f	2025-11-24 20:11:30.146173+00	2025-11-24 20:11:30.146173+00
66adec6c-10be-4400-9bb4-c8eb771193b6	f2cf7842-ec6d-40be-a2cc-ca1d3c5e128b	document_signed	620e5b92-2649-43d1-ac73-dbfaabda06d0	51e4c507-6dce-4e08-b352-1b2e5dd9e96b	SA - Actualizacion DNS ClickPanda	f	2025-11-28 15:13:59.793146+00	2025-11-28 15:13:59.793146+00
23af4eb5-c472-465e-8833-90b13eafaae5	e673b177-638d-4b24-a824-c6a2c7b7ffd2	signature_request	620e5b92-2649-43d1-ac73-dbfaabda06d0	f2cf7842-ec6d-40be-a2cc-ca1d3c5e128b	SA - Actualizacion DNS ClickPanda	f	2025-11-28 15:13:59.815953+00	2025-11-28 15:13:59.815953+00
4649b646-04f0-443c-a978-ed48bf4a9e32	f2cf7842-ec6d-40be-a2cc-ca1d3c5e128b	document_signed	105b1593-d4f6-4cbc-b5ce-b62197879075	51e4c507-6dce-4e08-b352-1b2e5dd9e96b	FV -  Factura Plan corporativo	f	2025-11-28 15:14:22.680286+00	2025-11-28 15:14:22.680286+00
c0df86a4-e37f-4c4b-87ea-9ab013f0a2f5	e673b177-638d-4b24-a824-c6a2c7b7ffd2	signature_request	105b1593-d4f6-4cbc-b5ce-b62197879075	f2cf7842-ec6d-40be-a2cc-ca1d3c5e128b	FV -  Factura Plan corporativo	f	2025-11-28 15:14:22.69359+00	2025-11-28 15:14:22.69359+00
dee53aef-e8b3-4e7a-9f6a-b66e071f0eea	f2cf7842-ec6d-40be-a2cc-ca1d3c5e128b	document_signed	84c043e6-81ec-42c8-a8c1-c888cc121b65	51e4c507-6dce-4e08-b352-1b2e5dd9e96b	FV -  Facturas Lineas 3245564212 y 3004934116	f	2025-11-28 15:14:34.987457+00	2025-11-28 15:14:34.987457+00
fec3fb6d-a0b6-4a3e-9570-70fb2352af06	e673b177-638d-4b24-a824-c6a2c7b7ffd2	signature_request	84c043e6-81ec-42c8-a8c1-c888cc121b65	f2cf7842-ec6d-40be-a2cc-ca1d3c5e128b	FV -  Facturas Lineas 3245564212 y 3004934116	f	2025-11-28 15:14:35.000799+00	2025-11-28 15:14:35.000799+00
5d054d43-6069-4fb8-8299-680cf4070bb7	f2cf7842-ec6d-40be-a2cc-ca1d3c5e128b	document_signed	0cdd20f6-ab19-41dd-a7fd-341e42c87df4	e93d74cf-e6de-45f2-8408-7f9ae62713f8	FV -  Factura teléfonos Samsung	f	2025-11-24 22:10:18.591849+00	2025-11-24 22:10:18.591849+00
85160e32-82cc-4a39-bc75-e8abd50fa601	14c4766a-4020-4dd1-b2f2-33708d359e29	signature_request	0cdd20f6-ab19-41dd-a7fd-341e42c87df4	f2cf7842-ec6d-40be-a2cc-ca1d3c5e128b	FV -  Factura teléfonos Samsung	f	2025-11-24 22:10:18.614163+00	2025-11-24 22:10:18.614163+00
98f87fad-a532-4230-a492-76c348913c27	4fb7c77e-cb5c-442b-b0e0-00bbc1c7ceb5	signature_request	8770fd2b-38db-445a-953d-4cff6ad8b10f	7304529a-76b8-460a-9a14-531f694c5e32	a	f	2025-12-02 21:18:52.120293+00	2025-12-02 21:18:52.120293+00
58ede96b-562a-438b-b0bf-8116068f4f03	4fb7c77e-cb5c-442b-b0e0-00bbc1c7ceb5	signature_request	e48a8e7f-7392-404b-9b71-168c703fb540	7304529a-76b8-460a-9a14-531f694c5e32	jj	f	2025-12-03 14:20:37.569739+00	2025-12-03 14:20:37.569739+00
\.


--
-- Data for Name: signatures; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.signatures (id, document_id, signer_id, signature_data, signature_type, ip_address, user_agent, status, rejection_reason, signed_at, rejected_at, created_at, updated_at, consecutivo, real_signer_name) FROM stdin;
7d8e1381-bb46-4e7d-af10-7a8d5ee886d4	105b1593-d4f6-4cbc-b5ce-b62197879075	e673b177-638d-4b24-a824-c6a2c7b7ffd2	\N	digital	\N	\N	pending	\N	\N	\N	2025-11-27 14:17:34.796655+00	2025-11-27 14:17:34.796655+00	\N	\N
26063b02-29a7-4c13-bfea-068f9223a183	105b1593-d4f6-4cbc-b5ce-b62197879075	14c4766a-4020-4dd1-b2f2-33708d359e29	\N	digital	\N	\N	pending	\N	\N	\N	2025-11-27 14:17:34.813154+00	2025-11-27 14:17:34.813154+00	\N	\N
69321c40-d1e8-4588-a01b-2355a26cbe64	0cdd20f6-ab19-41dd-a7fd-341e42c87df4	e93d74cf-e6de-45f2-8408-7f9ae62713f8	Firmado por Andres Giron el 2025-11-24T22:10:19.677Z	digital	\N	\N	signed	\N	2025-11-24 22:10:18.539291+00	\N	2025-11-20 21:54:20.693296+00	2025-11-24 22:10:18.539291+00	\N	\N
42bef8d4-fbfb-40d1-88ee-d137916a377a	0257ee26-263a-42d9-a573-7e75e41d82ba	e673b177-638d-4b24-a824-c6a2c7b7ffd2	Firmado por Negociaciones el 2025-11-21T20:23:37.329Z	digital	\N	\N	signed	\N	2025-11-21 20:23:29.985217+00	\N	2025-11-20 21:34:04.303991+00	2025-11-21 20:23:29.985217+00	\N	\N
fa102833-822b-4f01-bccd-42f615b3f14d	84c043e6-81ec-42c8-a8c1-c888cc121b65	e673b177-638d-4b24-a824-c6a2c7b7ffd2	\N	digital	\N	\N	pending	\N	\N	\N	2025-11-27 14:13:22.185397+00	2025-11-27 14:13:22.185397+00	\N	\N
f4e7a353-773e-4dcf-884b-57fd556d6f22	84c043e6-81ec-42c8-a8c1-c888cc121b65	b4562143-e0ba-42ce-a364-8e46cb31e228	\N	digital	\N	\N	pending	\N	\N	\N	2025-11-27 14:13:22.202109+00	2025-11-27 14:13:22.202109+00	\N	\N
3a4b1592-d175-4f04-a667-8477b03cd46b	84c043e6-81ec-42c8-a8c1-c888cc121b65	14c4766a-4020-4dd1-b2f2-33708d359e29	\N	digital	\N	\N	pending	\N	\N	\N	2025-11-27 14:13:22.219074+00	2025-11-27 14:13:22.219074+00	\N	\N
a751d5cb-c4ea-4a85-9709-a3f01098d925	84c043e6-81ec-42c8-a8c1-c888cc121b65	ef762b40-4a03-4d84-be67-7b46c123a3c2	\N	digital	\N	\N	pending	\N	\N	\N	2025-11-27 14:13:22.235445+00	2025-11-27 14:13:22.235445+00	\N	\N
b63fe6c2-8651-438e-9c01-8d5cebe213c8	105b1593-d4f6-4cbc-b5ce-b62197879075	ef762b40-4a03-4d84-be67-7b46c123a3c2	\N	digital	\N	\N	pending	\N	\N	\N	2025-11-27 14:17:34.830113+00	2025-11-27 14:17:34.830113+00	\N	\N
a2dcbf15-4657-4c6b-9044-8df68fd95ec5	0257ee26-263a-42d9-a573-7e75e41d82ba	51e4c507-6dce-4e08-b352-1b2e5dd9e96b	Firmado por Juan Pablo Ossa el 2025-11-21T13:57:07.028Z	digital	\N	\N	signed	\N	2025-11-21 13:57:07.975214+00	\N	2025-11-20 21:34:04.287497+00	2025-11-21 13:57:07.975214+00	\N	\N
1e6c3d8e-d261-4d2e-a341-e5cfe533f817	620e5b92-2649-43d1-ac73-dbfaabda06d0	e673b177-638d-4b24-a824-c6a2c7b7ffd2	\N	digital	\N	\N	pending	\N	\N	\N	2025-11-28 15:00:02.245643+00	2025-11-28 15:00:02.245643+00	\N	\N
4d39a376-4e56-46ca-bff3-4e409c4ce52a	620e5b92-2649-43d1-ac73-dbfaabda06d0	14c4766a-4020-4dd1-b2f2-33708d359e29	\N	digital	\N	\N	pending	\N	\N	\N	2025-11-28 15:00:02.262249+00	2025-11-28 15:00:02.262249+00	\N	\N
8746e343-82ec-4336-819d-33eee861b767	620e5b92-2649-43d1-ac73-dbfaabda06d0	1589c26c-502d-4ecc-82ed-8bde157f92c2	\N	digital	\N	\N	pending	\N	\N	\N	2025-11-28 15:00:02.278971+00	2025-11-28 15:00:02.278971+00	\N	\N
9e2e9d7e-7f21-4515-ab41-824eb24d98b1	620e5b92-2649-43d1-ac73-dbfaabda06d0	f2cf7842-ec6d-40be-a2cc-ca1d3c5e128b	Autofirmado por Jorge  Anibal Peña el 28/11/2025, 10:00:05 a. m.	digital	\N	\N	signed	\N	2025-11-28 15:00:03.34455+00	\N	2025-11-28 15:00:02.160035+00	2025-11-28 15:00:03.34455+00	\N	\N
b6d8f17e-81a3-4ed0-b20c-1dcd0d81f3a6	0cdd20f6-ab19-41dd-a7fd-341e42c87df4	14c4766a-4020-4dd1-b2f2-33708d359e29	\N	digital	\N	\N	pending	\N	\N	\N	2025-11-20 21:54:20.718255+00	2025-11-20 21:54:20.718255+00	\N	\N
ad107a63-4168-408c-97b9-f3b42d06cbf0	620e5b92-2649-43d1-ac73-dbfaabda06d0	51e4c507-6dce-4e08-b352-1b2e5dd9e96b	Firmado por Juan Pablo Ossa el 2025-11-28T15:14:00.852Z	digital	\N	\N	signed	\N	2025-11-28 15:13:59.732845+00	\N	2025-11-28 15:00:02.212293+00	2025-11-28 15:13:59.732845+00	\N	\N
e26a79dc-5665-4d2b-93b5-e45ff57c0fa6	0cdd20f6-ab19-41dd-a7fd-341e42c87df4	ef762b40-4a03-4d84-be67-7b46c123a3c2	\N	digital	\N	\N	pending	\N	\N	\N	2025-11-20 21:54:20.759214+00	2025-11-20 21:54:20.759214+00	\N	\N
0ae52f4a-6b45-499e-9675-56bd71721cbc	105b1593-d4f6-4cbc-b5ce-b62197879075	51e4c507-6dce-4e08-b352-1b2e5dd9e96b	Firmado por Juan Pablo Ossa el 2025-11-28T15:14:23.767Z	digital	\N	\N	signed	\N	2025-11-28 15:14:22.635474+00	\N	2025-11-27 14:17:34.771629+00	2025-11-28 15:14:22.635474+00	\N	\N
30d8c767-37e5-415f-835e-f0f40e3143c4	84c043e6-81ec-42c8-a8c1-c888cc121b65	51e4c507-6dce-4e08-b352-1b2e5dd9e96b	Firmado por Juan Pablo Ossa el 2025-11-28T15:14:36.075Z	digital	\N	\N	signed	\N	2025-11-28 15:14:34.937547+00	\N	2025-11-27 14:13:22.159088+00	2025-11-28 15:14:34.937547+00	\N	\N
831176a3-dd58-4f32-a360-195964b50bf5	0257ee26-263a-42d9-a573-7e75e41d82ba	14c4766a-4020-4dd1-b2f2-33708d359e29	Firmado por Marcela Arango el 2025-11-21T22:10:52.874Z	digital	\N	\N	signed	\N	2025-11-21 22:10:51.970874+00	\N	2025-11-20 21:34:04.320517+00	2025-11-21 22:10:51.970874+00	\N	\N
475fa6fa-69f7-4f72-a51b-762b2f89077d	0257ee26-263a-42d9-a573-7e75e41d82ba	ef762b40-4a03-4d84-be67-7b46c123a3c2	Firmado por Luis Riaño el 2025-11-24T14:53:12.856Z	digital	\N	\N	signed	\N	2025-11-24 14:53:12.502901+00	\N	2025-11-20 21:34:04.337137+00	2025-11-24 14:53:12.502901+00	\N	\N
d28538f8-7fc5-4443-b46f-f129daf34c14	0cdd20f6-ab19-41dd-a7fd-341e42c87df4	e673b177-638d-4b24-a824-c6a2c7b7ffd2	Firmado por Negociaciones (Carolina Martinez) el 2025-11-24T16:43:18.141Z	digital	\N	\N	signed	\N	2025-11-24 16:43:07.520047+00	\N	2025-11-20 21:54:20.643396+00	2025-11-24 16:43:07.520047+00	\N	Carolina Martinez
c72157c1-1f6c-4d55-992c-486a1041d331	8770fd2b-38db-445a-953d-4cff6ad8b10f	4fb7c77e-cb5c-442b-b0e0-00bbc1c7ceb5	\N	digital	\N	\N	pending	\N	\N	\N	2025-12-02 21:18:51.543706+00	2025-12-02 21:18:51.543706+00	\N	\N
feca96ad-9fd0-4401-9ae8-3ed8cf2a937c	8770fd2b-38db-445a-953d-4cff6ad8b10f	7304529a-76b8-460a-9a14-531f694c5e32	Autofirmado por Esteban Zuluaga el 2/12/2025, 4:18:52 p. m.	digital	\N	\N	signed	\N	2025-12-02 21:18:52.064647+00	\N	2025-12-02 21:18:51.485648+00	2025-12-02 21:18:52.064647+00	\N	\N
cd929b6b-6e55-46c5-a821-8562bd9a8d3b	e48a8e7f-7392-404b-9b71-168c703fb540	4fb7c77e-cb5c-442b-b0e0-00bbc1c7ceb5	\N	digital	\N	\N	pending	\N	\N	\N	2025-12-03 14:20:36.978764+00	2025-12-03 14:20:36.978764+00	\N	\N
7305053b-80ab-493b-b716-4025a21851dc	0cdd20f6-ab19-41dd-a7fd-341e42c87df4	b4562143-e0ba-42ce-a364-8e46cb31e228	Firmado por Daniela Posada el 2025-11-24T19:56:25.744Z	digital	\N	\N	signed	\N	2025-11-24 19:56:24.554896+00	\N	2025-11-20 21:54:20.659959+00	2025-11-24 19:56:24.554896+00	\N	\N
2498aa2f-4251-4924-9cb2-de26f4745da2	0cdd20f6-ab19-41dd-a7fd-341e42c87df4	ba569036-24e1-4269-bf1f-1dc1d2c81f79	Firmado por Luis A Perez el 2025-11-24T20:11:31.021Z	digital	\N	\N	signed	\N	2025-11-24 20:11:30.077395+00	\N	2025-11-20 21:54:20.676669+00	2025-11-24 20:11:30.077395+00	\N	\N
f8640ccf-2f94-4b5d-adcb-5a11468e36d7	e48a8e7f-7392-404b-9b71-168c703fb540	7304529a-76b8-460a-9a14-531f694c5e32	Autofirmado por Esteban Zuluaga el 3/12/2025, 9:20:39 a. m.	digital	\N	\N	signed	\N	2025-12-03 14:20:37.527801+00	\N	2025-12-03 14:20:36.953656+00	2025-12-03 14:20:37.527801+00	\N	\N
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, name, email, password_hash, role, ad_username, is_active, email_notifications, created_at, updated_at) FROM stdin;
4fb7c77e-cb5c-442b-b0e0-00bbc1c7ceb5	Jesus Bustamante	practicantetic@prexxa.com.co	\N	user	practicantetic	t	f	2025-11-15 14:37:56.816438+00	2025-12-02 19:53:25.85709+00
96dea66c-e057-4a23-a68c-69b4d4b0ae46	Juan  Sebastian Zarama	artes@prexxa.com.co	\N	user	j.zarama	t	t	2025-11-15 14:37:56.825708+00	2025-11-25 16:44:38.034346+00
1589c26c-502d-4ecc-82ed-8bde157f92c2	Monica Bustamante	m.bustamante@prexxa.com.co	\N	user	m.bustamante	t	t	2025-11-15 14:37:56.095251+00	2025-11-15 14:37:56.095251+00
04b7e830-2c00-460e-bee5-9475542d8414	Juan Duque	juan.duque@prexxa.com.co	\N	user	j.duque	t	t	2025-11-15 14:37:56.104305+00	2025-11-15 14:37:56.112949+00
510d44ff-9ddd-4271-a842-0b741d9aeb47	Maricela Rendon	m.rendon@prexxa.com.co	\N	user	m.rendon	t	t	2025-11-15 14:37:56.137228+00	2025-11-15 14:37:56.137228+00
14c4766a-4020-4dd1-b2f2-33708d359e29	Marcela Arango	m.arango@prexxa.com.co	\N	user	m.arango	t	t	2025-11-15 14:37:56.26155+00	2025-12-03 14:57:02.293275+00
cf8e62f8-3b26-45b4-90ec-0ec8220f5c66	Johana David	j.david@prexxa.com.co	\N	user	j.david	t	t	2025-11-15 14:37:56.626355+00	2025-12-01 14:03:43.420691+00
f2cf7842-ec6d-40be-a2cc-ca1d3c5e128b	Jorge  Anibal Peña	j.pena@prexxa.com.co	\N	user	j.pena	t	t	2025-11-15 14:37:56.088075+00	2025-12-02 21:04:14.507504+00
934578dc-3d7a-464e-9fd2-69bc3086a049	Carolina Martinez	c.martinez@prexxa.com.co	\N	user	c.martinez	t	t	2025-11-15 14:37:56.228048+00	2025-11-15 14:37:56.228048+00
079ccdfe-7c15-48ef-a5a0-a380412d216c	Richard Gil	r.gil@prexxa.com.co	\N	user	r.gil	t	t	2025-11-15 14:37:56.236193+00	2025-11-15 14:37:56.236193+00
c64ebae9-620f-46bb-a705-927144cbf896	Mauricio Alvarez	m.alvarez@prexxa.com.co	\N	user	m.alvarez	t	t	2025-11-15 14:37:56.244269+00	2025-11-15 14:37:56.244269+00
c9576920-87d0-4197-8c4b-2c3b0b27ea6d	Angela Henao	a.henao@printia.com.co	\N	user	a.henao	t	t	2025-11-15 14:37:56.269389+00	2025-11-15 14:37:56.269389+00
4c019b43-0d08-42ac-a734-f3b16159f066	Juan Florez	j.florez@prexxa.com.co	\N	user	j.florez	t	t	2025-11-15 14:37:56.277995+00	2025-11-15 14:37:56.277995+00
54c3a422-8390-45c1-8530-0484e56e58ba	Hector Mazo	h.mazo@prexxa.com.co	\N	user	h.mazo	t	t	2025-11-15 14:37:56.294537+00	2025-11-15 14:37:56.294537+00
6e741ba2-0262-4225-9df3-064e06637f83	Juan Patiño	juan.fernando@prexxa.com.co	\N	user	j.patiño	t	t	2025-11-15 14:37:56.302564+00	2025-11-15 14:37:56.302564+00
5afe2406-bcf9-4b07-b3ff-1c26821be276	Leandro Vásquez	l.vasquez@prexxa.com.co	\N	user	l.vasquez	t	t	2025-11-15 14:37:56.310848+00	2025-11-15 14:37:56.310848+00
ad418689-b360-41f9-9809-97ae279778d7	Sebastian Pinto	sebastian.pinto@prexxa.com.co	\N	user	s.pinto	t	t	2025-11-15 14:37:56.335853+00	2025-11-15 14:37:56.335853+00
8fa3029f-17eb-4bd1-abf9-7318a3d9ac74	Cristina Perez	c.perez@prexxa.com.co	\N	user	c.perez	t	t	2025-11-15 14:37:56.343803+00	2025-11-15 14:37:56.343803+00
ef86eb64-d1e4-45f1-9282-4ed74a2016f2	Hector Duque	hector.duque@prexxa.com.co	\N	user	h.duque	t	t	2025-11-15 14:37:56.410279+00	2025-11-15 14:37:56.410279+00
4ae2d1a8-fde7-43cb-b3a2-0928720bd781	Isabel Ramirez	isabel.ramirez@prexxa.com.co	\N	user	i.ramirez	t	t	2025-11-15 14:37:56.460317+00	2025-11-15 14:37:56.460317+00
49ee6cb1-2f9e-4107-9276-f7d42858bce8	Carolina Pulgarin	c.pulgarin@prexxa.com.co	\N	user	c.pulgarin	t	t	2025-11-15 14:37:56.48569+00	2025-11-15 14:37:56.48569+00
1cdf50e6-af80-4542-a348-4f5907eb5bc0	Marcela Duque	m.duque@prexxa.com.co	\N	user	m.duque	t	t	2025-11-15 14:37:56.559879+00	2025-11-15 14:37:56.559879+00
8729c43c-1928-44f1-8948-3f1dbf745619	Milena Ramirez	m.ramirez@printia.com.co	\N	user	m.ramirez	t	t	2025-11-15 14:37:56.593003+00	2025-11-15 14:37:56.593003+00
f798da5d-9e60-4374-8d39-721d7e728fdf	Carolina Gallego	c.gallego@prexxa.com.co	\N	user	c.gallego	t	t	2025-11-15 14:37:56.675951+00	2025-11-15 14:37:56.675951+00
005d30b9-218e-420c-95a5-cf32c69cdfdf	Ely Garcia	e.garcia@prexxa.com.co	\N	user	e.garcia	t	t	2025-11-15 14:37:56.683408+00	2025-11-15 14:37:56.683408+00
af8d06d4-73dd-4e81-b953-fabec5c3c424	Johny Osorio	j.osorio@prexxa.com.co	\N	user	j.osorio	t	t	2025-11-15 14:37:56.691883+00	2025-11-15 14:37:56.691883+00
7304529a-76b8-460a-9a14-531f694c5e32	Esteban Zuluaga	e.zuluaga@prexxa.com.co	\N	user	e.zuluaga	t	t	2025-11-15 14:31:00.354032+00	2025-12-05 19:41:05.392731+00
753be51f-95e4-4cc0-8c24-694a0f72b904	Jair Pulgarin	j.pulgarin@prexxa.com.co	\N	user	j.pulgarin	t	t	2025-11-15 14:37:56.708511+00	2025-11-15 14:37:56.708511+00
68046206-fbb2-4f3d-8ff9-e1f8cbd700ea	Piedad Caraballo	p.caraballo@prexxa.com.co	\N	user	p.caraballo	t	t	2025-11-15 14:37:56.725347+00	2025-11-15 14:37:56.725347+00
389133ed-c4f8-4420-9948-c4bab1d04649	Daniel Diaz	d.diaz@prexxa.com.co	\N	user	d.diaz	t	t	2025-11-15 14:37:56.741644+00	2025-11-15 14:37:56.741644+00
06120008-3da2-4552-89fd-4fd27b63300a	Cristina Gomez	c.gomez@prexxa.com.co	\N	user	c.gomez	t	t	2025-11-15 14:37:56.749974+00	2025-11-15 14:37:56.749974+00
d56421bd-b7f5-45f6-ba4e-988c3b28b2c3	Carlos Taborda	c.taborda@prexxa.com.co	\N	user	c.taborda	t	t	2025-11-15 14:37:56.76087+00	2025-11-15 14:37:56.76087+00
25ad8f5a-827d-47a3-81a4-3a3d9b9208d6	Debora Serna	d.serna@prexxa.com.co	\N	user	d.serna	t	t	2025-11-15 14:37:56.767039+00	2025-11-15 14:37:56.767039+00
0b851228-2978-4dc9-b099-b7776f29f6b5	Laura Gomez	l.gomez@prexxa.com.co	\N	user	l.gomez	t	t	2025-11-15 14:37:56.791958+00	2025-11-15 14:37:56.791958+00
d37a7588-6646-4789-9b38-c71cdfa791c1	Yenifer Arredondo	y.arredondo@prexxa.com.co	\N	user	y.arredondo	t	t	2025-11-15 14:37:56.858343+00	2025-11-15 14:37:56.858343+00
efcc75bc-4c8f-48a8-a789-cb2f3807c1aa	Andres Pereira	a.pereira@prexxa.com.co	\N	user	a.pereira	t	t	2025-11-15 14:37:56.716784+00	2025-11-21 00:16:21.484572+00
f4b34dea-921b-4e28-9a2f-94e8048b6068	Sara Muriel	s.muriel@prexxa.com.co	\N	user	s.muriel	t	t	2025-11-15 14:37:56.891154+00	2025-11-15 14:37:56.891154+00
5a5aae95-e5ab-4e12-8378-d323c092369f	Tomas Pineda	t.pineda@prexxa.com.co	\N	user	t.pineda	t	t	2025-11-15 14:37:56.866293+00	2025-11-21 00:16:32.852386+00
b4562143-e0ba-42ce-a364-8e46cb31e228	Daniela Posada	daniela.posada@prexxa.com.co	\N	user	d.posada	t	t	2025-11-15 14:37:56.643162+00	2025-11-24 19:55:25.210049+00
23cf2487-831d-4220-8c0e-caecc616dbbc	Alejandro Salazar	a.salazar@prexxa.com.co	\N	user	a.salazar	t	t	2025-11-15 14:37:56.883195+00	2025-11-19 17:19:18.818452+00
ce0f13f6-a15b-4fd5-9b23-9f23ffda3531	Angelica Martinez	a.martinez@prexxa.com.co	\N	user	a.martinez	t	t	2025-11-15 14:37:56.667249+00	2025-11-20 20:25:01.811511+00
ba569036-24e1-4269-bf1f-1dc1d2c81f79	Luis Perez	la.perez@prexxa.com.co	\N	user	la.perez	t	t	2025-11-15 14:37:56.775158+00	2025-11-24 22:06:02.618177+00
e93d74cf-e6de-45f2-8408-7f9ae62713f8	Andres Giron	a.giron@prexxa.com.co	\N	user	a.giron	t	t	2025-11-15 14:37:56.252342+00	2025-11-24 22:09:36.522643+00
4c9a6b54-1fa0-43fa-98e1-cbbe71c33538	Juliana Alzate	j.alzate@prexxa.com.co	\N	user	j.alzate	t	t	2025-11-15 14:37:56.352707+00	2025-11-24 17:08:41.834093+00
ef49c057-2301-47c4-9885-7daaeb200b49	Lina Gonzalez	l.gonzalez@prexxa.com.co	\N	user	l.gonzalez	t	t	2025-11-15 14:37:56.916393+00	2025-11-15 14:37:56.916393+00
204eedbf-42eb-4b88-9fbf-25a337e940f8	Miguel Peña	m.pena@prexxa.com.co	\N	user	m.pena	t	t	2025-11-15 14:37:56.942508+00	2025-11-15 14:37:56.942508+00
4769b25c-34d4-4060-90b5-401e872713e8	Manuela Correa	m.correa@prexxa.com.co	\N	user	m.correa	t	t	2025-11-15 14:37:56.966543+00	2025-11-15 14:37:56.966543+00
23353236-713c-40f0-ba22-6824fcfd8a66	Cristian Cano	c.cano@prexxa.com.co	\N	user	c.cano	t	t	2025-11-15 14:37:57.015932+00	2025-11-15 14:37:57.015932+00
8c5dab99-0975-462d-a28d-b77263a40f0d	Monica Ramirez	mo.ramirez@prexxa.com.co	\N	user	mo.ramirez	t	t	2025-11-15 14:37:57.0323+00	2025-11-15 14:37:57.0323+00
0edaeb7c-b0ec-400f-b8fe-d23249e528df	David Tangarife	d.tangarife@prexxa.com.co	\N	user	d.tangarife	t	t	2025-11-15 14:37:57.065245+00	2025-11-15 14:37:57.065245+00
016d0226-a67f-4ab7-a56c-06fa9531888e	Daniel Plata	d.plata@printia.com.co	\N	user	d.plata	t	t	2025-11-15 14:37:57.09016+00	2025-11-15 14:37:57.09016+00
1beb28f3-1a86-46c2-953a-caa5bf06a854	Daneccy Urieles	d.urieles@prexxa.com.co	\N	user	d.urieles	t	t	2025-11-15 14:37:57.107457+00	2025-11-15 14:37:57.107457+00
c11fe433-fb75-4b91-a12e-6de4fee0fe17	Manuela Estrada	m.estrada@prexxa.com.co	\N	user	m.estrada	t	t	2025-11-15 14:37:57.115458+00	2025-11-15 14:37:57.115458+00
4a295c07-df8b-4650-90b7-772338880c66	Daniel Casalins	d.casalins@prexxa.com.co	\N	user	d.casalins	t	t	2025-11-15 14:37:57.132126+00	2025-11-15 14:37:57.132126+00
445a1640-4f29-41f7-8fdf-2271c66f1a73	Catalina Jaramillo	c.jaramillo@prexxa.com.co	\N	user	c.jaramillo	t	t	2025-11-15 14:37:57.140635+00	2025-11-15 14:37:57.140635+00
3a7d6e32-03c3-4e50-8295-f89a61e63f5f	Natalia Ruiz	n.ruiz@prexxa.com.co	\N	user	n.ruiz	t	t	2025-11-15 14:37:57.148564+00	2025-11-15 14:37:57.148564+00
d2a6364e-3011-42cc-81de-3b0a2b51c152	Juliet Acevedo	j.acevedo@prexxa.com.co	\N	user	j.acevedo	t	t	2025-11-15 14:37:56.899264+00	2025-12-03 15:44:19.352074+00
44df62f7-bf46-49b6-9410-4241ed577fe4	Valentina Arroyave	v.arroyave@prexxa.com.co	\N	user	v.arroyave	t	t	2025-11-15 14:37:57.165372+00	2025-11-15 14:37:57.165372+00
6524c57e-baaa-4e6a-b958-9021e40b539c	Daniel Zapata	d.zapata@prexxa.com.co	\N	user	d.zapata	t	t	2025-11-15 14:37:57.173357+00	2025-11-15 14:37:57.173357+00
ef762b40-4a03-4d84-be67-7b46c123a3c2	Luis Riaño	l.riano@prexxa.com.co	\N	user	l.riaño	t	t	2025-11-15 14:37:57.074072+00	2025-12-04 17:42:39.727431+00
9c2cd2dd-ba47-430a-8426-85573e7de88e	Sandra Ruiz	s.ruiz@prexxa.com.co	\N	user	s.ruiz	t	t	2025-11-15 14:37:57.214983+00	2025-11-15 14:37:57.214983+00
034c8dee-c944-4434-a23c-04c16d2cb871	Leidy Cardona	l.cardona@prexxa.com.co	\N	user	l.cardona	t	t	2025-11-15 14:37:57.232029+00	2025-11-15 14:37:57.232029+00
abf23f1a-7961-4c3d-9bbb-dfff7b51ba52	Alejandra Vera	a.vera@prexxa.com.co	\N	user	a.vera	t	t	2025-11-15 14:37:57.23983+00	2025-11-15 14:37:57.23983+00
f9d854ec-95d2-4762-8e0e-61290835b2f2	Angel Gonzalez	a.gonzalez@prexxa.com.co	\N	user	a.gonzalez	t	t	2025-11-15 14:37:57.248328+00	2025-11-15 14:37:57.248328+00
cf47a3cd-e9b7-466c-b207-a323ed654f51	Marllory Guisao	m.guisao@prexxa.com.co	\N	user	m.guisao	t	t	2025-11-15 14:37:57.273101+00	2025-11-15 14:37:57.273101+00
e12d6b44-923b-41b9-8d43-bedaf30edc7b	Leidy Gomez	lj.gomez@prexxa.com.co	\N	user	lj.gomez	t	t	2025-11-15 14:37:57.289874+00	2025-11-15 14:37:57.289874+00
7d8beaf6-52cc-4989-a16e-c4c63f18f259	Laura Zapata	l.zapata@prexxa.com.co	\N	user	l.zapata	t	t	2025-11-15 14:37:57.314138+00	2025-11-15 14:37:57.314138+00
2725c0af-5ae3-40cb-a6e0-5aab9565525d	Eeilyn Villegas	e.villegas@prexxa.com.co	\N	user	e.villegas	t	t	2025-11-15 14:37:57.339369+00	2025-11-15 14:37:57.339369+00
a5ed2587-6942-46b1-845e-e9fec557fa6f	Adriana Villamizar	a.villamizar@prexxa.com.co	\N	user	a.villamizar	t	t	2025-11-15 14:37:57.430759+00	2025-11-15 14:37:57.430759+00
1048d313-9811-4a46-ad92-21f8b6937443	Eliana Florez	e.florez@prexxa.com.co	\N	user	e.florez	t	t	2025-11-15 14:37:57.480641+00	2025-11-15 14:37:57.480641+00
bce0b3a9-9577-4771-b9df-f52c5d0690c2	Luisa Velez	l.velez@prexxa.com.co	\N	user	l.velez	t	t	2025-11-15 14:37:57.50532+00	2025-11-15 14:37:57.50532+00
51e4c507-6dce-4e08-b352-1b2e5dd9e96b	Juan Pablo Ossa	j.ossa@prexxa.com.co	\N	user	j.ossa	t	t	2025-11-15 14:37:57.081876+00	2025-12-05 14:17:07.406711+00
e673b177-638d-4b24-a824-c6a2c7b7ffd2	Negociaciones	negociaciones@prexxa.com.co	\N	user	negociaciones	t	t	2025-11-15 14:37:57.530334+00	2025-12-05 19:40:30.479058+00
76d4d918-899e-4320-88f6-cce9e9dbca54	Julian Agudelo	j.agudelo@prexxa.com.co	\N	user	j.agudelo	t	t	2025-11-15 14:37:57.048807+00	2025-11-26 13:47:16.344927+00
10fce2c5-855b-49e5-af3d-854e8d7523cd	Camila Ramirez	mc.ramirez@printia.com.co	\N	user	mc.ramirez	t	t	2025-11-15 14:37:56.990901+00	2025-11-21 00:05:16.779528+00
72cede4e-3748-4ea0-9bbc-7587f91284a9	Maria Restrepo	m.restrepo@prexxa.com.co	\N	user	m.restrepo	t	t	2025-11-15 14:37:57.405524+00	2025-11-21 00:05:29.291863+00
7bd4e289-6732-425d-a013-357275ac32a5	Jheison Montealegre	j.montealegre@prexxa.com.co	\N	user	j.montealegre	t	t	2025-11-15 14:37:57.281456+00	2025-11-18 16:15:05.071808+00
da38e086-0e09-4388-a821-2969a158310f	Mariana Gonzalez	m.gonzalez@prexxa.com.co	\N	user	m.gonzalez	t	t	2025-11-15 14:37:57.455518+00	2025-11-24 20:11:49.056391+00
\.


--
-- Name: causacion_grupos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.causacion_grupos_id_seq', 2, true);


--
-- Name: causacion_integrantes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.causacion_integrantes_id_seq', 1, false);


--
-- Name: negotiation_signers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.negotiation_signers_id_seq', 5, true);


--
-- Name: causacion_grupos causacion_grupos_codigo_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.causacion_grupos
    ADD CONSTRAINT causacion_grupos_codigo_key UNIQUE (codigo);


--
-- Name: causacion_grupos causacion_grupos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.causacion_grupos
    ADD CONSTRAINT causacion_grupos_pkey PRIMARY KEY (id);


--
-- Name: causacion_integrantes causacion_integrantes_grupo_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.causacion_integrantes
    ADD CONSTRAINT causacion_integrantes_grupo_id_user_id_key UNIQUE (grupo_id, user_id);


--
-- Name: causacion_integrantes causacion_integrantes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.causacion_integrantes
    ADD CONSTRAINT causacion_integrantes_pkey PRIMARY KEY (id);


--
-- Name: document_signers document_signers_document_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_signers
    ADD CONSTRAINT document_signers_document_id_user_id_key UNIQUE (document_id, user_id);


--
-- Name: document_signers document_signers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_signers
    ADD CONSTRAINT document_signers_pkey PRIMARY KEY (id);


--
-- Name: document_type_roles document_type_roles_document_type_id_role_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_type_roles
    ADD CONSTRAINT document_type_roles_document_type_id_role_code_key UNIQUE (document_type_id, role_code);


--
-- Name: document_type_roles document_type_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_type_roles
    ADD CONSTRAINT document_type_roles_pkey PRIMARY KEY (id);


--
-- Name: document_types document_types_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_types
    ADD CONSTRAINT document_types_code_key UNIQUE (code);


--
-- Name: document_types document_types_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_types
    ADD CONSTRAINT document_types_name_key UNIQUE (name);


--
-- Name: document_types document_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_types
    ADD CONSTRAINT document_types_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: negotiation_signers negotiation_signers_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.negotiation_signers
    ADD CONSTRAINT negotiation_signers_name_key UNIQUE (name);


--
-- Name: negotiation_signers negotiation_signers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.negotiation_signers
    ADD CONSTRAINT negotiation_signers_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: signatures signatures_document_id_signer_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signatures
    ADD CONSTRAINT signatures_document_id_signer_id_key UNIQUE (document_id, signer_id);


--
-- Name: signatures signatures_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signatures
    ADD CONSTRAINT signatures_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_causacion_grupos_activo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_causacion_grupos_activo ON public.causacion_grupos USING btree (activo);


--
-- Name: idx_causacion_grupos_codigo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_causacion_grupos_codigo ON public.causacion_grupos USING btree (codigo);


--
-- Name: idx_causacion_integrantes_activo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_causacion_integrantes_activo ON public.causacion_integrantes USING btree (activo);


--
-- Name: idx_causacion_integrantes_grupo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_causacion_integrantes_grupo ON public.causacion_integrantes USING btree (grupo_id);


--
-- Name: idx_causacion_integrantes_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_causacion_integrantes_user ON public.causacion_integrantes USING btree (user_id);


--
-- Name: idx_document_signers_document_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_document_signers_document_id ON public.document_signers USING btree (document_id);


--
-- Name: idx_document_signers_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_document_signers_role ON public.document_signers USING btree (assigned_role_id);


--
-- Name: idx_document_signers_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_document_signers_user_id ON public.document_signers USING btree (user_id);


--
-- Name: idx_document_type_roles_document_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_document_type_roles_document_type ON public.document_type_roles USING btree (document_type_id);


--
-- Name: idx_document_type_roles_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_document_type_roles_order ON public.document_type_roles USING btree (document_type_id, order_position);


--
-- Name: idx_document_types_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_document_types_code ON public.document_types USING btree (code);


--
-- Name: idx_document_types_is_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_document_types_is_active ON public.document_types USING btree (is_active);


--
-- Name: idx_documents_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_documents_created_at ON public.documents USING btree (created_at DESC);


--
-- Name: idx_documents_document_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_documents_document_type ON public.documents USING btree (document_type_id);


--
-- Name: idx_documents_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_documents_status ON public.documents USING btree (status);


--
-- Name: idx_documents_uploaded_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_documents_uploaded_by ON public.documents USING btree (uploaded_by);


--
-- Name: idx_negotiation_signers_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_negotiation_signers_active ON public.negotiation_signers USING btree (active);


--
-- Name: idx_negotiation_signers_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_negotiation_signers_name ON public.negotiation_signers USING btree (name);


--
-- Name: idx_notifications_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_document_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_document_id ON public.notifications USING btree (document_id);


--
-- Name: idx_notifications_is_read; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: idx_signatures_document_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_signatures_document_id ON public.signatures USING btree (document_id);


--
-- Name: idx_signatures_signer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_signatures_signer_id ON public.signatures USING btree (signer_id);


--
-- Name: idx_signatures_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_signatures_status ON public.signatures USING btree (status);


--
-- Name: idx_users_ad_username; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_ad_username ON public.users USING btree (ad_username);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: v_documents_with_details _RETURN; Type: RULE; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW public.v_documents_with_details AS
 SELECT d.id,
    d.title,
    d.description,
    d.file_name,
    d.file_path,
    d.file_size,
    d.mime_type,
    d.status,
    d.uploaded_by,
    d.document_type_id,
    d.created_at,
    d.updated_at,
    d.completed_at,
    u.name AS uploaded_by_name,
    u.email AS uploaded_by_email,
    dt.name AS document_type_name,
    dt.code AS document_type_code,
    dt.prefix AS document_type_prefix,
    count(DISTINCT ds.user_id) AS total_signers,
    count(DISTINCT
        CASE
            WHEN ((s.status)::text = 'signed'::text) THEN s.signer_id
            ELSE NULL::uuid
        END) AS signed_count,
    count(DISTINCT
        CASE
            WHEN ((s.status)::text = 'pending'::text) THEN s.signer_id
            ELSE NULL::uuid
        END) AS pending_count
   FROM ((((public.documents d
     LEFT JOIN public.users u ON ((d.uploaded_by = u.id)))
     LEFT JOIN public.document_types dt ON ((d.document_type_id = dt.id)))
     LEFT JOIN public.document_signers ds ON ((d.id = ds.document_id)))
     LEFT JOIN public.signatures s ON (((d.id = s.document_id) AND (ds.user_id = s.signer_id))))
  GROUP BY d.id, u.name, u.email, dt.name, dt.code, dt.prefix;


--
-- Name: v_documents_with_signatures _RETURN; Type: RULE; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW public.v_documents_with_signatures AS
 SELECT d.id,
    d.title,
    d.description,
    d.file_name,
    d.file_path,
    d.file_size,
    d.mime_type,
    d.status,
    d.uploaded_by,
    d.document_type_id,
    d.created_at,
    d.updated_at,
    d.completed_at,
    u.name AS uploaded_by_name,
    u.email AS uploaded_by_email,
    count(DISTINCT ds.user_id) AS total_signers,
    count(DISTINCT
        CASE
            WHEN ((s.status)::text = 'signed'::text) THEN s.signer_id
            ELSE NULL::uuid
        END) AS signed_count,
    count(DISTINCT
        CASE
            WHEN ((s.status)::text = 'pending'::text) THEN s.signer_id
            ELSE NULL::uuid
        END) AS pending_count
   FROM (((public.documents d
     LEFT JOIN public.users u ON ((d.uploaded_by = u.id)))
     LEFT JOIN public.document_signers ds ON ((d.id = ds.document_id)))
     LEFT JOIN public.signatures s ON (((d.id = s.document_id) AND (ds.user_id = s.signer_id))))
  GROUP BY d.id, u.name, u.email;


--
-- Name: document_types update_document_types_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_document_types_updated_at BEFORE UPDATE ON public.document_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: documents update_documents_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: notifications update_notifications_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: signatures update_signatures_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_signatures_updated_at BEFORE UPDATE ON public.signatures FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: causacion_integrantes causacion_integrantes_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.causacion_integrantes
    ADD CONSTRAINT causacion_integrantes_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.causacion_grupos(id) ON DELETE CASCADE;


--
-- Name: causacion_integrantes causacion_integrantes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.causacion_integrantes
    ADD CONSTRAINT causacion_integrantes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: document_signers document_signers_assigned_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_signers
    ADD CONSTRAINT document_signers_assigned_role_id_fkey FOREIGN KEY (assigned_role_id) REFERENCES public.document_type_roles(id) ON DELETE SET NULL;


--
-- Name: document_signers document_signers_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_signers
    ADD CONSTRAINT document_signers_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_signers document_signers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_signers
    ADD CONSTRAINT document_signers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: document_type_roles document_type_roles_document_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_type_roles
    ADD CONSTRAINT document_type_roles_document_type_id_fkey FOREIGN KEY (document_type_id) REFERENCES public.document_types(id) ON DELETE CASCADE;


--
-- Name: documents documents_document_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_document_type_id_fkey FOREIGN KEY (document_type_id) REFERENCES public.document_types(id) ON DELETE SET NULL;


--
-- Name: documents documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: signatures signatures_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signatures
    ADD CONSTRAINT signatures_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: signatures signatures_signer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signatures
    ADD CONSTRAINT signatures_signer_id_fkey FOREIGN KEY (signer_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict gmSD3tdZNOImhHYogbzdYAv5xnsXo1qqegR7ITXA8ZKdwcaHHQ05h5qhx3g5CJf

